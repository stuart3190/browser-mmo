# Greenvale Complete — implementation brief

This is a starter-region completion pass, not a claim that all 4,096 × 4,096 m of the Marches
are handcrafted or that every long-term MMO system is finished. The original village/story enclave,
Marches coordinates, continents, existing progression and reward IDs remain intact.

## Existing / missing dependency checklist

| Area         | Existing at start                                                 | This pass                                                                                                      |
| ------------ | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Authority    | movement, combat, parties, durable rewards, inventory and storage | reuse; no parallel simulation                                                                                  |
| Population   | Roadhouse, port, 13 creatures/13 inhabitants, two herb patches    | river post, quarry, timber yard, toll cut, vault watch and gallery; outlaw/stonekin regional variants          |
| Services     | dialogue, remote vaults                                           | authored atomic buy/sell/craft offers with durable idempotency receipts                                        |
| Resources    | herbs with persistent depletion                                   | same framework for iron shards and hardwood; useful field-gear recipes                                         |
| Story        | original village ward investigation                               | five-quest Marches closure, authored as one linked batch                                                       |
| Side work    | original hunt                                                     | four local collection/exploration quests and one daily patrol                                                  |
| Cave         | catalog entrance only                                             | shared-world entry/encounter data and explorable gallery; private instances explicitly unfinished              |
| Discovery    | quest visits only                                                 | independent persistent world-location discoveries, atlas indicators                                            |
| Verification | prior deployed evidence                                           | new targeted economy/link/replay/discovery tests and real browser flow; recorded in the qualification evidence |

## Playable geography and content

All new places are in Greenvale Marches. Roadhouse beds and timber yard introduce low-risk gathering;
Bristlebank Quarry and Willow River Post give the mid-route services a reason to exist; the Old Toll
Cut uses level-three catalog outlaws. The Hollow camp leads east to the Broken Vault Watch and the
level-five shared stonekin gallery. Low-level wildlife and boars remain around the meadow/thickets;
stronger opponents are separated by the river and long approach road. Other continents are unchanged.

The new main arc is Beyond the Village Ward → Keeping the Road Lit → The Broken Boundary → A Bell
Left Sleeping → A Promise Kept. It follows the deployed keeper-outpost prerequisite, resolves the
spring's warning as a promise to let the land heal, and returns the discovery to Maren rather than
inventing another catastrophe. Every existing quest ID/reward remains unchanged. Side work uses
existing inhabitants, habitats, materials and personal explore/collect objectives. Kills continue to
use the existing eligible-party/shared-credit and rotating single-loot-owner rules. A playtested
hunt-drop safeguard supplements (never replaces) normal loot with at most one missing required
collection unit per matching active hunt/template. It is capped at the objective count, awarded only
to the normal loot owner, and commits with the existing kill marker/provenance. This prevents unlucky
starter hunts turning into an unbounded pelt grind without changing old quest IDs, tables or turn-in
rewards. The new river/vault roads have regression checks for the full walking corridor around props;
the HUD tracker shows at most three entries, with the selected quest first and a log link for the rest.
The opening guide now derives the next available story handoff from content instead of repeating an
outdated “wait for Maren” ending; actionable NPC dialogue sorts ahead of historical completions.

## Reusable services and economy

Version-3 packs add strict `serviceOffers` and `dungeonEntries`; versions 1/2 still load unchanged.
An offer references an existing NPC, fixed item costs/output, level floor and signed copper delta.
Only immediate atomic exchanges are supported: buy, sell or craft. References, quantities,
duplicate inputs and invalid/free exchange shapes fail content compilation. There are no authored
scripts or live-state effects. NPC service intents go through the authoritative realtime NPC/life/
range checks, out-of-combat gate and existing sequence/database-work limits. They have no HTTP shortcut.

Repeatable contracts cannot be prerequisites for permanent story unlocks until historical completion
flags exist; validation rejects that unsupported dependency.

A locked character plus `(character, request UUID)` receipt serializes concurrent/replayed requests.
Item consumption, wallet/append-only ledger, grant/provenance and receipt commit together. Failed
funds/materials/output space roll everything back; a repeated request returns current inventory and
wallet without exchanging again. Material offers consume only catalogued unlocked backpack/pouch
units. The vendor also buys an
explicitly selected backpack item/whole stack at template value: exact item ID + optimistic version,
locked item row, ownership/location checks and the same durable receipt/ledger transaction. It cannot
sell equipped, banked, escrowed or locked gear. Crafting consumes material stock and creates real equippable cloak/sword/staff instances using existing rules.
Receipts are durable replay tombstones; do not delete them without defining an operation expiry policy.

