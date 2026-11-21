import { describe, expect, it } from 'vitest';
import { DOME_TIERS, DOME_KIND, TIER, parseDomeKind, tierOfKind, cellsOfKind, kindOfCells, clampCells, sizesOf, shellFt } from './tiers';
import { domeCost } from './cost';
import { domeGeometry } from './geometry';
import { domeSiteReport, siteSummary } from './siting';
import { domeFrom, airlocksOf } from './standing';
import { entryR } from './vehiclePort';
import { vestibuleOf, chamberColliders, chamberRho, wallBoxes, chamberPoint, ringSkipped } from './vestibule';
import { BLUEPRINTS, totalBill } from '../blueprints';
import { PERMIT_FEE, needsPermit } from '../paperwork';
import { domeBlueprint } from './blueprints';
import { panelSpot, awayFromAirlocks, PANEL_CLEARANCE } from './siege';
import type { Structure } from '../state';

describe('the diameter handle: sized kinds', () => {
  it('the default size keeps the plain id; others carry their size; the range is clamped', () => {
    for (const t of DOME_TIERS) {
      expect(kindOfCells(t, TIER[t].cells)).toBe(DOME_KIND[t]);
      expect(cellsOfKind(DOME_KIND[t])).toBe(TIER[t].cells);
      expect(clampCells(t, 1)).toBe(TIER[t].minCells);
      expect(clampCells(t, 999)).toBe(TIER[t].maxCells);
      for (const c of sizesOf(t)) { const k = kindOfCells(t, c); expect(tierOfKind(k)).toBe(t); expect(cellsOfKind(k)).toBe(c); }
    }
    expect(parseDomeKind('dome_geodesic_9')).toMatchObject({ tier: 'geodesic', cells: 9 });
    expect(parseDomeKind('dome_geodesic_x')).toBeNull();
    expect(parseDomeKind('barn_9')).toBeNull();
  });
  it('every tier\'s default lies inside its range', () => {
    for (const t of DOME_TIERS) { expect(TIER[t].minCells).toBeLessThanOrEqual(TIER[t].cells); expect(TIER[t].cells).toBeLessThanOrEqual(TIER[t].maxCells); }
  });
  it('price, labor hours, air and the bill grow with the diameter; the default size is unchanged', () => {
    for (const t of DOME_TIERS) {
      let prev = domeCost(t, TIER[t].minCells);
      for (const c of sizesOf(t).slice(1)) { const cur = domeCost(t, c); expect(cur.totalUsd).toBeGreaterThanOrEqual(prev.totalUsd); expect(cur.hours).toBeGreaterThanOrEqual(prev.hours); prev = cur; }
      expect(domeGeometry(t, shellFt(t, TIER[t].maxCells)).volumeCf).toBeGreaterThan(domeGeometry(t, shellFt(t, TIER[t].minCells)).volumeCf);
      expect(domeCost(t).totalUsd).toBe(domeCost(t, TIER[t].cells).totalUsd);
    }
  });
  it('the blueprint of a sized kind is priced at that size, and the permit follows its size (about 1 percent of the build, never under the tier\'s flat fee; was a flat fee per tier before the pricing follow-ups)', () => {
    const k = kindOfCells('geodesic', 10), bp = BLUEPRINTS[k];
    expect(bp).toBeDefined();
    expect(bp.kind).toBe(k);
    expect(totalBill(bp)).toEqual(totalBill(domeBlueprint('geodesic', 10)));
    expect(totalBill(BLUEPRINTS.dome_geodesic)).toEqual(totalBill(domeBlueprint('geodesic')));
    expect(needsPermit(k)).toBe(true);
    expect(PERMIT_FEE[k]).toBeGreaterThanOrEqual(TIER.geodesic.permitFee); expect(PERMIT_FEE[k]).toBe(domeCost('geodesic', 10).permitUsd);
    expect(BLUEPRINTS['dome_geodesic_99']).toBeUndefined();   // outside the range
    expect(Object.keys(BLUEPRINTS).filter(x => x.startsWith('dome_'))).toHaveLength(4);   // enumeration lists only the base kinds
  });
  it('a standing dome reads its size from its kind', () => {
    const st = (kind: string): Structure => ({ id: 's', kind, x: 5, z: 5, rot: 0, stage: 5, done: 0, supplied: true, finishedAt: 0 });
    const small = domeFrom(st(kindOfCells('glass', 10)))!, big = domeFrom(st(kindOfCells('glass', 24)))!, def = domeFrom(st('dome_glass'))!;
    expect(small.r).toBeLessThan(def.r); expect(def.r).toBeLessThan(big.r);
    expect(def.r).toBeCloseTo(shellFt('glass', 15) / 2 / 20 - 0.03, 6);
  });
});

