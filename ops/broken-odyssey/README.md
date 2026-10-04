# Broken Odyssey development deployment

Public URL: **https://brokenodyssey.com**. `www` redirects to the apex. This is a development
preview, with isolated progress that may be reset. Password login uses the existing auth path;
username-only dev authentication and development debug hooks are disabled. No gameplay changes.

## Deploy the next verified main

From a clean checkout on this VPS:

```sh
sudo bash scripts/deploy-broken-odyssey.sh
```

The command fetches `origin/main`, archives its exact SHA into `/srv/brokenodyssey/releases`, installs
locked dependencies, builds production assets/bundles with public API/WS URLs, adds a development
label/release manifest, stops only this preview, saves a local DB dump, migrates and syncs item content,
switches `current` and restarts its systemd services. Builds happen before downtime. `--candidate`
qualifies a committed feature-branch HEAD before merge; normal deployment always uses origin/main.
The operator is responsible for verifying that main passed the milestone checks before deployment.

A failed build leaves the running release alone. Failed migration leaves the preview stopped for
inspection; do not automatically roll back binaries across changed checkpoint/content formats.
Old releases and local dumps are retained; they are not an off-host backup service. Periodically
prune inspected old releases/dumps. Never modify an existing release in place.

## Host layout / bootstrap performed for this VPS

- `brokenodyssey-api.service`: built Node API, **127.0.0.1:4461**.
- `brokenodyssey-realtime.service`: built authoritative world/WS, **127.0.0.1:4462**.
- `brokenodyssey-web.service`: private Caddy, built static files and API/WS routing, **127.0.0.1:4460**.
- `brokenodyssey-ingress.socket` / `.service`: socket proxy **10.83.7.1:4463 → 127.0.0.1:4460**;
  this private bridge lets the existing Docker Caddy reach loopback services.
- `postgresql@17-brokenodyssey.service`: dedicated persistent cluster **127.0.0.1:55440**, database
  `brokenodyssey_preview`, role `brokenodyssey`. Data under `/var/lib/postgresql/17/brokenodyssey`.
- Unprivileged runtime user `brokenodyssey`. Root-owned environment file
  `/etc/brokenodyssey/runtime.env`, mode 0640, group brokenodyssey. No credentials in Git.
- `/usr/local/bin/brokenodyssey-caddy`: installed Caddy 2.11.4 binary; local admin API disabled.
- Database bootstrap: `pg_createcluster 17 brokenodyssey --port 55440 --start`, create the isolated
  password role/database, then install the environment and binary before the first deployment.

Runtime config: NODE_ENV=production, AUTH_DEV_LOGIN_ENABLED=false, AUTH_PASSWORD_LOGIN_ENABLED=true,
TRUST_PROXY_LOOPBACK=true, CORS_ORIGINS and REALTIME_ALLOWED_ORIGINS=https://brokenodyssey.com,
loopback API/RT binds above, REALTIME_MAX_CONNECTIONS=5. This is a conservative preview limit, not a
capacity certification. Public ingress overwrites X-Real-IP; private ingress forwards that value.
Public admin/metrics routes are blocked. TLS is terminated by the shared front.

## Shared front (one-time installation, not rewritten by routine deploys)

The canonical file is `/home/ubuntu/provisiond/Caddyfile.tls`, bind-mounted by inode into
`buildr-caddy`. Append only `front.caddy`'s marked block, retaining every unrelated byte; back it up,
validate the whole config, and write **in place**. Do not replace its inode or restart the container.
Explicit apex/www sites use HTTP-01/TLS-ALPN issuance; no Cloudflare-token access to this zone needed.
Validate with `docker exec buildr-caddy caddy validate --config /etc/caddy/Caddyfile` and then
`docker kill --signal=USR1 buildr-caddy` for graceful reload with its disabled admin API.
See [Caddy's signal documentation](https://caddyserver.com/docs/command-line#signals).
Do not use `--candidate` or change shared Caddy for routine milestone deployments.

## Login and operation

The operator's preview account is `stuart` (player role, never admin). Its generated password is
in `/etc/brokenodyssey/preview-password` (root-only): `sudo cat /etc/brokenodyssey/preview-password`.
Log in, choose Warrior or Mage and name a character, then **Begin your adventure**. Pick up the
sword by the village and speak to Elder Maren. No public signup is implemented.

Additional testers can be provisioned using the existing operator script, supplying passwords on
stdin rather than command arguments, with DATABASE_URL loaded from the root-owned runtime file:
`MMO_AUTH_USERNAME=another_player pnpm --filter @mmo/domain exec tsx scripts/provision-account.ts`.
Do not use the development seed (it creates demo/admin fixtures).

Inspect with `systemctl status brokenodyssey-{api,realtime,web}` and
`journalctl -u brokenodyssey-realtime`. Health: localhost ports 4461/4462 `/health/ready`.
Public release: `/release.json`; API base `/api/v1`; websocket `/realtime/ws`.
