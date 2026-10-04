-- Exact additive Hollow content upgrade; preserve every recovery field and pending reward.
-- Stop zone owners before migration. New recovery adds the ungrouped leader only if neither
-- live/dead state nor its pending respawn exists. Existing geometry is unchanged.
UPDATE zone_checkpoints
SET payload = jsonb_set(payload::jsonb, '{contentHash}',
  '"f8f438e06fed39f2d91ced946322aa87bba54bab3631e49cde5ef11fbeffb113"'::jsonb)::text
WHERE zone_id = 'zone.greenvale.meadows'
  AND payload::jsonb->>'contentHash' = '1aeb2392850b5f0455d5eda2ffcaf57ada86fe44e8024fbd71110be41ff94011';
