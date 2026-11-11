/**
 * The entrance card's hover, to the world: while the family looks at a candidate entrance (sim/roadEntrance.ts) the world draws that road
 * as an amber line, so the choice is seen on the ground before it is confirmed. A tiny pub/sub (the HUD sets it; the canvas listens).
 */
type Listener = (z: number | null) => void;
const listeners = new Set<Listener>();
let current: number | null = null;

export const entrancePreview = (): number | null => current;
export function setEntrancePreview(z: number | null): void {
  if (z === current) return;
  current = z;
  for (const l of listeners) l(z);
}
export function onEntrancePreview(l: Listener): () => void { listeners.add(l); return () => { listeners.delete(l); }; }

/**
 * Picking the entrance on the map (the Land card's "Where should the road come in?" is open): hovering the county road previews the nearest candidate,
 * a click confirms it. The card registers the candidates and what a click does; the canvas reads them.
 */
export interface EntrancePick { spots: ReadonlyArray<{ z: number; gateZ: number }>; apply: (z: number) => void }
let pick: EntrancePick | null = null;
export const entrancePick = (): EntrancePick | null => pick;
export function setEntrancePick(p: EntrancePick | null): void { pick = p; }

/** The candidate whose gate is nearest this world z along the road (null when there are none). */
export function nearestSpot(spots: EntrancePick['spots'], worldZ: number): number | null {
  let best: number | null = null, bd = Infinity;
  for (const s of spots) { const d = Math.abs(s.gateZ - worldZ); if (d < bd) { bd = d; best = s.z; } }
  return best;
}
