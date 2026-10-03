import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import type { Scene } from '@babylonjs/core/scene';
import type { GameData } from '@mmo/game-data';
import type { WorldChunk } from '@mmo/schemas';

/**
 * Static world rendering from chunk data. Each chunk is built/disposed independently, which is the
 * hook for real streaming later (load chunks around the camera, dispose far ones). For the demo
 * zone every chunk is loaded at once.
 */
export class WorldView {
  private readonly loaded = new Map<string, () => void>();

  constructor(
    private readonly scene: Scene,
    private readonly gameData: GameData,
  ) {}

  loadZone(zoneId: string): void {
    const zone = this.gameData.zone(zoneId);
    this.scene.clearColor.set(...hexToRgb(zone.environment.ambientColor), 1);
    for (const chunk of this.gameData.chunksForZone(zoneId)) this.loadChunk(chunk, zone.chunkSize);
  }

  private loadChunk(chunk: WorldChunk, size: number): void {
    const key = `${chunk.zoneId}|${chunk.coord.cx},${chunk.coord.cz}`;
    if (this.loaded.has(key)) return;
    const disposables: { dispose(): void }[] = [];
    const ground = MeshBuilder.CreateGround(
      `ground_${key}`,
      { width: size, height: size },
      this.scene,
    );
    ground.position.set(chunk.coord.cx * size + size / 2, 0, chunk.coord.cz * size + size / 2);
    const mat = new StandardMaterial(`ground_mat_${key}`, this.scene);
    mat.diffuseColor = Color3.FromHexString(chunk.groundColor);
    mat.specularColor = Color3.Black();
    ground.material = mat;
    disposables.push(ground, mat);

    for (const prop of chunk.props) {
      const mesh =
        prop.kind === 'tree'
          ? MeshBuilder.CreateCylinder(
              prop.id,
              { height: 6, diameterTop: 0, diameterBottom: 3 },
              this.scene,
            )
          : prop.kind === 'rock'
            ? MeshBuilder.CreateIcoSphere(prop.id, { radius: 1, subdivisions: 1 }, this.scene)
            : prop.kind === 'building'
              ? MeshBuilder.CreateBox(prop.id, { width: 8, height: 5, depth: 6 }, this.scene)
              : prop.kind === 'fence'
                ? MeshBuilder.CreateBox(prop.id, { width: 10, height: 1, depth: 0.2 }, this.scene)
                : MeshBuilder.CreateDisc(prop.id, { radius: 1.5 }, this.scene);
      mesh.scaling.setAll(prop.scale);
      mesh.position = new Vector3(
        prop.position.x,
        prop.kind === 'tree' ? 3 * prop.scale : prop.kind === 'building' ? 2.5 : 0.5,
        prop.position.z,
      );
      if (prop.kind === 'marker') mesh.rotation.x = Math.PI / 2;
      mesh.rotation.y = prop.rotationY;
      const m = new StandardMaterial(`${prop.id}_mat`, this.scene);
      m.diffuseColor =
        prop.kind === 'tree'
          ? new Color3(0.15, 0.4, 0.15)
          : prop.kind === 'building'
            ? new Color3(0.55, 0.4, 0.3)
            : new Color3(0.5, 0.5, 0.5);
      mesh.material = m;
      mesh.isPickable = false;
      disposables.push(mesh, m);
    }
    this.loaded.set(key, () => disposables.forEach((d) => d.dispose()));
  }
}

function hexToRgb(hex: string): [number, number, number] {
  const c = Color3.FromHexString(hex);
  return [c.r, c.g, c.b];
}
