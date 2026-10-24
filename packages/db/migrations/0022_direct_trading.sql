CREATE TABLE "direct_trades" (
	"id" uuid PRIMARY KEY NOT NULL,
	"initiator_id" uuid NOT NULL,
	"counterparty_id" uuid NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"sides" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "direct_trades_distinct_ck" CHECK ("direct_trades"."initiator_id" <> "direct_trades"."counterparty_id"),
	CONSTRAINT "direct_trades_status_ck" CHECK ("direct_trades"."status" IN ('open','locked','completed','cancelled','expired')),
	CONSTRAINT "direct_trades_revision_ck" CHECK ("direct_trades"."revision" >= 0)
);
--> statement-breakpoint
ALTER TABLE "direct_trades" ADD CONSTRAINT "direct_trades_initiator_id_characters_id_fk" FOREIGN KEY ("initiator_id") REFERENCES "public"."characters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "direct_trades" ADD CONSTRAINT "direct_trades_counterparty_id_characters_id_fk" FOREIGN KEY ("counterparty_id") REFERENCES "public"."characters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "direct_trades_initiator_idx" ON "direct_trades" USING btree ("initiator_id","created_at");--> statement-breakpoint
CREATE INDEX "direct_trades_counterparty_idx" ON "direct_trades" USING btree ("counterparty_id","created_at");