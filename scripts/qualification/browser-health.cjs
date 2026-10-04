/* eslint-disable */
// Real production UI; test-side interception simulates missed application messages, no app bypass.
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const DB = process.env.TEST_DATABASE_URL;
if (!DB || !new URL(DB).pathname.startsWith('/mmo_load_'))
  throw new Error('isolated load database required');
const WEB = process.env.WEB_URL || 'http://127.0.0.1:4173',
  API = process.env.API_URL || 'http://127.0.0.1:4400';
const sql = (query) => execFileSync('psql', [DB, '-tAc', query], { encoding: 'utf8' }).trim();
(async () => {
  const browser = await chromium.launch({
    executablePath: '/usr/bin/google-chrome',
    headless: true,
    args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  try {
    const name = 'hud_' + Date.now();
    const response = await fetch(API + '/v1/auth/dev-login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: name, client: 'game_web' }),
    });
    const { token } = await response.json();
    const created = await fetch(API + '/v1/characters', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token },
      body: JSON.stringify({
        name:
          'Hud' +
          Date.now()
            .toString()
            .replace(/\d/g, (d) => 'abcdefghij'[+d]),
        classId: 'class.warrior',
      }),
    });
    const { character } = await created.json();
    if (!character || !/^[a-f0-9-]{36}$/.test(character.id)) throw new Error('fixture failed');
    const checkpoint = JSON.parse(
      sql("select payload from zone_checkpoints where zone_id='zone.greenvale.meadows'"),
    );
    const world = JSON.parse(checkpoint.simulation);
    const wolf = world.entities.$map.map(([id, e]) => e).find((e) => e.kind === 'enemy' && !e.dead);
    if (!wolf || !Number.isFinite(wolf.position.x) || !Number.isFinite(wolf.position.z))
      throw new Error('No live wolf fixture');
    sql(
      `update characters set pos_x=${wolf.position.x},pos_z=${wolf.position.z} where id='${character.id}'`,
    );
    const page = await browser.newPage();
    await page.addInitScript(() => {
      window.__healthProof = { messages: [], drop: false, sockets: [] };
      const Native = WebSocket;
      window.WebSocket = class extends Native {
        constructor(...args) {
          super(...args);
          window.__healthProof.sockets.push(this);
        }
        set onmessage(handler) {
          super.onmessage = (event) => {
            const m = JSON.parse(event.data);
            const p = window.__healthProof;
            p.messages.push(m);
            if (
              p.drop &&
              (m.t === 'player.vitals' || m.t === 'combat.damage' || m.t === 'combat.death')
            )
              return;
            handler(event);
          };
        }
      };
    });
    await page.goto(WEB);
    await page.locator('[name=username]').fill(name);
    await page.locator('#login-form button').click();
    await page.locator('#char-list button').click();
    await page.locator('[data-testid=player-hp]').waitFor();
    await page.keyboard.press('Tab');
    await page.locator('[data-testid=target-frame]').waitFor();
    await page.keyboard.press('f');
    await page
      .waitForFunction(
        () => {
          const p = window.__healthProof;
          const snap = p.messages.find((m) => m.t === 'auth.ok');
          return (
            snap &&
            p.messages.filter(
              (m) => m.t === 'combat.damage' && m.d.targetId === snap.d.entityId && m.d.amount > 0,
            ).length >= 3
          );
        },
        {},
        { timeout: 45000 },
      )
      .catch(async (error) => {
        fs.writeFileSync(
          '/tmp/mmo-health-failure.json',
          JSON.stringify(
            await page.evaluate(() => ({
              messages: window.__healthProof.messages,
              hud: document.querySelector('[data-testid=player-hp]')?.outerHTML,
            })),
            null,
            2,
          ),
        );
        throw error;
      });
    if ((await page.locator('[data-testid=attack-toggle]').textContent()).includes('Stop'))
      await page.locator('[data-testid=attack-toggle]').click();
    const hits = await page.evaluate(() => {
      const p = window.__healthProof,
        id = p.messages.find((m) => m.t === 'auth.ok').d.entityId;
      return p.messages
        .filter((m) => m.t === 'combat.damage' && m.d.targetId === id && m.d.amount > 0)
        .map((m) => m.d.targetHealth);
    });
    await page.waitForFunction(() => {
      const p = window.__healthProof;
      const latest = p.messages.filter((m) => m.t === 'player.vitals').at(-1);
      return (
        latest &&
        Number(document.querySelector('[data-testid=player-hp]').dataset.value) === latest.d.health
      );
    });
    const matchedHits = await page.evaluate(() => {
      const p = window.__healthProof,
        id = p.messages.find((m) => m.t === 'auth.ok').d.entityId;
      return p.messages
        .filter((m) => m.t === 'combat.damage' && m.d.targetId === id && m.d.amount > 0)
        .every((hit) =>
          p.messages.some((m) => m.t === 'player.vitals' && m.d.health === hit.d.targetHealth),
        );
    });
    if (!matchedHits) throw new Error('Damage was not accompanied by authoritative vitals');
    await page.evaluate(() => (window.__healthProof.drop = true));
    const stale = Number(await page.locator('[data-testid=player-hp]').getAttribute('data-value'));
    await page.waitForFunction(
      () => window.__healthProof.messages.some((m) => m.t === 'player.vitals' && m.d.health === 0),
      {},
      { timeout: 60000 },
    );
    if (stale <= 0) throw new Error('missed-message fixture did not begin alive');
    const missed = Number(await page.locator('[data-testid=player-hp]').getAttribute('data-value'));
    if (missed === 0) throw new Error('expected test-side dropped health to leave stale HUD');
    await page.evaluate(() => (window.__healthProof.drop = false));
    await page.waitForFunction(
      () => document.querySelector('[data-testid=player-hp]').dataset.value === '0',
      {},
      { timeout: 40000 },
    );
    const dbHealth = Number(
      sql(`select current_health from characters where id='${character.id}'`),
    );
    if (dbHealth !== 0) throw new Error('DB/HUD mismatch');
    const snapshots = await page.evaluate(
      () => window.__healthProof.messages.filter((m) => m.t === 'zone.snapshot').length,
    );
    await page.evaluate(() =>
      window.__healthProof.sockets.at(-1).close(1000, 'qualification reconnect'),
    );
    await page.waitForFunction(
      (n) => window.__healthProof.messages.filter((m) => m.t === 'zone.snapshot').length > n,
      snapshots,
      { timeout: 15000 },
    );
    if (Number(await page.locator('[data-testid=player-hp]').getAttribute('data-value')) !== 0)
      throw new Error('reconnect healed HUD');
    const proof = {
      result: 'PASS',
      matchedHits,
      hudBeforeDroppedMessages: stale,
      hits,
      missedHud: missed,
      authoritativePersistedHealth: dbHealth,
      finalHud: 0,
      reconciliation: true,
      reconnect: true,
      productionDebugHook: await page.evaluate(() => '__mmo' in window),
    };
    fs.writeFileSync(
      process.env.HEALTH_REPORT || '/tmp/mmo-browser-health.json',
      JSON.stringify(proof, null, 2),
    );
    console.log(proof);
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
