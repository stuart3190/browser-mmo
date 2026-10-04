/**
 * Database schema — single source of truth for table definitions.
 *
 * Workflow: edit this file → `pnpm db:generate` (writes a new SQL migration) → review the SQL →
 * `pnpm db:migrate`. Never edit an applied migration; add a new one.
 *
 * See docs/architecture/database.md for the design rationale, especially the item location model.
 */
import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();

// ===========================================================================
// Enums
// ===========================================================================

export const accountRole = pgEnum('account_role', ['player', 'support', 'game_master', 'admin']);
export const accountStatus = pgEnum('account_status', ['active', 'suspended', 'banned']);
export const containerKind = pgEnum('container_kind', [
  'backpack',
  'material_pouch',
  'character_vault',
  'account_vault',
  'guild_vault',
  /** System-only overflow storage ("Recovered loot"): loot that did not fit is delivered here. */
  'mailbox',
]);
export const itemLocationKind = pgEnum('item_location_kind', [
  'container',
  'equipped',
  'marketplace_escrow',
  'trade_escrow',
  'destroyed',
]);
export const itemBindingKind = pgEnum('item_binding_kind', ['unbound', 'character', 'account']);
export const listingStatus = pgEnum('listing_status', ['active', 'sold', 'cancelled', 'expired']);

// ===========================================================================
// Accounts & auth
// ===========================================================================

export const accounts = pgTable(
  'accounts',
  {
    id: uuid('id').primaryKey(),
    username: text('username').notNull(),
    displayName: text('display_name').notNull(),
    role: accountRole('role').notNull().default('player'),
    status: accountStatus('status').notNull().default('active'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('accounts_username_lower_uq').on(sql`lower(${t.username})`)],
);

/**
 * One row per way of logging in. Dev login today; email/password and OAuth providers later.
 * `secretHash` is only used by providers with a local secret (e.g. password, argon2id).
 */
export const authIdentities = pgTable(
  'auth_identities',
  {
    id: uuid('id').primaryKey(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id),
    provider: text('provider').notNull(),
    providerSubject: text('provider_subject').notNull(),
    secretHash: text('secret_hash'),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('auth_identities_provider_subject_uq').on(t.provider, t.providerSubject)],
);

/** Opaque bearer sessions. Only a SHA-256 hash of the token is stored. */
export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id),
    tokenHash: text('token_hash').notNull(),
    clientKind: text('client_kind').notNull(),
    createdAt: createdAt(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('sessions_token_hash_uq').on(t.tokenHash),
    index('sessions_account_idx').on(t.accountId),
  ],
);

// ===========================================================================
// Characters
// ===========================================================================

export const characters = pgTable(
  'characters',
  {
    id: uuid('id').primaryKey(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id),
    name: text('name').notNull(),
    classId: text('class_id').notNull(),
    specialisationId: text('specialisation_id'),
    level: integer('level').notNull().default(1),
    xp: bigint('xp', { mode: 'number' }).notNull().default(0),
    zoneId: text('zone_id').notNull(),
    posX: doublePrecision('pos_x').notNull().default(0),
    posY: doublePrecision('pos_y').notNull().default(0),
    posZ: doublePrecision('pos_z').notNull().default(0),
    rotationY: doublePrecision('rotation_y').notNull().default(0),
    /** Last persisted health; NULL = full. 0 = dead (must respawn on next login). */
    currentHealth: integer('current_health'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('characters_name_lower_uq').on(sql`lower(${t.name})`),
    index('characters_account_idx').on(t.accountId),
    check('characters_level_ck', sql`${t.level} >= 1`),
    check('characters_xp_ck', sql`${t.xp} >= 0`),
    check('characters_health_ck', sql`${t.currentHealth} IS NULL OR ${t.currentHealth} >= 0`),
  ],
);

// ===========================================================================
// Items
// ===========================================================================

/**
 * Mirror of authored templates from @mmo/game-data (synced by the seed/content-sync script).
 * Exists so instances have a real foreign key and so admin/marketplace queries can join on
 * category/name without loading game data. `data` holds the full validated template JSON.
 */
export const itemTemplates = pgTable('item_templates', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  category: text('category').notNull(),
  rarityId: text('rarity_id').notNull(),
  maxStack: integer('max_stack').notNull(),
  tradeable: boolean('tradeable').notNull(),
  data: jsonb('data').notNull(),
  contentHash: text('content_hash').notNull(),
  updatedAt: updatedAt(),
});

