/**
 * The evenings' goods on and by the family's table (sim/evenings.ts): a board game box, a deck of cards and dice,
 * a stack of paperbacks, the music player, the guitar leaning on the table, the kids' toys and picture books on the
 * floor beside it. Drawn only in the main home, only for goods the household owns, worn ones looking worn. No random
 * numbers are drawn, so a house furnishes exactly as before when it has none of them.
 */
import { Clutter } from './clutter';
import { M } from './interior';
import type { BuildOpts, FurnishCtx } from './shell';

/** The goods in the main home's table: `table` its middle in the building frame and its turn (radians), `h` the top's height in metres. */
export function dressEvenings(c: FurnishCtx, table: { x: number; z: number; rot?: number }, h = 0.76): void {
  const g: NonNullable<BuildOpts['goods']> | undefined = c.parts.opts.goods;
  if (!g) return;
  const rot = table.rot ?? 0, cs = Math.cos(rot), sn = Math.sin(rot);
  /** A point at (u, v) metres from the middle of the table in its own frame, in the building's frame. */
  const at = (u: number, v: number) => ({ x: table.x + (u * cs + v * sn) * M, z: table.z + (-u * sn + v * cs) * M });
  const top = c.y0 + 0.004 + h * M;
  const put = (u: number, v: number, a: number, fn: Parameters<FurnishCtx['I']>[1], y = top) => c.I({ ...at(u, v), rot: rot + a, y }, fn, false);
  if (g.games) {
    put(-0.17, 0.0, 0.1, a => Clutter.gameBox(a, g.games === 2));
    put(0.2, 0.17, -0.4, a => Clutter.cards(a, g.games === 2));
  }
  if (g.books) put(0.3, -0.2, 0.3, a => Clutter.paperbacks(a, g.books === 2));
  if (g.player) put(-0.3, 0.29, Math.PI + 0.2, a => Clutter.radio(a));
  if (g.guitar) { const p = at(0.68, 0); c.I({ x: p.x, z: p.z, rot: rot + Math.PI / 2, y: c.y0 + 0.004 }, a => Clutter.guitar(a), false); }
  if (g.toys) { const p = at(-0.3, 0.8); c.I({ x: p.x, z: p.z, rot: rot + 0.4, y: c.y0 + 0.004 }, a => Clutter.toys(a), false); }
  if (g.kidbooks) { const p = at(0.3, 0.8); c.I({ x: p.x, z: p.z, rot: rot - 0.3, y: c.y0 + 0.004 }, a => Clutter.pictureBooks(a, g.kidbooks === 2), false); }
}
