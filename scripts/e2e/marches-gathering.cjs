/* eslint-disable */
// Earned two-client gathering proof: actual keyboard/touch/UI, no DB grants or teleports.
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const { enter, walk: walkRoute } = require('./vertical-slice.cjs');
const fs = require('node:fs');
const OUT = process.argv[2] || '/tmp/mmo-marches-gathering';
fs.mkdirSync(OUT, { recursive: true });
const checks = [];
function check(name, ok, detail) {
  checks.push({ name, ok: !!ok, detail });
  console.log(ok ? 'PASS' : 'FAIL', name, detail || '');
  if (!ok) throw Error(name);
}
const walk = (p, x, z, r = 1.6) => walkRoute(p, x, z, r, 300000);
const zone = (p) =>
  p.evaluate(() => window.__marchEvents.filter((m) => m.t === 'auth.ok').at(-1)?.d.zoneId);
const qty = (p) =>
  p.evaluate(() =>
    window.__mmo.items
      .filter((i) => i.templateId === 'material.world.wild_herb' && i.location.kind !== 'destroyed')
      .reduce((n, i) => n + i.quantity, 0),
  );
async function main() {
  const browser = await chromium.launch({
    executablePath: '/usr/bin/google-chrome',
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
  const desktop = await browser.newContext({ viewport: { width: 900, height: 650 } });
  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 1,
  });
  const errors = [];
  for (const c of [desktop, mobile])
    await c.addInitScript(() => {
      window.__marchEvents = [];
      const WS = window.WebSocket;
      window.WebSocket = class extends WS {
        constructor(...args) {
          super(...args);
          this.addEventListener('message', (e) => {
            try {
              const m = JSON.parse(e.data);
              if (
                [
                  'auth.ok',
                  'zone.snapshot',
                  'entity.spawn',
                  'entity.despawn',
                  'party.update',
                  'inventory.updated',
                ].includes(m.t)
              )
                window.__marchEvents.push(m);
            } catch {}
          });
        }
      };
    });
  const a = await desktop.newPage(),
    b = await mobile.newPage();
  [a, b].forEach((p) => p.on('pageerror', (e) => errors.push(e.message)));
  const suffix = Date.now().toString(36),
    users = process.env.MARCHES_RESUME
      ? JSON.parse(fs.readFileSync(`${OUT}/users.json`))
      : [`gather_${suffix}`, `herbs_${suffix}`];
  fs.writeFileSync(`${OUT}/users.json`, JSON.stringify(users));
  async function arrive(p, user) {
    console.log('Entering route', user);
    await enter(
      p,
      user,
      !process.env.MARCHES_RESUME || (process.env.MARCHES_CREATE_SECOND && user === users[1]),
    );
    if ((await zone(p)) === 'zone.greenvale.meadows') {
      console.log('Walking north gate');
      await walk(p, 0, 116);
      await p.locator('[data-open=world]').click();
      await p
        .locator('[data-travel="travel.greenvale.north_gate.to.greenvale_marches.starter_gate"]')
        .click();
      await p.waitForFunction(
        () =>
          window.__marchEvents.filter((m) => m.t === 'auth.ok').at(-1)?.d.zoneId ===
          'zone.aurelian.greenvale_marches',
      );
      if (await p.locator('[data-window=world]').isVisible())
        await p.getByRole('button', { name: 'Close World / Travel', exact: true }).click();
    }
    console.log('Walking herb garden', await zone(p));
    const current = await p.evaluate(() => window.__mmo.position);
    if (current.x > 294 || current.z > 401) {
      await walk(p, 310, 398);
    }
    await walk(p, 290, 398);
    await p.waitForFunction(() =>
      document.querySelector('.prompt')?.textContent.includes('gather'),
    );
    check(
      'Herb beds discoverable on real road from enclave',
      (await zone(p)) === 'zone.aurelian.greenvale_marches',
    );
  }
  try {
    await arrive(a, users[0]);
    await a.screenshot({ path: `${OUT}/01-desktop-beds.png` });
    await a.goto('about:blank');
    await arrive(b, users[1]);
    await b.goto('about:blank');
    await enter(a, users[0], false);
    await enter(b, users[1], false);
    const party = await a.evaluate(
      () => window.__marchEvents.filter((m) => m.t === 'party.update').at(-1)?.d,
    );
    if (!party?.partyId) {
      await a.locator('[data-open=party]').click();
      await a.getByRole('button', { name: /^Invite / }).click();
      await b.getByRole('button', { name: 'Accept party', exact: true }).tap();
      await a.waitForFunction(
        () =>
          window.__marchEvents.filter((m) => m.t === 'party.update').at(-1)?.d.members.length === 2,
      );
      await a.keyboard.press('Escape');
    }
    const oldA = await qty(a),
      oldB = await qty(b);
    const node = await a.evaluate(() => {
      for (const m of [...window.__marchEvents].reverse()) {
        const es =
          m.t === 'zone.snapshot' ? m.d.entities : m.t === 'entity.spawn' ? [m.d.entity] : [];
        const e = es.find((e) => e.kind === 'resource_node' && e.position.x === 290);
        if (e) return e.id;
      }
    });
    check(
      'Both party browsers see the same herb entity',
      !!node && (await b.evaluate((id) => !!window.__mmo.entityPos(id), node)),
    );
    await a.keyboard.press('KeyE');
    await a.waitForFunction(
      (n) =>
        window.__mmo.items
          .filter(
            (i) => i.templateId === 'material.world.wild_herb' && i.location.kind !== 'destroyed',
          )
          .reduce((a, i) => a + i.quantity, 0) === n,
      oldA + 2,
    );
    await b.waitForFunction((id) => !window.__mmo.entityPos(id), node);
    check(
      'Shared depletion grants exactly two herbs to gatherer, no party duplicates',
      (await qty(a)) === oldA + 2 && (await qty(b)) === oldB,
    );
    await a.locator('[data-open=inventory]').click();
    await a.getByRole('tab', { name: 'Materials', exact: true }).click();
    await a.getByRole('button', { name: /^Wild Herb(?: x\d+)?$/ }).waitFor({ state: 'visible' });
    check('Material pouch visibly contains real Wild Herb', true);
    await a.screenshot({ path: `${OUT}/02-persistent-pouch.png` });
    await a.goto('about:blank');
    // Wait for real database/server regrowth, then use actual touch button for second harvest.
    await b.waitForFunction(
      () => document.querySelector('[data-testid=touch-interact]')?.textContent === 'Gather',
      null,
      { timeout: 90000 },
    );
    await b.locator('[data-testid=touch-interact]').tap();
    await b.waitForFunction(
      (n) =>
        window.__mmo.items
          .filter(
            (i) => i.templateId === 'material.world.wild_herb' && i.location.kind !== 'destroyed',
          )
          .reduce((a, i) => a + i.quantity, 0) === n,
      oldB + 2,
    );
    check('Regrowth allows a new touch harvest', (await qty(b)) === oldB + 2);
    await b.locator('[data-open=inventory]').tap();
    await b.getByRole('tab', { name: 'Materials', exact: true }).tap();
    await b.screenshot({ path: `${OUT}/03-touch-pouch.png` });
    await b.getByRole('button', { name: 'Close Inventory', exact: true }).tap();
    for (const [width, height] of [
      [390, 844],
      [844, 390],
    ]) {
      await b.setViewportSize({ width, height });
      const boxes = await b
        .locator('[data-testid=joystick],.action-bar,.touch-buttons')
        .evaluateAll((ns) =>
          ns.map((n) => {
            let r = n.getBoundingClientRect();
            return { x: r.x, y: r.y, w: r.width, h: r.height };
          }),
        );
      check(
        `${width}x${height} controls remain within viewport`,
        boxes.every(
          (r) => r.x >= 0 && r.y >= 0 && r.x + r.w <= width + 1 && r.y + r.h <= height + 1,
        ),
        boxes,
      );
      await b.screenshot({ path: `${OUT}/04-controls-${width}.png` });
    }
    await b.goto('about:blank');
    await enter(a, users[0], false);
    check('Gathered herbs persist after login', (await qty(a)) === oldA + 2);
    check(
      'Party survives gather and reconnect',
      await a.evaluate(
        () =>
          window.__marchEvents.filter((m) => m.t === 'party.update').at(-1)?.d.members.length === 2,
      ),
    );
    // Legitimate road exploration to populated meadow; no combat injection.
    await walk(a, 310, 398);
    await walk(a, 330, 430);
    await walk(a, 375, 438);
    check(
      'Roadside catalog habitat and guard visible',
      await a.evaluate(() => window.__mmo.enemies.some((e) => e.refId?.includes('wildlife'))),
    );
    await a.screenshot({ path: `${OUT}/05-lantern-meadow.png` });
    check('No browser exceptions', errors.length === 0, errors);
    fs.writeFileSync(`${OUT}/results.json`, JSON.stringify({ users, checks }, null, 2));
  } finally {
    for (const [name, p] of [
      ['a', a],
      ['b', b],
    ])
      try {
        await p.screenshot({ path: `${OUT}/last-${name}.png` });
      } catch {}
    fs.writeFileSync(`${OUT}/checks.json`, JSON.stringify(checks, null, 2));
    await browser.close();
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
