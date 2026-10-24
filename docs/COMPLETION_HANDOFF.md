# Broken Odyssey completion handoff

Updated 2026-10-24 by Codex. This is the concise working checkpoint; historical proof stays in
PROGRESS.md. The owner's current instruction is sustained end-to-end completion, preserving
working systems, production uptime, credentials and player data. Do not stop at a feature milestone.

## Source and safety boundaries

- Editable source: `/root/browser-mmo`, branch `codex/shippable-completion`.
- Remote: `git@github.com:stuart3190/browser-mmo.git`. Fetched main and deployed release both match
  `2c47b27a38f0bc74f3a7192f713775c3a9361729`. The initially sparse checkout was simply stale.
- `/srv/brokenodyssey/current` points to an immutable release. Never edit it in place.
- Live API/realtime/web were active at discovery. Production PostgreSQL is port **55440**.
- Disposable development/test PostgreSQL created for this work: **55441**, loopback only,
  `/tmp/brokenodyssey-completion-pg`; databases `bo_completion_dev` and `bo_completion_test`.
  Repository `.env` is private and ignored. Never point tests at the production cluster.
- Local development endpoints: API **4471**, realtime **4472**, browser **5180**.
- No production service changes, production database writes, resets or deployment performed.
  Public deployment needs separate explicit authorization if unsafe; prepare and verify first.

## Completion checklist

- [x] Locate source history, compare deployed revision, recover editable checkout on feature branch.
- [x] Read AGENTS, master plan, progress and architecture history; preserve existing implementation.
- [x] Install locked dependencies and provision an independent disposable PostgreSQL cluster.
- [x] Baseline aggregate stopped on a fixture name collision (88/89 domain cases); fixed in
      `2969503`. Corrected full feature verification passed: `/tmp/bo-trade-verify-final.log`.
- [x] Direct trading: revision-bound review/confirmation, atomic items/currency, concurrency proof,
      usable desktop/touch UI and real two-player browser checks.
- [ ] Social communication/friends and group usability over existing parties.
- [x] Player-facing marketplace access over existing authoritative marketplace.
- [ ] Combat/class/balance and persistence audit; fix verified gaps, including loot feedback.
- [ ] Responsive presentation, controls, onboarding and screenshot-based browser review.
- [ ] Complete playable region/quest/boss journey for both classes, with earned progression.
- [ ] Durable wear/broken-equipment/repair if implemented as a coherent system.
- [ ] Repeatable isolated smoke/e2e runner and operational release readiness.
- [ ] Final full verification, browser evidence, deployment review and honest remaining limitations.

## Current findings and next actions

The game already has authoritative combat, Warrior/Mage abilities, seven Greenvale story quests,
five Marches continuation quests, side quests/daily contract, five continent travel, private Broken
Vault runs, parties/shared rewards, gathering/professions/timed crafting, consumables, inventory,
equipment, vaults and a backend marketplace. Most outer regions remain sparse greyboxes. Direct
trading and several social systems are absent. The checklist has stale dungeon/magic/next-task
entries; reconcile them only against fresh verification, preserving the historical record.

First implementation: durable, revisioned direct trade proposals using existing item instances,
ownership rules, character locks, wallets, provenance and atomic transactions. Offers will not
remove items while merely negotiating; final confirmation must revalidate the exact reviewed
item versions, ownership, binding, funds and destination capacity. Both confirmations refer to the
same offer revision. No client-owned outcomes and no second item/economy architecture.

Trading and its isolated browser runner are committed and pushed as `5b546e9`. Full verify passed:
format/lint/types, 232 unit tests, realtime 72, API 9, domain 99, four builds, production debug guard.
Assets/content validation pass. Evidence is archived under `docs/gameplay/evidence/trading-2026-10-24`.
Runner `bash scripts/qualify-local.sh --skip-checks` passed nine browser assertions on its own
cluster and stopped its own processes. FullChecks=false for that runner pass; aggregate is separate.
Keep the development stack (4471/4472/5180) available for next milestones.
Chat implementation verified: protocol 8, world 10, gateway party 2 cases, ten three-player browser
checks, format/lint/types/build. Evidence: `docs/gameplay/evidence/social-2026-10-24`.
Marketplace implementation now verified: 20 marketplace/trade domain tests, one HTTP case,
eight two-player browser checks, format/lint/types/build. Evidence in
`docs/gameplay/evidence/marketplace-2026-10-24`. Current checkpoint is ready to commit.
Restore fixture fixed and verified locally; evidence:
`docs/hardening/evidence/restore-2026-10-24`. Frozen historical SQL fixture preserves seven tables
through 0005 -> current, then current gameplay dump/restore deep-compares 13 tables including
pending/completed trade, revokes sessions and refuses occupied restore. Only own random databases
are cleaned up. Script types/lint pass. Production unchanged.
Restore fix committed/pushed as `2c1b509`; marketplace checkpoint `c011828`; chat `0679fc7`.
Full `scripts/qualify-local.sh` is RUNNING from detached worktree
`/tmp/bo-qualification-source-2c1b509`, session **13269**, outer log
`/tmp/bo-combined-qualification.log`. Offline locked dependency installation succeeded. This runs full aggregate,
backup/restore, assets/content and trading/marketplace/social browsers. Continue friends/DM in
main editable checkout while the detached qualification snapshot stays fixed. Record its path,
session/log and result here; monitor hosted CI. Do not stop at this checkpoint.
Browser skill: game-studio/game-playtest; use existing Playwright scripts and inspect screenshots.
No hosted CI, production capacity, off-host recovery or physical-phone performance claim yet.

