/* eslint-disable */
// Reserved preview account only: real TLS/password/UI inputs, transport observations, no debug hooks.
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const fs = require('node:fs');
const URL = process.env.GREENVALE_PUBLIC_URL || 'https://brokenodyssey.com',
  USER = process.env.GREENVALE_PUBLIC_USER || 'preview_check';
const password = fs
  .readFileSync(
    process.env.GREENVALE_PUBLIC_PASSWORD_FILE || '/etc/brokenodyssey/check-password',
    'utf8',
  )
  .trim();
const OUT = process.argv[2] || '/tmp/greenvale-public';
fs.mkdirSync(OUT, { recursive: true });
const checks = [];
function check(name, ok, detail) {
  checks.push({ name, ok: !!ok, detail });
  console.log(ok ? 'PASS' : 'FAIL', name, detail || '');
  if (!ok) throw Error(name);
}
(async () => {
  const browser = await chromium.launch({
    executablePath: '/usr/bin/google-chrome',
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const c = await browser.newContext({ viewport: { width: 800, height: 600 }, hasTouch: true });
  const p = await c.newPage(),
    errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  p.setDefaultTimeout(90000);
  await c.addInitScript(() => {
    window.proofFrames = [];
    window.proofPosition = null;
    window.serviceSeq = 0;
    const WS = window.WebSocket;
    window.WebSocket = class extends WS {
      constructor(...a) {
        super(...a);
        this.addEventListener('message', (e) => {
          const m = JSON.parse(e.data);
          if (
            [
              'auth.ok',
              'zone.snapshot',
              'inventory.snapshot',
              'inventory.updated',
              'error',
              'quest.log',
              'world.discoveries',
              'wallet.updated',
            ].includes(m.t)
          )
            window.proofFrames.push(m);
          if (m.t === 'auth.ok') window.proofPosition = m.d.character.position;
          if (m.t === 'move.correction') window.proofPosition = m.d.position;
        });
      }
      send(raw) {
        const m = JSON.parse(raw);
        if (m.t === 'move.input') window.proofPosition = m.d.position;
        if (m.t === 'npc.service' || m.t === 'npc.sell') window.serviceSeq = m.seq;
        return super.send(raw);
      }
    };
    window.proofItems = () => {
      const items = new Map();
      for (const m of window.proofFrames) {
        if (m.t === 'inventory.snapshot') {
          items.clear();
          for (const i of m.d.items.containers.flatMap((c) => c.items)) items.set(i.instance.id, i);
        }
        if (m.t === 'inventory.updated') {
          for (const i of m.d.items) items.set(i.instance.id, i);
          for (const r of m.d.removed) items.delete(r.id);
        }
      }
      return [...items.values()].filter((i) => i.instance.location.kind !== 'destroyed');
    };
  });
  async function login() {
    await p.goto(URL);
    await p.fill('[name=username]', USER);
    await p.fill('[name=password]', password);
    await p.click('#login-form button');
    await p.locator('#char-list button').first().click();
    await p.waitForFunction(
      () =>
        window.proofFrames.some((m) => m.t === 'zone.snapshot') &&
        window.proofFrames.some((m) => m.t === 'inventory.snapshot'),
    );
    if (await p.locator('[data-testid=continue-browser]').isVisible())
      await p.locator('[data-testid=continue-browser]').tap();
  }
  async function walk(x, z) {
    let held = [];
    const until = Date.now() + 120000;
    try {
      while (Date.now() < until) {
        const pos = await p.evaluate(() => window.proofPosition);
        const dx = x - pos.x,
          dz = z - pos.z;
        if (Math.hypot(dx, dz) < 1.8) return;
        const next = [];
        if (Math.abs(dz) > 0.65) next.push(dz > 0 ? 'KeyW' : 'KeyS');
        if (Math.abs(dx) > 0.65) next.push(dx > 0 ? 'KeyD' : 'KeyA');
        for (const k of held.filter((k) => !next.includes(k))) await p.keyboard.up(k);
        for (const k of next.filter((k) => !held.includes(k))) await p.keyboard.down(k);
        held = next;
        await p.waitForTimeout(180);
      }
      throw Error('Public walking deadline');
    } finally {
      for (const k of held) await p.keyboard.up(k);
    }
  }
  const herbs = () =>
    p.evaluate(() =>
      window
        .proofItems()
        .filter((i) => i.template.id === 'material.world.wild_herb')
        .reduce((n, i) => n + i.instance.quantity, 0),
    );
  async function exchange(selector) {
    await p.locator(selector).tap();
    const seq = await p.evaluate(() => window.serviceSeq);
    await p.waitForFunction(
      (seq) => window.proofFrames.some((m) => m.t === 'inventory.updated' && m.ack === seq),
      seq,
    );
  }
  try {
    await login();
    const release = await (await p.request.get(URL + '/release.json')).json();
    check(
      'Public final release SHA',
      release.commit === process.env.EXPECTED_DEPLOY_SHA,
      release.commit,
    );
    check(
      'Production debug hook absent',
      await p.evaluate(() => typeof window.__mmo === 'undefined'),
    );
    check(
      'All five new main quests delivered by server',
      await p.evaluate(() =>
        [
          'marches_call',
          'marches_supply',
          'marches_boundary',
          'marches_vault',
          'marches_home',
        ].every((id) =>
          window.proofFrames
            .filter((m) => m.t === 'quest.log')
            .at(-1)
            ?.d.quests.some((q) => q.questId === 'quest.greenvale.' + id),
        ),
      ),
    );
    check(
      'Reserved fixture is in Marches',
      (await p.evaluate(() => window.proofFrames.find((m) => m.t === 'auth.ok').d.zoneId)) ===
        'zone.aurelian.greenvale_marches',
    );
    await walk(290, 398);
    await p.waitForFunction(() =>
      document.querySelector('.prompt')?.textContent.toLowerCase().includes('gather'),
    );
    const before = await herbs();
    await p.locator('[data-testid=touch-interact]').tap();
    await p.waitForFunction(
      (n) =>
        window
          .proofItems()
          .filter((i) => i.template.id === 'material.world.wild_herb')
          .reduce((n, i) => n + i.instance.quantity, 0) ===
        n + 2,
      before,
    );
    check('Public shared herb grant', (await herbs()) === before + 2);
    for (const xy of [
      [294, 390],
      [274, 390],
      [264, 403],
    ])
      await walk(...xy);
    await p.locator('[data-testid=touch-interact]').tap();
    await p.locator('[data-service="service.greenvale.sell_wild_herb"]').waitFor();
    await exchange('[data-service="service.greenvale.sell_wild_herb"]');
    check('Real public NPC material sale', (await herbs()) === before + 1);
    const ids = await p.evaluate(() => window.proofItems().map((i) => i.instance.id));
    await exchange('[data-service="service.greenvale.buy_cap"]');
    const cap = await p.evaluate(
      (ids) =>
        window
          .proofItems()
          .find(
            (i) => !ids.includes(i.instance.id) && i.template.id === 'armor.leather.trapper_cap',
          ),
      ids,
    );
    check('Public paid unique equipment', !!cap);
    await p.getByLabel('Sell backpack item').selectOption(cap.instance.id);
    await exchange('[data-testid=vendor-sell]');
    check(
      'Public specific-instance sale',
      await p.evaluate(
        (id) => !window.proofItems().some((i) => i.instance.id === id),
        cap.instance.id,
      ),
    );
    await p.setViewportSize({ width: 390, height: 844 });
    const select = await p.getByLabel('Sell backpack item').boundingBox();
    const button = await p.locator('[data-testid=vendor-sell]').boundingBox();
    check(
      'Touch vendor stays within phone viewport',
      select &&
        select.x >= 0 &&
        select.x + select.width <= 390 &&
        select.height >= 44 &&
        button.height >= 44,
    );
    await p.screenshot({ path: OUT + '/vendor-touch.png' });
    await p.getByRole('button', { name: 'Close dialogue', exact: true }).tap();
    await walk(270, 390);
    await p.locator('[data-testid=touch-interact]').tap();
    await p.locator('[data-testid=banker-vault]').tap();
    await p.locator('[data-window=bank]').waitFor();
    check('Public local banker opens real vault', true);
    await p.screenshot({ path: OUT + '/banker-touch.png' });
    await p.getByRole('button', { name: 'Close Bank', exact: true }).tap();
    await p.locator('[data-open=world]').tap();
    check(
      'New places visible in public atlas',
      (await p.getByText(/Broken Vault Outer Gallery/).count()) > 0,
    );
    await p.screenshot({ path: OUT + '/atlas-touch.png' });
    await login();
    check(
      'Sale/material stock survive password relog',
      (await herbs()) === before + 1 &&
        (await p.evaluate(
          (id) => !window.proofItems().some((i) => i.instance.id === id),
          cap.instance.id,
        )),
    );
    check(
      'Discovery survives public relog',
      await p.evaluate(() =>
        window.proofFrames
          .filter((m) => m.t === 'world.discoveries')
          .at(-1)
          ?.d.locationIds.includes('location.greenvale_marches.town'),
      ),
    );
    check(
      'No protocol/browser errors',
      errors.length === 0 &&
        (await p.evaluate(() => !window.proofFrames.some((m) => m.t === 'error'))),
      errors,
    );
    const readiness = await (await p.request.get(URL + '/realtime/health/ready')).json();
    check('Public realtime ready', readiness.status === 'ok' && readiness.zones?.length === 25);
    fs.writeFileSync(
      OUT + '/proof.json',
      JSON.stringify(
        { url: URL, release, checks, errors, hostedZones: readiness.zones.length },
        null,
        2,
      ),
    );
  } finally {
    await browser.close();
    fs.writeFileSync(OUT + '/checks.json', JSON.stringify({ checks, errors }, null, 2));
  }
})().catch((e) => {
  console.error(String(e.message).replaceAll(password, '[redacted]'));
  process.exitCode = 1;
});
