import { classAbilities, effectiveAbility, specialisationPaths } from '@mmo/game-data';
import { useGame } from './context';
import { AbilityGlyph } from './AbilityGlyph';

/** Touch-readable, inspect-only class reference. Uses the same effective definitions as the bar. */
export function CombatHandbook() {
  const { state, gameData } = useGame();
  const c = state.character;
  const level = state.progress?.level ?? c.level;
  const path = specialisationPaths.find((p) => p.id === c.specialisationId);
  const abilities = classAbilities(gameData, c.classId)
    .filter((a) => !a.placeholder)
    .map((a) => effectiveAbility(a, c.classId, level, c.specialisationId));
  return (
    <details className="combat-handbook" data-testid="combat-handbook">
      <summary>Class abilities · learn your kit</summary>
      <p className="small">
        Inspect abilities here; use the action bar to fight. Number keys match your bar. On touch,
        Attack is separate from your three class buttons.
      </p>
      {path && (
        <p data-testid="handbook-path">
          <strong>{path.name}</strong> · {path.description}
        </p>
      )}
      {abilities.map((a, i) => {
        const unlocked = state.abilities.find((s) => s.abilityId === a.id)?.unlocked ?? false;
        return (
          <article key={a.id} data-handbook-ability={a.id}>
            <header>
              <span className="handbook-glyph" style={{ color: a.icon.color }}>
                <AbilityGlyph id={a.id} fallback={a.icon.glyph} />
              </span>
              <strong>{a.name}</strong>
              <kbd>{i + 1}</kbd>
            </header>
            <p className={unlocked ? 'handbook-ready' : 'muted'}>
              {unlocked ? 'Learned' : `Unlocks at level ${a.unlockLevel}`}
            </p>
            <p>{a.description}</p>
            <dl>
              <div>
                <dt>Reach</dt>
                <dd>
                  {a.targeting === 'self'
                    ? 'Yourself'
                    : a.targeting === 'aoe_self'
                      ? `${a.rangeMeters} m around you`
                      : `${a.rangeMeters} m`}
                </dd>
              </div>
              <div>
                <dt>Recovery</dt>
                <dd>{a.autoAttack ? 'Weapon swing speed' : `${a.cooldownMs / 1000} seconds`}</dd>
              </div>
              <div>
                <dt>Target</dt>
                <dd>{a.targeting === 'enemy' ? 'Select an enemy' : 'No target needed'}</dd>
              </div>
            </dl>
            {a.utility?.kind === 'guard' && (
              <p className="small">
                Blocks {Math.round(a.utility.reduction * 100)}% of incoming damage for{' '}
                {a.utility.durationMs / 1000} seconds.
              </p>
            )}
            {a.utility?.kind === 'root' && (
              <p className="small">
                Holds ordinary enemies for {a.utility.durationMs / 1000} seconds. Bosses resist
                roots; leave their attack warnings instead.
              </p>
            )}
          </article>
        );
      })}
      <p className="small">
        Recover health outside combat. H or the remedy button drinks a carried healing remedy. New
        abilities unlock automatically as you level.
      </p>
    </details>
  );
}
