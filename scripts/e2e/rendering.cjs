/* eslint-disable */
// Real input and screenshots for static-world batching; no grants or position mutation.
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const { enter, walk } = require('./vertical-slice.cjs');
const fs = require('node:fs');
const out = process.argv[2] || '/tmp/bo-rendering';
fs.mkdirSync(out, { recursive: true });
const checks = [],
  errors = [],
  networkFailures = [],
  scenes = [];
function check(name, ok, detail) {
  checks.push({ name, ok: !!ok, detail });
  if (!ok) throw Error(name);
  console.log('PASS', name);
}
(async () => {
  const browser = await chromium.launch({
    executablePath: '/usr/bin/google-chrome',
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  let page;
  try {
    for (const touch of [false, true]) {
      const context = await browser.newContext({
        viewport: touch ? { width: 390, height: 844 } : { width: 1100, height: 740 },
        hasTouch: touch,
        isMobile: touch,
      });
      page = await context.newPage();
      page.setDefaultTimeout(60000);
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('requestfailed', (r) =>
        networkFailures.push({ path: new URL(r.url()).pathname, error: r.failure()?.errorText }),
      );
      await enter(
        page,
        `render${touch ? 'm' : 'w'}_${Date.now().toString(36)}`,
        true,
        touch ? 'class.mage' : 'class.warrior',
      );
      scenes.push({ touch, counts: await page.evaluate(() => window.__mmo.sceneCounts) });
      check(
        `${touch ? 'Phone' : 'Desktop'} loads all starter chunks`,
        scenes.at(-1).counts.loadedChunks === 16,
      );
      if (!touch) {
        await walk(page, -5, 6, 1.0);
        const npc = await page.evaluate(() => window.__mmo.nearestNpcId);
        await page.evaluate((id) => window.__mmo.lookAt(id), npc);
        await page.waitForTimeout(500);
        await page.screenshot({ path: `${out}/desktop-village.png` });
        const point = await page.evaluate((id) => window.__mmo.screenPos(id), npc);
        if (!point) throw Error('NPC is not visible');
        const hit = await page.evaluate(
          ({ point, npc }) => {
            for (const dy of [0, -12, 12, -24, 24])
              for (const dx of [0, -8, 8]) {
                const x = point.x + dx,
                  y = point.y + dy;
                if (
                  x >= 0 &&
                  y >= 0 &&
                  x < innerWidth &&
                  y < innerHeight &&
                  window.__mmo.pickAt(x, y) === npc
                )
                  return { x, y };
              }
            return null;
          },
          { point, npc },
        );
        fs.writeFileSync(`${out}/pick.json`, JSON.stringify({ point, npc, hit }, null, 2));
        if (!hit) throw Error('NPC is occluded at the projected target');
        await page.mouse.click(hit.x, hit.y);
        await page.waitForFunction(() => window.__mmo.dialogue);
        check(
          'NPC remains selectable through the static scenery',
          !!(await page.evaluate(() => window.__mmo.dialogue)),
        );
      } else {
        const before = await page.evaluate(() => window.__mmo.position);
        const stick = await page.locator('[data-testid=joystick]').boundingBox();
        const cdp = await context.newCDPSession(page);
        const point = { x: stick.x + stick.width / 2, y: stick.y + stick.height / 2 - 40, id: 1 };
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
        await page.waitForTimeout(900);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        const after = await page.evaluate(() => window.__mmo.position);
        check(
          'Touch joystick moves through the rendered village',
          Math.hypot(after.x - before.x, after.z - before.z) > 1,
          { before, after },
        );
        await page.screenshot({ path: `${out}/portrait-village.png` });
        await page.setViewportSize({ width: 844, height: 390 });
        await page.waitForTimeout(400);
        await page.screenshot({ path: `${out}/landscape-village.png` });
        check('Landscape retains a visible game canvas', await page.locator('#game').isVisible());
      }
      await context.close();
    }
    check('No rendering or input exceptions', errors.length === 0, errors);
    fs.writeFileSync(
      `${out}/proof.json`,
      JSON.stringify({ ok: true, checks, scenes, errors, networkFailures }, null, 2),
    );
  } catch (e) {
    fs.writeFileSync(
      `${out}/failure.json`,
      JSON.stringify(
        { ok: false, error: e.stack, checks, scenes, errors, networkFailures },
        null,
        2,
      ),
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
