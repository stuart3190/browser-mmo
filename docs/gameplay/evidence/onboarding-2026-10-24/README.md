# Onboarding and ability presentation — 2026-10-24

The login screen now uses Broken Odyssey branding, identifies Greenvale as the starting region,
labels character/class inputs, describes the two live classes and their level-two abilities, and
shows pending login/creation feedback while preventing duplicate submissions. Inputs use the UI
text colour. Both phone orientations keep the form scrollable with44-pixel controls.

Decorative vector silhouettes replace letter placeholders for the five live attack/strike/fire
abilities. Existing data-driven names, accessible labels, hotkeys, unlocks, cooldown masks and
server-owned ability rules remain unchanged. Unknown future abilities retain their data glyph.

Seven real browser assertions pass against the isolated preview: branding, both class descriptions,
landscape submission reachability, actual Mage creation/locked level-two spell, Warrior ability
icons and zero browser exceptions. Portrait creation, landscape form and both class HUD screenshots
were reviewed. Full typechecks, lint, four builds and production debug-hook exclusion pass.
This local development-profile proof does not claim password-production qualification of the new
screen or physical-device performance; rerun the production profile after integration.

The first run caught an ambiguous wrapped select label; the corrected explicit label/for linkage
is covered by the final exact accessible-name selection. The shared walking harness also detects
blocked movement sooner, used in the separate ongoing earned journeys; those are not marked done.
