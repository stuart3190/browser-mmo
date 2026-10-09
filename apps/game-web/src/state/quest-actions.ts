import type { RealtimeClient } from '@mmo/networking';
import type { GameState } from './game-state';

/**
 * NPC / quest intents. The client only asks: the server checks the NPC, range, quest state and
 * objectives, then answers with npc.dialogue, quest.log, quest.completed or an error.
 */
export class QuestActions {
  constructor(
    private readonly net: RealtimeClient,
    private readonly state: GameState,
  ) {}

  talk(entityId: string): void {
    this.net.send('npc.interact', { entityId });
  }

  accept(questId: string): void {
    const d = this.state.dialogue;
    if (d) this.net.send('quest.accept', { entityId: d.entityId, questId });
  }

  turnIn(questId: string): void {
    const d = this.state.dialogue;
    if (d) this.net.send('quest.turn_in', { entityId: d.entityId, questId });
  }

  service(offerId: string): void {
    const d = this.state.dialogue;
    if (d)
      this.net.send('npc.service', {
        entityId: d.entityId,
        offerId,
        requestId: crypto.randomUUID(),
      });
  }

  sell(itemId: string, expectedVersion: number): void {
    const d = this.state.dialogue;
    if (d)
      this.net.send('npc.sell', {
        entityId: d.entityId,
        itemId,
        expectedVersion,
        requestId: crypto.randomUUID(),
      });
  }
  inspectSystems(): void {
    this.net.send('systems.inspect', {});
  }
  dungeon(action: 'enter' | 'exit' | 'reset'): void {
    this.net.send('dungeon.command', { action });
  }
  finishCraft(jobId: string): void {
    this.net.send('craft.finish', { jobId });
  }
  useItem(itemId: string): void {
    this.net.send('consumable.use', { itemId, requestId: crypto.randomUUID() });
  }
  closeDialogue(): void {
    this.state.update((s) => (s.dialogue = null));
  }
}
