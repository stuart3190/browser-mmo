# Greenvale: first playable slice

## The player journey

Arrive in Greenvale Village as a Warrior or Mage. Warriors can collect the Iron Longsword at the
Old Armoury east of the arrival point, open the Bag and equip it. Mages already have Firebolt.
Speak to Elder Maren by the square and accept **Wolves at the Edge**. Follow the north road past
the broken fence into Northwood; the eastern road and south-west trail lead to other wolf dens.
Hunt five wolves, collect three pelts, then return to Maren for XP, gold and a Wayfarer's Cloak.
The quest plus the hunt reaches level two and unlocks the existing second class ability.
Pelts are actual random drops, so more than five kills can be necessary.

Roads are visible over the existing collision-safe corridors. Houses, timber fences, low-poly
pines, rock ridges and den rocks use the existing authoritative footprints. Decorative roofs,
signboards and surface detail do not introduce new collision. The world is still flat: no jump,
vertical terrain traversal, interiors or swimming is implied.

## Controls

| Action                     | Desktop                                      | Touch                      |
| -------------------------- | -------------------------------------------- | -------------------------- |
| Move                       | WASD, relative to camera                     | Left joystick              |
| Look / zoom                | Drag world / mouse wheel                     | Drag world / pinch         |
| Target                     | Click creature, Tab for another nearby enemy | Tap creature / Next target |
| Basic attack               | F or Attack                                  | Attack                     |
| Existing class abilities   | 1–3 or action-bar buttons                    | Ability buttons            |
| Talk / pick up nearby item | E                                            | Interact                   |
| Inventory / equipment      | B / C                                        | Bag / Character            |
| Quest log                  | J                                            | Quests                     |
| Close / clear target       | Escape                                       | Close buttons              |

The local player predicts collision-aware movement, sends bounded movement inputs through the
existing protocol, and obeys server corrections. Remote actors interpolate authoritative positions.
Procedural limb movement is cosmetic; an attack animation requires an actual server damage event.
Health, cooldowns, kill credit, loot, equipment, XP and quest rewards remain server-authoritative.

## Combat and progression

Grey Wolves wander, aggro, chase, attack, return home, die and respawn through the existing zone
simulation. The HUD exposes player/target health, combat feedback, XP and level. Damage flashes,
actor strikes, damage numbers, projectile effects, XP text and loot/level-up toasts show server results.
Rest outside combat to regenerate. Death blocks actions and offers a timed respawn at the nearest
existing respawn point; there is no item/XP loss in this slice.

Loot is automatically delivered to the credited player's persistent bags, material pouch or Recovered
loot overflow. Pelts count toward the quest; Trapper's Caps and Copper Bands are useful gear drops.
The sword is a real world pickup with exclusive claiming and respawn, not a cosmetic prop reward.
Equipment and inventory still use versioned, transactional operations.

## Playing together

Two clients can travel together and fight the same wolves. Movement, health, damage, deaths and
respawns come from the same authoritative zone. **There is no party or shared-credit system yet:**
the first damager receives the kill's XP/loot/quest progress. Other players see the same death but
must earn their own drops. No shared corpse inventory or duplicated loot is implied. Separate
characters have separate progression; account storage follows the existing account-vault rules.

## Presentation scope

A coherent procedural low-poly pass replaces capsules and box wolves. The village gets pitched
roofs, timber details, visible roads, directional signs and a wider orbit view. Opening guidance
reacts to real equipment/quest state. The HUD keeps the combat essentials visible and puts the
scrolling event log behind Journal; Controls explains the inputs. These are simple procedural
assets, not final character art, a skeletal animation pipeline or measured physical-phone performance.

## Next gameplay milestone

A small **party and shared hunt**: invite a nearby player, show party health, and define server-side
eligible group kill/quest credit and fair loot ownership for the existing wolves. Pair this with one
short follow-on objective at the Old Waystone. Keep scope to a reason for two people to adventure
together; no guilds, crafting tree, giant skill system or new infrastructure.

Verification and current implementation commit are recorded in PROGRESS.md. The development
preview uses its own database and loopback ports; it is not a public production deployment.

## Verification — 2026-10-04

- `scripts/e2e/vertical-slice.cjs`: nine checks, fresh-character UI pickup/equip/quest acceptance,
  actual travel, two clients with identical enemy damage/death, XP/unique loot and re-login persistence,
  mouse camera drag and no browser exceptions.
- `scripts/e2e/slice-touch.cjs`: five checks, actual CDP touch joystick, viewport bounds,
  wolf-caused death, touch respawn/full health and no browser exceptions. This continues the first
  script's account fixture; it neither edits DB state nor inserts damage/rewards.
- 88 focused unit/simulation tests, client typecheck, repository lint and production builds pass.
- The existing five-kill quest turn-in and level progression retain their prior domain/realtime
  verification. This run did not automate the entire quest again or certify physical-phone performance.

Run the UI scripts against a seeded, isolated development stack, supplying `WEB_URL`, `PLAYWRIGHT_PATH`
and optionally `CHROME_PATH`. Give both scripts the same output directory. They create their own fresh
accounts through dev login, use real input, and read development-only observations. Production continues
to omit those observations and reject dev authentication.

[Final village](evidence/greenvale-slice/village-final.png),
[phone layout](evidence/greenvale-slice/phone-final.png),
[login](evidence/greenvale-slice/login-final.png),
[playthrough results](evidence/greenvale-slice/playthrough.json),
[two players](evidence/greenvale-slice/02-village-together.png),
[combat](evidence/greenvale-slice/03-northwood-combat.png),
[real loot](evidence/greenvale-slice/04-real-loot.png),
[death](evidence/greenvale-slice/06-death.png).
