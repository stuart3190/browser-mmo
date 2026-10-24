# Tidewatch commissions — 2026-10-24

Both classes earn the shore story, salvage and weapon through normal gameplay. The full run
`iaQjr4` passed the Warrior commission, reload/collection, equip/power, another victory and
99/100 condition after relogin. Mage completed the same story, earned salvage, crafted across
logout and equipped the staff. Its driver then compared spell power against an absent stat
(`undefined`) instead of zero. Original failure and all preceding checks/screenshots are retained.

The corrected driver uses zero for sparse stats. The exact same earned Mage was resumed in the
same isolated disposable fixture, without character/item/quest mutations. It unequipped/re-equipped,
verified 0→20 spell power and effective maximum health, won a crab fight and relogged with exactly
one equipped staff at 99/100 condition. Six continuation checks pass. Screenshots inspected.
This is a staged continuation, not an uninterrupted all-pass run. Initial fixtures start at level
five with prior Greenvale closure; all new shore story, salvage and crafting are actually earned.

130 content and 17 frontend tests pass. Twenty existing service/profession regressions plus two
new commission integration tests pass. The initial new test attempted an impossible completed but
unrewarded quest row; the existing DB constraint correctly rejected it. Corrected fixture passes;
no constraints changed. Tests cover unpaid/active-story rejection without taking costs, duplicate
requests, durable jobs, exact delivery/provenance, effective equipped damage and both class outputs.
Repository types, lint, production build/debug guard and content validation pass.
No production changes, benchmarks or infrastructure work. Release safety validation is separate.
