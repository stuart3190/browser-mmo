/* eslint-disable */
// Fresh-character UI playthrough. No teleports, admin grants, XP injection or fake rewards.
// Development-only read-only __mmo observations; inputs use the actual keyboard and UI.
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const fs = require('node:fs');
const OUT = process.argv[2] || '/tmp/mmo-slice-playthrough';
const WEB = process.env.WEB_URL || 'http://127.0.0.1:5178';
fs.mkdirSync(OUT, { recursive: true });
const checks = [];
function check(name, ok, detail) {
  checks.push({ name, ok: !!ok, detail });
  console.log(ok ? 'PASS' : 'FAIL', name, detail || '');
  if (!ok) throw new Error(name);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function walk(page, x, z, range = 1.6, timeout = 90000) {
  const until = Date.now() + timeout;
  let held = [];
  try {
    while (Date.now() < until) {
      const s = await page.evaluate(() => ({
        p: window.__mmo.position,
        a: window.__mmo.cameraAlpha,
        dead: window.__mmo.vitals.dead,
      }));
      if (s.dead) throw new Error('Died while travelling');
      const dx = x - s.p.x,
        dz = z - s.p.z;
      if (Math.hypot(dx, dz) <= range) return;
      const f = -Math.cos(s.a) * dx - Math.sin(s.a) * dz;
      const r = -Math.sin(s.a) * dx + Math.cos(s.a) * dz;
      const next = [];
      if (Math.abs(f) > 0.65) next.push(f > 0 ? 'KeyW' : 'KeyS');
      if (Math.abs(r) > 0.65) next.push(r > 0 ? 'KeyD' : 'KeyA');
      for (const k of held.filter((k) => !next.includes(k))) await page.keyboard.up(k);
      for (const k of next.filter((k) => !held.includes(k))) await page.keyboard.down(k);
      held = next;
      await sleep(180);
    }
    throw new Error(`Walk deadline ${x},${z}`);
  } finally {
    for (const k of held) await page.keyboard.up(k);
  }
}
async function enter(page, username, create, classId = 'class.warrior') {
  await page.goto(WEB);
  await page.fill('[name=username]', username);
  await page.click('#login-form button');
  if (create) {
    await page.fill(
      '#create-form [name=name]',
      username
        .replace(/_/g, '')
        .replace(/[0-9]/g, (d) => 'abcdefghij'[+d])
        .slice(0, 20),
    );
    await page.selectOption('[name=classId]', classId);
    await page.click('#create-form button');
  } else await page.locator('#char-list button').first().click();
  await page.waitForFunction(
    () => window.__mmo?.vitals || document.querySelector('[data-testid=continue-browser]'),
  );
  if (await page.locator('[data-testid=continue-browser]').isVisible())
    await page.locator('[data-testid=continue-browser]').click();
  await page.waitForFunction(() => window.__mmo?.vitals && window.__mmo?.position, null, {
    timeout: 30000,
  });
}
async function main() {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome',
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
  const errors = [];
  const context = await browser.newContext({ viewport: { width: 1100, height: 740 } });
  await context.addInitScript(() => {
    window.__sliceEvents = [];
    const Original = window.WebSocket;
    window.WebSocket = class extends Original {
      constructor(...args) {
        super(...args);
        this.addEventListener('message', (e) => {
          try {
            const m = JSON.parse(e.data);
            if (
              [
                'combat.damage',
                'combat.death',
                'combat.loot',
                'character.progress',
                'entity.spawn',
              ].includes(m.t)
            ) {
              window.__sliceEvents.push(m);
              if (window.__sliceEvents.length > 1000) window.__sliceEvents.shift();
            }
          } catch {}
        });
      }
    };
  });
  const a = await context.newPage(),
    b = await context.newPage();
  for (const page of [a, b]) page.on('pageerror', (e) => errors.push(e.message));
  const suffix = Date.now().toString(36);
  const userA = `trail_${suffix}`,
    userB = `ember_${suffix}`;
  try {
    await enter(a, userA, true);
    await a.screenshot({ path: `${OUT}/01-arrival.png` });
    check(
      'Fresh Warrior has opening objective and health/XP HUD',
      (await a.locator('[data-testid=first-steps]').isVisible()) &&
        (await a.locator('[data-testid=player-xp]').isVisible()),
    );
    await walk(a, 8, -14);
    await a.keyboard.press('KeyE');
    await a.waitForFunction(() =>
      window.__mmo.items.some((i) => i.templateId === 'weapon.sword.iron_longsword'),
    );
    await a.keyboard.press('KeyB');
    await a.getByRole('button', { name: 'Iron Longsword', exact: true }).click();
    await a.locator('[data-action= equip]').click();
    await a.waitForFunction(() =>
      window.__mmo.items.some(
        (i) => i.templateId === 'weapon.sword.iron_longsword' && i.location.kind === 'equipped',
      ),
    );
    await a.keyboard.press('Escape');
    await a.keyboard.press('Escape');
    check('Real sword pickup equipped through inventory UI', true);
    await walk(a, 0, 0);
    await walk(a, -6, 5);
    await a.keyboard.press('KeyE');
    await a.locator('[data-testid=quest-accept]').click();
    await a.locator('[data-testid=dialogue-close]').click();
    check('Maren quest accepted', await a.locator('[data-testid=quest-tracker]').isVisible());
    await enter(b, userB, true, 'class.mage');
    const ids = await Promise.all([a, b].map((p) => p.evaluate(() => window.__mmo.myEntityId)));
    await walk(b, 2, 3);
    await a.waitForFunction((id) => !!window.__mmo.entityPos(id), ids[1]);
    const bp = await b.evaluate(() => window.__mmo.position);
    const seen = await a.evaluate((id) => window.__mmo.entityPos(id), ids[1]);
    check(
      'Two real clients see replicated movement',
      Math.hypot(bp.x - seen.x, bp.z - seen.z) < 2,
      { bp, seen },
    );
    await a.screenshot({ path: `${OUT}/02-village-together.png` });
    await walk(a, 0, 10);
    await walk(a, 0, 48);
    await walk(b, 0, 10);
    await walk(b, 0, 48);
    await a.keyboard.press('Tab');
    await a.waitForFunction(() => window.__mmo.target.id);
    const target = await a.evaluate(() => window.__mmo.target.id);
    // Read-only entity coordinates locate the real target; combat still uses UI inputs.
    const enemy = await a.evaluate((id) => window.__mmo.entityPos(id), target);
    await walk(a, enemy.x, enemy.z, 3);
    await a.keyboard.press('KeyF');
    await a.keyboard.press('Digit2');
    await b.keyboard.press('Tab');
    const secondTarget = await b.evaluate(() => window.__mmo.target.id);
    if (secondTarget === target) await b.keyboard.press('Digit2');
    await a.screenshot({ path: `${OUT}/03-northwood-combat.png` });
    await a.waitForFunction(
      (id) => window.__sliceEvents.some((m) => m.t === 'combat.death' && m.d.entityId === id),
      target,
      { timeout: 45000 },
    );
    await b.waitForFunction(
      (id) => window.__sliceEvents.some((m) => m.t === 'combat.death' && m.d.entityId === id),
      target,
      { timeout: 10000 },
    );
    const damage = await Promise.all(
      [a, b].map((p) =>
        p.evaluate(
          (id) =>
            window.__sliceEvents
              .filter((m) => m.t === 'combat.damage' && m.d.targetId === id)
              .map((m) => [m.d.amount, m.d.targetHealth]),
          target,
        ),
      ),
    );
    check(
      'Both browsers receive the same creature damage and death',
      JSON.stringify(damage[0]) === JSON.stringify(damage[1]) && damage[0].length > 0,
      damage,
    );
    await a.waitForFunction(() => window.__mmo.progress.xp > 0);
    const earned = await a.evaluate(() => ({
      progress: window.__mmo.progress,
      items: window.__mmo.items,
      health: window.__mmo.vitals,
      events: window.__sliceEvents.filter((m) => m.t === 'combat.loot'),
    }));
    check(
      'Kill awards persistent real items and XP to the first tagger',
      earned.items.length > 1 && earned.events.length === 1,
      earned.progress,
    );
    await a.keyboard.press('KeyB');
    await a.screenshot({ path: `${OUT}/04-real-loot.png` });
    await a.keyboard.press('Escape');
    await walk(a, 0, 32);
    await walk(a, 0, 8);
    await enter(a, userA, false);
    await a.waitForFunction(() => window.__mmo.items.length > 1 && window.__mmo.progress);
    const restored = await a.evaluate(() => ({
      progress: window.__mmo.progress,
      items: window.__mmo.items,
    }));
    check(
      'Reload/login restores earned XP and the same unique item IDs',
      restored.progress.xp === earned.progress.xp &&
        earned.items.every((i) => restored.items.some((j) => j.id === i.id)),
    );
    // Mouse orbit and zoom are real input; position remains server-authoritative.
    const yaw = await a.evaluate(() => window.__mmo.cameraAlpha);
    await a.mouse.move(500, 400);
    await a.mouse.down();
    await a.mouse.move(650, 420, { steps: 10 });
    await a.mouse.up();
    await a.mouse.wheel(0, -200);
    await sleep(500);
    check(
      'Mouse drag changes camera yaw',
      Math.abs((await a.evaluate(() => window.__mmo.cameraAlpha)) - yaw) > 0.1,
    );
    check('No browser exceptions', errors.length === 0, errors);
    fs.writeFileSync(
      `${OUT}/results.json`,
      JSON.stringify(
        {
          checks,
          users: [userA, userB],
          characterId: await a.evaluate(() => window.__mmo.characterId),
        },
        null,
        2,
      ),
    );
  } finally {
    await browser.close();
    fs.writeFileSync(`${OUT}/checks.json`, JSON.stringify(checks, null, 2));
  }
}
module.exports = { walk, enter };
if (require.main === module)
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
