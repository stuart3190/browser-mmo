# Class handbook — 2026-10-25

- `fresh-inspection/`: 15 checks, ordinary level-one Warrior desktop/Mage portrait. Four abilities,
  current/future unlocks, reach/target/recovery, inspection does not cast or change cooldowns.
- `mentor-combat/`: 20 checks. Focused level-five fixtures, then normal mentor training/retraining,
  actual Guardian/Berserker/Frost/Fire behavior, a real victory per class and persistent path.
  These are not earned level-one-to-five journeys.
- `header-visibility/`: 17 checks after screenshot review found the phone Character close button
  scrolled offscreen. Sticky header keeps it reachable without changing window selection behavior.
- 31 frontend tests, repository typecheck/lint/build pass. Final CSS production build also passes.
  Desktop/portrait screenshots reviewed. Browser-emulated touch, not physical-phone signoff.

`startup-failure/` retains the initial pre-login error: main.ts dynamic module fetch failed.
DEV console identified it; the diagnostic rerun after build passed. Root cause is unknown, not
claimed fixed. Future driver diagnostics include failed requests and HTTP errors. The successful
run also logged an incidental resource404 without a page exception; all functional checks passed.
Production and player data untouched; private local qualification fixtures only.
