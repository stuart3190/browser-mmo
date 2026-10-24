/* eslint-disable */
// Real progression inputs only. NavGrid chooses walking waypoints, not teleports or client claims.
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const { enter, walk } = require('./vertical-slice.cjs');
const { equipEarned } = require('./earned-equipment.cjs');
const { leaveGroundWarning } = require('./combat-inputs.cjs');
const fs = require('node:fs');
const OUT = process.argv[2] || '/tmp/bo-trailwear';
fs.mkdirSync(OUT, { recursive: true });
const CREATE = !process.env.TRAIL_USER;

const CLASS = process.env.TRAIL_CLASS || 'class.warrior';
if (!['class.warrior', 'class.mage'].includes(CLASS)) throw Error('Unsupported journey class');
const USER =
  process.env.TRAIL_USER || `trail${CLASS.endsWith('mage') ? 'm' : 'w'}_${Date.now().toString(36)}`;
const checks = [];
function check(name, ok, detail) {
  checks.push({ name, ok: !!ok, detail });
  console.log(ok ? 'PASS' : 'FAIL', name, detail || '');
  fs.writeFileSync(
    `${OUT}/checks.json`,
    JSON.stringify({ ok: false, user: USER, classId: CLASS, checks }, null, 2),
  );
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
    const origin = await p.evaluate(() => window.__mmo.position);
    const distance = Math.hypot(x - origin.x, z - origin.z);
    const started = Date.now();
    const budget = Math.max(120000, distance * 400);
    for (let n = 0; n < Math.ceil(distance / 60) + 12; n++) {
      if (Date.now() - started > budget) throw Error(`Route deadline ${x},${z}`);
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
        clearance,
      );
      const path = nav.findPath(pos, goal);
      if (!path) throw Error('No walkable route ' + x + ',' + z);
      for (const pt of path) {
        const here = await p.evaluate(() => window.__mmo.position);
        try {
          // Eight-direction keyboard steering follows short segments of the verified path.
          const hops = Math.max(1, Math.ceil(Math.hypot(pt.x - here.x, pt.z - here.z) / 2));
          for (let hop = 1; hop <= hops; hop++)
            await walk(
              p,
              here.x + ((pt.x - here.x) * hop) / hops,
              here.z + ((pt.z - here.z) * hop) / hops,
              Math.min(range, 1.0),
              10000,
            );
        } catch (e) {
          if (!e.message.startsWith('Walk deadline')) throw e;
          console.log('REPATH', JSON.stringify({ from: here, waypoint: pt, clearance }));
          await p.screenshot({ path: `${OUT}/route-retry.png` });
          clearance = Math.min(5, clearance + 0.5);
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
    console.log(
      'NPC approach',
      id,
      await p.evaluate(() => ({
        position: window.__mmo.position,
        connected: window.__mmo.connected,
      })),
    );
    const t = npcPosition(id);
    await sameZone(t.zoneId);
    await go(t.x, t.z, 3);
    console.log(
      'NPC interact',
      id,
      await p.evaluate(() => ({
        position: window.__mmo.position,
        prompt: document.querySelector('.prompt')?.textContent,
        connected: window.__mmo.connected,
      })),
    );
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
    while (await p.locator('.window-header .icon-button:visible').count())
      await click(p.locator('.window-header .icon-button:visible').first());
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
    if ((await qty(id)) >= quantity) return;
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
      for (let i = 0; i < 720; i++) {
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
        if (await leaveGroundWarning(p, e.attackCue, gd.collisionWorld(await zone()))) {
          await p.waitForTimeout(200);
          continue;
        }
        const ep = await p.evaluate((id) => window.__mmo.entityPos(id), e.id);
        await go(ep.x, ep.z, CLASS === 'class.mage' ? 18 : 3);
        if (!state.target.attacking) {
          if (touch) await p.locator('[data-testid=touch-attack]').tap();
          else await p.keyboard.press('KeyF');
        }
        for (const id of gd.classes
          .get(CLASS)
          .baseAbilityIds.filter((id) => id !== 'ability.common.attack')) {
          const button = p.locator(`[data-testid="ability-${id}"]`);
          if ((await button.isEnabled()) && (await button.getAttribute('data-ready')) === 'true')
            await click(button);
        }
        await p.waitForTimeout(250);
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
    await enter(p, USER, CREATE, CLASS);
    fs.writeFileSync(
      `${OUT}/actor.json`,
      JSON.stringify({ username: USER, classId: CLASS, created: CREATE }),
    );
    if (CLASS === 'class.warrior') {
      if (
        !(await p.evaluate(() =>
          window.__mmo.items.some((i) => i.templateId === 'weapon.sword.iron_longsword'),
        ))
      ) {
        await go(8, -14);
        await interact();
        await p.waitForFunction(() =>
          window.__mmo.items.some((i) => i.templateId === 'weapon.sword.iron_longsword'),
        );
      }
      const sword = await p.evaluate(() =>
        window.__mmo.items.find((i) => i.templateId === 'weapon.sword.iron_longsword'),
      );
      if (sword.location.kind !== 'equipped') {
        await click(p.locator('[data-open=inventory]'));
        await click(p.locator(`[data-item-id="${sword.id}"]`));
        await click(p.locator('[data-action=equip]'));
        await p.waitForFunction(
          (id) => window.__mmo.items.find((i) => i.id === id)?.location.kind === 'equipped',
          sword.id,
        );
        await close();
      }
      check('Fresh warrior takes and equips the actual starter sword', true);
    }
    const questId = 'quest.greenvale.marches_remedy',
      npc = 'npc.world.greenvale_marches.profession';
    const expected =
      CLASS === 'class.mage' ? 'armor.cloth.apprentice_robe' : 'armor.leather.trapper_cap';
    const def = gd.quest(questId);
    const complete = await p.evaluate(
      (q) => window.__mmo.quests.find((x) => x.questId === q)?.state === 'completed',
      questId,
    );
    if (!complete) {
      await approachNpc(npc);
      const offer = p.locator(`[data-testid=dialogue] [data-quest="${questId}"]`);
      const reward = offer.locator(`[data-reward="${expected}"]`);
      await reward.scrollIntoViewIfNeeded();
      await click(reward.locator('summary'));
      check(
        'Quest offers usable class-appropriate trailwear',
        (await reward.innerText()).includes('Your class and level can use this equipment.') &&
          (await p.evaluate(
            ({ questId, expected }) =>
              window.__mmo.quests.find((q) => q.questId === questId).rewards.items[0]
                .itemTemplateId === expected,
            { questId, expected },
          )),
      );
      await p.screenshot({ path: `${OUT}/class-offer.png` });
      if (await offer.locator('[data-testid=quest-accept]').count())
        await click(offer.locator('[data-testid=quest-accept]'));
      await close();
      if (!complete) {
        for (const o of def.objectives) await gather(o.itemTemplateId, o.count);
        await p.waitForFunction(
          (q) => window.__mmo.quests.find((x) => x.questId === q)?.state === 'ready_to_turn_in',
          questId,
        );
        check('Actual hunts and herb gathering satisfy both objectives', true);
        await questAction(questId, 'turn-in');
        await p.waitForFunction(
          (q) => window.__mmo.quests.find((x) => x.questId === q)?.state === 'completed',
          questId,
        );
      }
    }
    const items = await p.evaluate(
      (t) => window.__mmo.items.filter((i) => i.templateId === t),
      expected,
    );
    check('Quest grants exactly one class-appropriate item', items.length === 1, items);
    const item = items[0];
    if (item.location.kind !== 'equipped') {
      await click(p.locator('[data-open=inventory]'));
      await click(p.locator(`[data-item-id="${item.id}"]`));
      await click(p.locator('[data-action=equip]'));
      await p.waitForFunction(
        (id) => window.__mmo.items.find((i) => i.id === id)?.location.kind === 'equipped',
        item.id,
      );
      await close();
    }
    await click(p.locator('[data-open=character]'));
    await click(p.locator(`[data-testid="equip-${CLASS === 'class.mage' ? 'chest' : 'head'}"]`));
    await p.locator('[data-testid=item-details]').waitFor();
    await p.screenshot({ path: `${OUT}/earned-trailwear.png` });
    if (!touch) {
      await click(p.locator('[data-open=inventory]'));
      await click(p.locator('[data-window=character] .window-header .icon-button'));
      check(
        'Item details remain while another item window is open',
        await p.locator('[data-testid=item-details]').isVisible(),
      );
      await click(p.getByRole('button', { name: 'Close Inventory', exact: true }));
    } else await click(p.locator('[data-window=character] .window-header .icon-button'));
    check(
      'Closing the final item window dismisses its details card',
      !(await p.locator('[data-testid=item-details]').isVisible()),
    );
    check(
      'Reward equips through ordinary inventory controls',
      await p.evaluate(
        (id) => window.__mmo.items.find((i) => i.id === id)?.location.kind === 'equipped',
        item.id,
      ),
    );
    await approachNpc(npc);
    check(
      'Item details do not obscure the next NPC conversation',
      !(await p.locator('[data-testid=item-details]').isVisible()),
    );
    await p.screenshot({ path: `${OUT}/clear-dialogue.png` });
    await close();
    await enter(p, USER, false);
    check(
      'Relogin retains the earned item and completed quest',
      await p.evaluate(
        ({ id, q }) =>
          window.__mmo.items.some((i) => i.id === id && i.location.kind === 'equipped') &&
          window.__mmo.quests.find((x) => x.questId === q)?.state === 'completed',
        { id: item.id, q: questId },
      ),
    );
    await p.screenshot({ path: `${OUT}/relogin.png` });
    check('No gameplay exceptions', errors.length === 0, errors);
    fs.writeFileSync(
      `${OUT}/proof.json`,
      JSON.stringify(
        {
          ok: true,
          username: USER,
          classId: CLASS,
          checks,
          errors,
          fixture:
            'Fresh ordinary level-one character; real starter pickup, walking, travel, combat, gathering, quest turn-in, equipment and relogin. No direct DB writes, grants, teleports or XP injection.',
        },
        null,
        2,
      ),
    );
  } catch (e) {
    fs.writeFileSync(
      `${OUT}/failure.json`,
      JSON.stringify(
        {
          ok: false,
          error: e.stack,
          checks,
          errors,
          username: USER,
          state: await p.evaluate(() => ({
            position: window.__mmo?.position,
            progress: window.__mmo?.progress,
            vitals: window.__mmo?.vitals,
          })),
        },
        null,
        2,
      ),
    );
    await p.screenshot({ path: `${OUT}/failure.png` }).catch(() => {});
    throw e;
  } finally {
    await b.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
