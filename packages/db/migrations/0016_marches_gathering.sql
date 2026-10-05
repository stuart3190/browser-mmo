CREATE TABLE resource_harvests (
  node_id text PRIMARY KEY,
  ready_at timestamptz NOT NULL
);
--> statement-breakpoint
-- Additive catalog changes; preserve every live field in all owned zone recovery images.
UPDATE zone_checkpoints
SET payload = jsonb_set(payload::jsonb, '{contentHash}', '"5a781d5c88c14adf05c8a453d5959699fa1e635cf1d9fa8a8122ea19be7f8dd7"'::jsonb)::text
WHERE payload::jsonb->>'contentHash' = '96afea3256a20111a723829672002fc96e7b5151ecb0d809fa27f4d6c3899081';
