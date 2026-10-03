CREATE TYPE "public"."account_role" AS ENUM('player', 'support', 'game_master', 'admin');--> statement-breakpoint
CREATE TYPE "public"."account_status" AS ENUM('active', 'suspended', 'banned');--> statement-breakpoint
CREATE TYPE "public"."container_kind" AS ENUM('backpack', 'material_pouch', 'character_vault', 'account_vault', 'guild_vault');--> statement-breakpoint
CREATE TYPE "public"."item_binding_kind" AS ENUM('unbound', 'character', 'account');--> statement-breakpoint
CREATE TYPE "public"."item_location_kind" AS ENUM('container', 'equipped', 'marketplace_escrow', 'trade_escrow', 'destroyed');--> statement-breakpoint
CREATE TYPE "public"."listing_status" AS ENUM('active', 'sold', 'cancelled', 'expired');--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"display_name" text NOT NULL,
	"role" "account_role" DEFAULT 'player' NOT NULL,
	"status" "account_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY NOT NULL,
	"actor_account_id" uuid,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"request_id" text,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_identities" (
	"id" uuid PRIMARY KEY NOT NULL,
	"account_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"provider_subject" text NOT NULL,
	"secret_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "characters" (
	"id" uuid PRIMARY KEY NOT NULL,
	"account_id" uuid NOT NULL,
	"name" text NOT NULL,
	"class_id" text NOT NULL,
	"specialisation_id" text,
	"level" integer DEFAULT 1 NOT NULL,
	"xp" bigint DEFAULT 0 NOT NULL,
	"zone_id" text NOT NULL,
	"pos_x" double precision DEFAULT 0 NOT NULL,
	"pos_y" double precision DEFAULT 0 NOT NULL,
	"pos_z" double precision DEFAULT 0 NOT NULL,
	"rotation_y" double precision DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "characters_level_ck" CHECK ("characters"."level" >= 1),
	CONSTRAINT "characters_xp_ck" CHECK ("characters"."xp" >= 0)
);
--> statement-breakpoint
CREATE TABLE "containers" (
	"id" uuid PRIMARY KEY NOT NULL,
	"kind" "container_kind" NOT NULL,
	"owner_account_id" uuid,
	"owner_character_id" uuid,
	"owner_guild_id" uuid,
	"capacity" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "containers_capacity_ck" CHECK ("containers"."capacity" > 0 AND "containers"."capacity" <= 1000),
	CONSTRAINT "containers_owner_ck" CHECK (CASE "containers"."kind"
        WHEN 'account_vault' THEN "containers"."owner_account_id" IS NOT NULL AND "containers"."owner_character_id" IS NULL AND "containers"."owner_guild_id" IS NULL
        WHEN 'guild_vault' THEN "containers"."owner_guild_id" IS NOT NULL AND "containers"."owner_character_id" IS NULL
        ELSE "containers"."owner_account_id" IS NOT NULL AND "containers"."owner_character_id" IS NOT NULL AND "containers"."owner_guild_id" IS NULL
      END)
);
--> statement-breakpoint
CREATE TABLE "currency_balances" (
	"id" uuid PRIMARY KEY NOT NULL,
	"currency_id" text NOT NULL,
	"owner_account_id" uuid NOT NULL,
	"owner_character_id" uuid,
	"amount" bigint DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "currency_balances_owner_uq" UNIQUE NULLS NOT DISTINCT("currency_id","owner_account_id","owner_character_id"),
	CONSTRAINT "currency_balances_nonneg_ck" CHECK ("currency_balances"."amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "currency_ledger" (
	"id" uuid PRIMARY KEY NOT NULL,
	"currency_id" text NOT NULL,
	"owner_account_id" uuid NOT NULL,
	"owner_character_id" uuid,
	"delta" bigint NOT NULL,
	"balance_after" bigint NOT NULL,
	"reason" text NOT NULL,
	"correlation_id" uuid,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "item_history" (
	"id" uuid PRIMARY KEY NOT NULL,
	"item_instance_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"actor_account_id" uuid,
	"actor_character_id" uuid,
	"from_owner_account_id" uuid,
	"to_owner_account_id" uuid,
	"from_location" jsonb,
	"to_location" jsonb,
	"quantity" integer,
	"correlation_id" uuid,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "item_instances" (
	"id" uuid PRIMARY KEY NOT NULL,
	"template_id" text NOT NULL,
	"rarity_id" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"owner_account_id" uuid NOT NULL,
	"owner_character_id" uuid,
	"original_owner_account_id" uuid,
	"original_owner_character_id" uuid,
	"crafter_character_id" uuid,
	"acquisition_method" text NOT NULL,
	"source_ref" text,
	"location_kind" "item_location_kind" NOT NULL,
	"container_id" uuid,
	"slot_index" integer,
	"equip_character_id" uuid,
	"equip_slot" text,
	"listing_id" uuid,
	"trade_id" uuid,
	"destroyed_reason" text,
	"binding_kind" "item_binding_kind" DEFAULT 'unbound' NOT NULL,
	"bound_character_id" uuid,
	"bound_account_id" uuid,
	"bound_at" timestamp with time zone,
	"stats" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"modifiers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sockets" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"enchantments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"durability_current" integer,
	"durability_max" integer,
	"appearance" jsonb,
	"is_locked" boolean DEFAULT false NOT NULL,
	"is_favourite" boolean DEFAULT false NOT NULL,
	"is_junk" boolean DEFAULT false NOT NULL,
	"external_ownership_enabled" boolean DEFAULT false NOT NULL,
	"external_asset_id" text,
	"external_network" text,
	"version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "item_instances_quantity_ck" CHECK ("item_instances"."quantity" >= 1),
	CONSTRAINT "item_instances_location_ck" CHECK (CASE "item_instances"."location_kind"
        WHEN 'container' THEN "item_instances"."container_id" IS NOT NULL AND "item_instances"."slot_index" IS NOT NULL AND "item_instances"."slot_index" >= 0
          AND "item_instances"."equip_character_id" IS NULL AND "item_instances"."equip_slot" IS NULL AND "item_instances"."listing_id" IS NULL AND "item_instances"."trade_id" IS NULL
        WHEN 'equipped' THEN "item_instances"."equip_character_id" IS NOT NULL AND "item_instances"."equip_slot" IS NOT NULL
          AND "item_instances"."container_id" IS NULL AND "item_instances"."slot_index" IS NULL AND "item_instances"."listing_id" IS NULL AND "item_instances"."trade_id" IS NULL
        WHEN 'marketplace_escrow' THEN "item_instances"."listing_id" IS NOT NULL
          AND "item_instances"."container_id" IS NULL AND "item_instances"."slot_index" IS NULL AND "item_instances"."equip_character_id" IS NULL AND "item_instances"."equip_slot" IS NULL AND "item_instances"."trade_id" IS NULL
        WHEN 'trade_escrow' THEN "item_instances"."trade_id" IS NOT NULL
          AND "item_instances"."container_id" IS NULL AND "item_instances"."slot_index" IS NULL AND "item_instances"."equip_character_id" IS NULL AND "item_instances"."equip_slot" IS NULL AND "item_instances"."listing_id" IS NULL
        WHEN 'destroyed' THEN "item_instances"."destroyed_reason" IS NOT NULL
          AND "item_instances"."container_id" IS NULL AND "item_instances"."slot_index" IS NULL AND "item_instances"."equip_character_id" IS NULL AND "item_instances"."equip_slot" IS NULL AND "item_instances"."listing_id" IS NULL AND "item_instances"."trade_id" IS NULL
      END),
	CONSTRAINT "item_instances_binding_ck" CHECK (CASE "item_instances"."binding_kind"
        WHEN 'unbound' THEN "item_instances"."bound_character_id" IS NULL AND "item_instances"."bound_account_id" IS NULL
        WHEN 'character' THEN "item_instances"."bound_character_id" IS NOT NULL
        WHEN 'account' THEN "item_instances"."bound_account_id" IS NOT NULL
      END),
	CONSTRAINT "item_instances_external_dormant_ck" CHECK ("item_instances"."external_ownership_enabled" = false AND "item_instances"."external_asset_id" IS NULL AND "item_instances"."external_network" IS NULL)
);
--> statement-breakpoint
CREATE TABLE "item_templates" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"rarity_id" text NOT NULL,
	"max_stack" integer NOT NULL,
	"tradeable" boolean NOT NULL,
	"data" jsonb NOT NULL,
	"content_hash" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "marketplace_listings" (
	"id" uuid PRIMARY KEY NOT NULL,
	"seller_account_id" uuid NOT NULL,
	"seller_character_id" uuid NOT NULL,
	"item_instance_id" uuid NOT NULL,
	"template_id" text NOT NULL,
	"rarity_id" text NOT NULL,
	"quantity" integer NOT NULL,
	"currency_id" text NOT NULL,
	"price" bigint NOT NULL,
	"listing_fee" bigint NOT NULL,
	"status" "listing_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"closed_at" timestamp with time zone,
	CONSTRAINT "marketplace_listings_price_ck" CHECK ("marketplace_listings"."price" > 0)
);
--> statement-breakpoint
CREATE TABLE "marketplace_transactions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"listing_id" uuid NOT NULL,
	"item_instance_id" uuid NOT NULL,
	"seller_account_id" uuid NOT NULL,
	"buyer_account_id" uuid NOT NULL,
	"buyer_character_id" uuid NOT NULL,
	"currency_id" text NOT NULL,
	"price" bigint NOT NULL,
	"sale_fee" bigint NOT NULL,
	"seller_proceeds" bigint NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"account_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"client_kind" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"last_seen_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "auth_identities" ADD CONSTRAINT "auth_identities_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "characters" ADD CONSTRAINT "characters_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "containers" ADD CONSTRAINT "containers_owner_account_id_accounts_id_fk" FOREIGN KEY ("owner_account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "containers" ADD CONSTRAINT "containers_owner_character_id_characters_id_fk" FOREIGN KEY ("owner_character_id") REFERENCES "public"."characters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "currency_balances" ADD CONSTRAINT "currency_balances_owner_account_id_accounts_id_fk" FOREIGN KEY ("owner_account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "currency_balances" ADD CONSTRAINT "currency_balances_owner_character_id_characters_id_fk" FOREIGN KEY ("owner_character_id") REFERENCES "public"."characters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_history" ADD CONSTRAINT "item_history_item_instance_id_item_instances_id_fk" FOREIGN KEY ("item_instance_id") REFERENCES "public"."item_instances"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_instances" ADD CONSTRAINT "item_instances_template_id_item_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."item_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_instances" ADD CONSTRAINT "item_instances_owner_account_id_accounts_id_fk" FOREIGN KEY ("owner_account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_instances" ADD CONSTRAINT "item_instances_owner_character_id_characters_id_fk" FOREIGN KEY ("owner_character_id") REFERENCES "public"."characters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_instances" ADD CONSTRAINT "item_instances_container_id_containers_id_fk" FOREIGN KEY ("container_id") REFERENCES "public"."containers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_instances" ADD CONSTRAINT "item_instances_equip_character_id_characters_id_fk" FOREIGN KEY ("equip_character_id") REFERENCES "public"."characters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace_listings" ADD CONSTRAINT "marketplace_listings_seller_account_id_accounts_id_fk" FOREIGN KEY ("seller_account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace_listings" ADD CONSTRAINT "marketplace_listings_seller_character_id_characters_id_fk" FOREIGN KEY ("seller_character_id") REFERENCES "public"."characters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace_listings" ADD CONSTRAINT "marketplace_listings_item_instance_id_item_instances_id_fk" FOREIGN KEY ("item_instance_id") REFERENCES "public"."item_instances"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace_transactions" ADD CONSTRAINT "marketplace_transactions_listing_id_marketplace_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."marketplace_listings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace_transactions" ADD CONSTRAINT "marketplace_transactions_item_instance_id_item_instances_id_fk" FOREIGN KEY ("item_instance_id") REFERENCES "public"."item_instances"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_username_lower_uq" ON "accounts" USING btree (lower("username"));--> statement-breakpoint
CREATE INDEX "audit_log_target_idx" ON "audit_log" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "audit_log_actor_idx" ON "audit_log" USING btree ("actor_account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "auth_identities_provider_subject_uq" ON "auth_identities" USING btree ("provider","provider_subject");--> statement-breakpoint
CREATE UNIQUE INDEX "characters_name_lower_uq" ON "characters" USING btree (lower("name"));--> statement-breakpoint
CREATE INDEX "characters_account_idx" ON "characters" USING btree ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "containers_character_kind_uq" ON "containers" USING btree ("owner_character_id","kind") WHERE "containers"."owner_character_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "containers_account_vault_uq" ON "containers" USING btree ("owner_account_id") WHERE "containers"."kind" = 'account_vault';--> statement-breakpoint
CREATE INDEX "currency_ledger_owner_idx" ON "currency_ledger" USING btree ("owner_account_id","occurred_at");--> statement-breakpoint
CREATE INDEX "item_history_item_idx" ON "item_history" USING btree ("item_instance_id","occurred_at");--> statement-breakpoint
CREATE INDEX "item_history_correlation_idx" ON "item_history" USING btree ("correlation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "item_instances_container_slot_uq" ON "item_instances" USING btree ("container_id","slot_index") WHERE "item_instances"."location_kind" = 'container';--> statement-breakpoint
CREATE UNIQUE INDEX "item_instances_equip_slot_uq" ON "item_instances" USING btree ("equip_character_id","equip_slot") WHERE "item_instances"."location_kind" = 'equipped';--> statement-breakpoint
CREATE UNIQUE INDEX "item_instances_listing_uq" ON "item_instances" USING btree ("listing_id") WHERE "item_instances"."location_kind" = 'marketplace_escrow';--> statement-breakpoint
CREATE UNIQUE INDEX "item_instances_source_ref_uq" ON "item_instances" USING btree ("source_ref");--> statement-breakpoint
CREATE INDEX "item_instances_owner_character_idx" ON "item_instances" USING btree ("owner_character_id");--> statement-breakpoint
CREATE INDEX "item_instances_owner_account_idx" ON "item_instances" USING btree ("owner_account_id");--> statement-breakpoint
CREATE INDEX "item_instances_template_idx" ON "item_instances" USING btree ("template_id");--> statement-breakpoint
CREATE UNIQUE INDEX "marketplace_listings_active_item_uq" ON "marketplace_listings" USING btree ("item_instance_id") WHERE "marketplace_listings"."status" = 'active';--> statement-breakpoint
CREATE INDEX "marketplace_listings_browse_idx" ON "marketplace_listings" USING btree ("status","template_id","price");--> statement-breakpoint
CREATE INDEX "marketplace_listings_expiry_idx" ON "marketplace_listings" USING btree ("status","expires_at");--> statement-breakpoint
CREATE INDEX "marketplace_listings_seller_idx" ON "marketplace_listings" USING btree ("seller_account_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "marketplace_transactions_listing_uq" ON "marketplace_transactions" USING btree ("listing_id");--> statement-breakpoint
CREATE INDEX "marketplace_transactions_buyer_idx" ON "marketplace_transactions" USING btree ("buyer_account_id","occurred_at");--> statement-breakpoint
CREATE INDEX "marketplace_transactions_seller_idx" ON "marketplace_transactions" USING btree ("seller_account_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_hash_uq" ON "sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "sessions_account_idx" ON "sessions" USING btree ("account_id");