/**
 * Slot-based storage: backpack, material pouch, character vault, account vault, guild vault.
 * (This table plays the role of "inventories" and "vaults" — see database.md.)
 */
export const containers = pgTable(
  'containers',
  {
    id: uuid('id').primaryKey(),
    kind: containerKind('kind').notNull(),
    ownerAccountId: uuid('owner_account_id').references(() => accounts.id),
    ownerCharacterId: uuid('owner_character_id').references(() => characters.id),
    /** Guilds are not implemented; no FK yet. */
    ownerGuildId: uuid('owner_guild_id'),
    capacity: integer('capacity').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    check('containers_capacity_ck', sql`${t.capacity} > 0 AND ${t.capacity} <= 1000`),
    check(
      'containers_owner_ck',
      sql`CASE ${t.kind}
        WHEN 'account_vault' THEN ${t.ownerAccountId} IS NOT NULL AND ${t.ownerCharacterId} IS NULL AND ${t.ownerGuildId} IS NULL
        WHEN 'guild_vault' THEN ${t.ownerGuildId} IS NOT NULL AND ${t.ownerCharacterId} IS NULL
        ELSE ${t.ownerAccountId} IS NOT NULL AND ${t.ownerCharacterId} IS NOT NULL AND ${t.ownerGuildId} IS NULL
      END`,
    ),
    uniqueIndex('containers_character_kind_uq')
      .on(t.ownerCharacterId, t.kind)
      .where(sql`${t.ownerCharacterId} IS NOT NULL`),
    uniqueIndex('containers_account_vault_uq')
      .on(t.ownerAccountId)
      .where(sql`${t.kind} = 'account_vault'`),
  ],
);

/**
 * Every concrete item. Rows are NEVER deleted (provenance); consumed/merged items move to
 * location 'destroyed'.
 *
 * THE LOCATION INVARIANT: an item's location is a set of columns on this one row, so it cannot be
 * in two places at once. CHECK constraints enforce that exactly the columns for its location kind
 * are set, and partial unique indexes stop two items sharing a slot / equipment slot / listing.
 */
