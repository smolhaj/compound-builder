import { describe, expect, it } from 'vitest';
import { facadeKind, houseSpec, pickHouseStyle, pickWeighted, SHUTTER_CODES, STYLE_WEIGHTS, YARD_SPECS, type HouseRegion } from './houseStyles';

const REGIONS: HouseRegion[] = ['city', 'drumlin', 'plains', 'bayou', 'sound', 'mountain', 'coast'];
const rolls = Array.from({ length: 400 }, (_, i) => (i + 0.5) / 400);

describe('regional house styles', () => {
  it('every region has a non-empty style mix with positive weights', () => {
    for (const r of REGIONS) {
      const w = Object.values(STYLE_WEIGHTS[r]);
      expect(w.length, r).toBeGreaterThan(0);
      expect(w.every(v => v > 0), r).toBe(true);
      const seen = new Set(rolls.map(t => pickHouseStyle(r, t)));
      expect([...seen].sort()).toEqual(Object.keys(STYLE_WEIGHTS[r]).sort());
    }
  });

  it('Southern California never yields shutters or clapboard-with-shutters', () => {
    for (const t of rolls) {
      const style = pickHouseStyle('coast', t);
      expect(style).not.toBe('traditional');
      for (const t2 of [0.01, 0.3, 0.5, 0.7, 0.99]) {
        const spec = houseSpec(style, 'coast', t2);
        expect(spec.shutters, style).toBe(false);
        const k = facadeKind(spec);
        expect(SHUTTER_CODES.includes(k), `${style} code ${k}`).toBe(false);
        expect(spec.siding === 'lap' && spec.shutters).toBe(false);
      }
    }
  });

  it('SoCal mixes Spanish revival, Craftsman and mid-century ranches; red tile on most', () => {
    const n: Record<string, number> = {};
    let tile = 0;
    for (const t of rolls) {
      const s = pickHouseStyle('coast', t);
      n[s] = (n[s] ?? 0) + 1;
      if (houseSpec(s, 'coast', (t * 7.31) % 1).roofMat === 'tile') tile++;
    }
    expect(n.spanish).toBeGreaterThan(n.midcentury);
    expect(n.craftsman).toBeGreaterThan(0);
    expect(tile / rolls.length).toBeGreaterThan(0.5);
  });

  it('new styles never draw shutters anywhere; traditional keeps them', () => {
    for (const r of REGIONS) for (const t of rolls) {
      const s = pickHouseStyle(r, t);
      const spec = houseSpec(s, r, t);
      if (s !== 'traditional') expect(spec.shutters, `${r}/${s}`).toBe(false);
    }
    expect(facadeKind(houseSpec('traditional', 'drumlin', 0.5))).toBe(1);
  });

  it('PNW and Mountain West styles carry their materials', () => {
    const pnw = rolls.map(t => houseSpec(pickHouseStyle('sound', t), 'sound', t));
    expect(pnw.some(s => s.siding === 'shingle')).toBe(true);
    expect(pnw.some(s => s.siding === 'board_batten')).toBe(true);
    expect(pnw.some(s => s.roofMat === 'moss')).toBe(true);
    const mtn = rolls.map(t => houseSpec(pickHouseStyle('mountain', t), 'mountain', t));
    expect(mtn.some(s => s.siding === 'log')).toBe(true);
    expect(mtn.every(s => s.roofMat === 'metal' && s.stoneChimney)).toBe(true);
  });

  it('yard specs: weighted picks stay inside their tables', () => {
    for (const [r, y] of Object.entries(YARD_SPECS)) {
      for (const t of rolls) {
        expect(Object.keys(y!.trees)).toContain(pickWeighted(y!.trees, t));
        expect(Object.keys(y!.fences)).toContain(pickWeighted(y!.fences, t));
      }
      expect(r).toBeTruthy();
    }
    expect(YARD_SPECS.coast!.fences).toEqual({ block: 1 });
    expect(Object.keys(YARD_SPECS.bayou!.trees)).toEqual(expect.arrayContaining(['crepe', 'magnolia']));
  });
});
