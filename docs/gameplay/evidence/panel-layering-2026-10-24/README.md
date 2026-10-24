# Panel layering — 2026-10-24

Earned profession screenshot review showed the desktop ability bar covering Skills text and
controls. Generic windows now have an explicit layer above combat controls; item details,
hover previews and death recovery retain higher layers. Existing touch layout rules remain.

Ten onboarding/browser assertions pass, including actual hit-testing across Skills at 900x650,
390x844 and 844x390; eleven trade/inventory/browser assertions pass again with this change.
Screenshots reviewed. Prettier, script syntax and the production game-client build pass.
Loopback asset preview used the real local API/realtime services. No production changes.