export const itemInstances = pgTable(
  'item_instances',
  {
    id: uuid('id').primaryKey(),
    templateId: text('template_id')
      .notNull()
      .references(() => itemTemplates.id),
    rarityId: text('rarity_id').notNull(),
    quantity: integer('quantity').notNull().default(1),

    // Ownership
    ownerAccountId: uuid('owner_account_id')
      .notNull()
      .references(() => accounts.id),
    ownerCharacterId: uuid('owner_character_id').references(() => characters.id),
    originalOwnerAccountId: uuid('original_owner_account_id'),
    originalOwnerCharacterId: uuid('original_owner_character_id'),
    crafterCharacterId: uuid('crafter_character_id'),

    // Acquisition (immutable)
    acquisitionMethod: text('acquisition_method').notNull(),
    /** Idempotency/dedupe key for the creating event, e.g. one row per world-pickup spawn cycle. */
    sourceRef: text('source_ref'),

    // Location (exactly one)
    locationKind: itemLocationKind('location_kind').notNull(),
    containerId: uuid('container_id').references(() => containers.id),
    slotIndex: integer('slot_index'),
    equipCharacterId: uuid('equip_character_id').references(() => characters.id),
    equipSlot: text('equip_slot'),
    listingId: uuid('listing_id'),
    tradeId: uuid('trade_id'),
    destroyedReason: text('destroyed_reason'),

    // Binding
    bindingKind: itemBindingKind('binding_kind').notNull().default('unbound'),
    boundCharacterId: uuid('bound_character_id'),
    boundAccountId: uuid('bound_account_id'),
    boundAt: timestamp('bound_at', { withTimezone: true }),

    // Rolled properties
    stats: jsonb('stats').notNull().default({}),
    modifiers: jsonb('modifiers').notNull().default([]),
    sockets: jsonb('sockets').notNull().default([]),
    enchantments: jsonb('enchantments').notNull().default([]),
    durabilityCurrent: integer('durability_current'),
    durabilityMax: integer('durability_max'),
    appearance: jsonb('appearance'),

    // Player flags
    isLocked: boolean('is_locked').notNull().default(false),
    isFavourite: boolean('is_favourite').notNull().default(false),
    isJunk: boolean('is_junk').notNull().default(false),

    // Dormant external ownership — no gameplay effect. Constrained to inert values.
    externalOwnershipEnabled: boolean('external_ownership_enabled').notNull().default(false),
    externalAssetId: text('external_asset_id'),
    externalNetwork: text('external_network'),

    version: integer('version').notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check('item_instances_quantity_ck', sql`${t.quantity} >= 1`),
    check(
      'item_instances_location_ck',
      sql`CASE ${t.locationKind}
        WHEN 'container' THEN ${t.containerId} IS NOT NULL AND ${t.slotIndex} IS NOT NULL AND ${t.slotIndex} >= 0
          AND ${t.equipCharacterId} IS NULL AND ${t.equipSlot} IS NULL AND ${t.listingId} IS NULL AND ${t.tradeId} IS NULL
        WHEN 'equipped' THEN ${t.equipCharacterId} IS NOT NULL AND ${t.equipSlot} IS NOT NULL
          AND ${t.containerId} IS NULL AND ${t.slotIndex} IS NULL AND ${t.listingId} IS NULL AND ${t.tradeId} IS NULL
        WHEN 'marketplace_escrow' THEN ${t.listingId} IS NOT NULL
          AND ${t.containerId} IS NULL AND ${t.slotIndex} IS NULL AND ${t.equipCharacterId} IS NULL AND ${t.equipSlot} IS NULL AND ${t.tradeId} IS NULL
        WHEN 'trade_escrow' THEN ${t.tradeId} IS NOT NULL
          AND ${t.containerId} IS NULL AND ${t.slotIndex} IS NULL AND ${t.equipCharacterId} IS NULL AND ${t.equipSlot} IS NULL AND ${t.listingId} IS NULL
        WHEN 'destroyed' THEN ${t.destroyedReason} IS NOT NULL
          AND ${t.containerId} IS NULL AND ${t.slotIndex} IS NULL AND ${t.equipCharacterId} IS NULL AND ${t.equipSlot} IS NULL AND ${t.listingId} IS NULL AND ${t.tradeId} IS NULL
      END`,
    ),
    check(
      'item_instances_binding_ck',
      sql`CASE ${t.bindingKind}
        WHEN 'unbound' THEN ${t.boundCharacterId} IS NULL AND ${t.boundAccountId} IS NULL
        WHEN 'character' THEN ${t.boundCharacterId} IS NOT NULL
        WHEN 'account' THEN ${t.boundAccountId} IS NOT NULL
      END`,
    ),
    check(
      'item_instances_external_dormant_ck',
      sql`${t.externalOwnershipEnabled} = false AND ${t.externalAssetId} IS NULL AND ${t.externalNetwork} IS NULL`,
    ),
    uniqueIndex('item_instances_container_slot_uq')
      .on(t.containerId, t.slotIndex)
      .where(sql`${t.locationKind} = 'container'`),
    uniqueIndex('item_instances_equip_slot_uq')
      .on(t.equipCharacterId, t.equipSlot)
      .where(sql`${t.locationKind} = 'equipped'`),
    uniqueIndex('item_instances_listing_uq')
      .on(t.listingId)
      .where(sql`${t.locationKind} = 'marketplace_escrow'`),
    uniqueIndex('item_instances_source_ref_uq').on(t.sourceRef),
    index('item_instances_owner_character_idx').on(t.ownerCharacterId),
    index('item_instances_owner_account_idx').on(t.ownerAccountId),
    index('item_instances_template_idx').on(t.templateId),
  ],
);

/** Append-only provenance log. One row per meaningful event in an item's life. */
export const itemHistory = pgTable(
  'item_history',
  {
    id: uuid('id').primaryKey(),
    itemInstanceId: uuid('item_instance_id')
      .notNull()
      .references(() => itemInstances.id),
    eventType: text('event_type').notNull(),
    actorAccountId: uuid('actor_account_id'),
    actorCharacterId: uuid('actor_character_id'),
    fromOwnerAccountId: uuid('from_owner_account_id'),
    toOwnerAccountId: uuid('to_owner_account_id'),
    fromLocation: jsonb('from_location'),
    toLocation: jsonb('to_location'),
    quantity: integer('quantity'),
    correlationId: uuid('correlation_id'),
    details: jsonb('details').notNull().default({}),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('item_history_item_idx').on(t.itemInstanceId, t.occurredAt),
    index('item_history_correlation_idx').on(t.correlationId),
  ],
);

// ===========================================================================
// Currency
// ===========================================================================

