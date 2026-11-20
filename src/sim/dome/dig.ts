/**
 * The civil work under a dome (owner request 2026-11-18): a dome is not set on the grass, it goes into a hole. The crater is dug (benched sides, a haul
 * road, spoil), the utilities and the airlock sleeves are laid across the floor of the pit, the buried skirt is formed and poured round the perimeter at
 * the tier's depth, the pit is backfilled round it, and only then does the shell go up and get sealed. This module is the pure model of that sequence:
 *
 *   - how the five blueprint stages (site, foundation, frame, roof, finish) split the dome's hours, and what is happening in each (`digState`);
 *   - how deep the pit is at any moment (`pitDepthFt`: down to the skirt's depth, held through the pour, then back to nothing as it is backfilled);
 *   - the shape of the crater (`pitShape`, `pitProfile`: benches and risers), its volume in cubic yards, and the strata in its walls (`STRATA`);
 *   - the skirt ring and the sleeves and utility runs laid before it (`skirtParams`, `utilityRuns`).
 *
 * The renderers (game/buildkit/domeDig.ts for the pit and its crew, domeBuildings.ts for the buried skirt and utilities) read these numbers and draw them,
 * so what is drawn is what the Projects panel says. Hours and prices are unchanged: only how a dome's hours are split over its five stages moved
 * (`STAGE_SPLIT`, docs/DECISIONS.md). Lengths in world units (SCALE v2: 1 unit = 20 ft, a person 0.28) unless named `Ft`. Pure; tested in dig.test.ts.
 */
import { CELL_FT, TIER, shellFt, type DomeTier, FRAME_SPANS } from './tiers';
import { vestibuleOf } from './vestibule';

const TAU = Math.PI * 2;
/** (standing.ts has the same two; it cannot be imported here: it reaches the blueprints, and the blueprints read this module.) */
const FT_PER_UNIT = 2 * CELL_FT;
const airlockAngles = (n: number): number[] => Array.from({ length: n }, (_, i) => i * TAU / Math.max(1, n));
const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));
/** 0 before `a`, 1 after `b`, linear between. */
const ramp = (x: number, a: number, b: number): number => clamp01((x - a) / (b - a));

// ── the stages ──

/** The share of a dome's on-site hours each of its five stages takes (site, foundation, frame, roof, finish). The earthen dome is dug by hand, so its split is the old one. */
export const STAGE_SPLIT: Record<DomeTier, readonly [number, number, number, number, number]> = {
  earthen: [0.06, 0.22, 0.32, 0.28, 0.12],
  geodesic: [0.26, 0.42, 0.16, 0.10, 0.06],
  glass: [0.26, 0.42, 0.16, 0.10, 0.06],
  arcology: [0.26, 0.42, 0.16, 0.10, 0.06],
};

export type DigPhase = 'layout' | 'excavation' | 'utilities' | 'skirt' | 'backfill' | 'shell' | 'seal' | 'commission' | 'done';
/** The phases in build order (`done` last). */
export const DIG_PHASES: readonly DigPhase[] = ['layout', 'excavation', 'utilities', 'skirt', 'backfill', 'shell', 'seal', 'commission', 'done'];

/** Utilities are run only where there is a plant to feed (everything above the earthen dome). */
export const hasUtilities = (tier: DomeTier): boolean => tier !== 'earthen';

export interface DigState {
  phase: DigPhase;
  /** Pit floor depth below the pad now (ft) and the depth it is dug to (the tier's skirt depth). */
  depthFt: number; fullFt: number;
  /** Share of the full depth dug (0..1), and share of the pit filled back (0..1). */
  dug: number; filled: number;
  /** Utilities and sleeves laid (0..1), rebar cage and forms set round the ring (0..1), skirt concrete poured round the ring (0..1), the stem wall poured (0..1). */
  utilities: number; rebar: number; poured: number; stem: number;
  /** Is there an open hole in the ground (anything dug and not yet filled)? */
  open: boolean;
  /** What the crew has on site. */
  crew: { excavator: boolean; trucks: boolean; dozer: boolean; pump: boolean; compactor: boolean; layers: boolean; crane: boolean };
}

