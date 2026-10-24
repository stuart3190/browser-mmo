/** Decorative spell/strike silhouettes. Accessible names and rules remain on AbilityButton. */
export function AbilityGlyph({ id, fallback }: { id: string; fallback: string }) {
  let shape;
  if (id === 'ability.common.attack')
    shape = (
      <>
        <path d="m12 6 23 25-6 5L6 12 5 5Zm25 0L14 31l6 5 23-24 1-7Z" fill="currentColor" />
        <path
          d="m24 32 13 12m-19-7L8 46M26 39l10-10M12 28l13 13"
          stroke="currentColor"
          strokeWidth="4"
        />
      </>
    );
  else if (id === 'ability.warrior.heavy_strike')
    shape = (
      <>
        <path d="M20 5h8v23l-4 8-4-8Z" fill="currentColor" />
        <path
          d="M15 11h18M24 36v9M10 41l7-5m21 5-7-5M7 28l7 3m27-3-7 3"
          stroke="currentColor"
          strokeWidth="3"
        />
        <path d="M12 46h24" stroke="currentColor" strokeWidth="2" />
      </>
    );
  else if (id === 'ability.warrior.battle_strike')
    shape = (
      <>
        <path d="M5 36Q31 34 43 5 38 36 15 45ZM5 20Q23 21 36 4 29 26 10 28Z" fill="currentColor" />
        <path d="m29 31 13 12m-10-4 7-7" stroke="currentColor" strokeWidth="4" />
      </>
    );
  else if (id === 'ability.mage.firebolt')
    shape = (
      <>
        <path
          d="M43 5 26 10l8 2-16 5 8 1-14 8c-10 6-7 18 2 19 8 1 13-4 14-12l2-10 2 6 5-15 1 6Z"
          fill="currentColor"
        />
        <path d="M16 28c2 8 7 5 7 10-1 7-12 6-12 0 0-4 4-7 5-10Z" fill="#ffecd2" />
      </>
    );
  else if (id === 'ability.mage.flame_burst')
    shape = (
      <>
        <path
          d="M24 3c4 15 16 18 16 30 0 9-7 14-16 14S8 42 8 33c0-9 10-13 9-22l8 12c5-6-1-12-1-20Z"
          fill="currentColor"
        />
        <path d="M24 26c-1 6-6 9-6 13 0 6 12 7 12 0 0-4-5-6-6-13Z" fill="#ffecd2" />
        <path d="m4 10 5 8m35-8-5 8M2 28l4 2m40-2-4 2" stroke="currentColor" strokeWidth="2" />
      </>
    );
  else if (id === 'ability.warrior.guard')
    shape = (
      <>
        <path
          d="M24 4 41 11v13c0 10-8 17-17 21C15 41 7 34 7 24V11Z"
          stroke="currentColor"
          strokeWidth="4"
        />
        <path d="M24 11v25M14 21h20" stroke="currentColor" strokeWidth="4" />
      </>
    );
  else if (id === 'ability.mage.frost_nova')
    shape = (
      <>
        <path
          d="M24 4v40M7 14l34 20M7 34l34-20M18 8l6 6 6-6M18 40l6-6 6 6M7 21l8-2-2-8M41 27l-8 2 2 8M13 37l2-8-8-2M35 11l-2 8 8 2"
          stroke="currentColor"
          strokeWidth="3"
        />
        <circle cx="24" cy="24" r="5" fill="currentColor" />
      </>
    );
  else return <>{fallback}</>;
  return (
    <svg
      viewBox="0 0 48 48"
      className="ability-glyph"
      aria-hidden="true"
      focusable="false"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {shape}
    </svg>
  );
}
