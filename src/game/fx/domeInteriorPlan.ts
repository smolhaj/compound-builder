/**
 * What a big dome's floor is dressed with between the buildings (pure; drawn by DomeInterior.ts): a gravel path from each airlock in toward a central plaza,
 * benches along the paths, a supply crate stack and a sign at each door, planters round the plaza and lamp posts at the plaza. Everything keeps clear of
 * the buildings, the plant machinery, the airlock lanes and the shell (`Obstacle` boxes in the dome's local frame: x = rho sin a, z = rho cos a, a from +z).
 * SCALE v2: a person is 0.28 tall, a path 0.3 wide (2 m), a bench seat 0.075 high.
 */
/** An axis-aligned box in the dome's local frame: center and half sizes (a round thing is a square of its radius). */
export interface Obstacle { x: number; z: number; hx: number; hz: number; /** A lived-in house: its lit windows throw a pool of light round it at night. */ home?: boolean; /** The height of its floor above the ground (the porch deck): its light pool lies there. */ y?: number }
export interface PathSeg { x: number; z: number; rot: number; len: number; /** Width: a footpath is PATH_W, the vehicle lane LANE_W. */ w?: number }
export interface Prop { x: number; z: number; rot: number }
export interface InteriorPlan {
  segs: PathSeg[]; benches: Prop[]; crates: Prop[]; planters: Prop[]; signs: Prop[]; lamps: Array<{ x: number; z: number }>;
  plaza: { x: number; z: number; r: number } | null;
  /** Pools of window light round the houses (center, radius). */
  glows: Array<{ x: number; z: number; r: number; y?: number }>;
}
export const PATH_W = 0.3, LANE_W = 0.55, BENCH = { len: 0.17, dep: 0.06, seat: 0.075, back: 0.15 }, CRATE = 0.07;
const STEP = 0.3;

