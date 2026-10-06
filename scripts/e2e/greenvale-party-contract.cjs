/* eslint-disable */
// Actual NPC, combat and touch inputs; no progression grants, teleports or admin controls.
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const { enter, walk } = require('./vertical-slice.cjs');
const fs = require('node:fs');
const OUT = process.argv[2] || '/tmp/greenvale-party-contract';
const FINISH_ONLY = process.env.GREENVALE_PARTY_FINISH_ONLY === '1';
fs.mkdirSync(OUT, { recursive: true });
const users =
  process.env.GREENVALE_PARTY_USERS?.split(',') ||
  JSON.parse(fs.readFileSync('/tmp/mmo-marches-gathering/users.json'));
const checks = [];
function check(name, ok, detail) {
  checks.push({ name, ok: !!ok, detail });
  console.log(ok ? 'PASS' : 'FAIL', name, detail || '');
  if (!ok) throw Error(name);
}
(async () => {
  const { getGameData, CollisionWorld, chunkColliders } =
    await import('../../packages/game-data/src/index.ts');
  const { NavGrid } = await import('../../services/world/src/navigation.ts');
  const gd = getGameData(),
    zone = 'zone.aurelian.greenvale_marches',
    col = new CollisionWorld(gd.chunksForZone(zone).flatMap(chunkColliders));
  const browser = await chromium.launch({
    executablePath: '/usr/bin/google-chrome',
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
  const contexts = await Promise.all(
    [false, true].map((t) =>
      browser.newContext({
        viewport: { width: 640, height: 480 },
        deviceScaleFactor: Number(process.env.GREENVALE_DPR ?? 1),
        hasTouch: t,
        isMobile: t,
      }),
    ),
  );
  for (const c of contexts)
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
                'auth.ok',
                'combat.loot',
                'character.progress',
                'party.update',
                'quest.completed',
              ].includes(m.t)
            )
              window.__events.push(m);
          });
        }
      };
    });
  const pages = await Promise.all(contexts.map((c) => c.newPage())),
    errors = [];
  pages.forEach((p) => {
    p.on('pageerror', (e) => errors.push(e.message));
    p.on('requestfailed', (r) =>
      console.log('REQUEST FAILED', r.url().split('?')[0], r.failure()?.errorText),
    );
  });
  const click = (p, l) => (p === pages[1] ? l.tap() : l.click());
  async function go(p, x, z, range = 1.8) {
    await p.bringToFront();
    let clearance = 2;
    for (let n = 0; n < 80; n++) {
      const s = await p.evaluate(() => window.__mmo.position),
        d = Math.hypot(x - s.x, z - s.z);
      if (d <= range) return;
      const step = Math.min(d, 70),
        to = { x: s.x + ((x - s.x) * step) / d, z: s.z + ((z - s.z) * step) / d };
      const nav = new NavGrid(
        col,
        {
          minX: Math.min(s.x, to.x) - 20,
          minZ: Math.min(s.z, to.z) - 20,
          maxX: Math.max(s.x, to.x) + 20,
          maxZ: Math.max(s.z, to.z) + 20,
        },
        d > 20 ? clearance : 0.8,
      );
      const path = nav.findPath(s, to);
      if (!path) throw Error('No route');
      for (const pt of path) {
        const here = await p.evaluate(() => window.__mmo.position);
        try {
          await walk(
            p,
            pt.x,
            pt.z,
            Math.min(range, 1.3),
            Math.max(10000, Math.hypot(pt.x - here.x, pt.z - here.z) * 600),
          );
        } catch (e) {
          if (!e.message.startsWith('Walk deadline')) throw e;
          clearance = Math.min(5, clearance + 1);
          break;
        }
      }
    }
    throw Error('Route iterations');
  }
  const Q = 'quest.greenvale.marches_patrol';
  async function npc(p, id) {
    const s = gd
      .chunksForZone(zone)
      .flatMap((c) => c.spawnPoints)
      .find((s) => s.refId === id);
    await go(p, s.position.x, s.position.z, 3);
    if (p === pages[1]) await p.locator('[data-testid=touch-interact]').tap();
    else await p.keyboard.press('KeyE');
    await p.locator('[data-testid=dialogue]').waitFor();
  }
  async function close(p) {
    await click(p, p.getByRole('button', { name: 'Close dialogue', exact: true }));
  }
  try {
    for (let i = 0; i < 2; i++) {
      const p = pages[i];
      await enter(p, users[i], false);
      if (await p.locator('[data-testid=respawn]').isVisible()) {
        await click(p, p.locator('[data-testid=respawn]'));
        await p.waitForFunction(() => !window.__mmo.vitals.dead, null, { timeout: 120000 });
        check('Normal respawn preserves earned contract', true);
      }
      check(
        'Existing earned Marches character',
        (await p.evaluate(
          () => window.__events.filter((m) => m.t === 'auth.ok').at(-1)?.d.zoneId,
        )) == zone,
      );
      await npc(p, 'npc.world.greenvale_marches.guard');
      if (
        !FINISH_ONLY &&
        (await p.locator(`[data-quest="${Q}"] [data-testid=quest-accept]`).count())
      )
        await click(p, p.locator(`[data-quest="${Q}"] [data-testid=quest-accept]`));
      await close(p);
      const armed = await p.evaluate(() =>
        window.__mmo.items.some(
          (i) => i.templateId === 'weapon.sword.iron_longsword' && i.location.kind === 'equipped',
        ),
      );
      if (armed) continue;
      await npc(p, 'npc.world.greenvale_marches.merchant');
      await click(p, p.locator('[data-service="service.greenvale.buy_sword"]'));
      await p.waitForFunction(() =>
        window.__mmo.items.some((i) => i.templateId === 'weapon.sword.iron_longsword'),
      );
      await close(p);
      const item = await p.evaluate(() =>
        window.__mmo.items.find(
          (i) => i.templateId === 'weapon.sword.iron_longsword' && i.location.kind === 'container',
        ),
      );
      await click(p, p.locator('[data-open=inventory]'));
      await click(p, p.locator(`[data-item-id="${item.id}"]`));
      await click(p, p.locator('[data-action=equip]'));
      await p.waitForFunction(
        (id) => window.__mmo.items.find((i) => i.id === id)?.location.kind === 'equipped',
        item.id,
      );
      await p.keyboard.press('Escape');
      await p.keyboard.press('Escape');
    }
    const a = pages[0],
      b = pages[1];
    const roster = await a.evaluate(
      () => window.__events.filter((m) => m.t === 'party.update').at(-1)?.d,
    );
    if (roster?.members.length !== 2) {
      for (const p of pages) {
        await click(p, p.locator('[data-open=party]'));
        const disband = p.getByRole('button', { name: 'Disband party', exact: true }),
          leave = p.getByRole('button', { name: 'Leave party', exact: true });
        if (await disband.isVisible()) await click(p, disband);
        else if (await leave.isVisible()) await click(p, leave);
        await p.keyboard.press('Escape');
      }
      await a.locator('[data-open=party]').click();
      await a.getByRole('button', { name: /^Invite / }).click();
      await b.getByRole('button', { name: 'Accept party', exact: true }).tap();
      await a.keyboard.press('Escape');
    }
    await a.waitForFunction(
      () => window.__events.filter((m) => m.t === 'party.update').at(-1)?.d.members.length === 2,
    );
    check('Persistent two-player party retained', true);
    if (!FINISH_ONLY) {
      for (const p of pages) await go(p, 435, 616, 2);
      const lootOwners = [];
      for (let k = 0; k < 2; k++) {
        await a.waitForFunction(
          () =>
            window.__mmo.enemies.some(
              (e) => e.refId === 'enemy.world.greenvale_marches.boar.2' && !e.dead,
            ),
          null,
          { timeout: 120000 },
        );
        const enemy = await a.evaluate(() =>
          window.__mmo.enemies.find(
            (e) => e.refId === 'enemy.world.greenvale_marches.boar.2' && !e.dead,
          ),
        );
        check('Catalog Bristleback visible', !!enemy);
        const ep = await a.evaluate((id) => window.__mmo.entityPos(id), enemy.id);
        for (const p of pages) await go(p, ep.x, ep.z, 3);
        for (const p of pages) {
          for (
            let i = 0;
            i < 15 && (await p.evaluate(() => window.__mmo.target.id)) !== enemy.id;
            i++
          ) {
            if (p === b) await p.locator('[data-testid=touch-target]').tap();
            else await p.keyboard.press('Tab');
            await p.waitForTimeout(200);
          }
          check(
            'Same authoritative target',
            (await p.evaluate(() => window.__mmo.target.id)) === enemy.id,
          );
          if (p === b) await p.locator('[data-testid=touch-attack]').tap();
          else await p.keyboard.press('KeyF');
        }
        for (let n = 0; n < 60; n++) {
          for (const p of pages) {
            const ability = p.locator('[data-testid="ability-ability.warrior.heavy_strike"]');
            if (await ability.isEnabled()) await click(p, ability);
          }
          await a.waitForTimeout(1100);
          if (
            await a.evaluate(
              (id) => !window.__mmo.enemies.some((e) => e.id === id && !e.dead),
              enemy.id,
            )
          )
            break;
        }
        for (const p of pages)
          await p.waitForFunction(
            (n) => window.__events.filter((m) => m.t === 'combat.loot').length >= n,
            k + 1,
          );
        const rewards = await Promise.all(
          pages.map((p) =>
            p.evaluate(
              (n) => ({
                loot: window.__events.filter((m) => m.t === 'combat.loot')[n].d,
                xp: window.__events.filter((m) => m.t === 'character.progress' && m.d.xpGained > 0)[
                  n
                ]?.d.xpGained,
              }),
              k,
            ),
          ),
        );
        check(
          'Shared XP and one loot owner',
          rewards.every((r) => r.xp > 0) &&
            rewards.filter(
              (r) => r.loot.items.length + r.loot.mailedItems.length > 0 || r.loot.gold > 0,
            ).length === 1,
          rewards.map((r) => ({
            xp: r.xp,
            items: r.loot.items.length + r.loot.mailedItems.length,
            gold: r.loot.gold,
          })),
        );
        lootOwners.push(
          rewards.findIndex(
            (r) => r.loot.items.length + r.loot.mailedItems.length > 0 || r.loot.gold > 0,
          ),
        );
        for (const p of pages)
          check(
            'Exactly one contract credit per shared kill',
            (await p.evaluate(
              (q) => window.__mmo.quests.find((x) => x.questId === q)?.objectives[0].current,
              Q,
            )) ===
              k + 1,
          );
      }
      check(
        'Loot ownership rotates fairly across two kills',
        lootOwners.length === 2 && lootOwners[0] !== lootOwners[1],
      );
      // Keep both hunters clear of ordinary respawns during the individual return routes.
      await Promise.all(pages.map((p) => go(p, 435, 616, 2)));
    } else {
      for (const p of pages)
        check(
          'Previously earned two kill credits retained',
          (await p.evaluate(
            (q) => window.__mmo.quests.find((x) => x.questId === q)?.objectives[0].current,
            Q,
          )) === 2,
        );
    }
    for (const p of pages) {
      await npc(p, 'npc.world.greenvale_marches.guard');
      if (
        (await p.evaluate((q) => window.__mmo.quests.find((x) => x.questId === q)?.state, Q)) !==
        'completed'
      )
        await click(p, p.locator(`[data-quest="${Q}"] [data-testid=quest-turn-in]`));
      await p.waitForFunction(
        (q) => window.__mmo.quests.find((x) => x.questId === q)?.state === 'completed',
        Q,
      );
      check(
        'Personal daily turn-in, no immediate reacceptance',
        (await p.locator(`[data-quest="${Q}"] [data-testid=quest-accept]`).count()) === 0,
      );
      await close(p);
    }
    await b.setViewportSize({ width: 390, height: 844 });
    await b.screenshot({ path: `${OUT}/touch-contract.png` });
    await a.goto('about:blank');
    await enter(b, users[1], false);
    check(
      'Daily completion and party survive relog',
      await b.evaluate(
        (q) =>
          window.__mmo.quests.find((x) => x.questId === q)?.state === 'completed' &&
          window.__events.filter((m) => m.t === 'party.update').at(-1)?.d.members.length === 2,
        Q,
      ),
    );
    check('No browser exceptions', !errors.length, errors);
  } finally {
    for (let i = 0; i < pages.length; i++)
      try {
        await pages[i].screenshot({ path: `${OUT}/last-${i}.png` });
      } catch {}
    await browser.close();
    fs.writeFileSync(`${OUT}/checks.json`, JSON.stringify({ users, checks, errors }, null, 2));
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
