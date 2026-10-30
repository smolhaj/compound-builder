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
import { orchardSiteNote } from './orchard';
import { boreTo } from './terrainState';
import { boreProblem } from './terrain';
import { boreText } from './terrainFx';
import { courtSpot } from './motorCourt';
import { polygonArea } from './ringShape';
import { insideRing } from './compounds';
import { KIT, footprint } from '../game/buildkit/kit';
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
  /** Fortify my ring with these options (round `center` when given, the ring is centred on the camp otherwise). */
  fortify: (opts: Partial<FortressOptions>, center?: Pt) => { runs: number; structures: number };
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

export interface ShowcaseOptions {
  /** Where the compound goes: on the shelf at the foot of the rock face (`shelf`, the default), or on the bench above the face with a rock tunnel up to it from the motor court on the shelf (`bench`: the north-star picture). */
  layout?: 'shelf' | 'bench';
  /** Rings in all, the outer one included (1 = the plain wall of the picture; 2 adds a keep ring round the lodge). */
  rings?: number;
  /** The wall: the stone-and-timber one (default) or poured concrete with hexagonal towers (the black wall of the north-star picture). */
  wall?: 'stone' | 'concrete';
}


/** Stake `kind` at the nearest valid spot to `want` whose whole footprint is inside the ring `poly` (with `pad` to spare), searching the ring's bounding box on a two-unit grid, nearest the wanted point first. */
function stakeInside(io: ShowcaseIO, steps: ShowcaseStep[], label: string, kind: string, poly: readonly Pt[], want: Pt, rots: number[] = [0], gap = 1.0): boolean {
  const def = KIT[kind];
  const xs = poly.map(p => p[0]), zs = poly.map(p => p[1]);
  const cand: Pt[] = [];
  for (let x = Math.min(...xs); x <= Math.max(...xs); x += 1.5) for (let z = Math.min(...zs); z <= Math.max(...zs); z += 1.5) cand.push([x, z]);
  cand.sort((a, b) => Math.hypot(a[0] - want[0], a[1] - want[1]) - Math.hypot(b[0] - want[0], b[1] - want[1]));
  for (const [x, z] of cand) for (const rot of rots) {
    const sp = io.findSpot(kind, x, z, rot, 0.6);
    if (!sp) continue;
    const r = footprint(def, sp[0], sp[1], rot);
    if (![[r.x0, r.z0], [r.x1, r.z0], [r.x1, r.z1], [r.x0, r.z1]].every(([cx, cz]) => insideRing(poly, cx, cz))) continue;
    // room for each building's graded pad (a flat apron and skirt, up to 1.2 u) beside its neighbours': closer than that the two pads overlap at different levels
    if (io.game().structures.some(o => !o.unplaced && KIT[o.kind] && KIT[o.kind].level !== 'underground' && !o.kind.startsWith('bunker_') && (() => { const q = footprint(KIT[o.kind], o.x, o.z, o.rot); return r.x0 < q.x1 + gap && r.x1 > q.x0 - gap && r.z0 < q.z1 + gap && r.z1 > q.z0 - gap; })())) continue;
    // not across a wall that is already standing (the keep ring, the drainage channel is no wall)
    if (io.game().perimeter.some(w => PERIMETER[w.kind].blocks.people >= 0.5 && !PERIMETER[w.kind].walkway && !PERIMETER[w.kind].wallTop && solidSegments(w).some(([a, b]) => segHitsRect(a, b, r, 0)))) continue;
    if (!io.stake(kind, sp[0], sp[1], rot)) continue;
    steps.push({ step: label, ok: true, at: sp, note: Math.hypot(sp[0] - want[0], sp[1] - want[1]) > 0.5 ? `${Math.hypot(sp[0] - want[0], sp[1] - want[1]).toFixed(1)} units from the wanted spot` : undefined });
    return true;
  }
  steps.push({ step: label, ok: false, at: want, note: 'no valid spot inside the wall' });
  return false;
}
const outerRingOf = (g: GameState): Pt[] | null => {
  const rs = g.perimeter.filter(r => r.kind === 'stone_wall' || r.kind === 'concrete_wall').sort((a, b) => polygonArea(b.pts) - polygonArea(a.pts));
  return rs[0] ? rs[0].pts : null;
};

