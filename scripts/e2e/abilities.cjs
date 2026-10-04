/* eslint-disable */
// Browser E2E for the first playable classes + abilities.
//
// Usage (with `pnpm dev` running against the migrated dev database):
//   node scripts/e2e/abilities.cjs <output-dir>
// Desktop: a Warrior and a Mage each target a real wolf, use their class ability (Heavy Strike in
// melee / Firebolt at range), see damage + cooldown, spam is refused, a locked level-2 ability is
// refused, reconnect rebuilds the bar, a kill levels them to 2 and unlocks Battle Strike / Flame
// Burst live, which they then use. Phone 390x844: Mage casts Firebolt by touch while holding the
// joystick (CDP multi-touch); HUD layout checked. Scaffolding: characters start next to a den with
// XP 3 short of level 2 (set in the DB before playing).
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
async function newPlayer(prefix, pos, { sword = true, classId = 'class.warrior', xp = 0 } = {}) {
  const suffix = Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
  const username = `${prefix}_${suffix}`;
  const token = (await api('POST', '/v1/auth/dev-login', null, { username, client: 'tool' })).json
    .token;
  const name = letters(`${prefix}${suffix}`).slice(0, 20);
  const ch = (await api('POST', '/v1/characters', token, { name, classId })).json.character;
  sql(
    `update characters set pos_x=${pos.x}, pos_z=${pos.z}, rotation_y=0, xp=${xp} where id='${ch.id}'`,
  );
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

const logText = (page) =>
  page.evaluate(() => document.querySelector('[data-testid=log]')?.textContent ?? '');
const count = (text, re) => (text.match(re) || []).length;
const ready = (page, id) => page.getAttribute(`[data-testid="ability-${id}"]`, 'data-ready');
const enemyHealth = (page, id) =>
  page.evaluate((i) => window.__mmo.enemies.find((e) => e.id === i)?.health ?? null, id);
const dist = async (page, id) => {
  const me = await pos(page);
  const e = await page.evaluate((i) => window.__mmo.entityPos(i), id);
  return e ? Math.hypot(e.x - me.x, e.z - me.z) : Infinity;
};

/** Targets the nearest live wolf (Tab) and walks to `range`; returns its id. */
async function engage(page, range) {
  for (let i = 0; i < 40; i++) {
    const tgt = await page.evaluate(() => window.__mmo.target.id);
    const live = await liveWolves(page);
    if (tgt && live.some((w) => w.id === tgt)) {
      if ((await dist(page, tgt)) > range) await approach(page, tgt, range - 0.5, 15000);
      return tgt;
    }
    await page.keyboard.press('Tab');
    await sleep(500);
  }
  return null;
}

/** Fights the current target with an ability key + auto-attack until it dies. */
async function finish(page, keys, range) {
  const t0 = Date.now();
  while (Date.now() - t0 < 60000) {
    const st = await page.evaluate(() => ({
      t: window.__mmo.target,
      e: window.__mmo.enemies,
      dead: window.__mmo.vitals.dead,
    }));
    const w = st.e.find((e) => e.id === st.t.id);
    if (!w || w.dead) return true;
    if (st.dead) return false;
    if ((await dist(page, st.t.id)) > range) await approach(page, st.t.id, range - 0.5, 8000);
    for (const k of keys) await page.keyboard.press(k);
    await sleep(400);
  }
  return false;
}

async function classRun(browser, { classId, label, den, key1, id1, key2, id2, range }) {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  page.on('pageerror', (e) => pageErrors.push(e.message));
  const need = Number(sql(`select 400`)); // level-1 xp to next (dev curve), refined below
  const p = await newPlayer(label.slice(0, 2).toLowerCase(), den, {
    classId,
    sword: classId === 'class.warrior',
  });
  await enter(page, p);
  await page.waitForSelector('[data-testid=ability-bar]');
  const toNext = await page.evaluate(() => window.__mmo.progress.xpToNext);
  sql(`update characters set xp=${toNext - 3} where id='${p.characterId}'`);
  await page.reload();
  await enter(page, p);
  await page.waitForSelector('[data-testid=ability-bar]');
  const ab = await page.evaluate(() => window.__mmo.abilities);
  check(
    `${label}: class persisted and drives the bar`,
    ab.classId === classId &&
      sql(`select class_id from characters where id='${p.characterId}'`) === classId,
  );
  check(
    `${label}: level-2 ability shown locked`,
    (await ready(page, id2)) === 'false' &&
      /Lv 2/.test(await page.textContent(`[data-testid="ability-${id2}"]`)),
  );
  await page.click('#game', { position: { x: 700, y: 450 } });
  const wolf = await engage(page, range);
  check(`${label}: targeted a wolf`, !!wolf);
  const hp0 = await enemyHealth(page, wolf);
  let d = await dist(page, wolf);
  for (let attempt = 0; attempt < 4; attempt++) {
    await page.keyboard.press(key1);
    await sleep(500);
    const used = await page.evaluate(
      (id) =>
        window.__mmo.abilities.list.find((a) => a.abilityId === id)?.readyAtLocal > Date.now(),
      id1,
    );
    if (used) break;
    // refused (e.g. a rock blocks line of sight): step closer and try again
    await approach(page, wolf, Math.max(2.5, d / 2), 8000);
    d = await dist(page, wolf);
  }
  await page
    .waitForFunction(
      (n) => (document.querySelector('[data-testid=log]')?.textContent ?? '').includes(`Your ${n}`),
      await page.evaluate((i) => i, label === 'Warrior' ? 'Heavy Strike' : 'Firebolt'),
      { timeout: 5000 },
    )
    .catch(() => undefined);
  const name1 = label === 'Warrior' ? 'Heavy Strike' : 'Firebolt';
  const log1 = await logText(page);
  check(
    `${label}: ${name1} used from ${d.toFixed(1)} m`,
    count(log1, new RegExp(`Your ${name1}`, 'g')) === 1,
    log1.slice(-160),
  );
  check(
    `${label}: server applied damage`,
    (await enemyHealth(page, wolf)) < hp0 || /misses/.test(log1),
  );
  check(
    `${label}: cooldown overlay shown`,
    (await page.locator(`[data-testid="ability-${id1}"] [data-testid=cooldown]`).count()) === 1,
  );
  await page.screenshot({ path: `${OUT}/ability-${label}-01-cooldown.png` });
  // spam during cooldown: rejected, no extra hits
  for (let i = 0; i < 5; i++) await page.keyboard.press(key1);
  await sleep(600);
  const log2 = await logText(page);
  check(
    `${label}: spamming during cooldown executes nothing`,
    count(log2, new RegExp(`Your ${name1}`, 'g')) === 1,
  );
  const toasts = (await page.locator('[data-testid=toast]').allTextContents()).join(' | ');
  check(`${label}: rejection reported`, /not ready/.test(toasts), toasts.slice(0, 120));
  // locked ability: server refuses (the button is disabled; send the key anyway)
  await page.keyboard.press(key2);
  await sleep(400);
  check(
    `${label}: locked ability not executed`,
    !/Your (Battle Strike|Flame Burst)/.test(await logText(page)),
  );
  // reconnect: cooldown state rebuilt from the server
  await page.keyboard.press(key1); // might still be cooling: harmless
  await page.evaluate(() => window.__mmo.dropConnection());
  await page.waitForFunction(() => window.__mmo.reconnects > 0 && window.__mmo.connected, null, {
    timeout: 20000,
  });
  await sleep(300);
  const after = await page.evaluate(() => window.__mmo.abilities);
  check(
    `${label}: abilities rebuilt after reconnect`,
    after.list.length === 3 && after.list.some((a) => a.abilityId === id1),
  );
  // kill -> level 2 -> unlock
  await engage(page, range);
  const killed = await finish(page, [key1, 'KeyF'], range);
  check(`${label}: wolf killed with abilities`, killed);
  await page
    .waitForFunction(
      (id) => window.__mmo.abilities.list.find((a) => a.abilityId === id)?.unlocked,
      id2,
      { timeout: 15000 },
    )
    .catch(() => undefined);
  const unlockToast = (await page.locator('[data-testid=toast]').allTextContents()).join(' | ');
  check(
    `${label}: level-up unlock notification`,
    /New ability unlocked/.test(unlockToast) || /You learned/.test(await logText(page)),
    unlockToast.slice(0, 160),
  );
  check(
    `${label}: level-2 ability now unlocked on the bar`,
    (await page.locator(`[data-testid="ability-${id2}"].locked`).count()) === 0 &&
      (await page.locator(`[data-testid="ability-${id2}"][disabled]`).count()) === 0,
  );
  check(
    `${label}: DB level 2`,
    sql(`select level from characters where id='${p.characterId}'`) === '2',
  );
  await page.screenshot({ path: `${OUT}/ability-${label}-02-unlocked.png` });
  const w2 = await engage(page, range);
  if (w2) {
    await sleep(1100);
    await page.keyboard.press(key2);
    const name2 = label === 'Warrior' ? 'Battle Strike' : 'Flame Burst';
    await page
      .waitForFunction(
        (n) =>
          (document.querySelector('[data-testid=log]')?.textContent ?? '').includes(`Your ${n}`),
        name2,
        { timeout: 5000 },
      )
      .catch(() => undefined);
    check(`${label}: ${name2} used after unlock`, (await logText(page)).includes(`Your ${name2}`));
  }
  await page.screenshot({ path: `${OUT}/ability-${label}-03-unlocked-use.png` });
  await page.close();
}

const pageErrors = [];
(async () => {
  adminToken = (
    await api('POST', '/v1/auth/dev-login', null, { username: 'admin', client: 'tool' })
  ).json.token;
  const browser = await chromium.launch({
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });

  await classRun(browser, {
    classId: 'class.warrior',
    label: 'Warrior',
    den: { x: 78, z: -34 },
    key1: 'Digit2',
    id1: 'ability.warrior.heavy_strike',
    key2: 'Digit3',
    id2: 'ability.warrior.battle_strike',
    range: 3.2,
  });
  await classRun(browser, {
    classId: 'class.mage',
    label: 'Mage',
    den: { x: -50, z: -88 },
    key1: 'Digit2',
    id1: 'ability.mage.firebolt',
    key2: 'Digit3',
    id2: 'ability.mage.flame_burst',
    range: 12,
  });

  // ------------------------------------------------------------------ phone 390x844 (Mage)
  {
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
      deviceScaleFactor: 1,
    });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => pageErrors.push(e.message));
    const p = await newPlayer('am', { x: 2, z: 44 }, { classId: 'class.mage', sword: false });
    await enter(page, p);
    await page.waitForSelector('[data-testid="ability-ability.mage.firebolt"]');
    const rect = (sel) => page.locator(sel).first().boundingBox();
    const boxes = {
      joystick: await rect('[data-testid=joystick]'),
      firebolt: await rect('[data-testid="ability-ability.mage.firebolt"]'),
      flame: await rect('[data-testid="ability-ability.mage.flame_burst"]'),
      target: await rect('[data-testid=touch-target]'),
      actionBar: await rect('.action-bar'),
      minimap: await rect('[data-testid=minimap]'),
      playerFrame: await rect('[data-testid=player-frame]'),
    };
    const overlap = (a, b) =>
      a &&
      b &&
      a.x < b.x + b.width &&
      b.x < a.x + a.width &&
      a.y < b.y + b.height &&
      b.y < a.y + a.height;
    const names = Object.keys(boxes);
    const clashes = [];
    for (let i = 0; i < names.length; i++)
      for (let j = i + 1; j < names.length; j++)
        if (overlap(boxes[names[i]], boxes[names[j]])) clashes.push(`${names[i]}/${names[j]}`);
    check(
      'phone: ability buttons fit beside joystick/target/minimap without overlap',
      clashes.length === 0,
      clashes.join(','),
    );
    check(
      'phone: ability buttons are large enough to tap',
      boxes.firebolt.width >= 44 && boxes.firebolt.height >= 44,
    );
    // target via the touch button, then: finger 1 holds the joystick, finger 2 taps Firebolt
    for (let i = 0; i < 20 && !(await page.evaluate(() => window.__mmo.target.id)); i++) {
      await page.locator('[data-testid=touch-target]').tap();
      await sleep(400);
    }
    const tgt = await page.evaluate(() => window.__mmo.target.id);
    check('phone: target acquired by touch', !!tgt);
    const cdp = await ctx.newCDPSession(page);
    const touch = (type, points) =>
      cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points });
    const jc = {
      x: boxes.joystick.x + boxes.joystick.width / 2,
      y: boxes.joystick.y + boxes.joystick.height / 2,
    };
    // walk toward the target (joystick forward) until within spell range
    for (let i = 0; i < 20 && (await dist(page, tgt)) > 18; i++) {
      await touch('touchStart', [{ x: jc.x, y: jc.y - 40, id: 1 }]);
      await sleep(300);
      await touch('touchEnd', [{ x: jc.x, y: jc.y - 40, id: 1 }]);
    }
    const fb = {
      x: boxes.firebolt.x + boxes.firebolt.width / 2,
      y: boxes.firebolt.y + boxes.firebolt.height / 2,
    };
    const joyToward = async (id, ms) => {
      const me = await pos(page);
      const e = await page.evaluate((i) => window.__mmo.entityPos(i), id);
      if (!e) return;
      const a = await page.evaluate(() => window.__mmo.cameraAlpha);
      const fx = -Math.cos(a),
        fz = -Math.sin(a);
      const rx = fz,
        rz = -fx;
      const dd = Math.hypot(e.x - me.x, e.z - me.z) || 1;
      const ux = (e.x - me.x) / dd,
        uz = (e.z - me.z) / dd;
      const pt = { x: jc.x + (ux * rx + uz * rz) * 48, y: jc.y - (ux * fx + uz * fz) * 48, id: 1 };
      await touch('touchStart', [pt]);
      await sleep(ms);
      await touch('touchEnd', [pt]);
    };
    let start = await pos(page);
    let cast = false;
    for (let attempt = 0; attempt < 6 && !cast; attempt++) {
      start = await pos(page);
      // finger 1 holds the joystick (walking toward the wolf) while finger 2 taps Firebolt
      const me = await pos(page);
      const e = await page.evaluate((i) => window.__mmo.entityPos(i), tgt);
      const a = await page.evaluate(() => window.__mmo.cameraAlpha);
      const fx = -Math.cos(a),
        fz = -Math.sin(a);
      const dd = Math.hypot(e.x - me.x, e.z - me.z) || 1;
      const ux = (e.x - me.x) / dd,
        uz = (e.z - me.z) / dd;
      const j = { x: jc.x + (ux * fz + uz * -fx) * 40, y: jc.y - (ux * fx + uz * fz) * 40, id: 1 };
      await touch('touchStart', [j]);
      await sleep(250);
      await touch('touchStart', [j, { x: fb.x, y: fb.y, id: 2 }]);
      await sleep(60);
      await touch('touchEnd', [{ x: fb.x, y: fb.y, id: 2 }]);
      await sleep(300);
      await touch('touchEnd', [j]);
      cast = await page.evaluate(
        () =>
          window.__mmo.abilities.list.find((x) => x.abilityId === 'ability.mage.firebolt')
            ?.readyAtLocal > Date.now(),
      );
      if (!cast) await joyToward(tgt, 600);
    }
    const moved = await pos(page);
    await page
      .waitForFunction(
        () =>
          window.__mmo.abilities.list.find((a) => a.abilityId === 'ability.mage.firebolt')
            ?.readyAtLocal > Date.now(),
        null,
        { timeout: 4000 },
      )
      .catch(() => undefined);
    const st = await page.evaluate(() =>
      window.__mmo.abilities.list.find((a) => a.abilityId === 'ability.mage.firebolt'),
    );
    check(
      'phone: Firebolt cast by touch while moving with the joystick',
      st.readyAtLocal > Date.now() && Math.hypot(moved.x - start.x, moved.z - start.z) > 0.5,
      JSON.stringify({ start, moved }),
    );
    check(
      'phone: cooldown overlay on the touch button',
      (await page
        .locator('[data-testid="ability-ability.mage.firebolt"] [data-testid=cooldown]')
        .count()) === 1,
    );
    await page.screenshot({ path: `${OUT}/ability-phone.png` });
    await ctx.close();
  }

  check('no page errors', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
  await browser.close();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  fs.writeFileSync(`${OUT}/ability-results.json`, JSON.stringify(results, null, 2));
  process.exit(failed.length ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(2);
});
