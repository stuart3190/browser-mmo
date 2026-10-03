import type { RealtimeClient } from '@mmo/networking';
import type { GameState } from './game-state';

/**
 * Combat intents. The client only asks; the server validates, times swings and decides outcomes.
 * Results come back as combat.state / combat.damage / errors (acked to the request).
 */
export class CombatActions {
  constructor(
    private readonly net: RealtimeClient,
    private readonly state: GameState,
  ) {}

  target(entityId: string | null): void {
    if (entityId === this.state.target.id) return;
    this.net.send('target.set', { entityId });
  }

  toggleAttack(): void {
    if (!this.state.target.id) {
      this.state.toast('Select a target first', 'error');
      return;
    }
    this.net.send('combat.attack', { start: !this.state.target.attacking });
  }

  respawn(): void {
    this.net.send('combat.respawn', {});
  }
}
