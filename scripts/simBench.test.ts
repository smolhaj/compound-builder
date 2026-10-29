/**
 * Sim tick cost over a long run (idle family, no player). Slow and machine-dependent, so only with
 *   PERF=1 npx vitest run scripts/simBench.test.ts
 * Prints ms per simulated day (and per quarter-day tick) for the first and last year and the worst year of 40.
 */
import { describe, it } from 'vitest';
import { appendFileSync } from 'node:fs';
import { newGame } from '../src/sim/state';
import { step } from '../src/sim/engine';

describe.skipIf(!process.env.PERF)('sim tick cost', () => {
  it('40 simulated years', () => {
    let g = newGame(7);
    const rows: string[] = [];
    let worst = 0, total = 0;
    for (let y = 0; y < 40; y++) {
      const t0 = performance.now();
      for (let d = 0; d < 365 && !g.ending; d += 5) g = step(g, 5);
      const ms = performance.now() - t0;
      total += ms; worst = Math.max(worst, ms);
      rows.push(`year ${y + 1}: ${(ms / 365).toFixed(3)} ms/day${g.ending ? ' (ended)' : ''}`);
      if (g.ending) break;
    }
    const out = [...rows, `total ${total.toFixed(0)} ms, worst year ${(worst / 365).toFixed(3)} ms/day, people ${g.people.length}`].join('\n');
    appendFileSync(process.env.PERF_OUT ?? '/dev/stderr', out + '\n');
  }, 600000);
});
