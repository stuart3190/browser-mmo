# Elderwood: the living seal

A continuation of Tidewatch for level-five adventurers. Iona's records point to a third watch:
a living forest seal at Pinewatch Landing. Take the nearby ferry to Willow Quay, then the boat
to Pinewatch. Tamsin stands beside the arrival point; this chapter does not require walking to
the distant generic Elderwood town.

1. **The Third Watch:** carry Iona's records to Keeper Tamsin. Requires The Bell Below.
2. **What the Roots Remember:** investigate the Listening Roots and Briar Archive; quiet two
   Briar Spitters. Their blue circles stay at the position where each attack began.
3. **A Song Left Unfinished:** investigate the Heartwood Oath and defeat the Rootbound Cantor.
   Leave the blue **Roots Reach** circle, then flank or move behind **Bough Sweep**. Return to
   attack between warnings. The boss resists roots.

All three personal surveys use the existing authoritative exploration check. Enemy credit, XP,
loot and quest rewards use existing server and persistence rules. The three turn-ins award
3,000 XP, 370 copper and one bound Heartwood Knot (+8 base stamina, +10 base armour, +4 base
spirit, with ordinary rarity rolls). Kill rewards are additional. The journey is intended to
carry a newly arrived level-five character into level six. Tamsin sells the existing remedy and
provides normal equipment repair and vendor services. No new currency, progression subsystem
or migration is introduced.

The authored path includes three survey glyphs, broad-leaf trees and distinct rooted plant
creatures. This is an authored landing chapter; it does not finish the whole Elderwood region
or the other atlas greyboxes. Forest attacks reuse the fixed-position ground strike and its
recovery logic. Normal spitters prepare players for the Cantor's alternating circle/sweep rhythm.

## Bringing the watches home

After A Song Left Unfinished, accept **The Three Watches** from Tamsin. Return by the actual
Pinewatch ferry, Willow Quay and Enclave Gate to Elder Maren in the Meadows. The once-only
conclusion awards 500 XP, 180 copper and a bound **Watchkeeper's Compass**. Both classes can equip
this level-five trinket: its base stats are +4 stamina, +5 armour, +2 strength and +2 intellect,
with ordinary rarity rolls. It occupies a trinket slot alongside the earlier necklace/ring rewards.

The conclusion unlocks two optional short return visits:

| Patrol                         | Work                                                   | Reward                                   |
| ------------------------------ | ------------------------------------------------------ | ---------------------------------------- |
| Daily Tidewatch Patrol, Iona   | Survey Storm-Line Gauge and defeat two Glassback Crabs | 350 XP, 100 copper, one Greenvale Remedy |
| Daily Pinewatch Patrol, Tamsin | Survey Listening Roots and defeat two Briar Spitters   | 400 XP, 110 copper, one Greenvale Remedy |

Each patrol requires fresh accepted objectives. Its next acceptance is 24 hours after its own
completion, not at calendar midnight. NPC dialogue and the completed quest journal show the
next local date/time and remaining wait. This display never authorises a quest; the server checks
acceptance. The patrols are optional follow-up work, not a new chapter or a daily login requirement.

## Functional verification recipe

`COAST_COMMISSIONS=1 QUAL_BROWSER_SUITES=coast,forest bash scripts/qualify-local.sh --skip-checks`
creates a disposable game and plays the coastal chapter before continuing its earned actors.
The coast setup uses level-five/prior-Greenvale fixtures. The forest driver only reads the
account lookup; it never grants an item, injects forest progress or teleports a character.
All new travel, movement, interactions, combat, healing, equip and relogin use actual controls.

The current verification additionally resumes both previously earned Tidewatch actors from the
retained isolated QA database, preserving their character/item/quest records. Its old-content
simulation cache is archived privately and refreshed only after checking for no pending kill
rewards. That local fixture operation is not a deployment procedure or a production approval.
Browser proof and screenshot review are recorded in PROGRESS only when actually complete.
