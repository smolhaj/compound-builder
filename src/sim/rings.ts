/**
 * Rings within the compound (docs/DECISIONS.md, "Rings within the compound"):
 * defense in depth, a la Minas Tirith. The outer ring is the Fortify ring; each
 * ring inside it has its own wall, its own gate (on the far side from the one
 * outside it, so a crew has to walk round) and its own towers. On a slope the
 * rings follow the contour, each higher up the hill; on level ground they are
 * the outer outline stepped in. Pure (tested).
 *
 *  - `planRings`: the geometry, the bill and the notes for 2-4 rings;
 *  - `layRings`: lays the inner rings out (walls, gates, towers) for the family to build;
 *  - `ringsAround` / `ringsHolding` / `ringHoldSeconds` / `ringPoints`: what the finished
 *    rings do. Each intact ring beyond the first buys the defenders time in a raid
 *    (`RING.DELAY` seconds at the line) and counts toward how hard crews find the place
 *    (`RING.POINTS` defense points), but it has to be manned: two armed adults a ring,
 *    or it holds no better than the one outside it.
 */
import type { Gate, Pt, PerimeterKind, PerimeterRun } from './perimeter';
import { PERIMETER, planRun, runBill, runFinished, runHours, wallLength } from './perimeter';
import { avoidRects, flattenAt, polygonArea, regionFromPolygon, selfIntersects } from './ringShape';
import { buildingRects } from './obstacles';
import { BLUEPRINTS, isHome, totalBill, totalHours } from './blueprints';
import { MATERIALS, type MaterialId, type Stock } from './materials';
import { log, orderCost } from './economy';
import { isFinished, planStructure } from './construction';
import { applyForPermit, countyWorks, needsPermit, permitFee } from './paperwork';
import { TOWERS, stampHighGround, type TowerKind } from './towers';
import { insideRing, yardRings } from './compounds';
import { enclosure } from './enclosure';
import type { GameState } from './state';
import type { PropertyGeometry } from './propertyWall';
import { groundOf } from './terrainState';

export const RING = {
  MIN: 1, MAX: 4,
  /** Seconds a raid spends at the line for each manned inner ring (the family falls back, the crew has to take the next wall). */
  DELAY: 18,
  /** Defense points each manned inner ring adds to how hard crews find the place (sim/adaptive.ts `terrain` input; the scale runs 40-100). */
  POINTS: 4,
  /** Armed adults it takes to man one ring beyond the first. */
  FIGHTERS: 2,
  /** The least a ring steps in from the one outside it (units, 1 = 6 m) and how small the innermost may be. */
  GAP: 1.8, MIN_R: 3.2,
  /** Gate gap of an inner ring (a truck fits). */
  GATE_W: 0.6,
} as const;

/** The sally port: a man-door in a ring wall, opposite its main gate (docs/DECISIONS.md, "Gatehouse leaf and sally port"). */
export const SALLY = {
  /** Width of the door (units: 1.8 m, one person at a time). */
  W: 0.3,
  /** Ports counted, at most (a port never shortens the rings' hold: a stronger lot is never an easier raid). */
  MAX: 2,
  /** The defenders' share of extra hits on crews held at the line for each port (a sortie from the flank), up to `MAX` ports. */
  SORTIE: 0.06,
  /** What a port costs the family on top of the wall: a plank door, straps and a lock. */
  BILL: { lumber: 3, hardware: 2 } as Partial<Stock>,
} as const;

export type RingGates = 'alternate' | 'aligned';
export interface RingOptions {
  /** Rings in all, the outer (Fortify) ring included: 1-4. */
  count: number;
  /** What the inner rings are built of. */
  wall: PerimeterKind;
  /** Gates on opposite sides ring by ring (a crew has to walk round) or all on the road side. */
  gates: RingGates;
  /** Towers on each inner ring. */
  towers: number;
  towerKind: TowerKind;
  /** A sally port in each inner ring, on the far side from its main gate. */
  sally: boolean;
  /** Tower sites already taken (the outer ring's towers, laid with the same plan): an inner tower keeps clear of them. */
  taken?: readonly Pt[];
}
export const DEFAULT_RINGS: RingOptions = { count: 1, wall: 'stone_wall', gates: 'alternate', towers: 2, towerKind: 'watchtower_wood', sally: false };

