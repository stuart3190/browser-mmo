# Marketplace qualification — 2026-10-24

Codex, isolated PostgreSQL/API/realtime/browser stack. Production unchanged.

- Final domain run: 20/20 marketplace + direct-trade tests pass after changing account admission
  to `FOR NO KEY UPDATE`. Covers concurrent alt listing limits, exact item snapshots, stale selling
  versions, equal-price pagination, own expired/closed history, and existing atomic purchase/trade races.
- HTTP: marketplace acceptance/privacy case passes (authenticated inspection, history scoped from
  session, forged ownership, stale version/price, forbidden cancellation, completed purchase).
- Formatting/lint/all typechecks, four production builds and debug-hook exclusion pass.
- Real two-player browser: eight assertions pass. A newly picked-up sword is listed with fee/proceeds
  disclosure; the touch Mage inspects the actual rolled item and buys it. Exactly the same item survives
  fresh login. Seller and buyer wallets match fees. Buyer relists/cancels, recovering the same item with
  no deposit refund. Portrait and landscape panels fit; screenshots visually reviewed. No exceptions.

The first browser attempt used an incorrect exact button label (`1s` versus the established `1s 0c`
currency formatter); the corrected ordinary UI flow passed. The shared enter helper now brings each
browser to the foreground before initialization to avoid background WebGL throttling.

The combined isolated runner includes trading, marketplace and social. A fresh full aggregate and
combined run remain to be recorded; this evidence does not claim them. Phone emulation proves controls,
not physical-device performance. No schema or content migration is needed for this milestone.
