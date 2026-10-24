/* eslint-disable */
// Two fresh characters earn an item via pickup, then list, inspect, buy and cancel through the UI.
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const { enter, walk } = require('./vertical-slice.cjs');
const fs = require('node:fs');
const OUT = process.argv[2] || '/tmp/bo-market-browser';
fs.mkdirSync(OUT, { recursive: true });
const checks = [],
  errors = [];
function check(name, ok, detail) {
  checks.push({ name, ok: !!ok, detail });
  fs.writeFileSync(`${OUT}/proof.json`, JSON.stringify({ checks, errors }, null, 2));
  if (!ok) throw Error(name);
  console.log('PASS', name);
}
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome',
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
  const desktop = await browser.newContext({ viewport: { width: 1280, height: 800 } }),
    phone = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
  const a = await desktop.newPage(),
    b = await phone.newPage();
  for (const p of [a, b]) {
    p.setDefaultTimeout(30000);
    p.on('pageerror', (e) => errors.push(e.message));
  }
  const stamp = Date.now().toString(36),
    userA = `marketa_${stamp}`,
    userB = `marketb_${stamp}`;
  async function click(p, loc) {
    await p.bringToFront();
    await loc[p === b ? 'tap' : 'click']();
  }
  async function button(p, name) {
    await click(p, p.getByRole('button', { name, exact: true }));
  }
  async function tab(p, name) {
    await click(p, p.getByRole('tab', { name, exact: true }));
  }
  async function open(p) {
    await click(p, p.locator('[data-open=market]'));
    await p.locator('[data-window=market]').waitFor();
  }
  async function notice(p, text) {
    await p.waitForFunction(
      (text) => document.querySelector('.market-notice')?.textContent.includes(text),
      text,
    );
  }
  async function wallet(p, text) {
    await p.waitForFunction(
      (text) =>
        document
          .querySelector('[data-window=market] [data-testid=wallet]')
          ?.textContent.includes(text),
      text,
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
    await open(a);
    await tab(a, 'Sell an item');
    await a.getByLabel('Item to list', { exact: true }).selectOption(sword);
    await a.getByLabel('Listing price in copper', { exact: true }).fill('100');
    check(
      'Seller sees the non-refundable deposit and net proceeds before listing',
      (await a.locator('.market-sell').textContent()).includes('Pay 10 copper now') &&
        (await a.locator('.market-sell').textContent()).includes('receive 95 copper'),
    );
    await a.screenshot({ path: `${OUT}/01-sell-review.png` });
    await button(a, 'Create listing');
    await notice(a, 'Listing created');
    await a.locator('[data-listing]').first().waitFor();
    const listing = await a.locator('[data-listing]').first().getAttribute('data-listing');
    await a.waitForFunction((id) => !window.__mmo.items.some((i) => i.id === id), sword);
    await wallet(a, '9s 90c');
    check('Listing escrows the same sword and charges exactly ten copper', true, {
      sword,
      listing,
    });
    await open(b);
    await b
      .getByLabel('Filter marketplace items', { exact: true })
      .selectOption('weapon.sword.iron_longsword');
    await click(
      b,
      b
        .locator(`[data-listing="${listing}"]`)
        .getByRole('button', { name: 'Inspect Iron Longsword', exact: true }),
    );
    await b.locator('.market-review [data-testid=item-tooltip]').waitFor();
    check(
      'Touch buyer reviews the actual item tooltip and total price',
      (await b.locator('.market-review').textContent()).includes('Iron Longsword') &&
        (await b.locator('.market-review').textContent()).includes('Total price: 1s'),
    );
    await b.screenshot({ path: `${OUT}/02-phone-purchase-review.png` });
    await button(b, 'Buy for 1s 0c');
    await notice(b, 'Purchased Iron Longsword');
    await b.waitForFunction((id) => window.__mmo.items.some((i) => i.id === id), sword);
    await wallet(b, '9s');
    await button(a, 'Refresh listings');
    await a.waitForFunction(
      (id) => document.querySelector(`[data-listing="${id}"]`)?.textContent.includes('sold'),
      listing,
    );
    await wallet(a, '10s 85c');
    check('One sword transfers, buyer pays 100 copper, seller receives 95 after fees', true);
    await enter(b, userB, false);
    await open(b);
    check(
      'Fresh login retains the purchased item identity',
      await b.evaluate((id) => window.__mmo.items.some((i) => i.id === id), sword),
    );
    await tab(b, 'Sell an item');
    await b.getByLabel('Item to list', { exact: true }).selectOption(sword);
    await b.getByLabel('Listing price in copper', { exact: true }).fill('150');
    await button(b, 'Create listing');
    await notice(b, 'Listing created');
    await b.locator('[data-listing]').first().waitFor();
    await button(b, 'Cancel listing');
    await notice(b, 'Listing cancelled');
    await b.waitForFunction((id) => window.__mmo.items.some((i) => i.id === id), sword);
    await wallet(b, '8s 90c');
    check('Cancelling returns the item without refunding the ten-copper listing fee', true);
    await b.screenshot({ path: `${OUT}/03-phone-cancelled.png` });
    await b.setViewportSize({ width: 844, height: 390 });
    await b.screenshot({ path: `${OUT}/04-landscape-market.png` });
    const bounds = await b.locator('[data-window=market]').boundingBox();
    check(
      'Marketplace remains within the landscape viewport',
      bounds.x >= 0 &&
        bounds.y >= 0 &&
        bounds.x + bounds.width <= 845 &&
        bounds.y + bounds.height <= 391,
      bounds,
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
