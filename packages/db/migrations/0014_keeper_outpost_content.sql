-- Additive outpost content; keep every durable player/cooldown/reward/party field intact.
UPDATE zone_checkpoints
SET payload = jsonb_set(payload::jsonb, '{contentHash}', '"fce8c1bf74e3e8e9fd3019432542026bb82f6a65060914ce468e9d255876ace1"'::jsonb)::text
WHERE zone_id = 'zone.greenvale.meadows'
  AND payload::jsonb->>'contentHash' = 'cb487f9ce444543a86798f540285a5bdbf9f3a6e81f64869152483bf33d9362c';
