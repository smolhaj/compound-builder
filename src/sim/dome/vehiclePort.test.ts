import { describe, expect, it } from 'vitest';
import { DOME_KIND, DOME_TIERS, TIER, shellFt, type DomeTier } from './tiers';
import { onApron, blockedArcs, approachRoute, angDist, bearingToRoad, choosePortAngle, hasVehiclePort, inKeepout, insideLane, portBill, portFrame, portVestibule, portWords, straightRun, TRUCK, vehicleFits, vehicleTail, yardCorners, STRAIGHT_LEN, APRON_LEN, type Pt } from './vehiclePort';
import { domeFrom, FT_PER_UNIT } from './standing';
import { yardGeometry } from './plantYard';
import { domeCostSummary } from './costSummary';
import { domeBlueprint } from './blueprints';
import { billUsd } from './cost';
import type { Structure } from '../state';

const BIG = ['geodesic', 'glass', 'arcology'] as const;
const radius = (t: DomeTier): number => shellFt(t, TIER[t].cells) / 2 / FT_PER_UNIT - 0.03;
const st = (tier: DomeTier, rot = 0, portAngle?: number): Structure => ({ id: 'd', kind: DOME_KIND[tier], x: 20, z: 20, rot, stage: 99, done: 0, supplied: true, finishedAt: 0, portAngle });

describe('where the vehicle port stands', () => {
  it('only the big three have one; earthen keeps its low door', () => {
    expect(DOME_TIERS.filter(hasVehiclePort)).toEqual(BIG);
    expect(domeFrom(st('earthen'))!.airlocks.some(a => a.role === 'vehicle')).toBe(false);
    for (const t of BIG) expect(domeFrom(st(t))!.airlocks.filter(a => a.role === 'vehicle').length).toBe(1);
  });
  it('is never in the yard span, a person airlock lane, a link lane or a bunker hatch lane, for every tier, turn and approach', () => {
    for (const t of BIG) for (let rot = 0; rot < 4; rot++) for (let k = 0; k < 24; k++) {
      const r = radius(t), links = [k * 0.31], avoid = [{ angle: k * 0.17, width: 0.5 }], ctx = { tier: t, r, rot, links, avoid };
      const p = choosePortAngle(ctx, k * Math.PI / 12), arcs = blockedArcs(ctx);
      if (p.free) for (const a of arcs) expect(angDist(p.angle, a.angle), `${t} rot ${rot} ${a.why}`).toBeGreaterThanOrEqual(a.half - 1e-9);
    }
  });
  it('the glass dome keeps out of the plant yard span even when the road comes from that side', () => {
    const r = radius('glass'), y = yardGeometry('glass', r, 0)!, p = choosePortAngle({ tier: 'glass', r, rot: 0 }, y.phi);
    expect(p.free).toBe(true);
    expect(angDist(p.angle, y.phi)).toBeGreaterThan(y.W / 2 / r + 0.3);
  });
  it('faces the road when that arc is free, and is deterministic', () => {
    for (const t of BIG) {
      const r = radius(t), ctx = { tier: t, r, rot: 0 };
      const arcs = blockedArcs(ctx);
      let hit = 0;
      for (let k = 0; k < 72; k++) {
        const want = k * Math.PI / 36, free = arcs.every(a => angDist(want, a.angle) >= a.half), got = choosePortAngle(ctx, want);
        expect(choosePortAngle(ctx, want)).toEqual(got);
        if (free) { expect(got.angle).toBeCloseTo(want, 9); hit++; }
      }
      expect(hit).toBeGreaterThan(0);
    }
  });
  it('a stamped angle is the one the dome has; an unstamped glass dome takes the free angle nearest east', () => {
    expect(domeFrom(st('glass', 0, 1.0))!.airlocks.find(a => a.role === 'vehicle')!.angle).toBeCloseTo(1.0, 9);
    const d = domeFrom(st('glass'))!, p = d.airlocks.find(a => a.role === 'vehicle')!, y = yardGeometry('glass', d.r, 0)!;
    expect(angDist(p.angle, y.phi)).toBeGreaterThan(y.W / 2 / d.r);
    expect(Math.hypot(p.x - d.x, p.z - d.z)).toBeCloseTo(d.r, 6);
  });
  it('bearingToRoad points at the nearest road point', () => {
    expect(bearingToRoad(0, 0, [[10, -5], [10, 5]])).toBeCloseTo(Math.PI / 2, 6);
  });
});

