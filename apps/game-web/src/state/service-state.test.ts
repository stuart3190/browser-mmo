import { expect, it } from 'vitest';
import { getGameData } from '@mmo/game-data';
import {
  DORMANT_EXTERNAL_OWNERSHIP,
  type Item,
  type ItemLocation,
  type QuestView,
} from '@mmo/schemas';
import { uuidv7 } from '@mmo/shared';
import { GameState } from './game-state';
import { serviceStatus } from './service-state';
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
  state.vitals = {
    health: 40,
    maxHealth: 100,
    dead: false,
    inCombat: false,
    respawnAvailableAt: 0,
  };
  const add = (
    quantity: number,
    kind: 'backpack' | 'material_pouch' | 'character_vault' = 'backpack',
    locked = false,
    templateId = 'material.world.field_hide',
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
      template: getGameData().template(templateId),
      instance: {
        id,
        templateId,
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

const offer = getGameData().raw.serviceOffers!.find(
  (o) => o.id === 'service.amber_coast.craft_sword',
)!;
it('shows story and level locks before allowing costs, then reports owned usable materials and funds', () => {
  const { state, add } = setup();
  add(99, 'character_vault');
  add(99, 'backpack', true);
  expect(serviceStatus(state, offer).reason).toContain('story');
  state.character.level = 4;
  expect(serviceStatus(state, offer).reason).toBe('Requires level 5');
  state.character.level = 5;
  state.quests = [{ questId: offer.requiresQuestId!, state: 'completed' } as QuestView];
  expect(serviceStatus(state, offer).materials[0]!.owned).toBe(0);
  expect(serviceStatus(state, offer).reason).toBe('Missing carried materials');
  add(1);
  add(1, 'material_pouch');
  add(1, 'material_pouch', false, 'material.world.iron_shard');
  expect(serviceStatus(state, offer).materials.map((i) => i.owned)).toEqual([2, 1]);
  expect(serviceStatus(state, offer).reason).toBe('Not enough copper');
  state.balances = [
    {
      currencyId: 'gold',
      amount: 100,
      ownerAccountId: state.character.accountId,
      ownerCharacterId: state.character.id,
    },
  ];
  expect(serviceStatus(state, offer).reason).toBeNull();
  state.systems.jobs = [{ id: uuidv7(), offerId: offer.id, readyAtMs: 0, completed: false }];
  expect(serviceStatus(state, offer).reason).toContain('current craft');
  state.vitals!.inCombat = true;
  expect(serviceStatus(state, offer).reason).toBe('Leave combat first');
  state.connection = 'reconnecting';
  expect(serviceStatus(state, offer).reason).toBe('Reconnecting');
});
