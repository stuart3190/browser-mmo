/* eslint-disable */
// Continues earned Tidewatch actors in the disposable qualification DB. Read-only actor lookup;
// all post-story quests, travel, surveys, encounters and rewards use actual UI and movement.
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const { Client } = require('../../packages/db/node_modules/pg');
const { enter, walk } = require('./vertical-slice.cjs');
const { leaveGroundWarning } = require('./combat-inputs.cjs');
const fs = require('node:fs');
const out = process.argv[2] || '/tmp/bo-aftermath';
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
  const explicit =
    process.env[classId.endsWith('mage') ? 'AFTERMATH_MAGE_USER' : 'AFTERMATH_WARRIOR_USER'];
  if (explicit) return explicit;
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
  const { getGameData, livingSeal, tidewatch, watchAftermath, CollisionWorld, chunkColliders } =
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
    for (const classId of (process.env.AFTERMATH_CLASSES || 'class.warrior,class.mage').split(
      ',',
    )) {
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
      page.on('console', (m) => {
        if (m.type() === 'error') console.log('BROWSER ERROR', m.text(), m.location().url);
      });
      page.on('requestfailed', (r) =>
        console.log('REQUEST FAILED', new URL(r.url()).pathname, r.failure()?.errorText),
      );
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

      check(
        `${label} retains its earned three-watch completion`,
        await page.evaluate(() =>
          window.__mmo.quests.some(
            (q) => q.questId === 'quest.greenvale.three_watches' && q.state === 'completed',
          ),
        ),
      );
      if ((await zone()) !== livingSeal.zoneId)
        throw Error('This visual journey starts at the earned Pinewatch landing');
      await click(page.locator('[data-open=settings]'));
      await click(page.getByRole('button', { name: 'Reset camera view', exact: true }));
      for (const [name, id, z] of [
        ['Pinewatch', 'location.elderwood.port', 4000],
        ['Willow-Quay', 'location.greenvale_marches.port', 96],
        ['Tidewatch', 'location.amber_coast.port', 96],
      ]) {
        await go(256, z - 12);
        await page.screenshot({ path: `${out}/${label}-${name}-ferry.png` });
        if (mage && name === 'Pinewatch') {
          await page.setViewportSize({ width: 390, height: 844 });
          await page.screenshot({ path: `${out}/${label}-Pinewatch-portrait.png` });
          await page.setViewportSize({ width: 844, height: 480 });
        }
        await go(256, z);
        const next =
          name === 'Pinewatch'
            ? 'zone.aurelian.greenvale_marches'
            : name === 'Willow-Quay'
              ? tidewatch.zoneId
              : 'zone.aurelian.greenvale_marches';
        await travel(id, next);
        check(`${label} uses the actual ${name} crossing`, (await zone()) === next);
      }
      await go(256, 96);
      await travel('location.greenvale_marches.port', livingSeal.zoneId);
      check(
        `${label} returns to Pinewatch with equipment and completed story intact`,
        await page.evaluate(
          (item) =>
            window.__mmo.items.filter((i) => i.templateId === item).length === 1 &&
            window.__mmo.quests.some(
              (q) => q.questId === 'quest.greenvale.three_watches' && q.state === 'completed',
            ),
          watchAftermath.compassId,
        ),
      );
      await context.close();
    }
    check('No ferry gameplay exceptions', errors.length === 0, errors);
    fs.writeFileSync(
      `${out}/proof.json`,
      JSON.stringify(
        {
          ok: true,
          checks,
          errors,
          scope:
            'Existing earned actors. Actual shore walking and four ordinary passages per class; no grants, teleports or player-row edits.',
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
