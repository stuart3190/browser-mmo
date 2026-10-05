/* eslint-disable */
// Existing completed four-quest characters. No new progress/reward scaffolding; real party/UI hunt.
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const { walk, enter } = require('./vertical-slice.cjs');
const fs = require('node:fs');
const OUT = process.argv[2] || '/tmp/mmo-stillwater';
fs.mkdirSync(OUT, { recursive: true });
const users = (process.env.STILLWATER_USERS || 'guard_muu9vm2y,spark_muu9vm2y').split(',');
const Q = 'quest.greenvale.stillwater';
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
    const contexts = await Promise.all([
      browser.newContext({ viewport: { width: 1100, height: 740 } }),
      browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true }),
    ]);
    for (const ctx of contexts) {
      ctx.setDefaultTimeout(60000);
      await ctx.addInitScript(() => {
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
                  'entity.spawn',
                  'quest.completed',
                  'party.update',
                ].includes(m.t)
              )
                window.__events.push(m);
            });
          }
        };
      });
    }
    const a = await contexts[0].newPage(),
      b = await contexts[1].newPage();
    const errors = [];
    for (const p of [a, b]) p.on('pageerror', (e) => errors.push(e.message));
    await enter(a, users[0], false);
    await enter(b, users[1], false);
    if (!process.env.STILLWATER_FINISH) {
      for (const p of [a, b]) {
        await p.bringToFront();
        await walk(p, 4, -80);
        await walk(p, 0, -28);
        await walk(p, 0, 6);
        await walk(p, -6, 6, 2.5);
      }
      if (!process.env.STILLWATER_RESUME) {
        await a.locator('[data-open=party]').click();
        await a.getByRole('button', { name: /^Invite / }).click();
        await b.getByRole('button', { name: 'Accept party', exact: true }).tap();
        await a.keyboard.press('Escape');
        for (const p of [a, b]) {
          if (p === b) await p.locator('[data-testid=touch-interact]').tap();
          else await p.keyboard.press('KeyE');
          await p.locator(`[data-quest="${Q}"] [data-testid=quest-accept]`).click();
          await p.getByRole('button', { name: 'Close dialogue', exact: true }).click();
        }
      }
      for (const p of [a, b])
        await p.waitForFunction(
          (q) => window.__mmo.quests.find((x) => x.questId === q)?.state === 'active',
          Q,
        );
      check('Both party members accepted Maren’s prerequisite-gated debrief/expedition', true);
      for (const p of [a, b]) {
        await p.bringToFront();
        await walk(p, 0, 6);
        await walk(p, 0, 0);
        await walk(p, 42, 0);
        await walk(p, 42, 38);
        await walk(p, 63, 38, 2.5);
        if (p === b) await p.locator('[data-testid=touch-interact]').tap();
        else await p.keyboard.press('KeyE');
        await p.getByRole('button', { name: 'Close dialogue', exact: true }).click();
        await p.waitForFunction(
          (q) =>
            window.__mmo.quests
              .find((x) => x.questId === q)
              ?.objectives.find((o) => o.id === 'speak_to_tess')?.done,
          Q,
        );
      }
      check('Both clients personally read Tess’s records', true);
      await a.screenshot({ path: `${OUT}/tess.png` });
      await walk(a, 72, 30, 1);
      await walk(b, 68, 32, 1);
      for (const p of [a, b]) {
        await p.keyboard.press('Tab');
        await p.waitForFunction(
          () =>
            window.__mmo.enemies.find((e) => e.id === window.__mmo.target.id)?.name ===
            'Siltbound Warden',
        );
      }
      const id = await a.evaluate(() => window.__mmo.target.id);
      check(
        'Both clients see the same distinct Warden',
        await b.evaluate((id) => window.__mmo.target.id === id, id),
      );
      for (const p of [a, b]) await p.evaluate((id) => window.__mmo.lookAt(id), id);
      await a.waitForFunction(
        (id) =>
          window.__events.some(
            (m) =>
              m.t === 'entity.spawn' &&
              m.d.entity.id === id &&
              m.d.entity.attackCue?.groundPosition,
          ),
        id,
      );
      const mark = await a.evaluate(
        (id) =>
          window.__events
            .filter(
              (m) =>
                m.t === 'entity.spawn' &&
                m.d.entity.id === id &&
                m.d.entity.attackCue?.groundPosition,
            )
            .at(-1).d.entity.attackCue,
        id,
      );
      check(
        'Frozen ground warning is replicated to both clients',
        await b.evaluate(
          ({ id, mark }) =>
            window.__events.some(
              (m) =>
                m.t === 'entity.spawn' &&
                m.d.entity.id === id &&
                JSON.stringify(m.d.entity.attackCue) === JSON.stringify(mark),
            ),
          { id, mark },
        ),
      );
      await b.screenshot({ path: `${OUT}/touch-mark.png` });
      await walk(a, 74, 26, 1);
      await a.keyboard.press('KeyF');
      for (let i = 0; i < 32; i++) {
        await a.bringToFront();
        await a.keyboard.press('Digit2');
        await b.bringToFront();
        await b.locator('[data-testid="ability-ability.mage.firebolt"]').tap();
        await new Promise((r) => setTimeout(r, 1800));
        if (
          await a.evaluate(
            (q) => window.__mmo.quests.find((x) => x.questId === q)?.state === 'ready_to_turn_in',
            Q,
          )
        )
          break;
      }
      for (const p of [a, b])
        await p.waitForFunction(
          (q) => window.__mmo.quests.find((x) => x.questId === q)?.state === 'ready_to_turn_in',
          Q,
        );
      const rewards = await Promise.all(
        [a, b].map((p) =>
          p.evaluate((id) => window.__events.filter((m) => m.t === 'combat.loot').at(-1)?.d, id),
        ),
      );
      check(
        'Shared Warden kill advances both quests with one loot stack',
        rewards.every(Boolean) &&
          rewards.reduce((n, r) => n + r.items.length + r.mailedItems.length, 0) === 1,
        rewards.map((r) => ({
          gold: r.gold,
          items: r.items.length,
          mailed: r.mailedItems.length,
        })),
      );
      check(
        'Authoritative ground surge damage occurred',
        await a.evaluate(
          (id) => window.__events.some((m) => m.t === 'combat.damage' && m.d.sourceId === id),
          id,
        ),
      );
      await b.screenshot({ path: `${OUT}/touch-victory.png` });
      await enter(b, users[1], false);
      await b.waitForFunction(
        (q) => window.__mmo.quests.find((x) => x.questId === q)?.state === 'ready_to_turn_in',
        Q,
      );
      check('Kill objective survives reconnect', true);
    }

    for (const p of [a, b]) {
      await p.bringToFront();
      await walk(p, 63, 38);
      await walk(p, 42, 38);
      await walk(p, 42, 0);
      await walk(p, 0, 0);
      await walk(p, 0, 6);
      await walk(p, -6, 6, 2.5);
    }
    await b.setViewportSize({ width: 390, height: 844 });
    for (const [i, p] of [a, b].entries()) {
      if (p === b) await p.locator('[data-testid=touch-interact]').tap();
      else await p.keyboard.press('KeyE');
      const turnIn = p.locator(`[data-quest="${Q}"] [data-testid=quest-turn-in]`);
      if (p === b) await turnIn.tap();
      else await turnIn.click();
      await p.waitForFunction(
        (q) => window.__mmo.quests.find((x) => x.questId === q)?.state === 'completed',
        Q,
      );
      const reward = await p.evaluate(
        () => window.__events.find((m) => m.t === 'quest.completed')?.d,
      );
      check(
        'Maren pays 600 XP, 250 copper and one seal-ring',
        reward?.xpGained === 600 &&
          reward.gold === 250 &&
          reward.items.length === 1 &&
          reward.items[0].template.id === 'accessory.ring.stillwater_seal',
      );
      check(
        'No duplicate turn-in action remains',
        (await p.locator(`[data-quest="${Q}"] [data-testid=quest-turn-in]`).count()) === 0,
      );
      await p.screenshot({ path: `${OUT}/reward-${i}.png` });
      await p.getByRole('button', { name: 'Goodbye', exact: true }).click();
      const item = reward.items[0].instance.id;
      await enter(p, users[i], false);
      await p.waitForFunction((id) => window.__mmo.items.some((x) => x.id === id), item);
      check(
        'Same unique reward and completed quest persist',
        await p.evaluate(
          ({ id, q }) =>
            window.__mmo.items.filter((x) => x.templateId === 'accessory.ring.stillwater_seal')
              .length === 1 &&
            window.__mmo.items.some((x) => x.id === id) &&
            window.__mmo.quests.find((x) => x.questId === q)?.state === 'completed',
          { id: item, q: Q },
        ),
      );
      await p.locator('[data-open=inventory]').click();
      await p.getByRole('button', { name: 'Stillwater Seal', exact: true }).click();
      await p.locator('[data-action=equip]').click();
      await p.waitForFunction(
        (id) => window.__mmo.items.find((x) => x.id === id)?.location.kind === 'equipped',
        item,
      );
      check('Real seal-ring can be equipped on desktop/touch', true);
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
