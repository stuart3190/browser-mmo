/* eslint-disable */
// Completed Root-Wound Warrior, new Stillwater quest. Ordinary travel/touch/combat; no writes.
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const { enter, walk } = require('./vertical-slice.cjs');
const fs = require('node:fs');
const OUT = process.argv[2] || '/tmp/mmo-stillwater-solo';
fs.mkdirSync(OUT, { recursive: true });
const Q = 'quest.greenvale.stillwater',
  checks = [];
const check = (name, ok, detail) => {
  checks.push({ name, ok: !!ok, detail });
  console.log(ok ? 'PASS' : 'FAIL', name, detail || '');
  if (!ok) throw Error(name);
};
(async () => {
  const browser = await chromium.launch({
    executablePath: '/usr/bin/google-chrome',
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
  const ctx = await browser.newContext({
    viewport: { width: 844, height: 390 },
    hasTouch: true,
    isMobile: true,
  });
  ctx.setDefaultTimeout(30000);
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  try {
    await enter(p, process.env.STILLWATER_SOLO_USER || 'guard_muu9vm2y', false);
    if (!process.env.STILLWATER_SOLO_RESUME) {
      await walk(p, 4, -80);
      await walk(p, 0, -28);
      await walk(p, 0, 6);
      await walk(p, -6, 6, 2.5);
      await p.locator('[data-testid=touch-interact]').tap();
      await p.locator(`[data-quest="${Q}"] [data-testid=quest-accept]`).tap();
      await p.getByRole('button', { name: 'Close dialogue', exact: true }).tap();
      check('Maren debrief accepted by touch', true);
    }
    await walk(p, 0, 6);
    await walk(p, 0, 0);
    await walk(p, 42, 0);
    await walk(p, 42, 38);
    await walk(p, 63, 38, 2.5);
    await p.locator('[data-testid=touch-interact]').tap();
    await p.getByRole('button', { name: 'Close dialogue', exact: true }).tap();
    await walk(p, 72, 30, 1);
    await p.locator('[data-testid=touch-target]').tap();
    await p.waitForFunction(
      () =>
        window.__mmo.target.name === 'Siltbound Warden' ||
        window.__mmo.enemies.find((e) => e.id === window.__mmo.target.id)?.name ===
          'Siltbound Warden',
    );
    const id = await p.evaluate(() => window.__mmo.target.id);
    await p.evaluate((id) => window.__mmo.lookAt(id), id);
    await walk(p, 74, 26, 1);
    await p.locator('[data-testid=touch-attack]').tap();
    for (let i = 0; i < 40; i++) {
      const heavy = p.locator('[data-testid="ability-ability.warrior.heavy_strike"]');
      if (await heavy.isEnabled()) await heavy.tap();
      if (await p.locator('[data-testid="ability-ability.warrior.battle_strike"]').isEnabled())
        await p.locator('[data-testid="ability-ability.warrior.battle_strike"]').tap();
      await new Promise((r) => setTimeout(r, 1000));
      const s = await p.evaluate(
        (q) => ({ q: window.__mmo.quests.find((x) => x.questId === q), v: window.__mmo.vitals }),
        Q,
      );
      if (s.v.dead) throw Error('Solo player died');
      if (s.q.state === 'ready_to_turn_in') break;
    }
    await p.waitForFunction(
      (q) => window.__mmo.quests.find((x) => x.questId === q)?.state === 'ready_to_turn_in',
      Q,
    );
    check('Normal geared Warrior can defeat the Warden solo with touch abilities', true);
    await p.screenshot({ path: `${OUT}/solo-victory.png` });
    await walk(p, 63, 38);
    await walk(p, 42, 38);
    await walk(p, 42, 0);
    await walk(p, 0, 0);
    await walk(p, 0, 6);
    await walk(p, -6, 6, 2.5);
    await p.setViewportSize({ width: 390, height: 844 });
    await p.locator('[data-testid=touch-interact]').tap();
    await p.locator(`[data-quest="${Q}"] [data-testid=quest-turn-in]`).tap();
    await p.waitForFunction(
      (q) => window.__mmo.quests.find((x) => x.questId === q)?.state === 'completed',
      Q,
    );
    await p.screenshot({ path: `${OUT}/portrait-reward.png` });
    await p.getByRole('button', { name: 'Goodbye', exact: true }).tap();
    await p.locator('[data-open=inventory]').tap();
    await p.getByRole('button', { name: 'Stillwater Seal', exact: true }).tap();
    await p.locator('[data-action=equip]').tap();
    await p.waitForFunction(() =>
      window.__mmo.items.some(
        (i) => i.templateId === 'accessory.ring.stillwater_seal' && i.location.kind === 'equipped',
      ),
    );
    check('Portrait touch turn-in and real seal equip succeed', true);
    check('No browser exceptions', errors.length === 0, errors);
  } finally {
    await browser.close();
    fs.writeFileSync(`${OUT}/checks.json`, JSON.stringify(checks, null, 2));
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