export interface RingSpec {
  /** 1 = the first inner ring ... */
  tier: number;
  poly: Pt[];
  /** The gate: its middle on the wall, and the unit vector inward. */
  gate: { at: Pt; inward: Pt };
  kind: PerimeterKind;
  /** Mean ground height round the ring (units). */
  level: number;
  towers: Array<{ kind: TowerKind; x: number; z: number }>;
  /** Creek bars across the creek where it crosses this ring (a ring that overlaps the creek is barred automatically). */
  bars: Pt[][];
}

export interface RingPlan {
  options: RingOptions;
  /** The inner rings, outermost first (the outer ring is the Fortify ring). */
  rings: RingSpec[];
  center: Pt;
  /** The rings follow the contour (the ground slopes enough to matter) rather than being stepped in. */
  contour: boolean;
  notes: string[];
  bill: Partial<Stock>;
  cost: number;
  own: Array<{ material: MaterialId; qty: number }>;
  permits: number;
  hours: number;
}

/** The creek is barred this far either side of its centerline, beyond its half width (matches propertyWall's BANK). */
const BANK = 0.6;

/**
 * Where the creek (`creekZ`, flowing west to east) crosses the closed ring `poly`, one short bar run per crossing,
 * laid along the ring's edge there so the bars close the water gap in the wall. Crossings that bars already stand across are left.
 */
export function ringBars(poly: readonly Pt[], creekZ: (x: number) => number, half: number, existing: ReadonlyArray<readonly Pt[]> = []): Pt[][] {
  const out: Pt[][] = [], reach = half + BANK;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const da = a[1] - creekZ(a[0]), db = b[1] - creekZ(b[0]);
    if ((da < 0) === (db < 0)) continue;   // a vertex exactly on the creek counts as the near side once
    const f = da / (da - db), cx = a[0] + (b[0] - a[0]) * f, cz = a[1] + (b[1] - a[1]) * f;
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, dx = (b[0] - a[0]) / L, dz = (b[1] - a[1]) / L;
    if (existing.some(r => r.some((q, k) => k > 0 && Math.hypot((q[0] + r[k - 1][0]) / 2 - cx, (q[1] + r[k - 1][1]) / 2 - cz) < reach))) continue;
    out.push([[cx - dx * reach, cz - dz * reach], [cx + dx * reach, cz + dz * reach]]);
  }
  return out;
}

const centroid = (poly: readonly Pt[]): Pt => [poly.reduce((a, p) => a + p[0], 0) / poly.length, poly.reduce((a, p) => a + p[1], 0) / poly.length];
const addBill = (into: Partial<Stock>, bill: Partial<Stock>): void => { for (const [k, q] of Object.entries(bill) as Array<[MaterialId, number]>) into[k] = (into[k] ?? 0) + q; };

/** The polygon's distance from `c` along the unit direction (dx, dz): where the ray leaves it. */
function rayExit(poly: readonly Pt[], c: Pt, dx: number, dz: number): number {
  let best = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length], ex = b[0] - a[0], ez = b[1] - a[1];
    const den = dx * ez - dz * ex;
    if (Math.abs(den) < 1e-9) continue;
    const t = ((a[0] - c[0]) * ez - (a[1] - c[1]) * ex) / den, u = ((a[0] - c[0]) * dz - (a[1] - c[1]) * dx) / den;
    if (t > 0 && u >= -1e-9 && u <= 1 + 1e-9) best = Math.max(best, t);
  }
  return best;
}

/**
 * The inner ring polygons: `n` rays from the center, each stepping in from the
 * outer wall. On level ground tier j sits at (1 - j / count) of the way; on a
 * slope it sits where the ground reaches the tier's height (the contour), held
 * between the nominal radius and the outer wall.
 */
