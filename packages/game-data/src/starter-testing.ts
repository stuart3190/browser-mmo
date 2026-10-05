import {
  compileContentCatalog,
  legacyContentManifest as contentManifest,
  contentPacks,
  GameData,
} from './index';
/** Historical Greenvale fixtures; never used by production runtime. */
export function getStarterGameData(): GameData {
  return GameData.load(
    compileContentCatalog(
      contentManifest,
      contentPacks.filter((p) => p.schemaVersion === 1),
    ),
  );
}
