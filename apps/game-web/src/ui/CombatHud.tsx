import { conditionRules } from '@mmo/game-data';
import { useEffect, useState } from 'react';
import { useGame } from './context';

const pct = (v: number, max: number) => (max > 0 ? Math.max(0, Math.min(100, (v / max) * 100)) : 0);

function Bar({
  value,
  max,
  kind,
  testId,
}: {
  value: number;
  max: number;
  kind: 'hp' | 'xp';
  testId: string;
}) {
  return (
    <div
      className={`bar bar-${kind}`}
      data-testid={testId}
      data-value={value}
      data-max={max}
      role="progressbar"
      aria-valuenow={value}
      aria-valuemax={max}
    >
      <div className="bar-fill" style={{ width: `${pct(value, max)}%` }} />
      <span className="bar-text">
        {Math.round(value)} / {max}
        {kind === 'xp' && ' XP'}
        {kind === 'hp' && ` (${Math.round(pct(value, max))}%)`}
      </span>
    </div>
  );
}

/** Own frame: name, level, health, XP. Replaces the old status panel. */
export function PlayerFrame() {
  const { state, gameData } = useGame();
  const c = state.character;
  const v = state.vitals;
  const prog = state.progress;
  const worn = [...state.items.equipped().values()].filter(
    (i) =>
      i.instance.durability &&
      i.instance.durability.current / i.instance.durability.max <= conditionRules.warningFraction,
  );
  const broken = worn.some((i) => i.instance.durability?.current === 0);
  return (
    <div className="panel frame player-frame" data-testid="player-frame">
      <div className="frame-title">
        <strong>{c.name}</strong> · {gameData.characterClass(c.classId).name} Level{' '}
        {prog?.level ?? c.level}
        {v?.inCombat && <span className="tag combat-tag">In combat</span>}
        {v?.dead && <span className="tag dead-tag">Dead</span>}
      </div>
      {worn.length > 0 && (
        <button
          className="condition-warning"
          data-testid="condition-warning"
          onClick={() => state.toggle('character', true)}
        >
          {broken ? 'Broken gear — repair to restore bonuses' : 'Gear is worn — repair soon'}
        </button>
      )}
      <StatusTags entityId={state.myEntityId} />
      {v && <Bar value={v.health} max={v.maxHealth} kind="hp" testId="player-hp" />}
      {prog && (
        <Bar value={prog.xp} max={Math.max(1, prog.xpToNext)} kind="xp" testId="player-xp" />
      )}
      <div className="muted small">
        {state.zoneName} · {v?.inCombat ? 'Hold your ground' : 'Rest outside combat to recover'}
      </div>
    </div>
  );
}

/** Target frame: name, level, health bar with %, dead state, attack/stop and clear. */
export function TargetFrame() {
  const { state, combat } = useGame();
  const t = state.targetInfo();
  if (!t) return null;
  const hostile = t.kind === 'enemy';
  return (
    <div
      className={`panel frame target-frame${t.dead ? ' is-dead' : ''}`}
      data-testid="target-frame"
      data-target-id={t.id}
    >
      <div className="frame-title">
        <strong>{t.name}</strong>
        {t.level !== undefined && <span className="muted"> · level {t.level}</span>}
        {t.dead && <span className="tag dead-tag">Dead</span>}
        <button
          className="icon-button"
          aria-label="Clear target"
          onClick={() => combat.target(null)}
        >
          ×
        </button>
      </div>
      {t.maxHealth !== undefined && (
        <Bar value={t.health ?? 0} max={t.maxHealth} kind="hp" testId="target-hp" />
      )}
      <StatusTags entityId={t.id} />
      {t.attackCue && !t.dead && (
        <div className="attack-warning" role="status">
          {t.attackCue.cleave
            ? 'Amber sweep — flank or pass behind the sentinel!'
            : t.attackCue.groundPosition
              ? 'Ground surge — move out of the blue mark! Spread out!'
              : t.refId === 'enemy.greenvale.hollow_lantern'
                ? 'Gathering light — hide behind stone or leave the violet ring!'
                : 'Heavy bite — step outside the amber ring!'}
        </div>
      )}
      {hostile && !t.dead && (
        <button
          className={state.target.attacking ? 'attack-toggle active' : 'attack-toggle'}
          onClick={() => combat.toggleAttack()}
          data-testid="attack-toggle"
        >
          {state.target.attacking ? 'Stop attacking' : 'Attack'} <kbd>F</kbd>
        </button>
      )}
      {state.combatLine && (
        <div className={`combat-line ${state.combatLine.kind}`} data-testid="combat-line">
          {state.combatLine.text}
        </div>
      )}
    </div>
  );
}

/** Shown while dead. The button unlocks on the server-provided time; the server re-checks anyway. */
export function DeathOverlay() {
  const { state, combat, controls, gameData } = useGame();
  const [now, setNow] = useState(Date.now());
  const dead = state.vitals?.dead ?? false;
  useEffect(() => {
    if (!dead) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [dead]);
  if (!dead) return null;
  const at = state.vitals?.respawnAvailableAt ?? 0;
  const wait = Math.max(0, Math.ceil((at - (now + state.serverOffsetMs)) / 1000));
  return (
    <div
      className="panel death-overlay"
      data-testid="death-overlay"
      role="alertdialog"
      aria-label="You died"
    >
      <h2>You died</h2>
      <p className="muted">No items or experience are lost.</p>
      {(() => {
        // Same rule as the server: the nearest respawn point to where you fell.
        const zoneId = controls.zoneId();
        const at = controls.position();
        if (!zoneId || !at) return null;
        const points = gameData.zone(zoneId).respawnPoints;
        let best: { name: string; d: number } | null = null;
        for (const p of points) {
          const d = Math.hypot(p.position.x - at.x, p.position.z - at.z);
          if (!best || d < best.d) best = { name: p.name, d };
        }
        return best ? (
          <p className="small" data-testid="respawn-at">
            You will return at {best.name}.
          </p>
        ) : null;
      })()}
      <button disabled={wait > 0} onClick={() => combat.respawn()} data-testid="respawn">
        {wait > 0 ? `Respawn in ${wait}s` : 'Respawn'}
      </button>
    </div>
  );
}

function StatusTags({ entityId }: { entityId: string | null }) {
  const { state } = useGame();
  const [now, setNow] = useState(Date.now());
  const statuses = state.world.get(entityId ?? '')?.statuses ?? [];
  const active = statuses.filter(
    (s) => s.kind !== 'frost_nova' && s.expiresAtMs > now + state.serverOffsetMs,
  );
  const running = active.length > 0;
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(timer);
  }, [running]);
  useEffect(() => setNow(Date.now()), [state.revision]);
  if (!running) return null;
  return (
    <div className="combat-statuses">
      {active.map((s) => (
        <span
          className={`combat-status status-${s.kind}`}
          key={s.kind}
          data-testid={`status-${s.kind}`}
          title={
            s.kind === 'guard'
              ? 'Incoming damage reduced. Keep moving or attacking.'
              : 'Cannot move, but can still attack nearby targets.'
          }
        >
          {s.kind === 'guard' ? `Guard · −${Math.round(s.magnitude * 100)}% damage` : 'Rooted'}
          {' · '}
          {Math.min(
            s.kind === 'guard' ? 4 : 3,
            Math.max(0, (s.expiresAtMs - now - state.serverOffsetMs) / 1000),
          ).toFixed(1)}
          s
        </span>
      ))}
    </div>
  );
}
