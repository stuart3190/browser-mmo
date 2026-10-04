# Quests

First quest loop: **Wolves at the Edge** from Elder Maren (Greenvale Village). Server-authoritative,
persisted in PostgreSQL, rewards exactly once. Decision record: `docs/adr/0018-quest-foundation.md`.

## Where things live

| Concern                                                                                    | Location                                                                                                                             |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| Quest definitions (authored data)                                                          | `packages/game-data/src/content/world.ts` (`quests`), schema `packages/schemas/src/content.ts`                                       |
| Content validation                                                                         | `packages/game-data/src/registry.ts` (`validateQuests`)                                                                              |
| Pure rules (availability, progress, state, kill application, turn-in check, dialogue line) | `packages/game-data/src/rules/quests.ts`                                                                                             |
| Player quest state (DB)                                                                    | `character_quests` (migration `0004_quests`)                                                                                         |
| Accept / turn-in / quest log / NPC dialogue / kill progress                                | `packages/domain/src/quests.ts`                                                                                                      |
| NPC interaction validation (entity, zone, range, alive)                                    | `ZoneSimulation.npcInteraction` (`services/world`)                                                                                   |
| Protocol + gateway                                                                         | `npc.interact`, `quest.accept`, `quest.turn_in` → `npc.dialogue`, `quest.log`, `quest.completed` (`services/realtime/src/server.ts`) |
| UI                                                                                         | `apps/game-web/src/ui/QuestUI.tsx` (dialogue, tracker, quest log)                                                                    |

## Definition vs player state

A **definition** has: id, name, description, giver NPC, turn-in NPC (default: giver), minimum level,
prerequisite quests, `repeatable` (must be false for now), objectives (stable ids; `kill` and
`collect` are supported, `talk`/`explore` are shape-only placeholders rejected for live quests),
rewards (XP, currencies, items) and one dialogue line per state (offer, in progress, ready,
completed). `placeholder: true` quests exist only so references validate and are never offered.

A **player quest row** (`character_quests`, PK `(character_id, quest_id)`) stores `status`
(`active` | `completed`), kill counters (`progress` jsonb keyed by objective id), `accepted_at`,
`completed_at`, `rewarded_at`, `turn_in_id` (correlation id of the turn-in's item history and
currency ledger rows) and a version. A check constraint ties `completed` to both timestamps.

## States

| Player-facing                          | Stored as   | Rule                                                                                |
| -------------------------------------- | ----------- | ----------------------------------------------------------------------------------- |
| unavailable                            | no row      | level too low, prerequisite missing, or placeholder                                 |
| available                              | no row      | all availability rules pass                                                         |
| active                                 | `active`    | at least one objective not satisfied                                                |
| objectives complete / ready to turn in | `active`    | every objective satisfied — one server condition; the player must return to the NPC |
| completed                              | `completed` | turned in; permanent for non-repeatable quests                                      |

## Objectives

- **Kill**: counted inside the existing kill-reward transaction (`awardKillInTx` →
  `applyKillToQuestsInTx`). That transaction already runs exactly once per durable kill event
  (`kill_events` + `kill_rewards` PK, ADR 0017), so a kill can never count twice — not on retries,
  replays, restarts or with several realtime nodes. Only the credited (tagging) character progresses;
  kills before accepting do not count; counters are capped at the target.
- **Collect** (chosen rule): progress is **derived** from the character's authoritative inventory —
  units of the template in the **backpack, material pouch and Recovered loot (mailbox)**, excluding
  locked items. Vaults, equipped items and marketplace escrow do not count. Nothing is stored, so
  progress cannot drift or double-count; moving pelts to the vault or selling them lowers it again.
  Pelts that overflowed into Recovered loot count, and are consumed first on turn-in.

## Turn-in (one transaction)

The realtime host first validates the NPC entity and range (`npcInteraction`). `turnInQuest` then,
in a single PostgreSQL transaction: locks the character row and the quest row, re-counts items,
checks state/NPC/objectives (`turnInCheck`), consumes required items (containers then stacks locked
in the usual order; `destroyed` / `modified` history with reason `quest_turn_in`), applies XP,
credits currency through the ledger (`quest_reward`), grants reward items through `grantItemInTx`
(`source_ref quest:<quest>:<character>:<n>` unique; overflow to Recovered loot) and marks the row
`completed` with a guarded update (`status = 'active' AND version = n`). Any failure — including a
crash, not enough items, or a full mailbox — rolls everything back.

## Protocol

| Client → server                     | Server checks                                                 | Answer                                                                                                        |
| ----------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `npc.interact {entityId}`           | NPC entity in this zone, player alive, within interact radius | `npc.dialogue`                                                                                                |
| `quest.accept {entityId, questId}`  | same + NPC is the giver + availability                        | `quest.log` (event `accepted`) + `npc.dialogue`                                                               |
| `quest.turn_in {entityId, questId}` | same + turn-in NPC + objectives + items                       | `character.progress`, `inventory.updated`, `quest.completed`, `quest.log` (event `completed`), `npc.dialogue` |

`quest.log` (full log + change events `accepted` / `progress` / `objective_complete` / `ready` /
`completed`) is pushed on join, after accept/turn-in, after a kill that advanced a quest, after any
inventory change of the character (change feed) and after change-feed resyncs. There is no message a
client could use to report progress.

## Tests

- Unit (`packages/game-data/src/quests.test.ts`): content, availability, prerequisites, progress,
  state transitions, dialogue, turn-in validation, content validation.
- Domain integration (`packages/domain/test/quests.test.ts`): accept / duplicate / concurrent accept,
  wrong NPC, kill progress exactly once (duplicate kill, 4 concurrent outbox processors), collect
  rule (mailbox counts, vault/locked do not), premature / wrong-NPC turn-in, rewards once, 5
  concurrent turn-ins, crash mid turn-in rolls back, full bag → Recovered loot, full mailbox → atomic
  failure.
- Realtime integration (`services/realtime/test/quests.test.ts`): range/entity validation, fake
  progress message rejected, progress across reconnect and server restart, turn-in once, DB matches.
- Browser (`scripts/e2e/quest.cjs`): desktop full loop with real kills/loot; phone touch flow.

## Not yet

Repeatable/daily quests, talk/explore objectives, quest chains beyond `prerequisites`, abandoning,
party sharing, quest items, branching dialogue, multiple quests per NPC UI beyond a list.
