/**
 * The access road of a place re-planned to a dome's vehicle port (sim/dome/vehiclePort.ts `approachRoute`), as a derived `RoadPlan`: the stations of the old
 * drive up to the cut, then the new stretch to the port's outer gate, with the structures, walls and hairpins past the cut dropped. The yard (where deliveries
 * unload) moves onto the inside pad when the old yard stood under the shell or in the keep-out. Never saved: the world and the headless readers derive it from
 * the same plan and the same domes. Pure (tested in vehiclePort.test.ts).
 */
import type { RoadPlan, RoadPt } from '../roadPlan';
import { UNIT_M, M_TO_FT } from '../roadStyle';
import { approachRoute, inKeepout, insideLane, portFrame, yardCorners, apronSpan, portGrade, APRON_LEN, type Approach, type Keepout, type PortFrame, type Pt } from './vehiclePort';
import { BED } from '../roadBed';
import type { Dome } from './standing';

/** The steepest the new stretch of road runs (rise over run): well under the truck's 12 percent and the 7 percent it takes in snow. */
export const MAX_GRADE = 0.06;
/** How far back from the join the old drive's profile is eased (units). */
export const BACK = 30;

/** `plan` is the road in use (its last stations carry the graded corridor); `drawn` is the plan the ground road is drawn from: its gravel ends 0.1 unit under the apron's toe, where the apron's own surface takes over. */
export interface PortRoad { plan: RoadPlan; drawn: RoadPlan; frame: PortFrame; approach: Approach; dome: Dome }

/** The first dome (nearest the old yard) whose port the road is re-planned to, with the plan it makes; null when no dome with a port lies on or near the drive. */
export function planToPort(plan: RoadPlan, domes: readonly Dome[], height: (x: number, z: number) => number): PortRoad | null {
  const drive = plan.pts.map(p => [p.x, p.z] as Pt), yard = plan.yard;
  const doorOf = (d: Dome) => d.airlocks.find(a => a.role === 'vehicle') ?? (d.tier === 'earthen' ? d.airlocks[0] : undefined);
  const cands = domes.filter(d => doorOf(d)).sort((a, b) => Math.hypot(a.x - yard[0], a.z - yard[1]) - Math.hypot(b.x - yard[0], b.z - yard[1]) || (a.id < b.id ? -1 : 1));
  for (const d of cands) {
    const ap = doorOf(d)!, f = portFrame(d.tier, d.x, d.z, d.r, ap.angle);
    if (!f) continue;
    const keep: Keepout = { cx: d.x, cz: d.z, footR: d.footR, yard: yardCorners(d.tier, d.x, d.z, d.r, d.structure.rot) };
    const approach = approachRoute(drive, keep, f, plan.gateAt);
    if (!approach) continue;
    // the old yard: kept when it is clear of the dome; else the deliveries unload on the inside pad (or, with no lane, on the apron)
    const lane = insideLane(f), under = Math.hypot(yard[0] - d.x, yard[1] - d.z) < d.r + 0.2 || inKeepout(keep, yard[0], yard[1], 0);
    const newYard: Pt = under || approach.cut ? (lane ? lane.pad : f.apronEnd) : yard;
    const derived = grade(derive(plan, approach, newYard, height), f);
    return { plan: derived, drawn: trimAtApron(derived, f), frame: f, approach, dome: d };
  }
  return null;
}

