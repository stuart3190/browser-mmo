import { expect, it } from 'vitest';
import { repairCost } from './durability';
it('quotes aggregate missing condition fairly, with full gear free and no negative credits', () => {
  expect(repairCost([])).toBe(0);
  expect(repairCost([{ current: 100, max: 100 }])).toBe(0);
  expect(
    repairCost([
      { current: 99, max: 100 },
      { current: 99, max: 100 },
    ]),
  ).toBe(1);
  expect(
    repairCost([
      { current: 0, max: 100 },
      { current: 89, max: 100 },
    ]),
  ).toBe(12);
  expect(repairCost([{ current: 101, max: 100 }])).toBe(0);
});
