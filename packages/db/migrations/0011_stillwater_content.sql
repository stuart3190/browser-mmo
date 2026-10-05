-- Exact additive Stillwater upgrade; stop the zone owner before migrating.
-- Preserve characters, health, positions, cooldowns, parties and pending rewards verbatim.
-- Recovery adds only missing ungrouped Tess/Warden spawns, preserving pending respawns.
UPDATE zone_checkpoints
SET payload = jsonb_set(payload::jsonb, '{contentHash}',
  '"9614a98b965120cf0f6ff2e419b5b71042d96226a9aa1df19d3fbd755944f50b"'::jsonb)::text
WHERE zone_id = 'zone.greenvale.meadows'
  AND payload::jsonb->>'contentHash' = '8d18c22459d9ad219d56832b052805115cf907fd8bbceacdb22e4bb88af2674b';
