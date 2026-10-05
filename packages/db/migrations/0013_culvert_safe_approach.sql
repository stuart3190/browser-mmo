-- Playtest correction: culvert beyond the Northwood leash. Preserve all live state.
UPDATE zone_checkpoints
SET payload = jsonb_set(payload::jsonb, '{contentHash}', '"cb487f9ce444543a86798f540285a5bdbf9f3a6e81f64869152483bf33d9362c"'::jsonb)::text
WHERE zone_id = 'zone.greenvale.meadows'
  AND payload::jsonb->>'contentHash' = '73580f2d38ee69c52e3145b06993e678620ed8d34c73efc5d20ffcec2f8943c7';