describe('the port itself', () => {
  it('holds a truck: the chamber is as long as a truck and the gate clears it', () => {
    for (const t of ['glass', 'arcology'] as const) { const v = portVestibule(t, radius(t))!; expect(v.len).toBeGreaterThanOrEqual(TRUCK.LEN); expect(v.dw).toBeGreaterThan(TRUCK.WIDTH + 0.2); expect(vehicleFits(v)).toBe(true); }
    expect(vehicleFits(portVestibule('geodesic', radius('geodesic'))!)).toBe(true);
    expect(portWords('earthen', 1)).toMatch(/No vehicle port/);
  });
  it('the way through: outer gate, chamber, inner gate, a paved lane to a pad on the axis', () => {
    const r = radius('glass'), f = portFrame('glass', 20, 20, r, 5.2)!, tail = vehicleTail(f), lane = insideLane(f)!;
    expect(lane).not.toBeNull();
    expect(tail[0]).toEqual(f.outer);
    for (const p of tail) expect(Math.abs((p[0] - 20) * f.u[1] - (p[1] - 20) * f.u[0])).toBeLessThan(1e-9);
    const depth = tail.map(p => (p[0] - 20) * f.u[0] + (p[1] - 20) * f.u[1]);
    for (let i = 1; i < depth.length; i++) expect(depth[i]).toBeLessThan(depth[i - 1]);
    expect(depth[1]).toBeCloseTo(r - f.v.len, 6);
    expect(depth[depth.length - 1]).toBeGreaterThan(0);
  });
});