/** Wallet balances ("currencies"). Character-scoped currencies set owner_character_id. */
export const currencyBalances = pgTable(
  'currency_balances',
  {
    id: uuid('id').primaryKey(),
    currencyId: text('currency_id').notNull(),
    ownerAccountId: uuid('owner_account_id')
      .notNull()
      .references(() => accounts.id),
    ownerCharacterId: uuid('owner_character_id').references(() => characters.id),
    amount: bigint('amount', { mode: 'number' }).notNull().default(0),
    version: integer('version').notNull().default(0),
    updatedAt: updatedAt(),
  },
  (t) => [
    check('currency_balances_nonneg_ck', sql`${t.amount} >= 0`),
    unique('currency_balances_owner_uq')
      .on(t.currencyId, t.ownerAccountId, t.ownerCharacterId)
      .nullsNotDistinct(),
  ],
);

/** Append-only ledger: every balance change with its reason. */
export const currencyLedger = pgTable(
  'currency_ledger',
  {
    id: uuid('id').primaryKey(),
    currencyId: text('currency_id').notNull(),
    ownerAccountId: uuid('owner_account_id').notNull(),
    ownerCharacterId: uuid('owner_character_id'),
    delta: bigint('delta', { mode: 'number' }).notNull(),
    balanceAfter: bigint('balance_after', { mode: 'number' }).notNull(),
    reason: text('reason').notNull(),
    correlationId: uuid('correlation_id'),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('currency_ledger_owner_idx').on(t.ownerAccountId, t.occurredAt)],
);

// ===========================================================================
// Marketplace
// ===========================================================================

export const marketplaceListings = pgTable(
  'marketplace_listings',
  {
    id: uuid('id').primaryKey(),
    sellerAccountId: uuid('seller_account_id')
      .notNull()
      .references(() => accounts.id),
    sellerCharacterId: uuid('seller_character_id')
      .notNull()
      .references(() => characters.id),
    itemInstanceId: uuid('item_instance_id')
      .notNull()
      .references(() => itemInstances.id),
    templateId: text('template_id').notNull(),
    rarityId: text('rarity_id').notNull(),
    quantity: integer('quantity').notNull(),
    currencyId: text('currency_id').notNull(),
    price: bigint('price', { mode: 'number' }).notNull(),
    listingFee: bigint('listing_fee', { mode: 'number' }).notNull(),
    status: listingStatus('status').notNull().default('active'),
    createdAt: createdAt(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    closedAt: timestamp('closed_at', { withTimezone: true }),
  },
  (t) => [
    check('marketplace_listings_price_ck', sql`${t.price} > 0`),
    uniqueIndex('marketplace_listings_active_item_uq')
      .on(t.itemInstanceId)
      .where(sql`${t.status} = 'active'`),
    index('marketplace_listings_browse_idx').on(t.status, t.templateId, t.price),
    index('marketplace_listings_expiry_idx').on(t.status, t.expiresAt),
    index('marketplace_listings_seller_idx').on(t.sellerAccountId, t.status),
  ],
);

export const marketplaceTransactions = pgTable(
  'marketplace_transactions',
  {
    id: uuid('id').primaryKey(),
    listingId: uuid('listing_id')
      .notNull()
      .references(() => marketplaceListings.id),
    itemInstanceId: uuid('item_instance_id')
      .notNull()
      .references(() => itemInstances.id),
    sellerAccountId: uuid('seller_account_id').notNull(),
    buyerAccountId: uuid('buyer_account_id').notNull(),
    buyerCharacterId: uuid('buyer_character_id').notNull(),
    currencyId: text('currency_id').notNull(),
    price: bigint('price', { mode: 'number' }).notNull(),
    saleFee: bigint('sale_fee', { mode: 'number' }).notNull(),
    sellerProceeds: bigint('seller_proceeds', { mode: 'number' }).notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // A listing can be sold at most once — the last line of defence against double-buy races.
    uniqueIndex('marketplace_transactions_listing_uq').on(t.listingId),
    index('marketplace_transactions_buyer_idx').on(t.buyerAccountId, t.occurredAt),
    index('marketplace_transactions_seller_idx').on(t.sellerAccountId, t.occurredAt),
  ],
);

// ===========================================================================
// Combat rewards
// ===========================================================================

/**
 * One row per (enemy death, rewarded character). The primary key makes XP/gold/loot for a single
 * kill exactly-once: a duplicate reward attempt violates it and the whole transaction rolls back.
 * Loot item instances additionally carry source_ref `kill:<killId>:<characterId>:<n>`.
 */
export const killRewards = pgTable(
  'kill_rewards',
  {
    killId: uuid('kill_id').notNull(),
    characterId: uuid('character_id')
      .notNull()
      .references(() => characters.id),
    enemyId: text('enemy_id').notNull(),
    zoneId: text('zone_id').notNull(),
    xp: integer('xp').notNull(),
    levelBefore: integer('level_before').notNull(),
    levelAfter: integer('level_after').notNull(),
    gold: bigint('gold', { mode: 'number' }).notNull().default(0),
    itemCount: integer('item_count').notNull().default(0),
    lostItemCount: integer('lost_item_count').notNull().default(0),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.killId, t.characterId] }),
    index('kill_rewards_character_idx').on(t.characterId, t.occurredAt),
  ],
);

