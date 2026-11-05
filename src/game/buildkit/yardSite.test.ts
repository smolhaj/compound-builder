import { describe, expect, it } from 'vitest';
import { yardPadHalf, spurGradeOk, YARD_GAPS, YARD_SITE, yardBesideDrive, yardCorners, yardSpur } from './yardSite';
import { distToPolyline, pointAtArc } from '../perimeter/gateKitLayout';
import type { Pt } from '../../sim/perimeter';

const HALF = 1, W = 0.55;
const straight: Pt[] = [[0, 0], [20, 0]];
const diagonal: Pt[] = [[0, 0], [14, 14]];
const bend: Pt[] = [[0, 0], [8, 0], [11, 1], [13, 4], [14, 8], [14, 16]];

describe('yard beside the drive', () => {
  for (const [name, drive] of [['straight', straight], ['diagonal', diagonal]] as const) for (const side of [1, -1] as const) {
    it(`${name} drive, side ${side}: aligned to the road, gate toward it, a gap of clear ground`, () => {
      const mid = drive[1][0] / 2, y = yardBesideDrive(drive, [mid + 0.2, drive[1][1] / 2 + side * 0.3 * (name === 'straight' ? 1 : 0)], HALF, W, side)!;
      expect(y).toBeTruthy();
      // the gate faces the drive: the way from the gate to the road's center line is the yard's front
      const rp = pointAtArc(drive, y.arc), v: Pt = [rp[0] - y.gate[0], rp[1] - y.gate[1]], vl = Math.hypot(v[0], v[1]);
      expect((v[0] * y.front[0] + v[1] * y.front[1]) / vl).toBeGreaterThan(0.999);
      // the yard's sides run parallel to the heading: its front edge is perpendicular to it
      const th = y.rot * Math.PI / 2, side0: Pt = [Math.cos(th), -Math.sin(th)];
      expect(Math.abs(side0[0] * y.heading[0] + side0[1] * y.heading[1])).toBeGreaterThan(0.999);
      // the gate's distance to the road edge is the gap; no corner reaches the roadway
      const dg = distToPolyline(drive, y.gate) - W / 2;
      expect(dg).toBeGreaterThan(YARD_SITE.gap - 0.02);
      // (a diagonal drive pushes the lot out a little: the box its pad is graded as reaches toward the road)
      expect(dg).toBeLessThan(YARD_SITE.gap + (name === 'diagonal' ? 1.5 : 0.1));
      // the graded pad and its skirt never reach the roadway
      const hp = yardPadHalf(y.rot, HALF) + YARD_SITE.pad;
      for (const p of [[y.x - hp, y.z - hp], [y.x + hp, y.z - hp], [y.x - hp, y.z + hp], [y.x + hp, y.z + hp]] as Pt[]) expect(distToPolyline(drive, p) - W / 2).toBeGreaterThanOrEqual(YARD_SITE.skirt - 1e-6);
      for (const c of yardCorners(y.x, y.z, y.rot, HALF)) expect(distToPolyline(drive, c)).toBeGreaterThan(W / 2 + YARD_SITE.edge - 1e-6);
    });
  }
  it('a bend pushes the lot out so no part of the outline reaches the road', () => {
    for (const at of [[9, 3], [12, 3], [12.5, 6], [16, 6]] as Pt[]) {
      const y = yardBesideDrive(bend, at, HALF, W)!;
      const cs = yardCorners(y.x, y.z, y.rot, HALF);
      for (const c of cs) expect(distToPolyline(bend, c)).toBeGreaterThanOrEqual(W / 2 + YARD_SITE.edge - 1e-6);
    }
  });
  it('the turn is a fractional quarter turn on a diagonal and a whole one on an axis road', () => {
    const d = yardBesideDrive(diagonal, [6, 8], HALF, W)!;
    expect(d.rot % 1).toBeGreaterThan(0.01);
    const s = yardBesideDrive(straight, [8, 3], HALF, W)!;
    expect(Math.abs(s.rot - Math.round(s.rot))).toBeLessThan(1e-3);
  });
  it('a bigger setback keeps everything else true, and the spur reaches the road edge', () => {
    for (const gap of YARD_GAPS) for (const drive of [straight, diagonal]) {
      const y = yardBesideDrive(drive, [drive[1][0] / 2, drive[1][1] / 2 + 2], HALF, W, 1, gap)!;
      const sp = yardSpur(drive, y.x, y.z, y.rot, HALF, W);
      expect(distToPolyline(drive, y.gate) - W / 2).toBeGreaterThanOrEqual(gap - 0.02);
      expect(sp).toBeGreaterThanOrEqual(Math.min(2, gap + 0.03) - 0.03);
    }
  });
  it('a spur grades like a farm drive: level ground is fine, a yard above a road cut is not', () => {
    expect(spurGradeOk(0.3, 0.03)).toBe(true);
    expect(spurGradeOk(0.3, -0.12)).toBe(false);
    expect(spurGradeOk(1.6, 0.25)).toBe(true);
    expect(spurGradeOk(0.3, 1.2)).toBe(false);
  });
  it('the pad under a turned yard is the box round it, and a whole turn is the yard itself', () => {
    expect(yardPadHalf(0, 1)).toBeCloseTo(1, 9);
    expect(yardPadHalf(2, 1)).toBeCloseTo(1, 9);
    expect(yardPadHalf(0.5, 1)).toBeCloseTo(Math.SQRT2, 9);
    for (const c of yardCorners(0, 0, 0.37, 1)) expect(Math.max(Math.abs(c[0]), Math.abs(c[1]))).toBeLessThanOrEqual(yardPadHalf(0.37, 1) + 1e-9);
  });
  it('no drive, no site', () => { expect(yardBesideDrive(undefined, [0, 0], HALF, W)).toBeNull(); });
});
