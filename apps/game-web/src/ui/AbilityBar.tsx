import { useEffect, useState } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { useTap } from './tap';
import { classAbilities } from '@mmo/game-data';
import { useGame } from './context';

/**
 * Class ability bar. Slots come from the class definition (data-driven); unlock and cooldown
 * state come only from the server (`ability.state`). Desktop: number keys 1..n and click.
 * Touch: large buttons next to the Attack button (`touch` mode skips the auto-attack slot, which
 * the touch Attack button already covers).
 */
export function AbilityBar({ touch = false }: { touch?: boolean }) {
  const { state, gameData, combat } = useGame();
  const [now, setNow] = useState(Date.now());
  const busy = state.abilities.some((a) => a.readyAtLocal > now) || state.globalReadyAtLocal > now;
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(t);
  }, [busy]);
  useEffect(() => setNow(Date.now()), [state.revision]);

  const slots = classAbilities(gameData, state.character.classId);
  const dead = state.vitals?.dead ?? false;
  return (
    <div
      className={touch ? 'ability-bar touch' : 'ability-bar'}
      data-testid="ability-bar"
      role="toolbar"
      aria-label="Abilities"
    >
      {slots.map((a, i) => {
        if (touch && a.autoAttack) return null;
        const s = state.abilities.find((x) => x.abilityId === a.id);
        const unlocked = s?.unlocked ?? false;
        const remaining = a.autoAttack
          ? 0
          : Math.max(0, (s?.readyAtLocal ?? 0) - now, state.globalReadyAtLocal - now);
        const onCooldown = unlocked && remaining > 0;
        const active = a.autoAttack && state.target.attacking;
        const label = `${a.name}${unlocked ? '' : ` (level ${a.unlockLevel})`} — ${a.description}`;
        return (
          <AbilityButton
            key={a.id}
            onUse={() => combat.useAbility(a.id)}
            className={[
              'ability',
              unlocked ? '' : 'locked',
              onCooldown ? 'cooling' : '',
              active ? 'active' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            style={{ borderColor: a.icon.color }}
            disabled={!unlocked || dead}
            data-testid={`ability-${a.id}`}
            data-ready={unlocked && !onCooldown ? 'true' : 'false'}
            title={label}
            aria-label={label}
          >
            <span className="glyph" style={{ color: a.icon.color }}>
              {a.icon.glyph}
            </span>
            {!touch && <kbd>{i + 1}</kbd>}
            <span className="ability-name">{a.name}</span>
            {!unlocked && <span className="lock">Lv {a.unlockLevel}</span>}
            {onCooldown && (
              <span
                className="cooldown"
                data-testid="cooldown"
                style={{
                  height: `${Math.min(100, (remaining / Math.max(1, a.cooldownMs)) * 100)}%`,
                }}
              >
                <span className="cooldown-text">
                  {(remaining / 1000).toFixed(remaining < 1000 ? 1 : 0)}
                </span>
              </span>
            )}
          </AbilityButton>
        );
      })}
    </div>
  );
}

function AbilityButton({
  onUse,
  children,
  ...rest
}: { onUse: () => void; children: ReactNode } & Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'onClick'
>) {
  const tap = useTap(onUse);
  return (
    <button {...rest} {...tap}>
      {children}
    </button>
  );
}
