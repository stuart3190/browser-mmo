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
          if (s.enemy.attackCue) {
            if (!mage) await use(4, 'ability.warrior.guard');
            if (!shot) {
              // Read cue and notice visibility together: a 1.6s windup may end during screenshot capture.
              await page.waitForFunction(
                () => {
                  const m = window.__mmo,
                    target = m.enemies.find((e) => e.id === m.target.id);
                  return (
                    target?.attackCue &&
                    getComputedStyle(document.querySelector('.toasts')).visibility === 'hidden'
                  );
                },
                null,
                { timeout: 8000 },
              );
              check(`${label} ${enemy.name} warning stays clear of notices`, true);
              await page.screenshot({
                path: `${out}/${label}-${refId}-warning.png`,
              });
              shot = true;
            }
            if (await leaveGroundWarning(page, s.enemy.attackCue, collision(await zone()))) dodge++;
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
        if (boss) check(`${label} responds to the Cantor ground warning`, dodge > 0, { dodge });
        await page.keyboard.press('Escape');
      }

      if (await page.getByTestId('respawn').isVisible()) {
        await click(page.getByTestId('respawn'));
        await page.waitForFunction(() => !window.__mmo.vitals.dead);
      }
      const vitals = await page.evaluate(() => window.__mmo.vitals);
      if (vitals.inCombat || vitals.health < vitals.maxHealth) {
        await page.keyboard.press('KeyH');
        const here = await page.evaluate(() => window.__mmo.position);
        const safe = [...gd.zone(await zone()).safeZones].sort(
          (a, b) =>
            Math.hypot(a.center.x - here.x, a.center.z - here.z) -
            Math.hypot(b.center.x - here.x, b.center.z - here.z),
        )[0];
        if (!safe) throw Error('No known camp for ordinary recovery');
        await go(safe.center.x, safe.center.z, 2);
        await page.waitForFunction(
          () =>
            !window.__mmo.vitals.inCombat &&
            window.__mmo.vitals.health >= window.__mmo.vitals.maxHealth - 1,
          null,
          { timeout: 120000 },
        );
        check(`${label} recovers normally at a safe camp before continuing`, true);
      }
      const completed = (id) =>
        page.evaluate(
          (id) => window.__mmo.quests.find((q) => q.questId === id)?.state === 'completed',
          id,
        );
      const active = (id) =>
        page.evaluate(
          (id) =>
            ['active', 'ready_to_turn_in'].includes(
              window.__mmo.quests.find((q) => q.questId === id)?.state,
            ),
          id,
        );
      check(
        `${label} continues the actual completed living-seal story`,
        await completed('quest.elderwood.living_seal'),
      );
      check(
        `${label} retains the correct earned class`,
        await page.evaluate((id) => window.__mmo.abilities.classId === id, classId),
      );
      const epi = watchAftermath.epilogueId;
      if (!(await completed(epi))) {
        check(
          `${label} regional patrols stay locked before returning the oath`,
          await page.evaluate(
            (ids) =>
              ids.every(
                (id) => window.__mmo.quests.find((q) => q.questId === id)?.state === 'unavailable',
              ),
            watchAftermath.patrolIds,
          ),
        );
        if (!(await active(epi))) await quest(epi, 'accept', livingSeal.npcId);
        if ((await zone()) === livingSeal.zoneId) {
          await go(256, 4000);
          await travel('location.elderwood.port', 'zone.aurelian.greenvale_marches');
        }
        if ((await zone()) === 'zone.aurelian.greenvale_marches') {
          await go(256, 376);
          await travel('location.greenvale_marches.starter_gate', 'zone.greenvale.meadows');
        }
        check(
          `${label} brings the oath home through the real ferry and gate`,
          (await zone()) === 'zone.greenvale.meadows',
        );
        await talk('npc.greenvale.elder_maren');
        const reward = page.locator(
          `[data-quest="${epi}"] [data-reward="${watchAftermath.compassId}"]`,
        );
        await click(reward.locator('summary'));
        check(
          `${label} can inspect its usable compass before turn-in`,
          (await reward.innerText()).includes('Your class and level can use this equipment.'),
        );
        await page.screenshot({ path: `${out}/${label}-oath-return.png` });
        await click(page.locator(`[data-quest="${epi}"] [data-testid=quest-turn-in]`));
        await page.waitForFunction(
          (id) => window.__mmo.quests.find((q) => q.questId === id)?.state === 'completed',
          epi,
        );
        await close();
      }
      await page.waitForFunction(
        (id) => window.__mmo.items.filter((i) => i.templateId === id).length === 1,
        watchAftermath.compassId,
      );
      check(
        `${label} earns one permanent compass and opens both regional patrols`,
        await page.evaluate(
          ({ item, ids }) =>
            window.__mmo.items.filter((i) => i.templateId === item).length === 1 &&
            ids.every((id) =>
              ['available', 'active', 'ready_to_turn_in', 'completed'].includes(
                window.__mmo.quests.find((q) => q.questId === id)?.state,
              ),
            ),
          { item: watchAftermath.compassId, ids: watchAftermath.patrolIds },
        ),
      );
      const worn = await page.evaluate(
        (id) =>
          window.__mmo.items.some((i) => i.templateId === id && i.location.kind === 'equipped'),
        watchAftermath.compassId,
      );
      if (!worn) {
        const hp = await page.evaluate(() => window.__mmo.vitals.maxHealth);
        await click(page.locator('[data-open=inventory]'));
        await click(page.getByRole('button', { name: "Watchkeeper's Compass", exact: true }));
        await click(page.locator('[data-action=equip]'));
        await page.waitForFunction(
          (id) =>
            window.__mmo.items.some((i) => i.templateId === id && i.location.kind === 'equipped'),
          watchAftermath.compassId,
        );
        await page.waitForFunction((hp) => window.__mmo.vitals.maxHealth > hp, hp);
        check(
          `${label} compass increases actual maximum health`,
          await page.evaluate((hp) => window.__mmo.vitals.maxHealth > hp, hp),
        );
        await page.screenshot({ path: `${out}/${label}-compass-equipped.png` });
        await close();
      }
      await enter(page, username, false);
      check(
        `${label} conclusion and single equipped compass survive relogin`,
        (await completed(epi)) &&
          (await page.evaluate(
            (id) =>
              window.__mmo.items.filter((i) => i.templateId === id).length === 1 &&
              window.__mmo.items.some((i) => i.templateId === id && i.location.kind === 'equipped'),
            watchAftermath.compassId,
          )),
      );
      for (const [id, kind] of watchAftermath.patrolIds.map((id, i) => [
        id,
        i === 0 ? 'coast' : 'forest',
      ])) {
        const forest = kind === 'forest',
          destination = forest ? livingSeal.zoneId : tidewatch.zoneId,
          npc = forest ? livingSeal.npcId : tidewatch.npcId;
        if ((await zone()) === 'zone.greenvale.meadows') {
          await go(0, 116);
          await travel('location.greenvale.north_gate', 'zone.aurelian.greenvale_marches');
        }
        if ((await zone()) === livingSeal.zoneId && !forest) {
          await go(256, 4000);
          await travel('location.elderwood.port', 'zone.aurelian.greenvale_marches');
        }
        if ((await zone()) === tidewatch.zoneId && forest) {
          await go(256, 96);
          await travel('location.amber_coast.port', 'zone.aurelian.greenvale_marches');
        }
        if ((await zone()) === 'zone.aurelian.greenvale_marches') {
          await go(256, 96);
          await travel('location.greenvale_marches.port', destination);
        }
        if (!(await completed(id))) {
          if (!(await active(id))) {
            await quest(id, 'accept', npc);
            check(
              `${label} ${kind} patrol starts with zero hunt credit`,
              await page.evaluate(
                (id) =>
                  window.__mmo.quests
                    .find((q) => q.questId === id)
                    .objectives.find((o) => o.id === 'clear').current === 0,
                id,
              ),
            );
          }
          for (const [x, z] of forest
            ? [
                [304, 3958],
                [342, 3924],
              ]
            : [
                [304, 136],
                [338, 162],
              ]) {
            if (
              await page.evaluate(
                (id) =>
                  window.__mmo.quests.find((q) => q.questId === id)?.state === 'ready_to_turn_in',
                id,
              )
            )
              break;
            await go(x, z);
            await fight(
              forest ? 'enemy.elderwood.briar_spitter' : 'enemy.amber_coast.glassback_crab',
            );
          }
          await page.waitForFunction(
            (id) => window.__mmo.quests.find((q) => q.questId === id)?.state === 'ready_to_turn_in',
            id,
          );
          const before = await page.evaluate(() => ({
            progress: window.__mmo.progress,
            remedies: window.__mmo.items
              .filter((i) => i.templateId === 'consumable.greenvale.remedy')
              .reduce((n, i) => n + i.quantity, 0),
          }));
          await quest(id, 'turn-in', npc);
          check(
            `${label} ${kind} patrol awards earned XP and one remedy`,
            await page.evaluate(
              ({ before, xp }) => {
                const p = window.__mmo.progress;
                return (
                  (p.level > before.progress.level || p.xp - before.progress.xp === xp) &&
                  window.__mmo.items
                    .filter((i) => i.templateId === 'consumable.greenvale.remedy')
                    .reduce((n, i) => n + i.quantity, 0) ===
                    before.remedies + 1
                );
              },
              { before, xp: gd.quest(id).rewards.xp },
            ),
          );
        }
        await talk(npc);
        const entry = page.locator(`[data-testid=dialogue] [data-quest="${id}"]`);
        check(
          `${label} ${kind} patrol cannot be accepted again immediately`,
          (await entry.getAttribute('data-state')) === 'completed' &&
            (await entry.locator('[data-testid=quest-accept]').count()) === 0,
        );
        const completedAt = await page.evaluate(
          (id) => window.__mmo.quests.find((q) => q.questId === id).completedAt,
          id,
        );
        const timer = entry.getByTestId('quest-repeat');
        await timer.scrollIntoViewIfNeeded();
        check(
          `${label} ${kind} display uses actual completion plus 24 hours`,
          Number(await timer.getAttribute('data-ready-at')) ===
            Date.parse(completedAt) + 86400000 &&
            (await timer.innerText()).includes('Available again'),
        );
        await page.screenshot({ path: `${out}/${label}-${kind}-patrol-rest.png` });
        await close();
      }
      await enter(page, username, false);
      check(
        `${label} both paid patrols retain their completion after login`,
        await page.evaluate(
          (ids) =>
            ids.every(
              (id) => window.__mmo.quests.find((q) => q.questId === id)?.state === 'completed',
            ),
          watchAftermath.patrolIds,
        ),
      );
      await click(page.locator('[data-open=quests]'));
      await click(page.getByRole('tab', { name: 'Completed', exact: true }));
      const rested = page.locator(
        `[data-window=quests] [data-quest="${watchAftermath.patrolIds[1]}"] [data-testid=quest-repeat]`,
      );
      await rested.scrollIntoViewIfNeeded();
      check(
        `${label} journal retains patrol availability information`,
        (await rested.innerText()).includes('Available again'),
      );
      if (mage) await page.setViewportSize({ width: 390, height: 844 });
      await page.screenshot({ path: `${out}/${label}-journal.png` });
      await context.close();
    }
    check('No three-watch journey exceptions', errors.length === 0, errors);
    fs.writeFileSync(
      `${out}/proof.json`,
      JSON.stringify(
        {
          ok: true,
          fixture:
            'Existing earned coastal/forest actors. All new acceptance, return travel, equipment, surveys, victories, turn-ins and relogins use ordinary UI; no player grants or teleports.',
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