describe('the circle ghost report', () => {
  const owned = (x: number, z: number) => x >= 0 && x <= 20 && z >= 0 && z <= 20;
  it('open ground, trees cleared, a building covered, one cut by the wall, and the line', () => {
    const c = { x: 10, z: 10, r: 3 };
    const r = domeSiteReport(c, owned, [{ id: 'a', kind: 'garden', rect: { x0: 9, z0: 9, x1: 11, z1: 11 } }, { id: 'b', kind: 'barn', rect: { x0: 12, z0: 9, x1: 14, z1: 11 } }, { id: 'c', kind: 'barn', rect: { x0: 18, z0: 18, x1: 19, z1: 19 } }], [[10, 12], [10, 13.5], [18, 10]]);
    expect(r.off).toBeNull(); expect(r.inside).toEqual(['a']); expect(r.straddles).toEqual(['b']); expect(r.cleared).toHaveLength(2);   // (3.5 is inside r + the 0.6 clearing margin)
    expect(r.ringOwned.every(Boolean)).toBe(true);
    expect(siteSummary(r)).toMatch(/cut through a building/);
  });
  it('a circle across the line is off the land, and the ring says where', () => {
    const r = domeSiteReport({ x: 2, z: 10, r: 4 }, owned, [], []);
    expect(r.off).not.toBeNull(); expect(r.ringOwned.some(o => !o)).toBe(true); expect(r.ringOwned.some(o => o)).toBe(true);
    expect(siteSummary(r)).toMatch(/outside your land/);
    expect(siteSummary(domeSiteReport({ x: 10, z: 10, r: 3 }, owned, [], []), { diameterFt: 60 })).toBe('60 ft: open ground');
  });
});

