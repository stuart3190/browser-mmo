/* eslint-disable */
// Two real browser clients, real inputs and rewards. No DB writes or admin grants.
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const { walk, enter } = require('./vertical-slice.cjs');
const fs = require('node:fs');
const OUT = process.argv[2] || '/tmp/mmo-party-playthrough';
fs.mkdirSync(OUT, { recursive: true });
const checks = [];
function check(name, ok, detail) {
  checks.push({ name, ok: !!ok, detail });
  console.log(ok ? 'PASS' : 'FAIL', name, detail || '');
  if (!ok) throw Error(name);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function main() {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome',
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
  const context = await browser.newContext({
    hasTouch: true,
    viewport: { width: 1100, height: 740 },
  });
  await context.addInitScript(() => {
    window.__partyEvents = [];
    const WS = window.WebSocket;
    window.WebSocket = class extends WS {
      constructor(...args) {
        super(...args);
        this.addEventListener('message', (e) => {
          try {
            const m = JSON.parse(e.data);
            if (
              [
                'party.update',
                'combat.loot',
                'character.progress',
                'combat.death',
                'quest.log',
              ].includes(m.t)
            )
              window.__partyEvents.push(m);
          } catch {}
        });
      }
    };
  });
  const a = await context.newPage(),
    b = await context.newPage();
  const errors = [];
  for (const p of [a, b]) p.on('pageerror', (e) => errors.push(e.message));
  const suffix = Date.now().toString(36),
    users = process.env.PARTY_RESUME
      ? process.env.PARTY_RESUME.split(',')
      : [`guard_${suffix}`, `spark_${suffix}`];
  const party = (page) =>
    page.evaluate(() => window.__partyEvents.filter((m) => m.t === 'party.update').at(-1)?.d);
  const expectMembers = (page, n) =>
    page.waitForFunction(
      (n) =>
        window.__partyEvents.filter((m) => m.t === 'party.update').at(-1)?.d.members.length === n,
      n,
    );
  try {
    await enter(a, users[0], !process.env.PARTY_RESUME);
    await enter(b, users[1], !process.env.PARTY_RESUME, 'class.mage');
    fs.writeFileSync(`${OUT}/users.json`, JSON.stringify(users));
    if (process.env.PARTY_UI_ONLY && (await party(a))?.partyId) {
      await a.locator('[data-open=party]').click();
      await a.getByRole('button', { name: 'Disband party', exact: true }).click();
      await expectMembers(a, 0);
      await a.keyboard.press('Escape');
    }
    await a.locator('[data-open=party]').click();
    await a.getByRole('button', { name: /^Invite / }).click();
    await b.getByRole('button', { name: 'Accept party', exact: true }).click();
    await expectMembers(a, 2);
    await expectMembers(b, 2);
    check(
      'Invite/accept produces identical two-member realtime roster',
      JSON.stringify(await party(a)) === JSON.stringify(await party(b)),
    );
    await a.keyboard.press('Escape');
    await a.screenshot({ path: `${OUT}/01-party.png` });
    if (!process.env.PARTY_UI_ONLY) {
      if (!process.env.PARTY_RESUME) {
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
        for (const p of [a, b]) {
          await walk(p, 0, 0);
          await walk(p, -6, 5);
          await p.keyboard.press('KeyE');
          await p.locator('[data-testid=quest-accept]').click();
          await p.locator('[data-testid=dialogue-close]').click();
        }
        for (const p of [a, b]) {
          await walk(p, 0, 10);
          await walk(p, 0, 48);
        }
      }
      for (let kill = 0; kill < 2; kill++) {
        await a.keyboard.press('Tab');
        await a.waitForFunction(() => window.__mmo.target.id);
        const id = await a.evaluate(() => window.__mmo.target.id);
        const e = await a.evaluate((id) => window.__mmo.entityPos(id), id);
        await walk(a, e.x, e.z, 3);
        await a.keyboard.press('KeyF');
        await a.keyboard.press('Digit2');
        await b.keyboard.press('Tab');
        if (await b.evaluate((id) => window.__mmo.target.id === id, id))
          await b.keyboard.press('Digit2');
        for (const p of [a, b])
          await p.waitForFunction(
            (n) => window.__partyEvents.filter((m) => m.t === 'combat.loot').length >= n,
            kill + 1,
            { timeout: 60000 },
          );
        const rewards = await Promise.all(
          [a, b].map((p) =>
            p.evaluate(
              (n) => ({
                loot: window.__partyEvents.filter((m) => m.t === 'combat.loot')[n].d,
                xp: window.__partyEvents.filter(
                  (m) => m.t === 'character.progress' && m.d.xpGained > 0,
                )[n].d.xpGained,
              }),
              kill,
            ),
          ),
        );
        check(
          `Kill ${kill + 1}: both get split XP, only rotating owner gets loot`,
          rewards.every((r) => r.xp === 25) &&
            rewards[1 - kill].loot.items.length === 0 &&
            rewards[1 - kill].loot.gold === 0 &&
            rewards[kill].loot.items.length > 0,
          rewards.map((r) => ({ xp: r.xp, items: r.loot.items.length, gold: r.loot.gold })),
        );
      }
      for (const p of [a, b])
        await p.waitForFunction(
          () =>
            window.__mmo.quests
              .find((q) => q.questId === 'quest.greenvale.wolves_at_the_edge')
              ?.objectives.find((o) => o.id === 'kill_wolves').current === 2,
        );
      check('Both active quest logs receive exactly two kill credits', true);
      await a.screenshot({ path: `${OUT}/02-shared-hunt.png` });
      // Retreat and reconnect through normal login, keeping the same party and reward totals.
      for (const p of [a, b]) {
        await walk(p, 0, 32);
        await walk(p, 0, 8);
      }
    }
    const before = await party(b);
    await enter(b, users[1], false);
    await expectMembers(b, 2);
    check(
      'Reload/login restores party identity and split XP',
      (await party(b)).partyId === before.partyId &&
        (await b.evaluate(() => window.__mmo.progress.xp)) === 50,
    );
    await b.setViewportSize({ width: 390, height: 844 });
    const touch = await context.newCDPSession(b);
    await touch.send('Emulation.setTouchEmulationEnabled', { enabled: true });
    const tap = async (locator) => {
      const r = await locator.boundingBox();
      const points = [{ x: r.x + r.width / 2, y: r.y + r.height / 2 }];
      await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points });
      await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    };
    await b.locator('[data-open=party]').click();
    const buttons = await b.locator('[data-window=party] button').evaluateAll((xs) =>
      xs.map((x) => {
        const r = x.getBoundingClientRect();
        return {
          h: r.height,
          x: r.x,
          y: r.y,
          right: r.right,
          bottom: r.bottom,
          reachable: x.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)),
        };
      }),
    );
    check(
      'Phone party actions are reachable and at least 44 px high',
      buttons.every(
        (r) =>
          r.reachable && r.h >= 44 && r.x >= 0 && r.right <= 390 && r.y >= 0 && r.bottom <= 844,
      ),
      buttons,
    );
    await b.screenshot({ path: `${OUT}/03-phone-party.png` });
    await tap(b.getByRole('button', { name: 'Leave party', exact: true }));
    await expectMembers(a, 0);
    await expectMembers(b, 0);
    check('Leave dissolves a two-person party for both clients', true);
    await b.keyboard.press('Escape');
    await a.locator('[data-open=party]').click();
    await a.getByRole('button', { name: /^Invite / }).click();
    await tap(b.getByRole('button', { name: 'Accept party', exact: true }));
    await expectMembers(a, 2);
    await a.getByRole('button', { name: 'Disband party', exact: true }).click();
    await expectMembers(b, 0);
    check('Leader disband clears both clients', true);
    check('No browser exceptions', !errors.length, errors);
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
