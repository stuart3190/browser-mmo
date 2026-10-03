import { createHash } from 'node:crypto';
import { sql } from 'drizzle-orm';
import type { GameData } from '@mmo/game-data';
import type { DbOrTx } from './client';
import { itemTemplates } from './schema';

/**
 * Upserts authored item templates into the `item_templates` mirror table. Idempotent. Run on
 * deploy (and by the seed script). Templates are never deleted: instances reference them forever.
 */
export async function syncItemTemplates(db: DbOrTx, gameData: GameData): Promise<number> {
  const rows = gameData.raw.itemTemplates.map((t) => {
    const json = JSON.stringify(t);
    return {
      id: t.id,
      name: t.name,
      category: t.category,
      rarityId: t.rarityId,
      maxStack: t.maxStack,
      tradeable: t.tradeable,
      data: t,
      contentHash: createHash('sha256').update(json).digest('hex'),
    };
  });
  if (rows.length === 0) return 0;
  await db
    .insert(itemTemplates)
    .values(rows)
    .onConflictDoUpdate({
      target: itemTemplates.id,
      set: {
        name: sql`excluded.name`,
        category: sql`excluded.category`,
        rarityId: sql`excluded.rarity_id`,
        maxStack: sql`excluded.max_stack`,
        tradeable: sql`excluded.tradeable`,
        data: sql`excluded.data`,
        contentHash: sql`excluded.content_hash`,
        updatedAt: sql`now()`,
      },
    });
  return rows.length;
}
