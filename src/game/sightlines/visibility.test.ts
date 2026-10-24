import { describe, expect, it } from 'vitest';
import { exposure, Sight, viewshedGrid, type SightWorld } from './visibility';

const flat = (over: Partial<SightWorld> = {}): SightWorld => ({
  ground: () => 0, trees: [], forestAt: () => 0, inside: () => true, walls: [], boxes: [], ...over,
});

describe('sightlines', () => {
  it('open ground is clear; a hill blocks the view', () => {
    const s = new Sight(flat());
    expect(s.clear([0, 0.3, 0], [20, 0.3, 0])).toBe(1);
    const hill = new Sight(flat({ ground: (x: number) => (x > 8 && x < 12 ? 1.5 : 0) }));
    expect(hill.clear([0, 0.3, 0], [20, 0.3, 0])).toBe(0);
  });

  it('trees thin the view; a stand of them hides you', () => {
    const one = new Sight(flat({ trees: [{ x: 10, z: 0, y: 0, scale: 1, sy: 1, kind: 'conifer' }] }));
    const v1 = one.clear([0, 0.3, 0], [20, 0.3, 0]);
    expect(v1).toBeGreaterThan(0.2); expect(v1).toBeLessThan(0.7);
    const stand = new Sight(flat({ trees: [4, 7, 10, 13, 16].map(x => ({ x, z: 0, y: 0, scale: 1, sy: 1, kind: 'conifer' })) }));
    expect(stand.clear([0, 0.3, 0], [20, 0.3, 0])).toBeLessThan(0.05);
  });

  it('walls and grown hedges cut the view below their top, gates let it through, a tower sees over', () => {
    const wall = { pts: [[10, -5], [10, 5]] as Array<[number, number]>, top: 0.45, cut: 1, gates: [{ at: 5, w: 0.6 }] };
    const s = new Sight(flat({ walls: [wall] }));
    expect(s.clear([0, 0.3, 1], [20, 0.3, 1])).toBe(0);
    expect(s.clear([0, 0.3, 0], [20, 0.3, 0])).toBe(1);                   // through the gate
    expect(s.clear([0, 1.5, 1], [20, 1.5, 1])).toBe(1);                   // over it from a tower
  });

  it('exposure counts the observers who can see a spot; a viewshed maps one eye', () => {
    const s = new Sight(flat({ ground: (x: number) => (x > 8 && x < 12 ? 1.5 : 0) }));
    const obs = [{ x: 0, z: 0, eye: 0.3 }, { x: 20, z: 30, eye: 0.3 }];
    const e = exposure(s, { ground: (x: number) => (x > 8 && x < 12 ? 1.5 : 0) }, 20, 0, 0.25, obs);
    expect(e).toBeGreaterThan(0.2); expect(e).toBeLessThan(0.6);
    const vs = viewshedGrid(new Sight(flat()), { ground: () => 0 }, { x: 0, z: 0, eye: 0.3 }, 0, 0, 10, 10, 5);
    expect(vs.nx).toBe(3); expect(Math.min(...vs.v)).toBeGreaterThan(0.5);
  });
});
