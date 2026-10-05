# Recorded gameplay evidence — 2026-10-05, Codex

- `two-client-checks.json`: 9 passing continuation/reconnect/turn-in/equip checks after the
  initial two-client party playtest. The original real visits were retained through the authored
  culvert relocation; no quest/progress/reward or movement state was injected to finish.
- `solo-arrival-checks.json`: a third character (previous five quests completed through real play)
  accepted the new follow-on and personally visited the well and **corrected culvert (8, 110)**.
  It remained alive, out of combat, at 188/188 health after waiting twelve seconds.
- `solo-return-checks.json`: 7 passing checks after fixing pointer events on the compass button;
  actual touch log/selection, portrait bounds/hit targets, reconnect, return, turn-in and equip.
- `opening-quest-guidance-checks.json`: 7 passing checks for a fresh level-one Warrior, actual
  Maren acceptance, generic hunt guidance, desktop log selection and 44-pixel touch selection
  targets with the compass in bounds at 390×844 and 844×390.
- `persistence-proof.json`: read-only database evidence for all three completed follow-ons.
  Both surveys stored, exactly one source-identified pendant and a 150-copper ledger credit per
  character; two pendants equipped in the actual UI, one retained in the bag.
- Screenshots show the corrected culvert, return guidance and Maren debrief in touch layouts.

The 25 recorded passing assertions include a repeated culvert wait check. These are multiple
real runs resumed after defects were fixed, not a claim that an unmodified script passed first
try. Initial playtesting caught an unsafe culvert inside a wolf leash, a compass pointer-event
bug, and a premature asynchronous HUD assertion. The culvert was moved beyond all three den
spawn leash radii; the UI and assertion were corrected. A source-only Vite dependency cache
was also refreshed when it retained the old quest registry.

Travel uses ordinary WASD with read-only development observations. Separate actual touch joystick
movement and touch dialogue/selection/turn-in/equip are exercised. SwiftShader plus emulated
viewports proves flow and layout; it is not physical Samsung FPS, battery or thermal evidence.
The development database, previous characters and rewards were preserved. No production
credentials or session tokens are stored here.
