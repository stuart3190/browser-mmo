/* eslint-disable */
// Functional combat playtest. Fresh level-three fixtures in a disposable qualification DB;
// all gameplay actions use keyboard/touch. No live or earned-character data is changed.
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const { Client } = require('../../packages/db/node_modules/pg');
const { enter, walk } = require('./vertical-slice.cjs');
const fs = require('node:fs');
const out = process.argv[2] || '/tmp/bo-specialisations';
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
  const username = `paths_${Date.now().toString(36)}`;
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
    await db.query('update characters set level = 5 where id = $1', [character.id]);
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
      const label = touch ? 'Mage' : 'Warrior',
        initial = touch ? 'spec.mage.frost' : 'spec.warrior.guardian',
        next = touch ? 'spec.mage.fire' : 'spec.warrior.berserker';
      const utility = touch ? 'ability.mage.frost_nova' : 'ability.warrior.guard',
        strike = touch ? 'ability.mage.flame_burst' : 'ability.warrior.heavy_strike';
      const context = await browser.newContext({
        viewport: touch ? { width: 390, height: 844 } : { width: 1100, height: 740 },
        hasTouch: touch,
        isMobile: touch,
      });
      await context.addInitScript(() => {
        window.__pathEvents = [];
        const WS = WebSocket;
        window.WebSocket = class extends WS {
          constructor(...a) {
            super(...a);
            this.addEventListener('message', (e) => {
              try {
                const m = JSON.parse(e.data);
                if (['ability.state', 'entity.spawn', 'combat.damage', 'error'].includes(m.t))
                  window.__pathEvents.push(m);
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
      const click = (l) => (touch ? l.tap() : l.click());
      const close = async () => {
        if (await page.getByRole('button', { name: 'Close dialogue', exact: true }).isVisible())
          await click(page.getByRole('button', { name: 'Close dialogue', exact: true }));
        await page.keyboard.press('Escape');
      };
      const talk = async () => {
        await walk(page, -6, 6, 2);
        if (touch) await page.locator('[data-testid=touch-interact]').tap();
        else await page.keyboard.press('KeyE');
        await page.waitForFunction(
          () => window.__mmo.dialogue?.npcId === 'npc.greenvale.elder_maren',
        );
        const box = page.locator('[data-testid=specialisation-choices]');
        if ((await box.getAttribute('open')) === null) await click(box.locator('summary'));
      };
      const train = async (id) => {
        const b = page.locator(`[data-specialisation="${id}"]`);
        await b.scrollIntoViewIfNeeded();
        const bounds = await b.boundingBox();
        check(`${label} mentor choice is tappable`, bounds && bounds.height >= 40);
        await click(b);
        await page.waitForFunction(
          (id) =>
            window.__pathEvents.filter((m) => m.t === 'ability.state').at(-1)?.d
              .specialisationId === id,
          id,
        );
        await page.waitForFunction(
          (id) => document.querySelector(`[data-specialisation="${id}"]`)?.disabled,
          id,
        );
      };
      await talk();
      await train(initial);
      await page.screenshot({ path: `${out}/${label}-mentor.png` });
      await close();
      await click(page.locator(`[data-testid="ability-${utility}"]`));
      await page.waitForFunction(
        (id) =>
          window.__pathEvents
            .filter((m) => m.t === 'ability.state')
            .at(-1)
            ?.d.abilities.find((a) => a.abilityId === id)?.readyAt > 0,
        utility,
      );
      const first = await page.evaluate((id) => {
        const m = window.__pathEvents.filter((m) => m.t === 'ability.state').at(-1).d;
        return { ready: m.abilities.find((a) => a.abilityId === id).readyAt, time: m.serverTime };
      }, utility);
      check(
        `${label} tactical path has server-owned timing`,
        first.ready - first.time === (touch ? 12000 : 20000),
        first,
      );
      if (!touch)
        check(
          'Guardian replicates seventy-percent guard',
          await page.evaluate(() =>
            window.__pathEvents.some(
              (m) =>
                m.t === 'entity.spawn' &&
                m.d.entity.statuses?.some((s) => s.kind === 'guard' && s.magnitude === 0.7),
            ),
          ),
        );
      await talk();
      await train(next);
      const retained = await page.evaluate(
        (id) =>
          window.__pathEvents
            .filter((m) => m.t === 'ability.state')
            .at(-1)
            .d.abilities.find((a) => a.abilityId === id).readyAt,
        utility,
      );
      check(`${label} retraining preserves the running cooldown`, retained === first.ready, {
        first,
        retained,
      });
      await close();
      await walk(page, 0, 10);
      await walk(page, 0, 48);
      await page.keyboard.press('Tab');
      await page.waitForFunction(() => window.__mmo.target.id);
      const target = await page.evaluate(() => window.__mmo.target.id);
      const pos = await page.evaluate((id) => window.__mmo.entityPos(id), target);
      await walk(page, pos.x, pos.z, touch ? 15 : 2);
      await click(page.locator(`[data-testid="ability-${strike}"]`));
      await page.waitForFunction(
        (id) => window.__pathEvents.some((m) => m.t === 'combat.damage' && m.d.abilityId === id),
        strike,
      );
      const timing = await page.evaluate((id) => {
        const m = window.__pathEvents.filter((m) => m.t === 'ability.state').at(-1).d;
        return m.abilities.find((a) => a.abilityId === id).readyAt - m.serverTime;
      }, strike);
      check(
        `${label} offensive path changes its actual attack cooldown`,
        timing === (touch ? 7000 : 4000),
        timing,
      );
      if (!touch) await page.keyboard.press('KeyF');
      for (let i = 0; i < 35; i++) {
        if (
          await page.evaluate((id) => window.__mmo.enemies.find((e) => e.id === id)?.dead, target)
        )
          break;
        for (const id of [
          touch ? 'ability.mage.firebolt' : 'ability.warrior.battle_strike',
          strike,
        ]) {
          const b = page.locator(`[data-testid="ability-${id}"]`);
          if ((await b.getAttribute('data-ready')) === 'true') await click(b);
        }
        await page.waitForTimeout(300);
      }
      check(
        `${label} wins a real fight with its chosen path`,
        await page.evaluate((id) => window.__mmo.enemies.find((e) => e.id === id)?.dead, target),
      );
      await walk(page, 0, 38);
      await walk(page, 0, 10);
      await enter(page, username, false);
      await page.waitForFunction(
        (id) =>
          window.__pathEvents.filter((m) => m.t === 'ability.state').at(-1)?.d.specialisationId ===
          id,
        next,
      );
      await click(page.locator('[data-open=character]'));
      check(
        `${label} retains its chosen path after login`,
        (await page.locator('[data-testid=character-specialisation]').textContent()).includes(
          touch ? 'Fire' : 'Berserker',
        ),
      );
      await page.screenshot({ path: `${out}/${label}-relogin.png` });
      await context.close();
    }
    check('No specialisation gameplay exceptions', errors.length === 0, errors);
    fs.writeFileSync(
      `${out}/proof.json`,
      JSON.stringify(
        {
          ok: true,
          fixture:
            'Fresh level-five fixtures; mentor choices, retraining, attacks, victories and relogin through actual UI. No earned level-one-to-five claim.',
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
    await page?.screenshot({ path: `${out}/failure.png` }).catch(() => {});
    throw e;
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
