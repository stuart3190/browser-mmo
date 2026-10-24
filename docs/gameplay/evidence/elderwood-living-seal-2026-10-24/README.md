# Elderwood living-seal verification

Source branch `codex/shippable-completion`; no production changes. The new chapter continues the
actually earned Tidewatch Warrior and Mage from `iaQjr4`, preserving character, quest and item rows.
Old-content simulation checkpoints in this disposable test database were archived privately and
refreshed after checking no pending kill rewards. No new quest credit, item, XP, health or position
was injected. This is staged continuation evidence, not a fresh uninterrupted level-one run.

Initial Warrior: actual boats, first two quests/surveys and both spitter kills pass. The Cantor
attempt stopped on the test driver's dodge waypoint deadline while alive. Failure JSON/screenshot
retained. Relaxed waypoint tolerance still finishes outside the warning's radius. Screenshot review
also found notices covering warning text; transient notices now hide during a targeted windup and
remain in the Journal. Compass prose corrected to south-east.

Follow-up Warrior: Cantor victory with ten dodge responses, three completed quests, earned level
six, necklace equip/maximum-health increase and one equipped reward after relogin pass. Mage
completes both spitters, all personal surveys and Cantor (seven dodge responses), all quests and
level six. Its immediate post-equip health assertion raced the separate vitals update; failure
screenshot already shows the bonus. Same earned Mage resumed through real unequip/re-equip and
relogin: all six final checks pass, with exactly one equipped reward. Navigation uses real keyboard
input; the Mage uses touch combat, interaction and panel buttons at landscape/portrait sizes.

The short Briar warning originally expired while a screenshot was being saved, racing a later CSS
assertion. The corrected check observes cue and notice visibility together. Both original failed
runs are retained. A temporary status-clock edit broke the UI during follow-up; lint and browser
errors caught it, the unrelated status timer was restored, and final verification follows below.
The original seven real death/recovery checks pass. Final follow-up passes nine checks including
the first rendered countdown (3s), cleared target on revival, preserved XP/item identities and
safe camp relogin. Screenshots inspected: opaque revival overlay keeps floating damage below it.
Final forest/combat regression tests: 15 pass; final frontend suite: 27 pass. Lint, repository
and scripts typechecks, production builds/debug guard pass. `revival-final/` is from `2vuS1k`.
No production or performance/capacity work occurred; release readiness is not claimed.

133 content, 25 frontend, four focused world tests and one database chapter test pass. The latter
requires personal surveys, rejects early turn-ins, races reward claims and checks exactly one bound
reward plus earned level six. World tests cover fixed/dodgeable/recoverable strikes and nearby
forest/coastal respawns. Repository lint, typecheck, production builds/debug guard and content
validation pass. Earlier five root-wound regression checks also passed.