export function ringPolygons(outer: readonly Pt[], count: number, ground?: (x: number, z: number) => number, center: Pt = centroid(outer)): { polys: Pt[][]; contour: boolean } {
  const N = 28, c = center;
  const dirs = Array.from({ length: N }, (_, i) => { const t = i / N * Math.PI * 2; return [Math.cos(t), Math.sin(t)] as Pt; });
  const D = dirs.map(([dx, dz]) => rayExit(outer, c, dx, dz));
  const ho = ground ? outer.reduce((a, p) => a + ground(p[0], p[1]), 0) / outer.length : 0, hc = ground ? ground(c[0], c[1]) : 0;
  const contour = !!ground && Math.abs(hc - ho) >= 0.6;
  const polys: Pt[][] = [];
  let prev = D;
  for (let j = 1; j < count; j++) {
    const f = 1 - j / count * 0.86, target = contour ? ho + (hc - ho) * (j / count) : 0;
    const r = D.map((d, i) => {
      const nominal = Math.max(RING.MIN_R, d * f);
      if (!contour || !ground) return nominal;
      // walk out from the center until the ground drops below the tier's height (it climbs to the keep): that is the contour
      let found = nominal;
      for (let q = 0.5; q <= d * 0.97; q += 0.5) { const h = ground(c[0] + dirs[i][0] * q, c[1] + dirs[i][1] * q); if ((hc >= ho && h <= target) || (hc < ho && h >= target)) { found = q; break; } }
      // keep it within a band of the nominal so it stays a ring (not a spike)
      return Math.max(nominal * 0.7, Math.min(nominal * 1.3, found));
    });
    // one smoothing pass, then step in from the ring outside it by at least GAP
    const sm = r.map((v, i) => 0.25 * r[(i + N - 1) % N] + 0.5 * v + 0.25 * r[(i + 1) % N]);
    // no room left to step in by a gap and still have a ring: that is as many as this compound holds
    if (prev.some(v => v - RING.GAP < RING.MIN_R)) break;
    const fit = sm.map((v, i) => Math.max(RING.MIN_R, Math.min(v, prev[i] - RING.GAP)));
    polys.push(fit.map((rr, i) => [c[0] + dirs[i][0] * rr, c[1] + dirs[i][1] * rr] as Pt));
    prev = fit;
  }
  return { polys, contour };
}

/** The gate of a ring: a flat chord cut at `ang` (radians from the center), its middle and the inward unit vector. */
function gateOn(poly: readonly Pt[], c: Pt, ang: number): { poly: Pt[]; at: Pt; inward: Pt } {
  const dx = Math.cos(ang), dz = Math.sin(ang), d = rayExit(poly, c, dx, dz);
  const p: Pt = [c[0] + dx * d, c[1] + dz * d];
  const cut = flattenAt(poly, p, RING.GATE_W);
  // the middle of the chord: the new vertices at the cut are the two points nearest p
  const near = [...cut].sort((a, b) => Math.hypot(a[0] - p[0], a[1] - p[1]) - Math.hypot(b[0] - p[0], b[1] - p[1])).slice(0, 2);
  const at: Pt = [(near[0][0] + near[1][0]) / 2, (near[0][1] + near[1][1]) / 2];
  const l = Math.hypot(c[0] - at[0], c[1] - at[1]) || 1;
  return { poly: cut, at, inward: [(c[0] - at[0]) / l, (c[1] - at[1]) / l] };
}

/** Pick `n` tower sites just inside a ring (corners and mid-spans, spread out, clear of its gate and of `taken`). Pure geometry (no buildings are checked here: the caller does). */
/** The ring outline rotated to start at the gate's chord, closed (as `layRings` lays it), and where the sally port sits on it (half way round: distance along, and the point). */
function sallyOn(poly: readonly Pt[], gateAt: Pt): { closed: Pt[]; at: number; pt: Pt } {
  let best = 0, bd = Infinity;
  poly.forEach((p, i) => { const q = poly[(i + 1) % poly.length], d = Math.hypot((p[0] + q[0]) / 2 - gateAt[0], (p[1] + q[1]) / 2 - gateAt[1]); if (d < bd) { bd = d; best = i; } });
  const rot = [...poly.slice(best), ...poly.slice(0, best)].map(p => [p[0], p[1]] as Pt), closed = [...rot, rot[0]];
  const L = wallLength({ pts: closed, gates: [] }), at = L / 2;
  let d = 0, pt: Pt = rot[0];
  for (let i = 1; i < closed.length; i++) { const a = closed[i - 1], b = closed[i], l = Math.hypot(b[0] - a[0], b[1] - a[1]); if (d + l >= at) { const f = l ? (at - d) / l : 0; pt = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]; break; } d += l; }
  return { closed, at, pt };
}