/** The plan with its drive replaced from the join on. */
export function derive(plan: RoadPlan, a: Approach, yard: Pt, height: (x: number, z: number) => number): RoadPlan {
  const keep = plan.pts.slice(0, a.joinAt + 1);
  let s = keep[keep.length - 1].s, prev = keep[keep.length - 1];
  const tail: RoadPt[] = [];
  for (const [x, z] of a.route.slice(a.joinAt + 1)) { s += Math.hypot(x - prev.x, z - prev.z); const pt: RoadPt = { x, z, y: height(x, z), s, bank: 0 }; tail.push(pt); prev = pt; }
  // the road's own profile: the natural height where it is gentle, never steeper than MAX_GRADE from a point `BACK` units before the join to the port (a truck cannot take
  // the embankment at the dome's pad: the bed is cut and filled to this line). The old drive's last stretch is eased the same way so the climb has room
  const all = [...keep.map(k => ({ ...k })), ...tail];
  let k0 = keep.length - 1;
  while (k0 > Math.max(0, plan.gateAt + 1) && keep[keep.length - 1].s - keep[k0].s < BACK) k0--;
  {
    const yA = all[k0].y, sA = all[k0].s, yO = all[all.length - 1].y, L = all[all.length - 1].s - sA;
    for (let i = k0 + 1; i < all.length; i++) {
      const d = all[i].s - sA, lo = Math.max(yA - MAX_GRADE * d, yO - MAX_GRADE * (L - d)), hi = Math.min(yA + MAX_GRADE * d, yO + MAX_GRADE * (L - d));
      all[i].y = lo <= hi ? Math.min(hi, Math.max(lo, all[i].y)) : (lo + hi) / 2;
    }
  }
  // (each station was bounded against the two ends only: two neighbors could still differ by twice the grade. Smooth it with a forward and a backward pass so every step is within MAX_GRADE.)
  for (let pass = 0; pass < 2; pass++) {
    for (let i = k0 + 1; i < all.length - 1; i++) { const ds = all[i].s - all[i - 1].s; all[i].y = Math.max(all[i - 1].y - MAX_GRADE * ds, Math.min(all[i - 1].y + MAX_GRADE * ds, all[i].y)); }
    for (let i = all.length - 2; i > k0; i--) { const ds = all[i + 1].s - all[i].s; all[i].y = Math.max(all[i + 1].y - MAX_GRADE * ds, Math.min(all[i + 1].y + MAX_GRADE * ds, all[i].y)); }
  }
  const keepOut = all.slice(0, keep.length), tailOut = all.slice(keep.length);
  const pts = [...keepOut, ...tailOut], lengthU = pts[pts.length - 1].s, cutS = keep[keep.length - 1].s;
  const lengthM = lengthU * UNIT_M;
  return {
    ...plan, pts, yard, lengthU, lengthM, lengthFt: lengthM * M_TO_FT,
    structures: plan.structures.filter(x => x.s1 <= cutS + 1e-6),
    walls: plan.walls.filter(w => w.s0 < cutS).map(w => ({ ...w, s1: Math.min(w.s1, cutS) })),
    rails: plan.rails.filter(w => w.s0 < cutS).map(w => ({ ...w, s1: Math.min(w.s1, cutS) })),
    hairpins: plan.hairpins.filter(h => h.s <= cutS),
  };
}

/** The frame of a standing dome's vehicle port (null: none). */
export function portFrameOf(d: Dome): PortFrame | null {
  const a = d.airlocks.find(x => x.role === 'vehicle') ?? (d.tier === 'earthen' ? d.airlocks[0] : undefined);
  return a ? portFrame(d.tier, d.x, d.z, d.r, a.angle) : null;
}

/** Distance out from the gate plane of each station of `plan`, by the length of road left to the end (the straight run is on the axis: the same as its projection). */
function rhoOf(plan: RoadPlan, f: PortFrame): number[] {
  const end = plan.pts[plan.pts.length - 1], rhoEnd = (end.x - f.cx) * f.u[0] + (end.z - f.cz) * f.u[1] - f.r;
  return plan.pts.map(p => end.s - p.s + rhoEnd);
}

/** The plan with the last `GRADE_LEN` units of its stations carrying the corridor's width and batters (read by `roadBedOf`, so the world cuts and fills the ground to it). */
export function grade(plan: RoadPlan, f: PortFrame): RoadPlan {
  const span = apronSpan(f), rho = rhoOf(plan, f);
  return { ...plan, pts: plan.pts.map((p, i) => { const g = portGrade(rho[i], span, BED); return g ? { ...p, half: g.half, cut: g.cut, fill: g.fill, reach: g.reach } : p; }) };
}

/** The plan to draw the ground road from: its stations stop 0.1 unit short of the apron's toe (the last one interpolated), so no gravel shows through the apron's slab. */
export function trimAtApron(plan: RoadPlan, f: PortFrame): RoadPlan {
  const rho = rhoOf(plan, f), cut = APRON_LEN - 0.1;   // (the stations run in toward the gate: rho falls along the route)
  let k = -1; for (let i = 0; i < rho.length; i++) if (rho[i] >= cut) k = i; else break;
  if (k < 0 || k === rho.length - 1) return plan;
  const a = plan.pts[k], b = plan.pts[k + 1], t = (rho[k] - cut) / (rho[k] - rho[k + 1]);
  const m: RoadPt = { ...a, x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, y: a.y + (b.y - a.y) * t, s: a.s + (b.s - a.s) * t, bank: 0 };
  const pts = [...plan.pts.slice(0, k + 1), m];
  return { ...plan, pts, lengthU: m.s };
}
