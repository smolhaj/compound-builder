import { describe, expect, it } from 'vitest';
import { newGame } from '../../sim/state';
import { makeLotSite } from '../../sim/lotListing';
import { REGION_IDS } from '../../sim/regions';
import { roadPlanFor } from '../../sim/roadState';
import { planFortress, layFortress } from '../../sim/fortress';
import { planPropertyWall, layPropertyWall } from '../../sim/propertyWall';
import { DRIVE_HALF, crossings, cutRoadGates, roadGateStatus } from '../../sim/roadGate';
import { VEHICLE_SIZE } from '../props/vehicleGeometry';
import { distToLine } from '../region/access';
import { KIT, entryGate, gateHouseFrame, gateKitLayout, headingAt, pointAtArc, type Layout } from './gateKitLayout';
import type { LotKind } from '../../sim/lots';
import type { Gate, Pt } from '../../sim/perimeter';

const WIDEST = Math.max(...Object.values(VEHICLE_SIZE).map(v => v.w));
const PICKUP = VEHICLE_SIZE.pickup;
const deg = (a: Pt, b: Pt): number => Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1]))) * 180 / Math.PI;
const dot = (a: Pt, b: Pt): number => a[0] * b[0] + a[1] * b[1];

/** The road ribbon's own tangent (game/region/roadWorks `frames`): the chord of each station's neighbours, interpolated between stations. An independent measure of "the road's heading". */
function roadTangent(d: readonly Pt[], s: number): Pt {
  const rot = (i: number): number => { const a = d[Math.max(0, i - 1)], b = d[Math.min(d.length - 1, i + 1)]; return Math.atan2(b[1] - a[1], b[0] - a[0]); };
  let acc = 0;
  for (let i = 1; i < d.length; i++) {
    const l = Math.hypot(d[i][0] - d[i - 1][0], d[i][1] - d[i - 1][1]);
    if (acc + l >= s || i === d.length - 1) {
      const k = Math.max(0, Math.min(1, (s - acc) / (l || 1))), a0 = rot(i - 1);
      let a1 = rot(i);
      while (a1 - a0 > Math.PI) a1 -= 2 * Math.PI;
      while (a1 - a0 < -Math.PI) a1 += 2 * Math.PI;
      const a = a0 + (a1 - a0) * k;
      return [Math.cos(a), Math.sin(a)];
    }
    acc += l;
  }
  return [1, 0];
}