function towerSpots(poly: readonly Pt[], n: number, gate: Pt, taken: readonly Pt[], avoid: readonly Pt[] = [], stands: ReadonlyArray<{ x0: number; z0: number; x1: number; z1: number }> = []): Pt[] {
  if (n <= 0) return [];
  const region = regionFromPolygon(poly), cands: Pt[] = [];
  const inset = TOWERS.watchtower_wood.cells * 0.5 / 2 + 0.3;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    for (const f of [0, 0.5]) {
      const x = a[0] + (b[0] - a[0]) * f, z = a[1] + (b[1] - a[1]) * f, dx = (b[0] - a[0]) / (l || 1), dz = (b[1] - a[1]) / (l || 1);
      const nrm: Pt = region.contains(x - dz * 0.1, z + dx * 0.1) ? [-dz, dx] : [dz, -dx];
      for (let k = 0; k < 5; k++) { const sx = x + nrm[0] * (inset + 0.3 * k), sz = z + nrm[1] * (inset + 0.3 * k); if (region.contains(sx, sz) && region.contains(sx + 0.9, sz) && region.contains(sx - 0.9, sz) && region.contains(sx, sz + 0.9) && region.contains(sx, sz - 0.9)) { cands.push([sx, sz]); break; } }
    }
  }
  const out: Pt[] = [], ref: Pt[] = [gate, ...taken];
  const half = TOWERS.watchtower_wood.cells * 0.5 / 2 + 0.3;   // (the footprint the sites above were pushed in by)
  const pool = cands.filter(p => Math.hypot(p[0] - gate[0], p[1] - gate[1]) > 3 && avoid.every(a => Math.hypot(p[0] - a[0], p[1] - a[1]) > 2.4)
    && taken.every(t => Math.hypot(p[0] - t[0], p[1] - t[1]) > 1.6)
    && !stands.some(b => p[0] + half > b.x0 && p[0] - half < b.x1 && p[1] + half > b.z0 && p[1] - half < b.z1));
  while (out.length < n && pool.length) {
    let best = 0, bd = -1;
    pool.forEach((p, i) => { const d = ref.concat(out).reduce((a, q) => Math.min(a, Math.hypot(q[0] - p[0], q[1] - p[1])), Infinity); if (d > bd) { bd = d; best = i; } });
    out.push(pool.splice(best, 1)[0]);
  }
  return out;
}

/**
 * Plan the rings inside the outer wall `outer`. `outerGate`: where the outer
 * ring's gate is (the inner gates alternate away from it). Nothing is laid out.
 */
