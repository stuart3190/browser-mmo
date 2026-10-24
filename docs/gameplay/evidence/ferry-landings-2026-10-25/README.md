# Ferry landings — 2026-10-25

Existing generic boat boxes now render as moored open skiffs with pointed hulls, planking,
benches, oars, flags, ropes and low landing boards. Paint distinguishes forest/coast/inland ports.
The art uses the existing chunk lifecycle/materials. Travel nodes, authority, collision and
walkable-shallows behavior are unchanged; this does not add player-controlled boats or boarding.

33 frontend tests and repository typechecking/lint/build pass. Eleven actual browser checks pass
with both previously earned actors: Pinewatch→Willow Quay→Tidewatch→Willow Quay→Pinewatch, ordinary
walking and travel UI only. Equipment identity and completed Three-watch story survive the loop.
Desktop, touch landscape and portrait screenshots reviewed. No page exceptions. Isolated owned
fixture; no player grants/reset, production changes, performance or capacity work.
