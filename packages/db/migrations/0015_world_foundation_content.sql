-- Additive world catalogs/region zones; preserve every existing starter checkpoint field.
-- Character zone ownership is now written atomically with its owned recovery image.
UPDATE zone_checkpoints
SET payload = jsonb_set(payload::jsonb, '{contentHash}', '"96afea3256a20111a723829672002fc96e7b5151ecb0d809fa27f4d6c3899081"'::jsonb)::text
WHERE zone_id = 'zone.greenvale.meadows'
  AND payload::jsonb->>'contentHash' = 'fce8c1bf74e3e8e9fd3019432542026bb82f6a65060914ce468e9d255876ace1';
