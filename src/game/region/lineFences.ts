/**
 * lineFences — the neighbors' line fences along the county road and the
 * forty lines running back from it, built the way the region builds them
 * (regionWorld.fence):
 *   wire   four strands of barbed wire on green steel T-posts every ~4 m,
 *          a wood brace post every ~100 m (the West and the Plains);
 *   rail   a zigzag split-rail ("worm") fence, rails ~3.3 m long laid
 *          six high at ±20°, no posts (the southern mountains);
 *   stone  a fieldstone wall ~0.9 m high and ~0.7 m wide, cleared off the
 *          fields (Maine);
 *   woven  woven wire on wood posts every ~4 m with a barbed strand on top
 *          (dairy and Northwest farm country).
 * Pure layout (tested) plus a builder onto RegionalProps boxes.
 * 1 unit ≈ 6 m.
 */
import type { RegionalProps } from '../../engine/world/houses/regionalProps';
import type { FenceStyle } from './regionWorld';

export type Pt = [number, number];

/** A fence run: a polyline, with gaps (creek / lane crossings) taken out by `keep`. */
export interface FenceRun { pts: Pt[] }

/**
 * The runs: along the far (east) side of the county road, and a forty line
 * east from it north and south of the place. `roadX(z)` is the road's
 * center line, `half` half its width.
 */
export function planLineFences(roadX: (z: number) => number, half: number, z0: number, z1: number, step = 2): FenceRun[] {
  const along: Pt[] = [];
  for (let z = z0; z <= z1; z += step) along.push([roadX(z) + half + 0.9, z]);
  const runs: FenceRun[] = [{ pts: along }];
  for (const zl of [-67, 134]) {
    const x0 = roadX(zl) + half + 0.9;
    const pts: Pt[] = [];
    for (let x = x0; x <= x0 + 160; x += step) pts.push([x, zl]);
    runs.push({ pts });
  }
  return runs;
}

const T_POST = 0x3e5a3a, WOOD = 0x6a5440, GRAY_WOOD = 0x8a8072, WIRE = 0x8e9296, STONE = 0x8a867c;

/**
 * Build the runs onto `props` (instanced boxes). `ground(x, z)` is the
 * surface; `skip(x, z)` leaves gaps (water, farm lanes, the place itself).
 */
export function buildLineFences(
  runs: readonly FenceRun[], style: FenceStyle, props: RegionalProps,
  ground: (x: number, z: number) => number, skip: (x: number, z: number) => boolean, hash: (a: number, b: number) => number,
): number {
  let n = 0;
  for (const run of runs) {
    // resample at the style's post spacing
    const spacing = style === 'rail' ? 0.52 : style === 'stone' ? 1.2 : 0.68;
    const pts: Pt[] = [];
    let acc = 0;
    pts.push(run.pts[0]);
    for (let i = 1; i < run.pts.length; i++) {
      const [ax, az] = run.pts[i - 1], [bx, bz] = run.pts[i];
      const l = Math.hypot(bx - ax, bz - az);
      let t = spacing - acc;
      while (t <= l) { pts.push([ax + (bx - ax) * t / l, az + (bz - az) * t / l]); t += spacing; }
      acc = l - (t - spacing);
    }
    for (let i = 1; i < pts.length; i++) {
      const [ax, az] = pts[i - 1], [bx, bz] = pts[i];
      if (skip(ax, az) || skip(bx, bz)) continue;
      const ya = ground(ax, az), yb = ground(bx, bz);
      const mx = (ax + bx) / 2, mz = (az + bz) / 2, my = (ya + yb) / 2;
      const len = Math.hypot(bx - ax, bz - az), rot = Math.atan2(bx - ax, bz - az) + Math.PI / 2;
      const hj = hash(mx, mz);
      if (style === 'wire' || style === 'woven') {
        // posts: T-posts (a wood brace post every ~16th), or wood line posts
        const brace = style === 'wire' ? i % 16 === 0 : true;
        const pw = brace ? 0.028 : 0.012;
        props.box(ax, ya - 0.02, az, rot, pw, brace ? 0.24 : 0.21, pw, brace ? (style === 'woven' ? GRAY_WOOD : WOOD) : T_POST);
        const strands = style === 'wire' ? [0.07, 0.11, 0.15, 0.19] : [0.04, 0.07, 0.1, 0.13, 0.16, 0.2];
        for (const h of strands) props.box(mx, my + h, mz, rot, len, 0.004, 0.004, WIRE);
        n++;
      } else if (style === 'rail') {
        // worm fence: each panel set ±20° off the line, its end resting on the next panel's
        const zig = (i % 2 ? 1 : -1) * 0.35;
        for (let k = 0; k < 6; k++) props.box(mx, my + 0.02 + k * 0.036, mz, rot + zig, len * 1.1, 0.022, 0.03, k % 2 ? GRAY_WOOD : 0x7a6e60);
        n++;
      } else {
        // fieldstone wall: courses of rounded stones, uneven along its length
        const h = 0.12 + 0.05 * hj;
        props.box(mx, my - 0.03, mz, rot, len * 1.02, h, 0.12 + 0.03 * hash(mz, mx), STONE);
        props.box(mx + (hj - 0.5) * 0.04, my + h - 0.05, mz, rot + (hj - 0.5) * 0.2, len * 0.7, 0.06, 0.1, 0x7e7a70);
        n++;
      }
    }
  }
  return n;
}
