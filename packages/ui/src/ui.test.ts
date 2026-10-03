import { describe, expect, it } from 'vitest';
import { getGameData } from '@mmo/game-data';
import { formatCurrency, rarityColor } from './index';

describe('ui helpers', () => {
  const gd = getGameData();
  it('formats currency using data-driven divisors', () => {
    expect(formatCurrency(gd.currencies.get('gold')!, 12_345)).toBe('1g 23s 45c');
    expect(formatCurrency(gd.currencies.get('gold')!, 7)).toBe('7c');
    expect(formatCurrency(gd.currencies.get('renown')!, 1500)).toBe('1,500 Renown');
  });
  it('reads rarity colours from game data', () => {
    expect(rarityColor(gd, 'epic')).toBe(gd.rarities.get('epic')!.color);
  });
});
