/* eslint-disable */
// Browser E2E for the first quest loop ("Wolves at the Edge").
//
// Usage (with `pnpm dev` running against the migrated dev database):
//   node scripts/e2e/quest.cjs <output-dir>
// Desktop 1400x900: walk to Elder Maren, E to talk, accept, hunt real wolves until the server
// reports 5 kills + 3 looted pelts, socket drop + page reload keep progress, walk back, turn in,
// rewards shown, quest log Completed, PostgreSQL == UI. Phone 390x844: Talk/Accept/Complete by
// touch, tracker layout (kill progress is scaffolded through recorded kill events).
const { chromium } = require(
  process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright',
);
const { execSync } = require('child_process');
const fs = require('fs');
const OUT = process.argv[2] || '.';
fs.mkdirSync(OUT, { recursive: true });
const API = process.env.API_URL || 'http://localhost:4000';
const WEB = process.env.WEB_URL || 'http://localhost:5173';
const DB = process.env.DATABASE_URL || 'postgres://mmo:mmo@localhost:5432/mmo_dev';
const results = [];
const check = (name, ok, extra = '') => {
  results.push({ name, ok: !!ok, extra });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ` (${extra})` : ''}`);
};
const sql = (q) =>
  execSync(`psql ${DB} -tAc "${q.replace(/"/g, '\\"')}"`)
    .toString()
    .trim();