## Live checkpoint while qualification runs

- Fixed-snapshot source `/tmp/bo-qualification-source-2c1b509`, session 13269. Actual evidence
  `/tmp/brokenodyssey-qualification.cajvdL`, own PostgreSQL port 50375. Full verify, restore,
  asset/content validation have passed; trading 9 and marketplace 8 browser checks pass; social running.
- Hosted CI run 40084458787 for 2c1b509 passes normal tests but still fails backup-restore. Full
  logs denied (403); metadata/annotations readable. Investigating server 16/client 17 compatibility.
  `/usr/lib/postgresql/16/bin` has CLIENTS ONLY. Attempted local PG16 server init therefore did
  not start anything (unused /tmp/bo-ci-pg16 dirs). Instead Docker `bo-qualification-pg16`,
  loopback port 55442, disposable password, image postgres:16 is being pulled/started. Log:
  `/tmp/bo-ci-pg16-container.log`. Never touch unrelated containers or production cluster.
- Main checkout now has UNCOMMITTED persistent friends/DM work: schemas, additive migration
  `0023_persistent_social` + snapshot, domain social.ts (six tests pass), HTTP routes. Not yet UI/API
  tested or committed. A TS narrowing issue was fixed by declaring `fail` as a function; rerun types.
- 0023 applied successfully to local dev on 55441 after stopping ONLY local realtime process group 480763. New local realtime watcher session **97951** logs `/tmp/bo-completion-realtime.log`.
  API/web original watchers remain available. Production has never been stopped or migrated.
- Friends/DM semantics: account-level canonical friend pairs, acceptance required for persistent
  messages; blocking removes friendship, unblock does not recreate consent. Account locks serialize
  requests/send/block, sender IDs/names server-derived, UUID message retries idempotent, 8 per 10s
  durable rate bound, paginated history, recipient-only read receipts. Remaining backend polish:
  deduplicate own blocked contacts against concurrent list reads; make repeated block idempotent at
  block-list cap; add accepted-friend cap and cross-conversation cursor tests. Need API tests and
  real desktop/touch UI + browser proof, migration preservation and restore fixtures with social data.
- Do not stop at these milestones. Continue earned Warrior/Mage quest/boss/dungeon journeys,
  responsive presentation/onboarding, balancing, durable wear/repair if built coherently, and ops.

Latest update: fixed snapshot `2c1b509` qualifier PASSED fully (result fullChecks=true; all 27
browser assertions), stopped own services. Evidence archived under
`docs/hardening/evidence/completion-qualification-2026-10-24`.
Second CI restore failure reproduced: client17 -> server16 unsupported transaction_timeout.
`scripts/db-backup.ts` now chooses/checks matching client major; local16 and17 round trips pass,
explicitPG_BIN17 vs16 refused. CI pinned ubuntu24.04 + client16 install. This ops fix is ready
for a separate commit while friends work remains uncommitted. Docker PG16 test container remains
local port55442; stop only `bo-qualification-pg16` when done.
Friends UI now implemented (`SocialWindow.tsx`, key N, polling unread contacts, accepted-only DM,
pagination/read receipts/block flow). Eight domain + one API case pass. Initial browser11pass,
final browser rerun `/tmp/bo-friends-browser-final.log`, session10976 checks journal overlap fix
and history read update (now12checks expected). UI screenshots inspected. Need finalquality,
0022->0023 preservation, restore social fixtures, evidence/ADR/progress and commit. Add friends
suite to isolated runner. Next gameplay focus: earned Warrior/Mage quest/boss/dungeon journeys,
polish/balance and remaining verified gaps, not stopping at social milestone.