/** Everything that must hold for a drive gate's kit; returns what is wrong (empty = aligned, on the road, clear, flush with the wall). */
export function kitProblems(lay: Layout, drive: readonly Pt[], wall: readonly Pt[], arc: number): string[] {
  const bad: string[] = [];
  const L = KIT.clearHalf + KIT.thick / 2;
  // heading: the kit's axis is the road's heading at the crossing, within 3 degrees
  const h = deg(lay.t, roadTangent(drive, arc));
  if (h > 3) bad.push(`heading ${h.toFixed(1)} deg off the road`);
  // side walls: flush with the wall line at their start, parallel to the road (a constant offset from its center line) all the way in
  for (const sd of lay.sides) {
    const flush = distToLine(wall, sd[0][0], sd[0][1]);
    if (flush > 0.02) bad.push(`side wall starts ${flush.toFixed(3)} off the wall line`);
    for (const q of sd) {
      const off = distToLine(drive, q[0], q[1]);
      if (Math.abs(off - L) > 0.05) bad.push(`side wall ${off.toFixed(3)} from the road center, want ${L.toFixed(3)}`);
    }
    for (const [i, q] of sd.entries()) if (i > 0 && Math.hypot(q[0] - sd[0][0], q[1] - sd[0][1]) > 0.35 && distToLine(wall, q[0], q[1]) < 0.06) bad.push('a side wall runs into the wall it joins');
    for (let i = 1; i < sd.length; i++) {
      const mid: Pt = [(sd[i][0] + sd[i - 1][0]) / 2, (sd[i][1] + sd[i - 1][1]) / 2];
      if (distToLine(drive, mid[0], mid[1]) < DRIVE_HALF + KIT.thick / 2 - 0.01) bad.push('a side wall stands on the road surface');
    }
  }
  // wings close the gap to the piers on the wall line
  for (const w of lay.wings) for (const p of [w.a, w.b]) if (distToLine(wall, p[0], p[1]) > 0.02) bad.push('a wing is off the wall line');
  // inner gate: centered on the road (both posts the same distance from its center line), square to the road there, clear width for a vehicle plus margin
  const [pl, pr] = lay.inner;
  const dl = distToLine(drive, pl[0], pl[1]), dr = distToLine(drive, pr[0], pr[1]);
  if (Math.abs(dl - dr) > 0.05) bad.push(`inner gate off center by ${Math.abs(dl - dr).toFixed(3)}`);
  const across: Pt = [pr[0] - pl[0], pr[1] - pl[1]], al = Math.hypot(across[0], across[1]);
  if (Math.abs(dot([across[0] / al, across[1] / al], lay.tEnd)) > Math.sin(3 * Math.PI / 180)) bad.push('inner gate not square to the road');
  const clear = al - KIT.thick;
  if (clear < WIDEST + 0.1) bad.push(`clear width ${clear.toFixed(3)} for a ${WIDEST} wide vehicle`);
  if (2 * (KIT.clearHalf - KIT.leafInset) < WIDEST + 0.1) bad.push('open leaves leave too little room');
  if (clear < PICKUP.w + 0.2) bad.push('too tight for a pickup');
  // small things: off the road surface, the intercom and the sign outside the wall, the motor cage inside, the cage not in the clear width
  /** Inside the closed run (even-odd rule), so the answer is right however the wall bends near the gate; an open run falls back to the straight wall line. */
  const closed = wall.length > 3 && Math.hypot(wall[0][0] - wall[wall.length - 1][0], wall[0][1] - wall[wall.length - 1][1]) < 1e-6;
  const inside = (p: Pt): boolean => {
    let ins = false;
    for (let i = 1; i < wall.length; i++) {
      const [ax, az] = wall[i - 1], [bx, bz] = wall[i];
      if ((az > p[1]) !== (bz > p[1]) && p[0] < ax + (bx - ax) * (p[1] - az) / (bz - az)) ins = !ins;
    }
    return ins;
  };
  const inward: Pt = (() => { const wn: Pt = [-lay.wd[1], lay.wd[0]]; return dot(wn, lay.t) >= 0 ? wn : [-wn[0], -wn[1]]; })();
  const side = (p: Pt): number => (closed ? (inside(p) ? 1 : -1) : dot([p[0] - lay.c[0], p[1] - lay.c[1]], inward));
  for (const [name, p, want] of [['intercom', lay.intercom, -1], ['sign', lay.sign, -1], ['motor', lay.motor, 1]] as const) {
    if (distToLine(drive, p[0], p[1]) < DRIVE_HALF + 0.04) bad.push(`${name} on the road`);
    if (side(p) * want < (closed ? 0.5 : 0.06)) bad.push(`${name} on the wrong side of the wall`);
    if (distToLine(drive, p[0], p[1]) < L + 0.03 && side(p) > 0) bad.push(`${name} inside the port`);
  }
  // faces: the leaves open and the sign and camera look along the approach (away from the camp)
  if (deg(lay.out, [-lay.t[0], -lay.t[1]]) > 0.5) bad.push('faces do not look along the approach');
  return bad;
}

describe('geometry helpers', () => {
  it('the heading is the road station frame: a straight drive is exact', () => {
    const d: Pt[] = [[0, 0], [0.5, 0], [1, 0], [1.5, 0], [2, 0]];
    expect(headingAt(d, 1)).toEqual([1, 0]);
    expect(pointAtArc(d, 0.75)).toEqual([0.75, 0]);
  });
});

