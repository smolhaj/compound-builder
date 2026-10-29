import { describe, expect, it } from 'vitest';
import { LAKE_Y, LOT_KINDS, lotField, lotStats, profileLine, treeLineM, type LotKind, type LotSpec } from './lots';
import { HOME_RECT } from './site';

const RECT = HOME_RECT[40];
const spec = (kind: LotKind, seed: number, relief = 8, over: Partial<LotSpec> = {}): LotSpec => ({ kind, seed, relief, outlier: false, elevM: 2000, flip: seed % 2 ? 1 : -1, creek: kind === 'hillside' && seed % 3 === 0, ...over });
const SEEDS = Array.from({ length: 12 }, (_, i) => i + 1);

describe('lot archetypes: the ground', { timeout: 60_000 }, () => {
  it('is deterministic per seed, and differs between seeds', () => {
    for (const k of LOT_KINDS) {
      const a = lotField(spec(k, 4), RECT), b = lotField(spec(k, 4), RECT), c = lotField(spec(k, 5), RECT);
      let diff = 0;
      for (let i = 0; i < 40; i++) {
        const x = (i * 7.3) % 67, z = (i * 13.1) % 67;
        expect(a.h(x, z)).toBe(b.h(x, z));
        diff += Math.abs(a.h(x, z) - c.h(x, z));
      }
      expect(diff, k).toBeGreaterThan(0.5);
    }
  });

  it('every kind gives finite ground everywhere, with no cliff taller than the heightfield can draw', () => {
    for (const k of LOT_KINDS) for (const seed of SEEDS.slice(0, 6)) for (const outlier of [false, true]) {
      if (outlier && (k === 'hillside' || k === 'bench' || k === 'island' || k === 'saddle')) continue;
      const relief = outlier ? 30 : 5 + (seed % 9), f = lotField(spec(k, seed, relief, { outlier }), RECT);
      let worst = 0, lo = Infinity, hi = -Infinity, bad = 0;
      for (let x = -75; x <= 140; x += 3) for (let z = -40; z <= 110; z += 3) {
        const h = f.h(x, z);
        if (!Number.isFinite(h)) bad++;
        lo = Math.min(lo, h); hi = Math.max(hi, h);
        worst = Math.max(worst, Math.abs(f.h(x + 0.5, z) - h), Math.abs(f.h(x, z + 0.5) - h));
      }
      expect(bad, `${k} ${seed}`).toBe(0);
      expect(lo).toBeGreaterThan(-5);
      expect(hi).toBeLessThan(140);
      // a step of half a unit (3 m) never climbs more than 2.5 units (15 m: a sheer face)
      expect(worst, `${k} ${seed} outlier=${outlier}`).toBeLessThan(2.5);
    }
  }, 120_000);

  it('relief matches the listing: 30-80 m typical, 150-300 m for the outliers', () => {
    for (const k of LOT_KINDS) for (const seed of SEEDS) {
      const relief = 5 + (seed % 9), s = lotStats(lotField(spec(k, seed, relief), RECT));
      expect(s.dropM, `${k} ${seed}`).toBeGreaterThan(relief * 6 * 0.4);
      expect(s.dropM, `${k} ${seed}`).toBeLessThan(relief * 6 * 2.7);
    }
    for (const k of ['gorge', 'mesa', 'bluff'] as LotKind[]) for (const seed of [1, 2, 3, 4]) {
      const s = lotStats(lotField(spec(k, seed, 28 + seed * 4, { outlier: true }), RECT));
      expect(s.dropM, `${k} ${seed}`).toBeGreaterThan(130);
    }
  });

  it('keeps flat ground to build on: pads are scarce but not absent', () => {
    for (const k of LOT_KINDS) {
      const runs = SEEDS.map(seed => lotStats(lotField(spec(k, seed, 5 + (seed % 9)), RECT)));
      const mean = runs.reduce((a, s) => a + s.padFrac, 0) / runs.length;
      expect(mean, k).toBeGreaterThan(0.07);
      expect(mean, k).toBeLessThan(0.8);
      // most listings have a pad big enough for a house and a yard (450 m²)
      expect(runs.filter(s => s.padM2 >= 450).length, k).toBeGreaterThanOrEqual(Math.floor(SEEDS.length * 0.75));
    }
  });

  it('a creek never runs uphill, and always runs below the ground beside it', () => {
    for (const k of ['hillside', 'bench', 'gorge'] as LotKind[]) for (const seed of SEEDS) {
      const f = lotField(spec(k, seed, 8, { creek: true, flip: 1 }), RECT);
      if (!f.creek) { expect(k).toBe('hillside'); continue; }
      let prev = Infinity;
      for (let x = -70; x <= 140; x += 1) {
        const bed = f.creek.bedY(x);
        expect(bed, `${k} ${seed} x=${x}`).toBeLessThanOrEqual(prev + 1e-9);
        prev = bed;
        if (x >= RECT.x0 && x <= RECT.x1) expect(f.h(x, f.creek.zAt(x)), `${k} ${seed} ground over bed`).toBeGreaterThanOrEqual(bed - 0.05);
      }
    }
  });

  it('the bench lies above the river, flat, with a bank between', () => {
    for (const seed of SEEDS) {
      const f = lotField(spec('bench', seed, 8), RECT), c = f.creek!, sg = f.spec.flip;
      const q = (d: number) => f.h(33, c.zAt(33) + sg * d);
      expect(q(0.5) - c.bedY(33), 'floodplain').toBeLessThan(1);
      const benchH = q(22);
      expect(benchH - q(0.5), 'bank rises').toBeGreaterThan(8 * 0.65 * 0.7);
      // flat across the bench
      expect(Math.abs(q(24) - q(20))).toBeLessThan(0.7);
    }
  });

  it('the gorge floor is far below the rims', () => {
    for (const seed of SEEDS) {
      const D = 8, f = lotField(spec('gorge', seed, D), RECT), c = f.creek!, z = c.zAt(33);
      const floor = f.h(33, z), rimN = f.h(33, z - 28), rimS = f.h(33, z + 28);
      expect(Math.min(rimN, rimS) - floor, `${seed}`).toBeGreaterThan(D * 0.8);
    }
  });

  it('the mesa has a flat top and a way up from the road; the butte has none', () => {
    for (const seed of SEEDS) {
      const s = lotStats(lotField(spec('mesa', seed, 9), RECT));
      expect(s.accessMaxPct, `${seed}`).toBeLessThan(26);
      expect(s.padFrac).toBeGreaterThan(0.12);
    }
    const butte = lotStats(lotField(spec('mesa', 3, 36, { outlier: true }), RECT));
    expect(butte.cliffFrac).toBeGreaterThan(0.04);
  });

  it('the island is dry, reached by a causeway that is above water, and surrounded by it', () => {
    for (const acres of [5, 20, 40, 80] as const) for (const seed of SEEDS) {
      const rect = HOME_RECT[acres], f = lotField(spec('island', seed, 8), rect);
      expect(f.lake?.y).toBe(LAKE_Y);
      const [hx, hz] = f.homeSpot!;
      expect(f.h(hx, hz), `${acres} ${seed} home`).toBeGreaterThan(LAKE_Y + 0.5);
      for (const [px, pz] of f.causeway!.pts) expect(f.h(px, pz), `${acres} ${seed} causeway`).toBeGreaterThan(LAKE_Y + 0.05);
      // the county road at x = 70 does not flood
      for (let z = rect.z0; z <= rect.z1; z += 3) expect(f.h(70, z)).toBeGreaterThan(LAKE_Y + 0.1);
      const st = lotStats(f);
      expect(st.waterFrac, `${acres} ${seed}`).toBeGreaterThan(0.08);
    }
  });

  it('the bluff stands over the lake and the road stays dry', () => {
    for (const seed of SEEDS) {
      const f = lotField(spec('bluff', seed, 8), RECT), st = lotStats(f);
      expect(st.waterFrac).toBeGreaterThan(0.04);
      expect(st.maxSlopePct).toBeGreaterThan(60);
      for (let z = 0; z <= 67; z += 4) expect(f.h(70, z)).toBeGreaterThan(LAKE_Y + 1);
    }
  });

  it('works on every lot size, and the stats read the profile', () => {
    for (const acres of [5, 20, 40, 80] as const) for (const k of LOT_KINDS) {
      const f = lotField(spec(k, 6, 7), HOME_RECT[acres]), st = lotStats(f);
      expect(st.padFrac).toBeGreaterThanOrEqual(0);
      expect(st.padFrac).toBeLessThanOrEqual(1);
      expect(st.pad[0]).toBeGreaterThanOrEqual(HOME_RECT[acres].x0);
      expect(st.pad[0]).toBeLessThanOrEqual(HOME_RECT[acres].x1);
      const prof = profileLine(f, [HOME_RECT[acres].x0, st.pad[1]], [HOME_RECT[acres].x1, st.pad[1]], 24);
      expect(prof).toHaveLength(24);
      expect(prof[23].d).toBeCloseTo((HOME_RECT[acres].x1 - HOME_RECT[acres].x0) * 6, 5);
    }
  });

  it('tree lines are set for the mountain regions only', () => {
    expect(treeLineM('mountain_west')).toBeGreaterThan(2500);
    expect(treeLineM('plains')).toBeGreaterThan(5000);
  });
});
