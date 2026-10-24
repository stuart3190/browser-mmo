# Broken Odyssey completion handoff

Updated 2026-10-25 by Codex. Goal ACTIVE. Read AGENTS, MASTER_PLAN, PROGRESS and DECISIONS.
Owner authorizes sustained autonomous gameplay implementation, functional browser tests and verified
commits/push. GAME ONLY: zero performance optimization, benchmarks, capacity tests, infrastructure
investigation, staging or backup planning. Never alter production or immutable releases. Release
safety validation belongs to a separate later phase; do not claim shipping readiness.

## Source and current milestone

Editable source: `/root/browser-mmo`, branch `codex/shippable-completion`, origin
`git@github.com:stuart3190/browser-mmo.git`. Latest gameplay commit `63b0869` pushed (trailwear); functional journey registration follows.
Production initially observed at immutable `2c47b27`; no production mutations in this work.

Class-appropriate trailwear is implemented, verified and pushed as `63b0869`: optional authored
rewards.classItems; shared server questRewardItems for offers/atomic grant; used and unused class/
item/stack validation. Fen supplies Mage the existing Apprentice Robe, keeps Warrior cap. Prior
awards untouched. UI clears selected details when the last inventory/character/bank closes, keeps
selection while another item window remains. Catalog preview text distinguishes current rewards
from previously earned items. Authoring additions documented in docs/content-engine.md.

138 content,28 frontend,8 schema,13 domain tests pass; repository types, lint, production builds/
debug guard and content validation pass. Real level-one Warrior nine-check staged journey and Mage
seven-check fresh journey pass: starter pickup, travel, hides/herbs, turn-in, usable gear, relogin.
Eight desktop/six touch window follow-up checks pass; screenshots reviewed. Evidence:
`gameplay/evidence/class-trailwear-2026-10-25/`. Starter-helper and close-label driver failures retained.
All browser/check controllers stopped. No gameplay failures outstanding in this milestone.

## Recent completed gameplay

| Commit | Delivered | Evidence directory under docs/gameplay/evidence |
| --- | --- | --- |
| `07c4087` | Inspectable quest rewards/shared outfitter previews; opaque NPC dialogue | reward-inspection-2026-10-25 |
| `62ef82b` | Named Cantor root/sweep rhythm, authoritative recovery and dodge geometry | cantor-rhythm-2026-10-24 |
| `09893fc` | Equipped cap/plate/robe/cloak/buckler appearances, normal shop stock | equipment-appearance-2026-10-24 |
| `a395cbb` | Three Elderwood quests, forest art/enemies/boss, necklace, revival and adventure journal | elderwood-living-seal-2026-10-24; adventure-journal-2026-10-24 |
| `358e314` | Practical passage guidance | passage-guidance-2026-10-24 |
| `6aa0342` | Optional combat/reward audio, Settings/Controls | combat-audio-2026-10-24 |
| `660f75e` | Earned Tidewatch weapon commissions, recipe previews, effective health | tidewatch-commissions-2026-10-24 |
| `06fa657` | Class/path/held-weapon appearance and multiplayer replication | player-appearance-2026-10-24 |
| `b6ad7c4` | H/touch quick remedy | quick-remedy-2026-10-24 |
| `45df411` | Four level-five specialisations and free mentor retraining | specialisations-2026-10-24 |
| `8959ce7` | Three Tidewatch coastal quests, shore art/creatures/Bellkeeper and ring | amber-tidewatch-2026-10-24 |
| `229bf55` | Gear wear/broken consequences and paid repair | gear-condition-2026-10-24 |
| `3e7eaa6` | Iron Guard/Frost Nova, status VFX and touch combat HUD | tactical-abilities-2026-10-24 |

Earlier complete Greenvale/Marches story, professions, private Broken Vault solo/party instances,
economy/trade/marketplace, chat/friends/DM/guilds and persistence are documented in PROGRESS.
Preserve them. Atlas regions beyond authored routes, additional classes/paths, guild vault and
broader art remain long-term incomplete; neither these nor shipping readiness are claimed complete.

## Next useful work

1. Continue gameplay independently; the verified trailwear milestone is pushed.
2. Verify integrated fresh Warrior/Mage story/profession/dungeon journeys against the accumulated
   gameplay changes. `scripts/e2e/earned-journeys.cjs` already orchestrates ordinary player actions,
   with durable stage results/resume. It currently ends at the Vault, not the new chapters. Use a
   separate editable test checkout with its own dependencies/fixture for the long run so main
   gameplay source can continue evolving without reloading its browser.
3. Extend earned continuity into coast/forest without level/quest grants. Current coast.cjs creates
   level-five/prior-story fixtures; add explicit existing-user mode and normal return to Maren from
   the Marches. Forest.cjs already reads earned Tidewatch weapon owners. Do not mislabel separate
   staged continuations as one uninterrupted level-one-to-six playthrough.
4. Fix concrete player-facing findings from these journeys; prioritize quest clarity, encounter
   pacing, meaningful rewards, responsive controls and authored exploration. Avoid repeated CI/load
   checks or revisiting old external release gates.