const api = async (method, path, token, body) => {
  const r = await fetch(API + path, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, json: await r.json().catch(() => null) };
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const letters = (s) => s.replace(/[0-9]/g, (d) => 'abcdefghij'[Number(d)]);

let adminToken;
async function newPlayer(prefix, pos, { sword = true } = {}) {
  const suffix = Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
  const username = `${prefix}_${suffix}`;
  const token = (await api('POST', '/v1/auth/dev-login', null, { username, client: 'tool' })).json
    .token;
  const name = letters(`${prefix}${suffix}`).slice(0, 20);
  const ch = (await api('POST', '/v1/characters', token, { name, classId: 'class.warrior' })).json
    .character;
  sql(`update characters set pos_x=${pos.x}, pos_z=${pos.z}, rotation_y=0 where id='${ch.id}'`);
  if (sword) {
    const s = (
      await api('POST', '/v1/admin/items/grant', adminToken, {
        characterId: ch.id,
        templateId: 'weapon.sword.iron_longsword',
        quantity: 1,
        rarityId: 'epic',
        reason: 'world e2e',
      })
    ).json.item;
    await api('POST', `/v1/characters/${ch.id}/items/move`, token, {
      itemInstanceId: s.instance.id,
      expectedVersion: s.instance.version,
      to: { kind: 'equipped', slotId: 'main_hand' },
    });
  }
  return { username, token, name, characterId: ch.id };
}

async function enter(page, p) {
  await page.goto(WEB);
  await page.fill('input[name=username]', p.username);
  await page.click('#login-form button');
  await page.click(`#char-list button:has-text("${p.name}")`);
  await page.waitForFunction(
    () => window.__mmo && window.__mmo.connected && window.__mmo.vitals && window.__mmo.position,
    null,
    { timeout: 30000 },
  );
  await sleep(500);
}
const pos = (page) => page.evaluate(() => window.__mmo.position);
const corrections = (page) =>
  page.evaluate(
    () =>
      [...document.querySelectorAll('[data-testid=log] div')].filter((d) =>
        d.textContent.includes('Position corrected'),
      ).length,
  );
const liveWolves = (page) => page.evaluate(() => window.__mmo.enemies.filter((e) => !e.dead));

/** Walks (camera-relative WASD with the default camera yaw: W=+z, D=+x) until near the target. */
async function approach(page, id, stopAt = 2.0, timeout = 20000) {
  const t0 = Date.now();
  let last = null;
  let stuck = 0;
  while (Date.now() - t0 < timeout) {
    const me = await pos(page);
    const e = await page.evaluate((i) => window.__mmo.entityPos(i), id);
    if (!e) return false;
    const dx = e.x - me.x;
    const dz = e.z - me.z;
    if (Math.hypot(dx, dz) <= stopAt) return true;
    stuck = last && Math.hypot(me.x - last.x, me.z - last.z) < 0.3 ? stuck + 1 : 0;
    last = me;
    const keys = [];
    if (stuck >= 2) {
      // blocked by a tree/rock: sidestep perpendicular to the main direction
      keys.push(
        Math.abs(dz) > Math.abs(dx)
          ? stuck % 4 < 2
            ? 'KeyA'
            : 'KeyD'
          : stuck % 4 < 2
            ? 'KeyW'
            : 'KeyS',
      );
    } else {
      if (Math.abs(dz) > 0.6) keys.push(dz > 0 ? 'KeyW' : 'KeyS');
      if (Math.abs(dx) > 0.6) keys.push(dx > 0 ? 'KeyD' : 'KeyA');
    }
    for (const k of keys) await page.keyboard.down(k);
    await sleep(stuck >= 2 ? 500 : 250);
    for (const k of keys) await page.keyboard.up(k);
  }
  return false;
}

/** Travel scaffolding: leave the game, wait out the reconnect linger, move the character, log in. */
async function travel(page, p, x, z) {
  await page.goto('about:blank');
  await sleep(11500);
  sql(`update characters set pos_x=${x}, pos_z=${z} where id='${p.characterId}'`);
  await enter(page, p);
  await page.waitForFunction(() => window.__mmo.quests.length > 0, null, { timeout: 10000 });
}

const quest = (page) =>
  page.evaluate(() =>
    window.__mmo.quests.find((q) => q.questId === 'quest.greenvale.wolves_at_the_edge'),
  );
const Q = 'quest.greenvale.wolves_at_the_edge';
const dbQuest = (characterId) =>
  sql(
    `select status || '|' || progress::text from character_quests where character_id='${characterId}' and quest_id='${Q}'`,
  );

(async () => {
  adminToken = (
    await api('POST', '/v1/auth/dev-login', null, { username: 'admin', client: 'tool' })
  ).json.token;
  const browser = await chromium.launch({
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
  const pageErrors = [];

  // ------------------------------------------------------------------ desktop: full loop
  {
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    page.on('pageerror', (e) => pageErrors.push(e.message));
    const p = await newPlayer('qd', { x: -6, z: 0 });
    await enter(page, p);
    await page.waitForFunction(() => window.__mmo.quests.length > 0, null, { timeout: 10000 });
    check('quest available before talking', (await quest(page)).state === 'available');
    const npcId = await page.evaluate(() => window.__mmo.npcId);
    await page.click('#game', { position: { x: 700, y: 450 } });
    await approach(page, npcId, 2.5);
    const prompt = await page.textContent('.prompt').catch(() => null);
    check(
      'walking up to Elder Maren shows the talk prompt',
      /talk to Elder Maren/.test(prompt || ''),
      prompt,
    );
    await page.keyboard.press('KeyE');
    await page.waitForSelector('[data-testid=dialogue]', { timeout: 5000 });
    check(
      'dialogue opens with an Accept action',
      await page.locator('[data-testid=quest-accept]').isVisible(),
    );
    await page.screenshot({ path: `${OUT}/quest-01-offer.png` });
    await page.click('[data-testid=quest-accept]');
    await page.waitForSelector('[data-testid=quest-tracker]', { timeout: 5000 });
    const tracker0 = await page.textContent('[data-testid=quest-tracker]');
    check(
      'tracker shows the quest and 0/5 wolves',
      /Wolves at the Edge/.test(tracker0) && /0 \/ 5/.test(tracker0),
      tracker0,
    );
    check('quest persisted active in PostgreSQL', dbQuest(p.characterId).startsWith('active'));
    await page.click('[data-testid=dialogue-close]');
    // travel to the north den's edge (the walk itself is covered by the world E2E)
    await travel(page, p, 2, 50);
    check(
      'quest still active after logging out and back in',
      (await quest(page)).state === 'active',
    );
    await page.click('#game', { position: { x: 700, y: 450 } });

    // hunt until the server says the quest is ready (5 wolves + 3 pelts from real loot)
    const t0 = Date.now();
    let sawProgress = false;
    const DENS = [
      [2, 50],
      [78, -34],
      [-50, -88],
    ];
    let den = 0;
    let idle = 0;
    let lastKills = 0;
    while (Date.now() - t0 < 420000) {
      const q = await quest(page);
      if (q.objectives[0].current > lastKills) {
        lastKills = q.objectives[0].current;
        const text = await page.textContent('[data-testid=quest-tracker]').catch(() => '');
        if (new RegExp(`${lastKills} / 5`).test(text || '')) sawProgress = true;
      }
      if (q.state === 'ready_to_turn_in') break;
      if (q.objectives[0].done && !q.objectives[1].done) {
        // pelt objective still open after 5 kills: keep hunting (loot is random)
      }
      const tgt = await page.evaluate(() => window.__mmo.target);
      const live = await liveWolves(page);
      if (!tgt.id || !live.some((w) => w.id === tgt.id)) {
        await page.keyboard.press('Tab');
        await sleep(300);
        if (!(await page.evaluate(() => window.__mmo.target.id))) {
          // nothing within 40 m: dens only respawn with no player nearby, so move on to the next den
          idle++;
          if (idle >= 3) {
            idle = 0;
            const [x, z] = DENS[++den % DENS.length];
            await travel(page, p, x, z);
            await page.click('#game', { position: { x: 700, y: 450 } });
          } else await sleep(1500);
        }
      } else if (!tgt.attacking) {
        idle = 0;
        await approach(page, tgt.id);
        await page.keyboard.press('KeyF');
      }
      if (await page.evaluate(() => window.__mmo.vitals.dead)) {
        await sleep(3500);
        await page.click('[data-testid=respawn]').catch(() => undefined);
      }
      await sleep(600);
    }
    const ready = await quest(page);
    check(
      'kills and looted pelts complete the objectives (server state)',
      ready.state === 'ready_to_turn_in',
      JSON.stringify(ready.objectives),
    );
    check('tracker updated live as wolves died', sawProgress);
    const kills = Number(
      sql(
        `select count(*) from kill_events where character_id='${p.characterId}' and status='rewarded'`,
      ),
    );
    check(
      'quest kill count matches durable kill events',
      ready.objectives[0].current === Math.min(5, kills),
      `kills=${kills}`,
    );
    const trackerReady = await page.textContent('[data-testid=quest-tracker]');
    check(
      'tracker says Return to Elder Maren',
      /Return to Elder Maren/.test(trackerReady),
      trackerReady,
    );
    await page.screenshot({ path: `${OUT}/quest-02-ready.png` });

    // reconnect (socket drop) and full reload: progress comes back from the server
    await page.evaluate(() => window.__mmo.dropConnection());
    await page.waitForFunction(() => window.__mmo.reconnects > 0 && window.__mmo.connected, null, {
      timeout: 20000,
    });
    check(
      'after reconnect the quest is still ready',
      (await quest(page)).state === 'ready_to_turn_in',
    );
    await sleep(500);
    await page.reload();
    await enter(page, p);
    await page.waitForFunction(() => window.__mmo.quests.length > 0, null, { timeout: 10000 });
    check(
      'after a page reload the quest is still ready',
      (await quest(page)).state === 'ready_to_turn_in',
    );

    // back to the village, then walk up to Elder Maren
    await travel(page, p, -6, -6);
    const peltsBefore = Number(
      sql(
        `select coalesce(sum(i.quantity),0) from item_instances i join containers c on c.id=i.container_id where c.owner_character_id='${p.characterId}' and i.location_kind='container' and i.template_id='material.hide.wolf_pelt' and c.kind in ('backpack','material_pouch','mailbox')`,
      ),
    );
    const goldBefore = Number(
      sql(
        `select amount from currency_balances where owner_character_id='${p.characterId}' and currency_id='gold'`,
      ) || 0,
    );
    const npc2 = await page.evaluate(() => window.__mmo.npcId);
    await page.click('#game', { position: { x: 700, y: 450 } });
    const arrived = await approach(page, npc2, 2.5, 60000);
    check('walked back to Elder Maren', arrived);
    await page.keyboard.press('KeyE');
    await page.waitForSelector('[data-testid=quest-turn-in]', { timeout: 5000 });
    const line = await page.textContent('[data-testid=dialogue]');
    check(
      'dialogue reflects completed objectives',
      /You have done it/.test(line),
      line.slice(0, 120),
    );
    await page.screenshot({ path: `${OUT}/quest-03-turn-in.png` });
    await page.click('[data-testid=quest-turn-in]');
    await page.waitForFunction(
      () => window.__mmo.quests.some((q) => q.state === 'completed'),
      null,
      { timeout: 10000 },
    );
    await sleep(800);
    const toasts = (await page.locator('[data-testid=toast]').allTextContents()).join(' | ');
    check(
      'reward shown to the player',
      /Quest complete: Wolves at the Edge/.test(toasts),
      toasts.slice(0, 200),
    );
    check('tracker cleared', (await page.locator('[data-testid=quest-tracker]').count()) === 0);
    check(
      'dialogue now shows the completed line',
      /quieter thanks to you/.test(await page.textContent('[data-testid=dialogue]')),
    );
    await page.screenshot({ path: `${OUT}/quest-04-completed.png` });
    // second turn-in attempt is impossible (no button) and rejected by the server
    check(
      'no turn-in action after completion',
      (await page.locator('[data-testid=quest-turn-in]').count()) === 0,
    );
    await page.click('[data-testid=dialogue-close]');
    await page.keyboard.press('KeyJ');
    await page.click('[role=tab]:has-text("Completed")');
    const logText = await page.textContent('[data-window=quests]');
    check(
      'quest log lists it under Completed',
      /Wolves at the Edge/.test(logText),
      logText.slice(0, 120),
    );
    await page.screenshot({ path: `${OUT}/quest-05-log.png` });

    // DB == UI
    check(
      'DB: quest completed once with rewarded_at',
      sql(
        `select status || '|' || (rewarded_at is not null) from character_quests where character_id='${p.characterId}'`,
      ) === 'completed|true',
    );
    const peltsAfter = Number(
      sql(
        `select coalesce(sum(i.quantity),0) from item_instances i join containers c on c.id=i.container_id where c.owner_character_id='${p.characterId}' and i.location_kind='container' and i.template_id='material.hide.wolf_pelt' and c.kind in ('backpack','material_pouch','mailbox')`,
      ),
    );
    check(
      'DB: exactly 3 pelts consumed',
      peltsBefore - peltsAfter === 3,
      `${peltsBefore} -> ${peltsAfter}`,
    );
    const goldAfter = Number(
      sql(
        `select amount from currency_balances where owner_character_id='${p.characterId}' and currency_id='gold'`,
      ),
    );
    check(
      'DB: gold reward paid once',
      goldAfter - goldBefore === 250,
      `${goldBefore} -> ${goldAfter}`,
    );
    check(
      "DB: one Wayfarer's Cloak",
      sql(
        `select count(*) from item_instances where owner_character_id='${p.characterId}' and template_id='accessory.cloak.wayfarer_cloak'`,
      ) === '1',
    );
    const uiCloak = await page.evaluate(
      () =>
        window.__mmo.items.filter((i) => i.templateId === 'accessory.cloak.wayfarer_cloak').length,
    );
    check('UI shows the reward item', uiCloak === 1);
    await page.close();
  }

  // ------------------------------------------------------------------ phone 390x844
  {
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
      deviceScaleFactor: 1,
    });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => pageErrors.push(e.message));
    const p = await newPlayer('qm', { x: -6, z: 3 });
    await enter(page, p);
    await page.waitForSelector('[data-testid=touch-interact]', { timeout: 5000 });
    await page.locator('[data-testid=touch-interact]').tap();
    await page.waitForSelector('[data-testid=quest-accept]', { timeout: 5000 });
    await page.screenshot({ path: `${OUT}/quest-06-phone-offer.png` });
    await page.locator('[data-testid=quest-accept]').tap();
    await page.waitForSelector('[data-testid=quest-tracker]', { timeout: 5000 });
    check('phone: accept by touch', dbQuest(p.characterId).startsWith('active'));
    await page.locator('[data-testid=dialogue-close]').tap();
    await sleep(300);
    const rect = (sel) => page.locator(sel).first().boundingBox();
    const boxes = {
      tracker: await rect('[data-testid=quest-tracker]'),
      playerFrame: await rect('[data-testid=player-frame]'),
      joystick: await rect('[data-testid=joystick]'),
      minimap: await rect('[data-testid=minimap]'),
      actionBar: await rect('.action-bar'),
    };
    const overlap = (a, b) =>
      a &&
      b &&
      a.x < b.x + b.width &&
      b.x < a.x + a.width &&
      a.y < b.y + b.height &&
      b.y < a.y + a.height;
    const clashes = [];
    const names = Object.keys(boxes);
    for (let i = 0; i < names.length; i++)
      for (let j = i + 1; j < names.length; j++)
        if (overlap(boxes[names[i]], boxes[names[j]])) clashes.push(`${names[i]}/${names[j]}`);
    check(
      'phone: tracker fits without overlapping the HUD',
      clashes.length === 0,
      clashes.join(','),
    );
    await page.screenshot({ path: `${OUT}/quest-07-phone-tracker.png` });
    // Scaffolding for the phone turn-in (the desktop run covered real kills): 5 recorded kills
    // credited through the durable pipeline + 3 pelts granted by an admin.
    for (let i = 0; i < 5; i++) {
      const id = execSync('node -e "console.log(require(\'crypto\').randomUUID())"')
        .toString()
        .trim();
      sql(
        `insert into kill_events (kill_id, zone_id, enemy_id, spawn_point_id, group_id, character_id, died_at, respawn_at, next_attempt_at) values ('${id}', 'zone.greenvale.meadows', 'enemy.greenvale.grey_wolf', 'spawn.e2e', null, '${p.characterId}', now(), now(), now())`,
      );
    }
    await api('POST', '/v1/admin/items/grant', adminToken, {
      characterId: p.characterId,
      templateId: 'material.hide.wolf_pelt',
      quantity: 3,
      reason: 'quest e2e phone',
    });
    await page
      .waitForFunction(
        () => window.__mmo.quests.some((q) => q.state === 'ready_to_turn_in'),
        null,
        { timeout: 20000 },
      )
      .catch(() => undefined);
    check(
      'phone: progress pushed live (recovery sweep + change feed)',
      (await quest(page)).state === 'ready_to_turn_in',
      JSON.stringify((await quest(page)).objectives),
    );
    await page.locator('[data-testid=touch-interact]').tap();
    await page.waitForSelector('[data-testid=quest-turn-in]', { timeout: 5000 });
    await page.screenshot({ path: `${OUT}/quest-08-phone-turn-in.png` });
    await page.locator('[data-testid=quest-turn-in]').tap();
    await page
      .waitForFunction(() => window.__mmo.quests.some((q) => q.state === 'completed'), null, {
        timeout: 10000,
      })
      .catch(() => undefined);
    check('phone: turned in by touch', dbQuest(p.characterId).startsWith('completed'));
    await page.screenshot({ path: `${OUT}/quest-09-phone-done.png` });
    await ctx.close();
  }

  check('no page errors', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
  await browser.close();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  fs.writeFileSync(`${OUT}/quest-results.json`, JSON.stringify(results, null, 2));
  process.exit(failed.length ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(2);
});
