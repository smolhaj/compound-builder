/**
 * The mountainside showcase's design (docs/DECISIONS.md, "Mountain showcase"): the north-star compound (inspiration images 28 / 29) laid out on the
 * hillside lot with the rock-face cutbank, as an ordered list of the real build actions a player has. It is written against `ShowcaseIO`, so the same
 * design runs in the browser (game/showcase.ts: the placement tool, the perimeter tool, the store actions) and headless in the tests
 * (sim/showcase.test.ts: the sim functions those actions call), and the integration checks run on both. Pure; QA / dev only: nothing here is a game rule.
 *
 * Every step is recorded (what was asked, whether the game allowed it, where it ended up, why not). A step the land or a rule refuses is a finding, not
 * an error: the design carries on without it and says so in the report.
 */
import type { GameState } from './state';
import type { Pt } from './perimeter';
import { drainLineFor, undrained } from './drainage';
import { terraceSite } from './terrace';
import type { FortressOptions } from './fortress';

/** What the design drives. The browser and the tests each supply their own. */
export interface ShowcaseIO {
  game: () => GameState;
  ground: (x: number, z: number) => number;
  /** The camp, and the direction the lot falls (radians, as the lot's `fall`). */
  camp: Pt;
  fall: number;
  /** Is this kit piece placeable at (x, z) turned `rot` (the placement rules); the nearest valid spot to (x, z) within `r`, or null. */
  findSpot: (kind: string, x: number, z: number, rot: number, r: number) => Pt | null;
  /** Stake it (the click). False when the game refused. */
  stake: (kind: string, x: number, z: number, rot: number) => boolean;
  stakeTerraces: (spots: Array<[number, number]>) => string | null;
  /** Fortify my ring with these options. */
  fortify: (opts: Partial<FortressOptions>) => { runs: number; structures: number };
  razor: (runId: string) => string | null;
  /** Draw a run of this kind through these points (the perimeter tool); the id of the run laid, or null (with a reason). */
  drawRun: (kind: string, pts: Pt[]) => string | { problem: string };
  /** Order the access road and let the contractor finish it. Null when done, else why not. */
  road: () => string | null;
  /** Funds and a full stockpile (a shortcut on time and money only). */
  fund: () => void;
  /** Buy a vehicle for the fleet (the Utilities tab's button). Null when bought, else why not. */
  buyVehicle: (kind: string) => string | null;
  /** Mark every plan and wall finished: the weeks of work. */
  finishAll: () => void;
}

export interface ShowcaseStep { step: string; ok: boolean; at?: Pt; note?: string }
export interface ShowcaseReport { steps: ShowcaseStep[]; frame: { phi: number; dFace: number; dEdge: number }; notes: string[] }

export const SHOWCASE_LOT = 'region=pnw&lot=hillside&lotcut&relief=9&acres=40&lotseed=8&elev=600';
export const SHOWCASE_URL = `/?clean&seed=7&${SHOWCASE_LOT}&showcase=mountain`;

/** The lot's frame: `du` runs downhill from the camp, `db` across the slope. */
export function frameOf(camp: Pt, fall: number, ground: (x: number, z: number) => number): { P: (du: number, db: number) => Pt; slopeAt: (x: number, z: number) => number } {
  const cf = Math.cos(fall), sf = Math.sin(fall);
  return { P: (du, db) => [camp[0] + du * cf - db * sf, camp[1] + du * sf + db * cf], slopeAt: (x, z) => (Math.abs(ground(x + 0.25, z) - ground(x - 0.25, z)) + Math.abs(ground(x, z + 0.25) - ground(x, z - 0.25))) / 0.5 };
}

export interface ShowcaseOptions { /** Rings in all, the outer one included (1 = the plain wall of the picture; 2 adds a keep ring round the lodge). */ rings?: number }

