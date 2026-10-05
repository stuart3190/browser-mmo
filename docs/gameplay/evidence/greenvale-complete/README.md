# Greenvale batch qualification — resume point

Baseline main/deployed: `138891dd19ed6932a50c32df3e050c7b9de55ce7`.
Implementation: `1258bf5addb1346afaa9d6aebdc0927559458178`, branch `codex/greenvale-complete`.
Agent: Codex. Successful browser work dated 2026-10-05; interruption/resume documented 2026-10-06.
**Not yet pushed, merged or deployed.** Remote main was read through the GitHub connector and
confirmed unchanged on 2026-10-06. Neither deployment nor remaining live qualification is claimed.

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

## Exact next steps

Restore the prior VPS execution profile with network/process access. The resumed managed shell
cannot reach the existing localhost preview, PostgreSQL or GitHub SSH. The connected VPS command
and GitHub write tools both returned `MCP tool call requires approval, but approval policy is never`.
This is an execution-policy blocker, not a request for credentials or a gameplay change.

1. Inspect the existing preview ports 4450/4451/5178 and its own PID files before restarting anything.
   Preserve `mmo_slice` and earned characters. `mmo_party_test` alone is disposable; test global setup
   resets its schema. Do not touch unrelated services or rerun already-applied migrations blindly.
2. Run the two-client contract first, with the existing gatherers. Touch fixture `herbs_muveurw6`
   has finished its workshop/vendor/bank/relog checks and is free to join `gather_muveurw6`:

   ```sh
   PLAYWRIGHT_PATH=/opt/aria-browser/node_modules/playwright \
     GREENVALE_PARTY_USERS=gather_muveurw6,herbs_muveurw6 \
     node --import tsx scripts/e2e/greenvale-party-contract.cjs /tmp/greenvale-party-contract-qualified
   ```

   Check two eligible kill credits, shared XP, exactly one rotating loot owner, personal daily
   turn-ins, no immediate reacceptance, touch controls and party/quest persistence after relog.

3. Resume the existing story actor; do not recreate it or grant prerequisites:

   ```sh
   PLAYWRIGHT_PATH=/opt/aria-browser/node_modules/playwright \
     GREENVALE_DPR=0.5 GREENVALE_USER=route_muvjmzr0 GREENVALE_FULL=1 GREENVALE_SIDE=1 \
     node --import tsx scripts/e2e/greenvale-complete.cjs /tmp/greenvale-complete-qualified
   ```

   Remaining: river/quay return, remedy, daily solo hunt, desktop services and final closure relog.
   The previous river failure was the harness reading absent `landmark.radius`, producing NaN;
   it now uses the existing `EXPLORATION_RADIUS - 0.5`. Runtime gameplay is unchanged by this correction.
   DPR is a software-rendering test setting; desktop CSS viewport remains 900×650.

4. If qualification passes, update evidence/PROGRESS and commit, push the feature branch, verify
   origin/main still matches the baseline, then fast-forward/push main. Preserve history.
5. Run the existing `bash scripts/deploy-broken-odyssey.sh` from clean verified main. It owns only
   Broken Odyssey preview services and performs its database backup/migration/release checks.
6. Run `scripts/e2e/greenvale-public.cjs` with `EXPECTED_DEPLOY_SHA` set to actual final main. The
   reserved password comes from `/etc/brokenodyssey/check-password`; never copy it into evidence.
   Verify actual HTTPS release SHA, password auth, production debug-hook absence, herb/vendor/banker/
   atlas persistence and realtime readiness. Do not claim hosted CI or physical-device performance.

No private instance lifecycle, profession ranks/tools, timed crafting or live durability repair is
complete. These stay unchecked. Shared Broken Vault is the explicitly allowed entry/encounter
foundation. Further region densification and final art remain outside this authored-route pass.
