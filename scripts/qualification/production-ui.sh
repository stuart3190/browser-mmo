#!/usr/bin/env bash
# Sourced only by qualify-local.sh after it creates its own disposable loopback cluster.
[[ ${qualification_dir:-} == /tmp/brokenodyssey-qualification.* ]] || exit 2
production_database="qualification_prod_${qualification_web_port}"
as_pg "$PG_BIN/createdb" -h "$qualification_dir" -p "$qualification_pg_port" "$production_database"
export DATABASE_URL="postgres://$qualification_user@127.0.0.1:$qualification_pg_port/$production_database"
if $load_test; then export REALTIME_MAX_CONNECTIONS=${LOAD_PLAYERS:-5}; fi
export NODE_ENV=production AUTH_DEV_LOGIN_ENABLED=false AUTH_PASSWORD_LOGIN_ENABLED=true
export WEB_URL="https://localhost:$qualification_web_port"
export CORS_ORIGINS="$WEB_URL" REALTIME_ALLOWED_ORIGINS="$WEB_URL"
export VITE_API_URL="$WEB_URL/api" VITE_REALTIME_URL="${WEB_URL/https:/wss:}/realtime"
export PRODUCTION_PROOF_DIR="$qualification_dir/production"
mkdir -m 700 "$PRODUCTION_PROOF_DIR"
CADDY_BIN=${CADDY_BIN:-/usr/local/bin/brokenodyssey-caddy}
[[ -x $CADDY_BIN ]] || { echo 'Set CADDY_BIN to an installed Caddy binary' >&2; exit 1; }
command -v openssl >/dev/null
pnpm db:migrate > "$PRODUCTION_PROOF_DIR/migrate.log" 2>&1
pnpm db:sync-content >> "$PRODUCTION_PROOF_DIR/migrate.log" 2>&1
pnpm exec tsx scripts/qualification/provision-social-smoke.ts > "$PRODUCTION_PROOF_DIR/provision.log" 2>&1
pnpm build > "$PRODUCTION_PROOF_DIR/build.log" 2>&1
openssl req -x509 -newkey rsa:2048 -nodes -keyout "$PRODUCTION_PROOF_DIR/key.pem" -out "$PRODUCTION_PROOF_DIR/cert.pem" -days 1 -subj '/CN=localhost' -addext 'subjectAltName=DNS:localhost,IP:127.0.0.1' > "$PRODUCTION_PROOF_DIR/tls.log" 2>&1
chmod 600 "$PRODUCTION_PROOF_DIR/key.pem"
cat > "$PRODUCTION_PROOF_DIR/Caddyfile" <<CADDY
{
  admin off
  auto_https off
}
https://localhost:$qualification_web_port {
  bind 127.0.0.1
  tls $PRODUCTION_PROOF_DIR/cert.pem $PRODUCTION_PROOF_DIR/key.pem
  encode gzip
  route {
    @private path /api/v1/admin* /api/metrics* /realtime/metrics*
    respond @private 404
    handle_path /api/* {
      reverse_proxy 127.0.0.1:$API_PORT
    }
    handle_path /realtime/* {
      reverse_proxy 127.0.0.1:$REALTIME_PORT
    }
    handle {
      root * $PWD/apps/game-web/dist
      try_files {path} /index.html
      file_server
    }
  }
}
CADDY
setsid node services/api/dist/main.js > "$PRODUCTION_PROOF_DIR/api.log" 2>&1 & processes+=("$!")
realtime_node_args=()
if [[ ${QUAL_CPU_PROFILE:-0} == 1 ]]; then realtime_node_args+=(--cpu-prof --cpu-prof-dir="$PRODUCTION_PROOF_DIR" --cpu-prof-name=realtime.cpuprofile); fi
setsid node "${realtime_node_args[@]}" services/realtime/dist/main.js > "$PRODUCTION_PROOF_DIR/realtime.log" 2>&1 & processes+=("$!")
XDG_DATA_HOME="$PRODUCTION_PROOF_DIR/caddy-data" XDG_CONFIG_HOME="$PRODUCTION_PROOF_DIR/caddy-config" setsid "$CADDY_BIN" run --config "$PRODUCTION_PROOF_DIR/Caddyfile" --adapter caddyfile > "$PRODUCTION_PROOF_DIR/caddy.log" 2>&1 & processes+=("$!")
for endpoint in "$WEB_URL/api/health/ready" "$WEB_URL/realtime/health/ready" "$WEB_URL"; do
  ready=false
  for ((attempt=0; attempt<120; attempt++)); do
    if curl --cacert "$PRODUCTION_PROOF_DIR/cert.pem" -fsS "$endpoint" >/dev/null 2>&1; then ready=true; break; fi
    sleep 0.5
  done
  $ready || { echo "Production fixture failed readiness: $endpoint" >&2; exit 1; }
done
NODE_EXTRA_CA_CERTS="$PRODUCTION_PROOF_DIR/cert.pem" node --input-type=module - <<'JS' > "$PRODUCTION_PROOF_DIR/gates.json"
import assert from 'node:assert/strict';
const base = process.env.WEB_URL;
assert.deepEqual((await (await fetch(base + '/api/v1/auth/providers')).json()).providers, ['password']);
assert.equal((await fetch(base + '/api/v1/auth/dev-login', {method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({username:'shouldfail',client:'game_web'})})).status,404);
for (const path of ['/api/metrics','/realtime/metrics','/api/v1/admin']) assert.equal((await fetch(base+path)).status,404);
console.log(JSON.stringify({ok:true,passwordOnly:true,devLoginDisabled:true,privateRoutesHidden:true,tls:'isolated one-day localhost certificate'}));
JS
export FRIENDS_USER_A=$(node -e 'console.log(require(process.env.PRODUCTION_PROOF_DIR+"/users.json")[0])')
export FRIENDS_USER_B=$(node -e 'console.log(require(process.env.PRODUCTION_PROOF_DIR+"/users.json")[1])')
export PROOF_PASSWORD_FILE="$PRODUCTION_PROOF_DIR/password" QUAL_LOCAL_TLS=true
node scripts/e2e/friends.cjs "$PRODUCTION_PROOF_DIR/browser" > "$PRODUCTION_PROOF_DIR/browser.log" 2>&1
if $load_test; then
  TEST_DATABASE_URL="$DATABASE_URL" QUAL_URL="$VITE_API_URL" QUAL_ORIGIN="$WEB_URL" QUAL_REALTIME_URL="$VITE_REALTIME_URL/ws" QUAL_METRICS_URL="http://127.0.0.1:$REALTIME_PORT/metrics" NODE_EXTRA_CA_CERTS="$PRODUCTION_PROOF_DIR/cert.pem" LOAD_REPORT="$PRODUCTION_PROOF_DIR/load.json" pnpm exec tsx scripts/qualification/production-load.ts > "$PRODUCTION_PROOF_DIR/load.log" 2>&1
fi
printf '{"ok":true,"profile":"built-production-TLS-password","developmentHook":false,"productionTouched":false,"capacityWorkload":%s}\n' "$load_test" > "$qualification_dir/result.json"
cat "$qualification_dir/result.json"
