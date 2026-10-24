/* eslint-disable */
// Built-client functional review against isolated gameplay services. No development hook,
// game-state injection or player writes outside actual login and UI controls.
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const { Client } = require('../../packages/db/node_modules/pg');
const fs = require('node:fs');
const out = process.argv[2] || '/tmp/bo-built-game';
fs.mkdirSync(out, { recursive: true });
const checks = [],
  errors = [];
function check(name, ok, detail) {
  checks.push({ name, ok: !!ok, detail });
  console.log(ok ? 'PASS' : 'FAIL', name);
  if (!ok) throw Error(name);
}
async function earnedActor(classId) {
  const u = new URL(process.env.DATABASE_URL);
  if (u.hostname !== '127.0.0.1' || u.pathname !== '/qualification_dev')
    throw Error('Disposable qualification DB required');
  const db = new Client({ connectionString: u.toString() });
  await db.connect();
  try {
    const { rows } = await db.query(
      'select a.username from characters c join accounts a on a.id=c.account_id where c.class_id=$1 and exists(select 1 from character_quests q where q.character_id=c.id and q.quest_id=$2 and q.status=$3) order by c.created_at desc limit 1',
      [classId, 'quest.greenvale.three_watches', 'completed'],
    );
    if (!rows.length) throw Error('Completed earned epilogue actor required');
    return rows[0].username;
  } finally {
    await db.end();
  }
}
(async () => {
  const browser = await chromium.launch({
    executablePath: '/usr/bin/google-chrome',
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  let page;
  try {
    for (const touch of [false, true]) {
      const label = touch ? 'Mage-touch' : 'Warrior-desktop',
        username = await earnedActor(touch ? 'class.mage' : 'class.warrior');
      const context = await browser.newContext({
        viewport: touch ? { width: 390, height: 844 } : { width: 1100, height: 740 },
        hasTouch: touch,
        isMobile: touch,
      });
      page = await context.newPage();
      page.setDefaultTimeout(45000);
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('response', (r) => {
        if (
          r.status() >= 400 &&
          ['document', 'script', 'stylesheet', 'image'].includes(r.request().resourceType())
        )
          errors.push(`${r.status()} ${new URL(r.url()).pathname}`);
      });
      page.on('console', (m) => {
        if (m.type() === 'error') console.log('BROWSER ERROR', m.text(), m.location().url);
      });
      const click = (l) => l[touch ? 'tap' : 'click']();
      async function login() {
        await page.goto(process.env.WEB_URL);
        await page.fill('[name=username]', username);
        await click(page.locator('#login-form button'));
        await click(page.locator('#char-list button').first());
        await page.waitForFunction(
          () =>
            document.querySelector('[data-testid=player-hp]') ||
            document.querySelector('[data-testid=continue-browser]'),
        );
        if (await page.getByTestId('continue-browser').isVisible())
          await click(page.getByTestId('continue-browser'));
        await page.getByTestId('player-hp').waitFor();
      }
      await login();
      check(
        `${label} loads actual built scripts without a development hook`,
        await page.evaluate(
          () =>
            !window.__mmo &&
            [...document.scripts].some((s) => new URL(s.src).pathname.startsWith('/assets/')),
        ),
      );
      await click(page.locator('[data-open=quests]'));
      await click(page.getByRole('tab', { name: 'Completed', exact: true }));
      for (const id of [
        'quest.greenvale.three_watches',
        'quest.amber_coast.daily_watch',
        'quest.elderwood.daily_watch',
      ])
        check(
          `${label} retains ${id}`,
          (await page
            .locator(`[data-window=quests] [data-quest="${id}"][data-state=completed]`)
            .count()) === 1,
        );
      const patrol = page.locator('[data-quest="quest.elderwood.daily_watch"]');
      await patrol.getByTestId('quest-repeat').scrollIntoViewIfNeeded();
      check(
        `${label} built journal displays patrol availability`,
        (await patrol.getByTestId('quest-repeat').innerText()).includes('Available again'),
      );
      await page.screenshot({ path: `${out}/${label}-journal.png` });
      await click(page.getByRole('button', { name: 'Close Quests', exact: true }));
      await click(page.locator('[data-open=character]'));
      const book = page.getByTestId('combat-handbook');
      await click(book.locator('summary'));
      check(
        `${label} built class reference contains four abilities`,
        (await book.locator('[data-handbook-ability]').count()) === 4,
      );
      await click(page.locator('[data-window=character] .window-header .icon-button'));
      await click(page.locator('[data-open=world]'));
      check(
        `${label} built regional chart locates its character`,
        await page.getByTestId('atlas-player').isVisible(),
      );
      await click(page.getByRole('button', { name: 'Close World / Travel', exact: true }));
      await click(page.locator('[data-open=settings]'));
      await click(page.getByRole('button', { name: 'Reset camera view', exact: true }));
      check(
        `${label} built camera reset returns to the world`,
        !(await page.locator('[data-window=settings]').isVisible()),
      );
      await page.screenshot({ path: `${out}/${label}-world.png` });
      await login();
      check(
        `${label} built client rejoins after reload`,
        await page.getByTestId('player-hp').isVisible(),
      );
      await context.close();
    }
    check('No built-client exceptions or failed assets', errors.length === 0, errors);
    fs.writeFileSync(
      `${out}/proof.json`,
      JSON.stringify(
        {
          ok: true,
          checks,
          errors,
          scope:
            'Built game assets against private loopback test services; existing earned actors, UI only; no deployment or release-readiness claim',
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
