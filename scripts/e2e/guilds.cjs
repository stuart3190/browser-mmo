/* eslint-disable */
// Two real players form and administer a persistent guild through desktop and touch UI.
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const { enter } = require(
  process.env.PROOF_PASSWORD_FILE ? './production-enter.cjs' : './vertical-slice.cjs',
);
const fs = require('node:fs');
const OUT = process.argv[2] || '/tmp/bo-guilds-browser';
fs.mkdirSync(OUT, { recursive: true });
const tls = process.env.QUAL_LOCAL_TLS === 'true';
if (tls && !['localhost', '127.0.0.1'].includes(new URL(process.env.WEB_URL).hostname))
  throw Error('TLS test exception is loopback only');
const checks = [],
  errors = [],
  failures = [];
function check(name, ok, detail) {
  checks.push({ name, ok: !!ok, detail });
  fs.writeFileSync(`${OUT}/proof.json`, JSON.stringify({ checks, errors }, null, 2));
  if (!ok) throw Error(name);
  console.log('PASS', name);
}
const nameOf = (s) =>
  s
    .replace(/_/g, '')
    .replace(/[0-9]/g, (d) => 'abcdefghij'[+d])
    .slice(0, 20);
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome',
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
  const desktop = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      ignoreHTTPSErrors: tls,
    }),
    phone = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      ignoreHTTPSErrors: tls,
    });
  const a = await desktop.newPage(),
    b = await phone.newPage();
  for (const p of [a, b]) {
    p.setDefaultTimeout(30000);
    p.on('pageerror', (e) => errors.push(e.message));
    p.on('requestfailed', (r) =>
      failures.push({ path: new URL(r.url()).pathname, error: r.failure()?.errorText }),
    );
  }
  const stamp = Date.now().toString(36),
    userA = process.env.FRIENDS_USER_A || `guilda_${stamp}`,
    userB = process.env.FRIENDS_USER_B || `guildb_${stamp}`,
    nameA = nameOf(userA),
    nameB = nameOf(userB),
    guildName = `Dawn ${stamp}`,
    tag = stamp.slice(-5).toUpperCase();
  const click = async (p, loc) => {
    await p.bringToFront();
    await loc[p === b ? 'tap' : 'click']();
  };
  const button = (p, name) => click(p, p.getByRole('button', { name, exact: true }));
  const tab = (p, name) => click(p, p.getByRole('tab', { name }));
  const open = async (p) => {
    await click(p, p.locator('[data-open=guild]'));
    await p.getByRole('dialog', { name: 'Guild', exact: true }).waitFor();
  };
  const text = async (p, value) =>
    p.waitForFunction(
      (v) => document.querySelector('[data-window=guild]')?.textContent.includes(v),
      value,
    );
  const message = async (p, value) => {
    await p.getByLabel('Guild message', { exact: true }).fill(value);
    await button(p, 'Send to guild');
    await text(p, value);
  };
  try {
    const create = process.env.GUILDS_EXISTING !== '1';
    await enter(a, userA, create);
    await enter(b, userB, create, 'class.mage');
    await open(a);
    await a.getByLabel('Guild name', { exact: true }).fill(guildName);
    await a.getByLabel('Guild tag', { exact: true }).fill(tag);
    await button(a, 'Found guild');
    await text(a, guildName);
    check(
      'A real character founds a guild with the selected name and tag',
      await a
        .locator('.guild-title')
        .textContent()
        .then((t) => t.includes(tag)),
    );
    await tab(a, 'Guild settings');
    await a.getByLabel('Invite character', { exact: true }).fill(nameB);
    await button(a, 'Send guild invitation');
    await text(a, 'Guild invitation sent');
    await open(b);
    await text(b, guildName);
    check(
      'Invitation requires consent before guild chat becomes available',
      (await b.getByRole('log', { name: 'Guild messages' }).count()) === 0,
    );
    await button(b, `Join ${guildName}`);
    await text(b, 'Members (2/50)');
    await tab(a, 'Guild chat');
    await message(a, '<b>Welcome to the guild</b>');
    await text(b, '<b>Welcome to the guild</b>');
    check(
      'Guild chat reaches an accepted member as literal text',
      (await b.getByRole('log', { name: 'Guild messages' }).locator('b').count()) === 0,
    );
    await message(b, 'Ready for the next expedition');
    await text(a, 'Ready for the next expedition');
    for (let i = 0; i < 3; i++)
      await message(
        a,
        `Chronicle ${i}: ${'We will meet beyond the old gate when the company is ready. '.repeat(4)}`,
      );
    await text(b, 'Chronicle 2:');
    const log = b.getByRole('log', { name: 'Guild messages' });
    check(
      'New guild messages follow the end of the conversation',
      await log.evaluate((el) => el.scrollHeight - el.scrollTop - el.clientHeight < 32),
    );
    await log.hover();
    await b.mouse.wheel(0, -1000);
    await b.waitForTimeout(200);
    await message(a, 'A new message while you review earlier guild history');
    await text(b, 'A new message while you review earlier guild history');
    check(
      'Incoming guild chat preserves a reader’s scrollback position',
      await log.evaluate((el) => el.scrollTop < 32),
    );
    await a.screenshot({ path: `${OUT}/desktop-chat.png` });
    await b.screenshot({ path: `${OUT}/portrait-chat.png` });
    const portrait = await b.locator('[data-window=guild]').boundingBox();
    check(
      'Portrait guild sheet stays within the viewport',
      portrait.y >= 0 &&
        portrait.x >= 0 &&
        portrait.y + portrait.height <= 845 &&
        portrait.x + portrait.width <= 391,
      portrait,
    );
    await enter(b, userB, false);
    await open(b);
    await text(b, 'Ready for the next expedition');
    await text(b, '<b>Welcome to the guild</b>');
    check('Membership and both messages survive a fresh login', true);
    await b.setViewportSize({ width: 844, height: 390 });
    await b.screenshot({ path: `${OUT}/landscape-chat.png` });
    const landscape = await b.locator('[data-window=guild]').boundingBox();
    check(
      'Landscape guild sheet stays within the viewport',
      landscape.y >= 0 && landscape.y + landscape.height <= 391,
      landscape,
    );
    const composer = await b
      .getByRole('button', { name: 'Send to guild', exact: true })
      .boundingBox();
    check(
      'Landscape keeps the guild composer visible below scrollable history',
      composer.y >= landscape.y &&
        composer.y + composer.height <= landscape.y + landscape.height &&
        (await b
          .getByRole('log', { name: 'Guild messages' })
          .evaluate((el) => el.clientHeight >= 40)),
      composer,
    );
    await b.setViewportSize({ width: 390, height: 844 });
    await tab(b, 'Guild settings');
    check(
      'Ordinary members are not offered officer controls',
      (await b.getByLabel('Invite character', { exact: true }).count()) === 0,
    );
    await tab(a, /Members/);
    await button(a, `Promote ${nameB}`);
    await b.getByLabel('Guild notice', { exact: true }).waitFor();
    await b.getByLabel('Guild notice', { exact: true }).fill('Meet at the Broken Vault');
    await button(b, 'Save guild notice');
    await text(a, 'Meet at the Broken Vault');
    check('Leader promotion enables officer notice editing for the other player', true);
    await button(a, `Make leader ${nameB}`);
    await button(a, 'Confirm guild change');
    await tab(b, /Members/);
    await b.getByRole('button', { name: `Remove ${nameA}`, exact: true }).waitFor();
    check(
      'Confirmed leadership transfer gives the new leader membership controls',
      (await a.getByRole('button', { name: `Remove ${nameB}`, exact: true }).count()) === 0,
    );
    await tab(a, 'Guild settings');
    await button(a, 'Leave guild');
    await button(a, 'Confirm guild change');
    await a.getByRole('button', { name: 'Found guild', exact: true }).waitFor();
    check(
      'Leaving clears private chat and requires a new invitation',
      (await a.getByRole('log', { name: 'Guild messages' }).count()) === 0,
    );
    await tab(b, 'Guild settings');
    await button(b, 'Disband guild');
    await button(b, 'Confirm guild change');
    await b.getByRole('button', { name: 'Found guild', exact: true }).waitFor();
    await enter(b, userB, false);
    await open(b);
    await b.getByRole('button', { name: 'Found guild', exact: true }).waitFor();
    check('Explicit disband survives relog and releases membership', true);
    check('No browser exceptions', errors.length === 0, errors);
  } catch (e) {
    fs.writeFileSync(`${OUT}/failure.txt`, e.stack || String(e));
    fs.writeFileSync(`${OUT}/network-failures.json`, JSON.stringify(failures, null, 2));
    await a.screenshot({ path: `${OUT}/failure-desktop.png` }).catch(() => {});
    await b.screenshot({ path: `${OUT}/failure-phone.png` }).catch(() => {});
    throw e;
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
