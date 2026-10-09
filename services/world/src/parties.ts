import { DomainError, ErrorCode, uuidv7 } from '@mmo/shared';
import { distance2D } from '@mmo/game-data';
import type { ServerPayload } from '@mmo/networking';

export const PARTY_RANGE = 40;
export const PARTY_GRACE_MS = 120_000;
type Member = { id: string; name: string; offlineAt: number | null };
type Party = {
  persistent?: boolean;
  id: string;
  leader: string;
  members: Member[];
  lootCursor: number;
};
type Invite = { id: string; from: string; to: string; expires: number };
export type PartyPlayer = {
  name: string;
  position: { x: number; z: number };
  health: number;
  maxHealth: number;
  dead: boolean;
};
/** Zone-local parties: checkpointed with combat, no second ownership or reward path. */
export class Parties {
  private parties: Party[] = [];
  private invites: Invite[] = [];
  private online = new Set<string>();
  constructor(
    private readonly player: (id: string) => PartyPlayer | undefined,
    private readonly zoneId: string,
  ) {}
  private fail(message: string): never {
    throw new DomainError(ErrorCode.CONFLICT, message);
  }
  private of(id: string) {
    return this.parties.find((p) => p.members.some((m) => m.id === id));
  }
  /** Frozen dungeon cohort survives normal offline grace; the instance lifecycle owns expiry. */
  install(id: string, leader: string, members: { id: string; name: string }[], now: number) {
    const previous = this.parties.find((p) => p.id === id);
    this.parties = this.parties.filter(
      (p) => p.id !== id && !p.members.some((m) => members.some((n) => n.id === m.id)),
    );
    if (members.length > 1)
      this.parties.push({
        id,
        leader,
        members: members.map((m) => ({
          ...m,
          offlineAt: this.online.has(m.id) ? null : now + 24 * 60 * 60 * 1000,
        })),
        lootCursor: previous?.lootCursor ?? 0,
        persistent: true,
      });
  }
  checkpoint() {
    return { parties: this.parties, invites: this.invites };
  }
  restore(data: ReturnType<Parties['checkpoint']> | undefined, now: number) {
    this.parties = data?.parties ?? [];
    this.invites = [];
    this.online.clear();
    for (const p of this.parties) for (const m of p.members) m.offlineAt ??= now;
  }
  connected(id: string, online: boolean, now: number) {
    this.expire(now);
    if (online) this.online.add(id);
    else this.online.delete(id);
    const m = this.of(id)?.members.find((m) => m.id === id);
    if (m) m.offlineAt = online ? null : (m.offlineAt ?? now);
  }
  private nearby(a: string, b: string) {
    const x = this.player(a),
      y = this.player(b);
    return (
      a !== b &&
      this.online.has(a) &&
      this.online.has(b) &&
      x &&
      y &&
      !x.dead &&
      !y.dead &&
      distance2D(x.position, y.position) <= 20
    );
  }
  invite(from: string, to: string, now: number) {
    this.expire(now);
    if (!this.nearby(from, to)) this.fail('Invite a living player within 20 m in this zone');
    const party = this.of(from);
    if (this.of(to) || (party && (party.leader !== from || party.members.length >= 5)))
      this.fail('Only a party leader with a free place can invite');
    if (this.invites.some((i) => i.to === to || i.from === from))
      this.fail('An invitation is already pending');
    this.invites.push({ id: uuidv7(), from, to, expires: now + 30_000 });
  }
  respond(to: string, invitationId: string, accept: boolean, now: number) {
    this.expire(now);
    const invite = this.invites.find((i) => i.id === invitationId && i.to === to);
    if (!invite) this.fail('That invitation has expired or was already answered');
    this.invites = this.invites.filter((i) => i !== invite);
    if (!accept) return;
    if (!this.nearby(invite.from, to) || this.of(to))
      this.fail('Stay within 20 m of the inviter to join');
    let p = this.of(invite.from);
    if (p && (p.leader !== invite.from || p.members.length >= 5))
      this.fail('That party is no longer available');
    if (!p) {
      p = {
        id: uuidv7(),
        leader: invite.from,
        members: [{ id: invite.from, name: this.player(invite.from)!.name, offlineAt: null }],
        lootCursor: 0,
      };
      this.parties.push(p);
    }
    p.members.push({ id: to, name: this.player(to)!.name, offlineAt: null });
    this.invites = this.invites.filter((i) => i.from !== to && i.to !== to);
  }
  leave(id: string, disband = false) {
    const p = this.of(id);
    if (!p) return;
    if (disband && p.leader !== id) this.fail('Only the leader can disband');
    this.invites = this.invites.filter((i) => i.from !== id && i.to !== id);
    p.members = p.members.filter((m) => m.id !== id);
    if (disband || p.members.length < 2) {
      this.parties = this.parties.filter((x) => x !== p);
      this.invites = this.invites.filter((i) => i.from !== p.leader);
    } else if (p.leader === id) p.leader = p.members[0]!.id;
  }
  expire(now: number) {
    this.invites = this.invites.filter((i) => i.expires > now && this.online.has(i.from));
    for (const p of [...this.parties])
      for (const m of [...p.members])
        if (!p.persistent && m.offlineAt !== null && now - m.offlineAt >= PARTY_GRACE_MS)
          this.leave(m.id);
  }
  cohort(id: string): { partyId: string | null; members: string[] } {
    const p = this.of(id);
    return { partyId: p?.id ?? null, members: p?.members.map((m) => m.id) ?? [id] };
  }
  rewards(
    tag: string,
    cohort: ReturnType<Parties['cohort']> | undefined,
    position: { x: number; z: number },
  ) {
    const p = this.of(tag);
    if (!p || p.id !== cohort?.partyId) return { recipients: [tag], lootCharacterId: tag };
    const eligible = p.members
      .filter((m) => {
        const player = this.player(m.id);
        return (
          cohort.members.includes(m.id) &&
          this.online.has(m.id) &&
          player &&
          !player.dead &&
          distance2D(player.position, position) <= PARTY_RANGE
        );
      })
      .map((m) => m.id);
    // No eligible group member: record the death without granting a remote/dead player rewards.
    if (!eligible.length) return { recipients: [], lootCharacterId: tag };
    // Advance through membership order, skipping ineligible members without granting duplicate rolls.
    let loot = eligible[0]!;
    for (let n = 0; n < p.members.length; n++) {
      const index = (p.lootCursor + n) % p.members.length;
      const id = p.members[index]!.id;
      if (eligible.includes(id)) {
        loot = id;
        p.lootCursor = (index + 1) % p.members.length;
        break;
      }
    }
    return { recipients: eligible, lootCharacterId: loot };
  }
  view(id: string): ServerPayload<'party.update'> {
    const p = this.of(id),
      i = this.invites.find((i) => i.to === id);
    return {
      partyId: p?.id ?? null,
      leaderCharacterId: p?.leader ?? null,
      members:
        p?.members.map((m) => {
          const live = this.player(m.id);
          return {
            characterId: m.id,
            name: m.name,
            online: this.online.has(m.id),
            zoneId: this.zoneId,
            health: live ? Math.round(live.health) : 0,
            maxHealth: live?.maxHealth ?? 1,
          };
        }) ?? [],
      invitation: i
        ? { id: i.id, fromName: this.player(i.from)?.name ?? 'Adventurer', expiresAt: i.expires }
        : null,
      pendingInvite: this.invites.some((i) => i.from === id),
    };
  }
}
