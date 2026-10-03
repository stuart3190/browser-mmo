import type { ExperienceCurve } from '@mmo/schemas';

export function xpToNextLevel(curve: ExperienceCurve, level: number): number {
  if (level >= curve.maxLevel) return 0;
  return Math.round(curve.base * Math.pow(level, curve.exponent));
}

/** Applies gained XP, rolling over levels. Pure; the server persists the result. */
export function applyExperience(
  curve: ExperienceCurve,
  current: { level: number; xp: number },
  gained: number,
): { level: number; xp: number; levelsGained: number } {
  let { level, xp } = current;
  const startLevel = level;
  xp += Math.max(0, Math.floor(gained));
  while (level < curve.maxLevel) {
    const need = xpToNextLevel(curve, level);
    if (xp < need) break;
    xp -= need;
    level += 1;
  }
  if (level >= curve.maxLevel) xp = 0;
  return { level, xp, levelsGained: level - startLevel };
}
