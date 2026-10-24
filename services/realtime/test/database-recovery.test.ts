import { expect, it } from 'vitest';
import { createDb } from '@mmo/db';

it('evicts a terminated idle connection, reports it once, and serves a fresh connection', async () => {
  let report!: (error: Error) => void;
  const reported = new Promise<Error>((resolve) => {
    report = resolve;
  });
  const errors: Error[] = [];
  const idle = createDb({
    url: process.env.TEST_DATABASE_URL!,
    max: 1,
    onPoolError: (error) => {
      errors.push(error);
      report(error);
    },
  });
  const controller = createDb({ url: process.env.TEST_DATABASE_URL!, max: 1 });
  try {
    const oldPid = (await idle.pool.query<{ pid: number }>('select pg_backend_pid() pid')).rows[0]!
      .pid;
    expect(
      (await controller.pool.query('select pg_terminate_backend($1) stopped', [oldPid])).rows[0]
        .stopped,
    ).toBe(true);
    expect((await reported).message).toMatch(/terminating connection/);
    const fresh = (
      await idle.pool.query<{ pid: number; value: number }>('select pg_backend_pid() pid, 42 value')
    ).rows[0]!;
    expect(fresh.pid).not.toBe(oldPid);
    expect(fresh.value).toBe(42);
    expect(errors).toHaveLength(1);
  } finally {
    await Promise.all([idle.close(), controller.close()]);
  }
});
it('coalesces repeated close requests while database clients are draining', async () => {
  const handle = createDb({ url: process.env.TEST_DATABASE_URL!, max: 1 });
  const client = await handle.pool.connect();
  const a = handle.close(),
    b = handle.close();
  expect(a).toBe(b);
  client.release();
  await Promise.all([a, b]);
  await handle.close();
});
