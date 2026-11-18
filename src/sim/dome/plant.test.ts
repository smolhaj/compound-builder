import { describe, expect, it } from 'vitest';
import { plantLayout, plantScale, type Plant } from './plant';
import { FILTERING } from './air';
import { yardGeometry, yardBill, GATE_U } from './plantYard';
import { PLANT_KINDS, placeOf, plantKinds, type PlantKind } from './plantUnits';
import { PERIMETER, runBill } from '../perimeter';

const outside = (p: Plant, r: number) => p.parts.filter(q => !q.onShell && !q.high && Math.hypot(q.x, q.z) > r + 0.01);
const yardBox = (p: Plant, r: number, pad = 1.0) => { const y = p.yard!; return (q: { x: number; z: number }) => { const dx = q.x - y.center[0], dz = q.z - y.center[1]; const t = dx * y.et[0] + dz * y.et[1], v = dx * y.er[0] + dz * y.er[1]; return Math.abs(t) <= y.W / 2 + pad && Math.abs(v) <= y.D / 2 + pad && r > 0; }; };

describe('dome plant layout', () => {
  it('shows more machinery as the ecology gets fuller, never less', () => {
    for (const [tier, r] of [['glass', 6], ['arcology', 15]] as const) {
      let last = 0, lastLamps = 0;
      for (const f of FILTERING) { const p = plantLayout(tier, r, f, { loop: f === 'closed' ? 'recycle' : 'none' }); expect(p.parts.length).toBeGreaterThanOrEqual(last); expect(p.lamps.length).toBeGreaterThanOrEqual(lastLamps); last = p.parts.length; lastLamps = p.lamps.length; }
    }
  });
  it('machinery grows with the dome but is capped, and a bigger dome never gets a smaller plant', () => {
    let last = 0;
    for (const r of [3, 6, 9, 12, 15, 18]) { const s = plantScale(r); expect(s).toBeGreaterThanOrEqual(last); last = s; }
    expect(plantScale(100)).toBeLessThanOrEqual(1.5);
  });
  it('is deterministic', () => { expect(plantLayout('glass', 6, 'closed', { loop: 'recycle' })).toEqual(plantLayout('glass', 6, 'closed', { loop: 'recycle' })); });
  it('puts the roof parts on the shell', () => {
    for (const [tier, r] of [['glass', 6], ['arcology', 9]] as const) for (const q of plantLayout(tier, r, 'closed').parts) if (q.onShell) expect(Math.abs(Math.hypot(q.x, q.z, q.y0) - r)).toBeLessThan(0.05);
  });
});

