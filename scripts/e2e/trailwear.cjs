/* eslint-disable */
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const out = process.argv[2] || '/tmp/bo-trailwear';
fs.mkdirSync(out, { recursive: true });
for (const kind of ['warrior', 'mage']) {
  const result = spawnSync(
    'pnpm',
    ['exec', 'tsx', 'scripts/e2e/trailwear-journey.cjs', `${out}/${kind}`],
    {
      stdio: 'inherit',
      env: {
        ...process.env,
        TRAIL_CLASS: `class.${kind}`,
        GREENVALE_TOUCH: kind === 'mage' ? '1' : '0',
      },
    },
  );
  if (result.status !== 0) {
    process.exitCode = result.status || 1;
    break;
  }
}