export function planRings(s: GameState, outer: readonly Pt[], outerGate: Pt | null, geo: PropertyGeometry = {}, opts: Partial<RingOptions> = {}): RingPlan {
  const options: RingOptions = { ...DEFAULT_RINGS, ...opts, count: Math.max(RING.MIN, Math.min(RING.MAX, Math.round(opts.count ?? DEFAULT_RINGS.count))) };
  const notes: string[] = [];
  const ground = geo.ground ?? groundOf(s)?.h;
  const center = centroid(outer);
  const made = ringPolygons(outer, options.count, ground, center);
  // an inner wall bends round a building that stands where it would run (the house is inside the ring, or outside it, never cut in two)
  const stands = buildingRects(s);
  let polys = made.polys.map(p => (stands.length ? avoidRects(p, stands) : p));
  const contour = made.contour;
  // too small a compound for this many rings, or a tangled outline: fewer rings, and say so
  const ok = (p: Pt[]) => !selfIntersects(p) && polygonArea(p) > 6;
  const good = polys.filter(ok);
  if (good.length < options.count - 1) { notes.push(`The compound has room for ${good.length + 1} ring${good.length ? 's' : ''}, not ${options.count}.`); polys = good; }
  const baseAng = outerGate ? Math.atan2(outerGate[1] - center[1], outerGate[0] - center[0]) : Math.PI / 2;
  const rings: RingSpec[] = [];
  const taken: Pt[] = [...(options.taken ?? [])];
  polys.forEach((poly, i) => {
    const ang = baseAng + (options.gates === 'alternate' ? (i + 1) * Math.PI : 0);
    const g = gateOn(poly, center, ang);
    const spots = towerSpots(g.poly, options.towers, g.at, taken, options.sally ? [sallyOn(g.poly, g.at).pt] : [], stands);
    spots.forEach(p => taken.push(p));
    if (spots.length < options.towers) notes.push(`Ring ${i + 2}: ${spots.length} of ${options.towers} tower sites found.`);
    const level = ground ? g.poly.reduce((a, p) => a + ground(p[0], p[1]), 0) / g.poly.length : 0;
    rings.push({ tier: i + 1, poly: g.poly, gate: { at: g.at, inward: g.inward }, kind: options.wall, level, towers: spots.map(p => ({ kind: options.towerKind, x: p[0], z: p[1] })), bars: [] });
    if (s.site.creek && geo.creekZ) {
      rings[rings.length - 1].bars = ringBars(g.poly, geo.creekZ, geo.creekHalf ?? 0.7, [...s.perimeter.filter(r => r.kind === 'creek_bars').map(r => r.pts), ...rings.flatMap(q => q.bars)]);
    }
  });
  const bill: Partial<Stock> = {};
  let hours = 0, permits = 0;
  for (const r of rings) {
    const closed = [...r.poly, r.poly[0]], len = wallLength({ pts: closed, gates: [{ at: 0, w: RING.GATE_W }] });
    addBill(bill, runBill(r.kind, len)); hours += runHours(r.kind, len);
    if (options.sally) { addBill(bill, SALLY.BILL); hours += 14; }
    for (const b of r.bars) { const l = wallLength({ pts: b, gates: [] }); addBill(bill, runBill('creek_bars', l)); hours += runHours('creek_bars', l); }
    if (r.bars.length) notes.push(`Ring ${r.tier + 1}: the creek crosses it, so ${r.bars.length} set${r.bars.length > 1 ? 's' : ''} of creek bars go in.`);
    for (const t of r.towers) { addBill(bill, totalBill(BLUEPRINTS[t.kind])); hours += totalHours(BLUEPRINTS[t.kind]); if (needsPermit(t.kind) && s.paper.permits && countyWorks(s)) permits += permitFee(s, t.kind); }
  }
  const buy = (Object.entries(bill) as Array<[MaterialId, number]>).filter(([m]) => MATERIALS[m].price !== null).map(([material, qty]) => ({ material, qty }));
  const own = (Object.entries(bill) as Array<[MaterialId, number]>).filter(([m]) => MATERIALS[m].price === null).map(([material, qty]) => ({ material, qty }));
  return { options, rings, center, contour, notes, bill, cost: orderCost(buy) + permits, own, permits, hours: Math.round(hours) };
}

