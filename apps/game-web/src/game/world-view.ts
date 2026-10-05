import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import type { Scene } from '@babylonjs/core/scene';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { propShapes } from '@mmo/game-data';
import type { GameData, PropKind } from '@mmo/game-data';
import type { WorldChunk } from '@mmo/schemas';
import { starterRoads } from './starter-roads';

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
    this.paths();
    this.scene.fogMode = 3;
    this.scene.fogColor = Color3.FromHexString('#b4ccbf');
    this.scene.fogStart = 65;
    this.scene.fogEnd = 145;
    // Safe zones get a faint ground ring so players can read where enemies will not follow.
    for (const sz of zone.safeZones) {
      const ring = MeshBuilder.CreateTorus(
        `safe_${sz.id}`,
        { diameter: sz.radius * 2, thickness: 0.12, tessellation: 64 },
        this.scene,
      );
      ring.position.set(sz.center.x, 0.05, sz.center.z);
      ring.material = this.material('#c9b46a');
      ring.isPickable = false;
    }
  }

  /** Visible roads follow the clear corridors already reserved by authoritative world data. */
  private paths(): void {
    const road = (ax: number, az: number, bx: number, bz: number, width: number) => {
      const path = MeshBuilder.CreateGround(
        'greenvale_path',
        { width, height: Math.hypot(bx - ax, bz - az) },
        this.scene,
      );
      path.position.set((ax + bx) / 2, 0.025, (az + bz) / 2);
      path.rotation.y = Math.atan2(bx - ax, bz - az);
      path.material = this.material('#a99972');
      path.isPickable = false;
      path.freezeWorldMatrix();
    };
    for (const segment of starterRoads) road(...segment);
    const square = MeshBuilder.CreateDisc(
      'village_square',
      { radius: 10, tessellation: 32 },
      this.scene,
    );
    square.rotation.x = Math.PI / 2;
    square.position.y = 0.04;
    square.material = this.material('#b0a486');
    square.isPickable = false;
    this.sign(4, 25, 'NORTHWOOD', 'Wolf dens · follow the road');
    this.sign(27, 4, 'EASTERN ROCKS', 'Beyond the stone ridge');
    this.sign(-12, -15, 'THE HOLLOW', 'South-west hunting trail');
    this.sign(8, -16, 'THE OLD ARMOURY', 'Take a sword · open Bag to equip');
    this.sign(-6, 8, 'ELDER MAREN', 'Speak with E · Wolves at the Edge');
    this.sign(-5, -97, 'OLD WAYSTONE', 'A place to begin again');
    this.sign(-23, -91, 'THE PALE TRAIL', 'Claw marks lead west');
    this.sign(-43, -94, 'BROKEN ROOTS', 'A low growl from the Hollow');
    this.sign(-74, -95, 'THE ROOT-WOUND', 'Violet roots lead to the broken ward');
    this.sign(-96, -86, 'BROKEN WARD', 'Stone shelters from its light');
    // The real boulder north of the ward provides server-authoritative line-of-sight cover.
    for (let i = 0; i < 13; i++) {
      const root = MeshBuilder.CreateBox(
        'wound_root',
        { width: 0.18, height: 0.12, depth: 2.5 },
        this.scene,
      );
      const t = i / 12;
      root.position.set(-62 - t * 31, 0.1, -94 + Math.max(0, t - 0.4) * 17);
      root.rotation.y = -0.7;
      root.material = this.material(i % 2 ? '#a085bd' : '#554161');
      root.isPickable = false;
      root.freezeWorldMatrix();
    }
    const ward = MeshBuilder.CreateTorus(
      'broken_ward',
      { diameter: 5, thickness: 0.25, tessellation: 12 },
      this.scene,
    );
    ward.position.set(-93, 0.08, -82);
    ward.material = this.material('#846a9c');
    ward.isPickable = false;
    ward.freezeWorldMatrix();
    // Non-blocking story dressing: preserve all authoritative terrain/colliders.
    for (const [x, z] of [
      [-15, -92],
      [-25, -90],
      [-34, -91],
      [-45, -93],
      [-51, -94],
    ]) {
      const stone = MeshBuilder.CreateIcoSphere(
        'trail_stone',
        { radius: 0.4, subdivisions: 1 },
        this.scene,
      );
      stone.position.set(x!, 0.12, z!);
      stone.scaling.y = 0.45;
      stone.material = this.material('#d0c3a2');
      stone.isPickable = false;
      stone.freezeWorldMatrix();
    }
    for (let i = 0; i < 5; i++) {
      const root = MeshBuilder.CreateBox(
        'scarred_root',
        { width: 0.25, height: 0.16, depth: 4 },
        this.scene,
      );
      root.position.set(-61 + i * 1.6, 0.08, -96);
      root.rotation.y = i * 0.7;
      root.material = this.material(i % 2 ? '#846a9c' : '#4e4539');
      root.isPickable = false;
      root.freezeWorldMatrix();
    }
  }

  private sign(x: number, z: number, title: string, subtitle: string): void {
    const board = MeshBuilder.CreatePlane(`sign_${title}`, { width: 5, height: 1.25 }, this.scene);
    board.position.set(x, 2.5, z);
    board.billboardMode = 7;
    board.isPickable = false;
    const texture = new DynamicTexture(
      `sign_${title}`,
      { width: 512, height: 128 },
      this.scene,
      false,
    );
    const c = texture.getContext() as CanvasRenderingContext2D;
    c.fillStyle = '#263d36';
    c.fillRect(0, 0, 512, 128);
    c.strokeStyle = '#c6ac76';
    c.lineWidth = 6;
    c.strokeRect(4, 4, 504, 120);
    c.textAlign = 'center';
    c.fillStyle = '#f1dfb0';
    c.font = 'bold 30px Georgia';
    c.fillText(title, 256, 49);
    c.fillStyle = '#d2d9cb';
    c.font = '22px sans-serif';
    c.fillText(subtitle, 256, 91);
    texture.update();
    const mat = new StandardMaterial(`sign_${title}`, this.scene);
    mat.diffuseTexture = texture;
    mat.emissiveColor = new Color3(0.45, 0.45, 0.45);
    mat.specularColor = Color3.Black();
    mat.backFaceCulling = false;
    board.material = mat;
  }

  /** Shared flat materials (one per colour, not one per prop). */
  private material(hex: string): StandardMaterial {
    let m = this.materials.get(hex);
    if (!m) {
      m = new StandardMaterial(`mat_${hex}`, this.scene);
      m.diffuseColor = Color3.FromHexString(hex);
      m.specularColor = Color3.Black();
      if (hex === '#64865b') {
        const texture = new DynamicTexture(
          `surface_${hex}`,
          { width: 256, height: 256 },
          this.scene,
          true,
        );
        const ctx = texture.getContext() as CanvasRenderingContext2D;
        ctx.fillStyle = '#dddddd';
        ctx.fillRect(0, 0, 256, 256);
        let seed = 42;
        const random = () => {
          seed = (seed * 1664525 + 1013904223) >>> 0;
          return seed / 4294967296;
        };
        for (let i = 0; i < 600; i++) {
          ctx.fillStyle = i % 2 ? '#c7c7c7' : '#eeeeee';
          const x = random() * 256,
            y = random() * 256;
          if (hex === '#64865b') {
            ctx.fillRect(x, y, 1, 3 + random() * 6);
          } else {
            ctx.fillRect(x, y, 4 + random() * 9, 3 + random() * 6);
          }
        }
        texture.update();
        texture.uScale = 8;
        texture.vScale = 8;
        m.diffuseTexture = texture;
      }
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
    ground.material = this.material('#64865b');
    ground.isPickable = false;
    disposables.push(ground);

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
      // Dressing stays inside the existing collision footprint; no invisible new obstacles.
      const detail = (
        name: string,
        w: number,
        h: number,
        d: number,
        x: number,
        yy: number,
        z: number,
        color: string,
      ) => {
        const child = MeshBuilder.CreateBox(
          `${prop.id}_${name}`,
          { width: w, height: h, depth: d },
          this.scene,
        );
        child.parent = mesh;
        child.position.set(x, yy, z);
        child.material = this.material(color);
        child.isPickable = false;
        return child;
      };
      if (prop.kind === 'building') {
        for (const sign of [-1, 1]) {
          const roof = detail('roof', 4.9, 0.25, 6.5, sign * 1.9, 3.25, 0, '#714a45');
          roof.rotation.z = -sign * 0.5;
          detail('window', 1.1, 1.4, 0.08, sign * 2.5, 0.1, -3.03, '#e2bb70');
          detail('beam', 0.2, 5, 0.2, sign * 3.85, 0, -3, '#443b31');
        }
        detail('door', 1.2, 2.6, 0.08, 0, -1.2, -3.03, '#403e32');
      } else if (prop.kind === 'tree') {
        detail('trunk', 0.75, 2.5, 0.75, 0, -1.75, 0, '#655441');
      } else if (prop.kind === 'fence') {
        for (const x of [-4.7, 0, 4.7]) detail('post', 0.3, 1.6, 0.3, x, 0.1, 0, '#68513a');
      }
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
