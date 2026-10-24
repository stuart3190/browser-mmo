# Three-watch aftermath — 2026-10-25

- 141 content and 33 frontend tests, repository typecheck/lint/build and content validation pass.
  Unit coverage includes prerequisite/once-only rewards usable by both classes, fresh patrol
  objectives, completion+24h rather than midnight, and display-only timing.
- `earned-continuation/`: 43 successful browser checks. Both previously earned coastal/forest
  actors finish the return-home epilogue and both regional patrols using actual ferries/gates,
  keyboard/touch movement, surveys, fights and NPC turn-ins. Rewards/equip effects, one compass,
  relogin persistence, blocked immediate repeats and exact next timestamps verified.
- `initial-driver-failure/`: 9 successful Warrior epilogue/reward/equip/relogin checks before the
  driver incorrectly waited for ordinary crabs to telegraph. Corrected driver resumes the same
  earned character, with normal camp recovery; no progress reset or player grants.
- `dialogue-review/`: 11 desktop/portrait checks after screenshot review found the long NPC header
  scrolled offscreen. Sticky 44px close control remains visible and actually dismisses the panel.
  Existing PNG browser icon resolves, and journal repeat information remains readable.
- Initial content run 140/141 failed only the old explicit quest-count assertion, corrected to
  include the three new quests. The failure is retained rather than represented as a pass.

Screenshots reviewed. The actors originally began as level-five/prior-Greenvale focused fixtures;
all coastal/forest/aftermath gameplay was subsequently earned. This is not an uninterrupted fresh
level-one-to-six journey. Private simulation cache handling and all gameplay were confined to the
owned disposable iaQjr4 fixture; player records preserved. Production untouched. The built-client review in built-client/ passes 19 desktop/portrait checks without a development
hook: actual saved quests/timers, class reference, map, camera UI and relogin; no failed assets or
page exceptions. This is a local gameplay review, not deployment validation or shipping readiness.
