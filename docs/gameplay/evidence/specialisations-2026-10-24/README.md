# Specialisations — verified 2026-10-24

Four level-five paths are functional: Guardian's stronger guard, Berserker's faster Heavy Strike,
Fire's faster Flame Burst and Frost's faster Nova. Free retraining at Maren/Iona preserves running
cooldowns. Current choice persists and is reflected in the bar and character panel.

`proof.json` records the real-input desktop Warrior and portrait-touch Mage playthrough. Both select
a defensive/control path, use its ability, retrain without resetting its cooldown, attack with the
offensive path's server-confirmed cooldown, win a wolf fight, and retain the path after login.
Screenshots inspected: dialogue choices are readable and finger-sized; selected path survives login.
Fixtures are fresh level-five characters. No items, victories or specialisation choices are injected;
this is not an earned level-one-to-five progression claim.

The initial driver selected a wandering wolf outside Flame Burst's shorter range and timed out.
That failure is retained. The corrected driver walks into casting range; the complete rerun passes.

128 content tests, 84 world tests plus the added path/checkpoint recovery test, 13 frontend tests,
one domain specialisation transaction test and 10 realtime ability/service tests pass. Domain proof
includes concurrent duplicates, ownership/class/level/mentor refusal and a stale retry after a newer
choice. Realtime checks proximity, death, threats and reconnect. Repository types, final world types,
lint and production build pass. Evidence logs are included as text. No production changes or
performance/capacity work; this does not claim release readiness.
