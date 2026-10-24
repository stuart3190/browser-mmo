import { specialisationPaths, specialisationLevel, specialisationMentors } from '@mmo/game-data';
import { useGame } from './context';

/** Mentor service: server-confirmed path, no local optimistic combat bonuses. */
export function SpecialisationChoices() {
  const { state, quests } = useGame();
  if (!state.dialogue || !specialisationMentors.includes(state.dialogue.npcId)) return null;
  const level = state.progress?.level ?? state.character.level;
  const unlocked = level >= specialisationLevel;
  return (
    <details className="dialogue-quest" data-testid="specialisation-choices">
      <summary>Class specialisation {unlocked ? '· choose your path' : '· level 5'}</summary>
      <p className="small">
        Train with Maren or Iona from level five. Training and changing paths are free outside
        combat. Running cooldowns stay unchanged.
      </p>
      {specialisationPaths
        .filter((p) => p.classId === state.character.classId)
        .map((path) => {
          const selected = state.character.specialisationId === path.id;
          return (
            <section key={path.id} className="specialisation-choice">
              <strong>
                {path.name}
                {selected ? ' · current path' : ''}
              </strong>
              <p className="small">{path.description}</p>
              <button
                data-specialisation={path.id}
                disabled={
                  selected ||
                  !unlocked ||
                  state.connection !== 'open' ||
                  state.vitals?.inCombat ||
                  state.vitals?.dead
                }
                onClick={() => quests.specialise(path.id)}
              >
                {selected ? 'Trained' : unlocked ? `Train as ${path.name}` : 'Requires level 5'}
              </button>
            </section>
          );
        })}
    </details>
  );
}
