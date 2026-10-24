import { createHash } from 'node:crypto';
import { contentPacks, chapterContentPacks, getGameData } from '../packages/game-data/src/index';
const data = getGameData();
console.log(
  JSON.stringify(
    {
      packs: [...contentPacks, ...chapterContentPacks].map(({ id, schemaVersion, revision }) => ({
        id,
        schemaVersion,
        revision,
      })),
      quests: data.quests.size,
      npcs: data.npcs.size,
      enemies: data.enemies.size,
      contentHash: createHash('sha256').update(JSON.stringify(data.raw)).digest('hex'),
    },
    null,
    2,
  ),
);
