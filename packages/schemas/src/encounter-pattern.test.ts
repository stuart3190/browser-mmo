import { expect, it } from 'vitest';
import { EnemyAttackStepSchema } from './combat';
it('rejects ambiguous geometry, missing warning duration and unnamed encounter steps', () => {
  const step = { name: 'Bough Sweep', windupMs: 2000, attackRange: 7, cleaveArcDegrees: 150 };
  expect(EnemyAttackStepSchema.safeParse(step).success).toBe(true);
  expect(EnemyAttackStepSchema.safeParse({ ...step, groundStrikeRadius: 4 }).success).toBe(false);
  expect(EnemyAttackStepSchema.safeParse({ ...step, windupMs: undefined }).success).toBe(false);
  expect(EnemyAttackStepSchema.safeParse({ ...step, name: '' }).success).toBe(false);
});
