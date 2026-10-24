import { getGameData } from '../../packages/game-data/src/index';
import { ZoneSimulation } from '../../services/world/src/zone-simulation';
import { legacyCheckpoint } from '../../services/world/src/checkpoint-test-reference';
const zones = [...getGameData().zones.keys()].map((id) => new ZoneSimulation(getGameData(), id));
const rounds = 100;
for (const [name, encode] of [
  ['legacy', legacyCheckpoint],
  ['schema', (zone: ZoneSimulation) => zone.checkpoint()],
] as const) {
  for (const zone of zones) encode(zone);
  const start = performance.now();
  let bytes = 0;
  for (let i = 0; i < rounds; i++) for (const zone of zones) bytes += encode(zone).length;
  console.log(
    JSON.stringify({ name, zones: zones.length, rounds, ms: performance.now() - start, bytes }),
  );
}