export function runMountainShowcase(io: ShowcaseIO, opts: ShowcaseOptions = {}): ShowcaseReport {
  const steps: ShowcaseStep[] = [], notes: string[] = [];
  const { P, slopeAt } = frameOf(io.camp, io.fall, io.ground);
  // the rock face: the steepest ground uphill of the camp; the shelf's lower lip: where, downhill of the face's foot, the ground starts to fall away
  let dFace = -4, steepest = 0;
  for (let d = 0; d > -40; d -= 0.25) { const [x, z] = P(d, 0), sl = slopeAt(x, z); if (sl > steepest) { steepest = sl; dFace = d; } }
  let dEdge = 8; for (let d = Math.max(2, dFace + 3); d < 40; d += 0.25) { const [x, z] = P(d, 0); if (slopeAt(x, z) > 0.3) { dEdge = d; break; } }
  if (steepest < 0.9) notes.push(`no rock face found uphill of the camp (steepest ground ${steepest.toFixed(2)}): the layout uses the defaults`);
  notes.push(`camp ${io.camp.map(v => v.toFixed(1)).join(', ')}, fall ${io.fall.toFixed(3)}; ground by du: ` + [-14, -10, -6, -2, 2, 6, 10, 14].map(d => { const [x, z] = P(d, 0); return `${d}: ${io.ground(x, z).toFixed(1)} (slope ${slopeAt(x, z).toFixed(2)})`; }).join(', '));
  io.fund();
  // the way in: the winding access road (priced by the road planner), done by the contractor
  const why = io.road();
  steps.push({ step: 'Access road (hookup)', ok: !why, note: why ?? undefined });

  // ── the buildings: the nearest valid spot to where the design wants each ──
  const S = (kind: string, du: number, db: number, o: { rots?: number[]; radius?: number; label?: string } = {}): { x: number; z: number; rot: number } | null => {
    const [x, z] = P(du, db), label = o.label ?? kind;
    let best: { sp: Pt; rot: number; d: number } | null = null;
    for (const rot of o.rots ?? [0]) { const sp = io.findSpot(kind, x, z, rot, o.radius ?? 16); if (sp) { const d = Math.hypot(sp[0] - x, sp[1] - z); if (!best || d < best.d) best = { sp, rot, d }; } }
    if (!best) { steps.push({ step: label, ok: false, at: [x, z], note: 'no valid spot within reach (slope, water, another building, the road or the camp)' }); return null; }
    if (!io.stake(kind, best.sp[0], best.sp[1], best.rot)) { steps.push({ step: label, ok: false, at: best.sp, note: 'the game refused the spot' }); return null; }
    steps.push({ step: label, ok: true, at: best.sp, note: best.d > 0.5 ? `${best.d.toFixed(1)} units from the wanted spot` : undefined });
    return { x: best.sp[0], z: best.sp[1], rot: best.rot };
  };
  // the compound is compact (the north-star picture is about 60 x 50 m): the shelf between the rock face and its lip, round the camp
  S('lodge', dEdge - 2.5, 3, { rots: [0, 1, 2, 3], radius: 8, label: 'Lodge (walkout basement)' });
  S('greenhouse_heated', dFace + 3, -6, { label: 'Glass greenhouse' });
  S('garden', dFace + 7, -7, { radius: 4, label: 'Vegetable bed 1' });
  S('garden', dFace + 10.5, -7, { radius: 4, label: 'Vegetable bed 2' });
  S('orchard', dFace + 3, 3, { label: 'Orchard' });
  S('solar_farm', dFace + 2, 8, { label: 'Solar farm' });
  S('battery_bank', dFace + 6.5, 9, { label: 'Battery container' });
  S('bunker_hatch', dEdge - 7, 0, { label: 'Bunker hatch' });

  // ── terraces (the Next-step card's own plan) ──
  const terr = terraceSite(io.game());
  if (terr) {
    const spots = terr.tiers.map(t => [t.x, t.z] as [number, number]);
    const err = io.stakeTerraces(spots);
    steps.push({ step: 'Terraced garden beds', ok: !err, at: spots[0], note: err ?? `${terr.tiers.length} beds on a ${terr.slopePct} % slope` });
  } else steps.push({ step: 'Terraced garden beds', ok: false, note: 'terraceSite found no 10-26 % fall near the home on the home block' });

  // ── the ring: wall, towers, gate garage, motor court, inner rings ──
  const fr = io.fortify({ scope: 'core', shape: 'irregular', wall: 'stone_wall', towers: 5, towerKind: 'watchtower_octagon', passage: false, rings: opts.rings ?? 1, ringWall: 'stone_wall', ringSally: true, motorCourt: true });
  steps.push({ step: `Fortify my ring (stone wall, octagon towers, motor court, ${opts.rings ?? 1} ring${(opts.rings ?? 1) > 1 ? 's' : ''})`, ok: fr.runs + fr.structures > 0, note: `${fr.runs} runs, ${fr.structures} structures` });
  io.finishAll();

  // ── razor wire on the outer wall, drainage channel along the cut ──
  const g2 = io.game();
  const outer = g2.perimeter.filter(r => r.kind === 'stone_wall').sort((a, b) => b.pts.length - a.pts.length)[0];
  if (outer) { const e = io.razor(outer.id); steps.push({ step: 'Razor wire on the outer wall', ok: !e, note: e ?? undefined }); }
  const wet = undrained(g2).sort((a, b) => (b.grade ?? 0) - (a.grade ?? 0))[0];
  const line = wet ? drainLineFor(g2, wet) : null;
  if (line) { const r = io.drawRun('drain_channel', line as Pt[]); steps.push({ step: 'Drainage channel above the cut', ok: typeof r === 'string', at: line[0], note: typeof r === 'string' ? undefined : r.problem }); }
  else steps.push({ step: 'Drainage channel', ok: false, note: wet ? 'no contour line for it' : 'no building on a cut slope to drain' });
  io.finishAll();

  // ── the fleet: the garage's four slots fill first, the rest stand in the court's bays ──
  const bought: string[] = [], refused: string[] = [];
  for (const k of ['suv', 'suv', 'old_pickup', 'motorhome', 'atv', 'tractor']) { const e = io.buyVehicle(k); if (!e) bought.push(k); else refused.push(`${k}: ${e}`); }
  steps.push({ step: 'Fleet for the court', ok: bought.length > 0, note: `bought ${bought.join(', ') || 'nothing'}${refused.length ? '; refused ' + refused.join('; ') : ''}` });
  return { steps, frame: { phi: io.fall, dFace, dEdge }, notes };
}

