# A Whisper at the Waystone

After completing **Wolves at the Edge**, a level-two character can accept Maren's follow-on quest.
Follow the south road from Greenvale Village, pass the fields, and speak to **Keeper Rill** beside the
Old Waystone at (-8, -90). Return to Maren for **150 XP, 75 copper and one Copper Band**.

Rill has seen the old markings light toward the Hollow. His warning gives the wolf hunt a place in
Greenvale's story without adding a new combat system, instance or sprawling quest chain.

This uses the existing quest definitions, prerequisites, dialogue, persistent progress and atomic
turn-in rewards. The only objective addition is the already-schema-defined **talk** kind: successful
server-validated NPC interaction marks matching active objectives once. Talking before acceptance
or to another NPC does nothing. The gateway checks the actual NPC entity, living player and range;
clients cannot submit a progress count. Each character must speak to Rill personally; party kill
credit does not complete somebody else's conversation. Turn-in remains at Maren, once per character.

## Saved-world compatibility

Migration `0008_waystone_content.sql` upgrades only the exact previous Greenvale content hash. It
preserves the rest of the checkpoint, including live combat, pending kills, identities and parties.
Recovery adds missing static NPC spawns with fresh entity IDs; existing entities keep their IDs.
The keeper was appended after procedural prop scattering, so existing terrain/props/colliders are
unchanged. An automated hash comparison verifies that the only content additions are this NPC and
quest. Unknown checkpoint content still fails closed. Stop zone hosts before migrations; roll forward
with fixes after upgrading rather than running an old binary against group rewards/new content.

## Verified scope — 2026-10-04, Codex

- Rules: prerequisite and idempotent talk credit, existing reward templates, unchanged prior content.
- PostgreSQL: normal wolf-quest completion unlocks the follow-on; premature/wrong-NPC turn-ins fail;
  repeated/concurrent talk does not double-count; concurrent turn-ins create one ring and pay 75 once.
- Gateway: remote NPC interaction fails range validation; only the speaking character advances;
  a repeat talk keeps progress at one and the keeper cannot accept Maren's turn-in.
- Recovery: legacy simulation checkpoint retains original entities and player health/position/cooldowns,
  adds exactly one keeper, and survives another recovery. Populated preview migration preserved every
  checkpoint field other than the declared content hash.
- `scripts/e2e/waystone.cjs`: seven passing browser checks. Touch acceptance, real south-road travel,
  Rill dialogue, re-login at the Waystone, return travel, touch turn-in, exact reward and persisted item
  identity. The old wolf-quest prerequisite was prepared through domain APIs on the isolated fixture;
  no new Waystone progress or reward was injected. No browser exceptions. Software rendering and
  emulated touch do not certify physical-phone performance.

Run with `WAYSTONE_USER` naming a development character who has completed the first quest, plus
`PLAYWRIGHT_PATH` and optional `WEB_URL`/`CHROME_PATH`. The default local route is
`http://127.0.0.1:5178/`, available only on this VPS. No production auth gate is changed.

[Evidence](evidence/party-waystone/results.json) · [Rill](evidence/party-waystone/rill.png) ·
[Maren](evidence/party-waystone/maren.png) · [Party on phone](evidence/party-waystone/phone-party.png).
