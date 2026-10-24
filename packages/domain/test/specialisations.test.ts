import { expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { schema } from '@mmo/db';
import { uuidv7 } from '@mmo/shared';
import { specialiseAtNpc, getCombatProfile } from '../src/index';
import { setupContext, makePlayer, expectCode } from './helpers';
const ctx = setupContext();
it('validates ownership, mentor, class and level; retraining persists and stale retries cannot undo a newer choice', async () => {
  const p = await makePlayer(ctx),
    other = await makePlayer(ctx);
  const action = (id = 'spec.warrior.guardian', requestId = uuidv7()) => ({
    ...p,
    npcId: 'npc.greenvale.elder_maren',
    specialisationId: id,
    requestId,
  });
  await expectCode(specialiseAtNpc(ctx, action()), 'ABILITY_LOCKED');
  await ctx.db
    .update(schema.characters)
    .set({ level: 5, abilityCooldowns: { 'ability.warrior.guard': Date.now() + 20000 } })
    .where(eq(schema.characters.id, p.characterId));
  await expectCode(
    specialiseAtNpc(ctx, { ...action(), npcId: 'npc.world.amber_coast.merchant' }),
    'WRONG_NPC',
  );
  await expectCode(specialiseAtNpc(ctx, action('spec.mage.fire')), 'VALIDATION_FAILED');
  await expectCode(specialiseAtNpc(ctx, action('spec.warrior.warlord')), 'VALIDATION_FAILED');
  await expectCode(specialiseAtNpc(ctx, { ...action(), accountId: other.accountId }), 'NOT_FOUND');
  const first = action();
  const result = await Promise.all([specialiseAtNpc(ctx, first), specialiseAtNpc(ctx, first)]);
  expect(result.filter((r) => r.duplicate)).toHaveLength(1);
  expect((await getCombatProfile(ctx.db, ctx, p.characterId)).specialisationId).toBe(
    first.specialisationId,
  );
  await specialiseAtNpc(ctx, action('spec.warrior.berserker'));
  await specialiseAtNpc(ctx, first);
  const profile = await getCombatProfile(ctx.db, ctx, p.characterId);
  expect(profile.specialisationId).toBe('spec.warrior.berserker');
  expect(profile.abilityCooldowns['ability.warrior.guard']).toBeGreaterThan(Date.now());
  await expectCode(
    specialiseAtNpc(ctx, action('spec.warrior.berserker', first.requestId)),
    'CONFLICT',
  );
});
