/* eslint-disable */
// Real UI follow-on quest. Requires a test character that completed Wolves at the Edge.
// Prerequisite may be fixture-prepared, but this script never writes DB state or sends forged progress.
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const { walk, enter } = require('./vertical-slice.cjs');
const fs = require('node:fs');
const OUT = process.argv[2] || '/tmp/mmo-waystone-playthrough';
fs.mkdirSync(OUT, { recursive: true });
const USER = process.env.WAYSTONE_USER;
if (!USER)
  throw Error(
    'Set WAYSTONE_USER to an isolated development character with the wolf quest completed',
  );
const Q = 'quest.greenvale.old_waystone';
const checks = [];
function check(name, ok, detail) {
  checks.push({ name, ok: !!ok, detail });
  console.log(ok ? 'PASS' : 'FAIL', name, detail || '');
  if (!ok) throw Error(name);
}
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome',
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
  try {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
      deviceScaleFactor: 1,
    });
    await context.addInitScript(() => {
      window.__questRewards = [];
      const WS = window.WebSocket;
      window.WebSocket = class extends WS {
        constructor(...args) {
          super(...args);
          this.addEventListener('message', (e) => {
            try {
              const m = JSON.parse(e.data);
              if (m.t === 'quest.completed') window.__questRewards.push(m.d);
            } catch {}
          });
        }
      };
    });
    const p = await context.newPage();
    const errors = [];
    p.on('pageerror', (e) => errors.push(e.message));
    await enter(p, USER, false);
    await walk(p, 0, 4);
    await walk(p, -6, 5);
    await p.locator('[data-testid=touch-interact]').tap();
    await p.locator('[data-testid=quest-accept]').tap();
    await p.waitForFunction(
      (q) => window.__mmo.quests.find((x) => x.questId === q)?.state === 'active',
      Q,
    );
    check('Maren offers the follow-on after the hunt; accepted by touch', true);
    await p.locator('[data-testid=dialogue-close]').tap();
    await walk(p, 0, 4);
    await walk(p, 0, -28);
    await walk(p, 4, -80);
    await walk(p, -8, -90, 2.5);
    await p.locator('[data-testid=touch-interact]').tap();
    await p.waitForFunction(
      (q) => window.__mmo.quests.find((x) => x.questId === q)?.state === 'ready_to_turn_in',
      Q,
    );
    check('Actual south-road travel and Rill interaction complete the talk objective', true);
    await p.screenshot({ path: `${OUT}/01-rill.png` });
    await p.locator('[data-testid=dialogue-close]').tap();
    await enter(p, USER, false);
    await p.waitForFunction(
      (q) => window.__mmo.quests.find((x) => x.questId === q)?.state === 'ready_to_turn_in',
      Q,
    );
    check(
      'Rill objective and Waystone position survive re-login',
      (await p.evaluate(() => window.__mmo.position.z)) < -80,
    );
    await walk(p, 4, -80);
    await walk(p, 0, -28);
    await walk(p, 0, 4);
    await walk(p, -6, 5);
    await p.locator('[data-testid=touch-interact]').tap();
    await p.locator('[data-testid=quest-turn-in]').tap();
    await p.waitForFunction(
      (q) => window.__mmo.quests.find((x) => x.questId === q)?.state === 'completed',
      Q,
    );
    const reward = await p.evaluate(() => window.__questRewards.at(-1));
    check(
      'Touch turn-in pays the announced 150 XP, 75 copper and one useful ring',
      reward?.xpGained === 150 &&
        reward?.gold === 75 &&
        reward?.items.some((i) => i.template.id === 'accessory.ring.copper_band'),
      reward && {
        xp: reward.xpGained,
        gold: reward.gold,
        items: reward.items.map((i) => ({ id: i.instance.id, template: i.template.id })),
      },
    );
    await p.screenshot({ path: `${OUT}/02-return-to-maren.png` });
    check(
      'No repeat turn-in action remains',
      (await p.locator('[data-testid=quest-turn-in]').count()) === 0,
    );
    await enter(p, USER, false);
    await p.waitForFunction(
      (q) => window.__mmo.quests.find((x) => x.questId === q)?.state === 'completed',
      Q,
    );
    check(
      'Completed quest and the same reward item survive re-login',
      await p.evaluate(
        (ids) => ids.every((id) => window.__mmo.items.some((i) => i.id === id)),
        reward.items.map((i) => i.instance.id),
      ),
    );
    check('No browser exceptions', !errors.length, errors);
  } finally {
    await browser.close();
    fs.writeFileSync(`${OUT}/checks.json`, JSON.stringify(checks, null, 2));
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
