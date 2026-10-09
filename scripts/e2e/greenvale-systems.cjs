/* eslint-disable */
// Reuses earned actors. Observations only; every action uses movement, keyboard or visible UI.
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const fs = require('node:fs');
const { enter, walk } = require('./vertical-slice.cjs');
const OUT = process.argv[2] || '/tmp/greenvale-systems-browser';
fs.mkdirSync(OUT, { recursive: true });
const USER = process.env.SYSTEMS_USER || 'route_muvjmzr0';
const PARTY = process.env.SYSTEMS_PARTY_USER || 'route_muuzc28m';
const MODE = process.env.SYSTEMS_MODE || 'solo';
const TOUCH = process.env.SYSTEMS_TOUCH === '1';
const checks = [];
function check(name, ok, detail) {
  checks.push({ name, ok: !!ok, detail });
  console.log(ok ? 'PASS' : 'FAIL', name, detail || '');
  fs.writeFileSync(
    `${OUT}/proof.json`,
    JSON.stringify({ mode: MODE, users: [USER, PARTY], checks }, null, 2),
  );
  if (!ok) throw Error(name);
}
(async () => {
  const { getGameData, brokenVault } = await import('../../packages/game-data/src/index.ts');
  const { NavGrid } = await import('../../services/world/src/navigation.ts');
  const gd = getGameData(),
    world = gd.raw.worldCatalog;
  const browser = await chromium.launch({
    executablePath: '/usr/bin/google-chrome',
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
  const context = await browser.newContext({
    viewport: TOUCH ? { width: 390, height: 844 } : { width: 900, height: 650 },
    hasTouch: TOUCH,
    isMobile: TOUCH,
    deviceScaleFactor: Number(process.env.SYSTEMS_DPR || 0.5),
  });
  const errors = [];
  context.on('page', (p) => p.on('pageerror', (e) => errors.push(e.message)));
  await context.addInitScript(() => {
    window.__systemEvents = [];
    const WS = window.WebSocket;
    window.WebSocket = class extends WS {
      constructor(...args) {
        super(...args);
        this.addEventListener('message', (e) => {
          const m = JSON.parse(e.data);
          if (['auth.ok', 'error', 'systems.state', 'combat.loot', 'party.update'].includes(m.t))
            window.__systemEvents.push(m);
        });
      }
    };
  });
  const page = await context.newPage();
  const zone = (p) =>
    p.evaluate(() => window.__systemEvents.filter((m) => m.t === 'auth.ok').at(-1)?.d.zoneId);
  const status = (p) => p.evaluate(() => window.__mmo.systems);
  async function go(p, x, z, range = 1.5) {
    await p.bringToFront();
    await close(p);
    let clearance = 2;
    for (let n = 0; n < 100; n++) {
      const pos = await p.evaluate(() => window.__mmo.position),
        d = Math.hypot(x - pos.x, z - pos.z);
      if (d <= range) return;
      const id = await zone(p),
        col = gd.collisionWorld(id),
        bounds = gd.zone(id).bounds,
        step = Math.min(d, 70),
        goal = { x: pos.x + ((x - pos.x) * step) / d, z: pos.z + ((z - pos.z) * step) / d };
      const nav = new NavGrid(
        col,
        {
          minX: Math.max(bounds.minCx * 64, Math.min(pos.x, goal.x) - 16),
          minZ: Math.max(bounds.minCz * 64, Math.min(pos.z, goal.z) - 16),
          maxX: Math.min((bounds.maxCx + 1) * 64, Math.max(pos.x, goal.x) + 16),
          maxZ: Math.min((bounds.maxCz + 1) * 64, Math.max(pos.z, goal.z) + 16),
        },
        d > 20 ? clearance : 0.8,
      );
      const path = nav.findPath(pos, goal);
      if (!path) throw Error('No route');
      for (const pt of path) {
        try {
          await walk(
            p,
            pt.x,
            pt.z,
            step === d && pt === path.at(-1) ? range : 1.3,
            Math.max(18000, Math.hypot(pt.x - pos.x, pt.z - pos.z) * 900),
          );
        } catch (e) {
          if (!String(e.message).includes('Walk deadline')) throw e;
          console.log('REPATH', pt, await p.evaluate(() => window.__mmo.position));
          await p.screenshot({ path: `${OUT}/route-retry.png` });
          clearance = Math.min(5, clearance + 1);
          break;
        }
      }
    }
    throw Error('Route deadline');
  }
  async function close(p) {
    const dialogue = p.getByRole('button', { name: 'Close dialogue', exact: true });
    if (await dialogue.isVisible()) await dialogue[TOUCH ? 'tap' : 'click']();
    while (await p.locator('.window-header .icon-button:visible').count())
      await p.locator('.window-header .icon-button:visible').first()[TOUCH ? 'tap' : 'click']();
    await p.keyboard.press('Escape');
  }
  async function skills(p) {
    if (!(await p.locator('[data-window=professions]').isVisible()))
      await p.locator('[data-open=professions]')[TOUCH ? 'tap' : 'click']();
    await p.waitForTimeout(300);
  }
  async function cmd(p, action) {
    await skills(p);
    const before = await p.evaluate(() => window.__systemEvents.length);
    await p.locator(`[data-dungeon=${action}]`)[TOUCH ? 'tap' : 'click']();
    await p.waitForFunction(
      ({ before }) =>
        window.__systemEvents
          .slice(before)
          .some((m) => m.t === 'systems.state' && m.ack !== undefined),
      { before },
      { timeout: 15000 },
    );
    await close(p);
  }
  async function npc(p, id) {
    const ch = gd.raw.chunks.find((c) =>
      c.spawnPoints.some((s) => s.refId === id && s.kind === 'npc'),
    );
    const s = ch.spawnPoints.find((s) => s.refId === id);
    if (id === 'npc.world.greenvale_marches.profession') {
      await go(p, 294, 418, 2);
      await go(p, 270, 418, 2);
    }
    await go(p, s.position.x, s.position.z, 2.5);
    await p.keyboard.press('KeyE');
    await p.waitForSelector('[data-testid=dialogue]');
  }
  const qty = (p, id) =>
    p.evaluate(
      (id) =>
        window.__mmo.items
          .filter((i) => i.templateId === id && i.location.kind === 'container')
          .reduce((n, i) => n + i.quantity, 0),
      id,
    );
  async function gather(p, nodeId) {
    const n = world.resourceNodes.find((n) => n.id === nodeId),
      l = world.locations.find((l) => l.id === n.locationId),
      ref = world.resources.find((r) => r.id === n.resourceId).itemTemplateId,
      before = await qty(p, ref);
    await go(p, l.position.x + n.offset.x, l.position.z + n.offset.z, 2.5);
    await p.waitForFunction(
      () => document.querySelector('.prompt')?.textContent.toLowerCase().includes('gather'),
      null,
      { timeout: 120000 },
    );
    await p.keyboard.press('KeyE');
    await p.waitForFunction(
      ({ ref, before }) =>
        window.__mmo.items
          .filter((i) => i.templateId === ref && i.location.kind === 'container')
          .reduce((n, i) => n + i.quantity, 0) > before,
      { ref, before },
    );
    return (await qty(p, ref)) - before;
  }
  async function remedy(p) {
    const id = await p.evaluate(
      () =>
        window.__mmo.items.find(
          (i) =>
            i.templateId === 'consumable.greenvale.remedy' &&
            i.location.containerKind === 'backpack',
        )?.id,
    );
    if (!id) return;
    await p.locator('[data-open=inventory]')[TOUCH ? 'tap' : 'click']();
    await p.locator(`[data-item-id="${id}"]`)[TOUCH ? 'tap' : 'click']();
    const health = await p.evaluate(() => window.__mmo.vitals.health);
    await p.locator('[data-testid=use-remedy]')[TOUCH ? 'tap' : 'click']();
    await p.waitForTimeout(700);
    check(
      'Crafted remedy restores actual health',
      await p.evaluate((h) => window.__mmo.vitals.health > h, health),
    );
    await close(p);
  }
  async function startAttack(p, enemy) {
    await p.bringToFront();
    const pos = await p.evaluate((id) => window.__mmo.entityPos(id), enemy.id);
    await go(p, pos.x, pos.z, 2.5);
    for (let i = 0; i < 8; i++) {
      if (await p.evaluate((id) => window.__mmo.target.id === id, enemy.id)) break;
      await p.keyboard.press('Tab');
      await p.waitForTimeout(180);
    }
    if (!(await p.evaluate(() => window.__mmo.target.attacking))) await p.keyboard.press('KeyF');
  }
  async function fight(p, ref, partner) {
    const alive = await p.evaluate(
        (ref) => window.__mmo.enemies.filter((e) => !e.dead && e.refId === ref),
        ref,
      ),
      pos = await p.evaluate(() => window.__mmo.position);
    alive.sort((a, b) => {
      return 0;
    });
    const enemy = alive[0];
    if (!enemy) throw Error('No enemy ' + ref);
    await startAttack(p, enemy);
    if (partner) await startAttack(partner, enemy);
    let used = false;
    for (let i = 0; i < 120; i++) {
      await p.bringToFront();
      const state = await p.evaluate(
        (id) => ({
          v: window.__mmo.vitals,
          alive: window.__mmo.enemies.some((e) => e.id === id && !e.dead),
          cue: window.__mmo.enemies.find((e) => e.id === id)?.attackCue,
        }),
        enemy.id,
      );
      if (state.v.dead) throw Error('Unexpected death fighting ' + ref);
      if (!state.alive) break;
      if (!partner && !used && state.v.health < state.v.maxHealth - 65) {
        await remedy(p);
        used = true;
      }
      for (const ability of ['ability.warrior.heavy_strike', 'ability.warrior.battle_strike']) {
        const btn = p.locator(`[data-testid="ability-${ability}"]`);
        if ((await btn.isEnabled()) && (await btn.getAttribute('data-ready')) === 'true')
          await btn[TOUCH ? 'tap' : 'click']();
      }
      if (process.env.SYSTEMS_DODGE === '1' && state.cue?.groundPosition) {
        const ep = state.cue.groundPosition;
        await go(p, ep.x, ep.z > 32 ? ep.z - 8 : ep.z + 8, 1);
        await p.waitForTimeout(700);
        const dest = await p.evaluate((id) => window.__mmo.entityPos(id), enemy.id);
        if (dest) await go(p, dest.x, dest.z, 2.5);
      }
      if (partner) {
        await partner.bringToFront();
        for (const ability of ['ability.warrior.heavy_strike', 'ability.warrior.battle_strike']) {
          const btn = partner.locator(`[data-testid="ability-${ability}"]`);
          if ((await btn.isEnabled()) && (await btn.getAttribute('data-ready')) === 'true')
            await btn[TOUCH ? 'tap' : 'click']();
        }
      }
      await p.waitForTimeout(700);
    }
    check(
      'Actual private encounter defeated',
      await p.evaluate((id) => !window.__mmo.enemies.some((e) => e.id === id && !e.dead), enemy.id),
      enemy.id,
    );
    await p.waitForTimeout(900);
  }
  try {
    await enter(page, USER, false);
    await page.waitForFunction(() => window.__systemEvents.some((m) => m.t === 'systems.state'));
    console.log('ENTERED', USER, await zone(page));
    if (MODE === 'professions' || MODE === 'touch-resume') {
      if (MODE !== 'touch-resume') {
        const offer = gd.raw.serviceOffers.find(
          (o) => o.id === (process.env.SYSTEMS_RECIPE || 'service.greenvale.craft_remedy'),
        );
        const xpBefore = (await status(page)).professions.find((p) => p.id === 'crafting').xp;
        const outputBefore = await qty(page, offer.output.itemTemplateId);
        if ((await qty(page, 'tool.herbalism.tier1')) === 0) {
          await npc(page, 'npc.world.greenvale_marches.merchant');
          await page
            .locator('[data-service="service.greenvale.tool.herbalism.1"]')
            [TOUCH ? 'tap' : 'click']();
          await page.waitForTimeout(700);
          await close(page);
        }
        const yieldCount = await gather(page, 'node.greenvale_marches.herb_beds');
        check('Inventory-backed field tool improves real herb yield', yieldCount === 3, yieldCount);
        for (const input of offer.inputs) {
          while ((await qty(page, input.itemTemplateId)) < input.quantity) {
            const resource = world.resources.find((r) => r.itemTemplateId === input.itemTemplateId);
            const node = world.resourceNodes.find(
              (n) =>
                n.resourceId === resource?.id &&
                world.locations.find((l) => l.id === n.locationId)?.zoneId ===
                  'zone.aurelian.greenvale_marches',
            );
            if (!node) throw Error('No current gather route for recipe input');
            check(
              'Real recipe input gathered',
              (await gather(page, node.id)) > 0,
              input.itemTemplateId,
            );
          }
        }
        await npc(page, 'npc.world.greenvale_marches.profession');
        await page.locator(`[data-service="${offer.id}"]`)[TOUCH ? 'tap' : 'click']();
        await page.waitForTimeout(700);
        await close(page);
        await skills(page);
        const state = await status(page),
          job = state.jobs.find((j) => !j.completed);
        check('Craft reserves a durable timed job', job && job.readyAtMs > Date.now(), job);
        await page.screenshot({ path: `${OUT}/craft-desktop.png` });
        await page.reload();
        await enter(page, USER, false);
        await skills(page);
        await page.waitForTimeout(Math.max(0, job.readyAtMs - Date.now()) + 500);
        await page.locator(`[data-craft-finish="${job.id}"]`)[TOUCH ? 'tap' : 'click']();
        await page.waitForFunction(
          (id) => window.__mmo.systems.jobs.some((j) => j.id === id && j.completed),
          job.id,
        );
        check(
          'Timed craft survives relog and yields its real authored output',
          (await qty(page, offer.output.itemTemplateId)) === outputBefore + offer.output.quantity,
          offer.output.itemTemplateId,
        );
        check(
          'Craft completion awards profession XP',
          (await status(page)).professions.find((p) => p.id === 'crafting').xp ===
            Math.min(500, xpBefore + 20),
        );
        await page.screenshot({ path: `${OUT}/craft-complete.png` });
      }
      if (TOUCH) {
        await close(page);
        const before = await page.evaluate(() => window.__mmo.position);
        const joy = await page.locator('[data-testid=joystick]').boundingBox(),
          cd = await context.newCDPSession(page);
        await cd.send('Input.dispatchTouchEvent', {
          type: 'touchStart',
          touchPoints: [{ x: joy.x + joy.width / 2, y: joy.y + joy.height / 2 }],
        });
        await cd.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [{ x: joy.x + joy.width / 2, y: joy.y + 15 }],
        });
        await page.waitForTimeout(700);
        await cd.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        check(
          'Actual touch joystick moves the player',
          await page.evaluate(
            (b) => Math.hypot(window.__mmo.position.x - b.x, window.__mmo.position.z - b.z) > 0.3,
            before,
          ),
        );
        for (const viewport of [
          { width: 390, height: 844 },
          { width: 844, height: 390 },
        ]) {
          await page.setViewportSize(viewport);
          await skills(page);
          check(
            `Touch skill sheet fits ${viewport.width}x${viewport.height}`,
            await page.locator('[data-window=professions]').evaluate((el) => {
              const r = el.getBoundingClientRect();
              return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight;
            }),
          );
          await page.screenshot({ path: `${OUT}/touch-${viewport.width}.png` });
          await close(page);
        }
      }
    } else {
      if (
        !(await status(page)).instance?.inside &&
        (await zone(page)) !== 'zone.aurelian.greenvale_marches'
      ) {
        await go(page, 0, 116, 2);
        await page.locator('[data-open=world]')[TOUCH ? 'tap' : 'click']();
        const originZone = await zone(page);
        const route = world.travel.find(
          (t) => world.locations.find((l) => l.id === t.fromLocationId).zoneId === originZone,
        );
        await page.locator(`[data-travel="${route.id}"]`)[TOUCH ? 'tap' : 'click']();
        await page.waitForFunction(
          () =>
            window.__systemEvents.filter((m) => m.t === 'auth.ok').at(-1).d.zoneId ===
            'zone.aurelian.greenvale_marches',
        );
        await close(page);
      }
      const entrance = world.locations.find((l) => l.id === brokenVault.entranceLocationId);
      if (!(await status(page)).instance?.inside)
        await go(page, entrance.position.x, entrance.position.z, 2);
      console.log('AT VAULT');
      if (MODE === 'approach') {
        check('Earned party actor physically reached Vault entrance', true);
        return;
      }
      let partner = null;
      if (MODE === 'party') {
        partner = await context.newPage();
        await enter(partner, PARTY, false);
        if (
          !(await status(partner)).instance?.inside &&
          (await zone(partner)) !== 'zone.aurelian.greenvale_marches'
        ) {
          await go(partner, 0, 116, 2);
          await partner.locator('[data-open=world]')[TOUCH ? 'tap' : 'click']();
          const originZone = await zone(partner);
          const routes = world.travel.filter(
            (t) => world.locations.find((l) => l.id === t.fromLocationId).zoneId === originZone,
          );
          await partner.locator(`[data-travel="${routes[0].id}"]`)[TOUCH ? 'tap' : 'click']();
          await partner.waitForFunction(
            () =>
              window.__systemEvents.filter((m) => m.t === 'auth.ok').at(-1).d.zoneId ===
              'zone.aurelian.greenvale_marches',
          );
          await close(partner);
        }
        if (!(await status(partner)).instance?.inside)
          await go(partner, entrance.position.x, entrance.position.z, 2);
        if (!(await status(page)).instance?.inside) {
          await page.bringToFront();
          await page.locator('[data-open=party]')[TOUCH ? 'tap' : 'click']();
          const name = await partner.evaluate(
            () => document.querySelector('[data-testid=player-frame]')?.textContent,
          );
          await page
            .getByRole('button', { name: /Invite / })
            .first()
            [TOUCH ? 'tap' : 'click']();
          await partner.bringToFront();
          await partner
            .getByRole('button', { name: 'Accept party', exact: true })
            [TOUCH ? 'tap' : 'click']();
          await close(page);
          await page.waitForTimeout(500);
        }
      }
      const reserved = (await status(page)).instance;
      if (reserved && !reserved.inside) await cmd(page, 'reset');
      if (!(await status(page)).instance?.inside) await cmd(page, 'enter');
      const instance = (await status(page)).instance;
      check('Entered a private owned run', instance?.inside, instance);
      if (partner) {
        if (!(await status(partner)).instance?.inside) await cmd(partner, 'enter');
        check(
          'Both party members join the same private instance',
          (await status(partner)).instance.id === instance.id,
        );
      }
      await page.screenshot({ path: `${OUT}/vault-entry.png` });
      if (instance.status === 'active') {
        if ((await status(page)).instance.kills === 0)
          await fight(page, 'enemy.world.greenvale_marches.stonekin.5', partner);
        const beforeDrop = instance.id;
        const authCount = await page.evaluate(
          () => window.__systemEvents.filter((m) => m.t === 'auth.ok').length,
        );
        await page.evaluate(() => window.__mmo.dropConnection());
        await page.waitForFunction(
          (n) =>
            window.__systemEvents.filter((m) => m.t === 'auth.ok').length > n &&
            window.__mmo.connected &&
            window.__mmo.systems.instance?.inside,
          authCount,
        );
        check(
          'Reconnect returns to the same live instance',
          (await status(page)).instance.id === beforeDrop,
        );
        if (!partner && process.env.SYSTEMS_SKIP_DEATH !== '1') {
          const enemy = await page.evaluate(() =>
            window.__mmo.enemies.find(
              (e) => !e.dead && e.refId === 'enemy.world.greenvale_marches.stonekin.5',
            ),
          );
          const ep = await page.evaluate((id) => window.__mmo.entityPos(id), enemy.id);
          await go(page, ep.x, ep.z, 2);
          await page.waitForFunction(() => window.__mmo.vitals.dead, null, { timeout: 120000 });
          await page.screenshot({ path: `${OUT}/vault-death.png` });
          await page.waitForTimeout(3500);
          await page.locator('[data-testid=respawn]')[TOUCH ? 'tap' : 'click']();
          await page.waitForFunction(() => !window.__mmo.vitals.dead);
          check(
            'Death recovers at the private threshold without resetting cleared objectives',
            (await page.evaluate(() => window.__mmo.position.x < 12)) &&
              (await status(page)).instance.id === instance.id,
          );
        }
        if ((await status(page)).instance.kills < 2)
          await fight(page, 'enemy.world.greenvale_marches.stonekin.5', partner);
        await fight(page, 'enemy.greenvale.vault_keeper', partner);
      }

      await page.waitForFunction(
        () => window.__mmo.systems.instance?.status === 'completed',
        null,
        { timeout: 15000 },
      );
      check(
        'All encounters authoritatively complete the run',
        (await status(page)).instance.kills === 3,
      );
      await page.screenshot({ path: `${OUT}/vault-completed.png` });
      await enter(page, USER, false);
      check(
        'Completed private state survives relog',
        (await status(page)).instance.id === instance.id &&
          (await status(page)).instance.status === 'completed',
      );
      await go(page, 8, 32, 1.5);
      await page.waitForTimeout(9000);
      await cmd(page, 'exit');
      if (partner) {
        await go(partner, 8, 32, 1.5);
        await page.waitForTimeout(9000);
        await cmd(partner, 'exit');
      }
      check('Exit returns to the real entrance', (await zone(page)) === entrance.zoneId);
      await cmd(page, 'reset');
      await cmd(page, 'enter');
      check(
        'Reset creates a fresh identity with no stale objective state',
        (await status(page)).instance.id !== instance.id &&
          (await status(page)).instance.kills === 0,
      );
      await go(page, 8, 32, 1);
      await cmd(page, 'exit');
      await cmd(page, 'reset');
    }
    check('No browser exceptions', errors.length === 0, errors);
    fs.writeFileSync(
      `${OUT}/events.json`,
      JSON.stringify(await page.evaluate(() => window.__systemEvents), null, 2),
    );
  } catch (e) {
    await page.screenshot({ path: `${OUT}/failure.png` });
    fs.writeFileSync(
      `${OUT}/failure.json`,
      JSON.stringify(
        {
          error: e.message,
          state: await page.evaluate(() => ({
            systems: window.__mmo?.systems,
            vitals: window.__mmo?.vitals,
            position: window.__mmo?.position,
            errors: window.__systemEvents?.filter((m) => m.t === 'error'),
          })),
        },
        null,
        2,
      ),
    );
    throw e;
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
