# Amber Coast gameplay evidence — 2026-10-24

Scope: three authored quests, travel through existing Marches/boat links, personal survey marks,
Glassback Crabs, Drowned Bellkeeper, exactly-once final ring reward and persistence. No production
changes, capacity tests or release-readiness claim.

- `initial-both-class-run.json`: retained honest result of the first substantive both-class run.
  Warrior completed all three quests, equipped its earned ring and relogged successfully. Mage
  travelled, completed the crab stage and defeated the boss, then the test driver's long diagonal
  return path clipped a wreck prop. The overall run failed; do not describe it as a complete pass.
- Follow-up: keyboard driver now follows short waypoints along the collision-checked route.
  `mage-proof.json` passes all eleven checks, including final turn-in, ring equip and relogin.
  Six boss warnings were escaped. Latest Mage screenshots include the presentation fixes.
- `visual-proof.json`, desktop/portrait/landscape shore images: focused fixtures at the shore verify
  the follow-up rendering fixes. Giant opaque landmark billboards were replaced with compact
  transparent labels. Screenshots inspected. These visual fixtures do not prove earned progression.
- Warrior images show the earlier labels; keep them as encounter/quest evidence. Latest label
  appearance is in the shore visual images. The boss hint is now generic to all cleaving enemies,
  and changing target clears stale combat feedback.

Unit/integration proof: 126 content tests, 80 world simulation tests, 13 frontend tests and the
chapter domain transaction test pass. Content validator includes the new pack; typechecking, lint
and production build pass. Tests cover path collision, boss telegraph/guard/root behavior, old
checkpoint additions, personal exploration and concurrent final reward claims. The renderer test
covers new creature silhouettes and preservation of authored boss scale during idle animation.

Browser fixtures start at level five with the prior Greenvale closure recorded in the disposable
qualification DB. All new chapter actions use real travel, movement, combat and quest UI. This is
not an earned level-one-to-five journey. Existing earned characters and all live data are preserved.
