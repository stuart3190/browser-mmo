/* eslint-disable */
// Functional appearance/layout playtest. Fresh level-five fixtures in a disposable qualification DB;
// all gameplay actions use keyboard/touch. No live or earned-character data is changed.
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const { Client } = require('../../packages/db/node_modules/pg');
const { enter, walk } = require('./vertical-slice.cjs');
const fs = require('node:fs');
const out = process.argv[2] || '/tmp/bo-armor';
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
  if (process.env.ARMOR_VISUAL === '1') {
    const db = new Client({ connectionString: url.toString() });
    await db.connect();
    try {
      const { rows } = await db.query(
        "select a.username,c.id from characters c join accounts a on a.id=c.account_id where c.class_id=$1 and a.username like 'armor_%' order by c.created_at desc limit 1",
        [classId],
      );
      if (!rows.length) throw Error('Earned outfitter fixture required');
      return { username: rows[0].username, characterId: rows[0].id };
    } finally {
      await db.end();
    }
  }
  const username = `armor_${Date.now().toString(36)}`;
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
      const context = await browser.newContext({
        viewport: mage ? { width: 844, height: 480 } : { width: 1100, height: 740 },
        hasTouch: mage,
        isMobile: mage,
      });
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
    if (process.env.ARMOR_VISUAL === '1') {
      for (const actor of actors) {
        page = actor.page;
        await page.bringToFront();
        await walk(page, actor.mage ? 266 : 262, 410, 1.3);
        await page.mouse.move(430, 250);
        await page.mouse.wheel(0, -1000);
        await page.waitForTimeout(400);
        await page.screenshot({ path: `${out}/${actor.label}-folded-cloak.png` });
        check(
          `${actor.label} still wears its purchased cloak after visual follow-up login`,
          await page.evaluate(() =>
            window.__mmo.items.some(
              (i) =>
                i.templateId === 'accessory.cloak.wayfarer_cloak' && i.location.kind === 'equipped',
            ),
          ),
        );
      }
      check('No cloak visual exceptions', errors.length === 0, errors);
      fs.writeFileSync(
        `${out}/proof.json`,
        JSON.stringify(
          {
            ok: true,
            fixture:
              'Read-only lookup of earned outfitter actors; actual login/movement/camera wheel, no state grants.',
            checks,
            errors,
          },
          null,
          2,
        ),
      );
      return;
    }
    const warrior = actors[0],
      mage = actors[1];
    const slots = {
      head: 'head',
      chest: 'chest',
      cloak: 'cloak',
      offHand: 'off_hand',
      mainHandTemplateId: 'main_hand',
    };
    const gearFor = (actor) =>
      actor.mage
        ? [
            ['staff', 'Oak Staff', 'weapon.staff.oak_staff', 'mainHandTemplateId'],
            ['robe', 'Apprentice Robe', 'armor.cloth.apprentice_robe', 'chest'],
            ['cloak', "Wayfarer's Cloak", 'accessory.cloak.wayfarer_cloak', 'cloak'],
          ]
        : [
            ['sword', 'Iron Longsword', 'weapon.sword.iron_longsword', 'mainHandTemplateId'],
            ['cap', "Trapper's Cap", 'armor.leather.trapper_cap', 'head'],
            ['breastplate', 'Recruit Breastplate', 'armor.plate.recruit_breastplate', 'chest'],
            ['cloak', "Wayfarer's Cloak", 'accessory.cloak.wayfarer_cloak', 'cloak'],
            ['buckler', 'Oak Buckler', 'armor.shield.oak_buckler', 'offHand'],
          ];
    const click = (actor, locator) => (actor.mage ? locator.tap() : locator.click());
    const expectLook = (p, id, key, value) =>
      p.waitForFunction(
        ({ id, key, value }) => {
          const look = Object.values(window.__looks).find((e) => e.characterId === id)?.appearance;
          return (
            (key === 'mainHandTemplateId' ? look?.mainHandTemplateId : look?.gear?.[key]) === value
          );
        },
        { id, key, value },
      );
    async function close(p) {
      if (await p.getByRole('button', { name: 'Close dialogue', exact: true }).isVisible())
        await p.getByRole('button', { name: 'Close dialogue', exact: true }).click();
      await p.keyboard.press('Escape');
      await p.keyboard.press('Escape');
    }
    async function equip(actor, entry) {
      const p = actor.page;
      await click(actor, p.locator('[data-open=inventory]'));
      await click(actor, p.getByRole('button', { name: entry[1], exact: true }));
      await click(actor, p.locator('[data-action=equip]'));
      await expectLook(p, actor.characterId, entry[3], entry[2]);
      await close(p);
    }
    for (const actor of actors) {
      page = actor.page;
      await page.bringToFront();
      if (actor.mage) await page.locator('[data-testid=touch-interact]').tap();
      else await page.keyboard.press('KeyE');
      await page.waitForFunction(
        () => window.__mmo.dialogue?.npcId === 'npc.world.greenvale_marches.merchant',
      );
      const plateFit = await page
        .locator(
          '[data-offer="service.greenvale.buy_breastplate"] [data-testid=service-equipment-fit]',
        )
        .innerText();
      check(
        `${actor.label} shop explains plate proficiency before buying`,
        actor.mage ? plateFit.includes('cannot use') : plateFit.includes('can use'),
      );
      for (const entry of gearFor(actor)) {
        const buy = page.locator(`[data-service="service.greenvale.buy_${entry[0]}"]`);
        await buy.scrollIntoViewIfNeeded();
        await click(actor, buy);
        await page.waitForFunction(
          (t) => window.__mmo.items.some((i) => i.templateId === t),
          entry[2],
        );
      }
      check(`${actor.label} buys a complete outfit through ordinary merchant stock`, true);
      await page.screenshot({ path: `${out}/${actor.label}-outfitter.png` });
      await close(page);
      for (const entry of gearFor(actor)) await equip(actor, entry);
      const other = actors.find((a) => a !== actor);
      for (const entry of gearFor(actor))
        await expectLook(other.page, actor.characterId, entry[3], entry[2]);
      check(`${actor.label} equipped armour, cloak and held gear reach both clients`, true);
      await walk(page, actor.mage ? 266 : 262, 400, 1.5);
      await page.mouse.move(430, 250);
      await page.mouse.wheel(0, -600);
      await page.waitForTimeout(350);
      await page.screenshot({ path: `${out}/${actor.label}-equipped.png` });
      await walk(page, actor.mage ? 266 : 262, 405, 1.3);
      await page.screenshot({ path: `${out}/${actor.label}-cloak-back.png` });
      await click(actor, page.locator('[data-open=character]'));
      await page.screenshot({ path: `${out}/${actor.label}-character-sheet.png` });
      await close(page);
    }
    page = warrior.page;
    await page.bringToFront();
    for (const entry of gearFor(warrior).filter((e) => e[3] !== 'mainHandTemplateId')) {
      await click(warrior, page.locator('[data-open=character]'));
      await click(warrior, page.locator(`[data-testid="equip-${slots[entry[3]]}"]`));
      await click(warrior, page.locator('[data-action=unequip]'));
      await expectLook(page, warrior.characterId, entry[3], null);
      await expectLook(mage.page, warrior.characterId, entry[3], null);
      await close(page);
    }
    check('Removing armour, cap, cloak and buckler clears every matching remote slot', true);
    await page.screenshot({ path: `${out}/Warrior-base-clothes.png` });
    for (const entry of gearFor(warrior).filter((e) => e[3] !== 'mainHandTemplateId'))
      await equip(warrior, entry);
    for (const actor of actors) {
      page = actor.page;
      await page.bringToFront();
      const ids = await page.evaluate(() =>
        window.__mmo.items
          .filter((i) => i.location.kind === 'equipped')
          .map((i) => i.id)
          .sort(),
      );
      await enter(page, actor.username, false);
      for (const entry of gearFor(actor))
        await expectLook(page, actor.characterId, entry[3], entry[2]);
      check(
        `${actor.label} relogin preserves exact equipped identities and world appearance`,
        await page.evaluate(
          (ids) =>
            JSON.stringify(
              window.__mmo.items
                .filter((i) => i.location.kind === 'equipped')
                .map((i) => i.id)
                .sort(),
            ) === JSON.stringify(ids),
          ids,
        ),
      );
      if (actor.mage) {
        await page.setViewportSize({ width: 390, height: 844 });
        await page.screenshot({ path: `${out}/Mage-portrait.png` });
      }
    }
    check('No equipment appearance gameplay exceptions', errors.length === 0, errors);
    fs.writeFileSync(
      `${out}/proof.json`,
      JSON.stringify(
        {
          ok: true,
          fixture:
            'Fresh level-five characters at Marches merchant. Existing starting copper buys all gear through real UI; actual equip/remove/movement and relogin on two clients. Mage touch controls/screens. No item grants or injected appearance.',
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
