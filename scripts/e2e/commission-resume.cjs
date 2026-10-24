/* eslint-disable */
// Resume the earned Mage from a failed assertion in the disposable coastal playthrough.
// No character, item or quest writes; all remaining gameplay uses the actual UI.
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const { Client } = require('../../packages/db/node_modules/pg');
const { enter, walk } = require('./vertical-slice.cjs');
const { leaveGroundWarning } = require('./combat-inputs.cjs');
const fs = require('node:fs');
const out = process.argv[2];
fs.mkdirSync(out, { recursive: true });
const checks = [],
  errors = [];
function check(name, ok, detail) {
  checks.push({ name, ok: !!ok, detail });
  console.log(ok ? 'PASS' : 'FAIL', name);
  if (!ok) throw Error(name);
}
(async () => {
  const url = new URL(process.env.DATABASE_URL);
  if (url.hostname !== '127.0.0.1' || url.pathname !== '/qualification_dev')
    throw Error('Disposable fixture required');
  const db = new Client({ connectionString: url.toString() });
  await db.connect();
  const { rows } = await db.query(
    "select a.username, c.id from characters c join accounts a on a.id=c.account_id where c.class_id='class.mage' and exists(select 1 from item_instances i where i.owner_character_id=c.id and i.template_id='weapon.staff.tidewatch')",
  );
  await db.end();
  if (rows.length !== 1) throw Error('Exactly one earned Mage fixture required');
  const username = rows[0].username;
  const { getGameData, tidewatch, CollisionWorld, chunkColliders } =
    await import('../../packages/game-data/src/index.ts');
  const { NavGrid } = await import('../../services/world/src/navigation.ts');
  const gd = getGameData(),
    world = gd.raw.worldCatalog,
    mage = true,
    label = 'Mage';
  const browser = await chromium.launch({
    executablePath: '/usr/bin/google-chrome',
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const context = await browser.newContext({
    viewport: { width: 844, height: 480 },
    hasTouch: true,
    isMobile: true,
  });
  await context.addInitScript(() => {
    window.__coastEvents = [];
    const WS = WebSocket;
    window.WebSocket = class extends WS {
      constructor(...args) {
        super(...args);
        this.addEventListener('message', (e) => {
          try {
            const m = JSON.parse(e.data);
            if (m.t === 'auth.ok') window.__coastEvents.push(m);
          } catch {}
        });
      }
    };
  });
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  page.on('pageerror', (e) => errors.push(e.message));
  try {
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
        await page.evaluate((id) => window.__mmo.enemies.find((e) => e.id === id)?.dead, enemy.id),
        { dodge },
      );
      if (boss) check(`${label} responds to the Bellkeeper warning`, dodge > 0, { dodge });
      await page.keyboard.press('Escape');
    }

    const template = 'weapon.staff.tidewatch';
    check(
      'Resumed Mage has its earned quest completion and exactly one commissioned staff',
      await page.evaluate(
        (t) =>
          window.__mmo.quests.find((q) => q.questId === 'quest.amber_coast.last_bell')?.state ===
            'completed' && window.__mmo.items.filter((i) => i.templateId === t).length === 1,
        template,
      ),
    );
    await click(page.locator('[data-open=character]'));
    await click(page.locator('[data-testid=equip-main_hand]'));
    await click(page.locator('[data-action=unequip]'));
    await page.waitForFunction(
      (t) => window.__mmo.items.some((i) => i.templateId === t && i.location.kind === 'container'),
      template,
    );
    await page.waitForFunction(() => !(window.__mmo.stats.spell_power > 0));
    const before = await page.evaluate(() => window.__mmo.stats.spell_power ?? 0);
    await close();
    await click(page.locator('[data-open=inventory]'));
    await click(page.getByRole('button', { name: 'Tideglass Staff', exact: true }));
    await click(page.locator('[data-action=equip]'));
    await page.waitForFunction((before) => (window.__mmo.stats.spell_power ?? 0) > before, before);
    check('Mage staff raises effective spell power from the absent-stat zero baseline', true, {
      before,
      after: await page.evaluate(() => window.__mmo.stats.spell_power),
    });
    await close();
    await click(page.locator('[data-open=character]'));
    check(
      'Character maximum health matches the authoritative vitals',
      await page
        .locator('[data-testid=effective-health]')
        .innerText()
        .then(async (t) =>
          t.includes(String(await page.evaluate(() => window.__mmo.vitals.maxHealth))),
        ),
    );
    await page.screenshot({ path: `${out}/Mage-equipped-stats.png` });
    await close();
    await go(304, 136);
    await fight('enemy.amber_coast.glassback_crab');
    await page.waitForFunction(
      (t) => window.__mmo.items.find((i) => i.templateId === t)?.durability.current === 99,
      template,
    );
    await page.screenshot({ path: `${out}/Mage-staff-victory.png` });
    await enter(page, username, false);
    check(
      'Earned staff identity, equipped slot and victory wear survive relogin',
      await page.evaluate(
        (t) =>
          window.__mmo.items.filter((i) => i.templateId === t).length === 1 &&
          window.__mmo.items.some(
            (i) =>
              i.templateId === t && i.location.kind === 'equipped' && i.durability.current === 99,
          ),
        template,
      ),
    );
    check('No resumed gameplay exceptions', errors.length === 0, errors);
    fs.writeFileSync(
      `${out}/proof.json`,
      JSON.stringify(
        {
          ok: true,
          fixture:
            'Unmodified earned Mage resumed from iaQjr4; original chapter and craft proof retained, original sparse-stat assertion failure retained. Only read-only DB lookup; real UI unequip/equip, victory/wear/relogin.',
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
      JSON.stringify({ error: e.stack, checks, errors }, null, 2),
    );
    await page.screenshot({ path: `${out}/failure.png` }).catch(() => {});
    throw e;
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
