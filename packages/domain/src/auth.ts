import { createHash, randomBytes } from 'node:crypto';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { schema } from '@mmo/db';
import type { ClientKind, PlayerAccount } from '@mmo/schemas';
import { DevLoginRequestSchema } from '@mmo/schemas';
import type { Role } from '@mmo/shared';
import { DomainError, ErrorCode, uuidv7 } from '@mmo/shared';
import type { DomainContext } from './context';
import { ensureAccountVault } from './containers';
import { accountFromRow } from './mappers';
import { inTransaction } from './tx';

/**
 * Authentication abstraction
 * --------------------------
 * An AuthProvider turns provider-specific credentials into an account ID. Sessions are
 * provider-independent opaque bearer tokens. Adding email/password or OAuth means adding a
 * provider (and an `auth_identities` row per linked identity) — nothing else changes.
 */
export interface VerifiedCredential {
  identityId: string;
  secretHash: string;
}

export interface AuthProvider {
  /** Stored in auth_identities.provider. */
  readonly id: string;
  authenticate(
    ctx: DomainContext,
    credentials: unknown,
  ): Promise<{ accountId: string; credential?: VerifiedCredential }>;
}

/**
 * DEV ONLY: log in (and auto-register) by username, no password. The API refuses to enable it in
 * production. Usernames listed in `adminUsernames` get the admin role so the admin app is usable.
 */
export class DevAuthProvider implements AuthProvider {
  readonly id = 'dev';
  constructor(private readonly adminUsernames: ReadonlySet<string>) {}

  async authenticate(ctx: DomainContext, credentials: unknown): Promise<{ accountId: string }> {
    const { username } = DevLoginRequestSchema.parse(credentials);
    const subject = username.toLowerCase();
    return inTransaction(ctx, async (tx) => {
      const [identity] = await tx
        .select()
        .from(schema.authIdentities)
        .where(
          and(
            eq(schema.authIdentities.provider, this.id),
            eq(schema.authIdentities.providerSubject, subject),
          ),
        );
      if (identity) return { accountId: identity.accountId };

      const accountId = uuidv7();
      const role: Role = this.adminUsernames.has(subject) ? 'admin' : 'player';
      await tx
        .insert(schema.accounts)
        .values({ id: accountId, username, displayName: username, role });
      await tx
        .insert(schema.authIdentities)
        .values({ id: uuidv7(), accountId, provider: this.id, providerSubject: subject });
      await ensureAccountVault(tx, accountId);
      return { accountId };
    });
  }
}

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export interface ResolvedSession {
  sessionId: string;
  expiresAt: Date;
  account: PlayerAccount;
  clientKind: string;
}

/** Opaque session tokens: 256 random bits, only the SHA-256 hash is stored. */
export class SessionService {
  constructor(private readonly ttlHours: number) {}

  async create(
    ctx: DomainContext,
    accountId: string,
    clientKind: ClientKind,
    credential?: VerifiedCredential,
  ): Promise<{ token: string; expiresAt: Date; account: PlayerAccount }> {
    const token = randomBytes(32).toString('base64url');
    const now = ctx.now();
    const expiresAt = new Date(now.getTime() + this.ttlHours * 3_600_000);
    // Password rotation locks this same account before replacing the hash/revoking sessions.
    // Hashing stays outside the transaction; recheck its evidence before issuing a session.
    return inTransaction(ctx, async (tx) => {
      const [account] = await tx
        .select()
        .from(schema.accounts)
        .where(eq(schema.accounts.id, accountId))
        .for('update');
      if (!account) throw new DomainError(ErrorCode.NOT_FOUND, 'Account not found');
      if (account.status !== 'active')
        throw new DomainError(ErrorCode.FORBIDDEN, `Account is ${account.status}`);
      if (credential) {
        const [identity] = await tx
          .select({ id: schema.authIdentities.id })
          .from(schema.authIdentities)
          .where(
            and(
              eq(schema.authIdentities.id, credential.identityId),
              eq(schema.authIdentities.accountId, accountId),
              eq(schema.authIdentities.provider, 'password'),
              eq(schema.authIdentities.secretHash, credential.secretHash),
            ),
          );
        if (!identity)
          throw new DomainError(ErrorCode.UNAUTHENTICATED, 'Credentials changed; log in again');
      }
      await tx.insert(schema.sessions).values({
        id: uuidv7(),
        accountId,
        tokenHash: hashToken(token),
        clientKind,
        createdAt: now,
        expiresAt,
      });
      return { token, expiresAt, account: accountFromRow(account) };
    });
  }

  /** Resolves a bearer token. Returns null for unknown/expired/revoked tokens or inactive accounts. */
  async resolve(ctx: DomainContext, token: string): Promise<ResolvedSession | null> {
    if (!token || token.length > 128) return null;
    const now = ctx.now();
    const [row] = await ctx.db
      .select({ session: schema.sessions, account: schema.accounts })
      .from(schema.sessions)
      .innerJoin(schema.accounts, eq(schema.accounts.id, schema.sessions.accountId))
      .where(
        and(
          eq(schema.sessions.tokenHash, hashToken(token)),
          isNull(schema.sessions.revokedAt),
          gt(schema.sessions.expiresAt, now),
        ),
      );
    if (!row || row.account.status !== 'active') return null;
    return {
      sessionId: row.session.id,
      account: accountFromRow(row.account),
      clientKind: row.session.clientKind,
      expiresAt: row.session.expiresAt,
    };
  }

  async revoke(ctx: DomainContext, sessionId: string): Promise<void> {
    await ctx.db
      .update(schema.sessions)
      .set({ revokedAt: ctx.now() })
      .where(eq(schema.sessions.id, sessionId));
  }
}
