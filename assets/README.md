# Assets

Source-of-truth game assets. Full pipeline rules: [`docs/art-pipeline/README.md`](../docs/art-pipeline/README.md).

```
assets/
  concepts/      reference & concept art (not shipped to players)
  models/        GLB source models: weapons/<type>/, armor/, creatures/, props/, characters/
  textures/      shared textures (KTX2/PNG), <set>/<name>_<map>.png
  icons/items/   item icons, named by item template id
  audio/         sfx/, music/
  generated/     RAW output of AI/automation tools. Never referenced by the game directly.
                 Promote into the folders above with `pnpm assets:promote` (refuses to overwrite).
```

Every asset file outside `concepts/` needs a sidecar `<file>.meta.json` (see the art pipeline doc).
Run `pnpm assets:check` before committing assets.
