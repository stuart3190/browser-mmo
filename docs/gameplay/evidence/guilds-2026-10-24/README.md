# Persistent guild qualification — 2026-10-24

Eight domain tests and one authenticated HTTP test pass on disposable bo_guilds_test. These cover
consent, ownership, unique names/tags, roles, expiry/blocks, concurrent final-slot/two-guild joins,
chat privacy/idempotency/account rate limits, removal/disband and stale guild requests.
Full monorepo types, lint, four production builds and debug-hook exclusion pass.

Twelve real desktop/phone browser assertions pass in n0ldqE: creation, accepted invitation, literal
private messages, relog, portrait/landscape, officer/leader permissions, explicit transfer, leave and
persistent disband. All screenshots reviewed; no browser exceptions. Source driver uses ordinary
UI only. Earlier domain fixture failure omitted a required zone; corrected test fixture then passed.

Populated historical migration and backup/restore pass, comparing 20 durable tables including
actual guild, memberships, invitation and message. Restored live sessions are revoked and restoring
into an occupied database is refused. Own fixture processes/databases only; no production changes.

Full combined-source and production password/TLS guild qualification remain required. Emulated
phone functionality does not establish physical device performance or concurrent-player capacity.

Final layout run oHpLwU passes 15 assertions, adding follow-latest, preserved scrollback, and a
visible landscape composer with independently scrollable history. All final screenshots reviewed.
The earlier HTTeSw attempt failed before login with 20 asset requests reporting ERR_NETWORK_CHANGED;
no functional assertion ran. Its diagnostics remain in the isolated run directory.
