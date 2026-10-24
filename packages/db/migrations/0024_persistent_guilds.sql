CREATE TABLE "guild_invites" (
	"guild_id" uuid NOT NULL,
	"character_id" uuid NOT NULL,
	"invited_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "guild_invites_guild_id_character_id_pk" PRIMARY KEY("guild_id","character_id")
);
--> statement-breakpoint
CREATE TABLE "guild_members" (
	"character_id" uuid PRIMARY KEY NOT NULL,
	"guild_id" uuid NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "guild_members_role_ck" CHECK ("guild_members"."role" in ('member','officer'))
);
--> statement-breakpoint
CREATE TABLE "guild_messages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"guild_id" uuid NOT NULL,
	"from_account_id" uuid NOT NULL,
	"from_character_id" uuid NOT NULL,
	"from_name" text NOT NULL,
	"body" text NOT NULL,
	"sent_at" timestamp with time zone NOT NULL,
	CONSTRAINT "guild_messages_body_ck" CHECK (char_length(btrim("guild_messages"."body")) between 1 and 500)
);
--> statement-breakpoint
CREATE TABLE "guilds" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"tag" text NOT NULL,
	"leader_character_id" uuid NOT NULL,
	"motd" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"disbanded_at" timestamp with time zone,
	CONSTRAINT "guilds_name_ck" CHECK (char_length(btrim("guilds"."name")) between 3 and 32),
	CONSTRAINT "guilds_tag_ck" CHECK ("guilds"."tag" ~ '^[A-Z0-9]{2,5}$'),
	CONSTRAINT "guilds_motd_ck" CHECK (char_length("guilds"."motd") <= 500)
);
--> statement-breakpoint
ALTER TABLE "guild_invites" ADD CONSTRAINT "guild_invites_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guild_invites" ADD CONSTRAINT "guild_invites_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guild_invites" ADD CONSTRAINT "guild_invites_invited_by_characters_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."characters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guild_members" ADD CONSTRAINT "guild_members_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guild_members" ADD CONSTRAINT "guild_members_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guild_messages" ADD CONSTRAINT "guild_messages_guild_id_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guilds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guild_messages" ADD CONSTRAINT "guild_messages_from_account_id_accounts_id_fk" FOREIGN KEY ("from_account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guild_messages" ADD CONSTRAINT "guild_messages_from_character_id_characters_id_fk" FOREIGN KEY ("from_character_id") REFERENCES "public"."characters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guilds" ADD CONSTRAINT "guilds_leader_character_id_characters_id_fk" FOREIGN KEY ("leader_character_id") REFERENCES "public"."characters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "guild_invites_character_idx" ON "guild_invites" USING btree ("character_id");--> statement-breakpoint
CREATE INDEX "guild_members_guild_idx" ON "guild_members" USING btree ("guild_id");--> statement-breakpoint
CREATE INDEX "guild_messages_history_idx" ON "guild_messages" USING btree ("guild_id","sent_at","id");--> statement-breakpoint
CREATE INDEX "guild_messages_rate_idx" ON "guild_messages" USING btree ("from_account_id","sent_at");--> statement-breakpoint
CREATE UNIQUE INDEX "guilds_name_active_uq" ON "guilds" USING btree (lower("name")) WHERE "guilds"."disbanded_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "guilds_tag_active_uq" ON "guilds" USING btree (lower("tag")) WHERE "guilds"."disbanded_at" is null;