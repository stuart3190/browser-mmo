import { expect, it } from 'vitest';
import { GameData, getGameData, questRewardItems, questView } from './index';
const gd = getGameData();
const quest = gd.quest('quest.greenvale.marches_remedy');
it('resolves the class-specific offer and preserves default rewards for other quests', () => {
  expect(questRewardItems(quest, 'class.mage')).toEqual([
    { itemTemplateId: 'armor.cloth.apprentice_robe', quantity: 1 },
  ]);
  expect(questRewardItems(quest, 'class.warrior')).toEqual(quest.rewards.items);
  expect(questRewardItems(gd.quest('quest.greenvale.wolves_at_the_edge'), 'class.mage')).toEqual(
    gd.quest('quest.greenvale.wolves_at_the_edge').rewards.items,
  );
  expect(questView(quest, 1, new Map(), () => 0, 'class.mage').rewards.items).toEqual(
    questRewardItems(quest, 'class.mage'),
  );
});
it('rejects unknown class/item references and oversized alternative stacks', () => {
  for (const [key, itemTemplateId, quantity] of [
    ['class.missing', 'armor.cloth.apprentice_robe', 1],
    ['class.mage', 'item.missing', 1],
    ['class.mage', 'armor.cloth.apprentice_robe', 2],
  ] as const) {
    const raw = structuredClone(gd.raw);
    raw.quests.find((q) => q.id === quest.id)!.rewards.classItems = {
      [key]: [{ itemTemplateId, quantity }],
    };
    expect(() => GameData.load(raw)).toThrow();
  }
});
