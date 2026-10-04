CREATE TABLE "character_quests" (
	"character_id" uuid NOT NULL,
	"quest_id" text NOT NULL,
	"status" text NOT NULL,
	"progress" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"accepted_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"rewarded_at" timestamp with time zone,
	"turn_in_id" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "character_quests_character_id_quest_id_pk" PRIMARY KEY("character_id","quest_id"),
	CONSTRAINT "character_quests_status_ck" CHECK ("character_quests"."status" IN ('active', 'completed')),
	CONSTRAINT "character_quests_completed_ck" CHECK (("character_quests"."status" = 'completed') = ("character_quests"."completed_at" IS NOT NULL AND "character_quests"."rewarded_at" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "character_quests" ADD CONSTRAINT "character_quests_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE no action ON UPDATE no action;