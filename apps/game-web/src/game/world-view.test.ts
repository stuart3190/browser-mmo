import { expect, it, vi } from 'vitest';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import { getGameData } from '@mmo/game-data';
import { WorldView } from './world-view';

it('streams bounded chunks, unloads distant ground/labels, and cleans up repeated zone changes', () => {
  vi.stubGlobal(
    'OffscreenCanvas',
    class {
      constructor(
        public width: number,
        public height: number,
      ) {}
      getContext() {
        return new Proxy(
          { measureText: () => ({ width: 100 }) },
          { get: (o, key) => Reflect.get(o, key) ?? (() => undefined) },
        );
      }
    },
  );
  const engine = new NullEngine(),
    scene = new Scene(engine);
  void scene.defaultMaterial;
  try {
    const view = new WorldView(scene, getGameData());
    for (const zoneId of [
      'zone.aurelian.greenvale_marches',
      'zone.frostmere.brinebreak',
      'zone.cinderwake.ashstrand',
    ]) {
      view.loadZone(zoneId);
      view.update({ x: 256, z: 400 });
      expect(view.loadedChunkCount).toBeLessThanOrEqual(25);
      expect(scene.getMeshByName(`ground_${zoneId}|4,6`)).not.toBeNull();
      view.update({ x: 2000, z: 1700 });
      expect(view.loadedChunkCount).toBe(25);
      expect(scene.getMeshByName(`ground_${zoneId}|4,6`)).toBeNull();
      expect(scene.meshes.length).toBeLessThan(100);
    }
    view.dispose();
    expect(scene.meshes).toHaveLength(0);
    expect(scene.materials).toHaveLength(1);
    expect(scene.textures).toHaveLength(0);
  } finally {
    scene.dispose();
    engine.dispose();
    vi.unstubAllGlobals();
  }
});
