/* eslint-disable */
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const fs = require('node:fs');
const out = process.argv[2] || '/tmp/bo-startup';
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
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage({ viewport: { width: 1100, height: 740 } });
  page.setDefaultTimeout(60000);
  page.on('pageerror', (e) => errors.push(e.message));
  const abort = (r) => r.abort('failed');
  const boot = /\/src\/bootstrap\.ts(?:\?.*)?$/;
  const main = /\/src\/main\.ts(?:\?.*)?$/;
  const game = /\/src\/game\/game\.ts(?:\?.*)?$/;
  try {
    await page.route(boot, abort);
    await page.goto(process.env.WEB_URL);
    check(
      'An unavailable entry module retains readable HTML and a reload link',
      (await page.getByRole('region', { name: 'Loading Broken Odyssey' }).isVisible()) &&
        (await page.getByRole('link', { name: 'reload the game' }).isVisible()),
    );
    await page.screenshot({ path: out + '/entry-unavailable.png' });
    await page.unroute(boot, abort);
    await page.route(main, abort);
    await page.reload();
    await page.getByRole('heading', { name: 'Your adventure could not load' }).waitFor();
    check(
      'Application module failure offers an explicit recovery action',
      await page.getByRole('link', { name: 'Reload game', exact: true }).isVisible(),
    );
    await page.unroute(main, abort);
    await page.getByRole('link', { name: 'Reload game', exact: true }).click();
    await page.getByLabel('Username', { exact: true }).waitFor();
    let gameRequests = 0;
    await page.route(game, (r) => {
      gameRequests++;
      return abort(r);
    });
    const username = 'startup_' + Date.now().toString(36);
    await page.getByLabel('Username', { exact: true }).fill(username);
    await page.locator('#login-form button').click();
    await page.getByLabel('Character name', { exact: true }).waitFor();
    check('Login and character choice work before loading the 3D game', gameRequests === 0);
    await page.getByLabel('Character name', { exact: true }).fill(
      username
        .replace(/_/g, '')
        .replace(/[0-9]/g, (d) => 'abcdefghij'[+d])
        .slice(0, 20),
    );
    await page.locator('#create-form button').click();
    await page.getByRole('heading', { name: 'Your adventure could not load' }).waitFor();
    check('Failed game download preserves a recovery screen', gameRequests === 1);
    await page.screenshot({ path: out + '/game-unavailable.png' });
    await page.unroute(game);
    await page.getByRole('link', { name: 'Reload game', exact: true }).click();
    await page.getByLabel('Username', { exact: true }).fill(username);
    await page.locator('#login-form button').click();
    await page.locator('#char-list button').first().click();
    await page.locator('[data-testid=player-hp]').waitFor();
    check(
      'Reload recovers the existing character into the world',
      !!(await page.evaluate(() => window.__mmo?.vitals)),
    );
    await page.screenshot({ path: out + '/recovered-world.png' });
    check('Handled startup failures do not become uncaught exceptions', errors.length === 0);
    fs.writeFileSync(out + '/proof.json', JSON.stringify({ ok: true, checks, errors }, null, 2));
  } catch (e) {
    fs.writeFileSync(
      out + '/failure.json',
      JSON.stringify({ ok: false, error: e.stack, checks, errors }, null, 2),
    );
    await page.screenshot({ path: out + '/failure.png' }).catch(() => {});
    throw e;
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
