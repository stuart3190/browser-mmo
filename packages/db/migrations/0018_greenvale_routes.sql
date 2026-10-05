-- Keep the new route's full walking corridor clear without moving existing places or live state.
UPDATE zone_checkpoints
SET payload = jsonb_set(payload::jsonb, '{contentHash}', '"9d06d1bff6975904cddba947dad348b2ae5fe4ef2688116e7c13882b7d6a5206"'::jsonb)::text
WHERE payload::jsonb->>'contentHash' = '312a431615a7543f7e8564f34dc6de0fecc46a3e55497fbcbe5df9af22cdafca';
