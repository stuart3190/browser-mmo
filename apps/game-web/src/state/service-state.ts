import type { ServiceOffer } from '@mmo/schemas';
import type { GameState } from './game-state';

/** An explanation for players, not authority: the server rechecks every exchange atomically. */
export function serviceStatus(
  state: Pick<
    GameState,
    'items' | 'character' | 'quests' | 'balances' | 'systems' | 'connection' | 'vitals'
  >,
  offer: ServiceOffer,
) {
  const carried = [
    ...state.items.inContainer('backpack'),
    ...state.items.inContainer('material_pouch'),
  ].filter((i) => !i.instance.flags.locked);
  const materials = offer.inputs.map((input) => ({
    ...input,
    owned: carried
      .filter((i) => i.template.id === input.itemTemplateId)
      .reduce((n, i) => n + i.instance.quantity, 0),
  }));
  const copper = state.balances.find((b) => b.currencyId === 'gold')?.amount ?? 0;
  const questLocked =
    !!offer.requiresQuestId &&
    !state.quests.some((q) => q.questId === offer.requiresQuestId && q.state === 'completed');
  const reason =
    state.connection !== 'open'
      ? 'Reconnecting'
      : state.vitals?.dead
        ? 'Return to life first'
        : state.vitals?.inCombat
          ? 'Leave combat first'
          : state.character.level < offer.minLevel
            ? `Requires level ${offer.minLevel}`
            : questLocked
              ? 'Complete the required story first'
              : offer.kind === 'craft' && state.systems.jobs.some((j) => !j.completed)
                ? 'Collect your current craft first'
                : materials.some((i) => i.owned < i.quantity)
                  ? 'Missing carried materials'
                  : copper < -offer.copper
                    ? 'Not enough copper'
                    : null;
  return { materials, copper, questLocked, reason };
}
