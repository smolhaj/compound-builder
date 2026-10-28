/**
 * The build tool stays armed after a click so a row of things can go up, and
 * the cursor is then still over the piece just staked: it would read
 * "Overlaps another building" in red. While the cursor stays on that same
 * spot (same snapped cell and turn) the ghost keeps quiet; moving to another
 * cell, or turning the piece, brings the normal check back. Pure (tested).
 */
export interface Spot { x: number; z: number; rot: number }

export function onJustPlaced(just: Spot | null, x: number, z: number, rot: number): boolean {
  return !!just && just.rot === rot && Math.abs(just.x - x) < 1e-6 && Math.abs(just.z - z) < 1e-6;
}
