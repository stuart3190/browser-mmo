/* eslint-disable */
// Ordinary level-one players inspect their class kit using desktop/touch controls.
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const { enter } = require('./vertical-slice.cjs');
const fs = require('node:fs');
const out = process.argv[2] || '/tmp/bo-handbook';
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
  let page;
  try {
    for (const touch of [false, true]) {
      const label = touch ? 'Mage' : 'Warrior';
      const context = await browser.newContext({
        viewport: touch ? { width: 390, height: 844 } : { width: 1100, height: 740 },
        isMobile: touch,
        hasTouch: touch,
      });
      page = await context.newPage();
      page.setDefaultTimeout(45000);
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => {
        if (m.type() === 'error') console.log('BROWSER ERROR', m.text());
      });
      page.on('requestfailed', (r) =>
        console.log('REQUEST FAILED', new URL(r.url()).pathname, r.failure()?.errorText),
      );
      page.on('response', (r) => {
        if (r.status() >= 400) console.log('HTTP ERROR', r.status(), new URL(r.url()).pathname);
      });
      const click = (l) => l[touch ? 'tap' : 'click']();
      await enter(
        page,
        `kit_${label.toLowerCase()}_${Date.now().toString(36)}`,
        true,
        touch ? 'class.mage' : 'class.warrior',
      );
      const before = await page.evaluate(() => JSON.stringify(window.__mmo.abilities));
      await click(page.locator('[data-open=character]'));
      const book = page.getByTestId('combat-handbook');
      check(
        `${label}: ability reference starts collapsed`,
        !((await book.getAttribute('open')) !== null),
      );
      const summary = book.locator('summary');
      await click(summary);
      const box = await summary.boundingBox();
      check(`${label}: inspect control is touch sized`, box.height >= 44);
      check(
        `${label}: four real class abilities are inspectable`,
        (await book.locator('[data-handbook-ability]').count()) === 4,
      );
      const text = await book.innerText();
      check(
        `${label}: future unlocks and current abilities are distinct`,
        text.includes('Unlocks at level 2') &&
          text.includes('Unlocks at level 3') &&
          text.includes('Learned'),
      );
      const utility = book.locator(
        `[data-handbook-ability="ability.${touch ? 'mage.frost_nova' : 'warrior.guard'}"]`,
      );
      check(
        `${label}: self effect explains range, recovery and target`,
        (await utility.innerText()).includes('20 seconds') &&
          (await utility.innerText()).includes('No target needed') &&
          (await utility.innerText()).includes(touch ? '6 m around you' : 'Yourself'),
      );
      await utility.scrollIntoViewIfNeeded();
      const closeBounds = await page
        .locator('[data-window=character] .window-header .icon-button')
        .boundingBox();
      check(
        `${label}: close stays on screen after reading the whole kit`,
        closeBounds &&
          closeBounds.y >= 0 &&
          closeBounds.y + closeBounds.height < page.viewportSize().height - 60,
      );
      await page.screenshot({ path: `${out}/${label}-utility.png` });
      check(
        `${label}: inspecting never casts or changes cooldowns`,
        before === (await page.evaluate(() => JSON.stringify(window.__mmo.abilities))),
      );
      await click(page.locator('[data-window=character] .window-header .icon-button'));
      check(
        `${label}: closes back to playable scene`,
        !(await page.locator('[data-window=character]').isVisible()),
      );
      await context.close();
    }
    check('No class handbook exceptions', errors.length === 0, errors);
    fs.writeFileSync(
      `${out}/proof.json`,
      JSON.stringify(
        {
          ok: true,
          fixture: 'Fresh actual level-one characters; inspection UI only, no DB player writes',
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
      JSON.stringify({ error: e.stack, checks, errors }, null, 2),
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
