import { describe, expect, it } from 'vitest';
import {
  CARD, CARD_STRIDE, CHUNK, DENSITY, LIT, LITTER_STRIDE, STONE_STRIDE, flowerSeason, groundProfileFor, hash2, planChunk,
  type CoverSample, type CoverSampler,
} from './groundCoverPlan';
import type { RegionKind } from '../terrain/regionalLandscape';

const flat = (over: Partial<CoverSample> = {}, slope = 0): CoverSampler => ({
  height: (x) => x * slope,
  at: () => ({ forest: 0, field: 0, density: 1, worn: 0, ...over }),
});

const KINDS: RegionKind[] = ['mountain', 'coast', 'sound', 'appalachia', 'north_woods', 'desert', 'plains', 'upper_midwest', 'drumlin'];

describe('groundCoverPlan', () => {
  it('is deterministic: the same chunk grows the same plants', () => {
    const a = planChunk(3, -2, groundProfileFor('plains'), 'high', flat());
    const b = planChunk(3, -2, groundProfileFor('plains'), 'high', flat());
    expect(Array.from(a.cards)).toEqual(Array.from(b.cards));
    expect(a.cards.length).toBeGreaterThan(0);
  });

  it('stays inside its chunk and within the tier density', () => {
    for (const q of ['high', 'medium', 'low'] as const) {
      const p = planChunk(1, 1, groundProfileFor('mountain'), q, flat());
      expect(p.cards.length / CARD_STRIDE).toBeLessThanOrEqual(Math.round(CHUNK * CHUNK * DENSITY[q].cards));
      for (let o = 0; o < p.cards.length; o += CARD_STRIDE) {
        expect(p.cards[o]).toBeGreaterThanOrEqual(CHUNK);
        expect(p.cards[o]).toBeLessThan(2 * CHUNK);
        expect(p.cards[o + 2]).toBeGreaterThanOrEqual(CHUNK);
        expect(p.cards[o + 2]).toBeLessThan(2 * CHUNK);
      }
    }
  });

  it('Low is far lighter than High', () => {
    const hi = planChunk(0, 0, groundProfileFor('plains'), 'high', flat());
    const lo = planChunk(0, 0, groundProfileFor('plains'), 'low', flat());
    expect(lo.cards.length).toBeLessThan(hi.cards.length * 0.45);
    expect(lo.litter.length).toBeLessThan(hi.litter.length * 0.4);
  });

  it('grows nothing where the host says the ground is built on, and nothing in a crop field', () => {
    for (const s of [{ density: 0 }, { field: 1 }]) {
      const p = planChunk(0, 0, groundProfileFor('plains'), 'high', flat(s));
      expect(p.cards.length).toBe(0);
      if (s.density === 0) expect(p.stones.length).toBe(0);
    }
    // a blocked spot inside an otherwise free chunk stays clear
    const part: CoverSampler = { height: () => 0, at: (x) => ({ forest: 0, field: 0, density: x < 2 ? 0 : 1, worn: 0 }) };
    const p = planChunk(0, 0, groundProfileFor('plains'), 'high', part);
    for (let o = 0; o < p.cards.length; o += CARD_STRIDE) expect(p.cards[o]).toBeGreaterThanOrEqual(2);
    for (let o = 0; o < p.litter.length; o += LITTER_STRIDE) expect(p.litter[o]).toBeGreaterThanOrEqual(2);
    for (let o = 0; o < p.stones.length; o += STONE_STRIDE) expect(p.stones[o]).toBeGreaterThanOrEqual(2);
  });

  it('trodden ground gets scuffs of soil and less grass', () => {
    const free = planChunk(0, 0, groundProfileFor('plains'), 'high', flat());
    const worn = planChunk(0, 0, groundProfileFor('plains'), 'high', flat({ worn: 1 }));
    const scuffs = (c: Float32Array) => { let n = 0; for (let o = 5; o < c.length; o += LITTER_STRIDE) if (c[o] === LIT.SCUFF) n++; return n; };
    expect(scuffs(worn.litter)).toBeGreaterThan(20);
    expect(scuffs(free.litter)).toBe(0);
    expect(worn.cards.length).toBeLessThan(free.cards.length * 0.25);
  });

  it('puts every item on the ground, and litter lies on the slope', () => {
    const p = planChunk(0, 0, groundProfileFor('appalachia'), 'high', flat({ forest: 1 }, 0.3));
    for (let o = 0; o < p.cards.length; o += CARD_STRIDE) expect(Math.abs(p.cards[o + 1] - (p.cards[o] * 0.3 - 0.004))).toBeLessThan(1e-3);
    expect(p.litter.length).toBeGreaterThan(0);
    // a slope rising along +x tilts the surface normal toward -x
    for (let o = 0; o < p.litter.length; o += LITTER_STRIDE) expect(p.litter[o + 10]).toBeLessThan(-0.1);
  });

  it('keeps cover off steep rock faces', () => {
    const p = planChunk(0, 0, groundProfileFor('mountain'), 'high', flat({}, 1.2));
    expect(p.cards.length).toBe(0);
  });

  it('each region grows its own cover', () => {
    const tiles = (kind: RegionKind, forest: number): Set<number> => {
      const s = new Set<number>();
      for (let i = 0; i < 6; i++) { const p = planChunk(i, 0, groundProfileFor(kind), 'high', flat({ forest })); for (let o = 6; o < p.cards.length; o += CARD_STRIDE) s.add(p.cards[o]); }
      return s;
    };
    const desert = tiles('desert', 0), plains = tiles('plains', 0), pnw = tiles('sound', 1), app = tiles('appalachia', 1);
    expect(desert.has(CARD.CACTUS) && desert.has(CARD.YUCCA) && desert.has(CARD.SCRUB)).toBe(true);
    expect(plains.has(CARD.CACTUS)).toBe(false);
    expect(plains.has(CARD.TALL)).toBe(true);
    expect(pnw.has(CARD.FERN)).toBe(true);
    expect(app.has(CARD.FERN)).toBe(true);
    expect(desert.has(CARD.FERN)).toBe(false);
    // leaf litter dominates the Appalachian floor; needles the north woods'
    const litter = (kind: RegionKind) => { const c = new Map<number, number>(); for (let i = 0; i < 6; i++) { const p = planChunk(i, 0, groundProfileFor(kind), 'high', flat({ forest: 1 })); for (let o = 5; o < p.litter.length; o += LITTER_STRIDE) c.set(p.litter[o], (c.get(p.litter[o]) ?? 0) + 1); } return c; };
    const a = litter('appalachia'), n = litter('north_woods');
    expect((a.get(LIT.OAK) ?? 0) + (a.get(LIT.MAPLE) ?? 0)).toBeGreaterThan(a.get(LIT.NEEDLES) ?? 0);
    expect(n.get(LIT.NEEDLES) ?? 0).toBeGreaterThan((n.get(LIT.OAK) ?? 0) + (n.get(LIT.MAPLE) ?? 0));
  });

  it('every region has a valid profile', () => {
    for (const k of KINDS) {
      const pr = groundProfileFor(k);
      expect(pr.open.length).toBeGreaterThan(0);
      expect(pr.flowers.length).toBeGreaterThan(0);
      for (const [, w] of [...pr.open, ...pr.wood, ...pr.litterOpen, ...pr.litterWood]) expect(w).toBeGreaterThan(0);
    }
  });

  it('flowers bloom spring to summer, not in snow, fall or (desert) summer', () => {
    const base = { fresh: 0, bloom: 0, fall: 0, dormant: 0, snow: 0, dry: 0 };
    expect(flowerSeason({ ...base, bloom: 1, fresh: 1 }, false)).toBeGreaterThan(0.9);
    expect(flowerSeason({ ...base }, false)).toBeGreaterThan(0.5);
    expect(flowerSeason({ ...base, fall: 1 }, false)).toBe(0);
    expect(flowerSeason({ ...base, snow: 1, dormant: 1 }, false)).toBe(0);
    expect(flowerSeason({ ...base }, true)).toBe(0);
    expect(flowerSeason({ ...base, bloom: 1, fresh: 1 }, true)).toBeGreaterThan(0.9);
  });

  it('hash2 is in [0, 1) and varies', () => {
    const v = new Set<number>();
    for (let i = 0; i < 50; i++) { const h = hash2(i, 7, 3); expect(h).toBeGreaterThanOrEqual(0); expect(h).toBeLessThan(1); v.add(h); }
    expect(v.size).toBe(50);
  });
});
