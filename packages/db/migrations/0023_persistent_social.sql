CREATE TABLE "direct_messages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"from_account_id" uuid NOT NULL,
	"to_account_id" uuid NOT NULL,
	"from_character_id" uuid NOT NULL,
	"from_name" text NOT NULL,
	"body" text NOT NULL,
	"sent_at" timestamp with time zone NOT NULL,
	"read_at" timestamp with time zone,
	CONSTRAINT "direct_messages_distinct_ck" CHECK ("direct_messages"."from_account_id" <> "direct_messages"."to_account_id"),
	CONSTRAINT "direct_messages_body_ck" CHECK (char_length(btrim("direct_messages"."body")) between 1 and 500)
);
--> statement-breakpoint
CREATE TABLE "friendships" (
	"low_account_id" uuid NOT NULL,
	"high_account_id" uuid NOT NULL,
	"requester_id" uuid NOT NULL,
	"low_name" text NOT NULL,
	"high_name" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "friendships_low_account_id_high_account_id_pk" PRIMARY KEY("low_account_id","high_account_id"),
	CONSTRAINT "friendships_order_ck" CHECK ("friendships"."low_account_id" < "friendships"."high_account_id"),
	CONSTRAINT "friendships_requester_ck" CHECK ("friendships"."requester_id" in ("friendships"."low_account_id","friendships"."high_account_id")),
	CONSTRAINT "friendships_status_ck" CHECK ("friendships"."status" in ('pending','accepted'))
);
--> statement-breakpoint
CREATE TABLE "social_blocks" (
	"account_id" uuid NOT NULL,
	"blocked_account_id" uuid NOT NULL,
	"blocked_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "social_blocks_account_id_blocked_account_id_pk" PRIMARY KEY("account_id","blocked_account_id"),
	CONSTRAINT "social_blocks_distinct_ck" CHECK ("social_blocks"."account_id" <> "social_blocks"."blocked_account_id")
);
--> statement-breakpoint
ALTER TABLE "direct_messages" ADD CONSTRAINT "direct_messages_from_account_id_accounts_id_fk" FOREIGN KEY ("from_account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "direct_messages" ADD CONSTRAINT "direct_messages_to_account_id_accounts_id_fk" FOREIGN KEY ("to_account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "direct_messages" ADD CONSTRAINT "direct_messages_from_character_id_characters_id_fk" FOREIGN KEY ("from_character_id") REFERENCES "public"."characters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friendships" ADD CONSTRAINT "friendships_low_account_id_accounts_id_fk" FOREIGN KEY ("low_account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friendships" ADD CONSTRAINT "friendships_high_account_id_accounts_id_fk" FOREIGN KEY ("high_account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friendships" ADD CONSTRAINT "friendships_requester_id_accounts_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_blocks" ADD CONSTRAINT "social_blocks_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_blocks" ADD CONSTRAINT "social_blocks_blocked_account_id_accounts_id_fk" FOREIGN KEY ("blocked_account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "direct_messages_conversation_idx" ON "direct_messages" USING btree ("from_account_id","to_account_id","sent_at","id");--> statement-breakpoint
CREATE INDEX "direct_messages_sender_rate_idx" ON "direct_messages" USING btree ("from_account_id","sent_at");--> statement-breakpoint
CREATE INDEX "direct_messages_unread_idx" ON "direct_messages" USING btree ("to_account_id","from_account_id") WHERE "direct_messages"."read_at" is null;--> statement-breakpoint
CREATE INDEX "friendships_high_idx" ON "friendships" USING btree ("high_account_id");--> statement-breakpoint
CREATE INDEX "social_blocks_target_idx" ON "social_blocks" USING btree ("blocked_account_id");