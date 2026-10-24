/* eslint-disable */
// Functional combat playtest. Fresh level-three fixtures in a disposable qualification DB;
// all gameplay actions use keyboard/touch. No live or earned-character data is changed.
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const { Client } = require('../../packages/db/node_modules/pg');
const { enter, walk } = require('./vertical-slice.cjs');
const fs = require('node:fs');
const out = process.argv[2] || '/tmp/bo-tactical';
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
  const username = `tactic_${Date.now().toString(36)}`;
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
    await db.query('update characters set level = 3 where id = $1', [character.id]);
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
  let page;
  try {
    for (const touch of [false, true]) {
      const context = await browser.newContext({
        viewport: touch ? { width: 390, height: 844 } : { width: 1100, height: 740 },
        hasTouch: touch,
        isMobile: touch,
      });
      await context.addInitScript(() => {
        window.__tacticalEvents = [];
        const Original = WebSocket;
        window.WebSocket = class extends Original {
          constructor(...args) {
            super(...args);
            this.addEventListener('message', (e) => {
              try {
                const m = JSON.parse(e.data);
                if (['entity.spawn', 'combat.damage', 'ability.state', 'error'].includes(m.t))
                  window.__tacticalEvents.push(m);
              } catch {}
            });
          }
        };
      });
      page = await context.newPage();
      page.setDefaultTimeout(30000);
      page.on('pageerror', (e) => errors.push(e.message));
      const username = await fixture(touch ? 'class.mage' : 'class.warrior');
      await enter(page, username, false);
      const abilityId = touch ? 'ability.mage.frost_nova' : 'ability.warrior.guard';
      const ability = page.locator(`[data-testid="ability-${abilityId}"]`);
      check(
        `${touch ? 'Mage' : 'Warrior'} tactical ability unlocked at level three`,
        await ability.isEnabled(),
      );
      if (touch) {
        for (const viewport of [
          { width: 390, height: 844 },
          { width: 844, height: 390 },
        ]) {
          await page.setViewportSize(viewport);
          const bounds = await ability.boundingBox();
          check(
            `Nova is visible and tappable at ${viewport.width}×${viewport.height}`,
            bounds &&
              bounds.x >= 0 &&
              bounds.y >= 0 &&
              bounds.x + bounds.width <= viewport.width &&
              bounds.y + bounds.height <= viewport.height &&
              bounds.width >= 44,
          );
          const unobstructed = await page
            .locator('[data-testid=ability-bar] button')
            .evaluateAll((buttons) =>
              buttons.every((button) => {
                const r = button.getBoundingClientRect();
                return button.contains(
                  document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2),
                );
              }),
            );
          check(
            `All touch abilities are unobstructed at ${viewport.width}×${viewport.height}`,
            unobstructed,
          );
          await page.screenshot({ path: `${out}/touch-${viewport.width}.png` });
        }
        await page.setViewportSize({ width: 390, height: 844 });
      }
      // Follow the actual north road from the village to the wolf den.
      await walk(page, 0, 10);
      await walk(page, 0, 48);
      await page.keyboard.press('Tab');
      await page.waitForFunction(() => window.__mmo.target.id);
      const target = await page.evaluate(() => window.__mmo.target.id);
      check('A live enemy can be selected', !!target);
      const position = await page.evaluate((id) => window.__mmo.entityPos(id), target);
      await walk(page, position.x, position.z, touch ? 4.5 : 2);
      // Let the wolf close within the burst radius, then use real controls.
      if (touch) await ability.tap();
      else await page.keyboard.press('Digit4');
      const kind = touch ? 'root' : 'guard';
      await page.waitForFunction(
        (kind) =>
          window.__tacticalEvents.some(
            (m) => m.t === 'entity.spawn' && m.d.entity.statuses?.some((s) => s.kind === kind),
          ),
        kind,
      );
      await page.screenshot({ path: `${out}/${kind}-active.png` });
      check(
        `${kind} status has visible HUD feedback`,
        await page.locator(`[data-testid=status-${kind}]`).isVisible(),
      );
      if (touch) {
        const rooted = await page.evaluate(
          () =>
            window.__tacticalEvents.find(
              (m) => m.t === 'entity.spawn' && m.d.entity.statuses?.some((s) => s.kind === 'root'),
            ).d.entity.id,
        );
        const before = await page.evaluate((id) => window.__mmo.entityPos(id), rooted);
        const stick = await page.locator('[data-testid=joystick]').boundingBox();
        const cdp = await context.newCDPSession(page);
        const me = await page.evaluate(() => window.__mmo.position);
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchStart',
          touchPoints: [
            { x: stick.x + stick.width / 2, y: stick.y + stick.height / 2 + 40, id: 1 },
          ],
        });
        await page.waitForTimeout(700);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        const after = await page.evaluate((id) => window.__mmo.entityPos(id), rooted);
        const moved = await page.evaluate(() => window.__mmo.position);
        check(
          'Root holds the wolf while the touch joystick creates space',
          Math.hypot(before.x - after.x, before.z - after.z) < 0.1 &&
            Math.hypot(me.x - moved.x, me.z - moved.z) > 1,
          { before, after, me, moved },
        );
        check(
          'Nova deals server-confirmed damage',
          await page.evaluate(() =>
            window.__tacticalEvents.some(
              (m) =>
                m.t === 'combat.damage' &&
                m.d.abilityId === 'ability.mage.frost_nova' &&
                m.d.amount > 0,
            ),
          ),
        );
      } else {
        await page.waitForFunction(() =>
          window.__tacticalEvents.some(
            (m) =>
              m.t === 'combat.damage' && m.d.targetId === window.__mmo.myEntityId && m.d.amount > 0,
          ),
        );
        check('Warrior continues taking real combat hits while guarded', true);
        await page.keyboard.press('Digit4');
        await page.waitForFunction(() =>
          window.__tacticalEvents.some((m) => m.t === 'error' && m.d.code === 'ON_COOLDOWN'),
        );
        check('Repeated Guard is refused by the server', true);
      }
      await page.waitForFunction(
        (kind) => !document.querySelector(`[data-testid=status-${kind}]`),
        kind,
      );
      check(
        `${kind} expires and leaves the ability cooling down`,
        (await ability.getAttribute('data-ready')) === 'false',
      );
      if (!touch) await page.keyboard.press('KeyF');
      await page.keyboard.press('Digit2');
      await page.waitForTimeout(1100);
      await page.keyboard.press('Digit3');
      await page.waitForFunction(
        (id) => window.__mmo.enemies.find((e) => e.id === id)?.dead,
        target,
        { timeout: 20000 },
      );
      check(`${touch ? 'Mage' : 'Warrior'} finishes the fight with class attacks`, true);
      // Return to safety using real movement before signing out.
      await walk(page, 0, 38);
      await walk(page, 0, 10);
      await enter(page, username, false);
      check(
        'Reconnect retains the learned tactical slot',
        await page.locator(`[data-testid="ability-${abilityId}"]`).isEnabled(),
      );
      await context.close();
    }
    check('No browser gameplay exceptions', errors.length === 0, errors);
    fs.writeFileSync(
      `${out}/proof.json`,
      JSON.stringify(
        {
          ok: true,
          fixture: 'Fresh level-three characters; normal movement and combat controls',
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
