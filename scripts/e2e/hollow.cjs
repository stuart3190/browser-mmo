/* eslint-disable */
// Two-client Hollow playthrough. Prerequisites prepared separately; all new progression uses UI.
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const { walk, enter } = require('./vertical-slice.cjs');
const fs = require('node:fs');
const OUT = process.argv[2] || '/tmp/mmo-hollow';
fs.mkdirSync(OUT, { recursive: true });
const users = (process.env.HOLLOW_USERS || 'guard_muu9vm2y,spark_muu9vm2y').split(',');
const Q = 'quest.greenvale.hollow_trail';
const checks = [];
function check(name, ok, detail) {
  checks.push({ name, ok: !!ok, detail });
  console.log(ok ? 'PASS' : 'FAIL', name, detail || '');
  if (!ok) throw Error(name);
}
(async () => {
  const browser = await chromium.launch({
    executablePath: '/usr/bin/google-chrome',
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
  try {
    const context = await browser.newContext({
      viewport: { width: 1100, height: 740 },
      hasTouch: true,
    });
    await context.addInitScript(() => {
      window.__events = [];
      const WS = window.WebSocket;
      window.WebSocket = class extends WS {
        constructor(...a) {
          super(...a);
          this.addEventListener('message', (e) => {
            try {
              const m = JSON.parse(e.data);
              if (
                [
                  'combat.loot',
                  'combat.death',
                  'entity.spawn',
                  'quest.completed',
                  'party.update',
                ].includes(m.t)
              )
                window.__events.push(m);
            } catch {}
          });
        }
      };
    });
    const a = await context.newPage(),
      b = await context.newPage();
    const errors = [];
    for (const p of [a, b]) p.on('pageerror', (e) => errors.push(e.message));
    context.setDefaultTimeout(60000);
    await enter(a, users[0], false);
    await enter(b, users[1], false);
    if (process.env.HOLLOW_RESUME) {
      await a.waitForFunction(() => window.__events.some((m) => m.t === 'party.update'));
      if (
        await a.evaluate(
          () => window.__events.filter((m) => m.t === 'party.update').at(-1).d.members.length < 2,
        )
      ) {
        await a.locator('[data-open=party]').click();
        await a.getByRole('button', { name: /^Invite / }).click();
        await b.getByRole('button', { name: 'Accept party', exact: true }).click();
        await a.keyboard.press('Escape');
      }
    }
    if (!process.env.HOLLOW_RESUME) {
      await a.locator('[data-open=party]').click();
      await a.getByRole('button', { name: /^Invite / }).click();
      await b.getByRole('button', { name: 'Accept party', exact: true }).click();
      await a.keyboard.press('Escape');
      for (const p of [a, b]) {
        await walk(p, 0, 4);
        await walk(p, 0, -28);
        await walk(p, 4, -80);
        await walk(p, -8, -90, 2.5);
        await p.keyboard.press('KeyE');
        await p.locator('[data-testid=quest-accept]').click();
        await p.locator('[data-testid=dialogue-close]').click();
      }
    }
    for (const p of [a, b])
      await p.waitForFunction(
        (q) => window.__mmo.quests.find((x) => x.questId === q)?.state === 'active',
        Q,
      );
    check('Both party members accept the Hollow follow-on at Rill', true);
    for (const p of [a, b]) {
      await walk(p, -25, -88);
      await walk(p, -40, -90);
    }
    await a.screenshot({ path: `${OUT}/trail.png` });
    await a.keyboard.press('Tab');
    await b.keyboard.press('Tab');
    for (const p of [a, b]) await p.waitForFunction(() => window.__mmo.target.id);
    const id = await a.evaluate(() => window.__mmo.target.id);
    check(
      'Both clients target the same named packleader',
      await b.evaluate((id) => window.__mmo.target.id === id, id),
      await a.locator('[data-testid=target-frame]').innerText(),
    );
    const pos = await a.evaluate((id) => window.__mmo.entityPos(id), id);
    await walk(a, pos.x, pos.z, 2.6);
    await a.keyboard.press('KeyF');
    await a.keyboard.press('Digit2');
    await a.waitForFunction(() =>
      window.__events.some((m) => m.t === 'entity.spawn' && m.d.entity.attackCue),
    );
    await a.screenshot({ path: `${OUT}/encounter.png` });
    check(
      'Authoritative wind-up replicated to both clients',
      await b.evaluate(() =>
        window.__events.some((m) => m.t === 'entity.spawn' && m.d.entity.attackCue),
      ),
    );
    for (let n = 0; n < 25; n++) {
      await a.keyboard.press('Digit2');
      await b.keyboard.press('Digit2');
      await new Promise((r) => setTimeout(r, 2200));
      if (await a.evaluate(() => window.__events.some((m) => m.t === 'combat.loot'))) break;
    }
    for (const p of [a, b])
      await p.waitForFunction(
        (q) => window.__mmo.quests.find((x) => x.questId === q)?.state === 'ready_to_turn_in',
        Q,
        { timeout: 60000 },
      );
    const rewards = await Promise.all(
      [a, b].map((p) =>
        p.evaluate(() => window.__events.filter((m) => m.t === 'combat.loot').at(-1)?.d),
      ),
    );
    check(
      'One shared death advances both quests and rolls only one item',
      rewards.every(Boolean) &&
        rewards.reduce((n, r) => n + r.items.length + r.mailedItems.length, 0) === 1,
      rewards.map((r) => ({
        gold: r.gold,
        items: r.items.length,
        mailed: r.mailedItems.length,
      })),
    );
    await enter(b, users[1], false);
    await b.waitForFunction(
      (q) => window.__mmo.quests.find((x) => x.questId === q)?.state === 'ready_to_turn_in',
      Q,
    );
    check('Kill objective persists on reconnect', true);
    for (const p of [a, b]) {
      await walk(p, -40, -90);
      await walk(p, -25, -88);
      await walk(p, -8, -90, 2.5);
    }
    await b.setViewportSize({ width: 390, height: 844 });
    for (const p of [a, b]) {
      if (p === b) await p.locator('[data-testid=touch-interact]').tap();
      else await p.keyboard.press('KeyE');
      await p.locator('[data-testid=quest-turn-in]').tap();
      await p.waitForFunction(
        (q) => window.__mmo.quests.find((x) => x.questId === q)?.state === 'completed',
        Q,
      );
      check(
        'Rill pays one usable ward-token',
        await p.evaluate(
          () =>
            window.__mmo.items.filter((i) => i.templateId === 'accessory.trinket.keepers_token')
              .length === 1,
        ),
      );
    }
    await b.screenshot({ path: `${OUT}/phone-return.png` });
    check('No browser exceptions', errors.length === 0, errors);
  } finally {
    await browser.close();
    fs.writeFileSync(`${OUT}/checks.json`, JSON.stringify(checks, null, 2));
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
