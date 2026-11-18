/** Procedural pictograms for the Build catalog cards (shapes and colors, no image files). One per category, a few per piece where it helps. */
import type { ReactNode } from 'react';
import type { CatId } from '../../sim/buildCatalog';

const WOOD = '#b98a58', ROOF = '#a4503a', STONE = '#9aa0a0', DARK = '#2e332b', WATER = '#6fb0d8', LEAF = '#7fb05a', SUN = '#e8c25a', STEEL = '#aeb7bd', SOIL = '#8a6a48';

const house = (wall: string, roof: string): ReactNode => <><rect x="7" y="15" width="18" height="11" fill={wall} /><path d="M4 16 L16 6 L28 16 Z" fill={roof} /><rect x="14" y="19" width="4" height="7" fill={DARK} /></>;

const GLASS = '#bfe3f0', RIB = '#e6f4fa';
/** Dome pictograms, one per tier (dome_earthen / dome_geodesic / dome_glass / dome_arcology). */
function domeArt(kind: string): ReactNode {
  const base = <rect x="3" y="24" width="26" height="3" fill={DARK} />;
  if (/earthen/.test(kind)) return <>{base}<path d="M5 24 a11 15 0 0 1 22 0 Z" fill={SOIL} /><path d="M9 24 a7 9 0 0 1 14 0 Z" fill="#a98462" /><path d="M13 24 v-4 h6 v4 Z" fill={DARK} /><path d="M8 14 q3 -2 6 -1 M20 12 q3 0 4 2" stroke={LEAF} strokeWidth="1.5" fill="none" /></>;
  if (/geodesic/.test(kind)) return <>{base}<path d="M4 24 a12 17 0 0 1 24 0 Z" fill={GLASS} fillOpacity="0.35" stroke={RIB} strokeWidth="1.5" /><path d="M4 24 L16 11 L28 24 M9 24 L16 11 L23 24 M10 17 H22 M7 21 H25" stroke={RIB} strokeWidth="1.2" fill="none" /></>;
  if (/arcology/.test(kind)) return <>{base}<path d="M3 24 a13 18 0 0 1 26 0 Z" fill={GLASS} fillOpacity="0.28" stroke={RIB} strokeWidth="1.3" /><rect x="10" y="12" width="4" height="12" fill={STEEL} /><rect x="15" y="8" width="4" height="16" fill={STONE} /><rect x="20" y="14" width="4" height="10" fill={STEEL} /><path d="M11 15 h2 M16 11 h2 M16 15 h2 M21 17 h2" stroke={SUN} strokeWidth="1" /></>;
  return <>{base}<path d="M4 24 a12 16 0 0 1 24 0 Z" fill={GLASS} fillOpacity="0.4" stroke={RIB} strokeWidth="1.5" /><path d="M16 8 V24 M10 12 V24 M22 12 V24 M5 18 H27" stroke={RIB} strokeWidth="1" /><path d="M11 24 V20 a2 2 0 0 1 4 0 V24 M18 24 v-3 h4 v3" fill={LEAF} stroke={LEAF} strokeWidth="1" /></>;
}

