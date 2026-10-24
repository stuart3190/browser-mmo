/* eslint-disable */
const fs = require('node:fs');
const WEB = process.env.WEB_URL;
if (
  !WEB ||
  !['localhost', '127.0.0.1'].includes(new URL(WEB).hostname) ||
  !WEB.startsWith('https://')
)
  throw Error('Production fixture browser must use isolated loopback TLS');
const password = fs.readFileSync(process.env.PROOF_PASSWORD_FILE, 'utf8').trim();
async function enter(page, username, create, classId = 'class.warrior') {
  await page.bringToFront();
  await page.goto(WEB);
  await page.fill('[name=username]', username);
  await page.fill('[name=password]', password);
  await page.click('#login-form button');
  if (create) {
    await page.fill(
      '#create-form [name=name]',
      username
        .replace(/_/g, '')
        .replace(/[0-9]/g, (d) => 'abcdefghij'[+d])
        .slice(0, 20),
    );
    await page.selectOption('[name=classId]', classId);
    await page.click('#create-form button');
  } else await page.locator('#char-list button').first().click();
  await page.waitForFunction(
    () =>
      document.querySelector('[data-testid=player-hp]') ||
      document.querySelector('[data-testid=continue-browser]'),
  );
  if (await page.locator('[data-testid=continue-browser]').isVisible())
    await page.locator('[data-testid=continue-browser]').click();
  await page.locator('[data-testid=player-hp]').waitFor();
  if (await page.evaluate(() => '__mmo' in window))
    throw Error('Production build exposes development observation hook');
}
module.exports = { enter };