/** Where the work is, from the structure's stage (0 site .. 4 finish, 5+ done) and its progress `f` (0..1) through it. `supplied` false: the materials are not on site, the stage has not moved. */
export function digState(tier: DomeTier, stage: number, f: number, supplied = true): DigState {
  const full = TIER[tier].skirtFt, k = clamp01(supplied ? f : 0), u = hasUtilities(tier);
  const s = { dug: 0, filled: 0, utilities: 0, rebar: 0, poured: 0, stem: 0 };
  let phase: DigPhase;
  const early = tier === 'earthen';
  if (stage <= 0) {
    const lay = early ? 0.15 : 0.1;
    s.dug = ramp(k, lay, 1);
    phase = k < lay ? 'layout' : 'excavation';
  } else if (stage === 1) {
    s.dug = 1;
    if (early) { s.rebar = ramp(k, 0, 0.25); s.poured = ramp(k, 0.12, 0.7); s.stem = ramp(k, 0.7, 1); }
    else { s.utilities = ramp(k, 0, 0.4); s.rebar = ramp(k, 0.4, 0.62); s.poured = ramp(k, 0.5, 0.92); s.stem = ramp(k, 0.92, 1); }
    phase = !early && k < 0.4 ? 'utilities' : 'skirt';
  } else if (stage === 2) {
    s.dug = 1; s.utilities = u ? 1 : 0; s.rebar = 1; s.poured = 1; s.stem = 1;
    const bf = early ? 0.4 : 0.6;
    s.filled = ramp(k, 0, bf);
    phase = k < bf ? 'backfill' : 'shell';
  } else if (stage >= 5) {
    return { phase: 'done', depthFt: 0, fullFt: full, dug: 1, filled: 1, utilities: u ? 1 : 0, rebar: 1, poured: 1, stem: 1, open: false, crew: NO_CREW };
  } else {
    s.dug = 1; s.filled = 1; s.utilities = u ? 1 : 0; s.rebar = 1; s.poured = 1; s.stem = 1;
    phase = stage === 3 ? (k < 0.6 ? 'shell' : 'seal') : (k < 0.25 ? 'seal' : 'commission');
  }
  const depthFt = full * s.dug * (1 - s.filled);
  const open = depthFt > 0.01;
  const supplyOn = supplied && k < 1;
  return {
    phase, depthFt, fullFt: full, ...s, open,
    crew: {
      excavator: open && phase === 'excavation' && supplyOn,
      trucks: open && (phase === 'excavation' || phase === 'backfill') && supplyOn,
      dozer: open && (phase === 'excavation' || phase === 'backfill') && supplyOn,
      pump: phase === 'skirt' && s.poured > 0 && s.poured < 1 && supplyOn,
      compactor: phase === 'backfill' && supplyOn,
      layers: phase === 'utilities' && supplyOn,
      crane: stage >= 2 && stage <= 3 && supplyOn,
    },
  };
}
const NO_CREW: DigState['crew'] = { excavator: false, trucks: false, dozer: false, pump: false, compactor: false, layers: false, crane: false };

/** Pit floor depth (ft) at a stage and progress. Dug down to the skirt's depth through the site stage, held while the utilities and skirt go in, back to nothing in the frame stage. */
export const pitDepthFt = (tier: DomeTier, stage: number, f: number, supplied = true): number => digState(tier, stage, f, supplied).depthFt;

/** What the stage list says in the Projects panel and the progress readout for this moment. */
export function digLabel(_tier: DomeTier, st: DigState, volumeCy?: { done: number; total: number }): string {
  const pct = (x: number): string => `${Math.round(x * 100)}%`;
  switch (st.phase) {
    case 'layout': return 'Staking the circle and surveying it';
    case 'excavation': return `Excavating the crater: ${Math.round(st.depthFt)} of ${st.fullFt} ft down${volumeCy ? ` (${Math.round(volumeCy.done).toLocaleString('en-US')} of ${Math.round(volumeCy.total).toLocaleString('en-US')} cu yd)` : ''}`;
    case 'utilities': return 'Laying the utilities and airlock sleeves across the pit floor';
    case 'skirt': return st.poured <= 0 ? 'Setting the rebar cage and forms for the buried skirt' : `Pouring the buried skirt: ${pct(st.poured)} round the ring`;
    case 'backfill': return `Backfilling round the skirt: ${pct(st.filled)}`;
    case 'shell': return 'Raising the shell';
    case 'seal': return 'Sealing the panels and joints';
    case 'commission': return 'Fitting the airlocks and commissioning the plant and interior';
    default: return 'Finished';
  }
}

// ── the pit ──

