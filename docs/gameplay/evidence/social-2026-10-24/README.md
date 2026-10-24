# Chat qualification — 2026-10-24

Codex verified on the isolated local stack; no production changes.

- Protocol: eight tests pass, including trimmed/empty/oversized text and forged identity/routing fields.
- World simulation: ten tests pass, including nearby range and party recipient privacy.
- Realtime: both party integration cases pass, including membership/recovery and account-scoped
  chat limiting across reconnects. These are focused cases, not a fresh full gateway suite.
- Formatting, lint, all typechecks, four production builds and debug-hook exclusion pass.
- `scripts/e2e/social.cjs`: ten checks pass with three freshly created players. Desktop Warrior
  invites touch Mage via ordinary UI; party messages reach both and not the bystander. Zone and
  nearby messages arrive. Typing WASD/combat keys does not move the player. HTML-like content is
  literal text. Departure removes party eligibility. Escape, unread badge and responsive panels
  work. Zero browser exceptions. Screenshots visually reviewed.

The runner now includes this suite after trading. Combined runner qualification will be repeated
with the marketplace milestone. Emulated touch is functional evidence, not physical phone performance.
History is transient. Friends, durable direct messages and guilds remain unfinished.

Harness corrections: wait for the server's party update; inspect the native disabled option property
(Playwright's `isDisabled` follows the parent select). A separate run timed out loading a third
software-rendered browser during competing build work; the accepted run was separated from that work.
