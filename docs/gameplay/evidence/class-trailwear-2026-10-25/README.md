# Class-appropriate trailwear — verified 2026-10-25

Fen's Leather for the Long Walk offers Mage an Apprentice Robe and retains the default Warrior
Trapper's Cap. Optional class item lists replace, rather than add to, the default item reward.
Server class determines both offer and transactional grant. Existing completed rewards are intact.

138 content,28 frontend,8 schema and13 domain tests pass, including unused named reward validation,
simultaneous turn-in, normal class-specific equip, no default-plus-alternative duplicate and
preservation of an old Mage cap. Repository types, lint, build/debug guard and content validation pass.

Ordinary level-one journeys pass: Warrior nine checks and Mage seven. Real starter pickup/equip,
walking/travel, wildlife hides, herb gathering, Fen turn-in, one class-appropriate item, equip and
same-item relogin. No DB player writes, grants, teleports or injected XP. Warrior resumed after a
driver used a generic reward helper that excludes starter swords; original failure retained.
Mage's fresh journey passed uninterrupted. Long keyboard segments caused safe route replanning;
final driver follows shorter segments of the same NavGrid routes. No production pathfinding change.

Screenshot review found selected item details remained over NPC dialogue after closing Bag.
GameState now dismisses details when the last inventory/character/bank window closes, retaining
selection while another remains. Eight desktop and six touch follow-up checks pass on the same
earned actors. Their first follow-up used a guessed Character close-button label; actual label
contains character name/level. Corrected to the scoped header control; failed attempt retained.
Final clear-dialogue and relogin screenshots reviewed. No production changes or shipping claim.
