#!/usr/bin/env bash
# Fully isolated local qualification. Never reads deployment env or uses an existing database.
set -euo pipefail
cd "$(dirname "$0")/.."
production=false
load_test=false
guilds_only=false
case "${1:-}" in
  '') checks=true ;;
  --skip-checks) checks=false ;;
  --production) checks=false; production=true ;;
  --guilds) checks=false; guilds_only=true ;;
  --load) checks=false; production=true; load_test=true ;;
  *) echo 'Usage: bash scripts/qualify-local.sh [--skip-checks|--production|--load|--guilds]' >&2; exit 2 ;;
esac
PG_BIN=${PG_BIN:-/usr/lib/postgresql/17/bin}
for tool in initdb pg_ctl createdb; do [[ -x "$PG_BIN/$tool" ]] || { echo "Missing $PG_BIN/$tool" >&2; exit 1; }; done
command -v pnpm >/dev/null
command -v setsid >/dev/null
export PLAYWRIGHT_PATH=${PLAYWRIGHT_PATH:-/opt/aria-browser/node_modules/playwright}
node -e 'require(process.env.PLAYWRIGHT_PATH)' >/dev/null
qualification_dir=$(mktemp -d /tmp/brokenodyssey-qualification.XXXXXX)
if [[ $EUID -eq 0 ]]; then
  chown postgres:postgres "$qualification_dir"
  as_pg() { runuser -u postgres -- "$@"; }
else
  as_pg() { "$@"; }
