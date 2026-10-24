/* eslint-disable */
// Functional appearance/layout playtest. Fresh level-five fixtures in a disposable qualification DB;
// all gameplay actions use keyboard/touch. No live or earned-character data is changed.
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const { Client } = require('../../packages/db/node_modules/pg');
const { enter, walk } = require('./vertical-slice.cjs');
const fs = require('node:fs');
const out = process.argv[2] || '/tmp/bo-appearance';
fs.mkdirSync(out, { recursive: true });
const checks = [],
  errors = [];
function check(name, ok, detail) {
  checks.push({ name, ok: !!ok, detail });
  if (!ok) throw Error(name);
  console.log('PASS', name);
}
async function fixture(classId) {
  const url = new URL(process.env.DATABASE_URL);
  if (url.hostname !== '127.0.0.1' || url.pathname !== '/qualification_dev')
    throw Error('Disposable local qualification DB required');
  const username = `looks_${Date.now().toString(36)}`;
  const api = async (path, body, token) => {
    const response = await fetch(process.env.VITE_API_URL + path, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw Error(`${path}: ${response.status}`);
    return response.json();
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
  const db = new Client({ connectionString: url.toString() });
  await db.connect();
  try {
    await db.query('update characters set level=5,zone_id=$2,pos_x=264,pos_z=402 where id=$1', [
      character.id,
      'zone.aurelian.greenvale_marches',
    ]);
  } finally {
    await db.end();
  }
  return { username, characterId: character.id };
}
(async () => {
  const { getGameData } = await import('../../packages/game-data/src/index.ts');
  const gd = getGameData();
  const browser = await chromium.launch({
    executablePath: '/usr/bin/google-chrome',
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  let page;
  const actors = [];
  try {
    for (const mage of [false, true]) {
      const context = await browser.newContext({ viewport: { width: 1100, height: 740 } });
      await context.addInitScript(() => {
        window.__looks = {};
        window.__zone = null;
        const WS = WebSocket;
        window.WebSocket = class extends WS {
          constructor(...args) {
            super(...args);
            this.addEventListener('message', (e) => {
              try {
                const m = JSON.parse(e.data);
                if (m.t === 'auth.ok') window.__zone = m.d.zoneId;
                if (m.t === 'zone.snapshot')
                  window.__looks = Object.fromEntries(m.d.entities.map((e) => [e.id, e]));
                if (m.t === 'entity.spawn') window.__looks[m.d.entity.id] = m.d.entity;
                if (m.t === 'entity.despawn') delete window.__looks[m.d.entityId];
              } catch {}
            });
          }
        };
      });
      page = await context.newPage();
      page.setDefaultTimeout(30000);
      page.on('pageerror', (e) => errors.push(e.message));
      const actor = {
        ...(await fixture(mage ? 'class.mage' : 'class.warrior')),
        page,
        context,
        mage,
        label: mage ? 'Mage' : 'Warrior',
        template: mage ? 'weapon.staff.oak_staff' : 'weapon.sword.iron_longsword',
        itemName: mage ? 'Oak Staff' : 'Iron Longsword',
      };
      actors.push(actor);
      await enter(page, actor.username, false);
    }
    const appearance = (p, id) =>
      p.evaluate(
        (id) => Object.values(window.__looks).find((e) => e.characterId === id)?.appearance,
        id,
      );
    const expectLook = (p, id, mainHand) =>
      p.waitForFunction(
        ({ id, mainHand }) =>
          Object.values(window.__looks).find((e) => e.characterId === id)?.appearance
            ?.mainHandTemplateId === mainHand,
        { id, mainHand },
      );
    async function close(p) {
      if (await p.getByRole('button', { name: 'Close dialogue', exact: true }).isVisible())
        await p.getByRole('button', { name: 'Close dialogue', exact: true }).click();
      await p.keyboard.press('Escape');
      await p.keyboard.press('Escape');
    }
    async function equip(actor) {
      const p = actor.page;
      await p.locator('[data-open=inventory]').click();
      await p.getByRole('button', { name: actor.itemName, exact: true }).click();
      await p.locator('[data-action=equip]').click();
      await expectLook(p, actor.characterId, actor.template);
      await close(p);
    }
    for (const actor of actors) {
      page = actor.page;
      await page.keyboard.press('KeyE');
      await page.waitForFunction(
        () => window.__mmo.dialogue?.npcId === 'npc.world.greenvale_marches.merchant',
      );
      await page
        .locator(`[data-service="service.greenvale.buy_${actor.mage ? 'staff' : 'sword'}"]`)
        .click();
      await page.waitForFunction(
        (t) => window.__mmo.items.some((i) => i.templateId === t),
        actor.template,
      );
      await close(page);
      await equip(actor);
    }
    for (const actor of actors) {
      const other = actors.find((a) => a !== actor);
      await expectLook(other.page, actor.characterId, actor.template);
      check(
        `${actor.label} equipped weapon is replicated to the other player`,
        (await appearance(other.page, actor.characterId)).mainHandTemplateId === actor.template,
      );
    }
    for (const actor of actors) {
      page = actor.page;
      await walk(page, 256, 376);
      await page.waitForFunction(() => !window.__mmo.vitals.inCombat);
      const route = gd.raw.worldCatalog.travel.find(
        (t) => t.fromLocationId === 'location.greenvale_marches.starter_gate',
      );
      await page.locator('[data-open=world]').click();
      await page.locator(`[data-travel="${route.id}"]`).click();
      await page.waitForFunction(() => window.__zone === 'zone.greenvale.meadows');
      await close(page);
      for (const z of [86, 48, 10]) await walk(page, 0, z);
      await walk(page, -6, 6, 2);
      await page.keyboard.press('KeyE');
      await page.waitForFunction(
        () => window.__mmo.dialogue?.npcId === 'npc.greenvale.elder_maren',
      );
      await page.locator('[data-testid=specialisation-choices] summary').click();
      await page
        .locator(
          `[data-specialisation="${actor.mage ? 'spec.mage.fire' : 'spec.warrior.guardian'}"]`,
        )
        .click();
      await page.waitForFunction(
        ({ id, spec }) =>
          Object.values(window.__looks).find((e) => e.characterId === id)?.appearance
            ?.specialisationId === spec,
        { id: actor.characterId, spec: actor.mage ? 'spec.mage.fire' : 'spec.warrior.guardian' },
      );
      await close(page);
      await walk(page, actor.mage ? 3 : -1, 2);
    }
    for (const actor of actors) {
      const other = actors.find((a) => a !== actor);
      await expectLook(other.page, actor.characterId, actor.template);
      check(
        `${actor.label} class and trained path are visible to nearby players`,
        (await appearance(other.page, actor.characterId)).specialisationId ===
          (actor.mage ? 'spec.mage.fire' : 'spec.warrior.guardian'),
      );
    }
    const mage = actors[1],
      warrior = actors[0];
    page = mage.page;
    await page.locator('[data-open=character]').click();
    await page.locator('[data-testid=equip-main_hand]').click();
    await page.locator('[data-action=unequip]').click();
    await expectLook(warrior.page, mage.characterId, null);
    await expectLook(page, mage.characterId, null);
    check('Unequipping staff removes it from both clients', true);
    await close(page);
    await equip(mage);
    await expectLook(warrior.page, mage.characterId, mage.template);
    for (const actor of actors) {
      page = actor.page;
      await page.mouse.move(730, 380);
      await page.mouse.wheel(0, -1000);
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${out}/${actor.label}-party.png` });
    }
    await enter(mage.page, mage.username, false);
    await expectLook(mage.page, mage.characterId, mage.template);
    await expectLook(warrior.page, mage.characterId, mage.template);
    check(
      'Relogin restores the same Mage outfit and equipped staff',
      (await appearance(mage.page, mage.characterId)).specialisationId === 'spec.mage.fire',
    );
    await mage.page.setViewportSize({ width: 390, height: 844 });
    await mage.page.screenshot({ path: `${out}/Mage-portrait.png` });
    check('No multiplayer appearance exceptions', errors.length === 0, errors);
    fs.writeFileSync(
      `${out}/proof.json`,
      JSON.stringify(
        {
          ok: true,
          fixture:
            'Fresh level-five characters at Marches merchant. Gear bought and equipped through UI, ordinary travel/walking, real mentor choices; no item grants or injected appearance.',
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
    await page?.screenshot({ path: `${out}/failure.png` }).catch(() => {});
    throw e;
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
