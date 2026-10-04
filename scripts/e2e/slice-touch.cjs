/* eslint-disable */
// Continues the fresh-character vertical-slice run with touch input and actual death/respawn.
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const fs = require('node:fs');
const { walk, enter } = require('./vertical-slice.cjs');
const OUT = process.argv[2] || '/tmp/mmo-slice-playthrough';
(async () => {
  const previous = JSON.parse(fs.readFileSync(`${OUT}/results.json`));
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome',
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
  const checks = [];
  const check = (name, ok) => {
    checks.push({ name, ok: !!ok });
    console.log(ok ? 'PASS' : 'FAIL', name);
    if (!ok) throw new Error(name);
  };
  try {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
      deviceScaleFactor: 1,
    });
    const p = await context.newPage();
    const errors = [];
    p.on('pageerror', (e) => errors.push(e.message));
    await enter(p, previous.users[1], false);
    await p.waitForSelector('[data-testid=joystick]');
    const box = await p.locator('[data-testid=joystick]').boundingBox();
    const before = await p.evaluate(() => window.__mmo.position);
    const cdp = await context.newCDPSession(p);
    const finger = { id: 1, x: box.x + box.width / 2, y: box.y + box.height / 2 };
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [finger] });
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ ...finger, y: finger.y - 42 }],
    });
    await p.waitForTimeout(1200);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    const after = await p.evaluate(() => window.__mmo.position);
    check(
      'Real touch joystick moves the player',
      Math.hypot(after.x - before.x, after.z - before.z) > 0.3,
    );
    const rectangles = await p
      .locator(
        '[data-testid=player-frame], [data-testid=minimap], [data-testid=joystick], .action-bar',
      )
      .evaluateAll((nodes) =>
        nodes.map((n) => {
          const r = n.getBoundingClientRect();
          return { x: r.x, y: r.y, w: r.width, h: r.height };
        }),
      );
    check(
      'Phone primary controls stay inside viewport',
      rectangles.every((r) => r.x >= 0 && r.y >= 0 && r.x + r.w <= 391 && r.y + r.h <= 845),
    );
    await p.screenshot({ path: `${OUT}/05-phone-hunt.png` });
    const enemy = await p.evaluate(
      () =>
        window.__mmo.enemies
          .filter((e) => !e.dead)
          .map((e) => ({ ...e, p: window.__mmo.entityPos(e.id) }))
          .filter((e) => e.p)
          .sort(
            (a, b) =>
              Math.hypot(a.p.x - window.__mmo.position.x, a.p.z - window.__mmo.position.z) -
              Math.hypot(b.p.x - window.__mmo.position.x, b.p.z - window.__mmo.position.z),
          )[0],
    );
    await walk(p, enemy.p.x, enemy.p.z, 4);
    // Do not attack: verify actual server damage, death and respawn through the normal UI.
    await p.waitForFunction(() => window.__mmo.vitals.dead, null, { timeout: 90000 });
    check(
      'Actual enemy damage kills the player and shows respawn UI',
      await p.locator('[data-testid=death-overlay]').isVisible(),
    );
    await p.screenshot({ path: `${OUT}/06-death.png` });
    await p.waitForFunction(() => !document.querySelector('[data-testid=respawn]').disabled);
    await p.locator('[data-testid=respawn]').tap();
    await p.waitForFunction(
      () =>
        !window.__mmo.vitals.dead && window.__mmo.vitals.health === window.__mmo.vitals.maxHealth,
    );
    const pos = await p.evaluate(() => window.__mmo.position);
    check(
      'Touch respawn returns to village with full authoritative health',
      Math.hypot(pos.x, pos.z + 8) < 1,
    );
    await p.screenshot({ path: `${OUT}/07-phone-village.png` });
    check('No browser exceptions', errors.length === 0);
  } finally {
    await browser.close();
    fs.writeFileSync(`${OUT}/touch-results.json`, JSON.stringify(checks, null, 2));
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
