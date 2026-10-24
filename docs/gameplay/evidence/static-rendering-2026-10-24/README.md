# Static rendering qualification — 2026-10-24

Candidatea973ae5 preserves starter geometry while reducing static meshes532→165:32,976vertices,
96,942indices,47materials,18textures and16chunks are unchanged. Counts come from the real
WorldView under NullEngine. Transformed parent/child geometry and repeated world disposal tests
pass, along with all11 frontend tests, fullformat/types/lint and four production builds. All-chunk
production debug exclusion and isolated release-preparation fixtures pass.

Six browser assertions pass in vag71f: all starter chunks on desktop/phone, actual NPC selection
through static scenery, touch movement, landscape canvas and no exceptions. Three screenshots
reviewed. The actual live scene has367 meshes including dynamic actors;165 is the static world
alone. This reduces render submissions; no physical-device FPS or server-capacity claim is made.

Earlier driver attempts selected the first replicated NPC rather than the nearby one; yMgVLM
records projected y=-33.5 outside the canvas. A nearest-NPC debug helper initially used non-existent
position fields and failed in kjhn5d; fixed to read the actual rendered markers, then typechecked.
ZwXpKt failed before login on a blank page. These are retained in their isolated directories.
Read-only nearest-NPC/ray-hit helpers now choose a visible hit and actual mouse input opens dialogue;
no targeting rules or character state are bypassed. The combined78-assertion browser run now passes. Production profile/load remain separate gates.
