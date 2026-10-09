CREATE INDEX "consumable_uses_pending_idx" ON "consumable_uses" USING btree ("character_id") WHERE "consumable_uses"."applied_at" is null;--> statement-breakpoint
CREATE INDEX "craft_jobs_character_recent_idx" ON "craft_jobs" USING btree ("character_id","created_at");--> statement-breakpoint
CREATE INDEX "dungeon_instances_live_expiry_idx" ON "dungeon_instances" USING btree ("expires_at") WHERE "dungeon_instances"."status" <> 'expired';--> statement-breakpoint
CREATE INDEX "dungeon_members_character_idx" ON "dungeon_members" USING btree ("character_id");