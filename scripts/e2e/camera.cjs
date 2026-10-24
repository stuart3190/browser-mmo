/* eslint-disable */
// Fresh characters. Real pointer, wheel, multi-touch and UI inputs; read-only camera observations.
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const { enter } = require('./vertical-slice.cjs');
const fs = require('node:fs');
const out = process.argv[2] || '/tmp/bo-camera';
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
    for (const touch of process.env.CAMERA_TOUCH_ONLY === '1' ? [true] : [false, true]) {
      const label = touch ? 'touch' : 'desktop';
      const context = await browser.newContext({
        viewport: touch ? { width: 390, height: 844 } : { width: 1100, height: 740 },
        hasTouch: touch,
        isMobile: touch,
      });
      page = await context.newPage();
      const cdp = touch ? await context.newCDPSession(page) : null;
      // hasTouch alone advertises one contact; configure a real multi-touch device before boot.
      if (cdp)
        await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
      page.setDefaultTimeout(45000);
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => {
        if (m.type() === 'error') console.log('BROWSER ERROR', m.text(), m.location().url);
      });
      page.on('requestfailed', (r) =>
        console.log('REQUEST FAILED', new URL(r.url()).pathname, r.failure()?.errorText),
      );
      await enter(
        page,
        `camera_${label}_${Date.now().toString(36)}`,
        true,
        touch ? 'class.mage' : 'class.warrior',
      );
      const click = (l) => l[touch ? 'tap' : 'click']();
      if (await page.getByRole('button', { name: 'Dismiss opening guide' }).isVisible())
        await click(page.getByRole('button', { name: 'Dismiss opening guide' }));
      const initial = await page.evaluate(() => ({
        view: window.__mmo.cameraView,
        pos: window.__mmo.position,
      }));
      const x = touch ? 195 : 550,
        y = touch ? 380 : 360;
      check(
        `${label} camera gesture starts on unobscured world`,
        await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.tagName === 'CANVAS', {
          x,
          y,
        }),
      );
      if (touch) {
        check(
          'touch device supports multiple fingers',
          await page.evaluate(() => navigator.maxTouchPoints >= 2),
        );
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchStart',
          touchPoints: [{ id: 1, x: x - 50, y, radiusX: 4, radiusY: 4 }],
        });
        for (let i = 1; i <= 10; i++)
          await cdp.send('Input.dispatchTouchEvent', {
            type: 'touchMove',
            touchPoints: [{ id: 1, x: x - 50 + i * 10, y: y + i * 2, radiusX: 4, radiusY: 4 }],
          });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await page.waitForFunction(
          (a) => Math.abs(window.__mmo.cameraView.alpha - a) > 0.05,
          initial.view.alpha,
        );
        check('touch drag rotates the camera', true);
        await page.waitForTimeout(500);
        const r = await page.evaluate(() => window.__mmo.cameraView.radius);
        const points = (spread) => [
          { id: 1, x: x - spread, y, radiusX: 4, radiusY: 4 },
          { id: 2, x: x + spread, y, radiusX: 4, radiusY: 4 },
        ];
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points(30) });
        for (let i = 1; i <= 12; i++) {
          await cdp.send('Input.dispatchTouchEvent', {
            type: 'touchMove',
            touchPoints: points(30 + i * 5),
          });
          await page.waitForTimeout(100);
        }
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await page.waitForTimeout(500);
        await page.waitForFunction((r) => window.__mmo.cameraView.radius < r - 0.1, r);
        check('touch spreading fingers zooms into the world', true);
        await page.waitForTimeout(700);
        const zoomed = await page.evaluate(() => window.__mmo.cameraView.radius);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points(90) });
        for (let i = 1; i <= 12; i++) {
          await cdp.send('Input.dispatchTouchEvent', {
            type: 'touchMove',
            touchPoints: points(90 - i * 5),
          });
          await page.waitForTimeout(100);
        }
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await page.waitForFunction((r) => window.__mmo.cameraView.radius > r + 0.1, zoomed);
        check('touch bringing fingers together zooms out', true);
        check(
          'touch pinch keeps the page at normal scale',
          await page.evaluate(() => Math.abs(window.visualViewport.scale - 1) < 0.01),
        );
        await cdp.detach();
      } else {
        await page.mouse.move(x - 70, y);
        await page.mouse.down();
        await page.mouse.move(x + 70, y + 25, { steps: 14 });
        await page.mouse.up();
        await page.waitForFunction(
          (a) => Math.abs(window.__mmo.cameraView.alpha - a) > 0.05,
          initial.view.alpha,
        );
        check('desktop mouse drag rotates the camera', true);
        await page.waitForTimeout(400);
        const r = await page.evaluate(() => window.__mmo.cameraView.radius);
        await page.mouse.wheel(0, -360);
        await page.waitForFunction((r) => window.__mmo.cameraView.radius < r - 0.1, r);
        check('desktop wheel zooms into the world', true);
        await page.mouse.wheel(0, 4000);
        await page.waitForTimeout(900);
        check(
          'desktop zoom respects maximum distance',
          await page.evaluate(() => window.__mmo.cameraView.radius <= 28),
        );
        await page.mouse.wheel(0, -8000);
        await page.waitForTimeout(900);
        check(
          'desktop zoom respects minimum distance',
          await page.evaluate(() => window.__mmo.cameraView.radius >= 4),
        );
      }
      check(
        `${label} viewing controls do not move character`,
        await page.evaluate(
          (p) => Math.hypot(window.__mmo.position.x - p.x, window.__mmo.position.z - p.z) < 0.1,
          initial.pos,
        ),
      );
      await click(page.locator('[data-open=settings]'));
      const reset = page.getByRole('button', { name: 'Reset camera view', exact: true });
      await reset.scrollIntoViewIfNeeded();
      const b = await reset.boundingBox();
      check(`${label} reset camera has a touch-sized control`, b.width >= 44 && b.height >= 44);
      await page.screenshot({ path: `${out}/${label}-settings.png` });
      await click(reset);
      await page.waitForFunction(() => !document.querySelector('[data-window=settings]'));
      await page.waitForTimeout(1000);
      check(
        `${label} reset restores stable starting view`,
        await page.evaluate(() => {
          const c = window.__mmo.cameraView;
          return (
            Math.abs(c.alpha + Math.PI / 2) < 0.001 &&
            Math.abs(c.beta - Math.PI / 3) < 0.001 &&
            Math.abs(c.radius - 21) < 0.001
          );
        }),
      );
      check(
        `${label} camera reset leaves character in place`,
        await page.evaluate(
          (p) => Math.hypot(window.__mmo.position.x - p.x, window.__mmo.position.z - p.z) < 0.1,
          initial.pos,
        ),
      );
      await page.screenshot({ path: `${out}/${label}-reset-world.png` });
      await context.close();
    }
    check('No camera gameplay exceptions', errors.length === 0, errors);
    fs.writeFileSync(
      `${out}/proof.json`,
      JSON.stringify(
        {
          ok: true,
          checks,
          errors,
          authority: 'fresh ordinary players; mouse, wheel, touch and UI only',
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
