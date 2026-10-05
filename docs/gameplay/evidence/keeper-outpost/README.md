# Keeper outpost evidence — 2026-10-05, Codex

- `two-client-checks.json`: 17 successful assertions from the actual desktop Warrior/touch Mage
  expedition: personal survey, common enemy and frozen cue, shared kill with one loot stack,
  return compass, reconnect, both personal turn-ins, unique rewards and real filtered-view equips.
  No new progress, rewards, positions or stats were injected. The harness then stopped trying to
  tap Reset behind the existing selected-item sheet in portrait. Its sequence now closes that
  sheet first. This is not a claim the original entire harness exited zero.
- `solo-checks.json`: complete solo Warrior touch run, exit zero, five assertions. Actual touch
  joystick, target/attack/Heavy Strike/dialogue/equip; normal keyboard travel along the route.
  The sentinel was killed alive with ordinary prior gear, and the quest/unique equipped mantle
  persisted. The quest reward advanced this character to level four.
- `inventory-checks.json`: corrected post-playthrough touch UI run, exit zero, ten assertions.
  Close item sheet then Reset, material-pouch filtering/sorting, and measured 44-pixel controls
  entirely within 390×844 and 844×390 viewports. Existing equipped reward remains unique.
- `hud-checks.json`: final desktop layout run, exit zero, three assertions. A fresh character
  accepts the ordinary wolf quest and travels into legitimate targeting range; compass bottom
  60 px is above target top 76 px. Empty search/reset preserve the normal bag grid.
- `persistence-proof.json`: read-only PostgreSQL proof for all three characters. Personal survey
  and shared/solo kill counters, completed/rewarded quest, one bound/source-identified cloak each,
  all equipped. One party kill: 121 XP each, one loot owner. One solo kill: 242 XP, one loot owner.
- Screenshots show the procedural ruined court, actual sector warning, touch victory and inventory
  layouts. The original desktop screenshot exposed compass/target overlap; the final stylesheet
  moves the desktop target frame below the compass, checked by the separate HUD regression.

Previously completed six-quest characters were played in earlier browser runs, not prequalified
by a new-quest grant. Software Chromium/SwiftShader and touch emulation prove flow/layout, not
physical Samsung FPS, battery or thermals. The earlier known loot-toast limitation remains:
merged ore reports the stack total, not this kill's four-ore increment; persistence is correct.
No production credentials or session tokens are included.
