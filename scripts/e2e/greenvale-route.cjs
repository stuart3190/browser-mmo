/* eslint-disable */
// Fresh four-quest route. Real UI travel/combat only; no grants, teleports or progress injection.
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const { enter, walk } = require('./vertical-slice.cjs');
const fs = require('fs');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const user = `route_${Date.now().toString(36)}`;
const notes = [];
const out = process.argv[2] || '/tmp/greenvale-route';
fs.mkdirSync(out, { recursive: true });
(async () => {
  const browser = await chromium.launch({
    executablePath: '/usr/bin/google-chrome',
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
  const p = await browser.newPage({ viewport: { width: 1100, height: 740 } });
  p.setDefaultTimeout(30000);
  p.on('pageerror', (e) => notes.push({ error: e.message }));
  try {
    await enter(p, user, true);
    console.log('USER', user);
    fs.writeFileSync(`${out}/user`, user);
    const state = () =>
      p.evaluate(() => ({
        pos: window.__mmo.position,
        q: window.__mmo.quests,
        v: window.__mmo.vitals,
      }));
    async function go(x, z, r = 1.6) {
      await p.bringToFront();
      await walk(p, x, z, r);
    }
    async function talk(q, action) {
      await p.keyboard.press('KeyE');
      await p.locator(`[data-quest="${q}"] [data-testid="quest-${action}"]`).click();
      await p.getByRole('button', { name: 'Close dialogue', exact: true }).click();
      notes.push({ quest: q, action, at: Date.now(), state: await state() });
      console.log(q, action);
    }
    async function fight(ref) {
      await p.keyboard.press('Tab');
      for (let i = 0; i < 90; i++) {
        let s = await p.evaluate(
          (ref) => ({
            t: window.__mmo.target,
            e: window.__mmo.enemies.filter((e) => !e.dead && (!ref || e.refId === ref)),
            pos: window.__mmo.position,
            v: window.__mmo.vitals,
          }),
          ref,
        );
        if (s.v.dead) throw Error('death during ' + ref);
        let e = s.e.find((e) => e.id === s.t.id) || s.e[0];
        if (!e) return;
        if (s.t.id !== e.id) {
          await p.keyboard.press('Tab');
          await sleep(150);
          continue;
        }
        const ep = await p.evaluate((id) => window.__mmo.entityPos(id), e.id);
        if (Math.hypot(ep.x - s.pos.x, ep.z - s.pos.z) > 2.3) await go(ep.x, ep.z, 2);
        if (!s.t.attacking) await p.keyboard.press('KeyF');
        await p.keyboard.press('Digit1');
        await p.keyboard.press('Digit2');
        await sleep(1200);
        const dead = await p.evaluate(
          (id) => window.__mmo.enemies.find((e) => e.id === id)?.dead !== false,
          e.id,
        );
        if (dead) return;
      }
      throw Error('fight deadline');
    }
    await go(8, -14);
    await p.keyboard.press('KeyE');
    await p.waitForFunction(() =>
      window.__mmo.items.some((i) => i.templateId === 'weapon.sword.iron_longsword'),
    );
    await p.keyboard.press('KeyB');
    await p.getByRole('button', { name: 'Iron Longsword', exact: true }).click();
    await p.locator('[data-action=equip]').click();
    await p.keyboard.press('Escape');
    await go(0, -10);
    await go(0, 6);
    await go(-6, 6, 2.5);
    await talk('quest.greenvale.wolves_at_the_edge', 'accept');
    for (let n = 0; n < 12; n++) {
      await go(0, 45);
      await go(3, 62);
      await fight('enemy.greenvale.grey_wolf');
      await fight('enemy.greenvale.grey_wolf');
      const s = await state();
      console.log(
        'hunt',
        n,
        s.q.find((q) => q.questId === 'quest.greenvale.wolves_at_the_edge'),
      );
      if (
        s.q.find((q) => q.questId === 'quest.greenvale.wolves_at_the_edge')?.state ===
        'ready_to_turn_in'
      )
        break;
      await go(0, 38);
      await sleep(36000);
    }
    await go(0, 38);
    await go(0, 6);
    await go(-6, 6, 2.5);
    await talk('quest.greenvale.wolves_at_the_edge', 'turn-in');
    await talk('quest.greenvale.old_waystone', 'accept');
    async function south() {
      await go(0, 6);
      await go(0, -28);
      await go(4, -80);
      await go(-8, -90, 2.5);
    }
    async function north() {
      await go(4, -80);
      await go(0, -28);
      await go(0, 6);
      await go(-6, 6, 2.5);
    }
    await south();
    await p.keyboard.press('KeyE');
    await p.getByRole('button', { name: 'Close dialogue', exact: true }).click();
    await north();
    await talk('quest.greenvale.old_waystone', 'turn-in');
    await south();
    await talk('quest.greenvale.hollow_trail', 'accept');
    await go(-25, -88);
    await go(-40, -90);
    await go(-53, -92);
    await fight('enemy.greenvale.brackenmaw');
    await go(-40, -90);
    await go(-25, -88);
    await go(-8, -90, 2.5);
    await talk('quest.greenvale.hollow_trail', 'turn-in');
    await talk('quest.greenvale.root_wound', 'accept');
    await go(-25, -88);
    await go(-40, -90);
    await go(-40, -104);
    await go(-76, -104);
    await go(-76, -92);
    await go(-81, -89);
    await p.keyboard.press('Tab');
    await go(-90, -82, 2);
    await fight('enemy.greenvale.hollow_lantern');
    await go(-76, -92);
    await go(-76, -104);
    await go(-40, -104);
    await go(-40, -90);
    await go(-25, -88);
    await go(-8, -90, 2.5);
    await talk('quest.greenvale.root_wound', 'turn-in');
    await p.screenshot({ path: `${out}/complete.png` });
    console.log('COMPLETE', await state());
  } finally {
    fs.writeFileSync(`${out}/notes.json`, JSON.stringify({ user, notes }, null, 2));
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
