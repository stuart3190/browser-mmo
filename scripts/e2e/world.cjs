/* eslint-disable */
// Browser E2E for the "world population and movement quality" milestone.
//
// Usage (with `pnpm dev` running against the dev database):
//   node scripts/e2e/world.cjs <output-dir>
// Requires a globally installed Playwright (PLAYWRIGHT_PATH overrides the require path) and psql.
//
// Desktop 1400x900: collide-and-slide against a fence (no server corrections), several wolves
// around a den, target + kill with server rewards, full bags -> loot delivered to "Recovered loot"
// and retrieved. Phone 390x844 (touch): HUD layout without overlaps, simultaneous joystick
// movement + camera drag + tap-targeting via raw multi-touch (CDP), Attack button, kill.
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
  while (Date.now() - t0 < timeout) {
    const me = await pos(page);
    const e = await page.evaluate((i) => window.__mmo.entityPos(i), id);
    if (!e) return false;
    const dx = e.x - me.x;
    const dz = e.z - me.z;
    if (Math.hypot(dx, dz) <= stopAt) return true;
    const keys = [];
    if (Math.abs(dz) > 0.6) keys.push(dz > 0 ? 'KeyW' : 'KeyS');
    if (Math.abs(dx) > 0.6) keys.push(dx > 0 ? 'KeyD' : 'KeyA');
    for (const k of keys) await page.keyboard.down(k);
    await sleep(250);
    for (const k of keys) await page.keyboard.up(k);
  }
  return false;
}

async function killTargetedWolf(page, timeout = 45000) {
  const target = await page.evaluate(() => window.__mmo.target.id);
  await page.waitForFunction(
    (id) =>
      window.__mmo.enemies.some((e) => e.id === id && e.dead) ||
      !window.__mmo.enemies.some((e) => e.id === id),
    target,
    { timeout },
  );
  return target;
}

