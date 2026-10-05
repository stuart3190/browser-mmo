# Quest guidance and The Water Remembers

## Playable route

After **What the Ward Held**, speak to Elder Maren in Greenvale. **The Water Remembers**
compares the Old Well inscription at **(8, 12)** with the Spring Culvert at **(8, 110)**.
Follow the existing north road, passing Northwood, then its short eastern spur. Approach
within **4 metres** of each site's stone. No interaction key is required for surveys.
The sites have matching seal rings, water and inscription signs. Return to Maren for the
Last Door revelation, **450 XP**, **150 copper**, and the on-pickup-bound **Springward
Pendant** (necklace, level 3, +4 stamina and +3 armour before the existing modifier roll).

This is a short investigative breather after the Warden fight. Existing wolves still inhabit
Northwood; no new enemy/combat engine or forced extra kill grind. Sites can be visited in either
order, but guidance picks the first unfinished objective. Visits before acceptance do not count.
Each party member must accept, visit and turn in personally. A distant/dead member receives no
survey credit from another member. The existing party combat/kill/loot rules are unchanged.

## Reusable navigation

A compact gold HUD compass displays quest name, current objective or handoff, cardinal bearing
and distance in metres. The minimap highlights the destination, clamped to its edge when distant.
Both arrows are **north-up compass bearings**, matching the minimap, not camera-relative arrows
or an obstacle-avoiding GPS route. Follow visible roads around rocks and fences.

Guidance uses authored quest references and world locations, never quest-specific conditionals:

- Kill: nearest known living matching enemy, otherwise the nearest authored spawn area.
- Collect: matching pickups or enemies whose authored loot tables contain the material.
- Talk: matching NPC spawn.
- Explore: referenced zone landmark.
- Ready: turn-in NPC. With no active quest, guide to an available quest giver, preferring a
  follow-on from the most recently completed prerequisite.
- Other-zone targets name the destination zone; objectives without locations retain their text.

Click/tap the compass to open the quest log; **Track quest** or a desktop tracker title selects
another active quest. Selection is an optional per-character local storage preference; blocked
storage falls back to automatic selection. Completed/unavailable selections fall back immediately.
Movement/distance updates stay inside the existing 10 Hz minimap loop. Landscape phones retain
this compact guidance even when their detailed quest tracker is hidden. No hidden moving enemy
positions are revealed beyond the server's interest-managed messages.

## Authority and persistence

There is no client exploration claim or coordinate submission. The owned realtime simulation
samples the living character's position, checks authored same-zone sites, and only queues work
when an unfinished objective is actually in range. Up to four visit transactions run globally,
one per connection, sampled at most once per second. Writes lock the character and quest rows,
clamp counters to one, and publish only after commit; failed writes retry while still in range.
Quest-log reconciliation and reconnect load persisted progress. Existing quest transactions,
source-reference uniqueness, inventory overflow and reward replay guards are reused unchanged.

Migrations `0012_well_records_content.sql` and `0013_culvert_safe_approach.sql` accept only their exact predecessor content hashes
and update that hash only. The second records the playtested safer culvert placement without rewriting an applied migration. It does not replace the simulation, player positions/health/cooldowns,
party state or pending rewards. Historical content-hash tests still prove existing content is intact.

## Verification

Evidence is recorded in [PROGRESS](../PROGRESS.md) and `evidence/well-records/` after verification.
The browser script `scripts/e2e/well-records.cjs` uses existing completed-Stillwater characters,
actual desktop travel, touch joystick/actions, two clients and no new quest/position injection.
Keyboard travel in touch emulation is explicitly distinguished from real joystick input. SwiftShader
screenshots verify flow/layout, not physical Samsung frame rate or thermal behaviour.

## Next gameplay milestone

Follow the **Keepers of the Last Door** clue into one small ruined keeper outpost: a focused
quest/encounter using the current quest, party, combat and reward systems. Playtest the six-quest
route with owner feedback first; do not add repeatables/dailies, dungeons, guilds or a branching
quest engine merely to fill checklist boxes.
