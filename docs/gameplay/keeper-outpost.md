# The Names Behind the Door

After **The Water Remembers**, return to Elder Maren and accept **The Names Behind the Door**
(level 3). Follow the north road beyond Northwood to the Spring Culvert, then the pale eastward
spur. The ruined keeper watchpost has an oath stone at **(24, 110)** and an open courtyard
around **(33, 118)**. Approach the oath within four metres and quiet **Aster, Last Door Sentinel**,
then return to Maren. The general quest compass/minimap follows the survey, encounter and return
without quest-specific client logic. Both objectives can be completed in either order.

Aster is a level-four, 300-health construct: the surviving watch of the Keepers of the Last Door.
During a **2.2-second warning**, his position and heading freeze. The **amber 100-degree sector**
shows his six-metre reach plus the existing 0.75-metre range tolerance. Flank him, pass behind
him, or leave that sector before the strike. Every living player in the sector with line of sight
can be hit, including companions who are not his target. He waits 2.4 seconds after resolving
before beginning another warning. Existing chase, leash/evade, death, corpse and 60-second
respawn rules apply. Ruined pillars have the same visible and authoritative collision footprints.

No spell/effect engine was added. The existing persistent attack cue gains an optional frozen
sector heading/width; existing checkpoint, snapshot/reconnect, damage, health and cancellation
paths handle it. Old circle attacks retain their prior rules. No client reports hits or surveys.

## Rewards and parties

Each eligible party member with the accepted quest receives existing shared kill credit; the
first-hit/death eligibility intersection, same-zone/alive/40-metre rules and fair rotating loot
owner are unchanged. Each member must personally survey and return to Maren. The guardian's
220 base XP uses existing level scaling and integer division across recipients (level-three
solo: 242 XP; two level-three companions: 121 each). Exactly one four-copper-ore stack and
85–110 copper are awarded to the rotating loot owner, using the existing durable kill outbox.

Each personal quest turn-in grants **700 XP**, **300 copper**, and one on-pickup-bound rare
**Oathkeeper’s Mantle**. Both playable classes can equip it at level three. Base stats are
+6 stamina, +6 armour, +3 strength and +3 intellect before existing rarity/modifier rolls;
it replaces the earlier cloak rather than adding a new equipment slot. Overflow and reward
replay/transaction rollback protections are unchanged.

Maren recovers the keepers' oath: the Last Door was closed to let the spring dream, not to kill it.
The next clue is a bell below the roots. This release does not open that door or add a dungeon.

## Inventory checklist continuation

Backpack, materials and recovered loot now offer name search, rarity filtering and view ordering
by bag slot, name, rarity tier or item level. Reset restores the normal authoritative slot grid.
Sorting is **display-only**: it does not move items, change versions, consume a free slot or send
an operation to the server. Selection and equip/recover actions still use the original unique
instance ID and location. Capacity usage always reflects the real container, even with filters.
Other storage views retain their existing layout. No favourites/junk/vendor systems are claimed.

## Verification

See PROGRESS and `evidence/keeper-outpost/` for recorded verification proof.
The browser scripts use previously played characters with the prior six quests genuinely finished,
actual keyboard travel, and actual touch joystick/target/ability/dialogue/inventory actions.
Software Chromium/touch emulation verifies flow and layout, not physical Android performance.
