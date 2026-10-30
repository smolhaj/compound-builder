/**
 * Blueprint view of the compound (docs/DECISIONS.md, "Blueprint view"): what stands where and what it is for, as a flat list of
 * labelled marks and outlines plus the readouts a defender wants (defense score, wall, how far the watch sees, the lanes in).
 * Pure: it reads the game and builds data; game/blueprint/BlueprintOverlay.ts draws it. Nothing here is saved.
 */
import { KIT, footprint } from '../buildkit/kit';
import { PERIMETER, runFinished, wallLength, type Pt } from '../../sim/perimeter';
import { TOWERS, isTower } from '../../sim/towers';
import { yardRings } from '../../sim/compounds';
import { isFinished } from '../../sim/construction';
import { defenseReport } from '../../sim/defenseReport';
import { lanesOf } from '../../sim/terrainState';
import { terrainDefense } from '../../sim/terrainFx';
import { fogNow } from '../../sim/fogFx';
import { sensorSightM, fogReadout } from '../../sim/fog';
import { SALLY } from '../../sim/rings';
import type { GameState } from '../../sim/state';

export type MarkCat = 'home' | 'work' | 'food' | 'water' | 'power' | 'bunker' | 'tower' | 'gate' | 'ring' | 'tunnel' | 'bridge' | 'wall';

export interface BpMark {
  id: string;
  cat: MarkCat;
  x: number;
  z: number;
  /** The name (short), and one line under it (role / state). */
  label: string;
  sub?: string;
  /** Higher wins when labels crowd. */
  prio: number;
  /** Lift above the ground, world units, so a label floats clear of the roof. */
  lift: number;
}

export interface BpOutline {
  id: string;
  cat: MarkCat;
  pts: Pt[];
  closed: boolean;
  /** Dashed look for things underground. */
  under?: boolean;
}

export interface BpReadout {
  score: number;
  label: string;
  barrierPct: number;
  detectionPct: number;
  rings: number;
  gates: number;
  towers: number;
  /** Lanes the terrain gives a crew, hardest going first is the best for the defense. */
  lanes: number;
  laneHardness: number | null;
  chokeHeld: boolean;
  terrainScore: number;
  /** How far each sensor sees in today's fog (m). */
  sight: { eye: number; camera: number; nvg: number; thermal: number };
  fogLabel: string;
}

export interface BlueprintPlan { marks: BpMark[]; outlines: BpOutline[]; readout: BpReadout }

const CAT_OF: Record<string, MarkCat> = { home: 'home', work: 'work', food: 'food', sanitation: 'work', water: 'water', power: 'power', bunker: 'bunker', defense: 'tower' };
const PRIO: Record<MarkCat, number> = { home: 8, tower: 7, gate: 9, ring: 6, tunnel: 8, bridge: 8, bunker: 5, work: 5, food: 4, water: 3, power: 3, wall: 1 };

const corners = (b: { x0: number; z0: number; x1: number; z1: number }): Pt[] => [[b.x0, b.z0], [b.x1, b.z0], [b.x1, b.z1], [b.x0, b.z1]];

/** Point at distance d along a polyline. */
function along(pts: readonly Pt[], d: number): Pt {
  let left = Math.max(0, d);
  for (let i = 1; i < pts.length; i++) {
    const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    if (left <= l || i === pts.length - 1) { const t = l > 0 ? Math.min(1, left / l) : 0; return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t]; }
    left -= l;
  }
  return pts[0];
}

const area = (p: readonly Pt[]): number => { let a = 0; for (let i = 0; i < p.length; i++) { const q = p[(i + 1) % p.length]; a += p[i][0] * q[1] - q[0] * p[i][1]; } return Math.abs(a) / 2; };

const TUNNEL_NAME: Record<string, string> = { rock_tunnel: 'Rock tunnel', tunnel_bridge: 'Tunnel-bridge', slope_tunnel: 'Slope tunnel', escape_tunnel: 'Escape tunnel', underground_passage: 'Underground passage' };