/** Lay the inner rings out: a closed wall with a gate gap, and the towers, for the family to build. Returns how many runs and structures. */
export function layRings(s: GameState, plan: RingPlan): { runs: number; structures: number } {
  let runs = 0, structures = 0;
  for (const r of plan.rings) {
    // the gate gap is cut into the closed outline at the chord the plan made
    const pts: Pt[] = [...r.poly.map(p => [p[0], p[1]] as Pt)];
    let best = 0, bd = Infinity;
    pts.forEach((p, i) => { const q = pts[(i + 1) % pts.length], d = Math.hypot((p[0] + q[0]) / 2 - r.gate.at[0], (p[1] + q[1]) / 2 - r.gate.at[1]); if (d < bd) { bd = d; best = i; } });
    // start the run at the gate chord so the gap sits at its middle: rotate the outline so the chord is the first edge
    const rot = [...pts.slice(best), ...pts.slice(0, best)];
    const closed = [...rot, rot[0]];
    const chord = Math.hypot(rot[1][0] - rot[0][0], rot[1][1] - rot[0][1]);
    const gates: Gate[] = [{ at: chord / 2, w: Math.min(RING.GATE_W, Math.max(0.3, chord - 0.4)) }];
    if (plan.options.sally) gates.push({ at: sallyOn(r.poly, r.gate.at).at, w: SALLY.W, sally: true });
    planRun(s, r.kind, closed, gates, 0, true);
    runs++;
    for (const b of r.bars) { planRun(s, 'creek_bars', b.map(p => [p[0], p[1]] as Pt), [], 0, true); runs++; }
    for (const t of r.towers) { const st = planStructure(s, t.kind, t.x, t.z, 0); stampHighGround(st); applyForPermit(s, st); structures++; }
  }
  if (plan.rings.length) log(s, `Laid out ${plan.rings.length} inner ring${plan.rings.length > 1 ? 's' : ''}${plan.contour ? ' along the contour of the hill' : ''}: a ${PERIMETER[plan.options.wall].name.toLowerCase()} each with its own gate${plan.options.towers ? ' and towers' : ''}.`);
  return { runs, structures };
}

// ── what finished rings do ──

/** The finished closed rings (the property line when it is closed, and every yard ring) that have the point inside them. */
export function ringsAround(s: GameState, p: Pt): PerimeterRun[] {
  const rings = yardRings(s).filter(r => runFinished(r) && insideRing(r.pts, p[0], p[1]));
  return rings;
}

/** Number of nested finished rings round the family's home: the property line counts when it is closed. */
export function ringCount(s: GameState): number {
  const homes = s.structures.filter(st => isHome(st.kind) && isFinished(st));
  const at: Pt = homes.length ? [homes.reduce((a, st) => a + st.x, 0) / homes.length, homes.reduce((a, st) => a + st.z, 0) / homes.length] : [(s.site.home.x0 + s.site.home.x1) / 2, (s.site.home.z0 + s.site.home.z1) / 2];
  const e = enclosure(s);
  const line = e.openShare === 0 && e.creekOpen === 0 ? 1 : 0;
  return line + ringsAround(s, at).length;
}

/** How many armed adults are there to man the rings (adults who can fight, not on a long trip). */
function fighters(s: GameState): number {
  let n = 0;
  s.people.forEach((p, i) => { const ps = s.personState[i]; if (!p.kid && ps && ps.needs.died == null && ps.task !== 'gone' && ps.task !== 'town') n++; });
  return n;
}

/** Rings that actually hold: one ring needs no one extra; each ring beyond it needs `RING.FIGHTERS` adults to man it. */
export function ringsHolding(s: GameState): number {
  const n = ringCount(s);
  if (n <= 1) return n;
  return Math.max(1, Math.min(n, 1 + Math.floor(fighters(s) / RING.FIGHTERS) - 0));
}

/** The finished sally ports on the rings (a standing wall with a port gate in it). */
export const sallyPorts = (s: GameState): number => s.perimeter.reduce((a, r) => a + (runFinished(r) ? r.gates.filter(g => g.sally).length : 0), 0);

/** Extra hits the defenders get on crews held at the line: a sortie from the sally port's flank (1 = none). */
export const sortieFactor = (s: GameState): number => 1 + Math.min(SALLY.MAX, sallyPorts(s)) * SALLY.SORTIE;

/** Seconds a raid spends at the line for the manned inner rings (0 with one ring or none);  */
export const ringHoldSeconds = (s: GameState): number => {
  const hold = Math.max(0, ringsHolding(s) - 1) * RING.DELAY;
  return hold;
};

/** Defense-equivalent points the manned inner rings add to how hard crews find the place. */
export const ringPoints = (s: GameState): number => Math.max(0, ringsHolding(s) - 1) * RING.POINTS;