describe('the road ends at the port', () => {
  const tier: DomeTier = 'glass', r = radius(tier), cx = 40, cz = 40, rot = 0;
  const y = yardCorners(tier, cx, cz, r, rot)!;
  const keep = { cx, cz, footR: r + 0.03, yard: y };
  const mk = (from: Pt, to: Pt): Pt[] => { const out: Pt[] = []; for (let i = 0; i <= 60; i++) out.push([from[0] + (to[0] - from[0]) * i / 60, from[1] + (to[1] - from[1]) * i / 60]); return out; };
  const check = (drive: Pt[], angle: number) => {
    const f = portFrame(tier, cx, cz, r, angle)!, a = approachRoute(drive, keep, f, 0)!;
    expect(a).not.toBeNull();
    // the straight final approach is the port's axis and at least three truck lengths
    expect(straightRun(a.route, f)).toBeGreaterThanOrEqual(STRAIGHT_LEN - 1e-6);
    expect(STRAIGHT_LEN).toBeGreaterThanOrEqual(3 * TRUCK.LEN);
    const end = a.route[a.route.length - 1]; expect(end[0]).toBeCloseTo(f.outer[0], 6); expect(end[1]).toBeCloseTo(f.outer[1], 6);
    // nothing but the apron and the berm at the door touches the shell, the footprint or the yard wall
    for (let i = 0; i < a.route.length - 1; i++) {
      const p = a.route[i], ahead = (p[0] - cx) * f.u[0] + (p[1] - cz) * f.u[1], off = Math.abs((p[0] - cx) * f.u[1] - (p[1] - cz) * f.u[0]);
      const onAxisRun = off < 1e-6 && ahead >= r - 1e-6;
      if (!onAxisRun) expect(inKeepout(keep, p[0], p[1], 0), `point ${i} ${p}`).toBe(false);
    }
    return { a, f };
  };
  it('a drive that ran straight into the dome from the south-east is cut and re-planned to the port on the east-facing side', () => {
    const drive = mk([cx + 30, cz + 20], [cx, cz]);
    const { a } = check(drive, choosePortAngle({ tier, r, rot }, bearingToRoad(cx, cz, drive)).angle);
    expect(a.cut).toBe(true);
    expect(a.route.length).toBeGreaterThan(drive.length * 0.3);
  });
  it('a drive from the yard side: the port stands off the yard and the road goes round it, never through the wall', () => {
    const yg = yardGeometry(tier, r, rot)!, from: Pt = [cx + Math.sin(yg.phi) * 30, cz + Math.cos(yg.phi) * 30];
    const drive = mk(from, [cx, cz]), want = bearingToRoad(cx, cz, drive), angle = choosePortAngle({ tier, r, rot }, want).angle;
    expect(angDist(angle, yg.phi)).toBeGreaterThan(yg.W / 2 / r);
    check(drive, angle);
  });
  it('every turn and every side of approach re-plans cleanly', () => {
    for (let k = 0; k < 12; k++) {
      const b = k * Math.PI / 6, drive = mk([cx + Math.sin(b) * 28, cz + Math.cos(b) * 28], [cx, cz]);
      for (let rt = 0; rt < 4; rt++) {
        const yk = { ...keep, yard: yardCorners(tier, cx, cz, r, rt)! };
        const f = portFrame(tier, cx, cz, r, choosePortAngle({ tier, r, rot: rt }, b).angle)!;
        const a = approachRoute(drive, yk, f, 0)!;
        expect(straightRun(a.route, f)).toBeGreaterThanOrEqual(STRAIGHT_LEN - 1e-6);
        for (const p of a.route.slice(0, -1)) { const ahead = (p[0] - cx) * f.u[0] + (p[1] - cz) * f.u[1], off = Math.abs((p[0] - cx) * f.u[1] - (p[1] - cz) * f.u[0]); if (!(off < 1e-6 && ahead >= r - 1e-6)) expect(inKeepout(yk, p[0], p[1], 0)).toBe(false); }
      }
    }
  });
  it('the apron is a pad outside the shell, at least a truck and a half deep', () => {
    expect(APRON_LEN).toBeGreaterThanOrEqual(1.3 * TRUCK.LEN);
  });
  it('a drive that never comes near the dome is left alone', () => {
    expect(approachRoute(mk([cx + 60, cz + 60], [cx + 90, cz + 60]), keep, portFrame(tier, cx, cz, r, 1.5)!, 0)).toBeNull();
  });
});

describe('the bill', () => {
  it('is itemized in the card and counted in the grand total; the blueprint charges the same goods', () => {
    for (const t of BIG) {
      const s = domeCostSummary(t), line = s.extras.find(l => l.id === 'vehicle_port')!;
      expect(line.usd).toBeGreaterThan(0);
      expect(s.grandUsd).toBe(s.totalUsd + s.extras.reduce((a, l) => a + l.usd, 0));
      const goods = billUsd(portBill(t, radius(t)).bill);
      expect(line.usd).toBeGreaterThanOrEqual(goods);
      const fin = domeBlueprint(t).stages[4].materials, kits = { geodesic: 2, glass: 3, arcology: 5 }[t];
      expect(fin.dome_airlock).toBe(TIER[t].airlocks + (t === 'geodesic' ? 0 : 1) + kits);   // person airlocks, the plant yard's service airlock, the port's kits
      expect(fin.bollards).toBeGreaterThan(0);
    }
    expect(domeCostSummary('earthen').extras.length).toBe(0);
  });
});

