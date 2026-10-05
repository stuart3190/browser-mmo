/* eslint-disable */
// Real keyboard/touch/UI route; read-only dev observations, no teleports or grants.
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const fs = require('node:fs');
const { walk: walkRoute, enter } = require('./vertical-slice.cjs');
const walk = (page, x, z, range) => walkRoute(page, x, z, range, 300000);
const world = require('../../packages/game-data/src/content/packs/world-greybox.json').world;
const OUT = process.argv[2] || '/tmp/mmo-world-foundation';
fs.mkdirSync(OUT, { recursive: true });
const checks = [];
function check(name, ok, detail) {
  checks.push({ name, ok: !!ok, detail });
  console.log(ok ? 'PASS' : 'FAIL', name, detail || '');
  if (!ok) throw Error(name);
}
const zone = (p) =>
  p.evaluate(() => window.__worldEvents.filter((m) => m.t === 'auth.ok').at(-1)?.d.zoneId);
async function openWorld(p) {
  if (!(await p.locator('[data-window=world]').isVisible()))
    await p.locator('[data-open=world]').click();
}
async function travel(p, from, to) {
  const t = world.travel.find((t) => t.fromLocationId === from && t.toLocationId === to);
  if (!t) throw Error(`Missing route ${from} -> ${to}`);
  const destination = world.locations.find((l) => l.id === to);
  await openWorld(p);
  const btn = p.locator(`[data-travel="${t.id}"]`);
  await btn.scrollIntoViewIfNeeded();
  await p.waitForFunction((id) => !document.querySelector(`[data-travel="${id}"]`)?.disabled, t.id);
  await btn.click();
  await p.waitForFunction(
    (z) => window.__worldEvents.filter((m) => m.t === 'auth.ok').at(-1)?.d.zoneId === z,
    destination.zoneId,
  );
  await p.waitForTimeout(700);
  check(
    `UI travel ${from} -> ${to}`,
    (await zone(p)) === destination.zoneId,
    await p.evaluate(() => window.__mmo.sceneCounts),
  );
  check(
    'Streamed ground stays bounded',
    await p.evaluate(() => window.__mmo.sceneCounts.loadedChunks <= 25),
  );
}
async function guide(p, id) {
  await openWorld(p);
  await p.locator(`[data-guide-location="${id}"]`).click();
  await p.waitForTimeout(200);
  check(`World compass guides ${id}`, await p.locator('[data-testid=quest-guide]').isVisible());
}
async function main() {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome',
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
  const contexts = [
    await browser.newContext({ viewport: { width: 800, height: 600 } }),
    await browser.newContext({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
      deviceScaleFactor: 1,
    }),
  ];
  const errors = [];
  for (const c of contexts)
    await c.addInitScript(() => {
      window.__worldEvents = [];
      const Original = window.WebSocket;
      window.WebSocket = class extends Original {
        constructor(...args) {
          super(...args);
          this.addEventListener('message', (e) => {
            try {
              const m = JSON.parse(e.data);
              if (['auth.ok', 'zone.snapshot', 'combat.loot', 'combat.death'].includes(m.t))
                window.__worldEvents.push(m);
            } catch {}
          });
        }
      };
    });
  const a = await contexts[0].newPage(),
    b = await contexts[1].newPage();
  [a, b].forEach((p) => p.on('pageerror', (e) => errors.push(e.message)));
  const suffix = Date.now().toString(36),
    users = process.env.WORLD_RESUME
      ? JSON.parse(fs.readFileSync(`${OUT}/users.json`))
      : [`world_${suffix}`, `shore_${suffix}`];
  fs.writeFileSync(`${OUT}/users.json`, JSON.stringify(users));
  try {
    await enter(a, users[0], !process.env.WORLD_RESUME);
    await enter(b, users[1], !process.env.WORLD_RESUME, 'class.mage');
    const beginZone = await zone(a);
    if (beginZone === 'zone.greenvale.meadows') {
      const bid = await b.evaluate(() => window.__mmo.myEntityId);
      await a.waitForFunction((id) => !!window.__mmo.entityPos(id), bid);
      check(
        'Existing Greenvale multiplayer and opening guidance work',
        await a.locator('[data-testid=first-steps]').isVisible(),
      );
      await b.goto('about:blank');
      if (!process.env.WORLD_RESUME) {
        await walk(a, 8, -14);
        await a.keyboard.press('KeyE');
        await a.waitForFunction(() =>
          window.__mmo.items.some((i) => i.templateId === 'weapon.sword.iron_longsword'),
        );
        await a.keyboard.press('KeyB');
        await a.getByRole('button', { name: 'Iron Longsword', exact: true }).click();
        await a.locator('[data-action=equip]').click();
        await a.waitForFunction(() =>
          window.__mmo.items.some((i) => i.location.kind === 'equipped'),
        );
        await a.keyboard.press('Escape');
        await a.keyboard.press('Escape');
      }
      await guide(a, 'location.greenvale.north_gate');
      if (!process.env.WORLD_RESUME) await walk(a, 0, 10);
      await walk(a, 0, 116, 2);
      await travel(a, 'location.greenvale.north_gate', 'location.greenvale_marches.starter_gate');
    }
    const inventory = await a.evaluate(() => window.__mmo.items);
    check(
      'Travel retains the same equipped unique sword',
      inventory.some((i) => i.location.kind === 'equipped'),
    );
    await enter(b, users[1], false);
    check(
      'Other client remains on Greenvale without cross-zone ghost',
      (await zone(b)) === 'zone.greenvale.meadows' &&
        !(await b.evaluate(
          (id) => window.__mmo.entityPos(id),
          await a.evaluate(() => window.__mmo.myEntityId),
        )),
    );
    await b.goto('about:blank');
    await walk(a, 256, 400, 2);
    const pop = await a.evaluate(() =>
      window.__worldEvents
        .filter((m) => m.t === 'zone.snapshot')
        .at(-1)
        .d.entities.filter((e) => e.kind === 'npc'),
    );
    check(
      'Settlement inhabitants have actual replicated world presence',
      pop.length === 9,
      pop.map((e) => e.name),
    );
    await a.screenshot({ path: `${OUT}/01-roadhouse.png` });
    await walk(a, 512, 512, 6);
    const deer = await a.evaluate(() =>
      window.__mmo.enemies.find((e) => e.refId?.includes('.wildlife.')),
    );
    check('Regional wildlife exists independently of quests', !!deer, deer?.name);
    const ep = await a.evaluate((id) => window.__mmo.entityPos(id), deer.id);
    await walk(a, ep.x, ep.z, 2.8);
    await a.keyboard.press('Tab');
    await a.waitForFunction((id) => window.__mmo.target.id === id, deer.id);
    await a.keyboard.press('KeyF');
    await a.keyboard.press('Digit2');
    await a.waitForFunction(
      (id) => window.__worldEvents.some((m) => m.t === 'combat.death' && m.d.entityId === id),
      deer.id,
      { timeout: 60000 },
    );
    await a.waitForFunction(() =>
      window.__mmo.items.some((i) => i.templateId === 'material.world.field_hide'),
    );
    check(
      'Real regional combat produces persistent catalog loot and XP',
      await a.evaluate(() => window.__mmo.progress.xp > 0),
    );
    await a.screenshot({ path: `${OUT}/02-regional-wildlife-loot.png` });
    await a.waitForFunction(() => !window.__mmo.vitals.inCombat);
    await guide(a, 'location.greenvale_marches.port');
    await walk(a, 256, 400, 2);
    await walk(a, 256, 96, 2);
    await travel(a, 'location.greenvale_marches.port', 'location.brinebreak.port');
    await a.screenshot({ path: `${OUT}/03-frostmere-port.png` });
    await travel(a, 'location.brinebreak.port', 'location.ashstrand.port');
    await travel(a, 'location.ashstrand.port', 'location.oasis_reach.port');
    await travel(a, 'location.oasis_reach.port', 'location.mistwood.port');
    await a.screenshot({ path: `${OUT}/04-veilreach-port.png` });
    await travel(a, 'location.mistwood.port', 'location.brinebreak.port');
    await travel(a, 'location.brinebreak.port', 'location.greenvale_marches.port');
    const earned = await a.evaluate(() => ({
      items: window.__mmo.items,
      xp: window.__mmo.progress.xp,
    }));
    await enter(a, users[0], false);
    check(
      'Cross-continent relog retains unique loot/equipment/XP and zone',
      (await zone(a)) === 'zone.aurelian.greenvale_marches' &&
        (await a.evaluate(
          (old) =>
            old.items.every((i) => window.__mmo.items.some((j) => j.id === i.id)) &&
            window.__mmo.progress.xp === old.xp,
          earned,
        )),
    );
    await walk(a, 256, 376, 2);
    await a.goto('about:blank');
    await enter(b, users[1], false);
    await b.bringToFront();
    await guide(b, 'location.greenvale.north_gate');
    await walk(b, 0, 10);
    await walk(b, 0, 116, 2);
    await travel(b, 'location.greenvale.north_gate', 'location.greenvale_marches.starter_gate');
    await enter(a, users[0], false);
    await a.waitForFunction(
      (id) => !!window.__mmo.entityPos(id),
      await b.evaluate(() => window.__mmo.myEntityId),
      { timeout: 10000 },
    );
    check('Both clients reconcile into the same new region', true);
    await a.goto('about:blank');
    const js = await b.locator('[data-testid=joystick]').boundingBox(),
      before = await b.evaluate(() => window.__mmo.position),
      cdp = await contexts[1].newCDPSession(b);
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ id: 1, x: js.x + js.width / 2, y: js.y + js.height / 2 }],
    });
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ id: 1, x: js.x + js.width / 2, y: js.y + 15 }],
    });
    await b.waitForTimeout(1800);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    check(
      'Actual touch joystick works after region transfer',
      await b.evaluate(
        (old) => Math.hypot(window.__mmo.position.x - old.x, window.__mmo.position.z - old.z) > 0.3,
        before,
      ),
    );
    for (const [width, height] of [
      [390, 844],
      [844, 390],
    ]) {
      await b.setViewportSize({ width, height });
      await openWorld(b);
      check(
        `${width}x${height} atlas exposes all five continents and 24 regions`,
        (await b.locator('select[aria-label="Atlas region"] optgroup').count()) === 5 &&
          (await b.locator('select[aria-label="Atlas region"] option').count()) === 24,
      );
      const btn = b.locator('[data-travel]').first();
      await btn.scrollIntoViewIfNeeded();
      const box = await btn.boundingBox();
      check(
        `${width}x${height} travel hit target reachable`,
        box.x >= 0 &&
          box.y >= 0 &&
          box.x + box.width <= width &&
          box.y + box.height <= height &&
          box.height >= 44,
        box,
      );
      await b.screenshot({ path: `${OUT}/05-mobile-${width}.png` });
      await b.getByRole('button', { name: 'Close World / Travel', exact: true }).click();
      const boxes = await b.locator('[data-testid=joystick],.action-bar').evaluateAll((ns) =>
        ns.map((n) => {
          const r = n.getBoundingClientRect();
          return { x: r.x, y: r.y, w: r.width, h: r.height };
        }),
      );
      check(
        `${width}x${height} joystick/action bar not clipped`,
        boxes.every(
          (r) => r.x >= 0 && r.y >= 0 && r.x + r.w <= width + 1 && r.y + r.h <= height + 1,
        ),
        boxes,
      );
    }
    check('No browser exceptions', errors.length === 0, errors);
    fs.writeFileSync(`${OUT}/results.json`, JSON.stringify({ users, checks }, null, 2));
  } finally {
    await browser.close();
    fs.writeFileSync(`${OUT}/checks.json`, JSON.stringify(checks, null, 2));
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
