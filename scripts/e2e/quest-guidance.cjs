/* eslint-disable */
// Fresh opening quest, generic handoff/hunt guidance, real movement and desktop/touch log selection.
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const { enter, walk } = require('./vertical-slice.cjs');
const fs = require('fs');
(async () => {
  let b = await chromium.launch({
    executablePath: '/usr/bin/google-chrome',
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  let p = await b.newPage({ viewport: { width: 1100, height: 740 }, hasTouch: true });
  let errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  let checks = [];
  function check(name, ok, detail) {
    checks.push({ name, ok: !!ok, detail });
    console.log(ok ? 'PASS' : 'FAIL', name, detail || '');
    if (!ok) throw Error(name);
  }
  try {
    await enter(p, `nav_${Date.now().toString(36)}`, true);
    await p.waitForFunction(() =>
      document
        .querySelector('[data-testid=quest-guide]')
        ?.textContent.includes('Speak to Elder Maren'),
    );
    await walk(p, 0, 6);
    await walk(p, -6, 6, 2.5);
    await p.keyboard.press('KeyE');
    await p.locator('[data-testid=quest-accept]').click();
    await p.getByRole('button', { name: 'Goodbye', exact: true }).click();
    await p.waitForFunction(() =>
      document.querySelector('[data-testid=quest-guide]')?.textContent.includes('Grey Wolves'),
    );
    check('Fresh opening quest changes giver guidance into hunt objective', true);
    await p.locator('[data-testid=quest-guide]').click();
    await p.locator('[data-testid=quest-track]').click();
    await p.keyboard.press('Escape');
    check('Desktop compass and quest selection work', true);
    for (const [width, height] of [
      [390, 844],
      [844, 390],
    ]) {
      await p.setViewportSize({ width, height });
      await p.locator('[data-testid=quest-guide]').tap();
      let r = await p.locator('[data-testid=quest-track]').boundingBox();
      check(`Touch track target ${width}x${height} is at least 44px`, r && r.height >= 44, r);
      await p.locator('[data-testid=quest-track]').tap();
      await p.keyboard.press('Escape');
      let guide = await p.locator('[data-testid=quest-guide]').boundingBox();
      check(
        `Touch compass ${width}x${height} is in bounds`,
        guide &&
          guide.x >= 0 &&
          guide.y >= 0 &&
          guide.x + guide.width <= width &&
          guide.y + guide.height <= height,
        guide,
      );
    }
    check('No browser exceptions', errors.length === 0, errors);
  } finally {
    fs.writeFileSync('/tmp/quest-guidance-checks.json', JSON.stringify(checks, null, 2));
    await b.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