// ── integration checks: do the pieces fit together? (run on the finished scene, in the browser report and in the tests) ──

import { KIT, footprint } from '../game/buildkit/kit';
import { PERIMETER } from './perimeter';
import { ungatedCrossings } from './roadGate';
import { findRoute } from './pathRoute';
import { blocksWalk, planPad } from './retainPlan';
import { GARAGE_GATE_W } from './garage';
import { rotQ } from '../game/buildkit/kit';

type Rect = { x0: number; z0: number; x1: number; z1: number };

/** The solid stretches of a run (its gates cut out), as segments. */
export function solidSegments(run: { pts: Pt[]; gates: Array<{ at: number; w: number }> }): Array<[Pt, Pt]> {
  const out: Array<[Pt, Pt]> = [];
  let acc = 0;
  const gates = [...run.gates].sort((a, b) => a.at - b.at);
  for (let i = 1; i < run.pts.length; i++) {
    const a = run.pts[i - 1], b = run.pts[i], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < 1e-9) continue;
    // cut each gate's gap out of this segment
    let from = 0;
    for (const g of gates) {
      const g0 = g.at - g.w / 2 - acc, g1 = g.at + g.w / 2 - acc;
      if (g1 <= from || g0 >= len) continue;
      if (g0 > from) out.push([[a[0] + (b[0] - a[0]) * from / len, a[1] + (b[1] - a[1]) * from / len], [a[0] + (b[0] - a[0]) * g0 / len, a[1] + (b[1] - a[1]) * g0 / len]]);
      from = Math.max(from, g1);
    }
    if (from < len) out.push([[a[0] + (b[0] - a[0]) * from / len, a[1] + (b[1] - a[1]) * from / len], b]);
    acc += len;
  }
  return out;
}

/** Does the segment a-b pass through the rect (shrunk by `m` on every side)? */
export function segHitsRect(a: Pt, b: Pt, r: Rect, m = 0): boolean {
  const x0 = r.x0 + m, x1 = r.x1 - m, z0 = r.z0 + m, z1 = r.z1 - m;
  if (x1 <= x0 || z1 <= z0) return false;
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(2, Math.ceil(L / 0.1));
  for (let k = 0; k <= n; k++) { const x = a[0] + (b[0] - a[0]) * k / n, z = a[1] + (b[1] - a[1]) * k / n; if (x > x0 && x < x1 && z > z0 && z < z1) return true; }
  return false;
}

