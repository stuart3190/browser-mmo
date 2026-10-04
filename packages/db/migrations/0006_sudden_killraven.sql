CREATE TABLE "zone_checkpoints" (
	"zone_id" text PRIMARY KEY NOT NULL,
	"version" integer NOT NULL,
	"payload" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