export function blueprintPlan(s: GameState): BlueprintPlan {
  const marks: BpMark[] = [], outlines: BpOutline[] = [];

  // buildings
  for (const st of s.structures) {
    if (st.unplaced) continue;
    const def = KIT[st.kind];
    if (!def) continue;
    if (isTower(st.kind)) {
      const t = TOWERS[st.kind];
      marks.push({ id: st.id, cat: 'tower', x: st.x, z: st.z, label: t.name, sub: isFinished(st) ? `tier ${t.tier}${(st.high ?? 0) > 0.1 ? ' · high ground' : ''}` : 'being built', prio: PRIO.tower, lift: 2.2 });
      continue;
    }
    const cat = CAT_OF[def.category] ?? 'work';
    const fp = footprint(def, st.x, st.z, st.rot, false);
    outlines.push({ id: st.id, cat, pts: corners(fp), closed: true, under: def.level === 'underground' });
    const role = def.sleeps > 0 ? `sleeps ${def.sleeps}` : def.shelters ? `shelters ${def.shelters}` : def.category;
    marks.push({ id: st.id, cat: def.level === 'underground' ? 'bunker' : cat, x: st.x, z: st.z, label: def.name, sub: isFinished(st) ? role : 'being built', prio: PRIO[cat] + (def.sleeps > 0 ? 1 : 0), lift: 1.2 });
  }

  // rings, gates, tunnels, bridges, long walls
  const rings = yardRings(s).sort((a, b) => area(b.pts) - area(a.pts));
  const ringIds = new Map(rings.map((r, i) => [r.id, i + 1]));
  let gates = 0;
  for (const r of s.perimeter) {
    const d = PERIMETER[r.kind];
    if (d.wallTop || r.pts.length < 2) continue;
    const fin = runFinished(r);
    const ringNo = ringIds.get(r.id);
    const tunnel = d.bore || d.span || d.twoWay || d.egressOnly || r.kind === 'slope_tunnel';
    if (tunnel) {
      const name = TUNNEL_NAME[r.kind] ?? d.name;
      outlines.push({ id: r.id, cat: d.span ? 'bridge' : 'tunnel', pts: r.pts, closed: false, under: !d.span });
      const mid = along(r.pts, wallLength(r) / 2);
      marks.push({ id: r.id, cat: d.span ? 'bridge' : 'tunnel', x: mid[0], z: mid[1], label: name, sub: !fin ? 'being built' : r.dropped ? 'dropped' : d.vehicleWay ? 'vehicles and people' : d.egressOnly ? 'way out only' : 'people', prio: PRIO.tunnel, lift: 1.4 });
      continue;
    }
    if (ringNo) {
      outlines.push({ id: r.id, cat: 'ring', pts: r.pts, closed: true });
      const top = r.pts.reduce((a, p) => (p[1] < a[1] ? p : a), r.pts[0]);
      marks.push({ id: r.id, cat: 'ring', x: top[0], z: top[1], label: `${ringNo === 1 ? 'Outer' : 'Inner'} ring wall ${ringNo}`, sub: `${d.name.toLowerCase()} · stops ${Math.round(d.blocks.people * 100)}% of a crew`, prio: PRIO.ring, lift: 1.1 });
    } else if (d.blocks.people >= 0.3) {
      outlines.push({ id: r.id, cat: 'wall', pts: r.pts, closed: false });
      const mid = along(r.pts, wallLength(r) / 2);
      marks.push({ id: r.id, cat: 'wall', x: mid[0], z: mid[1], label: d.name, sub: fin ? undefined : 'being built', prio: PRIO.wall, lift: 0.9 });
    }
    if (fin) for (const [i, g] of r.gates.entries()) {
      const p = along(r.pts, g.at);
      gates++;
      marks.push({ id: `${r.id}:g${i}`, cat: 'gate', x: p[0], z: p[1], label: g.sally ? 'Sally port' : g.garage ? 'Gate garage' : 'Gate', sub: g.sally ? `defenders sortie · ${SALLY.W * 6} m` : `${Math.round(g.w * 6)} m wide`, prio: PRIO.gate, lift: 1.1 });
    }
  }

  // readout
  const rep = defenseReport(s);
  const lanes = lanesOf(s);
  const hardness = lanes.length ? Math.min(...lanes.map(l => l.hardness)) : null;
  const td = terrainDefense(s);
  const fog = fogNow(s);
  const sight = { eye: sensorSightM(fog, 'eye'), camera: sensorSightM(fog, 'camera'), nvg: sensorSightM(fog, 'nvg'), thermal: sensorSightM(fog, 'thermal') };
  const towers = marks.filter(m => m.cat === 'tower').length;
  return {
    marks, outlines,
    readout: {
      score: rep.score, label: rep.label, barrierPct: Math.round(rep.barrier), detectionPct: Math.round(rep.detection), rings: rings.length, gates, towers,
      lanes: lanes.length, laneHardness: hardness === null ? null : Math.round(hardness * 10) / 10, chokeHeld: td.held, terrainScore: Math.round(td.score * 100), sight, fogLabel: fogReadout(fog),
    },
  };
}

export interface ScreenMark { id: string; x: number; y: number; prio: number }

/**
 * Greedy declutter: highest priority first, a label stays when it clears every label already placed (a box of w × h around the point).
 * Marks off screen (`x`/`y` null) are dropped. At most `max` labels so a crowded compound stays readable.
 */
export function declutter(marks: ReadonlyArray<{ id: string; x: number; y: number; prio: number; w: number; h: number }>, max = 60): string[] {
  const placed: Array<{ x: number; y: number; w: number; h: number }> = [], out: string[] = [];
  for (const m of [...marks].sort((a, b) => b.prio - a.prio || (a.id < b.id ? -1 : 1))) {
    if (out.length >= max) break;
    if (placed.some(p => Math.abs(p.x - m.x) < (p.w + m.w) / 2 && Math.abs(p.y - m.y) < (p.h + m.h) / 2)) continue;
    placed.push(m); out.push(m.id);
  }
  return out;
}