Herbs, iron-shard mining and hardwood collection share the existing persistent resource-row locking,
shared depletion, regrowth and crash restoration. No new gathering RPC, fake profession rank or tool
requirement is claimed. Herbs tan hides into cloaks and finish wooden staves; ore and hardwood make
field swords. These are immediate workshop recipes, not a general timed crafting queue.

Daily Roadwatch Contract uses explicit reacceptance after 24 hours from last completion. Acceptance
resets counters/timestamps under the existing character/quest lock and increments its version.
Reward source references include the accepted cycle for repeatables; old nonrepeatable source refs
stay unchanged. A repeated turn-in can never pay twice. Daily contract XP/pay is deliberately lower
than main-story rewards; kills before acceptance never count.

## Exploration and cave foundation

Alive, owned server positions within 24 m of atlas places produce independent `(character, location)`
discovery rows. Existing once-per-second bounded exploration work drives the writes only for nearby
unknown places; no client coordinate/visit claims. Reconnect loads discoveries; atlas marks discovered
places while retaining existing Guide functionality and quest compass. No achievement engine or rewards
for discovery are claimed.

Broken Vault is an explicitly **shared-world** ruin/gallery using the region simulation, streamed
props/collision, catalog spawns, existing death/respawn and party rewards. Typed entrance data validates
its dungeon location and actual placed encounter IDs. This is the safe reusable entry/encounter
foundation permitted by the brief. Private party instances still need instance identity, per-group
admission/ownership, saved lifecycle, completion/reset rules and reconnect-safe party membership.
There is no private-instance badge or invented completion chest.

## Explicit remaining slices

- Private dungeon instances and dungeon completion rewards; the foundation above is shared only.
- Profession ranks, tool requirements, timed crafting and consumable-use effects.
- Repair: templates have durability metadata, but live combat wear/repair economics are not ready.
- Lodging/healing/training: existing safe out-of-combat regeneration already covers starter recovery;
  no redundant paid healer or pretend trainer is exposed.
- Banker-only restrictions: remote vault access is retained for the future companion architecture;
  the local banker opens the existing vault interface without imposing a fake restriction.
- Full wilderness densification/final art: the authored route is populated, distant reserved space remains.
- Physical Android performance remains an external test, not something emulation can prove.

Local browser qualification is complete, including the preserved 17-quest actor and staged shared
hunt/contract. Main is fast-forwarded/pushed, deployed and publicly verified with 15 HTTPS/password
browser assertions. Exact release evidence and final-main deployment verification are recorded in
PROGRESS and [evidence](evidence/greenvale-complete/README.md).

## Verification paths

Run the standard `NODE_ENV=production TEST_DATABASE_URL=... pnpm verify` against a disposable
PostgreSQL database. The integration global setup resets its target schema: never point it at the
preview or production database. `greenvale-services.test.ts` in domain/realtime covers atomic
exchanges, exact-instance sales, failures/replays, repeat cycles, shared credit and discoveries;
`greenvale-complete.test.ts` covers authored links and walkable road corridors.

Real browser input flows, with the existing local preview running:

```sh
PLAYWRIGHT_PATH=/path/to/playwright GREENVALE_USER=new_unique_name \
  GREENVALE_CREATE=1 GREENVALE_FULL=1 GREENVALE_SIDE=1 \
  node --import tsx scripts/e2e/greenvale-complete.cjs /tmp/greenvale-route
```

Omit `GREENVALE_CREATE` to resume the same legitimately earned character after an interrupted
harness stage. The full route covers the original seven quests before the five new main quests,
then four side quests and the contract. `GREENVALE_TOUCH=1` runs touch interaction/joystick and
390×844 / 844×390 control checks. `GREENVALE_SERVICES_ONLY=1` tests gathering, workshop, vendor,
banker and discovery without requiring story completion. The party contract flow takes two existing
Marches characters via `GREENVALE_PARTY_USERS=name_a,name_b` and
`scripts/e2e/greenvale-party-contract.cjs`; it must run before their daily contract is completed.
`GREENVALE_PARTY_FINISH_ONLY=1` resumes already-earned two-credit contracts through normal respawn,
personal turn-ins/cooldown and relog, without accepting a fresh cycle or repeating shared kills.
All progress comes from ordinary UI/movement/combat inputs; observations use development-only hooks.
Software-rendered Chromium/emulated touch do not establish Android frame rate or GPU performance.

After deploying clean verified main with `bash scripts/deploy-broken-odyssey.sh`, run
`scripts/e2e/greenvale-public.cjs` with `EXPECTED_DEPLOY_SHA` and the reserved QA password file.
It uses actual HTTPS/password/UI inputs and transport observations, requires the production debug
hook to be absent, and verifies herb/vendor/banker/atlas persistence. Never store credentials in
repository evidence. Curated proof lives in `docs/gameplay/evidence/greenvale-complete/`.
