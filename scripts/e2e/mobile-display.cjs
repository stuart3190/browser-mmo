/* eslint-disable @typescript-eslint/no-require-imports */
/* global document, getComputedStyle, Element */
/* Browser layout/gesture regression. Uses an existing disposable player account. */
const { chromium } = require(
  process.env.PLAYWRIGHT_PATH || '/opt/aria-browser/node_modules/playwright',
);
const fs = require('fs');
const assert = require('assert');
const root = require('node:path').resolve('apps/game-web/dist');
const base = process.env.GAME_URL || 'https://brokenodyssey.com';
(async () => {
  const b = await chromium.launch({
    executablePath: '/usr/bin/google-chrome',
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const results = [];
  try {
    for (const [name, width, height, touch] of [
      ['portrait', 390, 844, true],
      ['landscape', 844, 390, true],
      ['bars', 390, 650, true],
      ['desktop', 1280, 800, false],
    ]) {
      const c = await b.newContext({
        viewport: { width, height },
        hasTouch: touch,
        isMobile: touch,
        serviceWorkers: 'block',
      });
      const p = await c.newPage();
      const errors = [];
      p.on('pageerror', (e) => errors.push(e.message));
      if (!process.env.LIVE)
        await p.route(base + '/**', async (route) => {
          const path = new URL(route.request().url()).pathname;
          if (path.startsWith('/api/') || path.startsWith('/realtime/')) return route.continue();
          let file = root + (path === '/' ? '/index.html' : path);
          if (!fs.existsSync(file)) return route.continue();
          await route.fulfill({
            path: file,
            contentType: file.endsWith('.js')
              ? 'application/javascript'
              : file.endsWith('.css')
                ? 'text/css'
                : file.endsWith('.html')
                  ? 'text/html'
                  : file.endsWith('.webmanifest')
                    ? 'application/manifest+json'
                    : undefined,
          });
        });
      if (name === 'bars')
        await p.addInitScript(() => {
          Element.prototype.requestFullscreen = () => Promise.reject(new Error('Simulated denial'));
        });
      await p.goto(base);
      await p.fill('[name=username]', process.env.MMO_TEST_USERNAME || 'preview_check');
      await p.fill(
        '[name=password]',
        fs.readFileSync(process.env.MMO_TEST_PASSWORD_FILE, 'utf8').trim(),
      );
      await p.click('#login-form button');
      await p.locator('#char-list button').first().click();
      if (touch) {
        await p.locator('[data-testid=enter-fullscreen]').waitFor();
        assert.equal(await p.evaluate(() => !!document.fullscreenElement), false);
        if (name === 'bars') {
          await p.locator('[data-testid=enter-fullscreen]').tap();
          await p.locator('.fullscreen-note').waitFor();
          await p.locator('.fullscreen-note').tap();
          assert.equal(await p.locator('.fullscreen-start').count(), 0);
        } else await p.locator('[data-testid=continue-browser]').tap();
      } else assert.equal(await p.locator('.mobile-display').count(), 0);
      await p.locator('.player-frame').waitFor({ timeout: 60000 });
      await p.waitForTimeout(2000);
      if (await p.locator('.guide-close').isVisible()) await p.locator('.guide-close').click();
      if (touch) {
        await p.locator('[data-testid=touch-target]').tap();
        await p.waitForTimeout(500);
      }
      // Layout-only worst-case fixture: all combat controls visible even in a safe village.
      if (touch)
        await p.evaluate(() => {
          const group = document.querySelector('.touch-buttons');
          for (const [cls, text] of [
            ['interact', 'Talk'],
            ['attack', 'Attack'],
          ])
            if (!group.querySelector('.' + cls)) {
              const button = document.createElement('button');
              button.className = 'touch-btn ' + cls;
              button.textContent = text;
              group.append(button);
            }
        });
      const boxes = await p.evaluate(() =>
        [
          ...document.querySelectorAll(
            '.joystick,.touch-btn,.ability-bar.touch button,.action-bar button,.player-frame,.target-frame',
          ),
        ]
          .filter(
            (e) => e.getBoundingClientRect().width && getComputedStyle(e).visibility !== 'hidden',
          )
          .map((e) => {
            const r = e.getBoundingClientRect();
            const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
            return {
              label: e.getAttribute('data-testid') || e.textContent.trim().slice(0, 30),
              x: r.x,
              y: r.y,
              w: r.width,
              h: r.height,
              reachable: hit === e || e.contains(hit),
            };
          }),
      );
      for (const r of boxes) {
        assert(
          r.x >= 0 && r.y >= 0 && r.x + r.w <= width + 1 && r.y + r.h <= height + 1,
          `${name} clipped ${JSON.stringify(r)}`,
        );
        if (touch && !r.label.includes('Warrior'))
          assert(r.reachable, `${name} obscured ${JSON.stringify(r)}`);
      }
      await p.screenshot({ path: `/tmp/mobile-${name}.png` });
      results.push({ name, width, height, boxes, errors });
      assert.equal(errors.length, 0);
      if (touch && name === 'landscape') {
        await p.locator('[data-testid=enter-fullscreen]').tap();
        await p.waitForTimeout(300);
        const full = await p.evaluate(() => !!document.fullscreenElement);
        results.push({ nativeFullscreen: full });
        if (full) {
          await p.evaluate(() => document.exitFullscreen());
          await p.locator('[data-testid=enter-fullscreen]').waitFor();
          assert.equal(await p.locator('.fullscreen-start').count(), 0);
        }
      }
      await c.close();
    }
    console.log(JSON.stringify(results, null, 2));
    fs.writeFileSync('/tmp/mobile-proof.json', JSON.stringify(results, null, 2));
  } finally {
    await b.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
