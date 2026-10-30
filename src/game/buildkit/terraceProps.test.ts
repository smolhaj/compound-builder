import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';

// materials paint canvases (no DOM in tests): plain materials stand in
vi.mock('./materials', () => ({ kitMaterial: () => new THREE.MeshStandardMaterial(), setWindowGlow: () => {} }));
import { KIT, PROBLEM_TEXT, climbOf, placementProblem, type SiteQuery } from './kit';
import { buildLayers } from './buildings';
import { RISER, stepsFor, treadHeight } from './terraceProps';
import { BLUEPRINTS } from '../../sim/blueprints';
import { padClash } from './padRules';

const site = (h: (x: number, z: number) => number): SiteQuery => ({ height: h, owned: () => true, water: () => false });
/** A hill that climbs `k` per unit along +z. */
const slopeZ = (k: number) => (_x: number, z: number): number => k * z;
const slopeX = (k: number) => (x: number): number => k * x;

describe('stairs and ramps between terraces', () => {
  it('are in the kit with a bill and a place in the build menu data', () => {
    for (const id of ['terrace_stair', 'terrace_ramp']) { expect(KIT[id]).toBeTruthy(); expect(BLUEPRINTS[id].stages.length).toBe(5); expect(KIT[id].climbs).toBeTruthy(); }
  });

  it('climbOf reads the rise along the piece and flips with a half turn', () => {
    const d = KIT.terrace_stair;
    const up = climbOf(d, 0, 0, 0, slopeZ(0.2));      // the +z end is 2 cells (1 u) further up
    expect(up.rise).toBeCloseTo(0.2, 2);
    const flipped = climbOf(d, 0, 0, 2, slopeZ(0.2));
    expect(flipped.rise).toBeCloseTo(-0.2, 2);
    expect(climbOf(d, 0, 0, 1, slopeZ(0.2)).rise).toBeCloseTo(0, 2);   // turned across the slope: no rise along it
    expect(climbOf(d, 0, 0, 1, slopeZ(0.2)).cross).toBeGreaterThan(0.15);
    expect(up.low).toBeCloseTo(-0.1, 2);
  });

  it('a stair is refused on level ground, across the slope, and on a cliff; allowed on a good hill', () => {
    const d = KIT.terrace_stair;
    expect(placementProblem(d, 0, 0, 0, site(() => 0), [])).toBe('no_climb');
    expect(placementProblem(d, 0, 0, 0, site(slopeZ(0.2)), [])).toBeNull();
    expect(placementProblem(d, 0, 0, 1, site(slopeZ(0.2)), [])).toBe('no_climb');          // turned so the slope is across it, no climb along it
    expect(placementProblem(d, 0, 0, 0, site((x, z) => 0.2 * z + 0.6 * x), [])).toBe('cross_slope');
    expect(placementProblem(d, 0, 0, 0, site(slopeZ(1.0)), [])).toBe('too_much_climb');
    for (const k of ['no_climb', 'too_much_climb', 'cross_slope'] as const) expect(PROBLEM_TEXT[k].length).toBeGreaterThan(20);
  });

  it('a ramp takes a gentler hill than a stair', () => {
    const r = KIT.terrace_ramp;
    expect(placementProblem(r, 0, 0, 0, site(slopeZ(0.05)), [])).toBeNull();                 // 4 cells = 2 u long: rises 0.1
    expect(placementProblem(r, 0, 0, 0, site(slopeZ(0.25)), [])).toBe('too_much_climb');     // rises 0.5
    expect(placementProblem(KIT.terrace_stair, 0, 0, 0, site(slopeZ(0.25)), [])).toBeNull();
  });

  it('they leave the pads alone: no clash with a house beside them', () => {
    expect(padClash(KIT.terrace_stair, 1.8, 0, 0, slopeX(0.5), [{ id: 'a', kind: 'timber_cabin', x: 0, z: 0, rot: 0 }])).toBeNull();
    expect(padClash(KIT.timber_cabin, 1.8, 0, 0, slopeX(0.5), [{ id: 's', kind: 'terrace_stair', x: 0, z: 0, rot: 0 }])).toBeNull();
  });

  it('the stair has one riser per 27 cm of rise, stands on the ground and tops out at the rise', () => {
    for (const rise of [0.09, 0.3, 0.55]) {
      const g = buildLayers(KIT.terrace_stair, 3, { rise });
      const box = new THREE.Box3().setFromObject(g);
      expect(stepsFor(rise)).toBe(Math.max(2, Math.round(rise / RISER)));
      // the highest tread is the rise (the handrail stands above it)
      let treadTop = 0;
      g.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh && m.name.includes('foundation_fieldstone')) treadTop = Math.max(treadTop, new THREE.Box3().setFromObject(m).max.y); });
      expect(treadTop).toBeCloseTo(rise, 1);
      expect(box.min.y).toBeLessThan(0.001);                              // sunk into the hill, never floating
      expect(box.max.y).toBeGreaterThanOrEqual(rise);
    }
  });

  it('a descending piece (negative rise) is the same stair turned: its high end is at -z', () => {
    const g = buildLayers(KIT.terrace_stair, 3, { rise: -0.3 });
    let hi = -Infinity, atZ = 0;
    g.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh && m.name.includes('foundation_fieldstone')) { const pos = m.geometry.getAttribute('position'); for (let i = 0; i < pos.count; i++) if (pos.getY(i) > hi + 1e-6) { hi = pos.getY(i); atZ = pos.getZ(i); } } });
    expect(hi).toBeCloseTo(0.3, 1);
    expect(atZ).toBeLessThan(0);
  });

  it('walking height follows the steps (stair) and the grade (ramp), and is zero at the low end', () => {
    const D = KIT.terrace_stair.cellsZ * 0.5;
    expect(treadHeight('terrace_stair', 0.3, D, -D / 2 - 0.01)).toBe(0);
    expect(treadHeight('terrace_stair', 0.3, D, D / 2 - 0.001)).toBeCloseTo(0.3, 2);
    const mid = treadHeight('terrace_stair', 0.3, D, 0);
    expect(mid).toBeGreaterThan(0.1); expect(mid).toBeLessThan(0.25);
    const Dr = KIT.terrace_ramp.cellsZ * 0.5;
    expect(treadHeight('terrace_ramp', 0.1, Dr, 0)).toBeCloseTo(0.05, 3);
    expect(treadHeight('terrace_stair', -0.3, D, -D / 2 + 0.001)).toBeCloseTo(0.3, 2);   // descending: the high end is at -z
  });

  it('the ramp builds, with a rail only on a long climb, and finishes in the construction layers', () => {
    const g = buildLayers(KIT.terrace_ramp, 5, { rise: 0.15 });
    const layers = new Set<string>(); g.traverse(o => { const l = (o as THREE.Mesh).userData?.layer; if (l) layers.add(l); });
    expect(layers.has('foundation')).toBe(true); expect(layers.has('frame')).toBe(true); expect(layers.has('roof')).toBe(true);
    const flat = buildLayers(KIT.terrace_ramp, 5, { rise: 0.04 });
    const rails = (gg: THREE.Group) => { let n = 0; gg.traverse(o => { if ((o as THREE.Mesh).userData?.layer === 'roof') n++; }); return n; };
    expect(rails(g)).toBeGreaterThan(0); expect(rails(flat)).toBe(0);
  });
});
