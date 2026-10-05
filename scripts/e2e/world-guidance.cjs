/* eslint-disable */
// Continues the world tour through a real road node; no position/progression injection.
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const fs = require('node:fs');
const { enter, walk } = require('./vertical-slice.cjs');
const OUT = process.argv[2] || '/tmp/mmo-world-foundation';
const checks = [];
const check = (name, ok) => {
  checks.push({ name, ok: !!ok });
  console.log(ok ? 'PASS' : 'FAIL', name);
  if (!ok) throw Error(name);
};
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome',
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  try {
    const p = await browser.newPage({ viewport: { width: 800, height: 600 } });
    await p.addInitScript(() => {
      window.__guideAuth = [];
      const WS = window.WebSocket;
      window.WebSocket = class extends WS {
        constructor(...args) {
          super(...args);
          this.addEventListener('message', (e) => {
            try {
              const m = JSON.parse(e.data);
              if (m.t === 'auth.ok') window.__guideAuth.push(m);
            } catch {}
          });
        }
      };
    });
    await enter(p, JSON.parse(fs.readFileSync(`${OUT}/users.json`))[0], false);
    await p.waitForFunction(() =>
      document.querySelector('[data-testid=quest-guide]')?.textContent.includes('Travel via'),
    );
    check(
      'Existing quest handoff guides to a real return travel node',
      await p
        .locator('[data-testid=quest-guide]')
        .innerText()
        .then((t) => t.includes('Elder Maren')),
    );
    await p.locator('[data-open=world]').click();
    await p.locator('select[aria-label="Atlas region"]').focus();
    await p.keyboard.press('m');
    check(
      'Atlas keyboard selection does not trigger game menu shortcuts',
      await p.locator('[data-window=world]').isVisible(),
    );
    await p
      .locator('select[aria-label="Atlas region"]')
      .selectOption('region.aurelian.greenvale_marches');
    await p.locator('[data-guide-location="location.anchor.greenvale.waystone"]').click();
    await walk(p, 256, 376, 2);
    await p.locator('[data-open=world]').click();
    await p
      .locator('[data-travel="travel.greenvale_marches.starter_gate.to.greenvale.north_gate"]')
      .click();
    await p.waitForFunction(() => window.__guideAuth.at(-1)?.d.zoneId === 'zone.greenvale.meadows');
    await p.waitForFunction(() =>
      document
        .querySelector('[data-testid=quest-guide]')
        ?.textContent.includes('Go to Old Waystone'),
    );
    check('Selected distant world place remains guided after changing zones', true);
    await p.locator('[data-open=world]').click();
    await p.getByRole('button', { name: 'Resume quest guidance', exact: true }).click();
    await p.waitForFunction(() =>
      document
        .querySelector('[data-testid=quest-guide]')
        ?.textContent.includes('Speak to Elder Maren'),
    );
    check('Explicit resume restores the original quest handoff', true);
    await p.screenshot({ path: `${OUT}/06-return-quest-guidance.png` });
  } finally {
    await browser.close();
    fs.writeFileSync(`${OUT}/guidance-checks.json`, JSON.stringify(checks, null, 2));
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
