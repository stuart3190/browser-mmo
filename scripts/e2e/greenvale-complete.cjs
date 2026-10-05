/* eslint-disable */
// Real progression inputs only. NavGrid chooses walking waypoints, not teleports or client claims.
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const { enter, walk } = require('./vertical-slice.cjs');
const fs = require('node:fs');
const OUT = process.argv[2] || '/tmp/greenvale-complete';
fs.mkdirSync(OUT, { recursive: true });
const CREATE = process.env.GREENVALE_CREATE === '1';
const SERVICES = process.env.GREENVALE_SERVICES_ONLY === '1';
const USER =
  process.env.GREENVALE_USER ||
  (CREATE ? 'greenvale_' + Date.now().toString(36) : 'guard_muu9vm2y');
if (CREATE && !process.env.GREENVALE_FULL)
  throw Error('Fresh playthrough requires GREENVALE_FULL=1');
const checks = [];
function check(name, ok, detail) {
  checks.push({ name, ok: !!ok, detail });
  console.log(ok ? 'PASS' : 'FAIL', name, detail || '');
  if (!ok) throw Error(name);
}
(async () => {
  const { getGameData, CollisionWorld, chunkColliders, EXPLORATION_RADIUS } =
    await import('../../packages/game-data/src/index.ts');
  const { NavGrid } = await import('../../services/world/src/navigation.ts');
  const gd = getGameData(),
    world = gd.raw.worldCatalog;
  const b = await chromium.launch({
    executablePath: '/usr/bin/google-chrome',
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
  const c = await b.newContext({
    viewport:
      process.env.GREENVALE_TOUCH === '1'
        ? { width: 640, height: 480 }
        : { width: 900, height: 650 },
    deviceScaleFactor: Number(process.env.GREENVALE_DPR ?? 1),
    hasTouch: process.env.GREENVALE_TOUCH === '1',
    isMobile: process.env.GREENVALE_TOUCH === '1',
  });
  c.setDefaultTimeout(60000);
  await c.addInitScript(() => {
    window.__gvEvents = [];
    const WS = window.WebSocket;
    window.WebSocket = class extends WS {
      constructor(...a) {
        super(...a);
        this.addEventListener('message', (e) => {
          const m = JSON.parse(e.data);
          if (
            [
              'auth.ok',
              'world.discoveries',
              'quest.completed',
              'combat.loot',
              'error',
              'party.update',
            ].includes(m.t)
          )
            window.__gvEvents.push(m);
        });
      }
    };
  });
  const p = await c.newPage(),
    errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  const touch = process.env.GREENVALE_TOUCH === '1';
  const click = async (l) => (touch ? l.tap() : l.click());
  async function zone() {
    return p.evaluate(() => window.__gvEvents.filter((m) => m.t === 'auth.ok').at(-1)?.d.zoneId);
  }
  const collisions = new Map(
    gd.raw.zones.map((z) => [
      z.id,
      new CollisionWorld(gd.chunksForZone(z.id).flatMap(chunkColliders)),
    ]),
  );
  async function go(x, z, range = 1.8) {
    console.log('GO', x, z);
    await p.bringToFront();
    let clearance = 2;
    for (let n = 0; n < 100; n++) {
      const pos = await p.evaluate(() => window.__mmo.position);
      const d = Math.hypot(x - pos.x, z - pos.z);
      if (d <= range) return;
      const id = await zone(),
        col = collisions.get(id),
        bounds = gd.zones.get(id).bounds;
      const step = Math.min(d, 80);
      const goal = { x: pos.x + ((x - pos.x) * step) / d, z: pos.z + ((z - pos.z) * step) / d };
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
      if (!path) throw Error('No walkable route ' + x + ',' + z);
      for (const pt of path) {
        const here = await p.evaluate(() => window.__mmo.position);
        try {
          await walk(
            p,
            pt.x,
            pt.z,
            step === d ? Math.min(range, 1.3) : 1.3,
            Math.max(10000, Math.hypot(pt.x - here.x, pt.z - here.z) * 600),
          );
        } catch (e) {
          if (!e.message.startsWith('Walk deadline')) throw e;
          clearance = Math.min(5, clearance + 1);
          break;
        }
      }
    }
    throw Error('route iterations');
  }
  async function sameZone(id) {
    if ((await zone()) === id) return;
    const march = 'zone.aurelian.greenvale_marches';
    if (id !== march && id !== 'zone.greenvale.meadows') throw Error('Greenvale-only test');
    const from = world.locations.find(
      (l) =>
        l.id ===
        (id === march
          ? 'location.greenvale.north_gate'
          : 'location.greenvale_marches.starter_gate'),
    );
    await go(from.position.x, from.position.z, 2);
    const route = world.travel.find(
      (t) =>
        t.fromLocationId === from.id &&
        world.locations.find((l) => l.id === t.toLocationId).zoneId === id,
    );
    await click(p.locator('[data-open=world]'));
    await click(p.locator(`[data-travel="${route.id}"]`));
    await p.waitForFunction(
      (id) => window.__gvEvents.filter((m) => m.t === 'auth.ok').at(-1)?.d.zoneId === id,
      id,
    );
  }
  function npcPosition(id) {
    for (const ch of gd.raw.chunks) {
      const s = ch.spawnPoints.find((s) => s.refId === id && s.kind === 'npc');
      if (s) return { ...s.position, zoneId: ch.zoneId };
    }
    throw Error('NPC ' + id);
  }
  async function approachNpc(id) {
    const t = npcPosition(id);
    await sameZone(t.zoneId);
    await go(t.x, t.z, 3);
    await interact();
    await p.waitForFunction(
      (id) => document.querySelector('[data-testid=dialogue]') && window.__gvEvents,
      id,
    );
  }
  async function interact() {
    if (touch) await p.locator('[data-testid=touch-interact]').tap();
    else await p.keyboard.press('KeyE');
  }
  async function close() {
    if (await p.getByRole('button', { name: 'Close dialogue', exact: true }).isVisible())
      await click(p.getByRole('button', { name: 'Close dialogue', exact: true }));
  }
  async function questAction(q, action) {
    const d = gd.quest(q);
    await approachNpc(action === 'accept' ? d.giverNpcId : (d.turnInNpcId ?? d.giverNpcId));
    await click(p.locator(`[data-quest="${q}"] [data-testid=quest-${action}]`));
    await p.waitForTimeout(600);
    await close();
    console.log(q, action);
  }
  async function qty(id) {
    return p.evaluate(
      (id) =>
        window.__mmo.items
          .filter((i) => i.templateId === id && i.location.kind === 'container')
          .reduce((n, i) => n + i.quantity, 0),
      id,
    );
  }
  async function gather(id, quantity) {
    const nodes = world.resourceNodes.filter(
      (n) => world.resources.find((r) => r.id === n.resourceId).itemTemplateId === id,
    );
    if (!nodes.length) {
      const localIds = new Set(
        gd.raw.chunks
          .filter((c) =>
            ['zone.greenvale.meadows', 'zone.aurelian.greenvale_marches'].includes(c.zoneId),
          )
          .flatMap((c) => c.spawnPoints)
          .filter((s) => s.kind === 'enemy')
          .map((s) => s.refId),
      );
      const source = [...gd.enemies.values()]
        .filter((e) => localIds.has(e.id))
        .sort((a, b) => (b.combat?.aggroRadius ?? 0) - (a.combat?.aggroRadius ?? 0))
        .find(
          (e) =>
            e.lootTableId &&
            gd.lootTables.get(e.lootTableId).entries.some((i) => i.itemTemplateId === id),
        );
      if (!source) throw Error('No gather/loot source ' + id);
      while ((await qty(id)) < quantity) await fight(source.id, 1);
      return;
    }
    const n = nodes[0],
      l = world.locations.find((l) => l.id === n.locationId);
    await sameZone(l.zoneId);
    await go(l.position.x + n.offset.x, l.position.z + n.offset.z, 2.5);
    while ((await qty(id)) < quantity) {
      await p.waitForFunction(
        () => document.querySelector('.prompt')?.textContent.toLowerCase().includes('gather'),
        null,
        { timeout: 120000 },
      );
      await interact();
      await p.waitForTimeout(1500);
    }
  }
  async function fight(ref, count = 1) {
    for (let n = 0; n < count; n++) {
      const sp = gd.raw.chunks
        .flatMap((ch) => ch.spawnPoints.map((s) => ({ ...s, zoneId: ch.zoneId })))
        .filter((s) => s.kind === 'enemy' && s.refId === ref);
      const pos = await p.evaluate(() => window.__mmo.position);
      sp.sort(
        (a, b) =>
          Math.hypot(a.position.x - pos.x, a.position.z - pos.z) -
          Math.hypot(b.position.x - pos.x, b.position.z - pos.z),
      );
      await sameZone(sp[0].zoneId);
      const known = await p.evaluate(
        (ref) =>
          window.__mmo.enemies
            .filter((e) => !e.dead && e.refId === ref)
            .map((e) => ({ id: e.id, ...window.__mmo.entityPos(e.id) })),
        ref,
      );
      if (known.length) {
        known.sort(
          (a, b) => Math.hypot(a.x - pos.x, a.z - pos.z) - Math.hypot(b.x - pos.x, b.z - pos.z),
        );
        await go(known[0].x, known[0].z, 5);
      } else {
        // Clear the anti-camping radius before waiting for ordinary authoritative respawn.
        await go(sp[0].position.x, sp[0].position.z - 30, 3);
        if (
          !(await p.evaluate(
            (ref) => window.__mmo.enemies.some((e) => !e.dead && e.refId === ref),
            ref,
          ))
        )
          await p.waitForTimeout(65000);
        await go(sp[0].position.x, sp[0].position.z, 5);
      }
      let chosen = null;
      for (let i = 0; i < 180; i++) {
        const state = await p.evaluate(
          (ref) => ({
            target: window.__mmo.target,
            alive: window.__mmo.enemies.filter((e) => !e.dead && e.refId === ref),
            v: window.__mmo.vitals,
          }),
          ref,
        );
        if (state.v.dead) throw Error('Died during ' + ref);
        if (chosen && !state.alive.some((e) => e.id === chosen)) break;
        const e = state.alive.find((e) => e.id === state.target.id) || state.alive[0];
        if (!e) {
          await p.waitForTimeout(1200);
          continue;
        }
        if (state.target.id !== e.id) {
          if (touch) await p.locator('[data-testid=touch-target]').tap();
          else await p.keyboard.press('Tab');
          await p.waitForTimeout(250);
          continue;
        }
        chosen = e.id;
        const ep = await p.evaluate((id) => window.__mmo.entityPos(id), e.id);
        await go(ep.x, ep.z, 4);
        if (!state.target.attacking) {
          if (touch) await p.locator('[data-testid=touch-attack]').tap();
          else await p.keyboard.press('KeyF');
        }
        for (const id of ['ability.warrior.heavy_strike', 'ability.warrior.battle_strike']) {
          const button = p.locator(`[data-testid="ability-${id}"]`);
          if (await button.isEnabled()) await click(button);
        }
        await p.waitForTimeout(1200);
      }
      if (!chosen) throw Error('No real target ' + ref);
      check(
        'Real catalog enemy defeated',
        await p.evaluate((id) => !window.__mmo.enemies.some((e) => e.id === id && !e.dead), chosen),
        ref,
      );
    }
  }
  try {
    await enter(p, USER, CREATE);
    if (CREATE) {
      await go(8, -14);
      await interact();
      await p.waitForFunction(() =>
        window.__mmo.items.some((i) => i.templateId === 'weapon.sword.iron_longsword'),
      );
      const sword = await p.evaluate(() =>
        window.__mmo.items.find((i) => i.templateId === 'weapon.sword.iron_longsword'),
      );
      await click(p.locator('[data-open=inventory]'));
      await click(p.locator(`[data-item-id="${sword.id}"]`));
      await click(p.locator('[data-action=equip]'));
      await p.waitForFunction(
        (id) => window.__mmo.items.find((i) => i.id === id)?.location.kind === 'equipped',
        sword.id,
      );
      await p.keyboard.press('Escape');
      await p.keyboard.press('Escape');
      check('Fresh arrival and actual starter pickup/equipment', true);
    }
    if (await p.locator('[data-testid=respawn]').isVisible()) {
      await p.locator('[data-testid=respawn]').click({ timeout: 120000 });
      await p.waitForFunction(() => !window.__mmo.vitals.dead);
      check('Normal respawn preserves earned progression', true);
    }
    // Use genuinely earned gear, via the inventory, before continuing harder encounters.
    const earned = await p.evaluate(() =>
      window.__mmo.items
        .filter((i) => i.location.kind === 'container')
        .map((i) => ({ id: i.id, templateId: i.templateId })),
    );
    for (const suffix of [
      'armor.leather.trapper_cap',
      'accessory.ring.copper_band',
      'accessory.cloak.wayfarer_cloak',
      'accessory.cloak.oathkeepers_mantle',
    ]) {
      if (
        suffix === 'accessory.cloak.wayfarer_cloak' &&
        (await p.evaluate(() =>
          window.__mmo.items.some(
            (i) =>
              i.templateId === 'accessory.cloak.oathkeepers_mantle' &&
              i.location.kind !== 'destroyed',
          ),
        ))
      )
        continue;
      const item = earned.find((i) => i.templateId === suffix);
      if (!item) continue;
      await click(p.locator('[data-open=inventory]'));
      await click(p.locator(`[data-container=backpack] [data-item-id="${item.id}"]`));
      await click(p.locator('[data-action=equip]'));
      await p.waitForFunction(
        (id) => window.__mmo.items.find((i) => i.id === id)?.location.kind === 'equipped',
        item.id,
      );
      await p.keyboard.press('Escape');
      await p.keyboard.press('Escape');
      check('Earned equipment equipped through inventory', true, suffix);
    }
    await p.waitForFunction(
      () => window.__mmo.vitals.health >= window.__mmo.vitals.maxHealth - 1,
      null,
      { timeout: 120000 },
    );
    if (!process.env.GREENVALE_FULL && !SERVICES)
      check(
        'Existing earned keeper-outpost prerequisite',
        await p.evaluate(
          () =>
            window.__mmo.quests.find((q) => q.questId === 'quest.greenvale.keeper_outpost')
              ?.state === 'completed',
        ),
      );
    for (const suffix of SERVICES
      ? []
      : [
          ...(process.env.GREENVALE_FULL
            ? [
                'wolves_at_the_edge',
                'old_waystone',
                'hollow_trail',
                'root_wound',
                'stillwater',
                'well_records',
                'keeper_outpost',
              ]
            : []),
          'marches_call',
          'marches_supply',
          'marches_boundary',
          'marches_vault',
          'marches_home',
          ...(process.env.GREENVALE_SIDE
            ? ['marches_timber', 'marches_ore', 'marches_river', 'marches_remedy', 'marches_patrol']
            : []),
        ]) {
      const id = 'quest.greenvale.' + suffix,
        def = gd.quest(id);
      let state = await p.evaluate((id) => window.__mmo.quests.find((q) => q.questId === id), id);
      if (state.state === 'completed') continue;
      if (state.state === 'available') await questAction(id, 'accept');
      for (const objective of def.objectives) {
        state = await p.evaluate((id) => window.__mmo.quests.find((q) => q.questId === id), id);
        if (state.objectives.find((o) => o.id === objective.id).done) continue;
        if (objective.kind === 'talk') {
          await approachNpc(objective.npcId);
          await close();
        }
        if (objective.kind === 'collect') await gather(objective.itemTemplateId, objective.count);
        if (objective.kind === 'explore') {
          const l = gd.zones.get(objective.zoneId).landmarks.find((l) => l.id === objective.areaId);
          await sameZone(objective.zoneId);
          await go(l.position.x, l.position.z, EXPLORATION_RADIUS - 0.5);
          await p.waitForTimeout(1600);
        }
        if (objective.kind === 'kill')
          await fight(
            objective.enemyId,
            objective.count - state.objectives.find((o) => o.id === objective.id).current,
          );
      }
      await p.waitForFunction(
        (id) => window.__mmo.quests.find((q) => q.questId === id)?.state === 'ready_to_turn_in',
        id,
      );
      await questAction(id, 'turn-in');
      check(
        'Persistent main arc completion',
        await p.evaluate(
          (id) => window.__mmo.quests.find((q) => q.questId === id)?.state === 'completed',
          id,
        ),
        id,
      );
      await p.screenshot({ path: `${OUT}/${suffix}.png` });
    }
    // Clear one genuinely earned unwanted cap through the exact-instance vendor interface.
    const unwanted = await p.evaluate(() =>
      window.__mmo.items.find(
        (i) => i.templateId === 'armor.leather.trapper_cap' && i.location.kind === 'container',
      ),
    );
    if (unwanted) {
      await approachNpc('npc.world.greenvale_marches.merchant');
      await p.getByLabel('Sell backpack item').selectOption(unwanted.id);
      await click(p.locator('[data-testid=vendor-sell]'));
      await p.waitForFunction(
        (id) => !window.__mmo.items.some((i) => i.id === id && i.location.kind !== 'destroyed'),
        unwanted.id,
      );
      check('Specific carried gear sold through NPC UI', true);
      await close();
    }
    // A complete loop: gather -> craft real equipment -> sell material -> buy real equipment.
    await gather('material.world.hardwood', 2);
    await gather('material.world.iron_shard', 4);
    await approachNpc('npc.world.greenvale_marches.profession');
    const before = await p.evaluate(
      () =>
        window.__mmo.items.filter(
          (i) => i.templateId === 'weapon.sword.iron_longsword' && i.location.kind !== 'destroyed',
        ).length,
    );
    await click(p.locator('[data-service="service.greenvale.craft_sword"]'));
    await p.waitForFunction(
      (n) =>
        window.__mmo.items.filter(
          (i) => i.templateId === 'weapon.sword.iron_longsword' && i.location.kind !== 'destroyed',
        ).length ===
        n + 1,
      before,
    );
    await close();
    check('Real workshop equipment', true);
    await gather('material.world.iron_shard', 1);
    await approachNpc('npc.world.greenvale_marches.merchant');
    const old = await qty('material.world.iron_shard');
    await click(p.locator('[data-service="service.greenvale.sell_iron_shard"]'));
    await p.waitForFunction(
      (n) =>
        window.__mmo.items
          .filter(
            (i) => i.templateId === 'material.world.iron_shard' && i.location.kind === 'container',
          )
          .reduce((n, i) => n + i.quantity, 0) ===
        n - 1,
      old,
    );
    await p.waitForTimeout(1000);
    const capIds = await p.evaluate(() =>
      window.__mmo.items
        .filter(
          (i) => i.templateId === 'armor.leather.trapper_cap' && i.location.kind !== 'destroyed',
        )
        .map((i) => i.id),
    );
    await click(p.locator('[data-service="service.greenvale.buy_cap"]'));
    await p.waitForFunction(
      (ids) =>
        window.__mmo.items.some(
          (i) =>
            i.templateId === 'armor.leather.trapper_cap' &&
            !ids.includes(i.id) &&
            i.location.kind !== 'destroyed',
        ),
      capIds,
    );
    const bought = await p.evaluate(
      (ids) =>
        window.__mmo.items.find(
          (i) =>
            i.templateId === 'armor.leather.trapper_cap' &&
            !ids.includes(i.id) &&
            i.location.kind !== 'destroyed',
        ),
      capIds,
    );
    check('Vendor sell/buy via actual NPC UI', true);
    await p.getByLabel('Sell backpack item').selectOption(bought.id);
    await click(p.locator('[data-testid=vendor-sell]'));
    await p.waitForFunction(
      (id) => !window.__mmo.items.some((i) => i.id === id && i.location.kind !== 'destroyed'),
      bought.id,
    );
    check('Exact purchased instance can be sold once', true);
    await close();
    await approachNpc('npc.world.greenvale_marches.banker');
    await click(p.locator('[data-testid=banker-vault]'));
    await p.locator('[data-window=bank]').waitFor();
    check('Local banker opens existing real vault', true);
    await p.screenshot({ path: `${OUT}/banker.png` });
    await click(p.getByRole('button', { name: 'Close Bank', exact: true }));
    await click(p.locator('[data-open=world]'));
    check('Persistent discovered atlas labels', (await p.getByText(/Discovered/).count()) > 0);
    await p.screenshot({ path: `${OUT}/discovery.png` });
    await p.keyboard.press('Escape');
    if (touch)
      for (const viewport of [
        { width: 390, height: 844 },
        { width: 844, height: 390 },
      ]) {
        await p.setViewportSize(viewport);
        const box = await p.locator('[data-testid=joystick]').boundingBox();
        check(
          'Touch controls reachable',
          box && box.x >= 0 && box.y + box.height <= viewport.height,
          viewport,
        );
        await p.screenshot({ path: `${OUT}/touch-${viewport.width}.png` });
      }
    if (touch) {
      const old = await p.evaluate(() => window.__mmo.position),
        joy = await p.locator('[data-testid=joystick]').boundingBox(),
        cd = await c.newCDPSession(p);
      await cd.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ x: joy.x + joy.width / 2, y: joy.y + joy.height / 2 }],
      });
      await cd.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: joy.x + joy.width / 2, y: joy.y + 15 }],
      });
      await p.waitForTimeout(1400);
      await cd.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      check(
        'Actual touch joystick moves authoritative player',
        await p.evaluate(
          (o) => Math.hypot(window.__mmo.position.x - o.x, window.__mmo.position.z - o.z) > 0.5,
          old,
        ),
      );
    }
    await enter(p, USER, false);
    if (!SERVICES)
      check(
        'Closure survives relog',
        await p.evaluate(
          () =>
            window.__mmo.quests.find((q) => q.questId === 'quest.greenvale.marches_home')?.state ===
            'completed',
        ),
      );
    check(
      'Crafted equipment survives relog',
      (await p.evaluate(
        () =>
          window.__mmo.items.filter(
            (i) =>
              i.templateId === 'weapon.sword.iron_longsword' && i.location.kind !== 'destroyed',
          ).length,
      )) >=
        before + 1,
    );
    check('No browser exceptions', !errors.length, errors);
  } finally {
    await b.close();
    fs.writeFileSync(`${OUT}/checks.json`, JSON.stringify({ user: USER, checks, errors }, null, 2));
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