export function runMountainShowcase(io: ShowcaseIO, opts: ShowcaseOptions = {}): ShowcaseReport {
  if (opts.layout === 'bench') return runBenchShowcase(io, opts);
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
  S('bunker_hatch', dEdge - 7, 0, { label: 'Bunker hatch' });

  // ── terraces (the Next-step card's own plan) ──
  const terr = terraceSite(io.game());
  if (terr) {
    const spots = terr.tiers.map(t => [t.x, t.z] as [number, number]);
    const err = io.stakeTerraces(spots);
    steps.push({ step: 'Terraced garden beds', ok: !err, at: spots[0], note: err ?? `${terr.tiers.length} beds on a ${terr.slopePct} % slope` });
  } else steps.push({ step: 'Terraced garden beds', ok: false, note: 'terraceSite found no 10-26 % fall near the home on the home block' });

  // ── the ring: wall, towers, gate garage, motor court, inner rings ──
  const concrete = opts.wall === 'concrete';
  const fr = io.fortify({ scope: 'core', shape: 'irregular', wall: concrete ? 'concrete_wall' : 'stone_wall', towers: 5, towerKind: concrete ? 'watchtower_hex' : 'watchtower_octagon', passage: false, rings: opts.rings ?? 1, ringWall: 'stone_wall', ringSally: true, motorCourt: true });
  steps.push({ step: `Fortify my ring (${concrete ? 'concrete wall, hexagon towers' : 'stone wall, octagon towers'}, motor court, ${opts.rings ?? 1} ring${(opts.rings ?? 1) > 1 ? 's' : ''})`, ok: fr.runs + fr.structures > 0, note: `${fr.runs} runs, ${fr.structures} structures` });
  io.finishAll();

  // ── the rest of the compound goes inside the wall that is now standing round the lodge and greenhouse ──
  const ring0 = outerRingOf(io.game());
  if (ring0) {
    stakeInside(io, steps, 'Vegetable bed 1', 'garden', ring0, P(dFace + 7, -7));
    stakeInside(io, steps, 'Vegetable bed 2', 'garden', ring0, P(dFace + 10.5, -7));
    if (stakeInside(io, steps, 'Orchard', 'orchard', ring0, P(dFace + 3, 3))) { const o = io.game().structures.filter(st => st.kind === 'orchard').at(-1)!; const n = orchardSiteNote(io.game(), o.x, o.z); if (n) notes.push(`Orchard: ${n}`); }
    stakeInside(io, steps, 'Solar farm', 'solar_farm', ring0, P(dFace + 7.5, 5));
    stakeInside(io, steps, 'Battery container', 'battery_bank', ring0, P(dFace + 7.5, 1.5));
    io.finishAll();
  }

  // ── razor wire on the outer wall, drainage channel along the cut ──
  const g2 = io.game();
  const outer = g2.perimeter.filter(r => r.kind === (concrete ? 'concrete_wall' : 'stone_wall')).sort((a, b) => b.pts.length - a.pts.length)[0];
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

/**
 * The north-star layout: the compound on the bench above the rock face (the terraces, the lodge on its walkout, the solar bench), the motor court and
 * the camp on the shelf below it at the foot of the face, and a rock tunnel bored up through the hill from the court's portal to the compound's gate.
 * The tunnel is the only way a truck gets up: a person cannot cross the face.
 */
function runBenchShowcase(io: ShowcaseIO, opts: ShowcaseOptions): ShowcaseReport {
  const steps: ShowcaseStep[] = [], notes: string[] = [];
  const { P, slopeAt } = frameOf(io.camp, io.fall, io.ground);
  let dFace = -4, steepest = 0;
  for (let d = 0; d > -40; d -= 0.25) { const [x, z] = P(d, 0), sl = slopeAt(x, z); if (sl > steepest) { steepest = sl; dFace = d; } }
  if (steepest < 0.9) notes.push(`no rock face found uphill of the camp (steepest ground ${steepest.toFixed(2)})`);
  io.fund();
  const why = io.road();
  steps.push({ step: 'Access road (hookup)', ok: !why, note: why ?? undefined });

  // the line the land allows from the shelf at the foot of the face up into the hill (the Next-step card's own search): its high end says where the compound goes
  const bore = boreTo(io.game(), io.camp, 45);
  if (!bore) { steps.push({ step: 'Rock tunnel', ok: false, note: 'no bore the land allows from the shelf up the face' }); return { steps, frame: { phi: io.fall, dFace, dEdge: dFace }, notes }; }
  const lowFirst = bore.stats.ya <= bore.stats.yb, low = lowFirst ? bore.a : bore.b, high = lowFirst ? bore.b : bore.a;
  // the compound: a core square (24 units) that fits on the home block, with the tunnel's high portal in its corner towards the way up
  const home = io.game().site.home;
  const C: Pt = [Math.min(home.x1 - 12, Math.max(home.x0 + 12, high[0] + 6)), Math.min(home.z1 - 12, Math.max(home.z0 + 12, high[1] - 6))];
  notes.push(`rock tunnel: ${boreText(bore.stats)}, from (${low.map(v => v.toFixed(1)).join(', ')}) up to (${high.map(v => v.toFixed(1)).join(', ')}); the compound is centred on (${C.map(v => v.toFixed(1)).join(', ')})`);

  const S = (kind: string, du: number, db: number, o: { rots?: number[]; radius?: number; label?: string } = {}): { x: number; z: number; rot: number } | null => {
    // du: along the fall from the compound's centre (negative: up the mountain), db: across
    const cf = Math.cos(io.fall), sf = Math.sin(io.fall), x = C[0] + du * cf - db * sf, z = C[1] + du * sf + db * cf, label = o.label ?? kind;
    let best: { sp: Pt; rot: number; d: number } | null = null;
    for (const rot of o.rots ?? [0]) { const sp = io.findSpot(kind, x, z, rot, o.radius ?? 12); if (sp) { const d = Math.hypot(sp[0] - x, sp[1] - z); if (!best || d < best.d) best = { sp, rot, d }; } }
    if (!best) { steps.push({ step: label, ok: false, at: [x, z], note: 'no valid spot within reach (slope, water, another building, the road or the camp)' }); return null; }
    if (!io.stake(kind, best.sp[0], best.sp[1], best.rot)) { steps.push({ step: label, ok: false, at: best.sp, note: 'the game refused the spot' }); return null; }
    steps.push({ step: label, ok: true, at: best.sp, note: best.d > 0.5 ? `${best.d.toFixed(1)} units from the wanted spot` : undefined });
    return { x: best.sp[0], z: best.sp[1], rot: best.rot };
  };
  S('lodge', -3, 0, { rots: [0, 1, 2, 3], radius: 8, label: 'Lodge (walkout basement)' });
  S('greenhouse_heated', 3, -7, { label: 'Glass greenhouse' });
  S('bunker_hatch', 0, -3, { label: 'Bunker hatch' });
  const terr = terraceSite(io.game());
  if (terr) {
    const spots = terr.tiers.map(t => [t.x, t.z] as [number, number]);
    const err = io.stakeTerraces(spots);
    steps.push({ step: 'Terraced garden beds', ok: !err, at: spots[0], note: err ?? `${terr.tiers.length} beds on a ${terr.slopePct} % slope` });
  } else steps.push({ step: 'Terraced garden beds', ok: false, note: 'terraceSite found no 10-26 % fall near the home' });

  // the ring round the compound (not the camp): wall, towers, keep ring
  const concrete = opts.wall === 'concrete';
  const fr = io.fortify({ scope: 'core', shape: 'irregular', wall: concrete ? 'concrete_wall' : 'stone_wall', towers: 5, towerKind: concrete ? 'watchtower_hex' : 'watchtower_octagon', passage: false, rings: opts.rings ?? 1, ringWall: 'stone_wall', ringSally: true, motorCourt: false, gate: false }, C);
  steps.push({ step: `Fortify my ring (${concrete ? 'concrete wall, hexagon towers' : 'stone wall, octagon towers'}, round the bench)`, ok: fr.runs + fr.structures > 0, note: `${fr.runs} runs, ${fr.structures} structures` });
  io.finishAll();
  const ring1 = outerRingOf(io.game());
  if (ring1) {
    const cf = Math.cos(io.fall), sf = Math.sin(io.fall), at = (du: number, db: number): Pt => [C[0] + du * cf - db * sf, C[1] + du * sf + db * cf];
    // terraced beds: each on its own graded pad held by a dry-stack wall, stepped down the bench's slope
    stakeInside(io, steps, 'Vegetable bed 1 (terrace)', 'garden', ring1, at(2.5, -3), [0], 1.8);
    stakeInside(io, steps, 'Vegetable bed 2 (terrace)', 'garden', ring1, at(6, -3), [0], 1.8);
    stakeInside(io, steps, 'Orchard', 'orchard', ring1, at(4, 5), [0, 1], 1.2);
    stakeInside(io, steps, 'Solar farm', 'solar_farm', ring1, at(-3, 5), [0], 1.8);
    stakeInside(io, steps, 'Battery container', 'battery_bank', ring1, at(-3, 9), [0], 1.8);
    io.finishAll();
  }

  // the tunnel: from the low portal on the shelf up to the compound's wall, where the high portal opens a doorway in it (the tunnel is the compound's gate, the ring has none)
  const outerRun = io.game().perimeter.filter(r => r.kind === 'stone_wall' || r.kind === 'concrete_wall').sort((x, y) => y.pts.length - x.pts.length)[0];
  const wallPts: Pt[] = [];
  if (outerRun) for (let i = 1; i < outerRun.pts.length; i++) { const p0 = outerRun.pts[i - 1], p1 = outerRun.pts[i], n = Math.max(1, Math.ceil(Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) * 2)); for (let k = 0; k < n; k++) wallPts.push([p0[0] + (p1[0] - p0[0]) * k / n, p0[1] + (p1[1] - p0[1]) * k / n]); }
  const end: Pt = [...wallPts].sort((p, q) => Math.hypot(p[0] - high[0], p[1] - high[1]) - Math.hypot(q[0] - high[0], q[1] - high[1])).find(p => Math.hypot(p[0] - high[0], p[1] - high[1]) < 3 && boreProblem({ h: io.ground }, low, p) === null) ?? high;
  const r = io.drawRun('rock_tunnel', [low, end]);
  steps.push({ step: 'Rock tunnel (court portal to the compound wall)', ok: typeof r === 'string', at: low, note: typeof r === 'string' ? `${boreText(bore.stats)}${end === high ? '; the high portal is not on the wall' : ''}` : r.problem });
  // the court outside the low portal, its back to the rock (the same placement the gate garage's court has: courtSpot)
  const L = Math.hypot(end[0] - low[0], end[1] - low[1]), inx = (end[0] - low[0]) / L, inz = (end[1] - low[1]) / L;
  const spot = courtSpot({ x: low[0], z: low[1], inx, inz });
  let placed = false;
  for (const dr of [0, 0.4, -0.4, 0.8, -0.8]) {
    const sp = io.findSpot('motor_court', spot.x - dr * inz, spot.z + dr * inx, spot.rot, 3);
    if (sp && io.stake('motor_court', sp[0], sp[1], spot.rot)) { steps.push({ step: 'Motor court at the portal', ok: true, at: sp, note: dr ? `${Math.abs(dr).toFixed(1)} units sideways` : undefined }); placed = true; break; }
  }
  if (!placed) steps.push({ step: 'Motor court at the portal', ok: false, at: [spot.x, spot.z], note: 'no valid spot outside the portal' });
  io.finishAll();
  const g2 = io.game();
  const wet = undrained(g2).sort((x, y) => (y.grade ?? 0) - (x.grade ?? 0))[0];
  const line = wet ? drainLineFor(g2, wet) : null;
  if (line) { const d = io.drawRun('drain_channel', line as Pt[]); steps.push({ step: 'Drainage channel above the cut', ok: typeof d === 'string', at: line[0], note: typeof d === 'string' ? undefined : d.problem }); }
  io.finishAll();
  const bought: string[] = [], refused: string[] = [];
  for (const k of ['suv', 'suv', 'old_pickup', 'motorhome', 'atv', 'tractor']) { const e = io.buyVehicle(k); if (!e) bought.push(k); else refused.push(`${k}: ${e}`); }
  steps.push({ step: 'Fleet for the court', ok: bought.length > 0, note: `bought ${bought.join(', ') || 'nothing'}${refused.length ? '; refused ' + refused.join('; ') : ''}` });
  return { steps, frame: { phi: io.fall, dFace, dEdge: dFace }, notes };
}

