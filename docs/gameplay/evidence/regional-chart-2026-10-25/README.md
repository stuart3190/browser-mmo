# Regional field chart — 2026-10-25

Gameplay-only local browser proof. Production untouched. Two ordinary new level-one characters
(Warrior desktop, Mage portrait touch) use the atlas, select a location, walk to the Old Well,
change coordinate areas and select a distant Elderwood destination. No grants or teleports.

- `initial/`: 21 checks pass. Review found the desktop chart vertically clipped by the old window
  placement. Portrait layout was readable. Retained as the initial implementation evidence.
- `expanded-desktop/`: 21 checks pass after enlarging desktop atlas space. The full chart fits.
- Final selection follow-up makes the first selected direction scroll into view automatically;
  `selection-visibility/`: 15 checks pass, desktop/portrait screenshots reviewed.
- 31 frontend tests pass (including projection, touch clustering and clipping). `checks.txt`
  contains repository typecheck/lint/build and production debug-hook exclusion evidence.

The chart renders authored places and roads, no hidden enemies. Separate zone coordinate spaces
remain explicit. It delegates guidance to the existing route system; server travel rules remain
unchanged. Remote region charts start at their harbour; sparse atlas regions are not claimed to
have complete gameplay. Desktop and browser-emulated portrait touch only, not physical-phone proof.
