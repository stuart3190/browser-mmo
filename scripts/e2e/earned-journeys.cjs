/* eslint-disable */
// End-to-end release journey. No direct DB writes, grants, teleports or synthetic XP.
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const out = path.resolve(process.argv[2] || '/tmp/bo-earned-journeys');
fs.mkdirSync(out, { recursive: true });
const systemsOnly = process.env.EARNED_SYSTEMS_ONLY === '1';
if (systemsOnly && (!process.env.EARNED_WARRIOR_USER || !process.env.EARNED_MAGE_USER))
  throw Error('Systems continuation requires both existing earned users');
const stamp = Date.now().toString(36);
const warrior = process.env.EARNED_WARRIOR_USER || `journeyw_${stamp}`;
const mage = process.env.EARNED_MAGE_USER || `journeym_${stamp}`;
const result = {
  ok: false,
  users: { warrior, mage },
  stages: [],
  authority: 'ordinary player inputs only',
  scope: systemsOnly ? 'systems continuation; story evidence is separate' : 'story and systems',
};
const save = () => fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(result, null, 2));
save();
async function stage(name, script, env) {
  const dir = path.join(out, name);
  fs.mkdirSync(dir, { recursive: true });
  const log = fs.openSync(`${dir}/run.log`, 'w');
  console.log(`START ${name}`);
  const code = await new Promise((resolve, reject) => {
    const child = spawn('pnpm', ['exec', 'tsx', `scripts/e2e/${script}.cjs`, dir], {
      env: { ...process.env, ...env },
      stdio: ['ignore', log, log],
    });
    child.once('error', reject);
    child.once('exit', (code) => resolve(code));
  }).finally(() => fs.closeSync(log));
  result.stages.push({ name, ok: code === 0 });
  save();
  if (code !== 0)
    throw Error(`${name} failed; inspect ${dir}/run.log and screenshots. Earned state retained.`);
  console.log(`PASS ${name}`);
}
(async () => {
  for (const [kind, user] of [
    ['warrior', warrior],
    ['mage', mage],
  ]) {
    if (!systemsOnly)
      await stage(`${kind}-story`, 'greenvale-complete', {
        GREENVALE_USER: user,
        GREENVALE_CLASS: `class.${kind}`,
        GREENVALE_DPR: process.env.GREENVALE_DPR || '0.5',
        GREENVALE_FULL: '1',
        GREENVALE_SIDE: '1',
        GREENVALE_CREATE: process.env[`EARNED_${kind.toUpperCase()}_USER`] ? '0' : '1',
      });
    await stage(`${kind}-professions`, 'greenvale-systems', {
      SYSTEMS_USER: user,
      SYSTEMS_MODE: 'professions',
      SYSTEMS_RECIPE: 'service.greenvale.craft_remedy',
    });
    if (kind === 'mage')
      await stage('mage-staff', 'greenvale-systems', {
        SYSTEMS_USER: user,
        SYSTEMS_MODE: 'professions',
        SYSTEMS_RECIPE: 'service.greenvale.craft_staff',
      });
    await stage(`${kind}-solo-vault`, 'greenvale-systems', {
      SYSTEMS_USER: user,
      SYSTEMS_MODE: 'solo',
    });
  }
  await stage('mixed-class-party-vault', 'greenvale-systems', {
    SYSTEMS_USER: warrior,
    SYSTEMS_PARTY_USER: mage,
    SYSTEMS_MODE: 'party',
    SYSTEMS_TOUCH: '1',
  });
  result.ok = true;
  save();
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
