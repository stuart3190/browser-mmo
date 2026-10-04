import { useState } from 'react';
import { useGame } from './context';

/** Opening route uses existing real pickups, equipment and quest state. No fake progress. */
export function FirstSteps() {
  const { state } = useGame();
  const [dismissed, setDismissed] = useState(false);
  const quest = state.quests.find((q) => q.questId === 'quest.greenvale.wolves_at_the_edge');
  const weapon = state.items
    .all()
    .find((i) => i.instance.location.kind === 'equipped' && i.template.category === 'weapon');
  const sword = state.items.all().find((i) => i.template.id === 'weapon.sword.iron_longsword');
  if (dismissed || quest?.state === 'active' || quest?.state === 'ready_to_turn_in') return null;
  const completed = quest?.state === 'completed';
  return (
    <aside className="first-steps panel" data-testid="first-steps">
      <button
        className="guide-close"
        aria-label="Dismiss opening guide"
        onClick={() => setDismissed(true)}
      >
        ×
      </button>
      <span className="eyebrow">
        {completed ? 'A friend of Greenvale' : 'Your first adventure'}
      </span>
      <h3>
        {completed
          ? 'The road goes on'
          : !weapon && state.character.classId === 'class.warrior'
            ? 'Arm yourself'
            : 'A village needs you'}
      </h3>
      <p>
        {completed
          ? 'Explore Northwood, the Eastern Rocks and the Hollow. Hunt for better gear and make the roads safe.'
          : !weapon && state.character.classId === 'class.warrior'
            ? sword
              ? 'Open your Bag, select the Iron Longsword, then Equip. Find Elder Maren by the village square.'
              : 'Take the Iron Longsword at the Old Armoury, just east of your arrival point. Approach it and choose Take (E on desktop).'
            : 'Speak to Elder Maren by the village square. Follow the north road to the wolf dens when you are ready.'}
      </p>
      {!completed && sword && !weapon && (
        <button onClick={() => state.toggle('inventory', true)}>
          Open Bag <kbd>B</kbd>
        </button>
      )}
    </aside>
  );
}
