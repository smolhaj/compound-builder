import { describe, expect, it } from 'vitest';
import { RegionalField, regionKindFor, townSpecFor, TOWN_Y, UNDER_TOWN_Y, RAMP, type RegionKind } from './regionalLandscape';
import { coastColumns, coastSection, coastSpec, coastSurfaceY, SEA_Y, BEACH_Y } from './coastline';

const field = (kind: RegionKind, cW = 40, cH = 40) => new RegionalField({ kind, cW, cH, townExt: townSpecFor(kind).ext });

describe('regionKindFor / townSpecFor', () => {
  it('maps every location to its landscape', () => {
    expect(regionKindFor('mountain_west')).toBe('mountain');
    expect(regionKindFor('southern_california')).toBe('coast');
    expect(regionKindFor('pacific_northwest')).toBe('sound');
    expect(regionKindFor('new_england')).toBe('drumlin');
    expect(regionKindFor('midwest_plains')).toBe('plains');
    expect(regionKindFor('deep_south')).toBe('bayou');
    expect(regionKindFor('mountain_west', true)).toBe('city');
  });
  it('gives skyscrapers only to the big city', () => {
    for (const k of ['mountain', 'coast', 'sound', 'drumlin', 'plains', 'bayou'] as RegionKind[]) {
      expect(townSpecFor(k).towers).toBe(false);
      expect(townSpecFor(k).ext).toBeLessThan(townSpecFor('city').ext);
    }
    expect(townSpecFor('city').towers).toBe(true);
  });
});

describe('RegionalField', () => {
  it('is the flat town ground inside the town (streets are never buried)', () => {
    for (const k of ['mountain', 'coast', 'sound', 'drumlin', 'plains', 'bayou', 'city', 'appalachia', 'desert', 'north_woods', 'upper_midwest'] as RegionKind[]) {
      const f = field(k);
      const ext = townSpecFor(k).ext;
      for (let i = 0; i < 200; i++) {
        const a = (i / 200) * Math.PI * 2;
        const x = 20 + Math.cos(a) * (20 + ext), z = 20 + Math.sin(a) * (20 + ext);
        expect(f.height(x, z)).toBeCloseTo(UNDER_TOWN_Y, 9);   // flat town ground
      }
    }
  });

  it('Mountain West: real mountain ranges rise to the west, the plains stay gentle to the east', () => {
    const f = field('mountain');
    let westMax = 0;
    for (let z = -800; z <= 800; z += 40) for (let x = -1400; x <= -500; x += 40) westMax = Math.max(westMax, f.height(x, z) - TOWN_Y);
    let eastMax = 0;
    for (let z = -400; z <= 400; z += 40) for (let x = 250; x <= 900; x += 40) eastMax = Math.max(eastMax, f.height(x, z) - TOWN_Y);
    expect(westMax).toBeGreaterThan(250);   // > 1.5 km of relief
    expect(eastMax).toBeLessThan(12);       // high plains roll by tens of meters
  });

  it('keeps slopes within reason near the town edge (no wall where the hills start)', () => {
    for (const k of ['mountain', 'drumlin', 'sound', 'coast', 'appalachia', 'desert', 'north_woods', 'upper_midwest'] as RegionKind[]) {
      const f = field(k);
      const edge = f.edge;
      for (let i = 0; i < 120; i++) {
        const a = (i / 120) * Math.PI * 2;
        for (let r = edge; r < edge + RAMP; r += 4) {
          const x = 20 + Math.cos(a) * (20 + r), z = 20 + Math.sin(a) * (20 + r);
          const g = Math.hypot(f.height(x + 1, z) - f.height(x - 1, z), f.height(x, z + 1) - f.height(x, z - 1)) / 2;
          expect(g).toBeLessThan(1.2); // < ~50°
        }
      }
    }
  });

  it('carves water only in low ground, well clear of the town', () => {
    for (const k of ['mountain', 'sound', 'drumlin', 'plains', 'bayou', 'appalachia', 'north_woods', 'upper_midwest'] as RegionKind[]) {
      const f = field(k);
      let wet = 0;
      for (let x = -900; x <= 900; x += 15) for (let z = -900; z <= 900; z += 15) {
        if (f.height(x, z) < (f.waterY ?? -1e9)) {
          wet++;
          expect(f.rectDist(x, z)).toBeGreaterThan(f.edge + RAMP * 0.5);
        }
      }
      expect(wet).toBeGreaterThan(0);
    }
  });
});

describe('Compound Builder regions', () => {
  const relief = (k: RegionKind) => {
    const f = field(k);
    let lo = Infinity, hi = -Infinity, wood = 0, n = 0;
    for (let x = -700; x <= 700; x += 20) for (let z = -700; z <= 700; z += 20) {
      if (f.rectDist(x, z) < 250) continue;
      const s = f.sample(x, z); lo = Math.min(lo, s.h); hi = Math.max(hi, s.h); n++; if (s.forest > 0.5) wood++;
    }
    return { range: hi - lo, wood: wood / n };
  };
  it('Appalachia is steep and wooded, the Plains flat and open, the desert bare with mesas, the North Woods low and wooded', () => {
    const ap = relief('appalachia'), pl = relief('plains'), de = relief('desert'), nw = relief('north_woods'), um = relief('upper_midwest');
    expect(ap.range).toBeGreaterThan(40);          // ridges 250 m+ over the hollows
    expect(ap.wood).toBeGreaterThan(0.6);
    expect(pl.wood).toBeLessThan(0.25);
    expect(de.range).toBeGreaterThan(20);          // mesas 120 m+
    expect(de.wood).toBeLessThan(0.3);
    expect(nw.range).toBeLessThan(ap.range);
    expect(nw.wood).toBeGreaterThan(0.55);
    expect(um.wood).toBeGreaterThan(0.1);
    expect(um.wood).toBeLessThan(0.6);
  });
  it('the desert has no open water', () => {
    expect(field('desert').waterY).toBeNull();
  });
});

describe('coastline', () => {
  const c = coastSpec(4, 2, 20);
  it('keeps the bluff crest on the parcel side and a real beach below it', () => {
    for (let z = -700; z <= 740; z += 1.7) {
      const s = coastSection(z, c);
      expect(s.xt).toBeLessThanOrEqual(c.coastW + 1e-9);
      expect(s.xf).toBeLessThan(s.xt);
      expect(s.xf - s.xs).toBeGreaterThan(0.5);
    }
  });
  it('lot band: the waterline stays in the ocean / beach strip', () => {
    for (let z = 0; z <= c.cH; z += 0.5) {
      const s = coastSection(z, c);
      expect(s.xs).toBeGreaterThan(c.oceanX - 3);
      expect(s.xt).toBeGreaterThan(c.coastW - 2);
    }
  });
  it('the shoreline is curved, not ruled', () => {
    const xs: number[] = [];
    for (let z = -400; z <= 440; z += 10) xs.push(coastSection(z, c).xs);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(15);
  });
  it('surface is continuous across the section and monotonic from sea to crest', () => {
    for (let z = -50; z <= 90; z += 3.3) {
      const cols = coastColumns(z, c);
      for (let i = 1; i < cols.length; i++) expect(cols[i].x).toBeGreaterThanOrEqual(cols[i - 1].x);
      const s = coastSection(z, c);
      expect(coastSurfaceY(s.xs, z, c)).toBeCloseTo(SEA_Y, 5);
      expect(coastSurfaceY(s.xf, z, c)).toBeCloseTo(BEACH_Y, 5);
    }
  });
});
