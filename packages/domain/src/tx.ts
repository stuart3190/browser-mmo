import { DomainError, ErrorCode } from '@mmo/shared';
import type { Tx } from '@mmo/db';
import type { DomainContext } from './context';

interface PgError {
  code?: string;
  constraint?: string;
}

function pgErrorOf(err: unknown): PgError | undefined {
  let cur: unknown = err;
  // drizzle wraps driver errors in `cause`
  for (let i = 0; i < 3 && cur && typeof cur === 'object'; i++) {
    const e = cur as PgError & { cause?: unknown };
    if (typeof e.code === 'string' && e.code.length === 5) return e;
    cur = e.cause;
  }
  return undefined;
}

export function isUniqueViolation(err: unknown, constraint?: string): boolean {
  const pg = pgErrorOf(err);
  return pg?.code === '23505' && (constraint === undefined || pg.constraint === constraint);
}

const RETRYABLE = new Set(['40001', '40P01']); // serialization_failure, deadlock_detected

/**
 * Runs `fn` in a READ COMMITTED transaction. Correctness relies on explicit row locks
 * (SELECT ... FOR UPDATE) taken in a consistent order, plus database constraints as the last line
 * of defence. Retries automatically on deadlock/serialization failures.
 */
export async function inTransaction<T>(
  ctx: DomainContext,
  fn: (tx: Tx) => Promise<T>,
  attempts = 3,
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await ctx.db.transaction(fn);
    } catch (err) {
      const pg = pgErrorOf(err);
      if (pg?.code && RETRYABLE.has(pg.code) && attempt < attempts) continue;
      if (err instanceof DomainError) throw err;
      if (pg?.code === '23505') {
        throw new DomainError(ErrorCode.CONFLICT, 'Conflicting concurrent change, please retry', {
          constraint: pg.constraint,
        });
      }
      if (pg?.code === '23514') {
        throw new DomainError(ErrorCode.CONFLICT, 'Operation violates a data invariant', {
          constraint: pg.constraint,
        });
      }
      throw err;
    }
  }
}
