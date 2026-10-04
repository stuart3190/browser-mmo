/* eslint-disable */
// Resume the real hunt at Rill after content deployment; no DB writes or fabricated objectives.
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const { enter } = require('./vertical-slice.cjs');
const fs = require('node:fs');
const users = process.env.HOLLOW_USERS?.split(',');
if (!users?.length)
  throw Error('HOLLOW_USERS must name the ready-to-turn-in development characters');
const OUT = process.argv[2] || '/tmp/mmo-hollow-return';
fs.mkdirSync(OUT, { recursive: true });
const checks = [];
function check(name, ok, detail) {
  checks.push({ name, ok: !!ok, detail });
  console.log(ok ? 'PASS' : 'FAIL', name, detail || '');
  if (!ok) throw Error(name);
}
(async () => {
  const browser = await chromium.launch({
    executablePath: '/usr/bin/google-chrome',
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  try {
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
    });
    ctx.setDefaultTimeout(60000);
    await ctx.addInitScript(() => {
      window.ev = [];
      const WS = window.WebSocket;
      window.WebSocket = class extends WS {
        constructor(...args) {
          super(...args);
          this.addEventListener('message', (e) => {
            const m = JSON.parse(e.data);
            if (['error', 'quest.completed'].includes(m.t)) window.ev.push(m);
          });
        }
      };
    });
    const p = await ctx.newPage();
    const errors = [];
    p.on('pageerror', (e) => errors.push(e.message));
    for (const user of users) {
      await enter(p, user, false);
      await p.waitForFunction(
        () =>
          window.__mmo.quests.find((q) => q.questId === 'quest.greenvale.hollow_trail')?.state ===
          'ready_to_turn_in',
      );
      await p.locator('[data-testid=touch-interact]').tap();
      await p.locator('[data-testid=quest-turn-in]').tap();
      await p.waitForFunction(
        () =>
          window.__mmo.quests.find((q) => q.questId === 'quest.greenvale.hollow_trail')?.state ===
          'completed',
      );
      const reward = await p.evaluate(() => window.ev.find((m) => m.t === 'quest.completed')?.d);
      check(
        'Touch turn-in pays 350 XP, 125 copper and one ward-token',
        reward?.xpGained === 350 &&
          reward?.gold === 125 &&
          reward?.items.length === 1 &&
          reward?.items[0].template.id === 'accessory.trinket.keepers_token',
        { xp: reward?.xpGained, gold: reward?.gold },
      );
      check(
        'No second turn-in button remains',
        (await p.locator('[data-testid=quest-turn-in]').count()) === 0,
      );
      await p.screenshot({ path: `${OUT}/${user}-reward.png` });
      const id = reward.items[0].instance.id;
      await enter(p, user, false);
      await p.waitForFunction(
        () =>
          window.__mmo.quests.find((q) => q.questId === 'quest.greenvale.hollow_trail')?.state ===
          'completed',
      );
      check(
        'Completed quest and same single item survive reconnect',
        await p.evaluate(
          (id) =>
            window.__mmo.items.filter((i) => i.templateId === 'accessory.trinket.keepers_token')
              .length === 1 && window.__mmo.items.some((i) => i.id === id),
          id,
        ),
      );
      await p.locator('[data-open=inventory]').tap();
      await p.getByRole('button', { name: "Keeper's Ward-Token", exact: true }).tap();
      await p.locator('[data-action=equip]').tap();
      await p.waitForFunction(
        (id) => window.__mmo.items.find((i) => i.id === id)?.location.kind === 'equipped',
        id,
      );
      check('Level-two character equips its real ward-token by touch', true);
    }
    check('No browser exceptions', errors.length === 0, errors);
  } finally {
    await browser.close();
    fs.writeFileSync(`${OUT}/checks.json`, JSON.stringify(checks, null, 2));
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
