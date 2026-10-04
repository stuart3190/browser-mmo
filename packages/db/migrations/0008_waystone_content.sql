-- Additive Greenvale content upgrade: keeper NPC + one quest. Existing terrain, enemies,
-- identities, pending kills, health/position/cooldowns and parties are unchanged.
-- The new simulation rehydrates missing static NPC spawns after restoring existing IDs.
-- Match the exact prior content hash only; unknown checkpoints still fail closed at startup.
UPDATE zone_checkpoints
SET payload = jsonb_set(payload::jsonb, '{contentHash}',
  '"1aeb2392850b5f0455d5eda2ffcaf57ada86fe44e8024fbd71110be41ff94011"'::jsonb)::text
WHERE zone_id = 'zone.greenvale.meadows'
  AND payload::jsonb->>'contentHash' = '7ec6af1a212a9c4fa1997d1f9f8b50f736f476361b6eb6f3f902abdf94447c51';
