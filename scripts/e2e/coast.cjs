/* eslint-disable */
// New chapter functional playthrough: fresh level-five/prior-story fixtures only in the
// disposable qualification DB. All new quests, travel, surveys, combat and rewards use real UI.
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const { Client } = require('../../packages/db/node_modules/pg');
const { enter, walk } = require('./vertical-slice.cjs');
const { leaveGroundWarning } = require('./combat-inputs.cjs');
const fs = require('node:fs');
const out = process.argv[2] || '/tmp/bo-coast';
fs.mkdirSync(out, { recursive: true });
const checks = [],
  errors = [];
function check(name, ok, detail) {
  checks.push({ name, ok: !!ok, detail });
  console.log(ok ? 'PASS' : 'FAIL', name);
  if (!ok) throw Error(name);
}
async function fixture(classId) {
  const dburl = new URL(process.env.DATABASE_URL);
  if (dburl.hostname !== '127.0.0.1' || dburl.pathname !== '/qualification_dev')
    throw Error('Disposable qualification DB required');
  const username = `coast${classId.endsWith('mage') ? 'm' : 'w'}_${Date.now().toString(36)}`;
  const api = async (path, body, token) => {
    const r = await fetch(process.env.VITE_API_URL + path, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
    if (!r.ok) throw Error(`${path} ${r.status}`);
    return r.json();
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
  const db = new Client({ connectionString: dburl.toString() });
  await db.connect();
  try {
    await db.query('update characters set level=5 where id=$1', [character.id]);
    await db.query(
      "insert into character_quests (character_id,quest_id,status,progress,accepted_at,completed_at,rewarded_at,turn_in_id) values ($1,'quest.greenvale.marches_home','completed','{}',now(),now(),now(),$2)",
      [character.id, require('node:crypto').randomUUID()],
    );
  } finally {
    await db.end();
  }
  return username;
}
(async () => {
  const { getGameData, tidewatch, CollisionWorld, chunkColliders } =
    await import('../../packages/game-data/src/index.ts');
  const { NavGrid } = await import('../../services/world/src/navigation.ts');
  const gd = getGameData(),
    world = gd.raw.worldCatalog;
  const browser = await chromium.launch({
    executablePath: '/usr/bin/google-chrome',
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  let page;
  try {
    for (const classId of (process.env.COAST_CLASSES || 'class.warrior,class.mage').split(',')) {
      const mage = classId.endsWith('mage'),
        label = mage ? 'Mage' : 'Warrior';
      const context = await browser.newContext({
        viewport: mage ? { width: 844, height: 480 } : { width: 1100, height: 740 },
        hasTouch: mage,
        isMobile: mage,
      });
      await context.addInitScript(() => {
        window.__coastEvents = [];
        const WS = WebSocket;
        window.WebSocket = class extends WS {
          constructor(...a) {
            super(...a);
            this.addEventListener('message', (e) => {
              try {
                const m = JSON.parse(e.data);
                if (
                  ['auth.ok', 'combat.damage', 'quest.completed', 'combat.death', 'error'].includes(
                    m.t,
                  )
                )
                  window.__coastEvents.push(m);
              } catch {}
            });
          }
        };
      });
      page = await context.newPage();
      page.setDefaultTimeout(45000);
      page.on('pageerror', (e) => errors.push(e.message));
      const username = await fixture(classId);
      await enter(page, username, false);
      const zone = () =>
        page.evaluate(() => window.__coastEvents.filter((m) => m.t === 'auth.ok').at(-1).d.zoneId);
      const collision = (id) => new CollisionWorld(gd.chunksForZone(id).flatMap(chunkColliders));
      async function go(x, z, range = 1.8) {
        const here = await page.evaluate(() => window.__mmo.position),
          id = await zone(),
          b = gd.zone(id).bounds;
        if (Math.hypot(x - here.x, z - here.z) <= range) return;
        const nav = new NavGrid(
          collision(id),
          {
            minX: Math.max(b.minCx * 64, Math.min(here.x, x) - 16),
            maxX: Math.min((b.maxCx + 1) * 64, Math.max(here.x, x) + 16),
            minZ: Math.max(b.minCz * 64, Math.min(here.z, z) - 16),
            maxZ: Math.min((b.maxCz + 1) * 64, Math.max(here.z, z) + 16),
          },
          2,
        );
        const path = nav.findPath(here, { x, z });
        if (!path) throw Error(`No walk route ${x},${z}`);
        // Keyboard movement is eight-directional: short waypoints track the swept path
        // instead of cutting a long axis-aligned corner across a prop.
        let from = here;
        for (const [index, point] of path.entries()) {
          const steps = Math.max(1, Math.ceil(Math.hypot(point.x - from.x, point.z - from.z) / 2));
          for (let step = 1; step <= steps; step++) {
            const final = index === path.length - 1 && step === steps;
            await walk(
              page,
              from.x + ((point.x - from.x) * step) / steps,
              from.z + ((point.z - from.z) * step) / steps,
              final ? range : 1,
              90000,
            );
          }
          from = point;
        }
      }
      const click = (locator) => (mage ? locator.tap() : locator.click());
      async function close() {
        if (await page.getByRole('button', { name: 'Close dialogue', exact: true }).isVisible())
          await click(page.getByRole('button', { name: 'Close dialogue', exact: true }));
        await page.keyboard.press('Escape');
        await page.keyboard.press('Escape');
      }
      async function talk(npc) {
        let sp;
        for (const ch of gd.raw.chunks) {
          const s = ch.spawnPoints.find((s) => s.refId === npc && s.kind === 'npc');
          if (s) sp = s;
        }
        await go(sp.position.x, sp.position.z, 2);
        if (mage) await page.locator('[data-testid=touch-interact]').tap();
        else await page.keyboard.press('KeyE');
        await page.waitForFunction((id) => window.__mmo.dialogue?.npcId === id, npc);
      }
      async function quest(id, action, npc) {
        await talk(npc);
        await click(page.locator(`[data-quest="${id}"] [data-testid=quest-${action}]`));
        await page.waitForFunction(
          ({ id, action }) =>
            window.__mmo.quests.find((q) => q.questId === id)?.state ===
            (action === 'accept' ? 'active' : 'completed'),
          { id, action },
        );
        await close();
      }
      if (!mage) {
        await go(8, -14);
        await page.keyboard.press('KeyE');
        await page.waitForFunction(() =>
          window.__mmo.items.some((i) => i.templateId === 'weapon.sword.iron_longsword'),
        );
        await page.keyboard.press('KeyB');
        await page.getByRole('button', { name: 'Iron Longsword', exact: true }).click();
        await page.locator('[data-action=equip]').click();
        await page.waitForFunction(() =>
          window.__mmo.items.some((i) => i.location.kind === 'equipped'),
        );
        await close();
      }
      const [crossing, marks, bell] = tidewatch.questIds;
      await quest(crossing, 'accept', 'npc.greenvale.elder_maren');
      check(`${label} accepts Maren’s coastal letter`, true);
      for (const [x, z] of [
        [0, 10],
        [0, 48],
        [0, 86],
        [0, 116],
      ])
        await go(x, z);
      async function travel(fromId, toZone) {
        const route = world.travel.find(
          (t) =>
            t.fromLocationId === fromId &&
            world.locations.find((l) => l.id === t.toLocationId)?.zoneId === toZone,
        );
        await page.waitForFunction(() => !window.__mmo.vitals.inCombat);
        await click(page.locator('[data-open=world]'));
        await click(page.locator(`[data-travel="${route.id}"]`));
        await page.waitForFunction(
          (z) => window.__coastEvents.filter((m) => m.t === 'auth.ok').at(-1).d.zoneId === z,
          toZone,
        );
        await close();
      }
      await travel('location.greenvale.north_gate', 'zone.aurelian.greenvale_marches');
      check(`${label} walks the north road into the Marches`, true);
      await go(256, 96);
      await travel('location.greenvale_marches.port', tidewatch.zoneId);
      check(
        `${label} reaches Amber Coast through two real travel links`,
        (await zone()) === tidewatch.zoneId,
      );
      await quest(crossing, 'turn-in', tidewatch.npcId);
      if (process.env.COAST_COMMISSIONS === '1') {
        await talk(tidewatch.npcId);
        const locked = page.locator(
          `[data-service="service.amber_coast.craft_${mage ? 'staff' : 'sword'}"]`,
        );
        await locked.scrollIntoViewIfNeeded();
        check(
          `${label} commission stays locked before completing the bell story`,
          await locked.isDisabled(),
        );
        await page.screenshot({ path: `${out}/${label}-commission-locked.png` });
        await close();
      }
      await quest(marks, 'accept', tidewatch.npcId);
      await go(304, 136);
      await page.screenshot({ path: `${out}/${label}-shore.png` });
      await go(338, 162);
      async function target(id) {
        for (let i = 0; i < 15; i++) {
          if (await page.evaluate((id) => window.__mmo.target.id === id, id)) return;
          await page.keyboard.press('Tab');
          await page.waitForTimeout(150);
        }
        throw Error('Cannot cycle to target');
      }
      async function fight(refId, boss = false) {
        const enemy = await page.evaluate(
          (ref) =>
            window.__mmo.enemies
              .filter((e) => e.refId === ref && !e.dead)
              .sort((a, b) => {
                const p = window.__mmo.position,
                  A = window.__mmo.entityPos(a.id),
                  B = window.__mmo.entityPos(b.id);
                return Math.hypot(A.x - p.x, A.z - p.z) - Math.hypot(B.x - p.x, B.z - p.z);
              })[0],
          refId,
        );
        if (!enemy) throw Error('Enemy absent ' + refId);
        let pos = await page.evaluate((id) => window.__mmo.entityPos(id), enemy.id);
        await go(pos.x, pos.z - (mage ? 15 : 3), 1.2);
        await target(enemy.id);
        if (!mage) await page.keyboard.press('KeyF');
        let dodge = 0,
          shot = false;
        const until = Date.now() + 120000;
        while (Date.now() < until) {
          const s = await page.evaluate(
            (id) => ({
              enemy: window.__mmo.enemies.find((e) => e.id === id),
              vitals: window.__mmo.vitals,
              pos: window.__mmo.position,
              target: window.__mmo.entityPos(id),
            }),
            enemy.id,
          );
          if (s.vitals.dead) throw Error(label + ' died against ' + refId);
          if (s.enemy?.dead) break;
          if (!s.enemy) throw Error('Lost encounter');
          const use = async (slot, id) => {
            const b = page.locator(`[data-testid="ability-${id}"]`);
            if ((await b.getAttribute('data-ready')) === 'true') {
              if (mage) await b.tap();
              else await page.keyboard.press('Digit' + slot);
              return true;
            }
            return false;
          };
          if (boss && s.enemy.attackCue) {
            if (!mage) await use(4, 'ability.warrior.guard');
            if (!shot) {
              await page.screenshot({ path: `${out}/${label}-bell-warning.png` });
              shot = true;
            }
            if (await leaveGroundWarning(page, s.enemy.attackCue, collision(tidewatch.zoneId)))
              dodge++;
          } else {
            const distance = Math.hypot(s.pos.x - s.target.x, s.pos.z - s.target.z);
            if (!mage && distance > 3.5) await go(s.target.x, s.target.z, 2.5);
            if (mage && distance < 6) await use(4, 'ability.mage.frost_nova');
            await use(2, mage ? 'ability.mage.firebolt' : 'ability.warrior.heavy_strike');
            await use(3, mage ? 'ability.mage.flame_burst' : 'ability.warrior.battle_strike');
          }
          await page.waitForTimeout(150);
        }
        check(
          `${label} defeats ${enemy.name}`,
          await page.evaluate(
            (id) => window.__mmo.enemies.find((e) => e.id === id)?.dead,
            enemy.id,
          ),
          { dodge },
        );
        if (boss) check(`${label} responds to the Bellkeeper warning`, dodge > 0, { dodge });
        await page.keyboard.press('Escape');
      }
      await fight('enemy.amber_coast.glassback_crab');
      await fight('enemy.amber_coast.glassback_crab');
      await quest(marks, 'turn-in', tidewatch.npcId);
      await quest(bell, 'accept', tidewatch.npcId);
      await go(338, 162);
      await go(351, 205);
      await fight('enemy.amber_coast.drowned_bellkeeper', true);
      await quest(bell, 'turn-in', tidewatch.npcId);
      check(
        `${label} completes all three new quests`,
        await page.evaluate(
          (ids) =>
            ids.every(
              (id) => window.__mmo.quests.find((q) => q.questId === id)?.state === 'completed',
            ),
          tidewatch.questIds,
        ),
      );
      const before = await page.evaluate(() => window.__mmo.stats);
      await click(page.locator('[data-open=inventory]'));
      await click(page.getByRole('button', { name: 'Tideglass Seal', exact: true }));
      await click(page.locator('[data-action=equip]'));
      await page.waitForFunction(() =>
        window.__mmo.items.some(
          (i) => i.templateId === 'accessory.ring.tideglass_seal' && i.location.kind === 'equipped',
        ),
      );
      await page.waitForFunction(
        ({ before, mage }) =>
          window.__mmo.stats[mage ? 'intellect' : 'strength'] >
          before[mage ? 'intellect' : 'strength'],
        { before, mage },
      );
      const after = await page.evaluate(() => window.__mmo.stats);
      check(
        `${label} equips its earned seal with real bonuses`,
        after[mage ? 'intellect' : 'strength'] > before[mage ? 'intellect' : 'strength'],
      );
      await close();
      await page.screenshot({ path: `${out}/${label}-chapter-complete.png` });
      await enter(page, username, false);
      check(
        `${label} retains chapter completion after login`,
        await page.evaluate(
          (ids) =>
            ids.every(
              (id) => window.__mmo.quests.find((q) => q.questId === id)?.state === 'completed',
            ),
          tidewatch.questIds,
        ),
      );
      if (process.env.COAST_COMMISSIONS === '1') {
        const type = mage ? 'staff' : 'sword',
          name = mage ? 'Tideglass Staff' : 'Tidewatch Blade';
        const offerId = `service.amber_coast.craft_${type}`,
          template = `weapon.${type}.tidewatch`;
        await talk(tidewatch.npcId);
        const card = page.locator(`[data-offer="${offerId}"]`),
          button = card.locator('[data-service]');
        await button.scrollIntoViewIfNeeded();
        check(
          `${label} earned salvage unlocks its affordable commission`,
          await button.isEnabled(),
        );
        const costBefore = await page.evaluate(() =>
          Object.fromEntries(
            ['material.world.field_hide', 'material.world.iron_shard'].map((t) => [
              t,
              window.__mmo.items
                .filter((i) => i.templateId === t)
                .reduce((n, i) => n + i.quantity, 0),
            ]),
          ),
        );
        check(
          `${label} recipe previews weapon damage and rolled bonuses`,
          (await card.locator('[data-testid=service-output]').innerText()).includes(
            'weapon damage',
          ),
        );
        await page.screenshot({ path: `${out}/${label}-commission-ready.png` });
        await click(button);
        await page.waitForFunction(
          (id) => window.__mmo.systems.jobs.some((j) => j.offerId === id && !j.completed),
          offerId,
        );
        const job = await page.evaluate(
          (id) => window.__mmo.systems.jobs.find((j) => j.offerId === id && !j.completed),
          offerId,
        );
        await close();
        // A real reload leaves the timed craft paid and pending; collect through the ordinary UI.
        await enter(page, username, false);
        await page.waitForFunction(
          (id) => window.__mmo.systems.jobs.some((j) => j.id === id),
          job.id,
        );
        await click(page.locator('[data-open=professions]'));
        const collect = page.locator(`[data-craft-finish="${job.id}"]`);
        await page.waitForFunction(
          (id) => !document.querySelector(`[data-craft-finish="${id}"]`)?.disabled,
          job.id,
        );
        await click(collect);
        await page.waitForFunction(
          (t) => window.__mmo.items.some((i) => i.templateId === t),
          template,
        );
        const costAfter = await page.evaluate(() =>
          Object.fromEntries(
            ['material.world.field_hide', 'material.world.iron_shard'].map((t) => [
              t,
              window.__mmo.items
                .filter((i) => i.templateId === t)
                .reduce((n, i) => n + i.quantity, 0),
            ]),
          ),
        );
        check(
          `${label} craft survives logout and consumes exactly its reserved salvage`,
          costBefore['material.world.field_hide'] - costAfter['material.world.field_hide'] === 2 &&
            costBefore['material.world.iron_shard'] - costAfter['material.world.iron_shard'] === 1,
        );
        await close();
        const statsBefore = await page.evaluate(() => window.__mmo.stats);
        await click(page.locator('[data-open=inventory]'));
        await click(page.getByRole('button', { name, exact: true }));
        await page.screenshot({ path: `${out}/${label}-crafted-weapon.png` });
        await click(page.locator('[data-action=equip]'));
        await page.waitForFunction(
          (t) =>
            window.__mmo.items.some((i) => i.templateId === t && i.location.kind === 'equipped'),
          template,
        );
        await page.waitForFunction(
          ({ mage, before }) =>
            window.__mmo.stats[mage ? 'spell_power' : 'attack_power'] >
            (before[mage ? 'spell_power' : 'attack_power'] ?? 0),
          { mage, before: statsBefore },
        );
        check(`${label} commissioned weapon increases effective combat power`, true);
        await close();
        await go(304, 136);
        await fight('enemy.amber_coast.glassback_crab');
        await page.waitForFunction(
          (t) => window.__mmo.items.find((i) => i.templateId === t)?.durability.current === 99,
          template,
        );
        await enter(page, username, false);
        check(
          `${label} crafted identity, equip and earned wear survive relogin`,
          await page.evaluate(
            (t) =>
              window.__mmo.items.filter((i) => i.templateId === t).length === 1 &&
              window.__mmo.items.some(
                (i) =>
                  i.templateId === t &&
                  i.location.kind === 'equipped' &&
                  i.durability.current === 99,
              ),
            template,
          ),
        );
      }
      await context.close();
    }
    check('No coastal gameplay exceptions', errors.length === 0, errors);
    fs.writeFileSync(
      `${out}/proof.json`,
      JSON.stringify(
        {
          ok: true,
          fixture:
            'Fresh level-five characters with prior Greenvale closure; all new chapter progress earned through actual travel, movement, combat and quest UI. When COAST_COMMISSIONS=1, all crafting materials come from real chapter victories; craft/equip/collection use ordinary UI',
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
      JSON.stringify({ ok: false, error: e.stack, checks, errors }, null, 2),
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
