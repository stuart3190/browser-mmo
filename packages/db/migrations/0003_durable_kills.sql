ALTER TYPE "public"."container_kind" ADD VALUE 'mailbox';--> statement-breakpoint
CREATE TABLE "kill_events" (
	"kill_id" uuid PRIMARY KEY NOT NULL,
	"zone_id" text NOT NULL,
	"enemy_id" text NOT NULL,
	"spawn_point_id" text NOT NULL,
	"group_id" text,
	"character_id" uuid NOT NULL,
	"died_at" timestamp with time zone NOT NULL,
	"respawn_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_error" text,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "kill_events_status_ck" CHECK ("kill_events"."status" IN ('pending', 'rewarded', 'void'))
);
--> statement-breakpoint
ALTER TABLE "kill_events" ADD CONSTRAINT "kill_events_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "kill_events_pending_idx" ON "kill_events" USING btree ("next_attempt_at") WHERE "kill_events"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "kill_events_respawn_idx" ON "kill_events" USING btree ("zone_id","respawn_at");