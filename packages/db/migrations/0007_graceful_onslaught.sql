ALTER TABLE "kill_events" ADD COLUMN "recipients" jsonb;--> statement-breakpoint
ALTER TABLE "kill_events" ADD COLUMN "loot_character_id" uuid;