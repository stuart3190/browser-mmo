import { expect, it } from 'vitest';
import { getGameData, applyExploration, objectiveProgress } from './index';
const gd = getGameData(),
  q = gd.quest('quest.greenvale.well_records'),
  zone = gd.zone('zone.greenvale.meadows');
const hash = async (data: unknown) =>
  [
    ...new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(data))),
    ),
  ]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
it('credits only living same-zone visits, clamps replay, persists explore progress and preserves prior content', async () => {
  const pos = { x: 8, y: 0, z: 12 };
  expect(applyExploration(q, {}, zone, pos, 1)).toEqual({ survey_well: 1 });
  for (const [position, health] of [
    [{ ...pos, x: 12.01 }, 1],
    [pos, 0],
    [{ ...pos, y: 5 }, 1],
    [{ ...pos, x: NaN }, 1],
  ] as const)
    expect(applyExploration(q, {}, zone, position, health)).toBeNull();
  expect(applyExploration(q, {}, { ...zone, id: 'zone.other' }, pos, 1)).toBeNull();
  expect(applyExploration(q, { survey_well: 1 }, zone, pos, 1)).toBeNull();
  expect(
    objectiveProgress(
      q,
      {
        questId: q.id,
        status: 'active',
        progress: { survey_well: 1 },
        acceptedAt: null,
        completedAt: null,
      },
      () => 0,
    ).map((o) => o.done),
  ).toEqual([true, false]);
  const old = structuredClone(gd.raw);
  old.quests = old.quests.filter((q) => q.id !== 'quest.greenvale.well_records');
  old.itemTemplates = old.itemTemplates.filter(
    (i) => i.id !== 'accessory.necklace.springward_pendant',
  );
  for (const z of old.zones)
    z.landmarks = z.landmarks.filter(
      (l) => !['landmark.greenvale.old_well', 'landmark.greenvale.spring_culvert'].includes(l.id),
    );
  expect(await hash(old)).toBe('9614a98b965120cf0f6ff2e419b5b71042d96226a9aa1df19d3fbd755944f50b');
  expect(await hash(gd.raw)).toBe(
    'cb487f9ce444543a86798f540285a5bdbf9f3a6e81f64869152483bf33d9362c',
  );
  const culvert = zone.landmarks.find((l) => l.id === 'landmark.greenvale.spring_culvert')!;
  // A companion waiting to survey must be beyond each den spawn's full leash + survey radius.
  for (const sp of gd
    .chunksForZone(zone.id)
    .flatMap((c) => c.spawnPoints)
    .filter((s) => s.groupId === 'group.greenvale.den_north'))
    expect(
      Math.hypot(sp.position.x - culvert.position.x, sp.position.z - culvert.position.z),
    ).toBeGreaterThan(34);
  const c = gd.collisionWorld(zone.id);
  for (let z = 12; z <= 110; z++) expect(c.overlaps({ x: 0, z }, 0.4)).toBe(false);
  for (let x = 0; x <= 8; x++)
    for (const z of [12, 110]) expect(c.overlaps({ x, z }, 0.4)).toBe(false);
});
