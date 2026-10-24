# Elderwood: the living seal

A continuation of Tidewatch for level-five adventurers. Iona's records point to a third watch:
a living forest seal at Pinewatch Landing. Take the nearby ferry to Willow Quay, then the boat
to Pinewatch. Tamsin stands beside the arrival point; this chapter does not require walking to
the distant generic Elderwood town.

1. **The Third Watch:** carry Iona's records to Keeper Tamsin. Requires The Bell Below.
2. **What the Roots Remember:** investigate the Listening Roots and Briar Archive; quiet two
   Briar Spitters. Their blue circles stay at the position where each attack began.
3. **A Song Left Unfinished:** investigate the Heartwood Oath and defeat the Rootbound Cantor.
   Leave the larger blue circle, then return to attack between songs. The boss resists roots.

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
recovery logic. Normal spitters allow practice before the Cantor's wider, slower strike.

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
