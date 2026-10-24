/* eslint-disable */
// Three real players. Only ordinary party/chat UI; read-only observations for privacy and movement.
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const { enter } = require('./vertical-slice.cjs');
const fs = require('node:fs');
const OUT = process.argv[2] || '/tmp/bo-social-browser';
fs.mkdirSync(OUT, { recursive: true });
const checks = [],
  errors = [];
function check(name, ok, detail) {
  checks.push({ name, ok: !!ok, detail });
  fs.writeFileSync(`${OUT}/proof.json`, JSON.stringify({ checks, errors }, null, 2));
  if (!ok) throw Error(name);
  console.log('PASS', name);
}
const nameOf = (s) =>
  s
    .replace(/_/g, '')
    .replace(/[0-9]/g, (d) => 'abcdefghij'[+d])
    .slice(0, 20);
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome',
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
  const contexts = await Promise.all([
    browser.newContext({ viewport: { width: 1280, height: 800 } }),
    browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }),
    browser.newContext({ viewport: { width: 1000, height: 740 } }),
  ]);
  for (const context of contexts)
    await context.addInitScript(() => {
      window.__chatObserved = [];
      const Socket = window.WebSocket;
      window.WebSocket = class extends Socket {
        constructor(...args) {
          super(...args);
          this.addEventListener('message', (e) => {
            const m = JSON.parse(e.data);
            if (m.t === 'chat.message') window.__chatObserved.push(m.d);
          });
        }
      };
    });
  const [a, b, c] = await Promise.all(contexts.map((ctx) => ctx.newPage()));
  for (const p of [a, b, c]) {
    p.setDefaultTimeout(30000);
    p.on('pageerror', (e) => errors.push(e.message));
  }
  const stamp = Date.now().toString(36),
    users = [`chata_${stamp}`, `chatb_${stamp}`, `chatc_${stamp}`];
  async function click(p, locator) {
    await p.bringToFront();
    await locator[p === b ? 'tap' : 'click']();
  }
  async function button(p, name) {
    await click(p, p.getByRole('button', { name, exact: true }));
  }
  async function menu(p, id) {
    await click(p, p.locator(`[data-open=${id}]`));
  }
  async function send(p, channel, text) {
    await p.bringToFront();
    await p.getByLabel('Chat channel', { exact: true }).selectOption(channel);
    await p.getByLabel('Chat message', { exact: true }).fill(text);
    await button(p, 'Send');
  }
  async function received(p, text) {
    await p.waitForFunction((text) => window.__chatObserved.some((m) => m.text === text), text);
  }
  try {
    await enter(a, users[0], true);
    await enter(b, users[1], true, 'class.mage');
    await enter(c, users[2], true);
    await menu(a, 'party');
    await button(a, `Invite ${nameOf(users[1])}`);
    await button(b, 'Accept party');
    await a.getByRole('button', { name: 'Disband party', exact: true }).waitFor();
    await button(a, 'Close Party');
    check('Warrior invites the touch Mage through ordinary Party UI', true);
    await a.keyboard.press('Enter');
    await a.getByLabel('Chat message', { exact: true }).waitFor();
    const before = await a.evaluate(() => window.__mmo.position);
    await a
      .getByLabel('Chat message', { exact: true })
      .pressSequentially('wasd f123 e', { delay: 100 });
    const after = await a.evaluate(() => window.__mmo.position);
    check(
      'Typing movement and combat keys in the composer does not move the player',
      Math.hypot(before.x - after.x, before.z - after.z) < 0.1,
    );
    await send(a, 'party', '<script>party secret</script>');
    await received(b, '<script>party secret</script>');
    await b.waitForFunction(() =>
      document.querySelector('[data-open=chat]')?.textContent.includes('(1)'),
    );
    await menu(b, 'chat');
    check(
      'Unread party message appears as literal text in touch chat',
      (await b.getByRole('log').textContent()).includes('<script>party secret</script>'),
    );
    await send(b, 'party', 'Ready for the Broken Vault');
    await received(a, 'Ready for the Broken Vault');
    await send(a, 'zone', 'Zone marker for all three players');
    await received(c, 'Zone marker for all three players');
    check(
      'Bystander receives zone chat but neither private party message',
      !(await c.evaluate(() => window.__chatObserved.some((m) => m.channel === 'party'))),
    );
    await send(b, 'say', 'Hello nearby adventurers');
    await received(c, 'Hello nearby adventurers');
    check('Nearby chat reaches players in range', true);
    await a.screenshot({ path: `${OUT}/01-desktop-chat.png` });
    await b.screenshot({ path: `${OUT}/02-phone-chat.png` });
    const portrait = await b.locator('[data-window=chat]').boundingBox();
    check(
      'Portrait chat stays in view with readable menu targets',
      portrait.y >= 0 &&
        portrait.x >= 0 &&
        portrait.x + portrait.width <= 391 &&
        portrait.y + portrait.height <= 845 &&
        (await b
          .locator('[data-open=chat]')
          .evaluate((el) => el.getBoundingClientRect().width >= 70)),
      portrait,
    );
    await b.setViewportSize({ width: 844, height: 390 });
    await b.screenshot({ path: `${OUT}/03-landscape-chat.png` });
    const landscape = await b.locator('[data-window=chat]').boundingBox();
    check(
      'Landscape keeps the composer inside its panel',
      landscape.y >= 0 &&
        landscape.y + landscape.height <= 391 &&
        (await b.getByLabel('Chat message', { exact: true }).isVisible()),
      landscape,
    );
    await button(b, 'Close Chat');
    await menu(b, 'party');
    await button(b, 'Leave party');
    await button(b, 'Close Party');
    await menu(b, 'chat');
    await b.waitForFunction(() => document.querySelector('option[value=party]')?.disabled);
    check(
      'Leaving the party removes private-channel eligibility',
      await b.locator('option[value=party]').evaluate((option) => option.disabled),
    );
    await a.getByLabel('Chat message', { exact: true }).press('Escape');
    check(
      'Escape closes chat without affecting the world',
      (await a.locator('[data-window=chat]').count()) === 0,
    );
    check('No browser exceptions', errors.length === 0, errors);
  } catch (e) {
    fs.writeFileSync(`${OUT}/failure.txt`, e.stack || String(e));
    await a.screenshot({ path: `${OUT}/failure-desktop.png` }).catch(() => {});
    await b.screenshot({ path: `${OUT}/failure-phone.png` }).catch(() => {});
    throw e;
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