describe('the road plan the world draws', () => {
  it('replaces the end of the drive, drops what lay past the cut and moves the yard onto the inside pad', async () => {
    const { planToPort } = await import('./portRoad');
    const pts = Array.from({ length: 81 }, (_, i) => ({ x: 70 - i * 0.5, z: 40 + (70 - i * 0.5 - 40) * 0.2, y: 1, s: i * 0.5, bank: 0 }));
    const plan = { pts, gateAt: 2, gate: { x: 70, z: 46, rot: 0 }, yard: [40, 40] as [number, number], structures: [{ kind: 'culvert', s0: 3, s1: 4, x: 0, z: 0, rot: 0, lengthM: 1, usd: 1, days: 1, choke: false, droppable: false }, { kind: 'culvert', s0: 36, s1: 38, x: 0, z: 0, rot: 0, lengthM: 1, usd: 1, days: 1, choke: false, droppable: false }], walls: [], rails: [], hairpins: [], lengthU: 40, lengthM: 240, lengthFt: 800 } as unknown as import('../roadPlan').RoadPlan;
    const d = domeFrom({ id: 'd', kind: DOME_KIND.glass, x: 40, z: 40, rot: 1, stage: 99, done: 0, supplied: true, finishedAt: 0, portAngle: 1.2 })!;
    const pr = planToPort(plan, [d], () => 0)!;
    expect(pr).not.toBeNull();
    const last = pr.plan.pts[pr.plan.pts.length - 1];
    expect(last.x).toBeCloseTo(pr.frame.outer[0], 6); expect(last.z).toBeCloseTo(pr.frame.outer[1], 6);
    expect(pr.plan.structures.length).toBe(1);   // the culvert past the cut is gone
    expect(pr.plan.yard).toEqual(insideLane(pr.frame)!.pad);
    for (let i = 1; i < pr.plan.pts.length; i++) expect(pr.plan.pts[i].s).toBeGreaterThan(pr.plan.pts[i - 1].s);
  });
});

describe('the new stretch of road has no sharp kink', () => {
  it('a winding drive that ends past the dome joins and bends no more than about 60 degrees at a station', () => {
    const tier: DomeTier = 'glass', r = radius(tier), cx = 40, cz = 40;
    // an S-shaped drive from the north-east that ends on the dome's far side (the owner's shot: a zigzag into the yard)
    const drive: Pt[] = [];
    for (let i = 0; i <= 80; i++) { const t = i / 80; drive.push([cx + 30 - 34 * t, cz - 26 + 30 * t + 5 * Math.sin(t * 9)]); }
    for (let rt = 0; rt < 4; rt++) for (const want of [0.5, 1.0, 2.0, 3.5, 5.0]) {
      const keep = { cx, cz, footR: r + 0.03, yard: yardCorners(tier, cx, cz, r, rt) }, ang = choosePortAngle({ tier, r, rot: rt }, want).angle, f = portFrame(tier, cx, cz, r, ang)!;
      const a = approachRoute(drive, keep, f, 0)!;
      let worst = 0;
      for (let i = a.joinAt; i + 2 < a.route.length; i++) {
        const p = a.route[i], q = a.route[i + 1], s = a.route[i + 2], d1 = Math.atan2(q[0] - p[0], q[1] - p[1]), d2 = Math.atan2(s[0] - q[0], s[1] - q[1]);
        worst = Math.max(worst, angDist(d1, d2));
      }
      expect(worst, `rot ${rt} want ${want}`).toBeLessThan(1.05);
    }
  });
});

describe('the earthen dome keeps its low door: the road ends on a gravel apron in front of it', () => {
  it('the frame has no chamber for a truck, the drive stops on the apron and never reaches the shell', () => {
    const r = radius('earthen'), f = portFrame('earthen', 40, 40, r, 0.8)!;
    expect(f.fits).toBe(false);
    expect(insideLane(f)).toBeNull();
    const drive: Pt[] = Array.from({ length: 61 }, (_, i) => [40 + 30 - i * 0.5, 40 + 12 - i * 0.2] as Pt);
    const a = approachRoute(drive, { cx: 40, cz: 40, footR: r, yard: null }, f, 0)!;
    const end = a.route[a.route.length - 1];
    expect(onApron(f, end[0], end[1])).toBe(true);
    expect(Math.hypot(end[0] - 40, end[1] - 40)).toBeGreaterThan(r + 0.5);
    expect(straightRun(a.route, f)).toBeGreaterThanOrEqual(STRAIGHT_LEN - APRON_LEN * 0.6 - 1e-6);
    expect(vehicleTail(f)).toEqual([f.outer]);
  });
});
