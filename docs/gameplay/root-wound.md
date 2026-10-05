# The Light Beneath — Root-Wound continuation

After completing **Teeth Beneath the Roots**, speak to **Keeper Rill** at the Old Waystone.
Accept **The Light Beneath** (level 2 minimum). Follow the pale trail beyond Brackenmaw's clearing,
then the violet roots west and north to the broken ward at **(-93, -82)**. The minimap road continues
to it. Brackenmaw can respawn; pass around its clearing or defeat it again.

The **Hollow Lantern** is a level-3, 210-health ranged elemental. Unlike the fast melee wolves,
it approaches slowly (1.8 m/s) and attacks from up to 10 m. Its 1.8-second wind-up holds position;
the violet ring and target HUD warn of its reach. The existing boulder north of the ward blocks
line of sight: hide behind it or leave range before the strike resolves. Close in during its
recovery to attack. This is a single-target strike, not an area attack. The violet projectile
is cosmetic feedback after the server resolves damage; it does not decide hits.

Return to Rill for **450 XP, 200 copper and a Rootward Mantle**: an uncommon, class-neutral,
bind-on-pickup cloak with 9 armour and 3 stamina, usable from level 2. Equip from Bag. The reward
and completion persist and cannot be claimed twice. The story gives Greenvale a small victory:
the corrupted keeper's ward is silenced; the voice beneath it remains the next lead.

Parties use the existing rules: each member accepts/turns in individually; living, online members
from the first-hit party cohort within 40 m at death share kill credit. Level-adjusted kill XP
(180 base) is divided by eligible recipients and floored. One kill loot roll (three copper ore
and 65–85 copper) goes to the existing rotating loot owner, not to every player. Quest rewards
are personal. Existing non-repeatable quests, checkpoint and kill-outbox transactions are reused.

Desktop uses target/attack and class shortcuts as before; touch uses the target button, Attack,
abilities and Talk. No new input gesture, skill tree, server message or reward engine was added.

## Verification and limitations

Focused tests cover ranged timing, cover/range evasion, recovery, disappearance/respawn, exact
additive content hashes, traversable road centrelines, rendering/picking/disposal, and concurrent
party kill/quest payout. `scripts/e2e/root-wound.cjs` uses two existing characters that completed
Hollow, real travel/input/combat and touch turn-in; it never injects the new quest's progress or loot.
Its existing prerequisite characters and read-only development observation hooks are test scaffolding.
Screenshots/test evidence live under `docs/gameplay/evidence/root-wound` after verification.

Only one ranged encounter and one short quest are added. Balance and physical-phone performance
need player feedback; there are no world phases, persistent per-player scenery changes or AoE rules.
Stop zone owners and apply migration 0010 plus `pnpm db:sync-content` together with the new client/server.
The existing deployment script does this and preserves saved characters, parties and pending rewards.

The two-client landscape run also exposed an existing party-invitation hit-target conflict with
the joystick. Pending touch invitations now sit in the clear centre area; ordinary touch acceptance
is exercised before the shared hunt, without forced clicks.

The optional fullscreen shortcut is hidden while dialogue/inventory panels are open, so it cannot
cover their actions. Portrait touch Goodbye was explicitly checked after screenshot review.
