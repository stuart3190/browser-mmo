/* eslint-disable */
// Fresh follow-on for a character who completed the previous five quests through real play.
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const { enter, walk: travel } = require('./vertical-slice.cjs');
const fs = require('fs');
const OUT = process.argv[2] || '/tmp/mmo-well-solo';
fs.mkdirSync(OUT, { recursive: true });
const Q = 'quest.greenvale.well_records',
  checks = [];
function check(name, ok, detail) {
  checks.push({ name, ok: !!ok, detail });
  console.log(ok ? 'PASS' : 'FAIL', name, detail || '');
  if (!ok) throw Error(name);
}
async function walk(...args) {
  for (let i = 0; i < 3; i++) {
    try {
      return await travel(...args);
    } catch (e) {
      if (!e.message.startsWith('Walk deadline') || i === 2) throw e;
      console.log('Continuing real travel after software-rendering deadline');
    }
  }
}
(async () => {
  const b = await chromium.launch({
    executablePath: '/usr/bin/google-chrome',
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
  const c = await b.newContext({ viewport: { width: 1100, height: 740 }, hasTouch: true });
  const p = await c.newPage();
  p.setDefaultTimeout(60000);
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  try {
    await enter(p, process.env.WELL_SOLO_USER || 'route_muuzc28m', false);
    if (!process.env.WELL_SOLO_RESUME) {
      await p.waitForFunction(() =>
        document
          .querySelector('[data-testid=quest-guide]')
          ?.textContent.includes('Speak to Elder Maren'),
      );
      await p.keyboard.press('KeyE');
      await p.locator(`[data-quest="${Q}"] [data-testid=quest-accept]`).click();
      await p.getByRole('button', { name: 'Close dialogue', exact: true }).click();
      await walk(p, 0, 12);
      await walk(p, 8, 12, 2);
      await p.waitForFunction(
        (q) => window.__mmo.quests.find((x) => x.questId === q).objectives[0].done,
        Q,
      );
      check('Fresh follow-on personally surveys village well', true);
    }
    if (!process.env.WELL_SOLO_RESUME) await walk(p, 0, 12);
    await walk(p, 0, 110);
    await walk(p, 8, 110, 2);
    await p.waitForFunction(
      (q) => window.__mmo.quests.find((x) => x.questId === q).state === 'ready_to_turn_in',
      Q,
    );
    await p.waitForTimeout(12000);
    check(
      'Corrected culvert reached alive and outside combat after waiting',
      await p.evaluate(() => !window.__mmo.vitals.dead && !window.__mmo.vitals.inCombat),
      await p.evaluate(() => window.__mmo.vitals),
    );
    await p.setViewportSize({ width: 844, height: 390 });
    await p.locator('[data-testid=quest-guide]').tap();
    await p.locator(`[data-quest="${Q}"] [data-testid=quest-track]`).tap();
    await p.keyboard.press('Escape');
    await p.waitForTimeout(500);
    check('Touch guidance opens log and allows active quest selection', true);
    await p.screenshot({ path: `${OUT}/culvert-landscape.png` });
    await p.setViewportSize({ width: 390, height: 844 });
    await p.waitForTimeout(500);
    const guide = await p.locator('[data-testid=quest-guide]').boundingBox();
    check(
      'Portrait guide and touch controls are visible',
      guide &&
        guide.x >= 0 &&
        guide.x + guide.width <= 390 &&
        guide.y >= 0 &&
        guide.y + guide.height <= 844,
    );
    const bounds = await p.evaluate(() =>
      [
        ...document.querySelectorAll(
          '[data-testid=joystick],[data-testid=touch-interact],[data-testid=touch-target],[data-testid=touch-attack],[data-testid=quest-guide]',
        ),
      ].map((e) => {
        const r = e.getBoundingClientRect();
        const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        return {
          id: e.dataset.testid,
          visible: r.width > 0 && r.height > 0,
          inBounds: r.x >= 0 && r.y >= 0 && r.right <= 390 && r.bottom <= 844,
          reachable: hit === e || e.contains(hit),
        };
      }),
    );
    check(
      'Portrait touch controls and guide are unobscured',
      bounds.every((x) => x.visible && x.inBounds && x.reachable),
      bounds,
    );
    await p.screenshot({ path: `${OUT}/culvert-portrait.png` });
    await p.setViewportSize({ width: 844, height: 390 });
    await p.evaluate(() => window.__mmo.dropConnection());
    await p.waitForTimeout(4000);
    await p.waitForFunction(
      (q) => window.__mmo.quests.find((x) => x.questId === q).state === 'ready_to_turn_in',
      Q,
    );
    check(
      'Reconnect retains survey completion and guidance',
      (await p.locator('[data-testid=quest-guide]').innerText()).includes('Return to Elder Maren'),
    );
    await walk(p, 0, 110);
    await walk(p, 0, 6);
    await walk(p, -6, 6, 2.5);
    await p.locator('[data-testid=touch-interact]').tap();
    await p.locator(`[data-quest="${Q}"] [data-testid=quest-turn-in]`).tap();
    await p.waitForFunction(
      (q) => window.__mmo.quests.find((x) => x.questId === q).state === 'completed',
      Q,
    );
    await p.screenshot({ path: `${OUT}/debrief-touch.png` });
    await p.getByRole('button', { name: 'Goodbye', exact: true }).tap();
    await p.locator('[data-open=inventory]').tap();
    await p.getByRole('button', { name: 'Springward Pendant', exact: true }).tap();
    await p.locator('[data-action=equip]').tap();
    await p.waitForFunction(() =>
      window.__mmo.items.some(
        (i) =>
          i.templateId === 'accessory.necklace.springward_pendant' &&
          i.location.kind === 'equipped',
      ),
    );
    check('Solo touch turn-in and persistent useful necklace equip succeed', true);
    check('No browser exceptions', errors.length === 0, errors);
  } finally {
    fs.writeFileSync(`${OUT}/checks.json`, JSON.stringify(checks, null, 2));
    await b.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
