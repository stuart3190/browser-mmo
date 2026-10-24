/* eslint-disable */
// Continues earned Tidewatch actors in the disposable qualification DB. Read-only actor lookup;
// all forest quests, travel, surveys, encounters and rewards use actual UI and movement.
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const { Client } = require('../../packages/db/node_modules/pg');
const { enter, walk } = require('./vertical-slice.cjs');
const { leaveAttackWarning } = require('./combat-inputs.cjs');
const fs = require('node:fs');
const out = process.argv[2] || '/tmp/bo-reward-preview';
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
        viewport: mage ? { width: 390, height: 844 } : { width: 1100, height: 740 },
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
        if (m.type() === 'error') {
          console.log('BROWSER ERROR', m.text());
        }
      });
      page.on('requestfailed', (r) =>
        console.log('REQUEST FAILED', r.url(), r.failure()?.errorText),
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

      if (process.env.REWARD_DIALOGUE_ONLY !== '1') {
        const earnedBefore = await page.evaluate(() =>
          window.__mmo.items
            .map((i) => ({ id: i.id, templateId: i.templateId }))
            .sort((a, b) => a.id.localeCompare(b.id)),
        );
        await click(page.locator('[data-open=quests]'));
        await click(page.getByRole('tab', { name: 'Completed', exact: true }));
        const card = page.locator(
          '[data-window=quests] [data-quest="quest.elderwood.living_seal"]',
        );
        const reward = card.locator('[data-reward="accessory.necklace.heartwood_knot"]');
        await reward.scrollIntoViewIfNeeded();
        const box = await reward.locator('summary').boundingBox();
        check(`${label} reward inspection has a usable hit target`, box.height >= 44, box);
        await click(reward.locator('summary'));
        await reward.locator('[data-testid=reward-output]').scrollIntoViewIfNeeded();
        const text = await reward.innerText();
        check(
          `${label} sees reward base stats and binding`,
          text.includes('Stamina +') &&
            text.includes('Armour +') &&
            text.includes('Binds to your character when received.'),
          text,
        );
        check(
          `${label} sees class fit, health contribution and roll limits`,
          text.includes('Your class and level') &&
            text.includes('maximum health before replacing other gear') &&
            text.includes('Bonus attributes roll on creation') &&
            text.includes('previously earned items are unchanged'),
          text,
        );
        check(
          `${label} reward panel fits the viewport`,
          await reward.evaluate(
            (e) =>
              e.getBoundingClientRect().right <= innerWidth && e.getBoundingClientRect().left >= 0,
          ),
        );
        await page.screenshot({ path: `${out}/${label}-heartwood-preview.png` });
        await click(page.getByRole('tab', { name: /^Available/ }));
        const availableReward = page
          .locator('[data-window=quests] [data-state=available] [data-reward]')
          .first();
        await availableReward.scrollIntoViewIfNeeded();
        const offerId = await availableReward
          .locator('xpath=ancestor::article')
          .getAttribute('data-quest');
        await click(availableReward.locator('summary'));
        check(
          `${label} can inspect a reward before accepting its quest`,
          (await availableReward.locator('[data-testid=reward-output]').isVisible()) &&
            (await page.evaluate(
              (id) => window.__mmo.quests.find((q) => q.questId === id)?.state === 'available',
              offerId,
            )),
        );
        await page.screenshot({ path: `${out}/${label}-available-reward.png` });
        await click(page.getByRole('button', { name: 'Close Quests', exact: true }));
        check(
          `${label} inspecting reward preserves earned item identities`,
          JSON.stringify(earnedBefore) ===
            JSON.stringify(
              await page.evaluate(() =>
                window.__mmo.items
                  .map((i) => ({ id: i.id, templateId: i.templateId }))
                  .sort((a, b) => a.id.localeCompare(b.id)),
              ),
            ),
        );
      }
      // Completed NPC dialogue deliberately omits old rewards. Exercise a real unaccepted
      // opening quest with a fresh ordinary character instead of changing that behavior.
      const newcomer = `reward${mage ? 'm' : 'w'}_${Date.now().toString(36)}`;
      await enter(page, newcomer, true, classId);
      await talk('npc.greenvale.elder_maren');
      const dialogueQuest = page.locator(
        '[data-testid=dialogue] [data-quest="quest.greenvale.wolves_at_the_edge"]',
      );
      const questReward = dialogueQuest.locator('[data-reward="accessory.cloak.wayfarer_cloak"]');
      await questReward.scrollIntoViewIfNeeded();
      await click(questReward.locator('summary'));
      check(
        `${label} opening dialogue exposes reward inspection before acceptance`,
        (await questReward.locator('[data-testid=reward-output]').isVisible()) &&
          (await dialogueQuest.getAttribute('data-state')) === 'available',
      );
      check(
        `${label} dialogue is opaque and hides competing onboarding`,
        await page
          .locator('[data-testid=dialogue]')
          .evaluate(
            (e) =>
              getComputedStyle(e).backgroundColor === 'rgb(23, 38, 32)' &&
              [...document.querySelectorAll('.first-steps,.quest-guide')].every(
                (x) => getComputedStyle(x).display === 'none',
              ),
          ),
      );
      await page.screenshot({ path: `${out}/${label}-dialogue-preview.png` });
      await click(dialogueQuest.locator('[data-testid=quest-accept]'));
      await page.waitForFunction(
        () =>
          window.__mmo.quests.find((q) => q.questId === 'quest.greenvale.wolves_at_the_edge')
            ?.state === 'active',
      );
      check(
        `${label} accepts normally without receiving the reward early`,
        await page.evaluate(
          () => !window.__mmo.items.some((i) => i.templateId === 'accessory.cloak.wayfarer_cloak'),
        ),
      );
      await close();
      await context.close();
    }
    check('No reward-preview gameplay exceptions', errors.length === 0, errors);
    fs.writeFileSync(
      `${out}/proof.json`,
      JSON.stringify(
        {
          ok: true,
          fixture:
            'Read-only lookup of earned Tidewatch actors. Earned level-six actors inspect journal rewards without mutations; fresh ordinary level-one actors inspect and accept the opening quest, receiving no reward early. No direct DB writes.',
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
