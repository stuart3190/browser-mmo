/** IPC-only destructive-test host. Not a production entrypoint. */
import type { AddressInfo } from 'node:net';
import { GameData } from '../../packages/game-data/src/index';
import { createDb } from '../../packages/db/src/index';
import { createDomainContext, SessionService } from '../../packages/domain/src/index';
import { createLogger, Metrics } from '../../packages/server-kit/src/index';
import { arenaGameData, ARENA } from '../../services/world/src/test-arena';
import { createRealtimeServer } from '../../services/realtime/src/server';
import type { KillFaults } from '../../services/realtime/src/server';
const url = process.env.TEST_DATABASE_URL;
if (process.env.NODE_ENV !== 'test' || !process.send || !url || url === process.env.DATABASE_URL)
  throw new Error('Requires test database and parent IPC');
const handle = createDb({ url });
const faults: KillFaults = {};
const phase = process.env.KILL_PHASE;
if (phase === 'beforeRecord' || phase === 'afterRecord' || phase === 'afterReward')
  faults[phase] = () => {
    process.send!({ kind: 'fault', phase });
    return new Promise<never>(() => undefined);
  };
const base = arenaGameData();
const gameData =
  phase === 'noRegen'
    ? GameData.load({
        ...base.raw,
        combatRules: { ...base.raw.combatRules, regenFractionPerSecond: 0 },
      })
    : base;
const server = createRealtimeServer({
  ctx: createDomainContext({ db: handle.db, gameData }),
  sessions: new SessionService(1),
  logger: createLogger({ service: 'process-proof', level: 'silent' }),
  metrics: new Metrics(),
  zoneIds: [ARENA],
  tickHz: 20,
  allowedOrigins: ['http://localhost:5173'],
  changeFeedUrl: url,
  lingerMs: 10000,
  killRecoveryIntervalMs: 250,
  faults,
});
try {
  await server.start('127.0.0.1', 0);
  process.send!({ kind: 'ready', port: (server.http.address() as AddressInfo).port });
} catch (error) {
  process.send!({ kind: 'refused', error: String(error) });
  await handle.close();
  process.exit(2);
}
process.on('message', (m: { kind: string; id: string }) => {
  const zone = server.zones.get(ARENA)!;
  if (m.kind === 'state')
    process.send!({
      kind: 'state',
      state: zone.persistentState(m.id),
      tick: zone.tick,
      enemies: zone.enemyIds(),
    });
  if (m.kind === 'weapon') {
    const p = zone.getPlayer(m.id)!;
    zone.updateCombatProfile(
      m.id,
      {
        level: 1,
        stats: {},
        maxHealth: p.maxHealth,
        weapon: { min: 500, max: 500, attackSpeedMs: 1000 },
      },
      Date.now(),
    );
    process.send!({ kind: 'weapon' });
  }
});
