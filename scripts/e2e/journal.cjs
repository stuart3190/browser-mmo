/* eslint-disable */
// Functional appearance/layout playtest. Fresh level-five fixtures in a disposable qualification DB;
// all gameplay actions use keyboard/touch. No live or earned-character data is changed.
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const { Client } = require('../../packages/db/node_modules/pg');
const { enter, walk } = require('./vertical-slice.cjs');
const fs = require('node:fs');
const out = process.argv[2] || '/tmp/bo-journal';
fs.mkdirSync(out, { recursive: true });
const checks = [],
  errors = [];
function check(name, ok, detail) {
  checks.push({ name, ok: !!ok, detail });
  if (!ok) throw Error(name);
  console.log('PASS', name);
}
async function fixture(classId) {
  const url = new URL(process.env.DATABASE_URL);
  if (url.hostname !== '127.0.0.1' || url.pathname !== '/qualification_dev')
    throw Error('Disposable local qualification DB required');
  const username = `journal_${Date.now().toString(36)}`;
  const api = async (path, body, token) => {
    const response = await fetch(process.env.VITE_API_URL + path, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw Error(`${path}: ${response.status}`);
    return response.json();
  };
  const { token } = await api('/v1/auth/dev-login', { username, client: 'tool' });
  const { character } = await api(
    '/v1/characters',
    {
      name: username
        .replace('_', '')
        .replace(/[0-9]/g, (d) => 'abcdefghij'[+d])
        .slice(0, 20),
      classId,
    },
    token,
  );
  const db = new Client({ connectionString: url.toString() });
  await db.connect();
  try {
    await db.query(
      'update characters set level = 5, zone_id=$2, pos_x=$3, pos_z=$4 where id = $1',
      [character.id, 'zone.aurelian.amber_coast', 256, 96],
    );
    await db.query(
      "insert into character_quests (character_id,quest_id,status,progress,accepted_at,completed_at,rewarded_at,turn_in_id) values ($1,'quest.amber_coast.last_bell','completed','{}',now(),now(),now(),$2)",
      [character.id, require('node:crypto').randomUUID()],
    );
  } finally {
    await db.end();
  }
  return username;
}
(async () => {
  const browser = await chromium.launch({
    executablePath: '/usr/bin/google-chrome',
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const context = await browser.newContext({
    viewport:
      process.env.JOURNAL_TOUCH === '1'
        ? { width: 844, height: 480 }
        : { width: 1100, height: 740 },
    hasTouch: process.env.JOURNAL_TOUCH === '1',
    isMobile: process.env.JOURNAL_TOUCH === '1',
  });
  await context.addInitScript(() => {
    window.__routeZone = null;
    const WS = WebSocket;
    window.WebSocket = class extends WS {
      constructor(...args) {
        super(...args);
        this.addEventListener('message', (e) => {
          try {
            const m = JSON.parse(e.data);
            if (m.t === 'auth.ok') window.__routeZone = m.d.zoneId;
          } catch {}
        });
      }
    };
  });
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  page.on('pageerror', (e) => errors.push(e.message));
  try {
    const username = await fixture('class.warrior');
    await enter(page, username, false);
    const touch = process.env.JOURNAL_TOUCH === '1';
    const click = (loc) => (touch ? loc.tap() : loc.click());
    const open = () => click(page.locator('[data-open=quests]'));
    const q = 'quest.elderwood.third_watch';
    await open();
    await click(page.locator('[data-testid=quest-find-adventure]'));
    const offer = page.locator(`[data-window=quests] [data-quest="${q}"]`);
    check(
      'Available quests recommend the unlocked story with giver and region',
      (await page
        .locator('[data-window=quests] .quest-entry')
        .first()
        .getAttribute('data-quest')) === q &&
        (await offer.locator('[data-testid=quest-offer-place]').innerText()).includes('Iona') &&
        (await offer.innerText()).includes('Amber Coast'),
    );
    check(
      'Journal offers guidance without accepting quests remotely',
      (await offer.locator('[data-testid=quest-accept]').count()) === 0 &&
        (await page.evaluate(
          (q) => window.__mmo.quests.find((x) => x.questId === q)?.state === 'available',
          q,
        )),
    );
    check(
      'Future locked quests stay out of available list',
      (await page
        .locator('[data-window=quests] [data-quest="quest.elderwood.living_seal"]')
        .count()) === 0,
    );
    await page.screenshot({ path: `${out}/available-adventures.png` });
    await click(offer.locator('[data-testid=quest-guide-offer]'));
    await page.waitForFunction(() =>
      document.querySelector('.quest-guide')?.textContent.includes('Iona'),
    );
    check(
      'Selected offer closes the log and guides to Iona',
      (await page.locator('[data-window=quests]').count()) === 0,
    );
    await enter(page, username, false);
    await page.waitForFunction(() =>
      document.querySelector('.quest-guide')?.textContent.includes('Iona'),
    );
    check('Offer selection survives relogin', true);
    await walk(page, 272, 104, 2);
    if (touch) await page.locator('[data-testid=touch-interact]').tap();
    else await page.keyboard.press('KeyE');
    await page.waitForFunction(() => window.__mmo.dialogue?.npcId === 'npc.amber_coast.iona');
    await click(page.locator(`[data-quest="${q}"] [data-testid=quest-accept]`));
    await page.waitForFunction(
      (q) => window.__mmo.quests.find((x) => x.questId === q)?.state === 'active',
      q,
    );
    await click(page.getByRole('button', { name: 'Close dialogue', exact: true }));
    await open();
    await click(page.getByRole('tab', { name: 'Active', exact: true }));
    check(
      'In-person acceptance moves the offer into the active log',
      (await page
        .locator(`[data-window=quests] [data-quest="${q}"][data-state=active]`)
        .count()) === 1,
    );
    await page.keyboard.press('Escape');
    await walk(page, 256, 96, 2);
    for (const [route, zone] of [
      ['travel.amber_coast.port.to.greenvale_marches.port', 'zone.aurelian.greenvale_marches'],
      ['travel.greenvale_marches.port.to.elderwood.port', 'zone.aurelian.elderwood'],
    ]) {
      await click(page.locator('[data-open=world]'));
      await click(page.locator(`[data-travel="${route}"]`));
      await page.waitForFunction((z) => window.__routeZone === z, zone);
    }
    await walk(page, 270, 3988, 2);
    if (touch) await page.locator('[data-testid=touch-interact]').tap();
    else await page.keyboard.press('KeyE');
    await page.waitForFunction(() => window.__mmo.dialogue?.npcId === 'npc.elderwood.tamsin');
    await click(page.locator(`[data-quest="${q}"] [data-testid=quest-turn-in]`));
    await page.waitForFunction(
      (q) => window.__mmo.quests.find((x) => x.questId === q)?.state === 'completed',
      q,
    );
    await click(page.getByRole('button', { name: 'Close dialogue', exact: true }));
    await open();
    await click(page.getByRole('tab', { name: 'Completed', exact: true }));
    const memory = page.locator(
      `[data-window=quests] [data-quest="${q}"] [data-testid=quest-conclusion]`,
    );
    check(
      'Completed log retains the earned story conclusion',
      (await memory.innerText()).includes('Two watches have answered'),
    );
    await memory.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${out}/completed-story.png` });
    await click(page.getByRole('tab', { name: /Available/ }));
    check(
      'New chapter follow-up becomes the suggested available adventure',
      (await page
        .locator('[data-window=quests] .quest-entry')
        .first()
        .getAttribute('data-quest')) === 'quest.elderwood.briar_memory',
    );
    if (touch) {
      await page.setViewportSize({ width: 390, height: 844 });
      const b = page.locator('[data-testid=quest-guide-offer]').first();
      await b.scrollIntoViewIfNeeded();
      const rect = await b.boundingBox();
      check(
        'Portrait quest guidance has a visible touch target',
        rect && rect.height >= 44 && rect.x >= 0 && rect.x + rect.width <= 390,
      );
      await page.screenshot({ path: `${out}/portrait-adventure.png` });
    }
    check('No journal gameplay exceptions', errors.length === 0, errors);
    fs.writeFileSync(
      `${out}/proof.json`,
      JSON.stringify(
        {
          ok: true,
          fixture:
            'Fresh level-five/prior-coast fixture at harbour. Actual quest selection, movement, dialogue acceptance, two boat trips, turn-in and journal history. No new chapter progress or item grants.',
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
    await page.screenshot({ path: `${out}/failure.png` }).catch(() => {});
    throw e;
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
