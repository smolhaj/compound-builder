import { describe, expect, it } from 'vitest';
import { newGame } from '../../sim/state';
import { planRun } from '../../sim/perimeter';
import { solidSpans } from '../perimeter/perimeterGeometry';
import { liveBreach } from './liveBreach';

describe('live breach', () => {
  const g = newGame(2, 105, 2027, { mode: 'scenario', peace: 'short', kind: 'grid_down' });
  const run = planRun(g, 'container_wall', [[0, 0], [10, 0]]);
  it('hands back the very same array while nothing is open', () => {
    liveBreach.clear();
    expect(liveBreach.apply(g.perimeter)).toBe(g.perimeter);
  });
  it('opens a bare gap on a copy, leaves the saved run alone, and clears', () => {
    liveBreach.add({ runId: run.id, at: 5, w: 0.8 });
    const out = liveBreach.apply(g.perimeter);
    const r = out.find(x => x.id === run.id)!;
    expect(r.gates.length).toBe(run.gates.length + 1);
    expect(r.gates[r.gates.length - 1].breach).toBe(true);
    expect(run.gates.some(x => x.breach)).toBe(false);
    const spans = solidSpans(r, 10);
    expect(spans.length).toBe(2);
    expect(liveBreach.apply(g.perimeter)).toBe(out);
    liveBreach.clear();
    expect(liveBreach.apply(g.perimeter)).toBe(g.perimeter);
  });
});