describe('the airlock chamber', () => {
  it('a small dome shortens its chamber, never longer than a third of the radius', () => {
    for (const t of ['geodesic', 'glass', 'arcology'] as const) {
      const big = vestibuleOf(t, 20), small = vestibuleOf(t, TIER[t].minCells * 0.25);
      expect(small.len).toBeLessThanOrEqual(big.len);
      expect(small.dw).toBeGreaterThan(0.12);   // a door a person fits through (a body is about 0.06 wide)
      expect(big.dw).toBeLessThan(big.cw);
    }
  });
  it('the door is a person\'s height: 0.28 tall folk, door 0.3 or more', () => {
    for (const t of ['geodesic', 'glass', 'arcology'] as const) expect(vestibuleOf(t, 3).dh).toBeGreaterThanOrEqual(0.3);
  });
  it('the chamber is hollow: the floor between the doors has no collider, the walls and jambs do', () => {
    for (const t of ['geodesic', 'glass', 'arcology'] as const) {
      const r = 3, v = vestibuleOf(t, r), boxes = chamberColliders(r, 0.7, v), { outer, inner } = chamberRho(r, v);
      const hit = (x: number, z: number) => boxes.some(b => x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1);
      for (let k = 0; k <= 10; k++) for (const lam of [-v.dw / 2 + 0.03, 0, v.dw / 2 - 0.03]) { const [x, z] = chamberPoint(0.7, inner + (outer - inner) * k / 10, lam); expect(hit(x, z)).toBe(false); }
      for (const s of [-1, 1]) { const [x, z] = chamberPoint(0.7, (outer + inner) / 2, s * (v.cw / 2 + v.t / 2)); expect(hit(x, z)).toBe(true); for (const rho of [inner, outer]) { const [jx, jz] = chamberPoint(0.7, rho, s * (v.dw / 2 + 0.03)); expect(hit(jx, jz)).toBe(true); } }
    }
  });
  it('the airlock\'s outer door lies on the radius and its inner door a chamber\'s length in', () => {
    const [a] = airlocksOf('glass', 0, 0, 3, 0), v = vestibuleOf('glass', 3);
    const rc = a.off ? entryR('glass', 3) : 3;      // (a person chamber in the entrance module stands beside the port: its doors are in the module's plane)
    expect(Math.hypot(a.x, a.z - 0) ** 2 - (a.off ?? 0) ** 2).toBeCloseTo(rc * rc, 6); expect(Math.hypot(a.inX, a.inZ) ** 2 - (a.off ?? 0) ** 2).toBeCloseTo((rc - v.len) ** 2, 6);
    expect(a.dw).toBeCloseTo(v.dw, 6);
  });
  it('wall boxes cover a slanted wall end to end', () => {
    const bs = wallBoxes(0, 0, 1, 1, 0.03);
    for (let k = 0; k <= 20; k++) { const x = k / 20; expect(bs.some(b => x >= b.x0 && x <= b.x1 && x >= b.z0 && x <= b.z1)).toBe(true); }
  });
  it('the shell ring leaves a gap at the airlock and nowhere else', () => {
    const v = vestibuleOf('glass', 3.7);
    expect(ringSkipped(0.01, 3.7, 0, v, 0.02)).toBe(true);
    expect(ringSkipped(0.5, 3.7, 0, v, 0.02)).toBe(false);
  });
});

describe('where a lost panel sits', () => {
  const dome = (tier: 'geodesic' | 'glass' | 'arcology') => { const st: Structure = { id: 'd', kind: DOME_KIND[tier], x: 20, z: 20, rot: 0, stage: 5, done: 0, supplied: true, finishedAt: 0 }; return domeFrom(st)!; };
  it('a stray-round panel is never beside an airlock, and the next one does not stack on it', () => {
    for (const t of ['geodesic', 'glass', 'arcology'] as const) {
      const d = dome(t), seen: number[] = [];
      for (let k = 0; k < d.airlocks.length * 2; k++) {
        const s = panelSpot(d, k);
        expect(Math.hypot(s.x - d.x, s.z - d.z)).toBeCloseTo(d.r, 6);
        for (const a of d.airlocks) expect(Math.hypot(s.x - a.x, s.z - a.z)).toBeGreaterThan(PANEL_CLEARANCE * 0.99 * Math.min(1, d.r / 2));
        seen.push(s.angle);
      }
      expect(new Set(seen.slice(0, d.airlocks.length).map(a => a.toFixed(3))).size).toBeGreaterThanOrEqual(d.airlocks.length - 1);   // (the vehicle port's wide lane takes one mid-gap out of the pool)
    }
  });
  it('a hole a raid made beside an airlock is moved along the shell to clear it, and one already clear stays', () => {
    const d = dome('glass'), a = d.airlocks[0], near = awayFromAirlocks(d, a.x + 0.2, a.z);
    expect(near.moved).toBe(true);
    for (const l of d.airlocks) expect(Math.hypot(near.x - l.x, near.z - l.z)).toBeGreaterThan(PANEL_CLEARANCE * 0.95);
    const s = panelSpot(d, 0), same = awayFromAirlocks(d, s.x, s.z);
    expect(same.moved).toBe(false); expect(same.x).toBe(s.x);
  });
});
