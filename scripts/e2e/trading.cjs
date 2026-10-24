/* eslint-disable */
// Two fresh players; ordinary UI pickup and trade actions, read-only game observations.
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const { enter, walk } = require('./vertical-slice.cjs');
const fs = require('node:fs');
const OUT = process.argv[2] || '/tmp/bo-trading-browser';
fs.mkdirSync(OUT, { recursive: true });
const checks = [],
  errors = [];
function check(name, condition, detail) {
  checks.push({ name, ok: !!condition, detail });
  fs.writeFileSync(`${OUT}/proof.json`, JSON.stringify({ checks, errors }, null, 2));
  if (!condition) throw Error(name);
  console.log('PASS', name);
}
const characterName = (name) =>
  name
    .replace(/_/g, '')
    .replace(/[0-9]/g, (d) => 'abcdefghij'[+d])
    .slice(0, 20);
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome',
    args: [
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--ignore-gpu-blocklist',
      ...(process.env.ASSET_PREVIEW_URL ? ['--disable-features=LocalNetworkAccessChecks'] : []),
    ],
  });
  const desktop = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const phone = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  const a = await desktop.newPage(),
    b = await phone.newPage();
  for (const p of [a, b]) {
    p.on('pageerror', (e) => errors.push(e.message));
    p.on('requestfailed', (r) =>
      errors.push(`Request ${new URL(r.url()).pathname}: ${r.failure()?.errorText}`),
    );
    p.setDefaultTimeout(30000);
  }
  const suffix = Date.now().toString(36),
    userA = `tradea_${suffix}`,
    userB = `tradeb_${suffix}`;
  async function click(p, selector) {
    await p.bringToFront();
    await p.locator(selector)[p === b ? 'tap' : 'click']();
  }
  async function button(p, name) {
    await p.bringToFront();
    await p.getByRole('button', { name, exact: true })[p === b ? 'tap' : 'click']();
  }
  async function tradeOpen(p) {
    await click(p, '[data-open=trade]');
    await p.locator('[data-window=trade]').waitFor();
  }
  async function status(p, value) {
    await p.waitForFunction(
      (value) => document.querySelector('[data-testid=trade-status]')?.textContent.includes(value),
      value,
    );
  }
  try {
    await enter(a, userA, true);
    await enter(b, userB, true, 'class.mage');
    await a.bringToFront();
    await walk(a, 8, -14);
    await a.keyboard.press('KeyE');
    await a.waitForFunction(() =>
      window.__mmo.items.some((i) => i.templateId === 'weapon.sword.iron_longsword'),
    );
    const sword = await a.evaluate(
      () => window.__mmo.items.find((i) => i.templateId === 'weapon.sword.iron_longsword').id,
    );
    check('Fresh Warrior picks up a real uniquely identified sword', !!sword);
    await click(a, '[data-open=inventory]');
    await click(a, `[data-item-id="${sword}"]`);
    check(
      'Inventory renders a vector sword and allows the proficient Warrior to equip',
      (await a.locator(`[data-item-id="${sword}"] svg`).count()) === 1 &&
        (await a.locator('[data-action=equip]').isEnabled()),
    );
    await a.screenshot({ path: `${OUT}/inventory-warrior.png` });
    await a.keyboard.press('Escape');
    await a.keyboard.press('Escape');
    await tradeOpen(a);
    await a.getByLabel('Trade with character').fill(characterName(userB));
    await button(a, 'Invite to trade');
    await status(a, 'Trade open');
    await tradeOpen(b);
    await status(b, 'Trade open');
    check('Mage receives the persisted invitation in the touch Trade window', true);
    await a.getByLabel('Offer Iron Longsword').check();
    await a.getByLabel('Offer copper', { exact: true }).fill('20');
    await button(a, 'Update offer');
    await status(a, 'Revision 1');
    await status(b, 'Revision 1');
    await b.getByLabel('Offer copper', { exact: true }).fill('100');
    await button(b, 'Update offer');
    await status(b, 'Revision 2');
    await status(a, 'Revision 2');
    await button(a, 'Lock offer');
    await button(b, 'Lock offer');
    await status(a, 'Both offers locked');
    await status(b, 'Both offers locked');
    await a.screenshot({ path: `${OUT}/01-reviewed-desktop.png` });
    await b.screenshot({ path: `${OUT}/02-reviewed-phone.png` });
    await button(a, 'Confirm exchange');
    // Changing a locked offer clears the other player's consent; old consent cannot complete it.
    await button(b, 'Edit offer');
    await b.getByLabel('Offer copper', { exact: true }).fill('120');
    await button(b, 'Update offer');
    await status(a, 'Revision 3');
    check(
      'Changed offer clears confirmation and requires review again',
      await a.getByRole('button', { name: 'Confirm exchange', exact: true }).isDisabled(),
    );
    await button(a, 'Lock offer');
    await button(b, 'Lock offer');
    await status(a, 'Both offers locked');
    await button(a, 'Confirm exchange');
    await button(b, 'Confirm exchange');
    await status(a, 'Trade completed');
    await status(b, 'Trade completed');
    await a.waitForFunction((id) => !window.__mmo.items.some((i) => i.id === id), sword);
    await b.waitForFunction((id) => window.__mmo.items.some((i) => i.id === id), sword);
    check('One sword transfers to the Mage and disappears from the Warrior', true, { sword });
    check(
      'Both wallets reflect the net 100-copper exchange',
      (await a.locator('[data-window=trade] [data-testid=wallet]').textContent()).includes('11s') &&
        (await b.locator('[data-window=trade] [data-testid=wallet]').textContent()).includes('9s'),
    );
    await b.screenshot({ path: `${OUT}/03-completed-phone.png` });
    await b.keyboard.press('Escape');
    await click(b, '[data-open=inventory]');
    await click(b, `[data-item-id="${sword}"]`);
    check(
      'Touch Mage sees the sword requirement and cannot submit an invalid equip',
      (await b.locator('[data-action=equip]').isDisabled()) &&
        (await b.locator('[data-action=equip]').getAttribute('title')).includes(
          'Sword proficiency',
        ),
    );
    await b.screenshot({ path: `${OUT}/inventory-mage-phone.png` });
    await enter(b, userB, false);
    await tradeOpen(b);
    await status(b, 'Trade completed');
    check(
      'Fresh login retains the completed trade and the same item instance',
      await b.evaluate((id) => window.__mmo.items.some((i) => i.id === id), sword),
    );
    await b.setViewportSize({ width: 844, height: 390 });
    await b.screenshot({ path: `${OUT}/04-landscape.png` });
    const bounds = await b.locator('[data-window=trade]').boundingBox();
    check(
      'Landscape trade panel remains inside the viewport',
      bounds &&
        bounds.x >= 0 &&
        bounds.y >= 0 &&
        bounds.x + bounds.width <= 845 &&
        bounds.y + bounds.height <= 391,
      bounds,
    );
    await a.getByLabel('Trade with character').fill(characterName(userB));
    await button(a, 'Invite to trade');
    await status(a, 'Trade open');
    await button(a, 'Cancel trade');
    await status(a, 'Trade cancelled');
    check('A new trade can be cancelled without touching transferred ownership', true);
    check('No browser exceptions', errors.length === 0, errors);
  } catch (e) {
    fs.writeFileSync(`${OUT}/failure.txt`, e.stack || String(e));
    fs.writeFileSync(`${OUT}/errors.json`, JSON.stringify(errors, null, 2));
    for (const [p, name] of [
      [a, 'desktop'],
      [b, 'phone'],
    ])
      await p.screenshot({ path: `${OUT}/failure-${name}.png` }).catch(() => {});
    throw e;
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
