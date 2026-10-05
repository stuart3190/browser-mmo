import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import type { Scene } from '@babylonjs/core/scene';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import {
  propShapes,
  keeperOutpostPillars,
  chunkCoordFor,
  chunksInRadius,
  chunkKey,
  clipRoad,
} from '@mmo/game-data';
import type { GameData, PropKind } from '@mmo/game-data';
import type { WorldChunk } from '@mmo/schemas';
import { starterRoads } from './starter-roads';

/**
 * Static world rendering from the validated registry. Atlas regions stream a bounded nearby
 * chunk window and dispose distant geometry/resources. The small original Greenvale enclave
 * retains its existing all-chunk presentation.
 */
export class WorldView {
  private readonly loaded = new Map<string, () => void>();
  private readonly materials = new Map<string, StandardMaterial>();

  constructor(
    private readonly scene: Scene,
    private readonly gameData: GameData,
  ) {}

  private zoneId: string | null = null;
  private centerKey = '';
  private extras: Mesh[] = [];

  dispose(): void {
    for (const dispose of this.loaded.values()) dispose();
    this.loaded.clear();
    const shared = new Set(this.materials.values());
    for (const mesh of this.extras) {
      if (mesh.material && !shared.has(mesh.material as StandardMaterial))
        mesh.material.dispose(true, true);
      mesh.dispose();
    }
    this.extras = [];
    for (const material of this.materials.values()) material.dispose(true, true);
    this.materials.clear();
    this.centerKey = '';
  }

  update(position: { x: number; z: number }): void {
    if (!this.zoneId || this.zoneId === 'zone.greenvale.meadows') return;
    const zone = this.gameData.zone(this.zoneId),
      coord = chunkCoordFor(zone, position),
      key = chunkKey(coord);
    if (key === this.centerKey) return;
    this.centerKey = key;
    const wanted = new Set(chunksInRadius(zone, coord, 2).map((c) => `${zone.id}|${chunkKey(c)}`));
    for (const [key, dispose] of this.loaded)
      if (!wanted.has(key)) {
        dispose();
        this.loaded.delete(key);
      }
    for (const c of chunksInRadius(zone, coord, 2))
      this.loadChunk(this.gameData.worldChunk(zone.id, c), zone.chunkSize);
  }

  get loadedChunkCount(): number {
    return this.loaded.size;
  }