// ── integration checks: do the pieces fit together? (run on the finished scene, in the browser report and in the tests) ──

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
  // a wall set into the rock face: samples along it on cliff ground (a riser between benches is steeper than a person climbs, but a wall stands on it)
  if (ground) for (const r of walls) {
    let n = 0, at: Pt | null = null;
    for (const [a, b] of solidSegments(r)) { const L = Math.hypot(b[0] - a[0], b[1] - a[1]), k = Math.max(1, Math.ceil(L / 0.25)); for (let q = 0; q <= k; q++) { const x = a[0] + (b[0] - a[0]) * q / k, z = a[1] + (b[1] - a[1]) * q / k; if (slopeOf(ground, x, z) > 2.0) { n++; at = at ?? [x, z]; } } }
    if (n > 8) out.push({ what: 'wall stands on the rock face', detail: `${r.kind} ${r.id}: ${n} samples on ground steeper than 200 % (a cliff, not a riser) near (${at![0].toFixed(1)}, ${at![1].toFixed(1)})` });
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
export function reachability(g: GameState, ground: (x: number, z: number) => number, from: Pt, extra: Array<{ post: string; at: Pt }> = [], connectors: ReadonlyArray<readonly [Pt, Pt]> = []): Reach[] {
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
  const len = (r: Pt[]) => r.reduce((a, p, i) => i ? a + Math.hypot(p[0] - r[i - 1][0], p[1] - r[i - 1][1]) : 0, 0);
  const walk = (p: Pt, q: Pt): Pt[] | null => findRoute(p, q, { blocked, margin: 14, step: 0.5, meander: 0 });
  // a finished rock tunnel (or any walkway) is a way through: in at one end, out at the other (the sim joins the yards at its ends)
  const doors = connectors.map(([a, b]) => [freeNear(a), freeNear(b)] as const);
  return posts.map(({ post, at }) => {
    const to = freeNear(at);
    if (!start || !to) return { post, at, ok: false };
    const direct = walk(start, to);
    if (direct) return { post, at, ok: true, lenU: len(direct) };
    let best: number | null = null;
    for (const [p, q] of doors) for (const [u, v] of [[p, q], [q, p]] as const) {
      if (!u || !v) continue;
      const r1 = walk(start, u), r2 = r1 ? walk(v, to) : null;
      if (r1 && r2) { const l = len(r1) + Math.hypot(v[0] - u[0], v[1] - u[1]) + len(r2); if (best === null || l < best) best = l; }
    }
    return best === null ? { post, at, ok: false } : { post, at, ok: true, lenU: best };
  });
}
