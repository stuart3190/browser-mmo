# Equipped armour appearance — 2026-10-24

Ten final two-client browser checks pass (3OHuI9): real purchases using starting copper, class-aware
shop explanations, local/remote equip/remove, both-class identity/appearance after relogin and no
browser errors. Warrior buys sword/cap/plate/cloak/buckler; Mage buys staff/robe/cloak and uses touch
panel controls. Fixtures begin at level five beside the Marches merchant; no item grants or injected
appearance. The earlier eight-check pass (F00xJr) is also retained. Front/rear and character-sheet
screenshots inspected; the folded-cape follow-up passes three further checks with both rear views reviewed.
Final frontend types, repository lint and build/debug guard pass after that visual change.

28 frontend,133 content,90 world,7 schema and18 domain tests pass, plus repository types, lint,
production builds/debug guard and content validation. Domain tests verify carried/stored gear is
absent, broken armour keeps its identity while losing stats, and equipped slots are server-derived.
World tests cover remote updates and checkpoint recovery; renderer checks cover picking/removal.

This adds visuals for current cap, chest armour/robe, three cloak templates and shield. Other slots,
future templates and cosmetic/transmog systems are not claimed complete. No production changes.
