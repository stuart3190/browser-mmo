import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import type { Scene } from '@babylonjs/core/scene';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { propShapes } from '@mmo/game-data';
import type { GameData, PropKind } from '@mmo/game-data';
import type { WorldChunk } from '@mmo/schemas';

/**
 * Static world rendering from chunk data. Each chunk is built/disposed independently, which is the
 * hook for real streaming later (load chunks around the camera, dispose far ones). For the demo
 * zone every chunk is loaded at once.
 */
export class WorldView {
  private readonly loaded = new Map<string, () => void>();
  private readonly materials = new Map<string, StandardMaterial>();

  constructor(
    private readonly scene: Scene,
    private readonly gameData: GameData,
  ) {}

  loadZone(zoneId: string): void {
    const zone = this.gameData.zone(zoneId);
    this.scene.clearColor.set(...hexToRgb(zone.environment.ambientColor), 1);
    for (const chunk of this.gameData.chunksForZone(zoneId)) this.loadChunk(chunk, zone.chunkSize);
    // Safe zones get a faint ground ring so players can read where enemies will not follow.
    for (const sz of zone.safeZones) {
      const ring = MeshBuilder.CreateTorus(
        `safe_${sz.id}`,
        { diameter: sz.radius * 2, thickness: 0.4, tessellation: 64 },
        this.scene,
      );
      ring.position.set(sz.center.x, 0.05, sz.center.z);
      ring.material = this.material('#c9b46a');
      ring.isPickable = false;
    }
  }

  /** Shared flat materials (one per colour, not one per prop). */
  private material(hex: string): StandardMaterial {
    let m = this.materials.get(hex);
    if (!m) {
      m = new StandardMaterial(`mat_${hex}`, this.scene);
      m.diffuseColor = Color3.FromHexString(hex);
      m.specularColor = Color3.Black();
      this.materials.set(hex, m);
    }
    return m;
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

    // Props: mesh dimensions come from the same shape table as the gameplay colliders.
    for (const prop of chunk.props) {
      const shape = propShapes[prop.kind].visual;
      let mesh: Mesh;
      let y: number;
      switch (shape.type) {
        case 'cone':
          mesh = MeshBuilder.CreateCylinder(
            prop.id,
            { height: shape.height, diameterTop: 0, diameterBottom: shape.radius * 2 },
            this.scene,
          );
          y = (shape.height / 2) * prop.scale;
          break;
        case 'rock':
          mesh = MeshBuilder.CreateIcoSphere(
            prop.id,
            { radius: shape.radius, subdivisions: 1 },
            this.scene,
          );
          y = shape.radius * 0.5 * prop.scale;
          break;
        case 'box':
          mesh = MeshBuilder.CreateBox(
            prop.id,
            { width: shape.width, height: shape.height, depth: shape.depth },
            this.scene,
          );
          y = (shape.height / 2) * prop.scale;
          break;
        case 'disc':
          mesh = MeshBuilder.CreateDisc(prop.id, { radius: shape.radius }, this.scene);
          mesh.rotation.x = Math.PI / 2;
          y = 0.05;
          break;
      }
      mesh.scaling.setAll(prop.scale);
      mesh.position = new Vector3(prop.position.x, y, prop.position.z);
      mesh.rotation.y = prop.rotationY;
      mesh.material = this.material(PROP_COLORS[prop.kind]);
      mesh.isPickable = false;
      mesh.freezeWorldMatrix();
      disposables.push(mesh);
    }
    // Explicit (non-prop) colliders are drawn as plain walls/posts so nothing blocks invisibly.
    for (const [i, c] of chunk.colliders.entries()) {
      const id = `collider_${key}_${i}`;
      const mesh =
        c.shape === 'box'
          ? MeshBuilder.CreateBox(
              id,
              { width: c.halfWidth * 2, depth: c.halfDepth * 2, height: c.blocksSight ? 3 : 1 },
              this.scene,
            )
          : MeshBuilder.CreateCylinder(
              id,
              { diameter: c.radius * 2, height: c.blocksSight ? 3 : 1 },
              this.scene,
            );
      mesh.position.set(c.x, c.blocksSight ? 1.5 : 0.5, c.z);
      if (c.shape === 'box') mesh.rotation.y = c.rotationY;
      mesh.material = this.material('#6b6258');
      mesh.isPickable = false;
      mesh.freezeWorldMatrix();
      disposables.push(mesh);
    }
    this.loaded.set(key, () => disposables.forEach((d) => d.dispose()));
  }
}

const PROP_COLORS: Record<PropKind, string> = {
  tree: '#265f26',
  rock: '#7d7d80',
  building: '#8c6648',
  fence: '#8a6a3c',
  marker: '#d9c27a',
};

function hexToRgb(hex: string): [number, number, number] {
  const c = Color3.FromHexString(hex);
  return [c.r, c.g, c.b];
}
