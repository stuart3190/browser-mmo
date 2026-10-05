-- Keep the full authored six-metre road corridor clear around new settlement dressing.
UPDATE zone_checkpoints
SET payload = jsonb_set(payload::jsonb, '{contentHash}', '"d22461380e9af16206f663e294bf1d462eaa47d4d2ce4b5cf5b4dc4a391fbc94"'::jsonb)::text
WHERE payload::jsonb->>'contentHash' = '9d06d1bff6975904cddba947dad348b2ae5fe4ef2688116e7c13882b7d6a5206';