describe('what stands inside the shell and what stands outside', () => {
  for (const [tier, r] of [['glass', 3.75], ['glass', 6], ['arcology', 9], ['arcology', 15]] as const) {
    it(`${tier} r=${r}: outside the shell there is only the walled yard, and nothing else`, () => {
      const p = plantLayout(tier, r, 'closed', { loop: 'recycle', spares: ['chiller', 'air', 'substation'] });
      const inYard = yardBox(p, r);
      for (const q of outside(p, r)) expect(inYard(q), `${q.unit ?? 'part'} at ${q.x.toFixed(2)},${q.z.toFixed(2)}`).toBe(true);
      // every air-needing unit (the chiller, the cooling tower, the transformers) is in the yard, and nothing else is
      const yardUnits = new Set(outside(p, r).map(q => q.unit).filter(Boolean));
      for (const u of yardUnits) expect(['chiller', 'chiller2', 'substation', 'substation2']).toContain(u);
      for (const kind of ['chiller', 'substation'] as PlantKind[]) expect(p.parts.some(q => q.unit === kind && Math.hypot(q.x, q.z) > r)).toBe(true);
      for (const kind of ['air', 'water', 'battery'] as PlantKind[]) {
        const mine = p.parts.filter(q => q.unit === kind && !q.high);   // (the louver slots are in the band's own face)
        expect(mine.length).toBeGreaterThan(0);
        for (const q of mine) expect(Math.hypot(q.x, q.z)).toBeLessThan(r);
      }
    });
    it(`${tier} r=${r}: the yard sits between two airlocks and clear of them`, () => {
      const y = yardGeometry(tier, r)!;
      const p = plantLayout(tier, r, 'none');
      expect(p.yard!.corners).toEqual(y.corners);
      const locks = Array.from({ length: tier === 'glass' ? 3 : 6 }, (_, i) => i * Math.PI * 2 / (tier === 'glass' ? 3 : 6));
      for (const a of locks) for (const c of y.corners) expect(Math.hypot(c[0] - Math.sin(a) * (r + 0.45), c[1] - Math.cos(a) * (r + 0.45))).toBeGreaterThan(0.6);
    });
  }
  it('the arcology builds its plant into the band: gallery bays on the inside, slots in the outer face, nothing else standing outside the yard', () => {
    const r = 9, p = plantLayout('arcology', r, 'closed', { loop: 'recycle' });
    const gallery = p.parts.filter(q => !q.onShell && !q.high && Math.hypot(q.x, q.z) > r - 0.9 && Math.hypot(q.x, q.z) < r);
    expect(gallery.length).toBeGreaterThan(12);
    expect(p.parts.some(q => q.high && q.unit)).toBe(true);   // louver slots in the band's face
    expect(p.parts.some(q => q.high && Math.hypot(q.x, q.z) > r + 0.1)).toBe(false);   // no rooftop units standing on the band any more
    // every gallery part stands within the band's height
    for (const q of gallery) expect(q.y0 + q.h).toBeLessThan(0.8);
  });
  it('the glass dome keeps its plant yard inside the wall, in spans clear of the airlocks', () => {
    const r = 3.75, p = plantLayout('glass', r, 'closed', { loop: 'recycle' });
    const inside = p.parts.filter(q => q.unit && ['air', 'water', 'battery'].includes(q.unit));
    expect(inside.length).toBeGreaterThan(8);
    for (const q of inside) {
      expect(Math.hypot(q.x, q.z)).toBeLessThan(r);
      for (let i = 0; i < 3; i++) { const a = i * Math.PI * 2 / 3; expect(Math.hypot(q.x - Math.sin(a) * r, q.z - Math.cos(a) * r)).toBeGreaterThan(0.45); }
    }
  });
  it('the layout rules by tier: the yard kinds are the only ones outside, at every size and ecology', () => {
    for (const tier of ['geodesic', 'glass', 'arcology'] as const) for (const k of PLANT_KINDS) {
      const place = placeOf(tier, k);
      if (place === 'yard') { expect(['glass', 'arcology']).toContain(tier); expect(['chiller', 'substation']).toContain(k); }
      if (tier === 'arcology' && !['chiller', 'substation', 'vents'].includes(k)) expect(place).toBe('gallery');
      if (tier === 'geodesic') expect(place).toBe('inside');
    }
    expect(plantKinds('earthen', { filtering: 'closed', loop: 'recycle', spares: [] })).toEqual([]);
  });
  it('a second unit adds the spare in the same place, and nothing else moves', () => {
    const a = plantLayout('arcology', 9, 'advanced', { loop: 'grey' }), b = plantLayout('arcology', 9, 'advanced', { loop: 'grey', spares: ['chiller'] });
    expect(b.parts.length).toBeGreaterThan(a.parts.length);
    expect(b.parts.some(q => q.unit === 'chiller2')).toBe(true);
    expect(a.yard).toEqual(b.yard);
  });
  it('unit spots exist for every unit of the layout', () => {
    const p = plantLayout('arcology', 9, 'closed', { loop: 'recycle', spares: ['air', 'chiller', 'substation'] });
    for (const id of ['chiller', 'chiller2', 'air', 'air2', 'substation', 'substation2', 'water', 'battery', 'vents']) expect(p.units.some(u => u.id === id), id).toBe(true);
  });
});

describe('the hardened yard', () => {
  it('is a closed ring with one gate on the outer wall, and a bigger dome never gets a smaller yard', () => {
    let last = 0;
    for (const r of [3.75, 6, 9, 12, 15]) {
      const y = yardGeometry('arcology', r)!;
      expect(y.length).toBeCloseTo(2 * (y.W + y.D), 6);
      expect(y.gate.at).toBeGreaterThan(y.W + y.D);
      expect(y.gate.at + y.gate.w / 2).toBeLessThan(y.length - y.D);
      expect(y.W * y.D).toBeGreaterThanOrEqual(last * 0.7);
      last = y.W * y.D;
    }
    expect(GATE_U).toBeGreaterThan(0);
  });
  it('has no yard on a geodesic or earthen dome', () => { expect(yardGeometry('geodesic', 3)).toBeNull(); expect(yardGeometry('earthen', 1)).toBeNull(); });
  it('its bill matches the poured-concrete wall table, and a bigger yard never costs less', () => {
    for (const r of [3.75, 9]) {
      const y = yardGeometry('glass', r)!, wall = y.length - y.gate.w, ref = runBill('concrete_wall', wall);
      const b = yardBill('glass', r).bill;
      expect(b.concrete).toBe(ref.concrete); expect(b.rebar).toBe(ref.rebar);
    }
    expect(PERIMETER.concrete_wall.materials.concrete).toBe(9);
    expect(yardBill('arcology', 15).hours).toBeGreaterThanOrEqual(yardBill('arcology', 9).hours);
    expect(yardBill('geodesic', 3).hours).toBe(0);
  });
});