  loadZone(zoneId: string): void {
    this.dispose();
    this.zoneId = zoneId;
    let before = new Set(this.scene.meshes);
    const zone = this.gameData.zone(zoneId);
    this.scene.clearColor.set(...hexToRgb(zone.environment.ambientColor), 1);
    if (zoneId === 'zone.greenvale.meadows') {
      for (const chunk of this.gameData.chunksForZone(zoneId))
        this.loadChunk(chunk, zone.chunkSize);
      before = new Set(this.scene.meshes);
      this.paths();
      for (const node of this.gameData.raw.worldCatalog?.locations.filter(
        (l) => l.zoneId === zoneId && l.kind === 'gate',
      ) ?? [])
        this.sign(
          node.position.x,
          node.position.z,
          node.name,
          'E or World / Travel to follow the road',
        );
    }
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
    this.extras = this.scene.meshes.filter((m) => !before.has(m)) as Mesh[];
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
    this.sign(
      24,
      110,
      'KEEPERS OF THE LAST DOOR',
      '“We closed the door so the spring could dream.”',
    );
    const court = MeshBuilder.CreateGround(
      'keeper_courtyard',
      { width: 15, height: 13 },
      this.scene,
    );
    court.position.set(31, 0.035, 117);
    court.material = this.material('#8f9385');
    court.isPickable = false;
    // Shared footprints keep rendered ruins and authoritative collision in agreement.
    for (const [x, z, h] of keeperOutpostPillars) {
      const pillar = MeshBuilder.CreateCylinder(
        'keeper_broken_pillar',
        { diameter: 1, height: h, tessellation: 6 },
        this.scene,
      );
      pillar.position.set(x!, h! / 2, z!);
      pillar.material = this.material('#798476');
      pillar.isPickable = false;
    }
    const oath = MeshBuilder.CreateBox(
      'keeper_oath_stone',
      { width: 1.6, height: 0.8, depth: 0.6 },
      this.scene,
    );
    oath.position.set(24, 0.4, 110);
    oath.material = this.material('#c4b78b');
    oath.isPickable = false;
    const outpostSeal = MeshBuilder.CreateTorus(
      'keeper_closed_seal',
      { diameter: 3, thickness: 0.16, tessellation: 24 },
      this.scene,
    );
    outpostSeal.position.set(33, 0.07, 118);
    outpostSeal.material = this.material('#dbc783');
    outpostSeal.isPickable = false;
    this.sign(8, 12, 'OLD WELL', '“Two watchers. One door. Keep it sleeping.”');
    this.sign(8, 110, 'SPRING CULVERT', 'The same seal faces inward · do not break it');
    for (const [x, z] of [
      [8, 12],
      [8, 110],
    ]) {
      const ring = MeshBuilder.CreateTorus(
        'spring_watcher',
        { diameter: 2.5, thickness: 0.35, tessellation: 20 },
        this.scene,
      );
      ring.position.set(x!, 0.18, z!);
      ring.material = this.material('#bac4b4');
      ring.isPickable = false;
      ring.freezeWorldMatrix();
      const water = MeshBuilder.CreateDisc(
        'spring_water',
        { radius: 1.1, tessellation: 20 },
        this.scene,
      );
      water.rotation.x = Math.PI / 2;
      water.position.set(x!, 0.04, z!);
      water.material = this.material('#488d95');
      water.isPickable = false;
      water.freezeWorldMatrix();
    }
    this.sign(43, 5, 'STILLWATER STEPS', 'North around the ridge · Tess’s camp');
    this.sign(61, 41, 'TESS’S CAMP', 'Old records · a sleeping spring');
    this.sign(79, 30, 'SILTBOUND SEAL', 'Leave the blue ground mark before the surge');
    // Shallow decorative water and ruined steps do not add invisible collision.
    const pool = MeshBuilder.CreateDisc(
      'stillwater_pool',
      { radius: 6, tessellation: 32 },
      this.scene,
    );
    pool.rotation.x = Math.PI / 2;
    pool.position.set(87, 0.035, 25);
    pool.material = this.material('#488d95');
    pool.isPickable = false;
    pool.freezeWorldMatrix();
    for (let i = 0; i < 8; i++) {
      const step = MeshBuilder.CreateBox(
        'stillwater_step',
        { width: 3, height: 0.12, depth: 0.8 },
        this.scene,
      );
      step.position.set(63 + i * 1.3, 0.06, 38 - i * 1.2);
      step.rotation.y = -0.8;
      step.material = this.material(i % 2 ? '#bac4b4' : '#829b92');
      step.isPickable = false;
      step.freezeWorldMatrix();
    }
    const seal = MeshBuilder.CreateTorus(
      'stillwater_seal',
      { diameter: 6, thickness: 0.2, tessellation: 16 },
      this.scene,
    );
    seal.position.set(75, 0.06, 27);
    seal.material = this.material('#9f987d');
    seal.isPickable = false;
    seal.freezeWorldMatrix();
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
    ground.material = this.material(
      chunk.zoneId === 'zone.greenvale.meadows' ? '#64865b' : chunk.groundColor,
    );
    ground.isPickable = false;
    disposables.push(ground);

    const atlas = this.gameData.raw.worldCatalog;
    if (atlas?.regions.some((r) => r.zoneId === chunk.zoneId)) {
      const bounds = {
        minX: chunk.coord.cx * size,
        minZ: chunk.coord.cz * size,
        maxX: (chunk.coord.cx + 1) * size,
        maxZ: (chunk.coord.cz + 1) * size,
      };
      for (const road of atlas.roads.filter((r) => r.zoneId === chunk.zoneId))
        for (let i = 1; i < road.points.length; i++) {
          const line = clipRoad(road.points[i - 1]!, road.points[i]!, bounds);
          if (!line) continue;
          const path = MeshBuilder.CreateGround(
            `road_${key}_${road.id}`,
            { width: road.width, height: Math.hypot(line.b.x - line.a.x, line.b.z - line.a.z) },
            this.scene,
          );
          path.position.set((line.a.x + line.b.x) / 2, 0.025, (line.a.z + line.b.z) / 2);
          path.rotation.y = Math.atan2(line.b.x - line.a.x, line.b.z - line.a.z);
          path.material = this.material('#ac9c79');
          path.isPickable = false;
          path.freezeWorldMatrix();
          disposables.push(path);
        }
      for (const l of atlas.locations.filter(
        (l) =>
          l.zoneId === chunk.zoneId &&
          Math.floor(l.position.x / size) === chunk.coord.cx &&
          Math.floor(l.position.z / size) === chunk.coord.cz,
      )) {
        const label = MeshBuilder.CreatePlane(
            `label_${l.id}`,
            { width: 12, height: 3 },
            this.scene,
          ),
          texture = new DynamicTexture(
            `name_${l.id}`,
            { width: 512, height: 128 },
            this.scene,
            false,
          );
        texture.drawText(l.name, undefined, 76, 'bold 24px sans-serif', '#fff1cc', '#24342b', true);
        const material = new StandardMaterial(`label_mat_${l.id}`, this.scene);
        material.diffuseTexture = texture;
        material.emissiveColor = Color3.White();
        material.backFaceCulling = false;
        label.position.set(l.position.x, 5, l.position.z);
        label.billboardMode = 7;
        label.material = material;
        label.isPickable = false;
        disposables.push(label, { dispose: () => material.dispose(true, true) });
        if (l.kind === 'port') {
          const basin = MeshBuilder.CreateGround(
            `water_${l.id}`,
            { width: 32, height: 20 },
            this.scene,
          );
          basin.position.set(l.position.x, 0.02, l.position.z - 14);
          basin.material = this.material('#537b8b');
          basin.isPickable = false;
          disposables.push(basin);
          const boat = MeshBuilder.CreateBox(
            `boat_${l.id}`,
            { width: 5, height: 1.5, depth: 11 },
            this.scene,
          );
          boat.position.set(l.position.x + 7, 0.9, l.position.z - 12);
          boat.material = this.material('#876545');
          boat.isPickable = false;
          disposables.push(boat);
        }
      }
      const zone = this.gameData.zone(chunk.zoneId),
        b = zone.bounds;
      for (const [edge, x, z, w, d] of [
        ['west', bounds.minX, bounds.minZ + size / 2, 2, size],
        ['east', bounds.maxX, bounds.minZ + size / 2, 2, size],
        ['south', bounds.minX + size / 2, bounds.minZ, size, 2],
        ['north', bounds.minX + size / 2, bounds.maxZ, size, 2],
      ] as const) {
        if (!(
          (edge === 'west' && chunk.coord.cx === b.minCx) ||
          (edge === 'east' && chunk.coord.cx === b.maxCx) ||
          (edge === 'south' && chunk.coord.cz === b.minCz) ||
          (edge === 'north' && chunk.coord.cz === b.maxCz)
        ))
          continue;
        const cliff = MeshBuilder.CreateBox(
          `cliff_${key}_${edge}`,
          { width: w, height: 8, depth: d },
          this.scene,
        );
        cliff.position.set(x, 3, z);
        cliff.material = this.material('#77766f');
        cliff.isPickable = false;
        disposables.push(cliff);
      }
    }

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
