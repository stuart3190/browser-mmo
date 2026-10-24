/* eslint-disable */
// Functional appearance/layout playtest. Fresh level-five fixtures in a disposable qualification DB;
// all gameplay actions use keyboard/touch. No live or earned-character data is changed.
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const { Client } = require('../../packages/db/node_modules/pg');
const { enter, walk } = require('./vertical-slice.cjs');
const fs = require('node:fs');
const out = process.argv[2] || '/tmp/bo-guidance';
fs.mkdirSync(out, { recursive: true });
const checks = [],
  errors = [];
function check(name, ok, detail) {
  checks.push({ name, ok: !!ok, detail });
  if (!ok) throw Error(name);
  console.log('PASS', name);
}
async function fixture(classId) {
  const url = new URL(process.env.DATABASE_URL);
  if (url.hostname !== '127.0.0.1' || url.pathname !== '/qualification_dev')
    throw Error('Disposable local qualification DB required');
  const username = `guide_${Date.now().toString(36)}`;
  const api = async (path, body, token) => {
    const response = await fetch(process.env.VITE_API_URL + path, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw Error(`${path}: ${response.status}`);
    return response.json();
  };
  const { token } = await api('/v1/auth/dev-login', { username, client: 'tool' });
  const { character } = await api(
    '/v1/characters',
    {
      name: username
        .replace('_', '')
        .replace(/[0-9]/g, (d) => 'abcdefghij'[+d])
        .slice(0, 20),
      classId,
    },
    token,
  );
  const db = new Client({ connectionString: url.toString() });
  await db.connect();
  try {
    await db.query(
      'update characters set level = 5, zone_id=$2, pos_x=$3, pos_z=$4 where id = $1',
      [character.id, 'zone.aurelian.amber_coast', 256, 96],
    );
  } finally {
    await db.end();
  }
  return username;
}
(async () => {
  const browser = await chromium.launch({
    executablePath: '/usr/bin/google-chrome',
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const context = await browser.newContext({ viewport: { width: 1100, height: 740 } });
  await context.addInitScript(() => {
    window.__routeZone = null;
    const WS = WebSocket;
    window.WebSocket = class extends WS {
      constructor(...args) {
        super(...args);
        this.addEventListener('message', (e) => {
          try {
            const m = JSON.parse(e.data);
            if (m.t === 'auth.ok') window.__routeZone = m.d.zoneId;
          } catch {}
        });
      }
    };
  });
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  page.on('pageerror', (e) => errors.push(e.message));
  try {
    const username = await fixture('class.warrior');
    await enter(page, username, false);
    await page.waitForFunction(() =>
      document.querySelector('.quest-guide')?.textContent.includes('Tidecross Harbour'),
    );
    check(
      'Quest compass points from the harbour to its nearby ferry home',
      await page
        .locator('.quest-guide')
        .innerText()
        .then((t) => t.includes('Tidecross Harbour')),
    );
    await page.screenshot({ path: `${out}/harbour-quest-guide.png` });
    await page.keyboard.press('KeyE');
    const recommended = page.locator('.world-departure[data-recommended=true]');
    check(
      'World panel identifies the matching Willow Quay passage',
      await recommended
        .innerText()
        .then((t) => t.includes('Tidecross Harbour') && t.includes('Willow Quay')),
    );
    await recommended.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${out}/suggested-ferry.png` });
    await recommended.locator('[data-travel]').click();
    await page.waitForFunction(() => window.__routeZone === 'zone.aurelian.greenvale_marches');
    await page.waitForFunction(() =>
      document.querySelector('.quest-guide')?.textContent.includes('Greenvale Enclave Gate'),
    );
    check('Real ferry arrival updates quest directions toward the north gate', true);
    await page.locator('[data-open=world]').click();
    await page.getByLabel('Atlas region').selectOption('region.aurelian.elderwood');
    await page.locator('[data-guide-location="location.elderwood.port"]').click();
    await page.waitForFunction(() =>
      document.querySelector('.quest-guide')?.textContent.includes('Willow Quay'),
    );
    check('A distant atlas destination uses the boat at the current quay', true);
    await page.locator('[data-open=world]').click();
    check(
      'Suggested departure changes to the selected forest destination',
      await recommended.innerText().then((t) => t.includes('Pinewatch Landing')),
    );
    await recommended.locator('[data-travel]').click();
    await page.waitForFunction(() => window.__routeZone === 'zone.aurelian.elderwood');
    await page.waitForFunction(() =>
      document.querySelector('.quest-guide')?.textContent.includes('Go to Pinewatch Landing'),
    );
    check('Atlas guidance survives travel and becomes local arrival guidance', true);
    await page.screenshot({ path: `${out}/forest-arrival.png` });
    await enter(page, username, false);
    check(
      'Ordinary travel persists the forest arrival on relogin',
      await page.evaluate(() => window.__routeZone === 'zone.aurelian.elderwood'),
    );
    check('No guidance or travel exceptions', errors.length === 0, errors);
    fs.writeFileSync(
      `${out}/proof.json`,
      JSON.stringify(
        {
          ok: true,
          fixture:
            'Fresh level-five actor at Amber Coast harbour. Normal quest guidance, menu selection, two real boat trips and relogin. No progress/item grants; initial position is a navigation fixture.',
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
      JSON.stringify({ error: e.stack, checks, errors }, null, 2),
    );
    await page.screenshot({ path: `${out}/failure.png` }).catch(() => {});
    throw e;
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
