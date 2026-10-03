# Art pipeline

Goal: produce large volumes of consistent stylised-fantasy assets with AI assistance (OpenArt or
other image generation, Meshy, Tripo, Blender automation, manual modelling) **without ever
silently overwriting source assets**.

## Folder layout & naming

```
assets/concepts/<topic>/<name>.png           reference art, not shipped
assets/models/weapons/<type>/<name>.glb      e.g. models/weapons/swords/iron_longsword.glb
assets/models/armor/<type>/<name>.glb
assets/models/creatures/<family>/<name>.glb
assets/models/props/<name>.glb
assets/models/characters/<name>.glb
assets/textures/<set>/<name>_<map>.png       map ∈ albedo, normal, orm, emissive
assets/icons/items/<item-template-id>.png    e.g. icons/items/weapon.sword.iron_longsword.png
assets/audio/sfx|music/<name>.ogg
assets/generated/                            raw tool output (any name), never referenced by the game
```

- File names: lowercase `[a-z0-9]` separated by `.`, `_` or `-`. Icons use the item template ID so
  `ItemTemplate.iconId` / `modelId` resolve mechanically.
- LODs: `<name>.lod1.glb`, `<name>.lod2.glb`, listed in metadata. Thumbnails: `<name>.thumb.png`.

## Formats

- Models: **GLB** (glTF 2.0 binary) for runtime; `.blend` sources allowed next to them.
  glTF conventions: Y-up, metres, +Z forward; origin at ground contact.
- Textures: PNG sources; KTX2/Basis for runtime later. Icons: 256×256 PNG.
- Audio: OGG.

## Metadata sidecar (required outside `concepts/`)

`<file>.meta.json`, validated by `pnpm assets:check`:

```json
{
  "id": "models/weapons/swords/iron_longsword",
  "kind": "model",
  "source": "meshy",
  "author": "studio-name or person",
  "license": "internal",
  "createdAt": "2026-10-03T00:00:00Z",
  "generatedFrom": {
    "file": "assets/generated/meshy_2026-10-03_sword.glb",
    "prompt": "…",
    "seed": "…"
  },
  "lods": [],
  "thumbnail": "iron_longsword.thumb.png"
}
```

## Generated → source promotion

1. Tools write only into `assets/generated/` (temporary renders/exports go to
   `assets/generated/_staging|_renders|_exports/`, which are git-ignored).
2. Review the output, then `pnpm assets:promote assets/generated/<file> <target-under-assets>`.
   It **refuses to overwrite** an existing source asset; `--force` replaces it but keeps a
   timestamped `.bak` copy. It writes a metadata stub that must be completed (the check rejects
   `TODO` author/license).
3. `pnpm assets:check` runs in CI.

## Git

Caches, Blender autosaves (`*.blend1`), temp renders and staging folders are git-ignored. Large
binaries should move to Git LFS before the first real asset batch (not configured yet — decide
LFS vs external asset storage and record it in DECISIONS.md).

## Not built yet

Blender automation (batch import → cleanup → decimate → LOD → export GLB), AI tool integrations,
icon rendering, texture compression, runtime asset manifest/streaming.
