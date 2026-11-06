/** Player-facing number and place formatters (pure). Never put a raw float in a UI string. */
import type { Rect } from './site';
import { gallonsText } from './units';

/** "3 gal", "0.2 gal": a volume held in liters, shown in U.S. gallons. */
export function litersText(l: number): string {
  return gallonsText(l);
}

/** A spot on the property as a compass word relative to the home place: "north edge", "south-east corner", "middle". */
export function spotText(x: number, z: number, home: Rect): string {
  const cx = (home.x0 + home.x1) / 2, cz = (home.z0 + home.z1) / 2;
  const fx = (x - cx) / Math.max(1, (home.x1 - home.x0) / 2), fz = (z - cz) / Math.max(1, (home.z1 - home.z0) / 2);
  const ew = fx > 0.35 ? 'east' : fx < -0.35 ? 'west' : '';
  const ns = fz > 0.35 ? 'south' : fz < -0.35 ? 'north' : '';
  if (ew && ns) return `${ns}-${ew} corner`;
  if (ew || ns) return `${ew || ns} edge`;
  return 'middle';
}

/** "north edge, east edge, south-east corner": the distinct places, in order, capped. */
export function spotsText(pts: ReadonlyArray<readonly [number, number]>, home: Rect, max = 3): string {
  const seen: string[] = [];
  for (const [x, z] of pts) { const t = spotText(x, z, home); if (!seen.includes(t)) seen.push(t); if (seen.length >= max) break; }
  return seen.join(', ');
}

/** "about 1 in 5": how much of a line is open, as plain words. */
export function openLineText(share: number): string {
  if (share >= 0.97) return 'none of the line stops an animal with teeth';
  return `${Math.round(share * 100)}% of the line is open to animals with teeth`;
}
