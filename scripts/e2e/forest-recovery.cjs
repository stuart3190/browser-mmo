/* eslint-disable */
// Functional appearance/layout playtest. Fresh level-five fixtures in a disposable qualification DB;
// all gameplay actions use keyboard/touch. No live or earned-character data is changed.
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const { Client } = require('../../packages/db/node_modules/pg');
const { enter, walk } = require('./vertical-slice.cjs');
const fs = require('node:fs');
const out = process.argv[2] || '/tmp/bo-forest-recovery';
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
  const username = `recover_${Date.now().toString(36)}`;
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
      [character.id, 'zone.aurelian.elderwood', 384, 3868],
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
    window.__firstRespawnLabel = null;
    document.addEventListener('DOMContentLoaded', () => {
      const observer = new MutationObserver(() => {
        const button = document.querySelector('[data-testid=respawn]');
        if (button && !window.__firstRespawnLabel) window.__firstRespawnLabel = button.textContent;
      });
      observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    });
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
    const original = await page.evaluate(() => ({
      xp: window.__mmo.progress.xp,
      items: window.__mmo.items.map((i) => i.id).sort(),
    }));
    await page.waitForFunction(() =>
      window.__mmo.enemies.some(
        (e) => e.refId === 'enemy.elderwood.rootbound_cantor' && e.attackCue,
      ),
    );
    const id = await page.evaluate(
      () => window.__mmo.enemies.find((e) => e.refId === 'enemy.elderwood.rootbound_cantor').id,
    );
    for (let i = 0; i < 12; i++) {
      if (await page.evaluate((id) => window.__mmo.target.id === id, id)) break;
      await page.keyboard.press('Tab');
    }
    await page.waitForFunction(() => window.__mmo.vitals.dead, null, { timeout: 90000 });
    check('Actual Cantor attacks defeat the stationary test character', true);
    check(
      'First death countdown uses the current clock',
      await page.evaluate(() => {
        const label = window.__firstRespawnLabel;
        const seconds = Number(label?.match(/(\d+)s/)?.[1] ?? 0);
        return !!label && seconds <= 4;
      }),
    );
    check(
      'Death screen names nearby Pinewatch Landing',
      (await page.locator('[data-testid=respawn-at]').innerText()).includes('Pinewatch Landing'),
    );
    await page.screenshot({ path: `${out}/forest-death.png` });
    const respawn = page.locator('[data-testid=respawn]');
    await page.waitForFunction(() => !document.querySelector('[data-testid=respawn]')?.disabled);
    await respawn.click();
    await page.waitForFunction(() => !window.__mmo.vitals.dead);
    check(
      'Respawn returns beside Tamsin at full health',
      await page.evaluate(() => {
        const p = window.__mmo.position,
          v = window.__mmo.vitals;
        return Math.hypot(p.x - 270, p.z - 3988) < 3 && v.health === v.maxHealth;
      }),
    );
    await page.waitForFunction(() => window.__mmo.target.id === null);
    check(
      'Revival clears the old enemy target and death feedback',
      (await page.locator('[data-testid=target-frame]').count()) === 0,
    );
    check(
      'Death preserves XP and item identities',
      await page.evaluate(
        (before) =>
          window.__mmo.progress.xp === before.xp &&
          JSON.stringify(window.__mmo.items.map((i) => i.id).sort()) ===
            JSON.stringify(before.items),
        original,
      ),
    );
    await page.keyboard.press('KeyE');
    await page.waitForFunction(() => window.__mmo.dialogue?.npcId === 'npc.elderwood.tamsin');
    check(
      'The landing provides immediate repair and remedy access',
      (await page.locator('[data-testid=repair-service]').isVisible()) &&
        (await page.locator('[data-service="service.elderwood.buy_remedy"]').count()) === 1,
    );
    await page.screenshot({ path: `${out}/forest-safe-return.png` });
    await enter(page, username, false);
    check(
      'Safe respawn survives relogin',
      await page.evaluate(
        () => Math.hypot(window.__mmo.position.x - 270, window.__mmo.position.z - 3988) < 3,
      ),
    );
    check('No forest recovery exceptions', errors.length === 0, errors);
    fs.writeFileSync(
      `${out}/proof.json`,
      JSON.stringify(
        {
          ok: true,
          fixture:
            'Fresh level-five death/recovery fixture starts near the Cantor with no gear or health grants. Actual enemy damage/death/respawn/UI/relogin; no earned-player mutation.',
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