/** Strata in the pit walls, from the surface down (ft below grade). Same bounds as the skirt cutaway page (ui/DomeSkirtCutaway.tsx). */
export interface Stratum { id: 'topsoil' | 'clay' | 'gravel' | 'rock' | 'bedrock'; name: string; fromFt: number; toFt: number; color: number }
export const STRATA: readonly Stratum[] = [
  { id: 'topsoil', name: 'topsoil', fromFt: 0, toFt: 3, color: 0x5b3d27 },
  { id: 'clay', name: 'clay subsoil', fromFt: 3, toFt: 16, color: 0xa87a4f },
  { id: 'gravel', name: 'sand and gravel', fromFt: 16, toFt: 44, color: 0xc9b184 },
  { id: 'rock', name: 'weathered rock', fromFt: 44, toFt: 76, color: 0x8d8f93 },
  { id: 'bedrock', name: 'bedrock', fromFt: 76, toFt: 1000, color: 0x6d7076 },
];
export const strataAt = (depthFt: number): Stratum => STRATA.find(s => depthFt < s.toFt) ?? STRATA[STRATA.length - 1];
/** Depths (ft) strictly between a and b where one stratum gives way to the next, ascending. */
export const strataBreaks = (aFt: number, bFt: number): number[] => STRATA.slice(0, -1).map(s => s.toFt).filter(d => d > Math.min(aFt, bFt) + 1e-6 && d < Math.max(aFt, bFt) - 1e-6).sort((x, y) => x - y);

/** The radius of the shell of a dome of this tier and footprint (world units): what the renderers build the shell at. */
export const shellRadius = (tier: DomeTier, cells: number): number => shellFt(tier, cells) / 2 / FT_PER_UNIT - 0.03;

export interface PitShape {
  tier: DomeTier;
  /** Shell radius, skirt outside radius, radius of the level work floor, radius of the crater's rim (units). */
  R: number; rSkirt: number; rWork: number; rTop: number;
  /** Full depth (units), benches (flat steps), each bench's height and bench width, and the riser's horizontal run for one bench's rise. */
  depthU: number; benches: number; hb: number; bw: number; run: number;
  /** Width of the haul road (units). */
  roadW: number;
}

/** Benches: the pit's sides step down 10 ft at a time (a real dig of this depth is benched or sloped), at a 2:1 riser. */
export const BENCH_FT = 10;
export function pitShape(tier: DomeTier, cells: number): PitShape {
  const t = TIER[tier], R = shellRadius(tier, cells), depthU = t.skirtFt / FT_PER_UNIT;
  const rSkirt = R + 0.04 + 0.06;
  const work = Math.min(0.6, Math.max(0.2, 0.2 * depthU));
  const rWork = rSkirt + work;
  const benches = Math.max(1, Math.ceil(t.skirtFt / BENCH_FT)), hb = depthU / benches;
  const bw = Math.max(0.15, Math.min(0.5, depthU * 0.14 + 0.12)), run = hb * 0.5;
  const rTop = rWork + benches * run + (benches - 1) * bw;
  return { tier, R, rSkirt, rWork, rTop, depthU, benches, hb, bw, run, roadW: Math.max(0.3, Math.min(0.9, depthU * 0.3 + 0.2)) };
}

/**
 * The crater's profile at floor depth `depthU` (units), from the rim inward: (radius, depth) points, the rim first at depth 0, ending on the floor. The rim is
 * fixed at the final size and the floor shrinks in as the pit deepens (the top benches are dug first), so a shallow pit is the top of the final crater.
 */
export function pitProfile(s: PitShape, depthU: number): Array<[number, number]> {
  const d = Math.max(0, Math.min(s.depthU, depthU));
  if (d <= 1e-9) return [[s.rTop, 0]];
  const pts: Array<[number, number]> = [[s.rTop, 0]];
  let r = s.rTop;
  for (let k = 0; k < s.benches; k++) {
    const lo = k * s.hb, hi = (k + 1) * s.hb;
    if (d <= hi + 1e-9) { const part = (d - lo) / s.hb; pts.push([r - s.run * part, d]); return pts; }
    r -= s.run; pts.push([r, hi]);
    if (k < s.benches - 1) { r -= s.bw; pts.push([r, hi]); }
  }
  return pts;
}

/** Cubic yards of earth in the crater dug to `depthU` (a solid of revolution of the profile). */
export function pitVolumeCy(s: PitShape, depthU: number): number {
  const d = Math.max(0, Math.min(s.depthU, depthU));
  if (d <= 0) return 0;
  const pts = pitProfile(s, d);
  // area of the horizontal section at depth y: pi r(y)^2, r by the profile's risers (benches are flat, contributing nothing to the volume)
  let v = 0;
  for (let i = 1; i < pts.length; i++) {
    const [r0, d0] = pts[i - 1], [r1, d1] = pts[i];
    const h = d1 - d0;
    if (h <= 1e-9) continue;
    v += Math.PI * h * (r0 * r0 + r0 * r1 + r1 * r1) / 3;   // frustum
  }
  return v * FT_PER_UNIT ** 3 / 27;
}

