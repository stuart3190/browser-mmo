import { questDestination } from '../state/quest-navigation';
import { useEffect, useState } from 'react';
import { distance2D, worldDestination } from '@mmo/game-data';
import { Window } from './Window';
import { useGame } from './context';

export function WorldWindow() {
  const { state, gameData, controls } = useGame();
  const world = gameData.raw.worldCatalog;
  const current = world?.regions.find(
    (r) =>
      r.zoneId === state.character.zoneId ||
      (state.character.zoneId === world.enclave.zoneId && r.id === world.enclave.regionId),
  );
  const [regionId, setRegion] = useState(current?.id ?? '');
  const [, refresh] = useState(0);
  useEffect(() => {
    if (!state.open.has('world')) return;
    const timer = setInterval(() => refresh((n) => n + 1), 500);
    return () => clearInterval(timer);
  }, [state.open.has('world')]);
  useEffect(() => setRegion(current?.id ?? ''), [current?.id]);
  if (!world) return null;
  const region = world.regions.find((r) => r.id === regionId) ?? current;
  const pos = controls.position();
  const completed = new Set(
    state.quests.filter((q) => q.state === 'completed').map((q) => q.questId),
  );
  const zone = controls.zoneId() ?? state.character.zoneId;
  const route = pos
    ? state.worldDestinationId
      ? worldDestination(world, state.worldDestinationId, zone, {
          fromPosition: pos,
          completedQuestIds: completed,
        })
      : questDestination(gameData, state.quests, state.trackedQuestId, zone, pos)
    : null;
  const guide = (id: string) =>
    state.update((s) => {
      s.worldDestinationId = id;
      s.open.delete('world');
    });
  return (
    <Window id="world" title="World / Travel">
      <p className="small">
        {current?.name ?? state.zoneName} ·{' '}
        {current
          ? `recommended ${current.levelBand.min}–${current.levelBand.max} · ${current.danger}`
          : ''}
      </p>
      <label>
        Explore the atlas{' '}
        <select
          aria-label="Atlas region"
          value={region?.id ?? ''}
          onChange={(e) => setRegion(e.target.value)}
        >
          {world.landmasses.map((l) => (
            <optgroup key={l.id} label={l.name}>
              {world.regions
                .filter((r) => r.landmassId === l.id)
                .map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} · {r.levelBand.min}–{r.levelBand.max}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
      </label>
      <p className="small">
        {region?.transitionIntent} Level bands are guidance, not travel locks.
      </p>
      <h3>Places and routes</h3>
      <div className="world-locations">
        {world.locations
          .filter((l) => l.regionId === region?.id)
          .map((l) => (
            <div key={l.id}>
              <span>
                {l.name}
                <small>
                  {state.discoveries.includes(l.id) ? '✓ Discovered · ' : 'Unvisited · '}
                  {l.kind.replace('_', ' ')}
                  {gameData.raw.dungeonEntries?.find((d) => d.locationId === l.id)
                    ? ' · private dungeon'
                    : ''}
                  {l.zoneId === controls.zoneId() && pos
                    ? ` · ${Math.round(distance2D(pos, l.position))} m`
                    : ''}
                </small>
                {gameData.raw.dungeonEntries
                  ?.filter((d) => d.locationId === l.id)
                  .map((d) => (
                    <small key={d.id}>
                      {d.name} · recommended level {d.recommendedLevel}. Private solo or party run ·
                      level 4 required. Clear two guardians and the Bell Keeper. Each admitted
                      player receives personal completion supplies.
                    </small>
                  ))}
              </span>
              <button data-guide-location={l.id} onClick={() => guide(l.id)}>
                Guide
              </button>
            </div>
          ))}
      </div>
      <h3>Departures in this zone</h3>
      <p className="small">
        Stand within 5 m of the named node. Travel leaves zone parties; health, cooldowns, equipment
        and progress are preserved.
      </p>
      {world.travel
        .filter(
          (t) =>
            world.locations.find((l) => l.id === t.fromLocationId)?.zoneId === controls.zoneId(),
        )
        .map((t) => {
          const from = world.locations.find((l) => l.id === t.fromLocationId)!,
            to = world.locations.find((l) => l.id === t.toLocationId)!;
          const distance = pos ? distance2D(pos, from.position) : Infinity;
          const locked = !!t.requiredQuestId && !completed.has(t.requiredQuestId);
          const suggested = route?.travelId === t.id;
          return (
            <div
              className={`world-departure${suggested ? ' suggested' : ''}`}
              key={t.id}
              data-recommended={suggested}
            >
              <span>
                {suggested && <strong className="suggested-passage">Suggested passage</strong>}
                {from.name} → {to.name}
                <small>
                  {t.mode} · {Math.round(distance)} m to departure
                  {!t.enabled && ' · Passage closed'}
                  {locked &&
                    ` · Requires ${gameData.quests.get(t.requiredQuestId!)?.name ?? 'quest completion'}`}
                </small>
              </span>
              <button onClick={() => guide(from.id)}>Guide</button>
              <button
                data-travel={t.id}
                disabled={
                  !t.enabled ||
                  locked ||
                  distance > 5 ||
                  state.vitals?.dead ||
                  state.vitals?.inCombat
                }
                onClick={() => {
                  controls.travel(t.id);
                  state.update((s) => {
                    s.open.delete('world');
                    // Keep a distant atlas destination across intermediate travel legs.
                    if (s.worldDestinationId === from.id) s.worldDestinationId = null;
                  });
                }}
              >
                Travel
              </button>
            </div>
          );
        })}
      <button
        onClick={() =>
          state.update((s) => {
            s.worldDestinationId = null;
            s.open.delete('world');
          })
        }
      >
        Resume quest guidance
      </button>
      <p className="small">
        Greenvale offers gathering, shops, fieldcraft and private Broken Vault runs. Amber Coast
        adds the Tidewatch story and weapon commissions. Other regions remain greybox. Bearings
        estimate walking distance between passages; follow roads around obstacles.
      </p>
    </Window>
  );
}
