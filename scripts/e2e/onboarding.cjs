/* eslint-disable */
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const { enter, configurePreview } = require('./vertical-slice.cjs');
const fs = require('node:fs');
const out = process.argv[2] || '/tmp/bo-onboarding';
fs.mkdirSync(out, { recursive: true });
const checks = [],
  errors = [];
function check(name, ok) {
  checks.push({ name, ok: !!ok });
  if (!ok) throw Error(name);
  console.log('PASS', name);
}
(async () => {
  const browser = await chromium.launch({
    executablePath: '/usr/bin/google-chrome',
    args: [
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      ...(process.env.ASSET_PREVIEW_URL ? ['--disable-features=LocalNetworkAccessChecks'] : []),
    ],
  });
  try {
    const phone = await browser.newContext({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
    });
    const p = await phone.newPage();
    p.on('pageerror', (e) => errors.push(e.message));
    await configurePreview(p);
    await p.goto(process.env.WEB_URL);
    check(
      'Login uses the game title',
      await p.getByRole('heading', { name: 'Broken Odyssey', exact: true }).isVisible(),
    );
    const stamp = Date.now().toString(36);
    await p.getByLabel('Username', { exact: true }).fill('onboardm_' + stamp);
    await p.screenshot({ path: out + '/01-login-phone.png' });
    await p.locator('#login-form button').tap();
    await p
      .getByLabel('Character name', { exact: true })
      .fill(('Newmage' + stamp).replace(/[0-9]/g, (d) => 'abcdefghij'[+d]).slice(0, 20));
    check(
      'Warrior selection explains close-range combat',
      await p
        .locator('#class-hint')
        .textContent()
        .then((s) => s.includes('Close-range')),
    );
    await p.getByLabel('Class', { exact: true }).selectOption('class.mage');
    check(
      'Mage selection explains ranged attacks and warnings',
      await p
        .locator('#class-hint')
        .textContent()
        .then((s) => s.includes('Ranged fire spells') && s.includes('enemy warnings')),
    );
    await p.screenshot({ path: out + '/02-create-phone.png' });
    await p.setViewportSize({ width: 844, height: 390 });
    await p.locator('#create-form button').scrollIntoViewIfNeeded();
    const box = await p.locator('#create-form button').boundingBox();
    check(
      'Landscape character creation stays reachable by scrolling',
      box && box.y >= 0 && box.y + box.height <= 390 && box.height >= 44,
    );
    await p.screenshot({ path: out + '/03-create-landscape.png' });
    await p.setViewportSize({ width: 390, height: 844 });
    await p.locator('#create-form button').tap();
    await p.waitForFunction(
      () => window.__mmo?.vitals || document.querySelector('[data-testid=continue-browser]'),
    );
    if (await p.locator('[data-testid=continue-browser]').isVisible())
      await p.locator('[data-testid=continue-browser]').tap();
    await p.locator('[data-testid=player-hp]').waitFor();
    check(
      'Fresh Mage has distinct fire spell icons and a locked level-two ability',
      (await p.locator('[data-testid="ability-ability.mage.firebolt"] svg:visible').count()) ===
        1 &&
        (await p.locator('[data-testid="ability-ability.mage.flame_burst"]:visible').isDisabled()),
    );
    await p.screenshot({ path: out + '/04-mage-hud.png' });
    const desktop = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const w = await desktop.newPage();
    w.on('pageerror', (e) => errors.push(e.message));
    await enter(w, 'onboardw_' + stamp, true);
    check(
      'Fresh Warrior has distinct attack and strike icons',
      (await w.locator('.ability-glyph:visible').count()) === 3,
    );
    await w.screenshot({ path: out + '/05-warrior-hud.png' });
    check('No browser exceptions', errors.length === 0);
  } finally {
    await browser.close();
    fs.writeFileSync(out + '/proof.json', JSON.stringify({ checks, errors }, null, 2));
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
