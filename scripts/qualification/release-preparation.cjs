/* eslint-disable */
// Execute the real deployment control flow against private path/command fixtures; never deploy.
const {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  symlinkSync,
  readlinkSync,
  rmSync,
} = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const { spawnSync } = require('node:child_process');
const assert = require('node:assert/strict');
assert.equal(
  process.getuid?.(),
  0,
  'The host-specific deployment script requires root; this fixture does not access live paths.',
);
const root = mkdtempSync(join(tmpdir(), 'bo-prepare-test-'));
const quote = (s) => "'" + s.replaceAll("'", "'\\''") + "'";
try {
  for (const path of [
    'bin',
    'repo/scripts',
    'srv/releases',
    'etc',
    'lock',
    'source/ops/broken-odyssey',
  ])
    mkdirSync(join(root, path), { recursive: true });
  writeFileSync(join(root, 'source/ops/broken-odyssey/Caddyfile'), 'fixture');
  writeFileSync(join(root, 'etc/runtime.env'), `touch ${quote(join(root, 'credentials-read'))}\n`);
  symlinkSync('old-release', join(root, 'srv/current'));
  const executable = (name, body) =>
    writeFileSync(join(root, 'bin', name), '#!/bin/bash\nset -e\n' + body + '\n', { mode: 0o755 });
  executable(
    'git',
    `case "$1" in
    status) exit 0 ;;
    rev-parse) echo fixture ;;
    archive) tar -c -C ${quote(join(root, 'source'))} . ;;
    *) exit 98 ;;
  esac`,
  );
  executable(
    'pnpm',
    `if [[ $1 == build ]]; then
    mkdir -p apps/game-web/dist
    echo '<html><head><title>Fixture</title></head><body></body></html>' > apps/game-web/dist/index.html
  fi
  echo "$*" >> ${quote(join(root, 'build-calls'))}`,
  );
  executable(
    'caddy',
    `[[ $1 == validate && -f $3 ]]
  echo validated >> ${quote(join(root, 'validated'))}`,
  );
  for (const cmd of ['install', 'systemctl', 'pg_dump'])
    executable(cmd, `echo ${cmd} >> ${quote(join(root, 'forbidden'))}; exit 99`);
  const source = readFileSync(resolve('scripts/deploy-broken-odyssey.sh'), 'utf8')
    .replaceAll('/srv/brokenodyssey', join(root, 'srv'))
    .replaceAll('/etc/brokenodyssey', join(root, 'etc'))
    .replaceAll('/run/lock/brokenodyssey-deploy.lock', join(root, 'lock/deploy'))
    .replaceAll('/usr/local/bin/brokenodyssey-caddy', join(root, 'bin/caddy'));
  const script = join(root, 'repo/scripts/deploy.sh');
  writeFileSync(script, source);
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = spawnSync('bash', [script, '--candidate', '--prepare-only'], {
      encoding: 'utf8',
      env: { ...process.env, PATH: join(root, 'bin') + ':' + process.env.PATH },
    });
    assert.equal(result.status, 0, result.stdout + '\n' + result.stderr);
    assert.match(result.stdout, /Prepared immutable release/);
    assert.equal(readlinkSync(join(root, 'srv/current')), 'old-release');
    assert.equal(existsSync(join(root, 'credentials-read')), false);
    assert.equal(existsSync(join(root, 'forbidden')), false);
    assert.equal(
      JSON.parse(readFileSync(join(root, 'srv/releases/fixture/apps/game-web/dist/release.json')))
        .commit,
      'fixture',
    );
  }
  assert.equal(
    readFileSync(join(root, 'build-calls'), 'utf8').trim().split('\n').length,
    2,
    'second preparation must reuse the immutable build',
  );
  const invalid = spawnSync('bash', [script, '--candidate', '--unknown'], {
    encoding: 'utf8',
    env: { ...process.env, PATH: join(root, 'bin') + ':' + process.env.PATH },
  });
  assert.equal(invalid.status, 2);
  console.log(
    JSON.stringify({
      ok: true,
      freshPreparation: true,
      immutableReuse: true,
      invalidFlagRefused: true,
      noCredentialRead: true,
      noLiveMutation: true,
    }),
  );
} finally {
  rmSync(root, { recursive: true, force: true });
}
