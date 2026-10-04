import { expect, it } from 'vitest';
import { RateLimit } from './rate-limit';
it('bounds bursts, refills with elapsed time and cannot grow the key table indefinitely', () => {
  const limit = new RateLimit(2, 1, 2);
  expect(limit.take('a', 0)).toBe(true);
  expect(limit.take('a', 0)).toBe(true);
  expect(limit.take('a', 0)).toBe(false);
  expect(limit.take('a', -1000)).toBe(false);
  expect(limit.take('b', 0)).toBe(true);
  expect(limit.take('c', 0)).toBe(false);
  expect(limit.take('a', 1000)).toBe(true);
  expect(limit.take('c', 2000)).toBe(true);
});
