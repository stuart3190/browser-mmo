/**
 * Prop shapes: ONE table that drives both the placeholder visual mesh (client) and the
 * authoritative collider (server + client prediction). Changing a prop's size here changes what
 * players see and what blocks them, together. Real models (art pipeline) must keep their
 * footprint consistent with the collider defined here.
 */
export type PropKind = 'tree' | 'rock' | 'building' | 'fence' | 'marker';

export interface PropShape {
  visual:
    | { type: 'cone'; height: number; radius: number }
    | { type: 'rock'; radius: number }
    | { type: 'box'; width: number; height: number; depth: number }
    | { type: 'disc'; radius: number };
  collider:
    | { shape: 'circle'; radius: number; blocksSight: boolean }
    | { shape: 'box'; halfWidth: number; halfDepth: number; blocksSight: boolean }
    | null;
}

export const propShapes: Record<PropKind, PropShape> = {
  // Collider is the trunk/core, a bit smaller than the visual canopy base so players can brush past.
  tree: {
    visual: { type: 'cone', height: 6, radius: 1.5 },
    collider: { shape: 'circle', radius: 0.8, blocksSight: true },
  },
  rock: {
    visual: { type: 'rock', radius: 1 },
    collider: { shape: 'circle', radius: 1, blocksSight: true },
  },
  building: {
    visual: { type: 'box', width: 8, height: 5, depth: 6 },
    collider: { shape: 'box', halfWidth: 4, halfDepth: 3, blocksSight: true },
  },
  // Low fence: blocks movement, not sight (you can attack over it but not walk through it).
  fence: {
    visual: { type: 'box', width: 10, height: 1, depth: 0.2 },
    collider: { shape: 'box', halfWidth: 5, halfDepth: 0.15, blocksSight: false },
  },
  marker: { visual: { type: 'disc', radius: 1.5 }, collider: null },
};

/** Radius used for player movement collision (client prediction and server validation). */
export const PLAYER_COLLISION_RADIUS = 0.45;
/** Radius used for enemy navigation and movement. */
export const ENEMY_COLLISION_RADIUS = 0.6;
