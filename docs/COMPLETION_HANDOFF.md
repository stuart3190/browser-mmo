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
- [ ] Player-facing marketplace access over existing authoritative marketplace.
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
Next implementation: marketplace UI, public exact-item inspection and serialized account listing
limits. Draft scripts in `/tmp/bo-market-backend.py`, `/tmp/bo-market-tests.py`, and
`/tmp/bo-MarketWindow.tsx` are not yet applied; inspect before using. Then persistent social features. Do not stop at
any of these milestones. Production remains unchanged.
Browser skill: game-studio/game-playtest; use existing Playwright scripts and inspect screenshots.
No hosted CI, production capacity, off-host recovery or physical-phone performance claim yet.
