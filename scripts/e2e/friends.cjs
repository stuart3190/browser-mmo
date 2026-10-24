/* eslint-disable */
// Two real players use friend requests, private messages, read receipts and blocking through the UI.
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const { enter } = require('./vertical-slice.cjs');
const fs = require('node:fs');
const OUT = process.argv[2] || '/tmp/bo-friends-browser';
fs.mkdirSync(OUT, { recursive: true });
const checks = [],
  errors = [];
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
  const desktop = await browser.newContext({ viewport: { width: 1280, height: 800 } }),
    phone = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
  const a = await desktop.newPage(),
    b = await phone.newPage();
  for (const p of [a, b]) {
    p.setDefaultTimeout(30000);
    p.on('pageerror', (e) => errors.push(e.message));
  }
  const stamp = Date.now().toString(36),
    userA = `frienda_${stamp}`,
    userB = `friendb_${stamp}`,
    nameA = nameOf(userA),
    nameB = nameOf(userB);
  async function click(p, loc) {
    await p.bringToFront();
    await loc[p === b ? 'tap' : 'click']();
  }
  async function button(p, name) {
    await click(p, p.getByRole('button', { name, exact: true }));
  }
  async function open(p) {
    await click(p, p.locator('[data-open=social]'));
    await p.locator('[data-window=social]').waitFor();
  }
  async function waitText(p, text) {
    await p.waitForFunction(
      (text) => document.querySelector('[data-window=social]')?.textContent.includes(text),
      text,
    );
  }
  async function invite(p, name) {
    await p.getByLabel('Add friend by character name', { exact: true }).fill(name);
    await button(p, 'Send friend request');
  }
  async function message(p, text) {
    await p.getByLabel('Direct message', { exact: true }).fill(text);
    await button(p, 'Send message');
  }
  try {
    await enter(a, userA, true);
    await enter(b, userB, true, 'class.mage');
    await open(a);
    await invite(a, nameB);
    await waitText(a, 'Request sent');
    check(
      'A friend request requires acceptance before a conversation can open',
      (await a.getByRole('button', { name: `Message ${nameB}`, exact: true }).count()) === 0,
    );
    await open(b);
    await waitText(b, 'Wants to be your friend');
    await button(b, 'Accept friend');
    await button(a, `Message ${nameB}`);
    await message(a, '<b>Private hello</b> — meet at the vault');
    await button(b, `Message ${nameA}`);
    await waitText(b, '<b>Private hello</b> — meet at the vault');
    check(
      'Accepted friend receives literal private text in the touch composer',
      !(await b.getByRole('log', { name: 'Direct messages' }).locator('b').count()),
    );
    await waitText(a, '· Read');
    check('Recipient viewing the message produces a server-backed read receipt', true);
    await message(b, 'Ready for our next adventure');
    await waitText(a, 'Ready for our next adventure');
    check('Private replies reach the other player', true);
    await button(a, 'Journal');
    check(
      'Desktop journal remains reachable above the expanded game menu',
      (await a
        .getByRole('button', { name: 'Journal', exact: true })
        .getAttribute('aria-expanded')) === 'true',
    );
    await button(a, 'Journal');
    await a.screenshot({ path: `${OUT}/01-desktop-conversation.png` });
    await b.screenshot({ path: `${OUT}/02-phone-conversation.png` });
    const portrait = await b.locator('[data-window=social]').boundingBox();
    check(
      'Portrait conversation and composer remain in the viewport',
      portrait.y >= 0 && portrait.y + portrait.height <= 845,
      portrait,
    );
    await enter(b, userB, false);
    await open(b);
    await button(b, `Message ${nameA}`);
    await waitText(b, 'Ready for our next adventure');
    await waitText(b, '<b>Private hello</b> — meet at the vault');
    check('Friendship and both messages survive a fresh login', true);
    await b.setViewportSize({ width: 844, height: 390 });
    await b.screenshot({ path: `${OUT}/03-landscape-conversation.png` });
    const landscape = await b.locator('[data-window=social]').boundingBox();
    check(
      'Landscape conversation stays within the viewport',
      landscape.y >= 0 && landscape.y + landscape.height <= 391,
      landscape,
    );
    await button(b, 'Back to friends');
    await button(b, 'Block contact');
    await waitText(b, 'Direct messages blocked');
    await a.waitForFunction(() => !document.querySelector('.direct-conversation'));
    await invite(a, nameB);
    await waitText(a, 'This contact is unavailable');
    check('Blocking removes the conversation and rejects new friend requests', true);
    await button(b, 'Unblock contact');
    await waitText(b, 'No contacts yet');
    await invite(a, nameB);
    await waitText(a, 'Request sent');
    check(
      'Unblocking requires a new accepted request',
      (await a.getByRole('button', { name: `Message ${nameB}`, exact: true }).count()) === 0,
    );
    await button(b, 'Accept friend');
    await button(b, `Message ${nameA}`);
    await waitText(b, 'Ready for our next adventure');
    check('Renewed consent restores the existing durable conversation', true);
    check('No browser exceptions', errors.length === 0, errors);
  } catch (e) {
    fs.writeFileSync(`${OUT}/failure.txt`, e.stack || String(e));
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
