/* eslint-disable */
// Functional combat playtest. Fresh level-three fixtures in a disposable qualification DB;
// all gameplay actions use keyboard/touch. No live or earned-character data is changed.
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const { Client } = require('../../packages/db/node_modules/pg');
const { enter, walk } = require('./vertical-slice.cjs');
const fs = require('node:fs');
const out = process.argv[2] || '/tmp/bo-remedy';
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
  const username = `remedy_${Date.now().toString(36)}`;
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
    await db.query('update characters set level=5, zone_id=$2, pos_x=264, pos_z=402 where id=$1', [
      character.id,
      'zone.aurelian.amber_coast',
    ]);
  } finally {
    await db.end();
  }
  return username;
}
(async () => {
  const { getGameData, CollisionWorld, chunkColliders } =
    await import('../../packages/game-data/src/index.ts');
  const { NavGrid } = await import('../../services/world/src/navigation.ts');
  const gd = getGameData(),
    zone = 'zone.aurelian.amber_coast',
    collision = new CollisionWorld(gd.chunksForZone(zone).flatMap(chunkColliders));
  const browser = await chromium.launch({
    executablePath: '/usr/bin/google-chrome',
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  let page;
  try {
    let context = await browser.newContext({ viewport: { width: 1100, height: 740 } });
    page = await context.newPage();
    page.setDefaultTimeout(30000);
    page.on('pageerror', (e) => errors.push(e.message));
    const username = await fixture('class.warrior');
    await enter(page, username, false);
    const count = () =>
      page.evaluate(() =>
        window.__mmo.items
          .filter(
            (i) =>
              i.templateId === 'consumable.greenvale.remedy' &&
              i.location.kind === 'container' &&
              i.location.containerKind === 'backpack',
          )
          .reduce((n, i) => n + i.quantity, 0),
      );
    async function go(x, z, range = 1.5) {
      const here = await page.evaluate(() => window.__mmo.position);
      const nav = new NavGrid(
        collision,
        {
          minX: Math.min(here.x, x) - 20,
          maxX: Math.max(here.x, x) + 20,
          minZ: Math.min(here.z, z) - 20,
          maxZ: Math.max(here.z, z) + 20,
        },
        2,
      );
      const path = nav.findPath(here, { x, z });
      if (!path) throw Error('No route');
      let from = here;
      for (const [i, p] of path.entries()) {
        const n = Math.max(1, Math.ceil(Math.hypot(p.x - from.x, p.z - from.z) / 2));
        for (let k = 1; k <= n; k++)
          await walk(
            page,
            from.x + ((p.x - from.x) * k) / n,
            from.z + ((p.z - from.z) * k) / n,
            i === path.length - 1 && k === n ? range : 1,
          );
        from = p;
      }
    }
    await page.keyboard.press('KeyE');
    await page.waitForFunction(
      () => window.__mmo.dialogue?.npcId === 'npc.world.amber_coast.merchant',
    );
    for (let n = 1; n <= 3; n++) {
      await page.locator('[data-service="service.amber_coast.buy_remedy"]').click();
      await page.waitForFunction(
        (n) =>
          window.__mmo.items
            .filter(
              (i) =>
                i.templateId === 'consumable.greenvale.remedy' && i.location.kind === 'container',
            )
            .reduce((s, i) => s + i.quantity, 0) === n,
        n,
      );
      await page.waitForTimeout(150);
    }
    await page.getByRole('button', { name: 'Close dialogue', exact: true }).click();
    check('Three remedies bought through the merchant UI', (await count()) === 3);
    check(
      'Full health prevents accidental drinking',
      await page.locator('[data-testid=quick-remedy]').isDisabled(),
    );
    await page.keyboard.press('KeyH');
    check('Full-health shortcut preserves the stack', (await count()) === 3);
    async function injured() {
      await go(304, 136);
      await go(316, 157, 2);
      await page.keyboard.press('Tab');
      await page.waitForFunction(
        () =>
          window.__mmo.vitals.inCombat &&
          window.__mmo.vitals.maxHealth - window.__mmo.vitals.health >= 65,
        null,
        { timeout: 45000 },
      );
      return page.evaluate(() => window.__mmo.vitals.health);
    }
    let before = await injured();
    await page.keyboard.press('KeyH');
    await page.waitForFunction((before) => window.__mmo.vitals.health >= before + 45, before);
    await page.waitForFunction(
      () =>
        document.querySelector('[data-testid=quick-remedy]')?.getAttribute('data-count') === '2',
    );
    check('H heals during real combat and consumes exactly one remedy', (await count()) === 2);
    const ready = await page.evaluate(() => window.__mmo.systems.remedyReadyAtMs);
    check(
      'Server cooldown is shown immediately',
      (await page.locator('[data-testid=quick-remedy]').getAttribute('data-cooldown')) === '30',
    );
    await page.keyboard.press('KeyH');
    await page.keyboard.press('KeyH');
    check('Repeated shortcut cannot consume during cooldown', (await count()) === 2);
    await page.screenshot({ path: `${out}/desktop-combat-heal.png` });
    await page.keyboard.press('Escape');
    await go(304, 130);
    await go(284, 112);
    await page.waitForFunction(() => !window.__mmo.vitals.inCombat);
    await context.close();
    context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
    });
    page = await context.newPage();
    page.setDefaultTimeout(30000);
    page.on('pageerror', (e) => errors.push(e.message));
    await enter(page, username, false);
    await page.waitForFunction(() => window.__mmo.systems.remedyReadyAtMs !== undefined);
    check(
      'Relogin preserves the exact server cooldown and remaining stack',
      (await page.evaluate((ready) => window.__mmo.systems.remedyReadyAtMs === ready, ready)) &&
        (await count()) === 2,
    );
    for (const viewport of [
      { width: 390, height: 844 },
      { width: 844, height: 480 },
    ]) {
      await page.setViewportSize(viewport);
      const b = page.locator('[data-testid=quick-remedy]');
      const r = await b.boundingBox();
      const visible = await b.evaluate((b) => {
        const r = b.getBoundingClientRect();
        return b.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
      });
      check(
        `Remedy remains unobstructed at ${viewport.width}x${viewport.height}`,
        visible &&
          r.width >= 44 &&
          r.height >= 44 &&
          r.x >= 0 &&
          r.y >= 0 &&
          r.x + r.width <= viewport.width &&
          r.y + r.height <= viewport.height,
      );
      await page.screenshot({ path: `${out}/touch-${viewport.width}.png` });
    }
    await page.setViewportSize({ width: 390, height: 844 });
    before = await injured();
    await page.waitForFunction(
      () =>
        document.querySelector('[data-testid=quick-remedy]')?.getAttribute('data-cooldown') === '0',
    );
    await page.locator('[data-testid=quick-remedy]').tap();
    await page.waitForFunction((before) => window.__mmo.vitals.health >= before + 45, before);
    await page.waitForFunction(
      () =>
        document.querySelector('[data-testid=quick-remedy]')?.getAttribute('data-count') === '1',
    );
    check(
      'Touch control heals in combat without opening a bag',
      (await count()) === 1 && !(await page.locator('[data-testid=item-details]').isVisible()),
    );
    await page.screenshot({ path: `${out}/touch-combat-heal.png` });
    check('No remedy gameplay exceptions', errors.length === 0, errors);
    fs.writeFileSync(
      `${out}/proof.json`,
      JSON.stringify(
        {
          ok: true,
          fixture:
            'Fresh level-five character at coastal merchant. Remedies bought normally; injuries from real crabs; no item/health grants or fake actions.',
          checks,
          errors,
        },
        null,
        2,
      ),
    );
    await context.close();
  } catch (e) {
    fs.writeFileSync(
      `${out}/failure.json`,
      JSON.stringify({ error: e.stack, checks, errors }, null, 2),
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
