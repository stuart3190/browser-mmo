/* eslint-disable */
// Genuine prior quest characters. No progress/position writes; actual UI, keyboard and touch.
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const { enter, walk: travel } = require('./vertical-slice.cjs');
const fs = require('node:fs');
const OUT = process.argv[2] || '/tmp/mmo-keeper-outpost';
fs.mkdirSync(OUT, { recursive: true });
const Q = 'quest.greenvale.keeper_outpost',
  E = 'enemy.greenvale.last_door_sentinel',
  ITEM = 'accessory.cloak.oathkeepers_mantle';
const users = (process.env.OUTPOST_USERS || 'guard_muu9vm2y,spark_muu9vm2y').split(',');
const checks = [];
function check(name, ok, detail) {
  checks.push({ name, ok: !!ok, detail });
  console.log(ok ? 'PASS' : 'FAIL', name, detail || '');
  if (!ok) throw Error(name);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function walk(p, ...args) {
  for (let i = 0; i < 3; i++) {
    try {
      return await travel(p, ...args);
    } catch (e) {
      if (!e.message.startsWith('Walk deadline') || i === 2) throw e;
      console.log('Continuing real travel', args);
    }
  }
}
async function state(p) {
  return p.evaluate((q) => window.__mmo.quests.find((x) => x.questId === q)?.state, Q);
}
async function road(p, outbound) {
  const points = outbound
    ? [
        [0, 6],
        [0, 32],
        [0, 55],
        [0, 80],
        [0, 110],
        [8, 110],
        [24, 110],
      ]
    : [
        [24, 110],
        [8, 110],
        [0, 110],
        [0, 85],
        [0, 60],
        [0, 32],
        [0, 6],
        [-6, 6, 2.5],
      ];
  for (const point of points) await walk(p, ...point);
}
(async () => {
  const browser = await chromium.launch({
    executablePath: '/usr/bin/google-chrome',
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
  const errors = [];
  try {
    const contexts = await Promise.all([
      browser.newContext({ viewport: { width: 1100, height: 740 } }),
      browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true }),
    ]);
    for (const c of contexts) {
      c.setDefaultTimeout(60000);
      await c.addInitScript(() => {
        window.__events = [];
        const WS = window.WebSocket;
        window.WebSocket = class extends WS {
          constructor(...a) {
            super(...a);
            this.addEventListener('message', (e) => {
              const m = JSON.parse(e.data);
              if (
                [
                  'combat.loot',
                  'combat.damage',
                  'combat.death',
                  'quest.completed',
                  'entity.spawn',
                  'party.update',
                ].includes(m.t)
              )
                window.__events.push(m);
            });
          }
        };
      });
    }
    const [a, b] = await Promise.all(contexts.map((c) => c.newPage()));
    for (const p of [a, b]) p.on('pageerror', (e) => errors.push(e.message));
    await enter(a, users[0], false);
    await enter(b, users[1], false);
    const action = async (p, loc) => (p === b ? loc.tap() : loc.click());
    if (!process.env.OUTPOST_RESUME) {
      for (const p of [a, b]) {
        await p.bringToFront();
        check(
          'Continuation guides to Maren',
          (await p.locator('[data-testid=quest-guide]').innerText()).includes('Elder Maren'),
        );
        if (p === b) await p.locator('[data-testid=touch-interact]').tap();
        else await p.keyboard.press('KeyE');
        await action(p, p.locator(`[data-quest="${Q}"] [data-testid=quest-accept]`));
        await action(p, p.getByRole('button', { name: 'Close dialogue', exact: true }));
      }
      await a.locator('[data-open=party]').click();
      const invite = a.getByRole('button', { name: /^Invite / });
      if (await invite.count()) {
        await invite.first().click();
        await b.getByRole('button', { name: 'Accept party', exact: true }).tap();
      }
      await a.keyboard.press('Escape');
    }
    if (!process.env.OUTPOST_FINISH) {
      if (!process.env.OUTPOST_RESUME) {
        await road(a, true);
        check(
          'First survey advances navigation to sentinel',
          (await a.locator('[data-testid=quest-guide]').innerText()).includes('Quiet Aster'),
        );
        check(
          'Personal survey not granted to waiting party member',
          await b.evaluate(
            (q) => !window.__mmo.quests.find((x) => x.questId === q).objectives[0].done,
            Q,
          ),
        );
        await road(b, true);
      }
      await a.bringToFront();
      await walk(a, 29, 113, 1);
      await b.bringToFront();
      await walk(b, 25, 112, 1);
      for (const p of [a, b]) {
        await p.keyboard.press('Tab');
        await p.waitForFunction(
          (e) => window.__mmo.enemies.find((x) => x.id === window.__mmo.target.id)?.refId === e,
          E,
        );
      }
      const id = await a.evaluate(() => window.__mmo.target.id);
      check(
        'Both clients see the same sentinel',
        await b.evaluate((id) => window.__mmo.target.id === id, id),
      );
      for (const p of [a, b]) await p.evaluate((id) => window.__mmo.lookAt(id), id);
      await a.waitForFunction(
        (id) =>
          window.__events.some(
            (m) => m.t === 'entity.spawn' && m.d.entity.id === id && m.d.entity.attackCue?.cleave,
          ),
        id,
      );
      const cue = await a.evaluate(
        (id) =>
          window.__events
            .filter(
              (m) => m.t === 'entity.spawn' && m.d.entity.id === id && m.d.entity.attackCue?.cleave,
            )
            .at(-1).d.entity.attackCue,
        id,
      );
      check(
        'Frozen amber sector replicated to both clients',
        await b.evaluate(
          ({ id, cue }) =>
            window.__events.some(
              (m) =>
                m.t === 'entity.spawn' &&
                m.d.entity.id === id &&
                JSON.stringify(m.d.entity.attackCue) === JSON.stringify(cue),
            ),
          { id, cue },
        ),
      );
      await a.screenshot({ path: `${OUT}/outpost-desktop.png` });
      await b.screenshot({ path: `${OUT}/outpost-touch-sweep.png` });
      await walk(a, 32, 118, 1);
      await a.keyboard.press('KeyF');
      for (let i = 0; i < 48; i++) {
        await a.bringToFront();
        await a.keyboard.press('Digit2');
        await b.bringToFront();
        await b.locator('[data-testid="ability-ability.mage.firebolt"]').tap();
        await sleep(1400);
        if ((await state(a)) === 'ready_to_turn_in') break;
      }
      for (const p of [a, b])
        await p.waitForFunction(
          (q) => window.__mmo.quests.find((x) => x.questId === q)?.state === 'ready_to_turn_in',
          Q,
        );
      const rewards = await Promise.all(
        [a, b].map((p) =>
          p.evaluate(() => window.__events.filter((m) => m.t === 'combat.loot').at(-1)?.d),
        ),
      );
      check(
        'Shared kill credits both quests with one four-ore loot stack',
        rewards.every(Boolean) &&
          rewards.reduce((n, r) => n + r.items.length + r.mailedItems.length, 0) === 1,
        rewards,
      );
      check(
        'Guidance returns both companions to Maren',
        (await a.locator('[data-testid=quest-guide]').innerText()).includes('Elder Maren'),
      );
      await enter(b, users[1], false);
      check('Kill/survey survive reconnect', (await state(b)) === 'ready_to_turn_in');
    }
    for (const p of [a, b]) {
      await p.bringToFront();
      await road(p, false);
    }
    await b.setViewportSize({ width: 390, height: 844 });
    for (const [i, p] of [a, b].entries()) {
      await p.bringToFront();
      if (p === b) await p.locator('[data-testid=touch-interact]').tap();
      else await p.keyboard.press('KeyE');
      await action(p, p.locator(`[data-quest="${Q}"] [data-testid=quest-turn-in]`));
      await p.waitForFunction(
        (q) => window.__mmo.quests.find((x) => x.questId === q)?.state === 'completed',
        Q,
      );
      const reward = await p.evaluate(
        (q) =>
          window.__events.filter((m) => m.t === 'quest.completed' && m.d.questId === q).at(-1)?.d,
        Q,
      );
      check(
        '700 XP, 300 copper and one useful mantle',
        reward?.xpGained === 700 &&
          reward.gold === 300 &&
          reward.items.length === 1 &&
          reward.items[0].template.id === ITEM,
        reward,
      );
      await p.screenshot({ path: `${OUT}/reward-${i}.png` });
      await action(p, p.getByRole('button', { name: 'Goodbye', exact: true }));
      const item = reward.items[0].instance.id;
      await enter(p, users[i], false);
      check(
        'Completed quest and unique reward persist',
        await p.evaluate(
          ({ q, item, template }) =>
            window.__mmo.quests.find((x) => x.questId === q)?.state === 'completed' &&
            window.__mmo.items.filter((x) => x.templateId === template).length === 1 &&
            window.__mmo.items.some((x) => x.id === item),
          { q: Q, item, template: ITEM },
        ),
      );
      await action(p, p.locator('[data-open=inventory]'));
      await p.getByLabel('Search inventory').fill('oath');
      await p.getByLabel('Filter rarity').selectOption('rare');
      await p.getByLabel('Sort inventory').selectOption('rarity');
      const grid = p.locator('[data-container=backpack]');
      check(
        'Inventory search/filter/order finds the real reward',
        (await grid.locator('button[data-item-id]').count()) === 1,
      );
      await action(p, grid.getByRole('button', { name: 'Oathkeeper’s Mantle', exact: true }));
      await action(p, p.locator('[data-action=equip]'));
      await p.waitForFunction(
        (id) => window.__mmo.items.find((x) => x.id === id)?.location.kind === 'equipped',
        item,
      );
      check('Sorted/filtered selection equips the same authoritative ID', true);
      await action(p, p.locator('[data-action=close]'));
      await action(p, p.getByRole('button', { name: 'Reset view', exact: true }));
      await p.screenshot({ path: `${OUT}/inventory-${i}.png` });
    }
    check('No browser exceptions', errors.length === 0, errors);
  } finally {
    await browser.close();
    fs.writeFileSync(`${OUT}/checks.json`, JSON.stringify(checks, null, 2));
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
