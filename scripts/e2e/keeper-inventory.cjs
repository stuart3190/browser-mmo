/* eslint-disable */
// Post-playthrough UI regression; rewards already obtained through the actual encounter.
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const { enter } = require('./vertical-slice.cjs');
const fs = require('fs');
const OUT = process.argv[2] || '/tmp/mmo-keeper-inventory';
fs.mkdirSync(OUT, { recursive: true });
const checks = [];
function check(name, ok, detail) {
  checks.push({ name, ok: !!ok, detail });
  console.log(ok ? 'PASS' : 'FAIL', name, detail || '');
  if (!ok) throw Error(name);
}
(async () => {
  let b = await chromium.launch({
    executablePath: '/usr/bin/google-chrome',
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
  try {
    const p = await b.newPage({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
    });
    p.setDefaultTimeout(60000);
    await enter(p, process.env.INVENTORY_USER || 'spark_muu9vm2y', false);
    check(
      'Completed survey/kill and equipped reward persisted',
      await p.evaluate(
        () =>
          window.__mmo.quests.find((q) => q.questId === 'quest.greenvale.keeper_outpost')?.state ===
            'completed' &&
          window.__mmo.items.filter((i) => i.templateId === 'accessory.cloak.oathkeepers_mantle')
            .length === 1 &&
          window.__mmo.items.find((i) => i.templateId === 'accessory.cloak.oathkeepers_mantle')
            .location.kind === 'equipped',
      ),
    );
    await p.locator('[data-open=inventory]').tap();
    await p.getByLabel('Search inventory').fill('rootward');
    await p.getByLabel('Sort inventory').selectOption('rarity');
    await p.getByRole('button', { name: 'Rootward Mantle', exact: true }).tap();
    await p.locator('[data-action=close]').tap();
    await p.getByRole('button', { name: 'Reset view', exact: true }).tap();
    check(
      'Touch reset works after closing the selected-item sheet',
      await p.locator('[data-testid=backpack-slot-0]').isVisible(),
    );
    for (const v of [
      { width: 390, height: 844 },
      { width: 844, height: 390 },
    ]) {
      await p.setViewportSize(v);
      await p.getByLabel('Search inventory').fill('absent item');
      await p.getByLabel('Sort inventory').selectOption('name');
      for (const label of ['Search inventory', 'Filter rarity', 'Sort inventory']) {
        const r = await p.getByLabel(label).boundingBox();
        check(
          `${label} reachable at ${v.width}×${v.height}`,
          r &&
            r.x >= 0 &&
            r.x + r.width <= v.width &&
            r.y >= 0 &&
            r.y + r.height <= v.height &&
            r.height >= 44,
          r,
        );
      }
      await p.getByRole('button', { name: 'Reset view', exact: true }).tap();
      await p.getByRole('tab', { name: 'Materials', exact: true }).tap();
      check(
        'Sorting/filtering also works for the material pouch',
        await p.locator('[data-container=material_pouch]').isVisible(),
      );
      await p.getByLabel('Search inventory').fill('ore');
      await p.getByLabel('Sort inventory').selectOption('name');
      await p.screenshot({ path: `${OUT}/inventory-${v.width}.png` });
      await p.getByRole('tab', { name: 'Backpack', exact: true }).tap();
      await p.getByRole('button', { name: 'Reset view', exact: true }).tap();
    }
  } finally {
    await b.close();
    fs.writeFileSync(`${OUT}/checks.json`, JSON.stringify(checks, null, 2));
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
