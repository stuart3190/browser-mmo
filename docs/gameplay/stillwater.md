# Stillwater Steps — What the Ward Held

Continuation of **The Light Beneath**. Return to **Elder Maren** in Greenvale after completing
Rill's fourth quest; level 3 is required. Maren explains that the wards were seals, not weapons,
and asks you to investigate the eastern water records.

Follow the east road to its Stillwater sign, turn north **before** the rock ridge, round its north
end, and meet **Surveyor Tess**. Speak to her, silence the **Siltbound Warden** below the camp,
then return to Maren. The inscription names the deep spring: the next mystery now has a place
and a reason to matter to Greenvale. This is one non-repeatable quest, using existing talk/kill
objectives; either objective can be completed first, but both are required before turn-in.

The path, ruined steps, shallow decorative water, seal and signs are simple procedural scenery.
All original terrain/colliders and all four original quests/rewards remain unchanged. Water is
visual dressing, not swimming or a new physics system.

## Encounter and rewards

The Warden is a slow stone construct: level 4, 280 health. Its 1.7-second wind-up fixes a **blue
2.5-metre ground mark** at its target's position. Move clear before resolution. The mark does not
follow the player. All living characters still inside it and in the Warden's line of sight can
be hit, so parties should spread out. Server movement, range, sight and armour decide damage;
clients only render warnings and send normal controls. This is a small extension of existing
enemy wind-ups, not a spell/effect engine. Existing enemies retain their previous attacks.

Warnings are replicated to nearby clients and carried in snapshots/checkpoints. Removing the
attack target, killing the Warden or leashing it cancels the warning; re-aggro needs a fresh one.
The Warden respawns after 60 seconds through the existing durable spawn/reward pipeline.

Each quest completion gives **600 XP, 250 copper and one Stillwater Seal**. This level-three,
on-pickup-bound uncommon ring gives 3 armour, 4 stamina, 3 strength and 3 intellect, offering a
real upgrade for both current classes. Equip it from the Bag as usual.

Existing party rules apply unchanged: accept individually, speak to Tess individually, and
share kill credit when alive, online, same zone/current tagged party, within 40 metres at death.
The kill's level-adjusted 220 base XP is divided by eligible member count and floored; at level
3, two members receive 121 XP each, a solo player receives 242. **One** loot owner receives four
copper ore and 80–100 copper. Quest rewards are personal; replay/concurrent turn-in cannot pay
another ring or another wallet reward.

## Greenvale playtest before authoring

A fresh Warrior completed the entire four-quest route through actual browser inputs: sword
pickup/equip, wolf hunt, Maren/Rill round trip, Brackenmaw and Hollow Lantern, individual turn-ins.
No quest flags, kills, XP, equipment power or travel were injected. Six actual wolves were hunted
(the automation hunts in pairs); the three-pelt collection was already satisfied after two.
No deaths or browser exceptions. Acceptance-to-final-turn-in took 567 seconds in emulated
Chromium/SwiftShader; this is a functional playthrough duration, not phone performance evidence.

The Waystone round trip took about 100 seconds, then the return to Rill about 48 seconds. Den
respawn avoidance and repeated road travel remain pacing risks, but this single playthrough did
not justify changing existing objectives or damage numbers. The concrete correction is the stale
opening guide: it now points to the actual next giver for every completed quest, including Maren
following Root-Wound. Review travel with owner feedback before shortening the established story.

The two-client expedition check caught a new path that passed its centre-line collision test but
hugged the eastern ridge too closely: a player approaching off-centre could stick against a boulder.
The northbound approach now sits at x=42, and both edges have an authoritative clearance test.
Objective counts no longer wrap into three lines beside long labels; the decorative seal is a
neutral stone colour so it cannot be mistaken for the blue attack warning.

## Verification

Evidence and final results are recorded in PROGRESS.md. The party hunt/reconnect checks passed
before the route correction; a separate return/reward run then completed on the corrected path,
using the same persisted characters and ordinary inputs. It exited zero. This is staged verification,
not a claimed zero exit for the initial full hunt harness (which exposed the path problem). Browser runs use development-only read-only
observations; all progression inputs use the normal UI. Touch checks are Chromium emulation, not
physical Android performance. The existing deploy command applies the exact additive content hash
migration after stopping the owner, retaining all prior character/party/enemy/reward state.