function art(cat: CatId, kind: string): ReactNode {
  if (cat === 'enclosure' || /^dome_/.test(kind)) return domeArt(kind);
  if (/^well|cistern|water_tower|reservoir|pond|filtration/.test(kind)) {
    if (kind === 'water_tower') return <><rect x="10" y="6" width="12" height="9" rx="2" fill={WATER} /><path d="M12 15 L10 27 M20 15 L22 27 M16 15 V27" stroke={WOOD} strokeWidth="2" /></>;
    if (kind === 'cistern' || kind === 'filtration_shed') return <><rect x="8" y="9" width="16" height="17" rx="3" fill={STEEL} /><rect x="8" y="17" width="16" height="9" rx="3" fill={WATER} /></>;
    if (kind === 'pond' || kind === 'reservoir') return <><ellipse cx="16" cy="19" rx="12" ry="7" fill={WATER} /><path d="M10 18 q3 -2 6 0 t6 0" stroke="#d6ecf8" strokeWidth="1.5" fill="none" /></>;
    return <><path d="M9 26 V15 a7 7 0 0 1 14 0 V26 Z" fill={STONE} /><rect x="12" y="15" width="8" height="11" fill={WATER} /><rect x="14" y="5" width="4" height="8" fill={WOOD} /></>;
  }
  if (/solar/.test(kind)) return <><path d="M5 24 L9 11 H27 L23 24 Z" fill="#3b5f8f" stroke="#a8c4e8" strokeWidth="1" /><path d="M10 17 H26 M15 11 L12 24 M21 11 L18 24" stroke="#a8c4e8" strokeWidth="1" /></>;
  if (/battery/.test(kind)) return <><rect x="6" y="10" width="20" height="14" rx="2" fill={DARK} stroke={STEEL} strokeWidth="1.5" /><path d="M17 12 L12 18 H16 L15 22 L20 16 H16 Z" fill={SUN} /></>;
  if (/generator/.test(kind)) return <><rect x="6" y="11" width="20" height="13" rx="2" fill="#c0563a" /><rect x="9" y="14" width="8" height="7" fill={DARK} /><circle cx="22" cy="17" r="2.5" fill={SUN} /></>;
  if (/wind/.test(kind)) return <><path d="M16 26 V14" stroke={STEEL} strokeWidth="2" /><path d="M16 14 L16 4 M16 14 L24 19 M16 14 L8 19" stroke="#e6e9ec" strokeWidth="2.5" strokeLinecap="round" /></>;
  if (/hydro/.test(kind)) return <><rect x="6" y="14" width="14" height="10" fill={STONE} /><path d="M20 20 q6 -2 6 4" stroke={WATER} strokeWidth="3" fill="none" /></>;
  if (/tower|lookout/.test(kind)) return <><path d="M12 12 L10 27 M20 12 L22 27 M11 20 H21" stroke={WOOD} strokeWidth="2" /><rect x="9" y="6" width="14" height="7" fill={ROOF} /></>;
  if (/^bunker/.test(kind)) return <><rect x="4" y="12" width="24" height="3" fill={SOIL} /><rect x="9" y="17" width="14" height="9" fill={STONE} /><rect x="13" y="19" width="6" height="7" fill={DARK} /></>;
  switch (cat) {
    case 'shelter': return house(WOOD, ROOF);
    case 'work': return <><rect x="5" y="14" width="22" height="12" fill={STEEL} /><path d="M3 15 L16 8 L29 15 Z" fill="#6c7378" /><rect x="11" y="18" width="10" height="8" fill={DARK} /></>;
    case 'food': return <><path d="M4 26 H28" stroke={SOIL} strokeWidth="3" /><path d="M10 24 V14 M16 24 V10 M22 24 V14" stroke={LEAF} strokeWidth="2" /><circle cx="10" cy="12" r="3" fill={LEAF} /><circle cx="16" cy="8" r="3.5" fill={LEAF} /><circle cx="22" cy="12" r="3" fill={LEAF} /></>;
    case 'water': return <><path d="M16 5 C22 13 24 17 24 20 a8 8 0 0 1 -16 0 C8 17 10 13 16 5 Z" fill={WATER} /></>;
    case 'power': return <path d="M18 4 L8 18 H15 L13 28 L24 13 H17 Z" fill={SUN} />;
    case 'defense': return <><path d="M16 4 L26 8 V16 C26 22 21 26 16 28 C11 26 6 22 6 16 V8 Z" fill="#6c7a8a" stroke="#c9d2da" strokeWidth="1.5" /><path d="M16 9 V23 M10 14 H22" stroke="#dfe6ec" strokeWidth="1.5" /></>;
    case 'underground': return <><rect x="4" y="9" width="24" height="3" fill={LEAF} /><rect x="4" y="12" width="24" height="16" fill={SOIL} /><rect x="11" y="17" width="10" height="8" fill={DARK} /></>;
    case 'walls': return <><path d="M4 22 H28" stroke={WOOD} strokeWidth="2" /><path d="M7 26 V12 M14 26 V12 M21 26 V12 M27 26 V12" stroke={WOOD} strokeWidth="3" strokeLinecap="round" /><path d="M4 16 H28" stroke={WOOD} strokeWidth="2" /></>;
    case 'lines': return <><path d="M4 20 H28" stroke={WATER} strokeWidth="4" /><path d="M4 12 q6 -4 12 0 t12 0" stroke={SUN} strokeWidth="2" fill="none" /></>;
    default: return house(STEEL, DARK); // a new category without art still gets a pictogram, never a blank square
  }
}

export function CatIcon({ cat, kind, size = 34 }: { cat: CatId; kind: string; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" style={{ flex: 'none', display: 'block' }}>{art(cat, kind.replace(/^fence:/, ''))}</svg>;
}
