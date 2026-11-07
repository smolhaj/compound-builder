import { describe, expect, it } from 'vitest';
import { fuzz, type FuzzRun } from './fuzz/stallFuzz';

/**
 * Seeds that stalled before the road-pile fix (a drive-less lot's deliveries sat at the road in one lump, the stuck card never
 * showed because the pile counted as "on order", and a crew would not carry it). Each must now run clean.
 */
export const REGRESSION_SEEDS = [22, 45, 57, 138, 144, 218, 223, 234, 258];

const FULL = Number(import.meta.env.VITE_STALL_FUZZ_N ?? 0), FROM = Number(import.meta.env.VITE_STALL_FUZZ_FROM ?? 1);
const show = (r: FuzzRun) => `seed ${r.seed} [${r.setup}]: ` + r.violations.map(v => `${v.kind} d${v.day}: ${v.detail}`).join(' | ');

describe('stall fuzz: a passive player who only presses what the cards offer', () => {
  for (const seed of REGRESSION_SEEDS) {
    it(`regression seed ${seed} has no stalled project`, () => {
      const r = fuzz(seed);
      expect(r.violations.map(() => show(r))).toEqual([]);
    }, 120_000);
  }
  it('a spread of fresh starts across regions, lots, homes, disasters and difficulties', () => {
    const bad: string[] = [];
    for (let seed = 1001; seed <= 1006; seed++) { const r = fuzz(seed); if (r.violations.length) bad.push(show(r)); }
    expect(bad).toEqual([]);
  }, 300_000);
  it.skipIf(!FULL)('manual full run (VITE_STALL_FUZZ_N=300 VITE_STALL_FUZZ_FROM=1): prints every violating seed', () => {
    const bad: FuzzRun[] = [];
    for (let seed = FROM; seed < FROM + FULL; seed++) {
      const r = fuzz(seed);
      console.log('FUZZSEED ' + JSON.stringify({ seed, setup: r.setup, wiped: r.wipedAt, stats: r.stats, v: r.violations }));
      if (r.violations.length) bad.push(r);
    }
    console.log(`FUZZ ${FULL} seeds from ${FROM}, ${bad.length} with violations`);
    expect(bad.map(show)).toEqual([]);
  }, 7_200_000);
});
