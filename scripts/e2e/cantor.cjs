/* eslint-disable */
// Continues earned Tidewatch actors in the disposable qualification DB. Read-only actor lookup;
// all forest quests, travel, surveys, encounters and rewards use actual UI and movement.
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const { Client } = require('../../packages/db/node_modules/pg');
const { enter, walk } = require('./vertical-slice.cjs');
const { leaveAttackWarning } = require('./combat-inputs.cjs');
const fs = require('node:fs');
const out = process.argv[2] || '/tmp/bo-cantor';
fs.mkdirSync(out, { recursive: true });
const checks = [],
  errors = [];
function check(name, ok, detail) {
  checks.push({ name, ok: !!ok, detail });
  console.log(ok ? 'PASS' : 'FAIL', name);
  if (!ok) throw Error(name);
}
async function earnedActor(classId) {
  const url = new URL(process.env.DATABASE_URL);
  if (url.hostname !== '127.0.0.1' || url.pathname !== '/qualification_dev')
    throw Error('Disposable qualification DB required');
  const db = new Client({ connectionString: url.toString() });
  await db.connect();
  try {
    const { rows } = await db.query(
      'select a.username from characters c join accounts a on a.id=c.account_id where c.class_id=$1 and exists(select 1 from item_instances i where i.owner_character_id=c.id and i.template_id=$2) order by c.created_at desc limit 1',
      [classId, `weapon.${classId.endsWith('mage') ? 'staff' : 'sword'}.tidewatch`],
    );
    if (!rows.length) throw Error('Run COAST_COMMISSIONS=1 coast first; earned actor required');
    return rows[0].username;
  } finally {
    await db.end();
  }
}
(async () => {
  const { getGameData, livingSeal, tidewatch, CollisionWorld, chunkColliders } =
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
    for (const classId of (process.env.FOREST_CLASSES || 'class.warrior,class.mage').split(',')) {
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
      const username = await earnedActor(classId);
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
        await go(pos.x, pos.z + 8, 1.2);
        await target(enemy.id);
        await page.waitForFunction(
          (id) => window.__mmo.enemies.find((e) => e.id === id)?.attackCue,
          enemy.id,
        );

        let dodge = 0;
        const seen = new Set(),
          escaped = new Set();
        let named = false;
        const until = Date.now() + 240000;
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
          if (s.enemy.attackCue) {
            if (!mage) await use(4, 'ability.warrior.guard');
            const cue = s.enemy.attackCue;
            named ||= !!cue.name;
            if (!seen.has(cue.name || 'legacy')) {
              seen.add(cue.name || 'legacy');
              await page.screenshot({ path: `${out}/${label}-${cue.name || 'legacy'}.png` });
            }
            const beforeHealth = await page.evaluate(() => window.__mmo.vitals.health);
            await leaveAttackWarning(page, cue, collision(livingSeal.zoneId), { x: 384, z: 3860 });
            await page.waitForTimeout(Math.max(0, cue.endsAtMs - Date.now() + 150));
            if (await page.evaluate((n) => window.__mmo.vitals.health >= n, beforeHealth)) {
              escaped.add(cue.name || 'legacy');
              dodge++;
            }
          } else {
            const distance = Math.hypot(s.pos.x - s.target.x, s.pos.z - s.target.z);
            if (!mage && distance > 3.5) await go(s.target.x, s.target.z, 2.5);
            if (!mage && !(await page.evaluate(() => window.__mmo.target.attacking)))
              await page.keyboard.press('KeyF');
            if (mage && distance < 6) await use(4, 'ability.mage.frost_nova');
            await use(2, mage ? 'ability.mage.firebolt' : 'ability.warrior.heavy_strike');
            await use(3, mage ? 'ability.mage.flame_burst' : 'ability.warrior.battle_strike');
          }
          if (s.vitals.maxHealth - s.vitals.health >= 60) await page.keyboard.press('KeyH');
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
        if (named) {
          check(
            `${label} reads both named attacks`,
            seen.has('Roots Reach') && seen.has('Bough Sweep'),
            [...seen],
          );
          check(
            `${label} escapes both shapes without damage`,
            escaped.has('Roots Reach') && escaped.has('Bough Sweep'),
            [...escaped],
          );
        }
        await page.screenshot({ path: `${out}/${label}-victory.png` });
        await page.keyboard.press('Escape');
        return named;
      }

      check(
        `${label} retains earned chapter gear`,
        await page.evaluate(
          () =>
            window.__mmo.quests.some(
              (q) => q.questId === 'quest.elderwood.living_seal' && q.state === 'completed',
            ) &&
            window.__mmo.items.some(
              (i) =>
                i.templateId === 'accessory.necklace.heartwood_knot' &&
                i.location.kind === 'equipped',
            ),
        ),
      );
      check(`${label} starts in Elderwood`, (await zone()) === livingSeal.zoneId);
      if (process.env.CANTOR_RETURN_ONLY !== '1') {
        // Buy healing through Tamsin if needed, then walk the actual authored path.
        await talk(livingSeal.npcId);
        await click(page.locator('[data-service="service.elderwood.buy_remedy"]'));
        await close();
        await go(304, 3958);
        await go(342, 3924);
        await go(374, 3878);
        const ref = 'enemy.elderwood.rootbound_cantor';
        async function awaitBoss() {
          await page.waitForFunction(
            (ref) => window.__mmo.enemies.some((e) => e.refId === ref && !e.dead),
            ref,
            { timeout: 100000 },
          );
        }
        await awaitBoss();
        if (!(await fight(ref, true))) {
          console.log(
            'Legacy encounter defeated; waiting for its normal respawn to use the new authored song.',
          );
          await go(374, 3878);
          await awaitBoss();
          check(
            `${label} encounters the authored song after normal respawn`,
            await fight(ref, true),
          );
        }
        await go(374, 3878);
        await go(342, 3924);
        await go(304, 3958);
        await go(270, 3988);
      }
      await page.waitForFunction(
        () =>
          !window.__mmo.vitals.inCombat &&
          window.__mmo.vitals.health === window.__mmo.vitals.maxHealth,
      );
      await enter(page, username, false);
      check(
        `${label} returns alive with earned gear after relogin`,
        await page.evaluate(
          () =>
            !window.__mmo.vitals.dead &&
            window.__mmo.items.some(
              (i) =>
                i.templateId === 'accessory.necklace.heartwood_knot' &&
                i.location.kind === 'equipped',
            ),
        ),
      );
      await page.screenshot({ path: `${out}/${label}-camp.png` });
      await context.close();
    }
    check('No encounter gameplay exceptions', errors.length === 0, errors);
    fs.writeFileSync(
      `${out}/proof.json`,
      JSON.stringify(
        {
          ok: true,
          fixture:
            'Read-only lookup of earned Tidewatch actors. Existing earned level-six actors; normal purchases, walking, combat and respawns only. No item, quest, position or checkpoint writes.',
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
      JSON.stringify(
        {
          ok: false,
          error: e.stack,
          checks,
          errors,
          state: await page.evaluate(() => ({
            position: window.__mmo?.position,
            progress: window.__mmo?.progress,
            vitals: window.__mmo?.vitals,
          })),
        },
        null,
        2,
      ),
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
