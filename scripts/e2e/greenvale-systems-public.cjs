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
  const c = await browser.newContext({
    viewport: { width: 800, height: 600 },
    hasTouch: true,
    deviceScaleFactor: 0.5,
  });
  const p = await c.newPage(),
    errors = [],
    protocolErrors = [];
  await c.exposeBinding('recordProtocolError', (_source, frame) => protocolErrors.push(frame));
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
          if (m.t === 'error') window.recordProtocolError(m);
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
              'systems.state',
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
        document.querySelector('[data-testid=continue-browser]') ||
        (window.proofFrames.some((m) => m.t === 'zone.snapshot') &&
          window.proofFrames.some((m) => m.t === 'inventory.snapshot')),
    );
    if (await p.locator('[data-testid=continue-browser]').isVisible())
      await p.locator('[data-testid=continue-browser]').tap();
    await p.waitForFunction(
      () =>
        window.proofFrames.some((m) => m.t === 'zone.snapshot') &&
        window.proofFrames.some((m) => m.t === 'inventory.snapshot'),
    );
    await p.waitForFunction(() => window.proofFrames.some((m) => m.t === 'systems.state'));
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
      'Public deployed SHA',
      release.commit === process.env.EXPECTED_DEPLOY_SHA,
      release.commit,
    );
    check(
      'Production debug hook absent',
      await p.evaluate(() => typeof window.__mmo === 'undefined'),
    );
    await p.waitForFunction(() => window.proofFrames.some((m) => m.t === 'systems.state'));
    const systems = () =>
      p.evaluate(() => window.proofFrames.filter((m) => m.t === 'systems.state').at(-1).d);
    const before = await systems();
    check('Four authoritative professions available', before.professions.length === 4);
    const arrival = await p.evaluate(() => window.proofPosition);
    if (arrival.z >= 405)
      for (const xy of [
        [264, 418],
        [294, 418],
        [294, 400],
      ])
        await walk(...xy);
    await walk(290, 400);
    await p.waitForFunction(() =>
      document.querySelector('.prompt')?.textContent.toLowerCase().includes('gather'),
    );
    const herbBefore = await herbs();
    await p.locator('[data-testid=touch-interact]').tap();
    await p.waitForFunction(
      (n) =>
        window
          .proofItems()
          .filter((i) => i.template.id === 'material.world.wild_herb')
          .reduce((n, i) => n + i.instance.quantity, 0) > n,
      herbBefore,
    );
    check(
      'Public harvest earns profession XP',
      (await systems()).professions.find((p) => p.id === 'herbalism').xp >
        before.professions.find((p) => p.id === 'herbalism').xp,
    );
    for (const xy of [
      [294, 418],
      [270, 418],
      [264, 412],
    ])
      await walk(...xy);
    await p.locator('[data-testid=touch-interact]').tap();
    await p.locator('[data-service="service.greenvale.craft_remedy"]').waitFor();
    await exchange('[data-service="service.greenvale.craft_remedy"]');
    await p.getByRole('button', { name: 'Close dialogue', exact: true }).tap();
    await p.locator('[data-open=professions]').tap();
    const job = (await systems()).jobs.find((j) => !j.completed);
    check('Public timed craft reserved', !!job, job);
    await p.screenshot({ path: OUT + '/timed-craft.png' });
    await login();
    await p.locator('[data-open=professions]').tap();
    await p.waitForTimeout(5500);
    await p.locator(`[data-craft-finish="${job.id}"]`).tap();
    await p.waitForFunction(
      (id) =>
        window.proofFrames
          .filter((m) => m.t === 'systems.state')
          .at(-1)
          .d.jobs.some((j) => j.id === id && j.completed),
      job.id,
    );
    check('Public timed craft survives password relog and completes', true);
    check(
      'Public craft pays Fieldcraft XP once',
      (await systems()).professions.find((p) => p.id === 'crafting').xp ===
        before.professions.find((p) => p.id === 'crafting').xp + 20,
    );
    check(
      'Real crafted remedy in authoritative inventory',
      await p.evaluate(() =>
        window.proofItems().some((i) => i.template.id === 'consumable.greenvale.remedy'),
      ),
    );
    await p.setViewportSize({ width: 390, height: 844 });
    check(
      'Public touch Skills window fits',
      await p.locator('[data-window=professions]').evaluate((el) => {
        const r = el.getBoundingClientRect();
        return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight;
      }),
    );
    check(
      'Public private-dungeon guidance available',
      (await p.locator('[data-window=professions]').innerText()).includes('Broken Vault'),
    );
    await p.screenshot({ path: OUT + '/skills-touch.png' });
    await login();
    check(
      'Craft result persists across another password relog',
      (await systems()).jobs.some((j) => j.id === job.id && j.completed),
    );
    check('No protocol/browser errors', errors.length === 0 && protocolErrors.length === 0, {
      errors,
      protocolErrors,
    });
    const readiness = await (await p.request.get(URL + '/realtime/health/ready')).json();
    check('Public realtime ready', readiness.status === 'ok' && readiness.zones.length === 25);
    fs.writeFileSync(
      OUT + '/proof.json',
      JSON.stringify(
        { url: URL, release, checks, errors, protocolErrors, hostedZones: readiness.zones.length },
        null,
        2,
      ),
    );
  } finally {
    try {
      await p.screenshot({ path: OUT + '/last.png' });
      const diagnostic = await p.evaluate(() => ({
        body: document.body.innerText,
        position: window.proofPosition,
        items: window.proofItems().map((i) => ({
          id: i.instance.id,
          templateId: i.template.id,
          quantity: i.instance.quantity,
        })),
        errors: window.proofFrames.filter((m) => m.t === 'error'),
      }));
      fs.writeFileSync(
        OUT + '/diagnostic.json',
        JSON.stringify(diagnostic, null, 2).replaceAll(password, '[redacted]'),
      );
    } catch {}
    await browser.close();
    fs.writeFileSync(
      OUT + '/checks.json',
      JSON.stringify({ checks, errors, protocolErrors }, null, 2),
    );
  }
})().catch((e) => {
  console.error(String(e.stack || e.message).replaceAll(password, '[redacted]'));
  process.exitCode = 1;
});
