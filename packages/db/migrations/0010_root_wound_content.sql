-- Exact additive Root-Wound content upgrade. Stop owners before migrating.
-- Preserve every existing character/enemy/cooldown/party/reward checkpoint field.
-- Recovery adds only the missing ungrouped Lantern; pending respawns remain authoritative.
UPDATE zone_checkpoints
SET payload = jsonb_set(payload::jsonb, '{contentHash}',
  '"8d18c22459d9ad219d56832b052805115cf907fd8bbceacdb22e4bb88af2674b"'::jsonb)::text
WHERE zone_id = 'zone.greenvale.meadows'
  AND payload::jsonb->>'contentHash' = 'f8f438e06fed39f2d91ced946322aa87bba54bab3631e49cde5ef11fbeffb113';