fi
ports=$(python3 - <<'PY'
import socket
sockets = [socket.socket() for _ in range(4)]
for s in sockets: s.bind(('127.0.0.1', 0))
print(' '.join(str(s.getsockname()[1]) for s in sockets))
for s in sockets: s.close()
PY
)
read -r qualification_pg_port API_PORT REALTIME_PORT qualification_web_port <<< "$ports"
export API_PORT REALTIME_PORT
processes=()
pg_started=false
cleanup() {
  local code=$?
  trap - EXIT INT TERM
  for pid in "${processes[@]}"; do kill -TERM -- "-$pid" 2>/dev/null || true; done
  for pid in "${processes[@]}"; do wait "$pid" 2>/dev/null || true; done
  if $pg_started; then as_pg "$PG_BIN/pg_ctl" -D "$qualification_dir/pg" -m fast stop >> "$qualification_dir/postgres-stop.log" 2>&1 || true; fi
  echo "Qualification exit $code. Logs and screenshots retained: $qualification_dir"
  exit "$code"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
as_pg "$PG_BIN/initdb" -D "$qualification_dir/pg" --auth-local=trust --auth-host=trust --no-locale > "$qualification_dir/init.log"
as_pg "$PG_BIN/pg_ctl" -D "$qualification_dir/pg" -l "$qualification_dir/pg/server.log" -o "-h 127.0.0.1 -p $qualification_pg_port -k $qualification_dir" start
pg_started=true
qualification_user=$(if [[ $EUID -eq 0 ]]; then echo postgres; else id -un; fi)
for database in qualification_dev qualification_test; do
  as_pg "$PG_BIN/createdb" -h "$qualification_dir" -p "$qualification_pg_port" "$database"
done
export DATABASE_URL="postgres://$qualification_user@127.0.0.1:$qualification_pg_port/qualification_dev"
export TEST_DATABASE_URL="postgres://$qualification_user@127.0.0.1:$qualification_pg_port/qualification_test"
export NODE_ENV=development LOG_LEVEL=warn API_HOST=127.0.0.1 REALTIME_HOST=127.0.0.1
export AUTH_DEV_LOGIN_ENABLED=true AUTH_PASSWORD_LOGIN_ENABLED=false AUTH_DEV_ADMIN_USERNAMES=qualificationadmin
export TRUST_PROXY_LOOPBACK=false REALTIME_MAX_CONNECTIONS=5 REALTIME_ZONES='*'
export WEB_URL="http://127.0.0.1:$qualification_web_port"
export CORS_ORIGINS="$WEB_URL" REALTIME_ALLOWED_ORIGINS="$WEB_URL"
export VITE_API_URL="http://127.0.0.1:$API_PORT" VITE_REALTIME_URL="ws://127.0.0.1:$REALTIME_PORT"
if $checks; then
  NODE_ENV=production pnpm verify > "$qualification_dir/verify.log" 2>&1
  PATH="$PG_BIN:$PATH" BACKUP_TEST_DIR="$qualification_dir/backup" pnpm exec tsx scripts/backup-restore-test.ts > "$qualification_dir/backup.log" 2>&1
  pnpm assets:check > "$qualification_dir/content.log" 2>&1
  pnpm content:validate >> "$qualification_dir/content.log" 2>&1
fi
pnpm db:migrate > "$qualification_dir/migrate.log" 2>&1
pnpm db:sync-content >> "$qualification_dir/migrate.log" 2>&1
if $production; then
  source scripts/qualification/production-ui.sh
  exit 0
fi
setsid pnpm --filter @mmo/api exec tsx src/main.ts > "$qualification_dir/api.log" 2>&1 & processes+=("$!")
setsid pnpm --filter @mmo/realtime exec tsx src/main.ts > "$qualification_dir/realtime.log" 2>&1 & processes+=("$!")
setsid pnpm --filter @mmo/game-web exec vite --host 127.0.0.1 --port "$qualification_web_port" > "$qualification_dir/web.log" 2>&1 & processes+=("$!")
for endpoint in "$VITE_API_URL/health/ready" "http://127.0.0.1:$REALTIME_PORT/health/ready" "$WEB_URL"; do
  ready=false
  for ((attempt=0; attempt<120; attempt++)); do
    if curl -fsS "$endpoint" >/dev/null 2>&1; then ready=true; break; fi
    sleep 0.5
  done
  $ready || { echo "Local endpoint failed to become ready: $endpoint" >&2; exit 1; }
done
qualification_suites=${QUAL_BROWSER_SUITES:-trading,marketplace,social,friends,onboarding,guilds,rendering,startup}
if $guilds_only; then qualification_suites=guilds; fi
read -r -a selected_suites <<< "${qualification_suites//,/ }"
for suite in "${selected_suites[@]}"; do
  case "$suite" in trading|marketplace|social|friends|onboarding|guilds|rendering|startup|tactical|repair|coast|coast-visual|specialisations|remedy|appearance|audio|guidance|forest|forest-recovery|journal|armor|cantor|reward-preview|trailwear|earned-journeys|atlas|handbook|aftermath|aftermath-review|camera|ferries) ;; *) echo "Unknown browser suite: $suite" >&2; exit 2 ;; esac
  if [[ "$suite" == coast || "$suite" == remedy || "$suite" == appearance || "$suite" == forest || "$suite" == armor || "$suite" == cantor || "$suite" == reward-preview || "$suite" == trailwear || "$suite" == earned-journeys || "$suite" == aftermath || "$suite" == aftermath-review || "$suite" == ferries ]]; then
    pnpm exec tsx "scripts/e2e/$suite.cjs" "$qualification_dir/$suite" > "$qualification_dir/$suite.log" 2>&1
  else
    node "scripts/e2e/$suite.cjs" "$qualification_dir/$suite" > "$qualification_dir/$suite.log" 2>&1
  fi
done
QUAL_RESULT_PATH="$qualification_dir/result.json" QUAL_FULL_CHECKS="$checks" QUAL_RUN_SUITES="$qualification_suites" node --input-type=module - <<'JS'
import {writeFileSync} from 'node:fs';
const result={ok:true,fullChecks:process.env.QUAL_FULL_CHECKS==='true',browserSuites:process.env.QUAL_RUN_SUITES.split(','),productionTouched:false};
writeFileSync(process.env.QUAL_RESULT_PATH,JSON.stringify(result));
console.log(JSON.stringify(result));
JS
