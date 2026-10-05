/* eslint-disable */
// One genuine previously played Warrior; no new progress, rewards, stat or position injection.
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const { enter, walk: travel } = require('./vertical-slice.cjs');
const fs = require('node:fs');
const OUT = process.argv[2] || '/tmp/mmo-keeper-solo';
fs.mkdirSync(OUT, { recursive: true });
const Q = 'quest.greenvale.keeper_outpost',
  USER = process.env.OUTPOST_SOLO_USER || 'route_muuzc28m',
  checks = [];
function check(name, ok, detail) {
  checks.push({ name, ok: !!ok, detail });
  console.log(ok ? 'PASS' : 'FAIL', name, detail || '');
  if (!ok) throw Error(name);
}
async function walk(p, ...args) {
  for (let i = 0; i < 3; i++)
    try {
      return await travel(p, ...args);
    } catch (e) {
      if (!e.message.startsWith('Walk deadline') || i === 2) throw e;
    }
}
(async () => {
  const b = await chromium.launch({
    executablePath: '/usr/bin/google-chrome',
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
  try {
    const c = await b.newContext({
      viewport: { width: 844, height: 390 },
      hasTouch: true,
      isMobile: true,
    });
    c.setDefaultTimeout(60000);
    await c.addInitScript(() => {
      window.__events = [];
      const WS = window.WebSocket;
      window.WebSocket = class extends WS {
        constructor(...a) {
          super(...a);
          this.addEventListener('message', (e) => {
            const m = JSON.parse(e.data);
            if (['combat.loot', 'combat.damage', 'quest.completed'].includes(m.t))
              window.__events.push(m);
          });
        }
      };
    });
    const p = await c.newPage(),
      errors = [];
    p.on('pageerror', (e) => errors.push(e.message));
    await enter(p, USER, false);
    if (!process.env.OUTPOST_SOLO_RESUME) {
      await p.locator('[data-testid=touch-interact]').tap();
      await p.locator(`[data-quest="${Q}"] [data-testid=quest-accept]`).tap();
      await p.getByRole('button', { name: 'Close dialogue', exact: true }).tap();
      const joy = await p.locator('[data-testid=joystick]').boundingBox(),
        old = await p.evaluate(() => ({ ...window.__mmo.position }));
      const cd = await c.newCDPSession(p);
      await cd.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ x: joy.x + joy.width / 2, y: joy.y + joy.height / 2 }],
      });
      await cd.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: joy.x + joy.width / 2, y: joy.y + 15 }],
      });
      await p.waitForTimeout(1400);
      await cd.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      check(
        'Actual touch joystick moves with outpost guidance visible',
        await p.evaluate(
          (o) => Math.hypot(window.__mmo.position.x - o.x, window.__mmo.position.z - o.z) > 0.5,
          old,
        ),
      );
      for (const xy of [
        [0, 6],
        [0, 32],
        [0, 55],
        [0, 80],
        [0, 110],
        [8, 110],
        [24, 110],
        [29, 113],
      ])
        await walk(p, ...xy);
    }
    if (!process.env.OUTPOST_SOLO_FINISH) {
      await p.locator('[data-testid=touch-target]').tap();
      await p.waitForFunction(
        () =>
          window.__mmo.enemies.find((e) => e.id === window.__mmo.target.id)?.name ===
          'Aster, Last Door Sentinel',
      );
      const id = await p.evaluate(() => window.__mmo.target.id);
      await p.evaluate((id) => window.__mmo.lookAt(id), id);
      await walk(p, 32, 118, 1);
      await p.locator('[data-testid=touch-attack]').tap();
      for (let i = 0; i < 48; i++) {
        await p.locator('[data-testid="ability-ability.warrior.heavy_strike"]').tap();
        await p.waitForTimeout(1500);
        if (
          await p.evaluate(
            (q) => window.__mmo.quests.find((x) => x.questId === q)?.state === 'ready_to_turn_in',
            Q,
          )
        )
          break;
        if (await p.evaluate(() => window.__mmo.vitals.dead)) throw Error('Solo Warrior died');
      }
      await p.waitForFunction(
        (q) => window.__mmo.quests.find((x) => x.questId === q)?.state === 'ready_to_turn_in',
        Q,
      );
      const loot = await p.evaluate(
        () => window.__events.filter((m) => m.t === 'combat.loot').at(-1)?.d,
      );
      check(
        'Solo authoritative sentinel kill and normal loot',
        loot?.enemyName === 'Aster, Last Door Sentinel' &&
          loot.items.length + loot.mailedItems.length === 1,
        loot,
      );
      await p.screenshot({ path: `${OUT}/solo-victory.png` });
    }
    for (const xy of [
      [24, 110],
      [8, 110],
      [0, 110],
      [0, 85],
      [0, 60],
      [0, 32],
      [0, 6],
      [-6, 6, 2.5],
    ])
      await walk(p, ...xy);
    await p.setViewportSize({ width: 390, height: 844 });
    await p.locator('[data-testid=touch-interact]').tap();
    await p.locator(`[data-quest="${Q}"] [data-testid=quest-turn-in]`).tap();
    await p.waitForFunction(
      (q) => window.__mmo.quests.find((x) => x.questId === q)?.state === 'completed',
      Q,
    );
    const reward = await p.evaluate(
      (q) => window.__events.find((m) => m.t === 'quest.completed' && m.d.questId === q)?.d,
      Q,
    );
    check(
      'Solo persistent 700 XP / 300 copper / one mantle',
      reward?.xpGained === 700 && reward.items.length === 1 && reward.gold === 300,
      reward,
    );
    await p.getByRole('button', { name: 'Goodbye', exact: true }).tap();
    await p.locator('[data-open=inventory]').tap();
    await p.getByLabel('Search inventory').fill('oath');
    await p.getByRole('button', { name: 'Oathkeeper’s Mantle', exact: true }).tap();
    await p.locator('[data-action=equip]').tap();
    const item = reward.items[0].instance.id;
    await p.waitForFunction(
      (id) => window.__mmo.items.find((i) => i.id === id)?.location.kind === 'equipped',
      item,
    );
    await p.screenshot({ path: `${OUT}/solo-portrait-equipped.png` });
    await enter(p, USER, false);
    check(
      'Solo completed quest and equipped unique cloak survive reload',
      await p.evaluate(
        ({ q, id }) =>
          window.__mmo.quests.find((x) => x.questId === q)?.state === 'completed' &&
          window.__mmo.items.find((x) => x.id === id)?.location.kind === 'equipped',
        { q: Q, id: item },
      ),
    );
    check('No browser exceptions', errors.length === 0, errors);
  } finally {
    await b.close();
    fs.writeFileSync(`${OUT}/checks.json`, JSON.stringify(checks, null, 2));
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
