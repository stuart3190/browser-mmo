# Quick remedy — verified 2026-10-24

The existing remedy can now be used with H or a dedicated touch button. The control shows carried
unlocked quantity and the server's persistent cooldown; it does not heal or consume optimistically.
The item details sheet uses the same readiness rule. Pending requests prevent rapid duplicate taps.
Full health, death, reconnect, unknown readiness, locked/vaulted items and cooldown disable use.

The isolated browser run passes eleven checks: buy three remedies through the coastal merchant UI,
refuse accidental full-health use, walk to the shore, take real crab damage, heal using H, decrement
one item, show cooldown, refuse repeated shortcuts, escape, relog on touch with the exact same server
ready time/count, verify portrait/landscape hit targets, then take real damage and heal by touch.
Screenshots reviewed. No bag was opened for combat healing. Fixture starts at level five at the
merchant, with ordinary starting funds; no item grants, health edits or injected consumption.

15 frontend, eight domain systems and six realtime instance/consumable tests pass. Server evidence
checks actual healing before acknowledgement, cooldown state after reconnect, duplicate requests
and exact stack consumption. Repository types, final frontend/realtime types, lint and production
build pass. Evidence logs are text with whitespace normalized. Production remains untouched.

Follow-up presentation finding: repeated unavailable-action notices can stack identical toasts.
Deduplicate these during the next visual/feedback pass. The quick-heal function itself is verified.
