// Felt-style placeholder pictures (used until Shani's real photos are uploaded in the admin area).
export const ART: Record<string, string> = {
  sun: '<circle cx="50" cy="50" r="22" fill="#F8C33A"/><g stroke="#F8C33A" stroke-width="7" stroke-linecap="round"><path d="M50 8v12M50 80v12M8 50h12M80 50h12M20 20l9 9M71 71l9 9M80 20l-9 9M29 71l-9 9"/></g>',
  heart: '<path d="M50 85S12 62 12 36c0-12 9-20 20-20 8 0 14 5 18 11 4-6 10-11 18-11 11 0 20 8 20 20 0 26-38 49-38 49z" fill="#E8573C"/>',
  star: '<path d="M50 8l12 28 30 3-23 20 7 30-26-16-26 16 7-30L8 39l30-3z" fill="#F8C33A"/>',
  tree: '<rect x="44" y="60" width="12" height="30" rx="4" fill="#8B5A2B"/><circle cx="50" cy="40" r="30" fill="#6BAF5B"/><circle cx="40" cy="35" r="5" fill="#E8573C"/><circle cx="60" cy="48" r="5" fill="#E8573C"/>',
  fish: '<ellipse cx="45" cy="50" rx="30" ry="20" fill="#F28C28"/><path d="M72 50l20-16v32z" fill="#F28C28"/><circle cx="30" cy="45" r="4" fill="#5A3A22"/>',
  house: '<path d="M15 48L50 18l35 30z" fill="#E8573C"/><rect x="24" y="46" width="52" height="40" rx="4" fill="#FBE3A0"/><rect x="43" y="62" width="14" height="24" rx="3" fill="#8B5A2B"/>',
  balloon: '<ellipse cx="38" cy="38" rx="16" ry="20" fill="#E8573C"/><ellipse cx="62" cy="34" rx="16" ry="20" fill="#4A90C8"/><path d="M38 58q4 15 10 30M62 54q-4 18-12 34" stroke="#5A3A22" stroke-width="2" fill="none"/>',
  flower: '<g fill="#F07FA0"><circle cx="50" cy="28" r="14"/><circle cx="50" cy="62" r="14"/><circle cx="33" cy="45" r="14"/><circle cx="67" cy="45" r="14"/></g><circle cx="50" cy="45" r="10" fill="#F8C33A"/>',
  apple: '<circle cx="50" cy="56" r="30" fill="#D9412F"/><path d="M50 26q2-12 12-14" stroke="#5A3A22" stroke-width="4" fill="none"/><ellipse cx="62" cy="22" rx="9" ry="5" fill="#6BAF5B"/>',
  car: '<path d="M12 62V48l14-16h40l16 16h6v14z" fill="#4A90C8"/><circle cx="30" cy="66" r="10" fill="#5A3A22"/><circle cx="72" cy="66" r="10" fill="#5A3A22"/><rect x="32" y="37" width="14" height="12" rx="2" fill="#fff"/><rect x="52" y="37" width="14" height="12" rx="2" fill="#fff"/>',
  family: '<circle cx="30" cy="30" r="11" fill="#F2C9A0"/><circle cx="70" cy="30" r="11" fill="#F2C9A0"/><circle cx="50" cy="55" r="9" fill="#F2C9A0"/><rect x="19" y="44" width="22" height="40" rx="10" fill="#4A90C8"/><rect x="59" y="44" width="22" height="40" rx="10" fill="#E8573C"/><rect x="42" y="66" width="16" height="22" rx="7" fill="#F8C33A"/>',
  book: '<path d="M10 25q20-8 40 4v58q-20-12-40-4z" fill="#F28C28"/><path d="M90 25q-20-8-40 4v58q20-12 40-4z" fill="#F8C33A"/><circle cx="30" cy="48" r="7" fill="#fff"/><path d="M62 45h18M62 55h14" stroke="#fff" stroke-width="4" stroke-linecap="round"/>',
  moon: '<path d="M62 14a36 36 0 1 0 24 52A30 30 0 0 1 62 14z" fill="#F8C33A"/><circle cx="26" cy="22" r="3" fill="#fff"/><circle cx="80" cy="30" r="2.5" fill="#fff"/>',
  clock: '<circle cx="50" cy="50" r="36" fill="#fff" stroke="#4A90C8" stroke-width="7"/><path d="M50 50V28M50 50l15 9" stroke="#5A3A22" stroke-width="5" stroke-linecap="round"/><circle cx="50" cy="50" r="4" fill="#E8573C"/>',
  cat: '<path d="M24 40l6-22 14 14h12l14-14 6 22v24c0 14-12 24-26 24S24 78 24 64z" fill="#F28C28"/><circle cx="40" cy="52" r="4" fill="#5A3A22"/><circle cx="60" cy="52" r="4" fill="#5A3A22"/><path d="M46 62q4 4 8 0" stroke="#5A3A22" stroke-width="3" fill="none"/>',
  shoe: '<path d="M14 70V46q0-6 6-6h18l10 14 30 6q10 2 10 10v4z" fill="#4A90C8"/><rect x="12" y="70" width="78" height="9" rx="4" fill="#5A3A22"/><path d="M40 46l10 8M36 52l12 8M44 42l8 6" stroke="#fff" stroke-width="3" stroke-linecap="round"/>',
  rainbow: '<g fill="none" stroke-width="9"><path d="M14 74a36 36 0 0 1 72 0" stroke="#E8573C"/><path d="M23 74a27 27 0 0 1 54 0" stroke="#F8C33A"/><path d="M32 74a18 18 0 0 1 36 0" stroke="#6BAF5B"/><path d="M41 74a9 9 0 0 1 18 0" stroke="#4A90C8"/></g>',
};

const BG = ['#FBD38D', '#F9B97A', '#BFE0B5', '#B9D7EE', '#F7C6D4', '#FFE7A3', '#D9C7F0', '#F5B5A0'];

/** 800×600 SVG: colored felt square with a dashed "stitch" frame and a picture in the middle. */
export function feltSvg(name: string, colorIndex: number): string {
  const bg = BG[colorIndex % BG.length];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600">
<rect width="800" height="600" fill="${bg}"/>
<rect x="24" y="24" width="752" height="552" rx="36" fill="none" stroke="#fff" stroke-opacity=".8" stroke-width="6" stroke-dasharray="22 14"/>
<g transform="translate(250 150) scale(3)">${ART[name] ?? ART.star}</g></svg>`;
}
