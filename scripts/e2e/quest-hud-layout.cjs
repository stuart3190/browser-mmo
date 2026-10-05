/* eslint-disable */
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const { enter, walk } = require('./vertical-slice.cjs');
const fs = require('fs');
const OUT = process.argv[2] || '/tmp/mmo-quest-hud-layout';
fs.mkdirSync(OUT, { recursive: true });
const checks = [];
function check(name, ok, detail) {
  checks.push({ name, ok: !!ok, detail });
  console.log(ok ? 'PASS' : 'FAIL', name, detail || '');
  if (!ok) throw Error(name);
}
(async () => {
  const b = await chromium.launch({
    executablePath: '/usr/bin/google-chrome',
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
  try {
    const c = await b.newContext({ viewport: { width: 1100, height: 740 } }),
      p = await c.newPage();
    p.setDefaultTimeout(60000);
    await enter(p, 'outpostui_' + Date.now().toString(36), true);
    await walk(p, 0, 6);
    await walk(p, -6, 6, 2.5);
    await p.keyboard.press('KeyE');
    await p
      .locator('[data-quest="quest.greenvale.wolves_at_the_edge"] [data-testid=quest-accept]')
      .click();
    await p.getByRole('button', { name: 'Close dialogue', exact: true }).click();
    await walk(p, 0, 6);
    await walk(p, 0, 44);
    console.log(
      'HUD fixture',
      await p.evaluate(() => ({
        position: window.__mmo.position,
        enemies: window.__mmo.enemies.map((e) => ({ name: e.name, dead: e.dead, id: e.id })),
      })),
    );
    await p.keyboard.press('Tab');
    await p.locator('[data-testid=target-frame]').waitFor();
    await p.locator('[data-testid=quest-guide]').waitFor();
    const a = await p.locator('[data-testid=quest-guide]').boundingBox(),
      t = await p.locator('[data-testid=target-frame]').boundingBox();
    check('Desktop compass never covers target health/wind-up', a.y + a.height <= t.y, {
      guide: a,
      target: t,
    });
    await p.locator('[data-open=inventory]').click();
    await p.getByLabel('Search inventory').fill('no such item');
    check(
      'Empty search explains how to recover view',
      await p.getByText('No matching items. Clear filters to see your bag.').isVisible(),
    );
    await p.getByRole('button', { name: 'Reset view', exact: true }).click();
    check(
      'Reset restores real slot grid',
      await p.locator('[data-testid=backpack-slot-0]').isVisible(),
    );
    await p.screenshot({ path: `OUT/layout.png`.replace('OUT', OUT) });
  } finally {
    await b.close();
    fs.writeFileSync(`${OUT}/checks.json`, JSON.stringify(checks, null, 2));
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
