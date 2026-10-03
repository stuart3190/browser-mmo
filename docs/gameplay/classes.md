# Classes & specialisations

> All class and specialisation names below are **placeholders**, not final design
> (`placeholder: true` in data). The architecture is what is decided.

## Model

```
CharacterClass (class.warrior)
  ├ resource (rage/mana/focus/energy)
  ├ baseStats + statsPerLevel           → computeCharacterStats()
  ├ armorProficiencies / weaponProficiencies (equipment type ids) → checkCanEquip()
  ├ baseAbilityIds
  └ specialisationIds ──▶ CharacterSpecialisation (spec.warrior.guardian)
                             ├ roles: melee | ranged | magic | healer | support | tank (multi → hybrids)
                             ├ unlockLevel
                             └ abilityIds
```

A character stores `classId` and nullable `specialisationId`. Abilities and skills are data
(`AbilityDefinition`, `SkillDefinition`); ability `effects` are opaque until the combat system
defines its effect grammar. **No combat exists yet.**

## Placeholder roster

| Class   | Resource | Armour                              | Weapons                            | Specialisations (roles)                                                  |
| ------- | -------- | ----------------------------------- | ---------------------------------- | ------------------------------------------------------------------------ |
| Warrior | rage     | plate, mail, leather, cloth, shield | sword, axe, mace, dagger, crossbow | Guardian (tank, melee), Berserker (melee), Warlord (melee, support)      |
| Mage    | mana     | cloth                               | staff, wand, dagger                | Fire, Frost, Arcane (magic), Necromancy (magic, support)                 |
| Ranger  | focus    | mail, leather, cloth                | bow, crossbow, dagger, sword, axe  | Marksman (ranged), Beastmaster (ranged, support), Assassin (melee)       |
| Cleric  | mana     | mail, leather, cloth, shield        | mace, staff, wand                  | Healer (healer), Holy Warrior (melee, tank), Dark Priest (magic, healer) |

## Progression

`experienceCurve` (data): `xpToNext(level) = round(base × level^exponent)`, max level 60
(placeholder). `applyExperience()` handles multi-level gains. Nothing awards XP yet.

## Adding a class

Add definitions to `packages/game-data/src/content/classes.ts`; cross-validation fails fast on
unknown abilities, specs or equipment types. No schema or DB changes needed.
