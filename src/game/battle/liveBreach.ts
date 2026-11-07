/**
 * The gaps an invasion knocks through the wall while its cutscene plays (sim/breach.ts `gap` events). The world draws the fence runs from the
 * game state; this puts an extra bare opening on a copy of the run so the wall is really gone for the rest of the scene (and walkers can pass).
 * Never saved: the real, lasting gap is `sim/raidDamage.ts`, which the raid's commit writes. Cleared when the cutscene starts and stops.
 */
import type { PerimeterRun } from '../../sim/perimeter';

export interface LiveGap { runId: string; at: number; w: number }

let gaps: LiveGap[] = [];
let version = 0;
let memo: { src: readonly PerimeterRun[]; version: number; out: readonly PerimeterRun[] } | null = null;

export const liveBreach = {
  add(g: LiveGap): void {
    if (gaps.some(x => x.runId === g.runId && Math.abs(x.at - g.at) < 1e-6)) return;
    gaps = [...gaps, g]; version++;
  },
  clear(): void { if (gaps.length) { gaps = []; version++; } },
  get open(): readonly LiveGap[] { return gaps; },
  /** The runs as the world should draw them: the same array when nothing is open, otherwise copies of the broken runs with the opening added. */
  apply(runs: readonly PerimeterRun[]): readonly PerimeterRun[] {
    if (!gaps.length) return runs;
    if (memo && memo.src === runs && memo.version === version) return memo.out;
    const out = runs.map(r => {
      const mine = gaps.filter(g => g.runId === r.id);
      return mine.length ? { ...r, gates: [...r.gates, ...mine.map(g => ({ at: g.at, w: g.w, breach: true }))] } : r;
    });
    memo = { src: runs, version, out };
    return out;
  },
};
