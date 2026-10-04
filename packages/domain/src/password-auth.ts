import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { schema } from '@mmo/db';
import { DevLoginRequestSchema } from '@mmo/schemas';
import { DomainError, ErrorCode, uuidv7 } from '@mmo/shared';
import type { Role } from '@mmo/shared';
import type { AuthProvider } from './auth';
import type { DomainContext } from './context';
import { ensureAccountVault } from './containers';
import { inTransaction } from './tx';

// OWASP scrypt profile; bound memory/CPU independently from HTTP request concurrency.
let hashing = 0;
async function derive(password: string, salt: string): Promise<Buffer> {
  if (hashing >= 2) throw new DomainError(ErrorCode.RATE_LIMITED, 'Login busy; retry later');
  hashing++;
  try {
    return await new Promise<Buffer>((resolve, reject) =>
      scrypt(
        password,
        salt,
        64,
        { N: 131072, r: 8, p: 1, maxmem: 160 * 1024 * 1024 },
        (err, key) => (err ? reject(err) : resolve(key)),
      ),
    );
  } finally {
    hashing--;
  }
}
function passwordInput(value: unknown): string {
  if (typeof value !== 'string' || value.length < 15 || Buffer.byteLength(value) > 128)
    throw new DomainError(
      ErrorCode.VALIDATION_FAILED,
      'Password must be at least 15 characters and at most 128 UTF-8 bytes',
    );
  return value;
}
export async function hashPassword(password: string): Promise<string> {
  passwordInput(password);
  const salt = randomBytes(16).toString('hex');
  return `scrypt$131072$8$1$${salt}$${(await derive(password, salt)).toString('hex')}`;
}
export class PasswordAuthProvider implements AuthProvider {
  readonly id = 'password';
  async authenticate(ctx: DomainContext, credentials: unknown): Promise<{ accountId: string }> {
    const { username } = DevLoginRequestSchema.parse(credentials);
    const password = passwordInput((credentials as Record<string, unknown>).password);
    const [identity] = await ctx.db
      .select()
      .from(schema.authIdentities)
      .where(
        and(
          eq(schema.authIdentities.provider, this.id),
          eq(schema.authIdentities.providerSubject, username.toLowerCase()),
        ),
      );
    const match = /^scrypt\$131072\$8\$1\$([a-f0-9]{32})\$([a-f0-9]{128})$/.exec(
      identity?.secretHash ?? '',
    );
    const key = await derive(password, match?.[1] ?? '00000000000000000000000000000000');
    const valid = timingSafeEqual(key, Buffer.from(match?.[2] ?? '00'.repeat(64), 'hex'));
    if (!valid || !match || !identity)
      throw new DomainError(ErrorCode.UNAUTHENTICATED, 'Invalid username or password');
    return { accountId: identity.accountId };
  }
}

/** Trusted operator provisioning/rotation only. Not exposed as a public registration endpoint. */
export async function provisionPasswordAccount(
  ctx: DomainContext,
  username: string,
  password: string,
  role: Role = 'player',
): Promise<string> {
  DevLoginRequestSchema.parse({ username });
  const secretHash = await hashPassword(password);
  return inTransaction(ctx, async (tx) => {
    const [existing] = await tx
      .select()
      .from(schema.accounts)
      .where(sql`lower(${schema.accounts.username}) = ${username.toLowerCase()}`)
      .for('update');
    const id = existing?.id ?? uuidv7();
    if (!existing) {
      await tx.insert(schema.accounts).values({ id, username, displayName: username, role });
      await ensureAccountVault(tx, id);
    }
    await tx
      .insert(schema.authIdentities)
      .values({
        id: uuidv7(),
        accountId: id,
        provider: 'password',
        providerSubject: username.toLowerCase(),
        secretHash,
      })
      .onConflictDoUpdate({
        target: [schema.authIdentities.provider, schema.authIdentities.providerSubject],
        set: { secretHash },
      });
    await tx
      .update(schema.sessions)
      .set({ revokedAt: ctx.now() })
      .where(eq(schema.sessions.accountId, id));
    return id;
  });
}