/** A straight or curved drive, and a wall line across it at an angle. */
function scene(opts: { bend?: number; wallAngle?: number; gateW?: number }): { drive: Pt[]; wall: Pt[]; gate: Gate; crossing: ReturnType<typeof crossings>[number] } {
  const R = opts.bend ?? 0, drive: Pt[] = [];
  for (let s = -6; s <= 6.001; s += 0.5) {
    if (!R) drive.push([s, 0]);
    else { const a = s / R; drive.push([R * Math.sin(a), R * (1 - Math.cos(a))]); }   // a circle of radius R tangent to +x at the origin
  }
  const wa = (opts.wallAngle ?? 90) * Math.PI / 180, c: Pt = [0, 0], d: Pt = [Math.cos(wa), Math.sin(wa)];
  const wall: Pt[] = [[c[0] - d[0] * 8, c[1] - d[1] * 8], [c[0] + d[0] * 8, c[1] + d[1] * 8]];
  const cr = crossings(wall, drive)[0];
  const w = opts.gateW ?? Math.min(1.4, 0.6 / Math.max(0.5, cr.sin));
  return { drive, wall, gate: { at: cr.at, w }, crossing: cr };
}

describe('the sally port follows the drive', () => {
  it.each([
    ['straight, square', {}],
    ['straight, wall at 60 degrees', { wallAngle: 60 }],
    ['straight, wall at 45 degrees', { wallAngle: 45 }],
    ['straight, wall at 120 degrees', { wallAngle: 120 }],
    ['curved (R 3), square', { bend: 3 }],
    ['curved (R 3), wall at 60', { bend: 3, wallAngle: 60 }],
    ['curved the other way (R -3)', { bend: -3 }],
    ['a wide gate in the wall (3 units)', { gateW: 3 }],
  ] as const)('%s: aligned, flush, centered, clear', (_n, o) => {
    const sc = scene(o), lay = gateKitLayout(sc.gate, sc.crossing, sc.drive, sc.wall)!;
    expect(lay).not.toBeNull();
    expect(kitProblems(lay, sc.drive, sc.wall, sc.crossing.driveArc)).toEqual([]);
  });

  it('on a straight square crossing the walls are exactly parallel to the road and a clear width apart', () => {
    const sc = scene({}), lay = gateKitLayout(sc.gate, sc.crossing, sc.drive, sc.wall)!;
    for (const sd of lay.sides) { expect(Math.abs(sd[0][1] - sd[sd.length - 1][1])).toBeLessThan(1e-9); expect(sd[sd.length - 1][0] - sd[0][0]).toBeCloseTo(KIT.depth, 3); }
    expect(Math.abs(lay.sides[0][0][1] - lay.sides[1][0][1])).toBeCloseTo(2 * (KIT.clearHalf + KIT.thick / 2), 3);
    expect(lay.out[0]).toBeCloseTo(-1);
    expect(lay.out[1]).toBeCloseTo(0);
  });

  it('a slanted wall (45 deg) does not tilt the port: the wall line is skewed, the walls still run along the road', () => {
    const sc = scene({ wallAngle: 45 }), lay = gateKitLayout(sc.gate, sc.crossing, sc.drive, sc.wall)!;
    for (const sd of lay.sides) expect(Math.abs(sd[sd.length - 1][1] - sd[0][1])).toBeLessThan(1e-6);
    expect(deg(lay.t, [1, 0])).toBeLessThan(0.01);
  });

  it('a grazing crossing (a drive nearly along the wall) is not built square', () => {
    const sc = scene({ wallAngle: 20 });
    expect(gateKitLayout(sc.gate, sc.crossing, sc.drive, sc.wall)).toBeNull();
  });

  it('the guard house stands inside the entry wall (clear of a slanted wall and of the sally port), on the drive, facing the road', () => {
    const sc = scene({ wallAngle: 60 }), entry = { crossing: sc.crossing };
    const plain = gateHouseFrame(sc.drive, entry, false, [0, 0]), sally = gateHouseFrame(sc.drive, entry, true, [0, 0]);
    expect(plain.origin[0]).toBeGreaterThan(0.5);
    expect(sally.origin[0]).toBeGreaterThanOrEqual(KIT.depth + 0.5 - 1e-9);
    expect(Math.abs(sally.origin[1])).toBeLessThan(0.01);
    expect(sally.t[0]).toBeCloseTo(1);
    // with no wall across the drive it is half a unit inside the property gate
    const free = gateHouseFrame(sc.drive, null, false, [0, 0]);
    expect(free.origin[0]).toBeCloseTo(0.5, 1);
  });
});

