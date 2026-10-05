import { getStarterGameData as getGameData } from './starter-testing';
import { expect, it } from 'vitest';
import { inAttackSector, applyExploration, questAvailability } from './index';
const gd = getGameData(),
  q = gd.quest('quest.greenvale.keeper_outpost');
it('uses the existing prerequisite, personal survey and kill flow with a usable cloak', () => {
  expect(questAvailability(q, 3, new Map())).toMatchObject({ reason: 'PREREQUISITE' });
  expect(
    applyExploration(q, {}, gd.zone('zone.greenvale.meadows'), { x: 24, y: 0, z: 110 }, 100),
  ).toEqual({ read_oath: 1 });
  expect(
    applyExploration(
      q,
      { read_oath: 1 },
      gd.zone('zone.greenvale.meadows'),
      { x: 24, y: 0, z: 110 },
      100,
    ),
  ).toBeNull();
  expect(gd.template(q.rewards.items[0]!.itemTemplateId).equipment?.slotType).toBe('cloak');
  const c = gd.collisionWorld('zone.greenvale.meadows');
  for (let x = 8; x <= 33; x++) expect(c.overlaps({ x, z: 110 }, 0.6)).toBe(false);
  for (let x = 27; x <= 36; x++)
    for (let z = 115; z <= 124; z++) expect(c.overlaps({ x, z }, 0.6)).toBe(false);
});
it('sector includes its edge and centre, excludes flank/rear/range, wraps headings', () => {
  const o = { x: 0, z: 0 };
  expect(inAttackSector(o, o, 0, Math.PI / 2, 6)).toBe(true);
  expect(inAttackSector({ x: 3, z: 3 }, o, 0, Math.PI / 2, 6)).toBe(true);
  for (const p of [
    { x: 6, z: 0 },
    { x: 0, z: -1 },
    { x: 0, z: 6.01 },
  ])
    expect(inAttackSector(p, o, 0, Math.PI / 2, 6)).toBe(false);
  expect(inAttackSector({ x: 0, z: -5 }, o, Math.PI * 3, Math.PI / 2, 6)).toBe(true);
});

it('pins the additive checkpoint content hash', async () => {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(JSON.stringify(gd.raw)),
  );
  expect([...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')).toBe(
    'fce8c1bf74e3e8e9fd3019432542026bb82f6a65060914ce468e9d255876ace1',
  );
});
