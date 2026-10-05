/* eslint-disable */
// Existing completed Stillwater characters; real input/visits/rewards, no progress or position writes.
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const { enter, walk: travel } = require('./vertical-slice.cjs');
async function walk(...args) {
  for (let i = 0; i < 3; i++) {
    try {
      return await travel(...args);
    } catch (e) {
      if (!e.message.startsWith('Walk deadline') || i === 2) throw e;
      console.log('Continuing real travel after software-rendering deadline');
    }
  }
}
const fs = require('node:fs');
const OUT = process.argv[2] || '/tmp/mmo-well-records';
fs.mkdirSync(OUT, { recursive: true });
const Q = 'quest.greenvale.well_records',
  checks = [];
function check(name, ok, detail) {
  checks.push({ name, ok: !!ok, detail });
  console.log(ok ? 'PASS' : 'FAIL', name, detail || '');
  if (!ok) throw Error(name);
}
(async () => {
  const browser = await chromium.launch({
    executablePath: '/usr/bin/google-chrome',
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
  const contexts = await Promise.all([
    browser.newContext({ viewport: { width: 1100, height: 740 } }),
    browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true }),
  ]);
  const [a, b] = await Promise.all(contexts.map((c) => c.newPage()));
  const errors = [];
  for (const p of [a, b]) {
    p.setDefaultTimeout(60000);
    p.on('pageerror', (e) => errors.push(e.message));
  }
  try {
    await enter(a, process.env.WELL_DESKTOP_USER || 'guard_muu9vm2y', false);
    await enter(b, process.env.WELL_TOUCH_USER || 'spark_muu9vm2y', false);
    if (!process.env.WELL_RESUME) {
      await a.locator('[data-open=party]').click();
      const invite = a.getByRole('button', { name: /^Invite / });
      if (await invite.count()) {
        await invite.first().click();
        await b.getByRole('button', { name: 'Accept party', exact: true }).tap();
      }
      await a.keyboard.press('Escape');
      for (const p of [a, b]) {
        await p.bringToFront();
        check(
          'Unlocked continuation automatically guides back to Maren',
          (await p.locator('[data-testid=quest-guide]').innerText()).includes(
            'Speak to Elder Maren',
          ),
        );
        if (p === b) await p.locator('[data-testid=touch-interact]').tap();
        else await p.keyboard.press('KeyE');
        await p
          .locator(`[data-quest="${Q}"] [data-testid=quest-accept]`)
          [p === b ? 'tap' : 'click']();
        await p
          .getByRole('button', { name: 'Close dialogue', exact: true })
          [p === b ? 'tap' : 'click']();
      }
    }
    // Each member must personally survey. First player's visit cannot credit the waiting member.
    for (const p of [a, b]) {
      await p.bringToFront();
      if (
        !(await p.evaluate(
          (q) => window.__mmo.quests.find((x) => x.questId === q).objectives[0].done,
          Q,
        ))
      ) {
        await walk(p, 0, 6);
        await walk(p, 0, 12);
        await walk(p, 8, 12, 2);
        await p.waitForFunction(
          (q) => window.__mmo.quests.find((x) => x.questId === q).objectives[0].done,
          Q,
        );
        check(
          'Well arrival credited and guidance advances to culvert',
          (await p.locator('[data-testid=quest-guide]').innerText()).includes('Spring Culvert'),
        );
        if (p === a)
          check(
            'Party visit not copied to absent companion',
            await b.evaluate(
              (q) => !window.__mmo.quests.find((x) => x.questId === q).objectives[0].done,
              Q,
            ),
          );
      }
    }
    if (!process.env.WELL_RESUME) await a.screenshot({ path: `${OUT}/well-desktop.png` });
    // Touch joystick actually moves the player and updates guidance distance.
    await b.bringToFront();
    const joystick = await b.locator('[data-testid=joystick]').boundingBox();
    if (joystick) {
      const before = await b.evaluate(() => ({ ...window.__mmo.position }));
      const session = await contexts[1].newCDPSession(b);
      await session.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ x: joystick.x + joystick.width / 2, y: joystick.y + joystick.height / 2 }],
      });
      await session.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: joystick.x + joystick.width / 2, y: joystick.y + 15 }],
      });
      await b.waitForTimeout(1800);
      await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      check(
        'Actual touch joystick moves with guidance visible',
        await b.evaluate(
          (old) => Math.hypot(window.__mmo.position.x - old.x, window.__mmo.position.z - old.z) > 1,
          before,
        ),
      );
    } else throw Error('Joystick missing');
    for (const p of [a, b]) {
      await p.bringToFront();
      const ready = await p.evaluate(
        (q) => window.__mmo.quests.find((x) => x.questId === q).state === 'ready_to_turn_in',
        Q,
      );
      if (ready && !(await p.evaluate(() => window.__mmo.vitals.dead))) {
        await walk(p, 0, 110);
        await walk(p, 8, 110, 2);
      }
      if (!ready) {
        await walk(p, 0, 12);
        await walk(p, 0, 110);
        await walk(p, 8, 110, 2);
      }
      await p.waitForFunction(
        (q) => window.__mmo.quests.find((x) => x.questId === q).state === 'ready_to_turn_in',
        Q,
      );
      await p.waitForFunction(() =>
        document
          .querySelector('[data-testid=quest-guide]')
          ?.textContent.includes('Return to Elder Maren'),
      );
      check(
        'Survey complete, guidance directs return to Maren',
        (await p.locator('[data-testid=quest-guide]').innerText()).includes(
          'Return to Elder Maren',
        ),
      );
    }
    await b.screenshot({ path: `${OUT}/culvert-touch-landscape.png` });
    await b.setViewportSize({ width: 390, height: 844 });
    await b.waitForTimeout(1000);
    const bounds = await b.locator('[data-testid=quest-guide]').boundingBox();
    check(
      '390x844 portrait guidance fully visible and touch-sized',
      bounds &&
        bounds.x >= 0 &&
        bounds.y >= 0 &&
        bounds.x + bounds.width <= 390 &&
        bounds.y + bounds.height <= 844 &&
        bounds.height >= 44,
    );
    await b.screenshot({ path: `${OUT}/culvert-touch-portrait.png` });
    await b.setViewportSize({ width: 844, height: 390 });
    await a.evaluate(() => window.__mmo.dropConnection());
    await a
      .waitForFunction(() => window.__mmo.connection === 'open', null, { timeout: 30000 })
      .catch(() => {});
    await a.waitForTimeout(2500);
    check(
      'Reconnect preserves survey and turn-in guidance',
      (await a.locator('[data-testid=quest-guide]').innerText()).includes('Return to Elder Maren'),
    );
    for (const p of [a, b]) {
      await p.bringToFront();
      if (await p.evaluate(() => window.__mmo.vitals.dead)) {
        await p.getByRole('button', { name: 'Respawn', exact: true }).click();
        await p.waitForFunction(() => !window.__mmo.vitals.dead);
      }
      if (await p.evaluate(() => window.__mmo.position.z > 60)) await walk(p, 0, 110);
      await walk(p, 0, 6);
      await walk(p, -6, 6, 2.5);
      if (p === b) await p.locator('[data-testid=touch-interact]').tap();
      else await p.keyboard.press('KeyE');
      await p
        .locator(`[data-quest="${Q}"] [data-testid=quest-turn-in]`)
        [p === b ? 'tap' : 'click']();
      await p.waitForFunction(
        (q) => window.__mmo.quests.find((x) => x.questId === q).state === 'completed',
        Q,
      );
      check(
        'Personal persistent pendant reward received',
        await p.evaluate(() =>
          window.__mmo.items.some((x) => x.templateId === 'accessory.necklace.springward_pendant'),
        ),
      );
      await p
        .getByRole('button', { name: 'Close dialogue', exact: true })
        [p === b ? 'tap' : 'click']();
    }
    await b.locator('[data-open=inventory]').tap();
    await b.getByRole('button', { name: 'Springward Pendant', exact: true }).tap();
    await b.locator('[data-action=equip]').tap();
    await b.waitForFunction(() =>
      window.__mmo.items.some(
        (i) =>
          i.templateId === 'accessory.necklace.springward_pendant' &&
          i.location.kind === 'equipped',
      ),
    );
    check('Touch equip of persistent necklace succeeds', true);
    check('No browser exceptions', errors.length === 0, errors);
    await a.screenshot({ path: `${OUT}/return-desktop.png` });
  } finally {
    fs.writeFileSync(`${OUT}/checks.json`, JSON.stringify(checks, null, 2));
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
