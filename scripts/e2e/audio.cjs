/* eslint-disable */
// Functional combat playtest. Fresh level-three fixtures in a disposable qualification DB;
// all gameplay actions use keyboard/touch. No live or earned-character data is changed.
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const { Client } = require('../../packages/db/node_modules/pg');
const { enter, walk } = require('./vertical-slice.cjs');
const fs = require('node:fs');
const out = process.argv[2] || '/tmp/bo-audio';
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
  const username = `audio_${Date.now().toString(36)}`;
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
      const label = touch ? 'Mage' : 'Warrior';
      const context = await browser.newContext({
        viewport: touch ? { width: 390, height: 844 } : { width: 1100, height: 740 },
        hasTouch: touch,
        isMobile: touch,
      });
      await context.addInitScript(() => {
        window.__soundAudit = { starts: 0, peak: 0 };
        const Original = window.AudioContext;
        window.AudioContext = class extends Original {
          constructor(...args) {
            super(...args);
            const ctx = this,
              originalGain = ctx.createGain.bind(ctx),
              originalOsc = ctx.createOscillator.bind(ctx);
            ctx.createOscillator = () => {
              const osc = originalOsc(),
                start = osc.start.bind(osc);
              osc.start = (...args) => {
                window.__soundAudit.starts++;
                return start(...args);
              };
              return osc;
            };
            ctx.createGain = () => {
              const gain = originalGain(),
                connect = gain.connect.bind(gain);
              gain.connect = (target, ...args) => {
                if (target === ctx.destination) {
                  const meter = ctx.createAnalyser(),
                    samples = new Float32Array(256);
                  meter.fftSize = 256;
                  connect(meter);
                  meter.connect(target);
                  setInterval(() => {
                    meter.getFloatTimeDomainData(samples);
                    window.__soundAudit.peak = Math.max(
                      window.__soundAudit.peak,
                      ...samples.map(Math.abs),
                    );
                  }, 16);
                  return target;
                }
                return connect(target, ...args);
              };
              return gain;
            };
          }
        };
      });
      page = await context.newPage();
      page.setDefaultTimeout(30000);
      page.on('pageerror', (e) => errors.push(e.message));
      const username = await fixture(touch ? 'class.mage' : 'class.warrior');
      await enter(page, username, false);
      const click = (locator) => (touch ? locator.tap() : locator.click());
      const settings = () =>
        touch ? page.locator('[data-open=settings]').tap() : page.keyboard.press('KeyK');
      await settings();
      const toggle = page.locator('[data-testid=sound-toggle]');
      await toggle.waitFor();
      const volume = page.getByRole('slider', { name: 'Sound effects volume' });
      await volume.focus();
      await page.keyboard.press('Home');
      for (let i = 0; i < 20; i++) await page.keyboard.press('ArrowRight');
      check(`${label} volume control accepts keyboard input`, (await volume.inputValue()) === '20');
      await click(page.getByRole('button', { name: 'Test sound', exact: true }));
      await page.waitForFunction(() => window.__soundAudit.peak > 0.001);
      check(
        `${label} user gesture produces a real Web Audio signal`,
        true,
        await page.evaluate(() => window.__soundAudit),
      );
      await page.screenshot({ path: `${out}/${label}-settings.png` });
      if (touch) {
        for (const viewport of [
          { width: 390, height: 844 },
          { width: 844, height: 480 },
        ]) {
          await page.setViewportSize(viewport);
          const usable = await toggle.evaluate((button) => {
            const r = button.getBoundingClientRect();
            return (
              r.width >= 44 &&
              r.height >= 44 &&
              r.x >= 0 &&
              r.right <= innerWidth &&
              button.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2))
            );
          });
          check(`Sound controls are reachable at ${viewport.width}×${viewport.height}`, usable);
          await page.screenshot({ path: `${out}/settings-${viewport.width}.png` });
        }
        await page.setViewportSize({ width: 390, height: 844 });
      }
      if (process.env.AUDIO_SETTINGS_ONLY === '1') {
        await context.close();
        continue;
      }
      await page.keyboard.press('Escape');
      await walk(page, 0, 10);
      await walk(page, 0, 48);
      await page.keyboard.press('Tab');
      await page.waitForFunction(() => window.__mmo.target.id);
      const target = await page.evaluate(() => window.__mmo.target.id);
      const pos = await page.evaluate((id) => window.__mmo.entityPos(id), target);
      await walk(page, pos.x, pos.z, touch ? 4.5 : 2);
      const before = await page.evaluate(() => {
        const start = window.__soundAudit.starts;
        window.__soundAudit.peak = 0;
        return start;
      });
      if (!touch) await page.keyboard.press('KeyF');
      const utilityId = touch ? 'ability.mage.frost_nova' : 'ability.warrior.guard';
      const until = Date.now() + 60000;
      while (Date.now() < until) {
        const enemy = await page.evaluate(
          (id) => window.__mmo.enemies.find((e) => e.id === id),
          target,
        );
        if (enemy?.dead) break;
        if (await page.evaluate(() => window.__mmo.vitals.dead)) throw Error('Actor died');
        for (const id of [
          utilityId,
          touch ? 'ability.mage.firebolt' : 'ability.warrior.heavy_strike',
          touch ? 'ability.mage.flame_burst' : 'ability.warrior.battle_strike',
        ]) {
          const button = page.locator(`[data-testid="ability-${id}"]`);
          if ((await button.getAttribute('data-ready')) === 'true') await click(button);
        }
        await page.waitForTimeout(180);
      }
      check(
        `${label} wins a real fight with audible server-confirmed feedback`,
        await page.evaluate(
          ({ target, before }) =>
            window.__mmo.enemies.find((e) => e.id === target)?.dead &&
            window.__soundAudit.starts > before &&
            window.__soundAudit.peak > 0.001,
          { target, before },
        ),
      );
      await page.keyboard.press('Escape');
      await walk(page, 0, 30);
      await settings();
      await click(toggle);
      check(`${label} can mute effects`, (await toggle.getAttribute('aria-pressed')) === 'true');
      await enter(page, username, false);
      await settings();
      check(
        `${label} volume and mute persist after relogin`,
        (await toggle.getAttribute('aria-pressed')) === 'true' &&
          (await volume.inputValue()) === '20',
      );
      await page.keyboard.press('Escape');
      const ability = page.locator(`[data-testid="ability-${utilityId}"]`);
      await page.waitForFunction(
        (id) =>
          document.querySelector(`[data-testid="ability-${id}"]`)?.getAttribute('data-ready') ===
          'true',
        utilityId,
      );
      const mutedBefore = await page.evaluate(() => window.__soundAudit.starts);
      await click(ability);
      await page.waitForFunction(
        (id) =>
          document.querySelector(`[data-testid="ability-${id}"]`)?.getAttribute('data-ready') ===
          'false',
        utilityId,
      );
      await page.waitForTimeout(250);
      check(
        `${label} muted successful ability creates no audio voices`,
        await page.evaluate((n) => window.__soundAudit.starts === n, mutedBefore),
      );
      await context.close();
    }
    check('No audio or settings exceptions', errors.length === 0, errors);
    fs.writeFileSync(
      `${out}/proof.json`,
      JSON.stringify(
        {
          ok: true,
          fixture:
            'Fresh level-three actors; ordinary walking/combat/settings controls. Native AudioContext signal observed with an analyser; no injected game state or simulated audio implementation. No physical speaker listening claim.',
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
