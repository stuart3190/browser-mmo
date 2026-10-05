import { useState } from 'react';
import { useGame } from './context';

/** Opening route uses existing real pickups, equipment and quest state. No fake progress. */
export function FirstSteps() {
  const { state, gameData } = useGame();
  const [dismissed, setDismissed] = useState(false);
  const quest = state.quests.find((q) => q.questId === 'quest.greenvale.wolves_at_the_edge');
  const weapon = state.items
    .all()
    .find((i) => i.instance.location.kind === 'equipped' && i.template.category === 'weapon');
  const sword = state.items.all().find((i) => i.template.id === 'weapon.sword.iron_longsword');
  if (dismissed || state.quests.some((q) => q.state === 'active' || q.state === 'ready_to_turn_in'))
    return null;
  const completed = quest?.state === 'completed';
  const story = state.quests.filter((q) => {
    const def = gameData.quest(q.questId);
    return (
      !def.placeholder && !def.repeatable && def.prerequisites.length > 0 && q.state !== 'completed'
    );
  });
  const offered = story.find((q) => q.state === 'available');
  const giver = offered?.giverNpcId ? gameData.npcs.get(offered.giverNpcId)?.name : undefined;
  const next = offered
    ? `Speak to ${giver ?? 'the quest giver'} about “${offered.name}”. Follow the quest compass to the next chapter.`
    : story.length
      ? 'Meet Greenvale’s inhabitants and build experience through nearby hunts and side work to continue the ward investigation.'
      : 'Greenvale’s current ward story is complete. Explore the Marches, help its inhabitants, visit the workshop or take a daily roadwatch contract.';
  return (
    <aside
      className="first-steps panel"
      data-testid="first-steps"
      data-next-quest={offered?.questId}
    >
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
