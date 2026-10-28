import { describe, expect, it } from 'vitest';
import { newGame, type GameState } from './state';
import { enclosure } from './enclosure';
import { layPropertyWall, planPropertyWall, traceLoops, ROAD_GATE_W, type PropertyGeometry } from './propertyWall';
import { runFinished, runLength, type PerimeterKind } from './perimeter';

const game = (creek: boolean) => { const g = newGame(7); g.site = { ...g.site, creek }; return g; };
const creekAt = (g: GameState): PropertyGeometry => {
  const h = g.site.home, z = (h.z0 + h.z1) / 2;
  return { creekZ: () => z, creekHalf: 0.7, roadGate: [h.x1, z + 4] };
};
/** Finish everything laid out (as the family would). */
const finishAll = (g: GameState) => { for (const r of g.perimeter) r.finishedAt = 0; };

describe('traceLoops', () => {
  it('traces one rectangle as four corners', () => {
    const [l] = traceLoops([{ x0: 0, z0: 0, x1: 10, z1: 6 }]);
    expect(l).toHaveLength(4);
  });
  it('merges two touching rectangles into one outline with no seam', () => {
    const loops = traceLoops([{ x0: 0, z0: 0, x1: 10, z1: 10 }, { x0: 10, z0: 0, x1: 20, z1: 10 }]);
    expect(loops).toHaveLength(1);
    expect(loops[0]).toHaveLength(4);
    const per = loops[0].reduce((a, p, k) => a + Math.hypot(loops[0][(k + 1) % 4][0] - p[0], loops[0][(k + 1) % 4][1] - p[1]), 0);
    expect(per).toBeCloseTo(60);
  });
  it('follows an L-shaped holding round the notch', () => {
    const [l] = traceLoops([{ x0: 0, z0: 0, x1: 10, z1: 10 }, { x0: 10, z0: 0, x1: 20, z1: 5 }]);
    expect(l).toHaveLength(6);
  });
});

describe('planPropertyWall', () => {
  it('walls the whole line of a place with no creek: one closed run, one road gate, costed', () => {
    const g = game(false), h = g.site.home;
    const plan = planPropertyWall(g, 'woven_wire', creekAt(g));
    expect(plan.runs).toHaveLength(1);
    expect(plan.creekCrossings).toBe(0);
    expect(plan.gates).toBe(1);
    const run = plan.runs[0];
    expect(run.pts[0]).toEqual(run.pts.at(-1));
    expect(runLength(run.pts)).toBeCloseTo(2 * ((h.x1 - h.x0) + (h.z1 - h.z0)));
    expect(plan.cost).toBeGreaterThan(0);
    expect(plan.hours).toBeGreaterThan(0);
    // the gate is on the road (east) side
    const gate = run.gates[0];
    expect(gate.w).toBe(ROAD_GATE_W);
  });

  it('cuts the wall at the creek and bars each crossing', () => {
    const g = game(true), geo = creekAt(g);
    const plan = planPropertyWall(g, 'chain_link', geo);
    expect(plan.creekCrossings).toBe(2);
    expect(plan.runs.filter(r => r.kind === 'creek_bars')).toHaveLength(2);
    expect(plan.barsM).toBeGreaterThan(0);
    // the wall stops short of the creek on both banks
    const wallRuns = plan.runs.filter(r => r.kind === 'chain_link');
    expect(wallRuns.length).toBeGreaterThanOrEqual(1);
    for (const r of wallRuns) for (const [x, z] of r.pts) expect(!(Math.abs(z - geo.creekZ!(x)) < 0.7 && (x === g.site.home.x0 || x === g.site.home.x1))).toBe(true);
  });

  it('closes the property line in the defense check once it is built', () => {
    const g = game(true), geo = creekAt(g);
    expect(enclosure(g).openShare).toBe(1);
    const n = layPropertyWall(g, planPropertyWall(g, 'chain_link', geo));
    expect(n).toBeGreaterThan(0);
    expect(g.perimeter.every(r => !runFinished(r))).toBe(true);
    finishAll(g);
    const e = enclosure(g);
    expect(e.openShare).toBe(0);
    expect(e.creekOpen).toBe(0);
    expect(e.barrier).toBeGreaterThan(40);
  });

  it('with no creek on the land it never plans bars, even if the world has a creek line elsewhere', () => {
    const g = game(false);
    const plan = planPropertyWall(g, 'barbed_wire', creekAt(g));
    expect(plan.runs.some(r => r.kind === 'creek_bars')).toBe(false);
  });

  it('keeps what is already there: only the open stretches are planned', () => {
    const g = game(false), h = g.site.home;
    const kind: PerimeterKind = 'woven_wire';
    // the whole north side is already fenced (and finished)
    g.perimeter.push({ id: 'old', kind, pts: [[h.x0, h.z0], [h.x1, h.z0]], gates: [], done: 1, hours: 1, supplied: true, finishedAt: 0 });
    const plan = planPropertyWall(g, kind, creekAt(g));
    const full = planPropertyWall(game(false), kind, creekAt(g));
    expect(plan.wallM).toBeLessThan(full.wallM);
    expect(plan.heldM).toBeGreaterThan(0);
    expect(plan.runs).toHaveLength(1);
    expect(plan.runs[0].pts[0]).not.toEqual(plan.runs[0].pts.at(-1));
    layPropertyWall(g, plan);
    finishAll(g);
    expect(enclosure(g).openShare).toBe(0);
  });

  it('plans nothing once the line is held', () => {
    const g = game(false);
    layPropertyWall(g, planPropertyWall(g, 'barbed_wire', creekAt(g)));
    const again = planPropertyWall(g, 'barbed_wire', creekAt(g));
    expect(again.runs).toHaveLength(0);
    expect(again.cost).toBe(0);
  });

  it('works round bought land too: the outline of the union', () => {
    const g = game(false), h = g.site.home;
    g.land.parcels.push({ id: 'n1', rect: { x0: h.x0 - 10, z0: h.z0, x1: h.x0, z1: h.z1 }, owner: 'you', forSale: false, kind: 'woods', neighbor: null, price: 0 } as unknown as GameState['land']['parcels'][number]);
    const plan = planPropertyWall(g, 'barbed_wire', creekAt(g));
    expect(plan.lineM).toBe(Math.round(2 * ((h.x1 - h.x0 + 10) + (h.z1 - h.z0)) * 6));
  });
});