/**
 * Durable kill outbox. A zone writes one row per enemy death BEFORE the death becomes visible
 * (write-ahead), then rewards are applied from this row exactly once. A crash at any point either
 * leaves no row (the death never happened) or a `pending` row that startup recovery / the sweep
 * finishes. The row also remembers the spawn slot's respawn time so a restart cannot resurrect a
 * dead enemy early or corrupt group population.
 */
export const killEvents = pgTable(
  'kill_events',
  {
    killId: uuid('kill_id').primaryKey(),
    zoneId: text('zone_id').notNull(),
    enemyId: text('enemy_id').notNull(),
    spawnPointId: text('spawn_point_id').notNull(),
    groupId: text('group_id'),
    characterId: uuid('character_id')
      .notNull()
      .references(() => characters.id),
    diedAt: timestamp('died_at', { withTimezone: true }).notNull(),
    respawnAt: timestamp('respawn_at', { withTimezone: true }).notNull(),
    /** pending -> rewarded | void (permanently unrewardable, e.g. character deleted). */
    status: text('status').notNull().default('pending'),
    attempts: integer('attempts').notNull().default(0),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).notNull().defaultNow(),
    lastError: text('last_error'),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    check('kill_events_status_ck', sql`${t.status} IN ('pending', 'rewarded', 'void')`),
    index('kill_events_pending_idx')
      .on(t.nextAttemptAt)
      .where(sql`${t.status} = 'pending'`),
    index('kill_events_respawn_idx').on(t.zoneId, t.respawnAt),
  ],
);

// ===========================================================================
// Quests
// ===========================================================================

/**
 * Per-character quest state (definitions live in game data). One row per (character, quest):
 * the primary key makes accepting a non-repeatable quest twice impossible. Only `active` and
 * `completed` are stored; availability and "ready to turn in" are derived. `progress` holds kill
 * counters keyed by objective id; collect objectives are derived from inventory. `rewarded_at` is
 * set in the same transaction that pays rewards and completes the quest.
 */
export const characterQuests = pgTable(
  'character_quests',
  {
    characterId: uuid('character_id')
      .notNull()
      .references(() => characters.id),
    questId: text('quest_id').notNull(),
    status: text('status').notNull(),
    progress: jsonb('progress').$type<Record<string, number>>().notNull().default({}),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }).notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    rewardedAt: timestamp('rewarded_at', { withTimezone: true }),
    /** Correlation id of the turn-in (item history, currency ledger). */
    turnInId: uuid('turn_in_id'),
    version: integer('version').notNull().default(1),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.characterId, t.questId] }),
    check('character_quests_status_ck', sql`${t.status} IN ('active', 'completed')`),
    check(
      'character_quests_completed_ck',
      sql`(${t.status} = 'completed') = (${t.completedAt} IS NOT NULL AND ${t.rewardedAt} IS NOT NULL)`,
    ),
  ],
);

// ===========================================================================
// Audit
// ===========================================================================

/** Security/fraud audit trail for privileged and economy-sensitive actions. */
export const auditLog = pgTable(
  'audit_log',
  {
    id: uuid('id').primaryKey(),
    actorAccountId: uuid('actor_account_id'),
    action: text('action').notNull(),
    targetType: text('target_type').notNull(),
    targetId: text('target_id').notNull(),
    requestId: text('request_id'),
    details: jsonb('details').notNull().default({}),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('audit_log_target_idx').on(t.targetType, t.targetId),
    index('audit_log_actor_idx').on(t.actorAccountId),
  ],
);