const hash = (n: number): number => { let h = (n | 0) * 374761393 + 668265263; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

export function interiorPlan(tier: string, r: number, angles: readonly number[], obstacles: readonly Obstacle[], seed = 1, vehicles: readonly number[] = []): InteriorPlan {
  const out: InteriorPlan = { segs: [], benches: [], crates: [], planters: [], signs: [], lamps: [], plaza: null, glows: [] };
  if (tier !== 'glass' && tier !== 'arcology' && tier !== 'geodesic') return out;
  const nearLane = (x: number, z: number): boolean => vehicles.some(a => { const al = x * Math.sin(a) + z * Math.cos(a), ac = Math.abs(x * Math.cos(a) - z * Math.sin(a)); return al > r * 0.4 && ac < LANE_W / 2 + 0.45; });
  const free = (x: number, z: number, pad: number, inner = 0.9): boolean => Math.hypot(x, z) < r * inner && !nearLane(x, z) && !obstacles.some(o => Math.abs(x - o.x) < o.hx + pad && Math.abs(z - o.z) < o.hz + pad);
  // a lit house throws its light on the lawn round it: the pool is centered a little toward the middle of the dome, so the lit part lies where the ground shows
  // (centered on the house it hides under the floor; lying at porch height it washes the deck to white)
  for (const o of obstacles) if (o.home) { const m = Math.max(o.hx, o.hz), d = Math.hypot(o.x, o.z) || 1, off = Math.min(d, m + 0.4); out.glows.push({ x: o.x - o.x / d * off, z: o.z - o.z / d * off, r: m * 1.5 + 0.35 }); }
  const plazaR = Math.min(0.9, r * 0.11);
  const plazaOk = free(0, 0, plazaR + 0.25, 1);
  if (plazaOk) out.plaza = { x: 0, z: 0, r: plazaR };
  const rho0 = r * 0.86, rho1 = plazaOk ? plazaR : r * 0.12;
  angles.forEach((a, ai) => {
    const sx = Math.sin(a), sz = Math.cos(a), px = sz, pz = -sx;   // along (outward) and across
    // the path, in pieces of one step; a piece that would cross a building is left out (the path stops at its door and goes on after it)
    const n = Math.max(0, Math.floor((rho0 - rho1) / STEP));
    for (let i = 0; i < n; i++) {
      const rho = rho0 - (i + 0.5) * STEP;
      if (rho > r * 0.88) continue;
      const x = sx * rho, z = sz * rho;
      if (free(x, z, PATH_W / 2 + 0.03) && free(sx * (rho + STEP / 2), sz * (rho + STEP / 2), PATH_W / 2) && free(sx * (rho - STEP / 2), sz * (rho - STEP / 2), PATH_W / 2)) out.segs.push({ x, z, rot: Math.atan2(sx, sz), len: STEP + 0.01 });
    }
    const onPath = (rho: number): boolean => out.segs.some(s => Math.hypot(s.x - sx * rho, s.z - sz * rho) < STEP * 0.6);
    // benches: every few steps, alternating sides, facing the path
    const bs = [0.74, 0.56, 0.4].map((f, k) => ({ rho: r * f, side: (k + ai) % 2 ? 1 : -1 }));
    for (const b of bs) {
      if (!onPath(b.rho)) continue;
      const off = PATH_W / 2 + BENCH.dep / 2 + 0.06, x = sx * b.rho + px * off * b.side, z = sz * b.rho + pz * off * b.side;
      if (free(x, z, BENCH.len / 2 + 0.04)) {
        out.benches.push({ x, z, rot: Math.atan2(-b.side * sz, b.side * sx) });
        // a lamp post at every other bench, its pool of light reaching across the path
        if (out.lamps.length < 9 && (b.rho === bs[0].rho || b.rho === bs[2].rho)) out.lamps.push({ x: x + sx * 0.14, z: z + sz * 0.14 });
      }
    }
    // the door: a crate stack off the lane (a supply drop), a sign on the other side
    const dr = r * 0.82;
    for (const [side, kind] of [[1, 'crate'], [-1, 'sign']] as const) {
      const off = 0.62, x = sx * dr + px * off * side, z = sz * dr + pz * off * side;
      if (!free(x, z, 0.2, 0.95)) continue;
      (kind === 'crate' ? out.crates : out.signs).push({ x, z, rot: Math.atan2(sx, sz) + hash(seed + ai) * 0.3 });
    }
  });
  // a ring path round the middle of the dome, in pieces; the pieces a building or a spoke already covers are left out
  { const rr = r * 0.6, n = Math.floor(2 * Math.PI * rr / STEP);
    for (let i = 0; i < n; i++) {
      const a = (i + 0.5) * 2 * Math.PI / n, x = Math.sin(a) * rr, z = Math.cos(a) * rr, d = 2 * Math.PI / n * rr + 0.02;
      if (!free(x, z, PATH_W / 2 + 0.03)) continue;
      // where a spoke crosses, the ring leaves a gap (the spoke's own curbs run through, with no dark bar across the path)
      if (angles.some(an => Math.abs(Math.atan2(Math.sin(a - an), Math.cos(a - an))) * rr < PATH_W / 2 + d / 2 + 0.02)) continue;
      const a0 = i * 2 * Math.PI / n, a1 = (i + 1) * 2 * Math.PI / n;
      if (!free(Math.sin(a0) * rr, Math.cos(a0) * rr, PATH_W / 2) || !free(Math.sin(a1) * rr, Math.cos(a1) * rr, PATH_W / 2)) continue;
      out.segs.push({ x, z, rot: Math.atan2(Math.cos(a), -Math.sin(a)), len: d });
    }
    // benches on the ring, facing inward
    for (let i = 0; i < 8; i++) {
      const a = (i + 0.5) * Math.PI / 4 + 0.2, off = rr + PATH_W / 2 + BENCH.dep / 2 + 0.06, x = Math.sin(a) * off, z = Math.cos(a) * off;
      if (out.segs.some(s => Math.hypot(s.x - Math.sin(a) * rr, s.z - Math.cos(a) * rr) < STEP * 0.6) && free(x, z, BENCH.len / 2 + 0.04) && !angles.some(an => Math.abs(Math.atan2(Math.sin(a - an), Math.cos(a - an))) < 0.2)) { out.benches.push({ x, z, rot: Math.atan2(-Math.sin(a), -Math.cos(a)) }); if (i % 2 === 0 && out.lamps.length < 14) out.lamps.push({ x: x + Math.cos(a) * 0.16, z: z - Math.sin(a) * 0.16 }); }
    }
  }
  // the vehicle sally port: a paved lane from its inner door in to a parking pad (trucks stop on pavement, never on the lawn); nothing is set in its way
  for (const a of vehicles) {
    const sx = Math.sin(a), sz = Math.cos(a), r1 = r * 0.5;
    for (let rho = r * 0.86; rho > r1; rho -= STEP) {
      const x = sx * (rho - STEP / 2), z = sz * (rho - STEP / 2);
      if (Math.hypot(x, z) >= r * 0.92 || obstacles.some(o => Math.abs(x - o.x) < o.hx + LANE_W / 2 + 0.03 && Math.abs(z - o.z) < o.hz + LANE_W / 2 + 0.03)) break;
      out.segs.push({ x, z, rot: Math.atan2(sx, sz), len: STEP + 0.01, w: LANE_W });
    }
  }
  if (out.plaza) {
    const k = 6, pr = out.plaza.r + 0.2;
    for (let i = 0; i < k; i++) {
      const a = (i + 0.5) * Math.PI * 2 / k, x = Math.sin(a) * pr, z = Math.cos(a) * pr;
      if (angles.some(an => Math.abs(Math.atan2(Math.sin(a - an), Math.cos(a - an))) < 0.32)) continue;   // keep the paths' mouths open
      if (free(x, z, 0.1, 1)) out.planters.push({ x, z, rot: a });
    }
    for (let i = 0; i < 3; i++) { const a = i * Math.PI * 2 / 3 + 0.5, x = Math.sin(a) * (out.plaza.r + 0.02), z = Math.cos(a) * (out.plaza.r + 0.02); if (free(x, z, 0.05, 1)) out.lamps.push({ x, z }); }
  }
  return out;
}
