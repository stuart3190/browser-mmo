# Master Plan

This is the authoritative long-term specification for the game.

The project is **one persistent browser-first MMORPG intended to grow for years**. It is not a throwaway prototype and not the first of several games.

Related files: `AGENTS.md` (rules for agents), `docs/PROGRESS.md` (what is actually done), `docs/DECISIONS.md` (architecture decisions).

## Game direction

- Browser-first open-world fantasy MMORPG
- Persistent online world
- Stylised fantasy visuals rather than photorealism
- Medieval/fantasy core with room for strange magical regions later
- Large expandable world
- MMO-style combat
- MMO-style loot
- Persistent player accounts
- Persistent characters
- Server-authoritative gameplay and economy
- Player progression
- Classes and specialisations
- Melee combat
- Ranged combat
- Magic combat
- Healing/support
- Hybrid classes/playstyles
- PvE
- PvP later
- Quests
- Exploration
- Dungeons
- World bosses
- Crafting
- Gathering
- Guilds
- Parties
- Friends
- Direct messages
- Group chat
- Guild chat
- Player trading
- Marketplace/auction-house style economy
- Persistent item ownership
- Item provenance/history
- Player housing/base systems may be considered later
- Companion mobile app later
- The mobile app should eventually support:
  - login
  - inventory
  - equipment
  - vault
  - marketplace
  - trading
  - friends
  - guilds
  - direct messages
  - group chat
  - notifications

## Monetisation

The game must be fully playable without spending money.

Microtransactions may exist later but must not be required.

Avoid pay-to-win design.

Possible future monetisation may include:

- cosmetics
- mounts
- pets
- skins
- emotes
- convenience features
- optional passes or expansions

Do not assume paid power progression.

## Crypto / external ownership

Crypto is NOT part of the public game design.

- Do NOT implement blockchain now.
- Do NOT expose crypto terminology in the UI.
- Do NOT build the game around NFTs.

However, the item architecture should be future-proofed so that optional external ownership could be added later without redesigning the entire item system.

It is acceptable for item records to contain dormant fields such as:

- `externalOwnershipEnabled`
- `externalAssetId`
- `externalNetwork`

These fields must have no gameplay effect now.

The game database remains the source of truth.

## Theme

Current preferred direction: a large stylised fantasy world with a medieval core and a magical-catastrophe history.

The world should support many very different future regions, such as:

- kingdoms
- forests
- mountains
- coastlines
- islands
- corrupted regions
- frozen north
- desert empire
- volcanic lands
- ancient ruins
- strange magical zones
- lost civilisations

The game should be expandable for years without needing a sequel.

## Classes

Use an architecture based on **base class + specialisation**.

Placeholder examples only. These names are NOT final.

| Base class | Specialisations                   |
| ---------- | --------------------------------- |
| Warrior    | Guardian, Berserker, Warlord      |
| Mage       | Fire, Frost, Arcane, Necromancy   |
| Ranger     | Marksman, Beastmaster, Assassin   |
| Cleric     | Healer, Holy Warrior, Dark Priest |

The architecture must support:

- melee
- ranged
- magic
- healing
- support
- hybrid builds

## Items and gear

The game should have a proper MMO item/equipment system.

Potential item types include:

- swords
- axes
- maces
- daggers
- staves
- wands
- bows
- crossbows
- shields
- plate armour
- mail armour
- leather armour
- cloth armour
- rings
- necklaces
- trinkets
- cloaks
- mounts
- pets
- consumables
- crafting materials
- potions
- enchantments
- cosmetics
- quest items

Suggested rarity structure:

- Common
- Uncommon
- Rare
- Epic
- Legendary
- Mythic

Rarity must be data-driven and configurable.

## Item instance architecture

Separate the **item template** from the **item instance**.

- Template: Iron Longsword.
- Instance: a specific Iron Longsword owned by one player, with its own unique ID, modifiers, durability, history, and ownership.

Every tradable item instance should have a globally unique immutable ID.

Support fields for:

- template ID
- instance ID
- current owner
- original creator if relevant
- acquisition method
- created timestamp
- rarity
- level requirement
- class restriction
- binding rules
- stats
- modifiers
- sockets
- enchantments
- durability
- cosmetic appearance
- tradable flag
- marketplace eligibility
- vault eligibility
- stack size
- quantity
- provenance
- ownership history

The design should scale to millions of item instances.

## Equipment

Support equipment slots such as:

- Head
- Shoulders
- Chest
- Hands
- Waist
- Legs
- Feet
- Cloak
- Necklace
- Ring 1
- Ring 2
- Trinket 1
- Trinket 2
- Main Hand
- Off Hand
- Ranged

Design it so more slots can be added later.

## Inventory and storage

Use distinct systems for:

1. Equipped gear
2. Backpack/item inventory
3. Material pouch
4. Personal character vault
5. Shared account vault
6. Guild vault (later)

Future inventory features should support:

- stacking
- sorting
- search
- filters
- favourites
- locking items
- junk marking
- quick sell
- bag upgrades
- inventory expansion
- item comparison
- loadouts

## Marketplace and trading

The game should eventually support:

- direct player-to-player trading
- marketplace listings
- buying
- selling
- listing fees
- expiry
- cancellation
- transaction history
- audit logs

All economy operations must be server-authoritative.

Prevent item duplication.

An item must never simultaneously exist in incompatible states such as:

- equipped
- inventory
- vault
- active trade
- marketplace listing

Design around this invariant.

## Companion mobile app

The future mobile app should use the same backend and shared schemas as the browser game.

It should eventually support:

- inventory
- equipment
- vault
- marketplace
- trades
- friends
- guilds
- messaging
- group chat
- notifications

The backend must never assume the browser client is the only client.

## Art pipeline

The game will likely use an AI-assisted art pipeline.

Possible tools/workflow may include:

- OpenArt or other concept generation
- item concept art
- item icons
- environment concept art
- Meshy
- Tripo
- Blender
- automated cleanup
- optimisation
- GLB/GLTF export
- textures
- thumbnails
- LODs later

The long-term goal is to make the generation of large volumes of MMO assets manageable while preserving a consistent art style.

Generated assets must never silently overwrite source assets.

## Technical principles

The game should:

- run directly in the browser
- use a serious browser 3D engine
- support WebGL/WebGPU-capable rendering
- use asset streaming
- support chunked world loading
- use realtime networking
- use server-authoritative systems
- use strong typing where practical
- use shared schemas
- support a future mobile client
- avoid premature microservices
- avoid unnecessary complexity
- be modular enough to scale later

Preferred technical direction currently includes:

- TypeScript
- Node.js
- monorepo
- pnpm workspaces
- PostgreSQL
- Redis where useful
- WebSockets for realtime
- Zod or equivalent validation
- Prisma or Drizzle
- Vitest or equivalent tests
- ESLint
- Prettier

The browser 3D engine should be selected based on technical suitability. Babylon.js and Three.js are both acceptable candidates.

Do NOT use Unity.

## Security / cheat resistance

Security must consider:

- item duplication
- currency manipulation
- forged requests
- marketplace race conditions
- trade exploits
- websocket spoofing
- replay attacks
- cheating
- admin permissions
- database transaction boundaries

Never trust the browser for:

- currency
- item generation
- loot
- combat outcomes
- marketplace actions
- trades
- progression

## Long-term direction

This is intended to be one game that grows over time.

Do not design with sequels in mind.

Expansion should happen through:

- new regions
- new classes
- new dungeons
- new bosses
- new quests
- new items
- new systems
- world events
- social systems
- mobile features
- future live-service content
