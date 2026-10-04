# Combat (foundation)

Status: first server-authoritative PvE loop against the placeholder **Grey Wolf**. Melee auto-attack
only. No abilities, resources (mana/rage), threat tables, effects, crowd control or PvP yet.

## Where things live

| Concern                                                              | Code                                                                                                                     |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Data (wolf stats, global tunables, loot table)                       | `packages/game-data/src/content/{world,combat,loot}.ts`                                                                  |
| Formulas (pure, unit-tested)                                         | `packages/game-data/src/rules/combat.ts`                                                                                 |
| Simulation: targeting, swing timers, enemy AI, death, respawn, regen | `services/world/src/zone-simulation.ts` (runs in the 20 Hz zone tick)                                                    |
| Rewards (XP, level, loot, gold) — exactly once                       | `packages/domain/src/combat.ts` (`awardKill`)                                                                            |
| Combat profile (effective stats + equipped weapon)                   | `packages/domain/src/combat.ts` (`getCombatProfile`)                                                                     |
| Wire protocol                                                        | `packages/networking/src/protocol.ts` (`target.set`, `combat.*`, `entity.health`, `player.vitals`, `character.progress`) |
| Gateway wiring (intents, reward queue, linger)                       | `services/realtime/src/server.ts`                                                                                        |
| HUD (player/target frames, attack toggle, death overlay)             | `apps/game-web/src/ui/CombatHud.tsx`                                                                                     |

## Loop

1. Player taps/clicks the wolf (or Tab) → `target.set`. Server checks it exists and is in the player's view.
2. Attack (button, F) → `combat.attack {start:true}`. Server rejects unless the player is alive and
   the target is a living hostile enemy within melee range (`NO_TARGET`, `INVALID_TARGET`,
   `TARGET_DEAD`, `YOU_ARE_DEAD`, `OUT_OF_RANGE`).
3. Every tick the simulation swings for attacking players whose **server-clock** swing timer is
   ready and whose target is in range. Repeated start requests never reset or shorten the timer.
4. Damage is resolved with the formulas below; `combat.damage` goes to everyone who can see the target.
5. The wolf aggroes on proximity (8 m) or when hit, chases, attacks on its own timer, leashes at
   30 m and evades (walks home, resets to full health) when its target dies, leaves or it leashes.
6. At 0 health the wolf enters `dying` (untargetable, harmless) and a kill event is emitted for the
   player who **tagged** it (first damage). The gateway records it durably in `kill_events`
   (write-ahead) and only then confirms it: `combat.death`, attackers stop (`target_dead`), corpse
   stays 3 s, and the spawn slot respawns at the recorded `respawn_at` (group window, e.g. 20–35 s).
7. The gateway applies the reward from the kill event (`processKillEvent` → `awardKillInTx`, one
   transaction that also marks the event `rewarded`): XP + level, loot via the
   single item-creation path (`grantItemInTx`, `source_ref kill:<kill>:<character>:<n>`, history
   correlated by kill ID), gold via the ledger, and a `kill_rewards` row whose primary key
   `(kill_id, character_id)` makes a second award impossible. Drops that do not fit the bags go to
   the **mailbox** ("Recovered loot" bag tab, Take to retrieve). The player gets `character.progress`
   and `combat.loot` (`mailedItems`, `recovered`); items also arrive via the change feed.
   Crash safety and recovery: `docs/adr/0017-durable-kill-events-mailbox.md`.
8. Loot is equippable with the existing inventory UI; equipment changes refresh the in-world combat
   profile (change feed → `getCombatProfile`), so damage changes immediately.

## Formulas (first pass, not balanced)

All numbers come from `combatRules` / the enemy's `combat` block.

- **Max health** = `max_health` stat + `stamina × healthPerStamina` (2).
- **Hit chance** = `baseHitChance` (95%) ± 2% per level difference, clamped to [5%, 100%].
- **Damage** = weapon roll (`min..max`, unarmed 1–3) + `strength × 0.5` + `attack_power × 0.25`;
  crit chance 5% + 0.2% per `crit_rating`, crit ×1.5.
- **Armour mitigation** = `armor / (armor + 100 + 20 × attackerLevel)`, capped at 75%; minimum 1 damage on a hit.
- **Swing timer**: next swing at `max(previousNext, now) + attackSpeedMs` (server time only).
- **Regen**: 3% of max health per second after 5 s out of combat.
- **XP** = enemy `xpReward × clamp(1 + 0.1 × (enemyLevel − playerLevel), 0.5, 1.5)`; 0 if the
  player is ≥ 5 levels above the enemy or at max level. Level curve: existing `applyExperience`.
- **Loot**: wolf table, 2 rolls, no empty rolls: Wolf Pelt ×1–2 (45), Trapper's Cap (40),
  Copper Band (15), plus 5–25 copper.

## Death

Health 0 → dead: auto-attack stops, enemies disengage, movement/attacks/pickups are rejected
server-side, the client shows a respawn button. `combat.respawn` succeeds after 3 s (server clock):
full health at the zone's respawn point (`respawnPointFor`, the extension point for graveyards and
checkpoints). No item or XP loss. Health is persisted (`characters.current_health`); a character
that logs out dead comes back dead.

## Reconnect and disconnecting mid-fight

When a connection closes, the character **lingers** in the world for 10 s (`lingerMs`). A reconnect
in that window re-attaches to the same in-world character (same entity, health, target, enemy
state) and receives fresh snapshots. Disconnecting therefore cannot be used to escape a fight; the
wolf keeps attacking a lingering character.

## Anti-abuse (tested)

Nonexistent/invalid/dead targets, out-of-range starts, attacking while dead, replayed sequence
numbers (connection sequence guard), start spamming (cannot speed up swings), duplicate kill
rewards (5 concurrent `awardKill` calls for one kill → one succeeds; 6 concurrent
`processKillEvent` calls → one), duplicate loot (`source_ref` unique), level-ups persisted once,
crashes before/after recording and after rewarding, two nodes recovering the same kills, lost write
acknowledgements (`services/realtime/test/durable-kills.test.ts`). Attacks and idle aggro require
line of sight (`CollisionWorld.hasLineOfSight`; fences do not block sight, trees/rocks/buildings do).

## Known limits

- Enemies path around static obstacles (grid A*, ADR 0016) but do not collide with each other or
  with players; terrain is flat.
- Single tagger gets the kill; no parties/shared credit yet.
- If the mailbox (200 slots) is also full, the whole reward (XP included) waits until there is room.
- Ranged attacks/abilities do not exist yet; LOS is checked for melee and aggro only.