export const rectsOverlap = (a: Rect, b: Rect, m = 0): boolean => a.x0 < b.x1 - m && a.x1 > b.x0 + m && a.z0 < b.z1 - m && a.z1 > b.z0 + m;

/** Distance from a point to a polyline. */
export function distToPolyline(pts: readonly Pt[], x: number, z: number): number {
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz || 1e-9;
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / L2));
    best = Math.min(best, Math.hypot(a[0] + dx * t - x, a[1] + dz * t - z));
  }
  return best;
}

export interface Problem { what: string; detail: string }

/** Ground slope (rise over run) at a point. */
export const slopeOf = (ground: (x: number, z: number) => number, x: number, z: number): number => (Math.abs(ground(x + 0.25, z) - ground(x - 0.25, z)) + Math.abs(ground(x, z + 0.25) - ground(x, z - 0.25))) / 0.5;

/** The wall kinds that stop a person (not patrol decks, not the pipes and channels). */
const solid = (g: GameState) => g.perimeter.filter(r => PERIMETER[r.kind].blocks.people >= 0.5 && !PERIMETER[r.kind].walkway && !PERIMETER[r.kind].wallTop && r.kind !== 'creek_bars' && r.pts.length > 2);

/**
 * What does not fit: a wall through a building, buildings on each other, graded pads over each other at different levels, a wall set into the rock face,
 * a wall across the drive with no gate. Each problem names the two things that clash. `drive` is the access road (road end first).
 */
export function integrationProblems(g: GameState, drive: readonly Pt[], ground?: (x: number, z: number) => number): Problem[] {
  const out: Problem[] = [];
  const surface = g.structures.filter(st => !st.unplaced && KIT[st.kind] && KIT[st.kind].level !== 'underground');
  const fp = (st: { kind: string; x: number; z: number; rot: number }): Rect => footprint(KIT[st.kind], st.x, st.z, st.rot);
  // buildings on each other (a lodge's deck and the garden's apron may touch: only real overlap counts)
  for (let i = 0; i < surface.length; i++) for (let j = i + 1; j < surface.length; j++) {
    const a = surface[i], b = surface[j];
    if (rectsOverlap(fp(a), fp(b), 0.15)) out.push({ what: 'buildings overlap', detail: `${a.kind} ${a.id} and ${b.kind} ${b.id}` });
  }
  // graded pads over each other: two flat pads at different levels whose aprons overlap leave a crack or a cliff between buildings
  if (ground) {
    const pads = surface.filter(st => (st.grade ?? 0) > 0).map(st => ({ st, p: planPad(fp(st), ground, surface.filter(o => o !== st).map(fp)) })).filter(x => x.p.runs.length);
    for (let i = 0; i < pads.length; i++) for (let j = i + 1; j < pads.length; j++) {
      const a = pads[i], b = pads[j];
      if (rectsOverlap(a.p.rect, b.p.rect, 0.05) && Math.abs(a.p.y - b.p.y) > 0.04) out.push({ what: 'graded pads overlap at different levels', detail: `${a.st.kind} ${a.st.id} (${a.p.y.toFixed(2)}) and ${b.st.kind} ${b.st.id} (${b.p.y.toFixed(2)})` });
    }
  }
  const walls = solid(g);
  // walls through buildings (not the buildings laid with a wall: the gate garage in its gap, the court's own fence, the towers on it)
  for (const r of walls) {
    const segs = solidSegments(r);
    for (const st of surface) {
      if (st.kind === 'gate_garage' || st.kind === 'motor_court' || st.kind.startsWith('watchtower') || st.kind === 'rise_lookout') continue;
      for (const [a, b] of segs) if (segHitsRect(a, b, fp(st), 0.1)) { out.push({ what: 'wall runs through a building', detail: `${r.kind} ${r.id} through ${st.kind} ${st.id}` }); break; }
    }
    // the motor court stands outside the wall: nothing may cut across it
    for (const st of surface.filter(s => s.kind === 'motor_court')) for (const [a, b] of segs) if (segHitsRect(a, b, fp(st), 0.15)) { out.push({ what: 'wall runs through the motor court', detail: `${r.kind} ${r.id} through court ${st.id}` }); break; }
  }
  // a wall set into the rock face: samples along it on ground steeper than a person can climb
  if (ground) for (const r of walls) {
    let n = 0, at: Pt | null = null;
    for (const [a, b] of solidSegments(r)) { const L = Math.hypot(b[0] - a[0], b[1] - a[1]), k = Math.max(1, Math.ceil(L / 0.25)); for (let q = 0; q <= k; q++) { const x = a[0] + (b[0] - a[0]) * q / k, z = a[1] + (b[1] - a[1]) * q / k; if (slopeOf(ground, x, z) > 1.0) { n++; at = at ?? [x, z]; } } }
    if (n > 8) out.push({ what: 'wall stands on the rock face', detail: `${r.kind} ${r.id}: ${n} samples on ground steeper than 100 % near (${at![0].toFixed(1)}, ${at![1].toFixed(1)})` });
  }
  // a wall that crosses the drive with no gate
  for (const u of ungatedCrossings(g, drive)) out.push({ what: 'the drive crosses a wall with no gate', detail: JSON.stringify(u) });
  return out;
}

