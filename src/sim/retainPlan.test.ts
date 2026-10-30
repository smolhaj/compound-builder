import { describe, expect, it } from 'vitest';
import { RW, WALLLESS, blocksWalk, inStair, planPad, stairRect, wallAt, type Rect } from './retainPlan';

const fp: Rect = { x0: -0.75, z0: -0.75, x1: 0.75, z1: 0.75 };
/** Ground that rises toward the north (-z) at the given grade. */
const slope = (g: number) => (_x: number, z: number) => 10 - g * z;

describe('retaining wall plan', () => {
  it('level or gentle ground has no wall and keeps the old wide skirt', () => {
    const p = planPad(fp, slope(0.02));
    expect(p.runs).toEqual([]);
    expect(p.skirt).toBe(0.9);
    expect(p.maxH).toBe(0);
    expect(blocksWalk(p, 0, -0.9)).toBe(false);
  });

  it('a 25 % slope cuts the uphill side (north) and fills the downhill side (south), tapering to nothing along the east and west sides', () => {
    const p = planPad(fp, slope(0.25));
    expect(p.skirt).toBe(RW.SKIRT);
    const [n, e, s, w] = p.runs;
    expect(Math.min(...n.h)).toBeGreaterThan(0.2);            // cut all along the top
    expect(Math.max(...s.h)).toBeLessThan(-0.2);              // fill all along the bottom
    for (const side of [e, w]) { expect(Math.max(...side.h)).toBeGreaterThan(0.2); expect(Math.min(...side.h)).toBeLessThan(-0.2); expect(side.h.some(v => v === 0 || Math.abs(v) < RW.BARRIER_H)).toBe(true); }
    expect(p.maxH).toBeGreaterThan(0.3);
    expect(p.maxH * RW.M).toBeGreaterThan(1.8);               // about two metres at the corners
    expect(p.lenU).toBeGreaterThan(5);
    expect(p.faceM2).toBeGreaterThan(20);
  });

  it('leaves a flat apron on the walled sides: 2.7 m up the hill, and the footprint stays clear of the wall', () => {
    const p = planPad(fp, slope(0.25));
    expect(p.rect.z0).toBeCloseTo(fp.z0 - RW.EDGE - RW.APRON, 5);
    expect(p.rect.z1).toBeCloseTo(fp.z1 + RW.EDGE + RW.APRON, 5);
    // the apron is only on sides that carry a wall: a gentle slope (a 5 % cross fall, under the wall step) leaves none anywhere
    const q = planPad(fp, (x) => 10 + 0.05 * x);
    expect(q.rect.z0).toBeCloseTo(fp.z0 - RW.EDGE, 5);
    // a steep cross slope walls the east and west sides
    const r = planPad(fp, (x) => 10 + 0.3 * x);
    expect(r.rect.x0).toBeLessThan(fp.x0 - RW.EDGE - 0.4);
  });

  it('the apron stops short of a neighbour and a wall never lands on it', () => {
    const near: Rect = { x0: -0.75, z0: -2.4, x1: 0.75, z1: -1.2 };   // 0.45 u north of the footprint
    const p = planPad(fp, slope(0.25), [near]);
    expect(p.rect.z0).toBeGreaterThanOrEqual(near.z1 + RW.SKIRT + 0.07);
  });

  it('sets a stair through a wall: a flight of steps at 27 cm, clear of the building, long enough for its rise', () => {
    const p = planPad(fp, slope(0.2));
    expect(p.stairs.length).toBeGreaterThan(0);
    expect(p.stairs.length).toBeLessThanOrEqual(RW.MAX_STAIRS);
    for (const s of p.stairs) {
      const r = stairRect(s, 0.04);
      expect(r.x1 <= fp.x0 || r.x0 >= fp.x1 || r.z1 <= fp.z0 || r.z0 >= fp.z1).toBe(true);
      expect(s.steps).toBe(Math.max(2, Math.round(Math.abs(s.topY - s.footY) / RW.RISE)));
      expect(s.len).toBeCloseTo(s.steps * RW.RUN + RW.SKIRT, 6);
      expect(inStair(p.stairs, s.x + s.dx * 0.1, s.z + s.dz * 0.1)).toBe(true);
    }
  });

  it('a walk is stopped by a high wall but not at a stair, and not by a wall that is only a kerb', () => {
    const p = planPad(fp, slope(0.25));
    expect(p.barrier).toBe(true);
    const s = p.stairs[0];
    expect(blocksWalk(p, s.x + s.dx * 0.05, s.z + s.dz * 0.05)).toBe(false);
    // somewhere along the north slab that is not the stair
    const north = p.runs[0];
    let blocked = 0;
    for (let i = 0; i < north.pts.length; i++) {
      const [x, z] = north.pts[i];
      if (blocksWalk(p, x, z - RW.SKIRT / 2)) blocked++;
    }
    expect(blocked).toBeGreaterThan(north.pts.length / 2);
    expect(wallAt(p, 0, p.rect.z0 - RW.SKIRT / 2)).toBeGreaterThan(0.25);
    const low = planPad(fp, slope(0.09));
    // a 9 % slope: walls under 60 cm are stepped over
    expect(low.maxH * RW.M).toBeLessThan(RW.BARRIER_H * RW.M * 2.6);
  });

  it('never traps a pad: a bowl that walls it in on every side with no stair possible leaves the walls open', () => {
    const bowl = (x: number, z: number) => 10 + 0.5 * Math.hypot(x, z);
    const tiny: Rect = { x0: -0.2, z0: -0.2, x1: 0.2, z1: 0.2 };
    const p = planPad(tiny, bowl);
    if (p.runs.length) expect(p.barrier === false || p.stairs.length > 0 || p.runs.some(r => r.h.some(v => Math.abs(v) < RW.BARRIER_H))).toBe(true);
  });

  it('a tall wall (2.4 m or more) is flagged', () => {
    expect(planPad(fp, slope(0.1)).tall).toBe(false);
    expect(planPad(fp, slope(0.4)).tall).toBe(true);
  });

  it('leaves no wall where another pad has graded the ground, and none for the kinds a way in must run through', () => {
    const near: Rect = { x0: -0.75, z0: -3.2, x1: 0.75, z1: -1.3 };      // a neighbour's pad right up against the apron
    const p = planPad(fp, slope(0.25), [near]);
    const north = p.runs[0];
    north.pts.forEach(([x], i) => { if (Math.abs(x) < 0.8) expect(north.h[i]).toBe(0); });   // (the wings past the neighbour's pad stay)
    for (const k of ['motor_court', 'gate_garage', 'equipment_yard', 'watchtower_wood', 'rise_lookout', 'bunker_hatch']) expect(WALLLESS.test(k)).toBe(true);
    for (const k of ['farmhouse', 'garden', 'greenhouse', 'timber_cabin']) expect(WALLLESS.test(k)).toBe(false);
  });
});
