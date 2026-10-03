CREATE TABLE "kill_rewards" (
	"kill_id" uuid NOT NULL,
	"character_id" uuid NOT NULL,
	"enemy_id" text NOT NULL,
	"zone_id" text NOT NULL,
	"xp" integer NOT NULL,
	"level_before" integer NOT NULL,
	"level_after" integer NOT NULL,
	"gold" bigint DEFAULT 0 NOT NULL,
	"item_count" integer DEFAULT 0 NOT NULL,
	"lost_item_count" integer DEFAULT 0 NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "kill_rewards_kill_id_character_id_pk" PRIMARY KEY("kill_id","character_id")
);
--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "current_health" integer;--> statement-breakpoint
ALTER TABLE "kill_rewards" ADD CONSTRAINT "kill_rewards_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "kill_rewards_character_idx" ON "kill_rewards" USING btree ("character_id","occurred_at");--> statement-breakpoint
ALTER TABLE "characters" ADD CONSTRAINT "characters_health_ck" CHECK ("characters"."current_health" IS NULL OR "characters"."current_health" >= 0);