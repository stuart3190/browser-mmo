import type { ServiceOffer } from '@mmo/schemas';

/** Mild upkeep: one condition per credited victory; ten restored condition costs one copper. */
export const conditionRules = { wearPerVictory: 1, conditionPerCopper: 10, warningFraction: 0.2 };
export function repairCost(conditions: readonly { current: number; max: number }[]): number {
  return Math.ceil(
    conditions.reduce((sum, d) => sum + Math.max(0, d.max - d.current), 0) /
      conditionRules.conditionPerCopper,
  );
}
export function canRepairAt(offers: readonly ServiceOffer[], npcId: string): boolean {
  return offers.some((o) => o.npcId === npcId && (o.kind === 'buy' || o.kind === 'craft'));
}
