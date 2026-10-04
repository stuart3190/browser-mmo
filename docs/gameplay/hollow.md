# Teeth Beneath the Roots

After completing **A Whisper at the Waystone**, return to Keeper Rill at the Old Waystone.
He offers **Teeth Beneath the Roots** (level two). Follow the pale stones west, past the
clawed-marker signs, to Brackenmaw's scarred roots at approximately **(-57, -92)**.
Kill the packleader, then return along the trail to Rill. The warning now has a local
consequence; the wounded roots leave a small story thread for later content.

## Encounter

Brackenmaw is a larger, brown-grey wolf: level 3, 260 HP, 12–18 base damage, 12 armour.
Each bite has a **1.4-second stationary wind-up**, shown by an amber ground ring and target-frame
text. Step outside the ring before resolution, then return to attack. The ring includes the
server's range tolerance. Range and line of sight are checked again at resolution. A missed bite
still consumes the cadence; no tracking lunge, AoE, adds, new ability engine or unavoidable attack.
Three-second recovery between attempts; 20 m leash; six-second corpse; 60-second respawn.
The encounter is intended for solo play with movement and existing abilities, and shorter with a party.
Balance is provisional, not a claim of broad playtesting.

The cue is authoritative entity state, checkpointed and included in full snapshots. Infrequent
cue transitions use existing entity upserts/AOI and the durable publication boundary. Returning,
losing the target or dying cancels a pending bite. Existing enemies have no wind-up configured
and retain their current behaviour.

## Credit and rewards

Existing party rules apply unchanged: first-hit cohort, living/online eligible members within
40 m at death, late joins excluded, per-character level-adjusted XP divided by eligible count
and rounded down. Brackenmaw's base XP is 160. One loot roll gives one Trapper Cap plus 60–90 copper
to the existing rotating loot recipient; the cap is not duplicated for each member.
Every eligible member with the active quest gets the kill objective. Each must have completed
the Waystone prerequisite and accepted Rill's quest individually.

Each character's non-repeatable turn-in awards **350 XP, 125 copper and one Keeper's Ward-Token**:
level-two, class-neutral, bind-on-pickup trinket, +3 stamina/+4 armour. It uses normal item
instances, equipment and provenance. Full bags fall back to Recovered loot under existing rules.

## Controls and presentation

Desktop: WASD, drag camera, Tab/click target, F attack, 1–3 abilities, E talk.
Touch: left stick, drag camera, tap target, Attack/ability buttons and Interact.
Quest journal/tracker names the westward route and encounter. Phone target UI shows the same
bite warning. Pale trail stones, two signs and discoloured roots are non-blocking decoration;
all existing terrain/props/collision remain unchanged. Every added path centre is collision-tested.

## Deployment and verification

Migration `0009_hollow_content.sql` accepts only the exact preceding Greenvale content hash.
Stop zone owners, migrate, deploy client and servers together, then restart. Never drop checkpoints.
Recovery adds a missing ungrouped enemy only when no live/corpse state or pending respawn exists.
Unknown content hashes still fail closed. This is additive content, not general save conversion.

Targeted simulation coverage: wind-up timing, recovery, dodge, target loss, death cancellation,
additive recovery and respawn uniqueness. PostgreSQL coverage: prerequisite, shared kill objective,
single loot roll, concurrent replay and per-character turn-in deduplication.
Browser evidence and final verification are recorded in PROGRESS once complete. Real-device Android
performance remains an external follow-up; software-rendered browser automation is functional evidence.
