# Greenvale private runs and field professions

Continues clean deployed main `eabb679`. The village story, outdoor Broken Vault gallery,
world catalogs, earned characters, inventory/equipment, marketplace and shared hunting remain.
The new Vault is a separate catalog zone, owned as a child of the host of its Marches entrance.

## Broken Vault rules

At the atlas Broken Vault entrance, open **Skills**. Solo players and party leaders can reserve
one two-hour run. Every party member must be connected, alive, level four, within six metres of
the entrance and out of combat. Membership is frozen at admission; members enter separately.
An already reserved member can rejoin that run without a new invitation. Outsiders receive their
own run; clients cannot supply an instance ID or completion flag. Invites/disband/leave are refused
inside a run; exit before changing the party. Ordinary zone parties remain local; returning players
must form their party again before reserving the next group run.

Two stone guardians and the Bell Keeper must die. The Keeper uses the existing avoidable ground
strike. The authoritative durable deaths in this particular instance determine completion.
Normal enemy XP and rotating single-owner loot use the existing kill outbox. Each frozen member
who actually entered receives four Iron Shards and 150 copper once, even if they left or disconnected
before the last death. Members who never entered receive no completion reward. Completion status,
member reward markers, item source references/provenance and currency ledger entries commit together.
Full storage rolls back payout for retry; ordinary Recovered overflow is retained.

Death uses the existing respawn delay and a safe private threshold. Living enemies leash/reset
normally after a wipe; cleared enemies stay cleared throughout the run. Exit is available within
six metres of the threshold or while dead, out of combat. Reconnect/relog and host restart restore
the same instance, its live enemy/player state and cooldowns. No healing or objective reset comes
from reconnecting. Completion persists until everyone exits and the owner resets, or lifetime expiry.
Reset requires no connected, lingering or persisted character inside, and no pending kill rewards.
It releases the simulation/checkpoint, preserving the audit/reward tombstones. A new run has a fresh UUID.

At expiry, further gameplay intents are refused and connected/reconnecting characters return through
the existing durable transfer. Offline characters retain their expired image until reconnect and
return; they are not silently assigned to a fresh run. Empty expired images are cleaned after pending
rewards finish. At most 64 child simulations can be hosted; this is a bound, not a capacity claim.
The entrance zone's exclusive ownership session also acquires child advisory locks. Character
routing, both zone images and actual joined membership are committed before publication. A composite
foreign key prevents persisting a character route outside its frozen cohort. Instance entity and
kill identities are scoped to the runtime UUID; static terrain still uses a stable catalog zone ID.

## Field professions

Herbalism, Woodcutting and Mining award ten XP per successful harvest; failed/competing claims
award none. Every 100 XP advances Novice → Apprentice → Journeyman → Expert → Master; XP caps at 500.
Backpack tools bought from the Roadhouse merchant add one yield/five XP at field tier or two yield/
ten XP at fine tier. Fine tools require Apprentice rank in that gathering profession. Owned,
unlocked backpack instances are checked in the same character-locked harvest transaction; equipped,
stored, escrowed or locked tools give no bonus. Gathering by hand remains possible on old routes.

Fieldcraft uses all three existing workshop equipment recipes plus the new herb remedy recipe.
An NPC exchange reserves all inputs and one durable job atomically with its request receipt.
Equipment crafts take 15 seconds; remedies take five seconds. One active job per character prevents
an unbounded queue. Logout and restart do not cancel paid jobs. **Skills** shows the timer and
**Collect result** claims a ready job. Completion grants one output with `craft:<job UUID>` provenance,
20 Fieldcraft XP and the completed marker in one transaction. Replay/concurrent claims cannot
mint more items or award more XP. Bags overflow to Recovered; if both are full the ready job remains
claimable and no output/progression is lost. Recipe IDs must remain immutable for persisted jobs;
changed costs/outputs need a new authored ID or an explicit migration.

Greenvale Remedy consumes two herbs and restores 60 actual health. Select its unlocked backpack
instance in Bag, then **Drink remedy**. Dead/full-health use is refused. A durable per-character
30-second cooldown prevents spam/relogging around the cooldown. Consumption/history/cooldown and
one pending effect commit together; the owning simulation checkpoints health and its applied receipt
together before marking the effect delivered. Recovery retries pending effects and skips already
checkpointed receipts. A character who dies before delivery is not revived. Receipt markers are
pruned only after durable delivery acknowledgement; the economy tombstones remain.

## Durability and repair — deliberately incomplete

Item instances store current/max durability, but combat does not emit authoritative wear events and
stat/weapon calculations do not account for broken gear. Damage/health are published from the fenced
world checkpoint while item mutations run in domain transactions. Clean wear would need a durable
bridge from combat events to exact item versions, breaking-state stat reconciliation, and repair
ordering against that bridge. Charging for repair before those exist would be a fake service; adding
only occasional unsynchronized decrements risks lost/replayed wear and repair races. Repair and wear
remain unchecked. Neither an invented repair charge nor an unverified broken-item penalty is shipped.

## Qualification

Focused tests cover atomicity, races, replay, storage rollback, frozen membership, instance isolation,
expiry, routing/checkpoint/restart and consumable delivery. Full verification and browser/SQL evidence
are recorded in PROGRESS and `evidence/greenvale-systems/`. Browser inputs reuse earned actors from
an isolated copy of the local preview, without grants, teleports or injected progression.
Emulated touch/SwiftShader proves functional controls, not physical Android performance.
