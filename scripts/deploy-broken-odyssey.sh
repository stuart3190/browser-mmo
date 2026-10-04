#!/usr/bin/env bash
# Host-specific deployment of verified origin/main. Bootstrap is documented in ops/broken-odyssey/README.md.
set -euo pipefail
umask 022
[[ $EUID -eq 0 ]] || { echo 'Run with sudo.' >&2; exit 1; }
cd "$(dirname "$0")/.."
exec 9>/run/lock/brokenodyssey-deploy.lock
flock -n 9 || { echo 'Another deployment is running.' >&2; exit 1; }
[[ -z $(git status --porcelain) ]] || { echo 'Commit or stash repository changes first.' >&2; exit 1; }
if [[ ${1:-} == --candidate ]]; then
  revision=$(git rev-parse HEAD)
elif [[ $# -eq 0 ]]; then
  git fetch origin main:refs/remotes/origin/main
  revision=$(git rev-parse origin/main)
else
  echo 'Usage: sudo bash scripts/deploy-broken-odyssey.sh [--candidate]' >&2; exit 1
fi
release="/srv/brokenodyssey/releases/$revision"
[[ -f /etc/brokenodyssey/runtime.env && -x /usr/local/bin/brokenodyssey-caddy ]]
if [[ ! -f $release/.built ]]; then
  [[ ! -e $release ]] || { echo "Incomplete release exists: $release; inspect before removing." >&2; exit 1; }
  mkdir -p "$release"
  git archive "$revision" | tar -x -C "$release"
  (
    cd "$release"
    pnpm install --frozen-lockfile
    NODE_ENV=production VITE_API_URL=https://brokenodyssey.com/api VITE_REALTIME_URL=wss://brokenodyssey.com/realtime pnpm build
    python3 - "$revision" <<'PY'
import pathlib, sys
p = pathlib.Path('apps/game-web/dist/index.html')
s = p.read_text()
start = s.index('<title>'); end = s.index('</title>', start)
s = s[:start] + '<title>Broken Odyssey — Development Preview' + s[end:]
s = s.replace('<body>', '<body><div style="position:fixed;top:0;left:50%;transform:translateX(-50%);z-index:10000;background:#352b19;color:#ffe7aa;padding:2px 8px;font:11px sans-serif;pointer-events:none;white-space:nowrap">Broken Odyssey · DEVELOPMENT PREVIEW · progress may reset</div>')
p.write_text(s)
pathlib.Path('apps/game-web/dist/release.json').write_text('{"commit":"' + sys.argv[1] + '","environment":"development-preview"}\n')
PY
    touch .built
  )
fi
/usr/local/bin/brokenodyssey-caddy validate --config "$release/ops/broken-odyssey/Caddyfile" --adapter caddyfile
install -m 644 "$release"/ops/broken-odyssey/*.service "$release"/ops/broken-odyssey/*.socket /etc/systemd/system/
install -m 644 "$release/ops/broken-odyssey/Caddyfile" /etc/brokenodyssey/Caddyfile
systemctl daemon-reload
systemctl stop brokenodyssey-ingress.service brokenodyssey-web.service brokenodyssey-realtime.service brokenodyssey-api.service
# A failed migration intentionally leaves only this preview stopped. Never roll back its DB automatically.
set -a
source /etc/brokenodyssey/runtime.env
set +a
install -d -m 700 /srv/brokenodyssey/backups
PGDATABASE="$DATABASE_URL" /usr/lib/postgresql/17/bin/pg_dump -Fc -f "/srv/brokenodyssey/backups/pre-${revision}-$(date +%s).dump"
(
  cd "$release"
  pnpm db:migrate
  pnpm db:sync-content
)
ln -sfn "$release" /srv/brokenodyssey/current.new
mv -Tf /srv/brokenodyssey/current.new /srv/brokenodyssey/current
systemctl enable --now brokenodyssey-api.service brokenodyssey-realtime.service brokenodyssey-web.service brokenodyssey-ingress.socket
for port in 4461 4462; do
  ready=false
  for attempt in $(seq 1 30); do
    if curl -fsS "http://127.0.0.1:$port/health/ready" >/dev/null; then ready=true; break; fi
    sleep 1
  done
  $ready || { echo "Service on $port is not ready; inspect journalctl." >&2; exit 1; }
done
curl -fsS http://127.0.0.1:4460/release.json
printf '\nDeployed %s. Public front: https://brokenodyssey.com\n' "$revision"