// ── can people get everywhere? ──

export interface Reach { post: string; at: Pt; ok: boolean; lenU?: number }

/**
 * Can a person walk from `from` to every post, round buildings, walls (their gates and the garage's drive-through are open), retaining walls (but at
 * their stairs), and ground too steep to climb? The same hard things the world's walkers refuse (game/paths/walkRoute.ts), headless. Each post is the
 * free point nearest the thing's footprint (a door sits in its own clearance).
 */
export function reachability(g: GameState, ground: (x: number, z: number) => number, from: Pt, extra: Array<{ post: string; at: Pt }> = []): Reach[] {
  const surface = g.structures.filter(st => !st.unplaced && KIT[st.kind] && KIT[st.kind].level !== 'underground' && st.kind !== 'bunker_hatch');
  const rects = surface.map(st => ({ st, r: footprint(KIT[st.kind], st.x, st.z, st.rot) }));
  const pads = surface.filter(st => (st.grade ?? 0) > 0).map(st => planPad(footprint(KIT[st.kind], st.x, st.z, st.rot), ground, rects.filter(o => o.st !== st).map(o => o.r)));
  const segs = solid(g).flatMap(r => solidSegments(r));
  const inGarageGate = (st: { x: number; z: number; rot: number; kind: string }, x: number, z: number): boolean => {
    if (st.kind !== 'gate_garage') return false;
    const [lx] = rotQ(x - st.x, z - st.z, (4 - st.rot) % 4);
    return Math.abs(lx) < GARAGE_GATE_W / 2 + 0.05;
  };
  const blocked = (x: number, z: number): boolean => {
    for (const { st, r } of rects) if (x > r.x0 - 0.1 && x < r.x1 + 0.1 && z > r.z0 - 0.1 && z < r.z1 + 0.1 && !inGarageGate(st, x, z)) return true;
    for (const [a, b] of segs) if (distToPolyline([a, b], x, z) < 0.12) return true;
    for (const p of pads) if (blocksWalk(p, x, z)) return true;
    return slopeOf(ground, x, z) > 1.0;
  };
  const freeNear = (p: Pt): Pt | null => {
    if (!blocked(p[0], p[1])) return p;
    for (let r = 0.25; r <= 4; r += 0.25) for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2, q: Pt = [p[0] + Math.cos(a) * r, p[1] + Math.sin(a) * r]; if (!blocked(q[0], q[1])) return q; }
    return null;
  };
  const posts = [...surface.map(st => ({ post: `${st.kind} ${st.id}`, at: [st.x, st.z] as Pt })), ...extra];
  const start = freeNear(from);
  return posts.map(({ post, at }) => {
    const to = freeNear(at);
    if (!start || !to) return { post, at, ok: false };
    const r = findRoute(start, to, { blocked, margin: 14, step: 0.5, meander: 0 });
    return r ? { post, at, ok: true, lenU: r.reduce((a, p, i) => i ? a + Math.hypot(p[0] - r[i - 1][0], p[1] - r[i - 1][1]) : 0, 0) } : { post, at, ok: false };
  });
}
