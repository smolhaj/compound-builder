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