## Test fixtures and commands

- Own PG17 integration fixture port55441; private ignored `.env` points to bo_completion_dev/test.
  Domain global setup DROPS/remigrates bo_completion_test. Verify the URL is loopback:55441 and
  `/bo_completion_test` before running it; never point it at bo_completion_dev or an earned fixture.
- `QUAL_BROWSER_SUITES=<explicit gameplay suites> bash scripts/qualify-local.sh --skip-checks` creates
  a disposable loopback fixture. Never invoke its default/full/production/backup/load qualification.
  Registered recent suites: trailwear, reward-preview, cantor, armor, journal, forest, forest-recovery,
  coast, guidance, audio, appearance, remedy, specialisations, repair, tactical.
- Chrome `/usr/bin/google-chrome`; Playwright `/opt/aria-browser/node_modules/playwright`.
- Freeze runtime source during an active same-checkout browser run. Vite reload interrupts combat.
- Long jobs: Python subprocess.Popen with start_new_session=True, DEVNULL stdin and explicit log.
  Controllers trap cleanup of only their own service process groups/PG. Avoid global process kills.
- Run lint then build sequentially, `NODE_ENV=production pnpm build`. Inspect screenshots, retain
  failures honestly, `git diff --check`, normalize archived text trailing whitespace before commit.
- Retained **4YTXAT** under `/tmp/brokenodyssey-qualification.4YTXAT`: genuine level-one trailwear
  Warrior `trailw_mvmyhrzw`, Mage `trailm_mvmyrkcm`; both completed Fen, equipped cap/robe near Fen.
  Proofs: trailwear-warrior-resume, trailwear-mage, trailwear-warrior-panels, trailwear-mage-panels.
  Final runner `/tmp/bo-trailwear-final-run.sh` now resumes earned actors; logs
  `/tmp/bo-trailwear-panels.log` and `/tmp/bo-trailwear-final-checks.log`. All stopped.
- Retained **iaQjr4**: both coastal/forest actors level six, earned Tidewatch weapons/Tideglass Seal/
  Heartwood Knot, at Tamsin. Initial fixtures began level five; their new chapters were earned.
  Its old test simulation images were privately archived/reconstructed for changed content only
  after checking no pending rewards; earned player rows preserved. Never apply that to production.
- Retained **WbH0Ok**: ten-check outfitter regression after shared preview refactor. **3OHuI9**:
  purchased armour actors and folded-cloak proof. Do not overwrite earned fixture rows.

## Known verification limitation

One dialogue visual follow-up displayed the recoverable game load-failure screen. Initial failure
had no diagnostic; DEV-only bootstrap console error logging was added. Diagnostic rerun passed
seven dialogue checks and later fresh trailwear journeys also passed. Cause remains unknown;
do not claim fixed. Evidence is retained under reward-inspection-2026-10-25/dialogue-startup-failure.
If it recurs, capture the actual startup error and fix the gameplay client; no speculative tuning.
Physical phone/GPU and live release validation remain separate, never blockers to gameplay work.

## Temporary scripts

All generators used so far are integrated and OBSOLETE; do not rerun them over corrected source:
`/tmp/bo-reward-preview/*`, `/tmp/bo-class-rewards.py`, `/tmp/bo-trailwear-driver.py`,
`/tmp/bo-class-reward-unused-validation.py`, `/tmp/bo-trailwear-finish.py`,
`/tmp/bo-cantor-pattern.py`, `/tmp/bo-cantor-driver.py`, `/tmp/bo-shop-fit.py`, and older
forest/journal/audio/spec draft generators. No pending unapplied drafts remain.

## Active work after 3f1e538 (2026-10-25)

Regional chart verified: 31 frontend tests, repository types/lint/build and final UI checks pass.
21 ordinary level-one desktop/portrait journey checks, 21 layout follow-up and 15 selection checks
pass; screenshots reviewed. Evidence regional-chart-2026-10-25. Map browser/check controllers stopped.
Retained fixture SpSdTx. Main still has prepared earned-chapter continuation drivers (not yet browser
verified). Next useful UI: touch-readable class ability handbook in Character, with current spec
recovery/reduction from effectiveAbility. Drafts /tmp/bo-CombatHandbook.tsx and /tmp/bo-handbook.cjs
are NOT applied yet. Integrate/test only after committing the chart.

Independent full earned story/professions/Vault run at `/tmp/bo-earned-gameplay-20261025` detached
3f1e538, own installed workspace dependencies. Controller PID1097045,
`/tmp/bo-integrated-earned-browser.log`, fixture `/tmp/brokenodyssey-qualification.ACsH5X`.
Read earned-journeys/result.json and per-stage run.log. Users journeyw_mvmz9wvw/journeym_mvmz9wvw;
Warrior story currently active. Main changes cannot reload this checkout. Do not mutate runtime
there during its run. Continue actual earned coast/forest later with new explicit-user driver
modes; use separate output directories, retained fixture and EARNED_FROM_STAGE=earned-tidewatch,
EARNED_CHAPTERS=1 plus both EARNED_*_USER values. Main scripts are prepared but not yet verified.
