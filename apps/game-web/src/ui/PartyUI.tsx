import { useGame } from './context';
import { Window } from './Window';

export function PartySummary() {
  const { state, party } = useGame();
  const p = state.party;
  if (!p.partyId && !p.invitation) return null;
  return (
    <aside className="party-summary panel" aria-label="Party members">
      {p.invitation ? (
        <>
          <span>{p.invitation.fromName} invites you to a party</span>
          <div>
            <button onClick={() => party.respond(p.invitation!.id, true)}>Accept party</button>
            <button onClick={() => party.respond(p.invitation!.id, false)}>Decline</button>
          </div>
        </>
      ) : (
        <>
          <button className="party-heading" onClick={() => state.toggle('party')}>
            Party · {p.members.length}/5
          </button>
          {p.members.map((m) => (
            <div key={m.characterId} className="party-member">
              <span>
                {m.characterId === p.leaderCharacterId ? '♜ ' : ''}
                {m.name}
              </span>
              <span>{m.online ? `${m.health}/${m.maxHealth}` : 'Reconnecting'}</span>
              <progress
                max={m.maxHealth}
                value={m.online ? m.health : 0}
                aria-label={`${m.name} health`}
              />
            </div>
          ))}
        </>
      )}
    </aside>
  );
}

export function PartyPanel() {
  const { state, party } = useGame();
  const p = state.party;
  const canInvite = !p.partyId || p.leaderCharacterId === state.character.id;
  const nearby = [...state.world.values()].filter(
    (e) =>
      e.kind === 'player' &&
      e.characterId &&
      e.characterId !== state.character.id &&
      !p.members.some((m) => m.characterId === e.characterId),
  );
  return (
    <Window id="party" title="Party">
      <p>Adventure together in Greenvale. Invite and accept within 20 m. Up to five members.</p>
      <p className="small">
        Living, connected members within 40 m of a kill share XP and quest kill credit if grouped
        when the enemy was first hit. One loot roll (including coins) rotates between eligible
        members. Pelts are personal items, not copied.
      </p>
      {p.pendingInvite && <p role="status">Invitation sent · expires after 30 seconds</p>}
      {canInvite && (
        <div className="party-nearby">
          <h3>Players in view</h3>
          {nearby.length ? (
            nearby.map((e) => (
              <div key={e.id}>
                <span>{e.name}</span>
                <button
                  disabled={p.pendingInvite || p.members.length >= 5 || state.connection !== 'open'}
                  onClick={() => party.invite(e.characterId!)}
                  aria-label={`Invite ${e.name}`}
                >
                  Invite
                </button>
              </div>
            ))
          ) : (
            <p>No other players in view.</p>
          )}
        </div>
      )}
      {p.partyId && (
        <>
          <p>
            Disconnected members keep their place for two minutes. A departing leader passes
            leadership to the next member.
          </p>
          <button onClick={() => party.leave()}>Leave party</button>
          {p.leaderCharacterId === state.character.id && (
            <button onClick={() => party.disband()}>Disband party</button>
          )}
        </>
      )}
    </Window>
  );
}