/** The total and the share dug so far, in cubic yards (the Projects panel's line). */
export function digVolumes(tier: DomeTier, cells: number, depthFt: number): { done: number; total: number } {
  const s = pitShape(tier, cells);
  return { done: pitVolumeCy(s, depthFt / FT_PER_UNIT), total: pitVolumeCy(s, s.depthU) };
}

// ── the skirt and what runs through it ──

export interface SkirtParams {
  /** Inner and outer radius of the wall (units), depth below the pad (units; the wall runs from the stem wall's foot down to here), thickness. */
  rIn: number; rOut: number; depthU: number; thickU: number;
  /** The footing's flare at the bottom: how far it stands out (inward and outward) and how tall it is (units). */
  toeU: number; toeH: number;
  /** Radial segments round the ring. */
  segments: number;
}
export function skirtParams(tier: DomeTier, cells: number): SkirtParams {
  const t = TIER[tier], R = shellRadius(tier, cells), thick = Math.max(t.skirtThickFt / FT_PER_UNIT, 0.05);
  const rOut = R + 0.04, rIn = rOut - thick, depthU = t.skirtFt / FT_PER_UNIT;
  return { rIn, rOut, depthU, thickU: thick, toeU: thick * 0.9, toeH: Math.min(0.12, depthU * 0.12 + 0.03), segments: Math.max(36, Math.min(120, Math.round(R * 12))) };
}

export type UtilKind = 'power' | 'water' | 'sewer' | 'data' | 'sleeve';
/** A pipe, conduit bank or sleeve lying radially across the pit floor (angles from +z toward +x), at `y` above the floor. */
export interface UtilRun {
  kind: UtilKind;
  /** Angle (radians), start and end radius (units), height of its axis above the floor, pipe radius, and how many pipes lie side by side (and their spacing). */
  a: number; r0: number; r1: number; y: number; pipe: number; n: number; gap: number;
  /** Sideways offset from the radial line (units), so runs lie side by side. */
  off: number;
}

/** The runs laid on the pit floor before the skirt: to the plant between the first two airlocks (power, water, sewer, data) and a sleeve through the skirt at every airlock. */
export function utilityRuns(tier: DomeTier, cells: number): UtilRun[] {
  if (!hasUtilities(tier)) return [];
  const s = pitShape(tier, cells), v = vestibuleOf(tier, s.R), angles = airlockAngles(FRAME_SPANS[tier]);
  const phi = angles.length > 1 ? (angles[0] + angles[1]) / 2 : Math.PI;
  const scale = Math.max(0.6, Math.min(1.5, s.R / 6));
  const inner = s.R * 0.38, outer = s.rWork + 0.5 * s.run + 0.2;
  const p = 0.028 * scale;
  const runs: UtilRun[] = [
    { kind: 'power', a: phi, r0: inner, r1: outer, y: p * 1.6, pipe: p, n: 4, gap: p * 2.3, off: -0.16 * scale },
    { kind: 'water', a: phi, r0: inner, r1: outer, y: p * 1.3, pipe: p * 1.3, n: 1, gap: 0, off: 0.02 * scale },
    { kind: 'sewer', a: phi, r0: inner, r1: outer, y: p * 2.2, pipe: p * 2.2, n: 1, gap: 0, off: 0.18 * scale },
    { kind: 'data', a: phi, r0: inner, r1: outer, y: p * 1.2, pipe: p * 0.8, n: 2, gap: p * 2, off: 0.34 * scale },
  ];
  // each airlock's sleeve: a big steel sleeve through the skirt line, wide enough for the chamber's tunnel crossing (sim/dome/crossing.ts)
  const sleeve = Math.max(0.05, v.dw * 0.28);
  for (const a of angles) runs.push({ kind: 'sleeve', a, r0: s.R - 0.7 * scale, r1: s.rSkirt + 0.45, y: sleeve + 0.03, pipe: sleeve, n: 1, gap: 0, off: 0 });
  return runs;
}

/** World-unit angle helper for renderers: a point `r` out at angle `a` (from +z toward +x). */
export const polarXZ = (r: number, a: number): [number, number] => [r * Math.sin(a), r * Math.cos(a)];
export { TAU, CELL_FT };
