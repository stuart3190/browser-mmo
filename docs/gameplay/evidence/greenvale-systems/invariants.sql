BEGIN READ ONLY;
-- Each actual joined member has a reward marker; reset preserves completed_at.
SELECT i.id,i.status,i.completed_at,m.character_id,m.joined_at,m.rewarded_at
FROM dungeon_instances i JOIN dungeon_members m ON m.instance_id=i.id
ORDER BY i.created_at,m.character_id;
-- Stable source identity and creation history tie the item grant to its one currency payment.
SELECT i.source_ref,i.owner_character_id,h.quantity,l.delta,l.owner_character_id AS paid_character
FROM item_instances i JOIN item_history h ON h.item_instance_id=i.id AND h.event_type='created'
LEFT JOIN currency_ledger l ON l.correlation_id=h.correlation_id
WHERE i.source_ref LIKE 'dungeon:%' ORDER BY i.source_ref;
-- Shared encounter identities and recipients stay scoped to their private runtime.
SELECT zone_id,spawn_point_id,status,recipients,loot_character_id FROM kill_events
WHERE zone_id LIKE 'instance:%' ORDER BY died_at;
SELECT character_id,profession_id,xp FROM character_professions ORDER BY character_id,profession_id;
SELECT id,character_id,offer_id,ready_at,completed_at FROM craft_jobs ORDER BY created_at;
SELECT id,character_id,item_id,heal,applied_at FROM consumable_uses;
SELECT id,zone_id,instance_id FROM characters WHERE instance_id IS NOT NULL;
ROLLBACK;
