import { expect, it } from 'vitest';
import {
  PasswordAuthProvider,
  provisionPasswordAccount,
  SessionService,
  hashPassword,
} from '../src/index';
import { setupContext } from './helpers';
import { uuidv7 } from '@mmo/shared';
const ctx = setupContext();
it('authenticates provisioned passwords, rejects wrong/unknown passwords, and revokes sessions on rotation', async () => {
  const user = `pw_${uuidv7().replaceAll('-', '').slice(-16)}`;
  const pass = 'a long pre-alpha test password';
  const id = await provisionPasswordAccount(ctx, user, pass);
  const provider = new PasswordAuthProvider();
  expect(
    await provider.authenticate(ctx, { username: user.toUpperCase(), password: pass }),
  ).toMatchObject({ accountId: id });
  for (const username of [user, 'unknown_password_user']) {
    await expect(
      provider.authenticate(ctx, { username, password: 'incorrect but long password' }),
    ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
  }
  const sessions = new SessionService(1);
  const s = await sessions.create(ctx, id, 'game_web');
  await provisionPasswordAccount(ctx, user, 'a completely new test password');
  expect(await sessions.resolve(ctx, s.token)).toBeNull();
  await expect(
    provider.authenticate(ctx, { username: user, password: pass }),
  ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
});

it('bounds expensive password work to two concurrent hashes', async () => {
  const results = await Promise.allSettled([
    hashPassword('first concurrent test password'),
    hashPassword('second concurrent test password'),
    hashPassword('third concurrent test password'),
  ]);
  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(2);
  expect(results[2]).toMatchObject({ status: 'rejected', reason: { code: 'RATE_LIMITED' } });
});

it('refuses session issuance from a password verified before rotation', async () => {
  const user = `race_${uuidv7().replaceAll('-', '').slice(-16)}`;
  const oldPassword = 'old password before rotation';
  const newPassword = 'new password after rotation';
  const id = await provisionPasswordAccount(ctx, user, oldPassword);
  const provider = new PasswordAuthProvider();
  const sessions = new SessionService(1);
  // Deterministically pause login between verification and session creation.
  const verified = await provider.authenticate(ctx, { username: user, password: oldPassword });
  const before = await sessions.create(ctx, id, 'game_web', verified.credential);
  await provisionPasswordAccount(ctx, user, newPassword);
  expect(await sessions.resolve(ctx, before.token)).toBeNull();
  await expect(sessions.create(ctx, id, 'game_web', verified.credential)).rejects.toMatchObject({
    code: 'UNAUTHENTICATED',
  });
  const fresh = await provider.authenticate(ctx, { username: user, password: newPassword });
  const after = await sessions.create(ctx, id, 'game_web', fresh.credential);
  expect((await sessions.resolve(ctx, after.token))?.account.id).toBe(id);
});
