import { and, eq } from 'drizzle-orm';
import { schema } from '@mmo/db';
import type { DbOrTx } from '@mmo/db';
import { computeCharacterStats, itemTotalStats } from '@mmo/game-data';
import type { CharacterStats, ItemEnchantment, ItemModifier, StatBlock } from '@mmo/schemas';
import { DomainError, ErrorCode } from '@mmo/shared';
import type { DomainContext } from './context';

/**
 * Authoritative effective stats for a character: class base at level + every equipped item's
 * rolled stats, modifiers and enchantments. Derived on read — never stored — so it can never drift
 * from the equipment that is actually persisted.
 */
export async function getCharacterStats(
  db: DbOrTx,
  ctx: DomainContext,
  characterId: string,
): Promise<CharacterStats> {
  const [character] = await db
    .select()
    .from(schema.characters)
    .where(eq(schema.characters.id, characterId));
  if (!character) throw new DomainError(ErrorCode.NOT_FOUND, 'Character not found');
  const equipped = await db
    .select({
      stats: schema.itemInstances.stats,
      modifiers: schema.itemInstances.modifiers,
      enchantments: schema.itemInstances.enchantments,
    })
    .from(schema.itemInstances)
    .where(
      and(
        eq(schema.itemInstances.locationKind, 'equipped'),
        eq(schema.itemInstances.equipCharacterId, characterId),
      ),
    );
  return computeCharacterStats(
    ctx.gameData.characterClass(character.classId),
    character.level,
    equipped.map((r) =>
      itemTotalStats({
        stats: r.stats as StatBlock,
        modifiers: r.modifiers as ItemModifier[],
        enchantments: r.enchantments as ItemEnchantment[],
      }),
    ),
  );
}
