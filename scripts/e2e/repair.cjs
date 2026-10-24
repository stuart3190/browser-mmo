/* eslint-disable */
// Earned condition/repair journey: a fresh level-one Warrior, normal sword pickup, combat,
// road travel and merchant interaction. No DB mutation, grants, XP injection or teleportation.
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const { enter, walk } = require('./vertical-slice.cjs');
const fs = require('node:fs');
const out = process.argv[2] || '/tmp/bo-repair';
fs.mkdirSync(out, { recursive: true });
const checks = [],
  errors = [];
function check(name, ok, detail) {
  checks.push({ name, ok: !!ok, detail });
  console.log(ok ? 'PASS' : 'FAIL', name);
  if (!ok) throw Error(name);
}
(async () => {
  const browser = await chromium.launch({
    executablePath: '/usr/bin/google-chrome',
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  let context, page;
  const user = `repair_${Date.now().toString(36)}`;
  async function open(touch) {
    context = await browser.newContext({
      viewport: touch ? { width: 390, height: 844 } : { width: 1100, height: 740 },
      hasTouch: touch,
      isMobile: touch,
    });
    await context.addInitScript(() => {
      window.__repairEvents = [];
      const WS = WebSocket;
      window.WebSocket = class extends WS {
        constructor(...args) {
          super(...args);
          this.addEventListener('message', (e) => {
            try {
              const m = JSON.parse(e.data);
              if (['auth.ok', 'wallet.updated', 'combat.loot', 'error'].includes(m.t))
                window.__repairEvents.push(m);
            } catch {}
          });
        }
      };
    });
    page = await context.newPage();
    page.setDefaultTimeout(45000);
    page.on('pageerror', (e) => errors.push(e.message));
    await enter(page, user, !touch);
  }
  const sword = () =>
    page.evaluate(() =>
      window.__mmo.items.find(
        (i) => i.templateId === 'weapon.sword.iron_longsword' && i.location.kind === 'equipped',
      ),
    );
  try {
    await open(false);
    await walk(page, 8, -14);
    await page.keyboard.press('KeyE');
    await page.waitForFunction(() =>
      window.__mmo.items.some((i) => i.templateId === 'weapon.sword.iron_longsword'),
    );
    await page.keyboard.press('KeyB');
    await page.getByRole('button', { name: 'Iron Longsword', exact: true }).click();
    await page.locator('[data-action=equip]').click();
    await page.waitForFunction(() =>
      window.__mmo.items.some(
        (i) => i.templateId === 'weapon.sword.iron_longsword' && i.location.kind === 'equipped',
      ),
    );
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    const before = await sword();
    check(
      'Freshly picked-up sword starts in full condition',
      before.durability.current === before.durability.max,
      before,
    );
    await walk(page, 0, 10);
    await walk(page, 0, 48);
    await page.keyboard.press('Tab');
    await page.waitForFunction(() => window.__mmo.target.id);
    const target = await page.evaluate(() => window.__mmo.target.id);
    const pos = await page.evaluate((id) => window.__mmo.entityPos(id), target);
    await walk(page, pos.x, pos.z, 2);
    await page.keyboard.press('KeyF');
    await page.keyboard.press('Digit2');
    await page.waitForFunction(
      (id) => window.__mmo.enemies.find((e) => e.id === id)?.dead,
      target,
      { timeout: 30000 },
    );
    await page.waitForFunction(() =>
      window.__mmo.items.some(
        (i) => i.location.kind === 'equipped' && i.durability?.current < i.durability?.max,
      ),
    );
    const worn = await sword();
    check(
      'A real wolf victory wears the equipped sword exactly once',
      worn.durability.current === before.durability.current - 1,
      worn,
    );
    await page.keyboard.press('KeyC');
    check(
      'Character panel explains repair cost',
      (await page.locator('[data-testid=equipment-condition]').innerText()).includes('1 copper'),
    );
    await page.locator('[data-testid=equip-main_hand]').click();
    await page.screenshot({ path: `${out}/earned-wear.png` });
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await walk(page, 0, 86);
    await walk(page, 0, 116);
    await page.waitForFunction(() => !window.__mmo.vitals.inCombat);
    await page.keyboard.press('KeyM');
    await page
      .locator('[data-travel="travel.greenvale.north_gate.to.greenvale_marches.starter_gate"]')
      .click();
    await page.waitForFunction(
      () =>
        window.__repairEvents.filter((m) => m.t === 'auth.ok').at(-1)?.d.zoneId ===
        'zone.aurelian.greenvale_marches',
    );
    await page.keyboard.press('Escape');
    await walk(page, 256, 390);
    await walk(page, 264, 390);
    await walk(page, 264, 403, 2);
    await page.keyboard.press('KeyE');
    await page.locator('[data-testid=repair-all]').waitFor();
    check(
      'Provisioner offers the correct affordable repair',
      (await page.locator('[data-testid=repair-all]').innerText()).includes('1 copper'),
    );
    await page.screenshot({ path: `${out}/desktop-repair-quote.png` });
    await context.close();
    await open(true);
    await page.locator('[data-testid=touch-interact]').tap();
    const button = page.locator('[data-testid=repair-all]');
    await button.scrollIntoViewIfNeeded();
    check(
      'Earned wear persists through relogin on touch',
      (await sword()).durability.current === worn.durability.current,
    );
    const bounds = await button.boundingBox();
    check(
      'Repair is a visible touch-sized action',
      bounds.height >= 44 && bounds.y >= 0 && bounds.y + bounds.height <= 844,
      bounds,
    );
    const money = await page.evaluate(
      () =>
        window.__repairEvents
          .filter((m) => m.t === 'wallet.updated')
          .at(-1)
          .d.balances.find((b) => b.currencyId === 'gold').amount,
    );
    await page.screenshot({ path: `${out}/portrait-repair-quote.png` });
    await button.tap();
    await page.waitForFunction(() =>
      window.__mmo.items.some(
        (i) => i.location.kind === 'equipped' && i.durability?.current === i.durability?.max,
      ),
    );
    const after = await sword();
    const paid = await page.evaluate(
      () =>
        window.__repairEvents
          .filter((m) => m.t === 'wallet.updated')
          .at(-1)
          .d.balances.find((b) => b.currencyId === 'gold').amount,
    );
    check(
      'Touch repair restores the same sword and charges one copper',
      after.id === before.id &&
        after.durability.current === before.durability.max &&
        paid === money - 1,
      { after, money, paid },
    );
    check('Full equipment disables further repairs', await button.isDisabled());
    await page.screenshot({ path: `${out}/portrait-repaired.png` });
    await enter(page, user, false);
    check(
      'Repaired condition persists through another login',
      (await sword()).durability.current === before.durability.max,
    );
    check('No gameplay browser exceptions', errors.length === 0, errors);
    fs.writeFileSync(
      `${out}/proof.json`,
      JSON.stringify(
        {
          ok: true,
          fixture:
            'Fresh level-one character; no mutation/grants; earned sword pickup, kill, road travel and repair',
          checks,
          errors,
        },
        null,
        2,
      ),
    );
  } catch (e) {
    fs.writeFileSync(
      `${out}/failure.json`,
      JSON.stringify({ ok: false, error: e.stack, checks, errors }, null, 2),
    );
    await page?.screenshot({ path: `${out}/failure.png` }).catch(() => {});
    throw e;
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
