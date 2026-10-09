CREATE TABLE "character_professions" (
	"character_id" uuid NOT NULL,
	"profession_id" text NOT NULL,
	"xp" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "character_professions_character_id_profession_id_pk" PRIMARY KEY("character_id","profession_id"),
	CONSTRAINT "profession_xp_ck" CHECK ("character_professions"."xp" >= 0)
);
--> statement-breakpoint
CREATE TABLE "consumable_cooldowns" (
	"character_id" uuid PRIMARY KEY NOT NULL,
	"ready_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consumable_uses" (
	"id" uuid PRIMARY KEY NOT NULL,
	"character_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"heal" integer NOT NULL,
	"applied_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "craft_jobs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"character_id" uuid NOT NULL,
	"offer_id" text NOT NULL,
	"ready_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dungeon_instances" (
	"id" uuid PRIMARY KEY NOT NULL,
	"dungeon_id" text NOT NULL,
	"owner_character_id" uuid NOT NULL,
	"party_id" uuid,
	"status" text DEFAULT 'active' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dungeon_instance_status_ck" CHECK ("dungeon_instances"."status" in ('active','completed','expired'))
);
--> statement-breakpoint
CREATE TABLE "dungeon_members" (
	"instance_id" uuid NOT NULL,
	"character_id" uuid NOT NULL,
	"joined_at" timestamp with time zone,
	"rewarded_at" timestamp with time zone,
	CONSTRAINT "dungeon_members_instance_id_character_id_pk" PRIMARY KEY("instance_id","character_id")
);
--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "instance_id" uuid;--> statement-breakpoint
ALTER TABLE "character_professions" ADD CONSTRAINT "character_professions_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumable_cooldowns" ADD CONSTRAINT "consumable_cooldowns_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumable_uses" ADD CONSTRAINT "consumable_uses_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumable_uses" ADD CONSTRAINT "consumable_uses_item_id_item_instances_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."item_instances"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "craft_jobs" ADD CONSTRAINT "craft_jobs_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dungeon_instances" ADD CONSTRAINT "dungeon_instances_owner_character_id_characters_id_fk" FOREIGN KEY ("owner_character_id") REFERENCES "public"."characters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dungeon_members" ADD CONSTRAINT "dungeon_members_instance_id_dungeon_instances_id_fk" FOREIGN KEY ("instance_id") REFERENCES "public"."dungeon_instances"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dungeon_members" ADD CONSTRAINT "dungeon_members_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "craft_jobs_one_active_uq" ON "craft_jobs" USING btree ("character_id") WHERE "craft_jobs"."completed_at" is null;
--> statement-breakpoint
-- A persisted instance route must belong to the frozen admission cohort.
ALTER TABLE characters ADD CONSTRAINT characters_instance_membership_fk
FOREIGN KEY(instance_id,id) REFERENCES dungeon_members(instance_id,character_id);

--> statement-breakpoint
-- Exact additive content upgrade preserves existing player/enemy/party/checkpoint state.
UPDATE zone_checkpoints SET payload=jsonb_set(payload::jsonb,'{contentHash}','"8525863b6eb671ef0cafbbd47098c9aa4041cded93aaa08217bcaf2c11cfea85"'::jsonb)::text WHERE payload::jsonb->>'contentHash'='d22461380e9af16206f663e294bf1d462eaa47d4d2ce4b5cf5b4dc4a391fbc94';
