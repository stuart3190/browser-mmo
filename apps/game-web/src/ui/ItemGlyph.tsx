import type { ItemTemplate } from '@mmo/schemas';

/** Small vector silhouettes stay legible at inventory-slot sizes and need no image download. */
export function ItemGlyph({ template }: { template: ItemTemplate }) {
  const equipment = template.equipment;
  const type = equipment?.equipmentTypeId;
  const id = template.id;
  let shape;
  if (id === 'accessory.trinket.watchkeepers_compass')
    shape = (
      <>
        <circle cx="32" cy="34" r="23" fill="#263e3c" stroke="#ddbf70" strokeWidth="4" />
        <circle cx="32" cy="34" r="17" stroke="#a79965" strokeWidth="1" />
        <path d="M32 13v5m21 16h-5M32 55v-5M11 34h5" stroke="#f3dda1" strokeWidth="2" />
        <path d="m32 16 5 18-5 18-5-18Z" fill="#e5cb84" />
        <path d="m17 43 15-14 15 14-15-4Z" fill="#8bc9bf" />
        <circle cx="32" cy="34" r="3" fill="#fff0bc" />
        <path d="M27 10V6h10v4" stroke="#ddbf70" strokeWidth="3" />
      </>
    );
  else if (type === 'sword' || type === 'dagger')
    shape = (
      <>
        <path d="M18 40 41 6 44 21 25 44Z" fill="#c7d9dd" />
        <path d="m18 39 10 7M20 45l-7 10" stroke="#d5ad60" strokeWidth="5" />
        <path d="m25 35 12-19" stroke="#fff5db" />
      </>
    );
  else if (type === 'staff' || type === 'wand')
    shape = (
      <>
        <path d="m17 56 23-39M32 20l-3-9 10-6 10 7-5 10" stroke="#bd9560" strokeWidth="5" />
        <path d="m37 9 6 3-3 8-6-2Z" fill="#8cd6e8" stroke="#dbf9ff" />
        <path d="m23 43 8 4" stroke="#e7ca81" strokeWidth="3" />
      </>
    );
  else if (type === 'axe')
    shape = (
      <>
        <path d="m16 56 26-44" stroke="#b58a52" strokeWidth="5" />
        <path d="M25 9c-5 8-7 15-3 23l14-6 13 6c5-8 5-15 1-22l-11 5Z" fill="#a7bdc1" />
        <path d="m37 17 1 8" stroke="#d9e4df" strokeWidth="3" />
      </>
    );
  else if (type === 'bow' || type === 'crossbow')
    shape = (
      <>
        <path d="M17 8Q58 30 17 56" stroke="#c79d63" strokeWidth="5" />
        <path d="m17 8 9 24-9 24M10 32h43m-7-5 8 5-8 5" stroke="#e6d9b5" strokeWidth="2" />
      </>
    );
  else if (equipment?.slotType === 'head')
    shape = (
      <>
        <path d="M12 39V27a20 20 0 0 1 40 0v12l-12 8-3-15H27l-3 15Z" fill="#a99172" />
        <path d="M32 8v21M15 28h34" stroke="#d7bb88" strokeWidth="3" />
        <path d="m18 34 6 2m16 0 6-2" stroke="#273438" strokeWidth="4" />
      </>
    );
  else if (equipment?.slotType === 'ring')
    shape = (
      <>
        <ellipse cx="32" cy="37" rx="16" ry="18" stroke="#d9b76a" strokeWidth="7" />
        <path d="m22 18 10-9 10 9-10 12Z" fill="#8dc4bd" stroke="#ecd58d" strokeWidth="3" />
        <path d="m32 12 3 8-8-2" stroke="#e6fff1" />
      </>
    );
  else if (equipment?.slotType === 'cloak' || type === 'cloak')
    shape = (
      <>
        <path d="M25 10h14l14 42-21-7-21 7Z" fill="#829baa" />
        <path d="m25 10 7 10 7-10M32 20v25" stroke="#c0d3ce" strokeWidth="2" />
        <circle cx="32" cy="20" r="4" fill="#dfc27d" />
      </>
    );
  else if (type === 'shield')
    shape = (
      <>
        <path
          d="m10 14 22-7 22 7-4 26-18 17-18-17Z"
          fill="#748f98"
          stroke="#c5b57e"
          strokeWidth="3"
        />
        <path d="M32 12v37M17 23h30" stroke="#c6d9d4" strokeWidth="4" />
      </>
    );
  else if (equipment?.slotType === 'necklace')
    shape = (
      <>
        <path d="M16 8q-2 28 16 32Q50 36 48 8" stroke="#d7bd7b" strokeWidth="3" />
        <path d="m32 29 10 12-10 15-10-15Z" fill="#8fbcbc" stroke="#e3cf94" strokeWidth="2" />
        <path d="m32 35 4 7-4 7-4-7Z" fill="#cde4d1" />
      </>
    );
  else if (equipment?.slotType === 'trinket')
    shape = (
      <>
        <path
          d="m17 16 15-7 15 7 5 19-20 22L12 35Z"
          fill="#b67662"
          stroke="#dcb978"
          strokeWidth="2"
        />
        <path d="m32 9-8 25 8 23 8-23Z" fill="#e4ac71" />
        <path d="M17 16 24 34 12 35m12-1 16 0 7-18" stroke="#f0cf94" />
      </>
    );
  else if (equipment?.slotType === 'chest' && type === 'cloth')
    shape = (
      <>
        <path d="m24 10-13 7 4 14 8-4-9 28h36l-9-28 8 4 4-14-13-7-8 7Z" fill="#899cbd" />
        <path d="m24 10 8 10 8-10M32 20v34M23 31h18" stroke="#d4c49a" strokeWidth="3" />
      </>
    );
  else if (equipment?.slotType === 'feet')
    shape = (
      <>
        <path d="M20 10h21l-2 28 13 8v8H14V41l6-6Z" fill="#ae8a62" />
        <path d="M20 16h20M24 23h11m-12 7h11M15 49h35" stroke="#dfc18b" strokeWidth="3" />
      </>
    );
  else if (equipment)
    shape = (
      <>
        <path d="m23 10-13 7 5 17 9-3-3 22h22l-3-22 9 3 5-17-13-7-9 7Z" fill="#91a5a6" />
        <path d="M24 25h16M26 33h12M25 42h14M32 18v30" stroke="#d4d5b8" strokeWidth="2" />
      </>
    );
  else if (id.startsWith('tool.'))
    shape = id.includes('woodcutting') ? (
      <>
        <path d="m18 54 22-41" stroke="#b58a52" strokeWidth="5" />
        <path d="M25 12c-6 6-8 15-4 23l16-8 13 5c5-7 5-15 1-22l-12 6Z" fill="#a7bdc1" />
      </>
    ) : id.includes('herbalism') ? (
      <>
        <path d="m17 55 12-19" stroke="#bd9964" strokeWidth="5" />
        <path d="M29 36C62 28 47 2 27 14c17-2 22 15 2 22Z" fill="#bdced0" />
        <path d="m22 47 5 3" stroke="#f0d69a" strokeWidth="3" />
      </>
    ) : (
      <>
        <path d="m18 54 20-36" stroke="#bd9964" strokeWidth="5" />
        <path d="M17 15Q35 4 53 28L38 22 31 28Z" fill="#b6c8c8" />
        <path d="m21 47 5 3" stroke="#f0d69a" strokeWidth="3" />
      </>
    );
  else if (/cloth/.test(id))
    shape = (
      <>
        <path d="m10 18 32-8 12 34-31 10Z" fill="#a6b8ba" />
        <path d="m17 19 9 27 25-6M22 18l8 24m-4-25 8 24m-13-11 24-6m-21 14 24-6" stroke="#d8d5ba" />
      </>
    );
  else if (/reins/.test(id))
    shape = (
      <>
        <path d="M18 12C2 37 17 55 32 55s30-18 14-43l-10 4c14 24-22 24-8 0Z" fill="#bac6bd" />
        <path
          d="m18 22 5 1m-6 11 5-1m3 13 3-4m15-19 5-1m-1 12-5-1m-3 13-3-4"
          stroke="#465c5e"
          strokeWidth="3"
        />
      </>
    );
  else if (template.category === 'consumable')
    shape = (
      <>
        <path
          d="M25 10h14v16c17 14 14 28-7 28S8 40 25 26Z"
          fill="#548e80"
          stroke="#bfd1ad"
          strokeWidth="2"
        />
        <path d="M17 39h30c3 9-3 14-15 14s-18-5-15-14" fill="#81bf9c" />
        <path d="M24 11h16" stroke="#c4a471" strokeWidth="6" />
        <path d="M22 32q-7 8-1 12" stroke="#d8f4d0" strokeWidth="3" />
      </>
    );
  else if (/herb|bloom|leaf|reed/.test(id))
    shape = (
      <>
        <path d="m24 56 15-44" stroke="#c7bc78" strokeWidth="3" />
        <path
          d="M31 38C7 41 9 22 9 22c16-1 23 6 22 16Zm5-15C21 21 23 8 23 8c13-3 18 6 13 15Zm-3 12c3-18 22-19 22-19 1 15-11 23-22 19Z"
          fill="#9fbe80"
        />
        <path d="m17 29 13 8m7-5 12-10" stroke="#d3dda0" />
      </>
    );
  else if (/wood|timber|log/.test(id))
    shape = (
      <>
        <path d="m11 38 28-25 14 15-28 26Z" fill="#a77b50" stroke="#d4b47a" strokeWidth="2" />
        <ellipse cx="18" cy="45" rx="10" ry="8" transform="rotate(45 18 45)" fill="#dfc28d" />
        <path d="m24 41 19-17m-16 22 20-18" stroke="#6d5942" strokeWidth="2" />
        <circle cx="18" cy="45" r="4" stroke="#ad8554" />
      </>
    );
  else if (/ore|iron|shard|crystal|fragment/.test(id))
    shape = (
      <>
        <path d="m8 40 11-21 16-9 19 26-11 17H20Z" fill="#91a8b2" />
        <path
          d="m19 19 7 22 9-31 6 26 13 0M8 40l18 1 17 12-2-17-15 5"
          stroke="#d0d8ce"
          strokeWidth="2"
        />
        <path d="m19 19 7 22-6 12Z" fill="#637983" />
      </>
    );
  else if (/pelt|fur|hide/.test(id))
    shape = (
      <>
        <path
          d="m20 10 12 5 12-5 6 13-6 9 8 17-12 5-8-9-8 9-12-5 8-17-6-9Z"
          fill="#b0a08a"
          stroke="#d7c5a4"
          strokeWidth="2"
        />
        <path d="M32 21v20m-6-16 6 5 6-5m-12 9 6 5 6-5" stroke="#7f7160" strokeWidth="2" />
      </>
    );
  else if (/salt|dust/.test(id))
    shape = (
      <>
        <path d="m20 12 12 4 12-4-5 12c22 25 10 32-7 32S3 49 25 24Z" fill="#b4a080" />
        <path d="M23 24h18" stroke="#e6cca2" strokeWidth="4" />
        <circle cx="27" cy="39" r="2" fill="#e4d9c0" />
        <circle cx="37" cy="43" r="3" fill="#e4d9c0" />
        <circle cx="28" cy="47" r="2" fill="#e4d9c0" />
      </>
    );
  else
    shape = (
      <>
        <path d="M17 10h32l-4 37H16Z" fill="#decba0" />
        <path
          d="M17 10c-9-5-10 7-3 7h7m-5 30c-7 0-7 9 1 9h28c7 0 8-9 0-9M25 23h13m-14 7h14m-15 7h9"
          stroke="#a88b5a"
          strokeWidth="2"
        />
        <circle cx="38" cy="43" r="6" fill="#a66655" />
      </>
    );
  return (
    <svg
      viewBox="0 0 64 64"
      className="item-glyph"
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
