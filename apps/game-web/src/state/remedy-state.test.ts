import { expect, it, vi } from 'vitest';
import { getGameData, remedyEffect } from '@mmo/game-data';
import { DORMANT_EXTERNAL_OWNERSHIP, type Item, type ItemLocation } from '@mmo/schemas';
import type { RealtimeClient } from '@mmo/networking';
import { uuidv7 } from '@mmo/shared';
import { GameState } from './game-state';
import { QuestActions } from './quest-actions';
import { remedyStatus } from './remedy-state';
function setup() {
  const state = new GameState({
    id: uuidv7(),
    accountId: uuidv7(),
    name: 'Player',
    classId: 'class.warrior',
    specialisationId: null,
    level: 5,
    xp: 0,
    zoneId: 'zone.greenvale.meadows',
    position: { x: 0, y: 0, z: 0 },
    createdAt: new Date().toISOString(),
  });
  state.connection = 'open';
  state.systems.remedyReadyAtMs = 0;
  state.vitals = { health: 40, maxHealth: 100, dead: false, inCombat: true, respawnAvailableAt: 0 };
  const add = (
    quantity: number,
    kind: 'backpack' | 'character_vault' = 'backpack',
    locked = false,
  ) => {
    const id = uuidv7(),
      now = new Date().toISOString();
    const location: ItemLocation = {
      kind: 'container',
      containerId: uuidv7(),
      containerKind: kind,
      slot: 0,
    };
    const item: Item = {
      template: getGameData().template(remedyEffect.templateId),
      instance: {
        id,
        templateId: remedyEffect.templateId,
        rarityId: 'common',
        quantity,
        ownership: {
          ownerAccountId: state.character.accountId,
          ownerCharacterId: state.character.id,
          originalOwnerAccountId: null,
          originalOwnerCharacterId: null,
          crafterCharacterId: null,
        },
        location,
        acquisition: { method: 'system', sourceRef: null },
        binding: { kind: 'unbound' },
        stats: {},
        modifiers: [],
        sockets: [],
        enchantments: [],
        durability: null,
        appearance: null,
        flags: { locked, favourite: false, junk: false },
        external: DORMANT_EXTERNAL_OWNERSHIP,
        version: 0,
        createdAt: now,
        updatedAt: now,
      },
    };
    state.items.apply([item]);
    return id;
  };
  return { state, add };
}
it('uses only unlocked carried remedies and the authoritative server-clock cooldown', () => {
  const { state, add } = setup();
  add(8, 'character_vault');
  const locked = add(7, 'backpack', true);
  const usable = add(2);
  expect(remedyStatus(state, 1000)).toMatchObject({
    count: 2,
    reason: null,
    item: { instance: { id: usable } },
  });
  expect(remedyStatus(state, 1000, locked).reason).toBe('No carried remedy');
  state.serverOffsetMs = 500;
  state.systems.remedyReadyAtMs = 3500;
  expect(remedyStatus(state, 1000)).toMatchObject({
    remainingMs: 2000,
    reason: 'Remedy is cooling down',
  });
  expect(remedyStatus(state, 3000).reason).toBeNull();
  state.vitals!.health = 100;
  expect(remedyStatus(state, 3000).reason).toBe('Health is full');
  state.vitals!.dead = true;
  expect(remedyStatus(state, 3000).reason).toBe('Cannot drink while dead');
  state.connection = 'reconnecting';
  expect(remedyStatus(state, 3000).reason).toBe('Reconnecting');
});
it('guards repeated hotkey/taps while pending without inventing consumption or healing', () => {
  const { state, add } = setup();
  add(2);
  const send = vi.fn(() => 12),
    actions = new QuestActions({ send } as unknown as RealtimeClient, state);
  actions.useRemedy();
  actions.useRemedy();
  expect(send).toHaveBeenCalledTimes(1);
  expect(state.remedyPendingSeq).toBe(12);
  expect(remedyStatus(state).count).toBe(2);
  expect(state.vitals!.health).toBe(40);
  state.remedyPendingSeq = null;
  state.systems.remedyReadyAtMs = undefined;
  actions.useRemedy();
  expect(send).toHaveBeenCalledTimes(1);
});
