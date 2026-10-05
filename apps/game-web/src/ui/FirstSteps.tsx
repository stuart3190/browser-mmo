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
  if (dismissed || state.quests.some((q) => q.state === 'active' || q.state === 'ready_to_turn_in'))
    return null;
  const completed = quest?.state === 'completed';
  const done = (id: string) =>
    state.quests.some((q) => q.questId === `quest.greenvale.${id}` && q.state === 'completed');
  const next = done('stillwater')
    ? 'The eastern seal holds. Explore Greenvale with your party while Maren studies the old well records.'
    : done('root_wound')
      ? 'Bring Rill’s discovery home to Elder Maren in Greenvale. She knows what the ward was built to hold.'
      : done('hollow_trail')
        ? 'Return to Keeper Rill at the Old Waystone. The ward beyond Brackenmaw still shines beneath the roots.'
        : done('old_waystone')
          ? 'Rill needs your help at the Old Waystone. Follow his pale trail into the Hollow.'
          : 'Return to Elder Maren. She has heard troubling news from the Old Waystone, down the southern road.';
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
          ? next
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
