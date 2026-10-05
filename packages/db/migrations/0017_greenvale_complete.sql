CREATE TABLE service_receipts (
 character_id uuid NOT NULL REFERENCES characters(id), request_id uuid NOT NULL,
 offer_id text NOT NULL, occurred_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(character_id, request_id)
);
--> statement-breakpoint
CREATE TABLE character_discoveries (
 character_id uuid NOT NULL REFERENCES characters(id), location_id text NOT NULL,
 discovered_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(character_id, location_id)
);
--> statement-breakpoint
-- Additive content only. Preserve all live state, controllers, rewards, cooldowns and parties.
UPDATE zone_checkpoints
SET payload = jsonb_set(payload::jsonb, '{contentHash}', '"312a431615a7543f7e8564f34dc6de0fecc46a3e55497fbcbe5df9af22cdafca"'::jsonb)::text
WHERE payload::jsonb->>'contentHash' = '5a781d5c88c14adf05c8a453d5959699fa1e635cf1d9fa8a8122ea19be7f8dd7';
