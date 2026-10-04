import { createContext, useContext, useSyncExternalStore } from 'react';
import type { GameData } from '@mmo/game-data';
import type { GameState } from '../state/game-state';
import type { CombatActions } from '../state/combat-actions';
import type { ItemActions } from '../state/item-actions';
import type { AnalogInput } from '../game/analog-input';

export interface Controls {
  /** Joystick output, read by the player controller every frame. */
  analog: AnalogInput;
  interact: () => void;
  targetNearest: () => void;
  /** Zone the character is in (null before the first join). */
  zoneId: () => string | null;
  /** Local player position/heading (predicted), null before the first join. */
  position: () => { x: number; z: number; rotationY: number } | null;
  /** Replicated entities currently known to the client (interest-managed by the server). */
  markers: () => { id: string; kind: string; x: number; z: number; dead: boolean }[];
}

export interface UiDeps {
  state: GameState;
  actions: ItemActions;
  combat: CombatActions;
  gameData: GameData;
  controls: Controls;
}

export const UiContext = createContext<UiDeps | null>(null);

/** Access UI dependencies and re-render whenever game state changes. */
export function useGame(): UiDeps {
  const deps = useContext(UiContext);
  if (!deps) throw new Error('UiContext missing');
  useSyncExternalStore(deps.state.subscribe, deps.state.getRevision);
  return deps;
}
