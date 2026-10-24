/* eslint-disable */
// Fresh level-one map/compass journey; no fixtures, player-row writes or teleports.
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const { enter, walk } = require('./vertical-slice.cjs');
const fs = require('node:fs');
const out = process.argv[2] || '/tmp/bo-atlas';
fs.mkdirSync(out, { recursive: true });
const checks = [],
  errors = [];
function check(name, ok, detail) {
  checks.push({ name, ok: !!ok, detail });
  console.log(ok ? 'PASS' : 'FAIL', name);
  if (!ok) throw Error(name);
}
(async () => {
  const browser = await chromium.launch({
    executablePath: '/usr/bin/google-chrome',
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  let page;
  try {
    for (const touch of [false, true]) {
      const label = touch ? 'touch' : 'desktop';
      const context = await browser.newContext({
        viewport: touch ? { width: 390, height: 844 } : { width: 1100, height: 740 },
        hasTouch: touch,
        isMobile: touch,
      });
      page = await context.newPage();
      page.setDefaultTimeout(45000);
      page.on('pageerror', (e) => errors.push(e.message));
      const click = (l) => l[touch ? 'tap' : 'click']();
      await enter(
        page,
        `atlas_${label}_${Date.now().toString(36)}`,
        true,
        touch ? 'class.mage' : 'class.warrior',
      );
      await click(page.locator('[data-open=world]'));
      const chart = page.getByRole('region', { name: 'Regional map' });
      await chart.waitFor();
      check(
        `${label}: starter coordinates stay in their own map area`,
        await page.locator('[data-map-zone="zone.greenvale.meadows"]').isVisible(),
      );
      check(
        `${label}: current position is visible`,
        await page.getByTestId('atlas-player').isVisible(),
      );
      const before = await page.evaluate(() => window.__mmo.position);
      await click(page.getByRole('button', { name: 'Move map north', exact: true }));
      await click(page.getByRole('button', { name: 'Zoom map out', exact: true }));
      await click(page.getByRole('button', { name: 'Recenter', exact: true }));
      check(
        `${label}: map controls do not move the character`,
        await page.evaluate(
          (p) => Math.hypot(window.__mmo.position.x - p.x, window.__mmo.position.z - p.z) < 0.2,
          before,
        ),
      );
      const bounds = await page.locator('.atlas-chart-surface').boundingBox();
      check(
        `${label}: chart fits viewport`,
        bounds.x >= 0 && bounds.x + bounds.width <= page.viewportSize().width,
      );
      const pins = await page.locator('.atlas-pin').evaluateAll((es) =>
        es.map((e) => {
          const r = e.getBoundingClientRect();
          return { w: r.width, h: r.height };
        }),
      );
      check(
        `${label}: pins retain 44px touch targets`,
        pins.length > 0 && pins.every((p) => p.w >= 44 && p.h >= 44),
      );
      await click(page.locator('[data-map-place~="location.anchor.greenvale.old_well"]'));
      check(
        `${label}: selected chart reveals place name`,
        await page.locator('[data-map-guide="location.anchor.greenvale.old_well"]').isVisible(),
      );
      await page.waitForFunction(() => {
        const b = document
          .querySelector('[data-map-guide="location.anchor.greenvale.old_well"]')
          ?.getBoundingClientRect();
        const panel = document
          .querySelector('[data-window=world] .window-body')
          ?.getBoundingClientRect();
        return b && panel && b.top >= panel.top && b.bottom <= panel.bottom;
      });
      check(`${label}: selecting a map pin brings its directions into view`, true);
      await page.screenshot({ path: `${out}/${label}-map.png` });
      if (process.env.ATLAS_VISUAL_ONLY === '1') {
        await context.close();
        continue;
      }
      await click(page.locator('[data-map-guide="location.anchor.greenvale.old_well"]'));
      await page.waitForFunction(() =>
        document.querySelector('.quest-guide')?.textContent.includes('Old Well'),
      );
      check(
        `${label}: map selection creates walking guidance and closes atlas`,
        !(await page.locator('[data-window=world]').isVisible()),
      );
      await walk(page, 0, 10, 2);
      await walk(page, 8, 12, 2);
      check(
        `${label}: player walks to selected landmark`,
        await page.evaluate(
          () => Math.hypot(window.__mmo.position.x - 8, window.__mmo.position.z - 12) < 3,
        ),
      );
      await click(page.locator('[data-open=world]'));
      await page
        .getByLabel('Map area', { exact: true })
        .selectOption('zone.aurelian.greenvale_marches');
      check(
        `${label}: chart separates Marches and enclave coordinates`,
        !(await page.getByTestId('atlas-player').isVisible()) &&
          (await page.locator('[data-map-zone="zone.aurelian.greenvale_marches"]').isVisible()),
      );
      await page
        .getByLabel('Atlas region', { exact: true })
        .selectOption('region.aurelian.elderwood');
      await click(page.locator('[data-map-place~="location.elderwood.port"]'));
      await page.screenshot({ path: `${out}/${label}-forest-map.png` });
      await click(page.locator('[data-map-guide="location.elderwood.port"]'));
      await page.waitForFunction(() =>
        document.querySelector('.quest-guide')?.textContent.includes('Greenvale North Road'),
      );
      check(`${label}: distant map destination starts with the actual north-road passage`, true);
      await context.close();
    }
    check('No map gameplay exceptions', errors.length === 0, errors);
    fs.writeFileSync(
      `${out}/proof.json`,
      JSON.stringify(
        {
          ok: true,
          authority: 'fresh ordinary level-one players; UI controls and walking only',
          checks,
          errors,
        },
        null,
        2,
      ),
    );
  } catch (e) {
    fs.writeFileSync(
      `${out}/failure.json`,
      JSON.stringify({ ok: false, error: e.stack, checks, errors }, null, 2),
    );
    await page?.screenshot({ path: `${out}/failure.png` }).catch(() => {});
    throw e;
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
