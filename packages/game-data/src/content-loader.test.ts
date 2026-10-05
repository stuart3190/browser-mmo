import { describe, expect, it } from 'vitest';
import { ContentPackSchema } from '@mmo/schemas';
import { compileContentCatalog, type ContentManifest } from './content-loader';
import { contentManifest, contentPacks, getGameData, GameData } from './index';

const fixture = () => ({
  manifest: structuredClone(contentManifest),
  pack: ContentPackSchema.parse(structuredClone(contentPacks[0]!)),
});
const compile = () =>
  compileContentCatalog(
    contentManifest,
    contentPacks.filter((p) => p.schemaVersion === 1),
  );
describe('versioned content factory', () => {
  it('preserves the exact deployed catalog, rewards, collision and checkpoint hash', async () => {
    const bytes = new TextEncoder().encode(JSON.stringify(GameData.load(compile()).raw));
    const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
      .map((v) => v.toString(16).padStart(2, '0'))
      .join('');
    expect(hash).toBe('fce8c1bf74e3e8e9fd3019432542026bb82f6a65060914ce468e9d255876ace1');
    expect(getGameData().quest('quest.greenvale.stillwater').rewards).toEqual({
      xp: 600,
      currency: [{ currencyId: 'gold', amount: 250 }],
      items: [{ itemTemplateId: 'accessory.ring.stillwater_seal', quantity: 1 }],
    });
  });
  it('is deterministic, does not mutate inputs and installs no partial singleton on failure', () => {
    const before = JSON.stringify({ contentManifest, contentPacks });
    expect(compile()).toEqual(compile());
    const { manifest, pack } = fixture();
    pack.quests[0]!.rewardId = 'missing';
    expect(() => compileContentCatalog(manifest, [pack])).toThrow('reward missing');
    expect(JSON.stringify({ contentManifest, contentPacks })).toBe(before);
    expect(getGameData().npcs.has('npc.greenvale.surveyor_tess')).toBe(true);
  });
  it.each([
    {},
    { ...contentPacks[0], schemaVersion: 2 },
    { ...contentPacks[0], revision: 0 },
    { ...contentPacks[0], script: 'grantGold()' },
  ])('rejects malformed/unsupported envelopes', (input) => {
    expect(ContentPackSchema.safeParse(input).success).toBe(false);
  });
  it('rejects missing required IDs and unknown authored fields', () => {
    const { pack } = fixture();
    expect(
      ContentPackSchema.safeParse({ ...pack, quests: [{ ...pack.quests[0], id: undefined }] })
        .success,
    ).toBe(false);
    expect(
      ContentPackSchema.safeParse({ ...pack, quests: [{ ...pack.quests[0], typo: true }] }).success,
    ).toBe(false);
  });
  it('rejects duplicate packs and IDs across packs', () => {
    expect(() =>
      compileContentCatalog(contentManifest, [...contentPacks, ...contentPacks]),
    ).toThrow('Duplicate content ID');
    const { pack } = fixture();
    pack.id = 'pack.other';
    expect(() => compileContentCatalog(contentManifest, [...contentPacks, pack])).toThrow(
      'Duplicate content ID',
    );
  });
  it.each(['missing', 'loot.greenvale.siltbound_warden'])(
    'rejects missing/wrong-kind quest rewards: %s',
    (id) => {
      const { manifest, pack } = fixture();
      pack.quests[0]!.rewardId = id;
      expect(() => compileContentCatalog(manifest, [pack])).toThrow('quest reward');
    },
  );
  it('rejects missing encounter loot', () => {
    const { manifest, pack } = fixture();
    pack.encounters[0]!.lootRewardId = 'missing';
    expect(() => compileContentCatalog(manifest, [pack])).toThrow('loot reward');
  });
  it('rejects conflicting inline definitions and missing/duplicate manifest refs', () => {
    const { manifest, pack } = fixture();
    manifest.npcs.push(pack.npcs[0]!.definition);
    expect(() => compileContentCatalog(manifest, [pack])).toThrow();
    manifest.npcs.pop();
    manifest.npcs.push({ contentRef: 'npc.greenvale.surveyor_tess' });
    expect(() => compileContentCatalog(manifest, [pack])).toThrow('duplicate manifest');
    manifest.npcs.pop();
    manifest.npcs[0] = { contentRef: 'missing' };
    expect(() => compileContentCatalog(manifest, [pack])).toThrow('manifest reference missing');
  });
  it('rejects pack definitions omitted from the manifest', () => {
    const { manifest, pack } = fixture();
    manifest.npcs.shift();
    expect(() => compileContentCatalog(manifest, [pack])).toThrow('Unregistered pack');
  });
  it.each(['unknown.zone', 'wrong.owner', 'wrong.kind', 'out.of.bounds', 'duplicate.spawn'])(
    'rejects broken placements: %s',
    (fault) => {
      const { manifest, pack } = fixture();
      const p = pack.encounters[0]!.placements[0]!;
      if (fault === 'unknown.zone') p.zoneId = 'unknown';
      if (fault === 'wrong.owner') p.spawn.refId = 'npc.greenvale.elder_maren';
      if (fault === 'wrong.kind') p.spawn.kind = 'npc';
      if (fault === 'out.of.bounds') p.spawn.position.x = 100000;
      if (fault === 'duplicate.spawn') p.spawn.id = pack.npcs[0]!.placements[0]!.spawn.id;
      expect(() => compileContentCatalog(manifest, [pack])).toThrow();
    },
  );
  it('checks external NPC/enemy/item/currency/landmark/prerequisite links', () => {
    const gd = getGameData();
    for (const mutate of [
      (raw: typeof gd.raw) => {
        raw.quests[0]!.giverNpcId = 'missing';
      },
      (raw: typeof gd.raw) => {
        raw.quests[0]!.prerequisites = ['missing'];
      },
      (raw: typeof gd.raw) => {
        raw.quests[0]!.rewards.items[0]!.itemTemplateId = 'missing';
      },
      (raw: typeof gd.raw) => {
        raw.quests[0]!.rewards.currency[0]!.currencyId = 'missing';
      },
      (raw: typeof gd.raw) => {
        const o = raw.quests[0]!.objectives[0]!;
        if (o.kind === 'explore') o.areaId = 'missing';
      },
      (raw: typeof gd.raw) => {
        const o = raw.quests[0]!.objectives[1]!;
        if (o.kind === 'kill') o.enemyId = 'missing';
      },
    ]) {
      const raw = structuredClone(gd.raw);
      mutate(raw);
      expect(() => GameData.load(raw)).toThrow();
    }
  });
  it('detects indirect cycles, duplicate prerequisites and impossible placeholder chains', () => {
    for (const prerequisites of [
      ['quest.greenvale.keeper_outpost'],
      ['quest.greenvale.well_records', 'quest.greenvale.well_records'],
    ]) {
      const raw = structuredClone(getGameData().raw);
      raw.quests.find((q) => q.id === 'quest.greenvale.stillwater')!.prerequisites = prerequisites;
      expect(() => GameData.load(raw)).toThrow(/circular|duplicate/);
    }
    const raw = structuredClone(getGameData().raw);
    raw.quests.find((q) => q.id === 'quest.greenvale.root_wound')!.placeholder = true;
    expect(() => GameData.load(raw)).toThrow('not playable');
  });
  it('validates unused reward definitions too', () => {
    const { manifest, pack } = fixture();
    pack.rewards.push({
      kind: 'quest',
      id: 'reward.unused',
      value: { xp: 0, currency: [], items: [{ itemTemplateId: 'missing', quantity: 1 }] },
    });
    expect(() => compileContentCatalog(manifest, [pack])).toThrow('reward.unused');
  });
  it.each(['quantity', 'currency', 'stack'])('rejects impossible loot bounds: %s', (fault) => {
    const { manifest, pack } = fixture();
    const r = pack.rewards[1]!;
    if (r.kind !== 'loot') throw new Error('fixture');
    if (fault === 'quantity') r.value.entries[0]!.minQuantity = 10;
    if (fault === 'currency') r.value.currency!.max = 1;
    if (fault === 'stack') r.value.entries[0]!.maxQuantity = 100000;
    expect(() => compileContentCatalog(manifest, [pack])).toThrow();
  });
  it('loads arbitrary pack data through existing systems without special quest code', () => {
    const { manifest, pack } = fixture();
    pack.quests[0]!.name = 'Alternate authored title';
    pack.rewards[0]!.value = { xp: 42, currency: [], items: [] };
    const gd = GameData.load(compileContentCatalog(manifest as ContentManifest, [pack]));
    expect(gd.quest('quest.greenvale.stillwater').name).toBe('Alternate authored title');
    expect(gd.quest('quest.greenvale.stillwater').rewards.xp).toBe(42);
  });
});