describe('every entry gate of generated lots carries an aligned kit', () => {
  const KINDS: LotKind[] = ['ridge', 'hillside', 'bench', 'mesa', 'saddle'];
  const VARIANTS = ['property wall', 'octagon core ring, stone', 'full property, three rings'] as const;
  it('regions x lot kinds x seeds x wall layouts: the drive meets the first wall at a gate, and the kit is aligned and clear', { timeout: 120_000 }, () => {
    let kits = 0, grazing = 0, lots = 0, noEntry = 0;
    const problems: string[] = [], stubs: string[] = [], ringStubs: string[] = [];
    for (const region of REGION_IDS) for (const kind of KINDS) for (const seed of [1, 2]) {
      const site = makeLotSite({ region, kind, seed });
      for (const variant of VARIANTS) {
        const g = newGame(seed + 3, 105, 2027, { site });
        const plan = roadPlanFor(g.site, g.seed), drive = plan.pts.map(p => [p.x, p.z] as Pt), h = g.site.home;
        const geo = { roadGate: [plan.gate.x, plan.gate.z] as Pt, drive, center: [(h.x0 + Math.min(h.x1, 67)) / 2, (h.z0 + h.z1) / 2] as Pt };
        if (variant === VARIANTS[0]) layPropertyWall(g, planPropertyWall(g, 'container_wall', geo), geo);
        else if (variant === VARIANTS[1]) layFortress(g, planFortress(g, geo, { scope: 'core', shape: 'octagon', passage: false, wall: 'stone_wall' }));
        else layFortress(g, planFortress(g, geo, { scope: 'full', rings: 3, passage: false }));
        for (const r of g.perimeter) { r.finishedAt = 0; for (const gt of r.gates) delete gt.garage; }   // a gate garage is the gate itself and takes no kit: test the plain gate
        cutRoadGates(g, drive, true);   // as the store does after a fortify: any ring the drive crosses without a gate gets one
        lots++;
        const label = `${region}/${kind}/${seed}/${variant}`;
        const st = roadGateStatus(g, drive);
        // every wall the drive crosses has a vehicle gate there (no road ends at a wall), and the first one is the entry that takes the kit
        const e = entryGate(g.perimeter, drive);
        // (a ring whose own gate lands beside a very slanted crossing, sin < 0.45, leaves that crossing ungated: sim/roadGate `cutRoadGates` will not put two gates on top of each other; counted, not hidden)
        if (variant === VARIANTS[0] ? st.missing > 0 || !e : st.missing > 0) (variant === VARIANTS[0] ? stubs : ringStubs).push(`${label}: ${st.missing} wall(s) the road runs into with no gate${e ? '' : ', no entry gate'}`);
        if (!e) { noEntry++; continue; }
        const lay = gateKitLayout(e.gate, e.crossing, drive, g.perimeter.find(r => r.id === e.runId)!.pts);
        if (!lay) { grazing++; continue; }
        const run = g.perimeter.find(r => r.id === e.runId)!;
        const bad = kitProblems(lay, drive, run.pts, e.crossing.driveArc);
        kits++;
        if (bad.length) problems.push(`${label}: ${[...new Set(bad)].join('; ')}`);
      }
    }
    expect(lots).toBeGreaterThan(200);
    expect(kits).toBeGreaterThan(200);
    expect(stubs).toEqual([]);
    expect(ringStubs.length).toBeLessThan(lots * 0.03);
    expect(problems).toEqual([]);
    // the only crossings left unbuilt are drives running almost along a diagonal facet (sin < 0.5, a road within 30 degrees of a ring facet)
    expect(grazing).toBeLessThan(lots * 0.08);
    expect(noEntry).toBeLessThan(lots);
  });
});
