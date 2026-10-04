import { describe, it, expect } from 'vitest';
import { Parties, PARTY_GRACE_MS } from './parties';
import type { PartyPlayer } from './parties';
const setup = () => {
  const players = new Map<string, PartyPlayer>();
  const p = new Parties((id) => players.get(id), 'zone.test');
  for (const id of ['a', 'b', 'c', 'd', 'e', 'f']) {
    players.set(id, {
      name: id,
      position: { x: 0, z: 0 },
      health: 100,
      maxHealth: 100,
      dead: false,
    });
    p.connected(id, true, 0);
  }
  const join = (from: string, to: string) => {
    p.invite(from, to, 1);
    p.respond(to, p.view(to).invitation!.id, true, 2);
  };
  return { p, players, join };
};
describe('authoritative parties', () => {
  it('validates invitations, recipient, range, expiry, leadership, capacity and replay', () => {
    const { p, players, join } = setup();
    p.invite('a', 'b', 0);
    const id = p.view('b').invitation!.id;
    expect(() => p.respond('c', id, true, 1)).toThrow();
    p.respond('b', id, true, 1);
    expect(() => p.respond('b', id, true, 2)).toThrow();
    expect(() => p.invite('b', 'c', 3)).toThrow();
    players.get('c')!.position.x = 21;
    expect(() => p.invite('a', 'c', 3)).toThrow();
    players.get('c')!.position.x = 0;
    join('a', 'c');
    join('a', 'd');
    join('a', 'e');
    expect(() => p.invite('a', 'f', 3)).toThrow();
    expect(() => p.leave('b', true)).toThrow();
    p.leave('a');
    expect(p.view('b').leaderCharacterId).toBe('b');
    p.leave('b', true);
    expect(p.view('c').partyId).toBeNull();
    p.invite('a', 'f', 4);
    const expired = p.view('f').invitation!.id;
    expect(() => p.respond('f', expired, true, 30_004)).toThrow();
  });
  it('freezes tag cohort, excludes late joiners, far/dead/offline members and rotates one loot roll', () => {
    const { p, players, join } = setup();
    join('a', 'b');
    const cohort = p.cohort('a');
    join('a', 'c');
    expect(p.rewards('a', cohort, { x: 0, z: 0 })).toEqual({
      recipients: ['a', 'b'],
      lootCharacterId: 'a',
    });
    expect(p.rewards('a', cohort, { x: 0, z: 0 })).toEqual({
      recipients: ['a', 'b'],
      lootCharacterId: 'b',
    });
    players.get('b')!.position.x = 41;
    expect(p.rewards('a', cohort, { x: 0, z: 0 }).recipients).toEqual(['a']);
    players.get('b')!.position.x = 0;
    players.get('b')!.dead = true;
    expect(p.rewards('a', cohort, { x: 0, z: 0 }).recipients).toEqual(['a']);
    players.get('b')!.dead = false;
    p.connected('b', false, 3);
    expect(p.rewards('a', cohort, { x: 0, z: 0 }).recipients).toEqual(['a']);
    players.get('a')!.dead = true;
    expect(p.rewards('a', cohort, { x: 0, z: 0 }).recipients).toEqual([]);
    players.get('a')!.dead = false;
    p.connected('b', true, 4);
    expect(p.rewards('a', cohort, { x: 0, z: 0 }).recipients).toEqual(['a', 'b']);
  });
  it('recovers party and loot cursor, marks recovered members offline and expires disconnect grace', () => {
    const { p, players, join } = setup();
    join('a', 'b');
    p.rewards('a', p.cohort('a'), { x: 0, z: 0 });
    const saved = JSON.parse(JSON.stringify(p.checkpoint()));
    const recovered = new Parties((id) => players.get(id), 'zone.test');
    recovered.restore(saved, 10);
    expect(recovered.view('a').members.every((m) => !m.online)).toBe(true);
    recovered.connected('a', true, 11);
    recovered.connected('b', true, 11);
    expect(recovered.rewards('a', recovered.cohort('a'), { x: 0, z: 0 }).lootCharacterId).toBe('b');
    recovered.connected('b', false, 12);
    recovered.expire(12 + PARTY_GRACE_MS);
    expect(recovered.view('a').partyId).toBeNull();
  });
});
