# Greenvale batch qualification and release evidence

Baseline main/deployed: `138891dd19ed6932a50c32df3e050c7b9de55ce7`.
Implementation: `1258bf5addb1346afaa9d6aebdc0927559458178`, branch `codex/greenvale-complete`.
Agent: Codex. Successful browser work dated 2026-10-05; interruption/resume documented 2026-10-06.
Resumed from clean pushed branch commit `e3265b2358beace3d3e79344ec1779153427c360` on 2026-10-06.
VPS execution/network access is restored. SSH read access confirms origin/main is still the baseline
and the remote feature branch matches the resume commit. Merge and deployment remain pending.

## Passed evidence

- `verification.json`: code/test/migration summary and honest pending gates. The one aggregate
  verification exposed two failures. NPC-service ACK reconciliation ordering and a deterministic
  crash-test fixture were corrected; targeted reruns and the remaining API/build/check stages passed.
  Do not describe the initial aggregate as an uninterrupted successful run.
- `desktop-resumed-stage.json` / `story-closure.png`: resumed genuinely earned fresh actor
  `route_muvjmzr0` completed the seven deployed main quests, five new main quests, then timber and ore.
  Earlier main-story stages and screenshots remain under `/tmp/greenvale-complete-playthrough-final4`.
  There were harness corrections and a local preview expiry/restart. No grants, synthetic kill records,
  XP injection or teleports were used for this browser route.
- `touch-services.json`: successful final actual touch gathering/craft, material/vendor exchanges,
  exact-instance sale, banker, discovery, joystick and crafted-equipment relog; no browser exceptions.
  `touch-banker.png`, `touch-portrait.png`, `touch-landscape.png` are captured game scenes, not mockups.
  Emulated Chromium/SwiftShader proves functional controls, not physical Android performance.
- New content/world tests rerun on 2026-10-06: **121 passed**. Browser scripts parse, authoritative
  exploration arrival is finite (3.5 m), and river/quay centers are collision-free. Local lint/format pass.

## Two-player qualification — complete

Two-player qualification is now complete in stages on the preserved gatherers:

- `party-hunt-stage.json`: both real kills, 17 XP per player per kill, exactly two personal credits,
  one rotating loot owner, and the first personal daily turn-in. The run then stopped when the
  waiting touch player died at the ordinary respawn habitat during the long individual return.
- `party-closure.json`: successful zero-exit continuation using normal UI respawn; both earned
  credit counts retained, both personal completions/no immediate reacceptance, party and completed
  contract retained after relog, no browser exceptions. No hunt or reward was replayed.
- `party-db.json`: read-only PostgreSQL proof of both unique rewarded kills, equal shared XP,
  alternating loot owners, and one daily reward-ledger entry per player.
- `party-touch-contract.png`: actual 390×844 touch CSS viewport at DPR 0.5. Functional evidence only.
- `party-start-attempts.json` / `party-navigation-failure.png`: two manually stopped pre-kill runs
  and one tree-waypoint deadline. Harness now focuses walking tabs, supports the same DPR setting
  as the solo script, reuses its adaptive navigation, and supports `GREENVALE_PARTY_FINISH_ONLY=1`.
  Full-hunt mode also retreats both players before individual returns; that final convenience step
  was added after the staged hunt and was not separately replayed on the completed daily actors.
- `earned-baseline.json`: story actor already had 14 genuinely completed quests before this
  continuation. The original story/touch evidence is preserved unchanged.

Preview API/realtime readiness and monorepo typecheck/lint/production build/debug-artifact checks
pass on 2026-10-06. No local preview migrations/resets or gameplay implementation changes were made during qualification.

## Solo continuation — complete

`desktop-qualified.json`: **18 assertions, exit 0**, actual river/quay return, remedy materials from
real wildlife kills/herb gathering, two solo Bristlebacks and personal daily turn-in, gather/workshop,
material/vendor and exact-instance gear sales, banker/atlas, closure and crafted-equipment relog.
No browser exceptions, grants, teleports, progression resets or replayed main-story turn-ins.
`story-db.json`: all **17** playable quests completed, exactly one reward-ledger entry each, and
all **14** pre-resume completion timestamps unchanged. New screenshots: `river-complete.png`,
`remedy-complete.png`, `solo-daily-complete.png`, `desktop-banker.png`, `desktop-discovery.png`.
Desktop CSS viewport is 900×650 at DPR 0.5; screenshots reviewed.

Completed command (do not repeat earned daily hunts merely to recreate evidence):

```sh
PLAYWRIGHT_PATH=/opt/aria-browser/node_modules/playwright \
  GREENVALE_DPR=0.5 GREENVALE_USER=route_muvjmzr0 GREENVALE_FULL=1 GREENVALE_SIDE=1 \
  node --import tsx scripts/e2e/greenvale-complete.cjs /tmp/greenvale-complete-qualified
```

The prior river helper read absent `landmark.radius`, producing NaN. Its existing corrected
`EXPLORATION_RADIUS - 0.5` now passes actual visits/return. Runtime gameplay is unchanged.
The initial aggregate verification was not repeated for these browser-only harness changes;
monorepo typecheck, repository lint, production builds/debug-artifact guard and script syntax pass.

## Remaining release steps

1. Commit the qualification evidence/PROGRESS, push the feature branch, verify
   origin/main still matches the baseline, then fast-forward/push main. Preserve history.
2. Run the existing `bash scripts/deploy-broken-odyssey.sh` from clean verified main. It owns only
   Broken Odyssey preview services and performs its database backup/migration/release checks.
3. Run `scripts/e2e/greenvale-public.cjs` with `EXPECTED_DEPLOY_SHA` set to actual final main. The
   reserved password comes from `/etc/brokenodyssey/check-password`; never copy it into evidence.
   Verify actual HTTPS release SHA, password auth, production debug-hook absence, herb/vendor/banker/
   atlas persistence and realtime readiness. Do not claim hosted CI or physical-device performance.

No private instance lifecycle, profession ranks/tools, timed crafting or live durability repair is
complete. These stay unchecked. Shared Broken Vault is the explicitly allowed entry/encounter
foundation. Further region densification and final art remain outside this authored-route pass.