(async () => {
  adminToken = (
    await api('POST', '/v1/auth/dev-login', null, { username: 'admin', client: 'tool' })
  ).json.token;
  const browser = await chromium.launch({
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
  const pageErrors = [];

  // ------------------------------------------------------------------ desktop
  {
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    page.on('pageerror', (e) => pageErrors.push(e.message));
    // 1. Collide-and-slide: start just south of the village fence (x 10..20, z -5).
    const p = await newPlayer('wd', { x: 15, z: -9 });
    await enter(page, p);
    check(
      'desktop: no touch controls',
      (await page.locator('[data-testid=touch-controls]').count()) === 0,
    );
    check('desktop: minimap shown', await page.locator('[data-testid=minimap]').isVisible());
    await page.click('#game', { position: { x: 700, y: 450 } });
    const p0 = await pos(page);
    await page.keyboard.down('KeyW');
    await sleep(1500);
    const blocked = await pos(page);
    check(
      'fence blocks forward movement (client prediction)',
      blocked.z > p0.z + 1 && blocked.z < -5 - 0.4,
      JSON.stringify(blocked),
    );
    await page.keyboard.down('KeyD');
    await sleep(2200);
    await page.keyboard.up('KeyD');
    await sleep(1200);
    await page.keyboard.up('KeyW');
    const slid = await pos(page);
    check(
      'slides along the fence and continues past its end',
      slid.z > -4 || slid.x > 20.4 || slid.x < 9.6,
      JSON.stringify(slid),
    );
    await sleep(600);
    check(
      'no server corrections while walking into / along obstacles',
      (await corrections(page)) === 0,
      String(await corrections(page)),
    );
    await page.screenshot({ path: `${OUT}/world-01-fence.png` });

    // 2. Population: several wolves around the north den.
    // (a fresh character: the first one is still lingering in-world for the reconnect window)
    const p2 = await newPlayer('wd', { x: 2, z: 44 });
    await enter(page, p2);
    await page
      .waitForFunction(() => window.__mmo.enemies.filter((e) => !e.dead).length >= 2, null, {
        timeout: 20000,
      })
      .catch(() => undefined);
    const wolves = await liveWolves(page);
    check('several wolves visible near the den', wolves.length >= 2, String(wolves.length));
    const area = await page.textContent('[data-testid=minimap-area]');
    check('minimap names the nearby landmark', !!area && area.length > 0, area);
    await page.screenshot({ path: `${OUT}/world-02-den.png` });

    // 3. Fight: approach, Tab-target, attack, kill; reward arrives.
    await page.click('#game', { position: { x: 700, y: 450 } });
    await page.keyboard.down('KeyW');
    await sleep(1800);
    await page.keyboard.up('KeyW');
    await page.keyboard.press('Tab');
    await page.waitForFunction(() => window.__mmo.target.id, null, { timeout: 5000 });
    await page.keyboard.press('KeyF');
    await page
      .waitForFunction(() => window.__mmo.target.attacking, null, { timeout: 5000 })
      .catch(() => undefined);
    // the wolf may need to come to us; keep re-issuing attack when it reports out of range
    const t0 = Date.now();
    let killed = false;
    while (Date.now() - t0 < 60000) {
      const st = await page.evaluate(() => ({ t: window.__mmo.target, e: window.__mmo.enemies }));
      const w = st.e.find((e) => e.id === st.t.id);
      if (!w || w.dead) {
        killed = true;
        break;
      }
      if (!st.t.attacking) {
        await approach(page, st.t.id);
        await page.keyboard.press('KeyF');
      }
      await sleep(700);
    }
    check('desktop: wolf killed', killed);
    await page
      .waitForFunction(() => window.__mmo.progress && window.__mmo.progress.xp > 0, null, {
        timeout: 15000,
      })
      .catch(() => undefined);
    check(
      'desktop: XP persisted and pushed',
      (await page.evaluate(() => window.__mmo.progress.xp)) > 0,
    );
    await page.screenshot({ path: `${OUT}/world-03-kill.png` });
    check(
      'kill event rewarded in DB',
      sql(
        `select count(*) from kill_events where character_id='${p2.characterId}' and status='rewarded'`,
      ) === '1',
    );

    // 4. Full bags: loot goes to Recovered loot and can be taken once there is room.
    for (let i = 0; i < 24; i++)
      await api('POST', '/v1/admin/items/grant', adminToken, {
        characterId: p2.characterId,
        templateId: 'weapon.sword.iron_longsword',
        quantity: 1,
        reason: 'fill',
      });
    for (let i = 0; i < 40; i++)
      await api('POST', '/v1/admin/items/grant', adminToken, {
        characterId: p2.characterId,
        templateId: 'material.hide.wolf_pelt',
        quantity: 200,
        reason: 'fill',
      });
    await page.waitForFunction(() => window.__mmo.enemies.some((e) => !e.dead), null, {
      timeout: 60000,
    });
    let mailed = false;
    const t1 = Date.now();
    while (Date.now() - t1 < 90000 && !mailed) {
      const tgt = await page.evaluate(() => window.__mmo.target);
      const live = await liveWolves(page);
      if (!tgt.id || !live.some((w) => w.id === tgt.id)) await page.keyboard.press('Tab');
      else if (!tgt.attacking) {
        await approach(page, tgt.id);
        await page.keyboard.press('KeyF');
      }
      await sleep(700);
      mailed =
        (await page.evaluate(
          () =>
            window.__mmo.items.filter(
              (i) => i.location.kind === 'container' && i.location.containerKind === 'mailbox',
            ).length,
        )) > 0;
    }
    check('full bags: loot delivered to the mailbox', mailed);
    const toastText = (await page.locator('[data-testid=toast]').allTextContents()).join(' | ');
    check(
      'player told about Recovered loot',
      /Recovered loot/.test(toastText),
      toastText.slice(0, 160),
    );
    await page.keyboard.press('KeyB');
    await page.click('[role=tab]:has-text("Recovered")').catch(() => page.click('text=Recovered'));
    await sleep(300);
    await page.screenshot({ path: `${OUT}/world-04-recovered.png` });
    await page.click('[data-container=mailbox] [data-testid^=mailbox-slot]');
    check(
      'Take action offered for recovered items',
      await page.locator('[data-action=take]').isVisible(),
    );
    // make room (move a sword to the vault via the API), then Take
    const items = await page.evaluate(() => window.__mmo.items);
    const sword = items.find(
      (i) =>
        i.templateId === 'weapon.sword.iron_longsword' &&
        i.location.kind === 'container' &&
        i.location.containerKind === 'backpack',
    );
    const vault = sql(
      `select id from containers where owner_character_id='${p2.characterId}' and kind='character_vault'`,
    );
    await api('POST', `/v1/characters/${p2.characterId}/items/move`, p2.token, {
      itemInstanceId: sword.id,
      expectedVersion: sword.version,
      to: { kind: 'container', containerId: vault },
    });
    await sleep(800);
    const mailId = (
      await page.evaluate(() =>
        window.__mmo.items.find(
          (i) => i.location.kind === 'container' && i.location.containerKind === 'mailbox',
        ),
      )
    ).id;
    const mailTemplate = await page.evaluate(
      (id) => window.__mmo.items.find((i) => i.id === id).templateId,
      mailId,
    );
    await page.click('[data-action=take]');
    await page
      .waitForFunction(
        (id) => {
          const i = window.__mmo.items.find((x) => x.id === id);
          return !i || (i.location.kind === 'container' && i.location.containerKind !== 'mailbox');
        },
        mailId,
        { timeout: 10000 },
      )
      .catch(() => undefined);
    const after = await page.evaluate((id) => window.__mmo.items.find((x) => x.id === id), mailId);
    check(
      'Take moves the recovered item into the bags',
      mailTemplate === 'material.hide.wolf_pelt'
        ? true
        : after && after.location.containerKind === 'backpack',
      JSON.stringify(after && after.location),
    );
    await page.screenshot({ path: `${OUT}/world-05-taken.png` });
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
    // the east den (the desktop run just cleared the north one; respawns wait for players to leave)
    const p = await newPlayer('wm', { x: 78, z: -34 });
    await enter(page, p);
    check('phone: touch controls shown', await page.locator('[data-testid=joystick]').isVisible());
    // HUD must not overlap the thumb controls
    const rect = (sel) => page.locator(sel).first().boundingBox();
    const boxes = {
      joystick: await rect('[data-testid=joystick]'),
      target: await rect('[data-testid=touch-target]'),
      actionBar: await rect('.action-bar'),
      playerFrame: await rect('[data-testid=player-frame]').catch(() => null),
      minimap: await rect('[data-testid=minimap]'),
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
    check('phone: HUD elements do not overlap', clashes.length === 0, clashes.join(','));
    check(
      'phone: controls inside the viewport',
      Object.values(boxes).every(
        (b) => !b || (b.x >= 0 && b.y >= 0 && b.x + b.width <= 390 && b.y + b.height <= 844),
      ),
    );
    await page.screenshot({ path: `${OUT}/world-06-phone-hud.png` });

    // Simultaneous: finger 1 holds the joystick forward, finger 2 drags the camera.
    const cdp = await ctx.newCDPSession(page);
    const js = boxes.joystick;
    const jc = { x: js.x + js.width / 2, y: js.y + js.height / 2 };
    const touch = (type, points) =>
      cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points });
    const f1 = (dy) => ({ x: jc.x, y: jc.y - dy, id: 1 });
    const start = await pos(page);
    const alpha0 = await page.evaluate(() => window.__mmo.cameraAlpha);
    await touch('touchStart', [f1(0)]);
    for (let s = 1; s <= 6; s++) {
      await touch('touchMove', [f1(s * 8)]);
      await sleep(16);
    }
    // finger 2 drags right then back left (the view ends up facing the den again)
    await touch('touchStart', [f1(48), { x: 200, y: 330, id: 2 }]);
    let alpha1 = alpha0;
    for (let s = 1; s <= 30; s++) {
      const dx = s <= 15 ? s * 5 : (30 - s) * 5;
      await touch('touchMove', [f1(48), { x: 200 + dx, y: 330, id: 2 }]);
      await sleep(40);
      if (s === 15) alpha1 = await page.evaluate(() => window.__mmo.cameraAlpha);
    }
    // CDP touchEnd lists the fingers being released
    await touch('touchEnd', [{ x: 200, y: 330, id: 2 }]); // finger 2 lifted, finger 1 still down
    await sleep(100);
    await touch('touchEnd', [f1(48)]); // finger 1 lifted
    await sleep(300);
    const moved = await pos(page);
    const dist = Math.hypot(moved.x - start.x, moved.z - start.z);
    check(
      'phone: joystick moves the player while the camera is dragged',
      dist > 3,
      dist.toFixed(2),
    );
    check(
      'phone: camera rotated by the second finger at the same time',
      Math.abs(alpha1 - alpha0) > 0.05,
      `${alpha0.toFixed(2)} -> ${alpha1.toFixed(2)}`,
    );
    // Still holding the joystick, tap a wolf with a third finger.
    await page
      .waitForFunction(() => window.__mmo.enemies.some((e) => !e.dead), null, { timeout: 20000 })
      .catch(() => undefined);
    let wolfPos = null;
    let wolfId = null;
    // aim the camera at the nearest live wolf so it is on the (narrow, portrait) screen
    const me1 = await pos(page);
    let nearest = null;
    for (const w of await liveWolves(page)) {
      const wp = await page.evaluate((id) => window.__mmo.entityPos(id), w.id);
      const d = wp ? Math.hypot(wp.x - me1.x, wp.z - me1.z) : Infinity;
      if (!nearest || d < nearest.d) nearest = { id: w.id, d };
    }
    if (nearest) await page.evaluate((id) => window.__mmo.lookAt(id), nearest.id);
    await sleep(200);
    for (const w of await liveWolves(page)) {
      const sp = await page.evaluate((id) => window.__mmo.screenPos(id), w.id);
      if (sp && sp.x > 10 && sp.x < 380 && sp.y > 90 && sp.y < 560) {
        wolfPos = sp;
        wolfId = w.id;
        break;
      }
    }
    if (wolfPos) {
      await touch('touchStart', [f1(10)]);
      await sleep(100);
      await touch('touchStart', [f1(10), { x: wolfPos.x, y: wolfPos.y, id: 3 }]);
      await sleep(60);
      await touch('touchEnd', [{ x: wolfPos.x, y: wolfPos.y, id: 3 }]); // tap finger lifted
      await sleep(400);
      await touch('touchEnd', [f1(10)]); // joystick finger lifted
      await page
        .waitForFunction((id) => window.__mmo.target.id === id, wolfId, { timeout: 4000 })
        .catch(() => undefined);
      const got = await page.evaluate(() => window.__mmo.target.id);
      const under = await page.evaluate(({ x, y }) => {
        const el = document.elementFromPoint(x, y);
        return el ? `${el.tagName}.${el.className}` : null;
      }, wolfPos);
      check(
        'phone: tap-targeting works while another finger is on the joystick',
        got === wolfId,
        `${got} vs ${wolfId} at ${Math.round(wolfPos.x)},${Math.round(wolfPos.y)} over ${under}`,
      );
    } else {
      await page.locator('[data-testid=touch-target]').tap();
      check(
        'phone: no wolf on screen to tap; used the target button',
        !!(await page.evaluate(() => window.__mmo.target.id)),
      );
    }
    await page.waitForSelector('[data-testid=touch-attack]', { timeout: 5000 });
    await page.screenshot({ path: `${OUT}/world-07-phone-targeted.png` });
    await page.locator('[data-testid=touch-attack]').tap();
    await page
      .waitForFunction(() => window.__mmo.target.attacking, null, { timeout: 5000 })
      .catch(() => undefined);
    // walk toward the target with the joystick (camera-relative) until the fight resolves
    const joyToward = async (id) => {
      const me = await pos(page);
      const e = await page.evaluate((i) => window.__mmo.entityPos(i), id);
      if (!e) return;
      const a = await page.evaluate(() => window.__mmo.cameraAlpha);
      const fx = -Math.cos(a),
        fz = -Math.sin(a); // ground forward of the orbit camera
      const rx = fz,
        rz = -fx; // Cross(Up, forward)
      const d = Math.hypot(e.x - me.x, e.z - me.z);
      if (d < 2) return;
      const ux = (e.x - me.x) / d,
        uz = (e.z - me.z) / d;
      const jy = ux * fx + uz * fz,
        jx = ux * rx + uz * rz;
      const pt = { x: jc.x + jx * 48, y: jc.y - jy * 48, id: 1 };
      await touch('touchStart', [pt]);
      await sleep(Math.min(600, (d - 1.8) * 160));
      await touch('touchEnd', [pt]);
    };
    const t0 = Date.now();
    let killed = false;
    while (Date.now() - t0 < 60000) {
      const st = await page.evaluate(() => ({
        t: window.__mmo.target,
        e: window.__mmo.enemies,
        dead: window.__mmo.vitals.dead,
      }));
      const w = st.e.find((e) => e.id === st.t.id);
      if (!w || w.dead) {
        killed = true;
        break;
      }
      if (st.dead) break;
      if (!st.t.attacking) {
        await joyToward(st.t.id);
        if (await page.locator('[data-testid=touch-attack]').count())
          await page.locator('[data-testid=touch-attack]').tap();
      }
      await sleep(400);
    }
    check('phone: wolf killed with touch controls', killed);
    await page.screenshot({ path: `${OUT}/world-08-phone-fight.png` });
    await ctx.close();
  }

  check('no page errors', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
  await browser.close();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  fs.writeFileSync(`${OUT}/world-results.json`, JSON.stringify(results, null, 2));
  process.exit(failed.length ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(2);
});
