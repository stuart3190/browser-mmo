# 0002 — Babylon.js for the browser client

Status: Accepted · Date: 2026-10-03

## Context

We need a serious browser 3D engine for a long-lived MMO: large scenes, many entities, asset
streaming, LODs, WebGL2 now and WebGPU later. Unity is excluded. Candidates: Babylon.js, Three.js.

## Decision

**Babylon.js** (`@babylonjs/core`, ES module deep imports for tree-shaking).

| Need       | Babylon.js                                                                                                                          | Three.js                                                    |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Scope      | Full engine: scene graph, cameras, input, collisions, physics plugins, animation, GUI, asset containers, LOD, instancing, inspector | Rendering library; most game systems are third-party or DIY |
| WebGPU     | First-class `WebGPUEngine`, same API as WebGL engine, WGSL core shaders                                                             | `WebGPURenderer` maturing; node-material based              |
| TypeScript | Written in TS                                                                                                                       | Types via `@types/three` (good but external)                |
| Stability  | Strong backwards-compat policy across majors                                                                                        | Frequent breaking changes (r-releases)                      |
| glTF       | Official loader incl. extensions, Draco/Meshopt                                                                                     | Official loader, excellent                                  |
| Tooling    | Inspector, Playground, Node Material Editor                                                                                         | Large ecosystem, many examples                              |
| Bundle     | Larger, mitigated with deep imports + separate chunk                                                                                | Smaller                                                     |

For a multi-year MMO the batteries-included engine, the stability policy and the identical
WebGL/WebGPU API outweigh Three.js's smaller bundle and bigger example ecosystem.

## Alternatives considered

Three.js (above); PlayCanvas (engine is good but editor-centric workflow); custom WebGPU renderer
(far too much work).

## Consequences

- Gameplay code depends on `AbstractEngine`, never a specific backend.
- WebGL2 is the verified default. WebGPU is wired (`?renderer=webgpu`) but **not yet verified** in a
  real browser with GPU. Making WebGPU the default needs testing first.
- The engine chunk is large (~MBs); split into its own long-cached chunk.
