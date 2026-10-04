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

A character stores `classId` (set at creation, never changed by gameplay; only classes with
`playable: true` can be created) and nullable `specialisationId`. Abilities and skills are data
(`AbilityDefinition`, `SkillDefinition`). Ability `effects` stay opaque for a future effect grammar;
live abilities use the `damage` block below. Decision record: `docs/adr/0019-class-abilities.md`.

## Playable classes and abilities (2026-10-04)

Only **Warrior** and **Mage** are playable. Ranger and Cleric (and every spec) remain placeholders.
The bar is `baseAbilityIds` in slot order; `ability.common.attack` is shared.

| Slot | Warrior                                            | Mage                                                     |
| ---- | -------------------------------------------------- | -------------------------------------------------------- |
| 1    | Attack — toggles weapon auto-attack (3.5 m)        | Attack — toggles weapon auto-attack (3.5 m)              |
| 2    | Heavy Strike — 3.5 m, 6 s cooldown, physical       | Firebolt — 25 m, 4 s cooldown, magic, projectile         |
| 3    | Battle Strike — **level 2**, 3.5 m, 12 s, physical | Flame Burst — **level 2**, 20 m, 10 s, magic, projectile |

Every non-auto ability also starts a 1 s global cooldown (`combatRules.abilityGlobalCooldownMs`).
No resources (mana/rage) yet: cooldowns alone pace combat (the class `resource` field stays data only).

### Formulas (`packages/game-data/src/rules/abilities.ts`, first pass, not balanced)

```
raw    = roll(base.min..base.max) + roll(weapon.min..weapon.max) × weaponMultiplier
         + Σ effectiveStat × scaling[stat]
hit    = same hit chance as melee (level difference); crit = same crit chance/multiplier
final  = physical: raw × (1 − armour mitigation)   magic: raw (no resistances yet); min 1 on hit
```

| Ability       | base  | weapon × | scaling                        |
| ------------- | ----- | -------- | ------------------------------ |
| Heavy Strike  | 8–12  | 1.0      | strength 0.8, attack_power 0.5 |
| Battle Strike | 14–18 | 1.5      | strength 1.0, attack_power 0.5 |
| Firebolt      | 12–18 | 0        | intellect 0.8, spell_power 1.0 |
| Flame Burst   | 22–30 | 0        | intellect 1.2, spell_power 1.2 |

Effective stats come from `getCharacterStats` (class base + level + gear); an equipment change
refreshes the simulation's profile through the change feed, so the next ability use reflects it.

### Authority

`ability.use {abilityId}` acts on the current server-side target. `ZoneSimulation.useAbility`
checks, in order: ability exists → it is on the caster's class bar (`WRONG_CLASS` →
`ABILITY_NOT_AVAILABLE`) → level (`ABILITY_LOCKED`) → caster alive → cooldown + global cooldown on
the **server clock** (`ON_COOLDOWN`) → target exists / hostile / alive → range + tolerance →
line of sight. Then it rolls the outcome. The client cannot send damage, timestamps or a class.
Cooldowns are kept per character in the simulation, survive reconnects (linger) and are saved to
`characters.ability_cooldowns` when leaving the world (expired entries dropped) and restored on join.
`ability.state` (unlocks + ready times in server time) is pushed on join/resync, after each use and
when a level-up unlocks an ability (`newlyUnlocked`).

## Placeholder roster

| Class   | Resource | Armour                              | Weapons                            | Specialisations (roles)                                                  |
| ------- | -------- | ----------------------------------- | ---------------------------------- | ------------------------------------------------------------------------ |
| Warrior | rage     | plate, mail, leather, cloth, shield | sword, axe, mace, dagger, crossbow | Guardian (tank, melee), Berserker (melee), Warlord (melee, support)      |
| Mage    | mana     | cloth                               | staff, wand, dagger                | Fire, Frost, Arcane (magic), Necromancy (magic, support)                 |
| Ranger  | focus    | mail, leather, cloth                | bow, crossbow, dagger, sword, axe  | Marksman (ranged), Beastmaster (ranged, support), Assassin (melee)       |
| Cleric  | mana     | mail, leather, cloth, shield        | mace, staff, wand                  | Healer (healer), Holy Warrior (melee, tank), Dark Priest (magic, healer) |

## Progression

`experienceCurve` (data): `xpToNext(level) = round(base × level^exponent)`, max level 60
(placeholder). `applyExperience()` handles multi-level gains. Kills and quests award XP.

## Adding a class

Add definitions to `packages/game-data/src/content/classes.ts`; cross-validation fails fast on
unknown abilities, specs or equipment types, abilities owned by another class, and live abilities
using unsupported features (non-enemy targeting, cast times, resource costs). Set `playable: true`
once its abilities are live. No schema or DB changes needed.
