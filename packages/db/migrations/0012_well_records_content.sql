-- Authored exploration/quest additions only. Preserve live state and all existing spawn IDs.
UPDATE zone_checkpoints
SET payload = jsonb_set(payload::jsonb, '{contentHash}', '"73580f2d38ee69c52e3145b06993e678620ed8d34c73efc5d20ffcec2f8943c7"'::jsonb)::text
WHERE zone_id = 'zone.greenvale.meadows'
  AND payload::jsonb->>'contentHash' = '9614a98b965120cf0f6ff2e419b5b71042d96226a9aa1df19d3fbd755944f50b';
