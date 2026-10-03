import { createContext, useContext, useSyncExternalStore } from 'react';
import type { GameData } from '@mmo/game-data';
import type { GameState } from '../state/game-state';
import type { ItemActions } from '../state/item-actions';

export interface UiDeps {
  state: GameState;
  actions: ItemActions;
  gameData: GameData;
}

export const UiContext = createContext<UiDeps | null>(null);

/** Access UI dependencies and re-render whenever game state changes. */
export function useGame(): UiDeps {
  const deps = useContext(UiContext);
  if (!deps) throw new Error('UiContext missing');
  useSyncExternalStore(deps.state.subscribe, deps.state.getRevision);
  return deps;
}
