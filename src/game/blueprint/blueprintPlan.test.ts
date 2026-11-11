import { describe, expect, it } from 'vitest';
import { newGame, type Structure } from '../../sim/state';
import { planRun, type Pt } from '../../sim/perimeter';
import { blueprintPlan, declutter } from './blueprintPlan';

const st = (id: string, kind: string, x: number, z: number): Structure => ({ id, kind, x, z, rot: 0, stage: 9, done: 0, supplied: true, finishedAt: 0 });
const ring = (g: ReturnType<typeof newGame>, kind: 'stone_wall', pts: Pt[], gates: Array<{ at: number; w: number; sally?: boolean }> = []) => { const r = planRun(g, kind, pts, gates); r.done = r.hours; r.supplied = true; r.finishedAt = 0; if (!g.perimeter.includes(r)) g.perimeter.push(r); return r; };

describe('blueprint plan', () => {
  it('names a building, a tower, a ring with its gate and the sally port', () => {
    const g = newGame(3);
    g.structures.push(st('h', 'timber_cabin', 10, 10), st('t', 'watchtower_wood', 14, 14));
    ring(g, 'stone_wall', [[4, 4], [20, 4], [20, 20], [4, 20], [4, 4]], [{ at: 8, w: 0.6 }, { at: 40, w: 0.3, sally: true }]);
    const p = blueprintPlan(g);
    const labels = p.marks.map(m => m.label);
    expect(labels).toContain('Tower 1');
    expect(p.marks.find(m => m.id === 't')?.sub).toMatch(/wooden watchtower/);
    expect(labels.some(l => /ring wall/i.test(l))).toBe(true);
    expect(labels).toContain('Gate');
    expect(labels).toContain('Sally port');
    expect(p.marks.find(m => m.id === 'h')?.sub).toMatch(/sleeps/);
    expect(p.outlines.some(o => o.id === 'h' && o.closed)).toBe(true);
    expect(p.readout.rings).toBe(1);
    expect(p.readout.gates).toBe(2);
    expect(p.readout.towers).toBe(1);
    expect(p.readout.sight.thermal).toBeGreaterThanOrEqual(p.readout.sight.eye);
  });

  it('an unfinished building is marked as being built, and an empty compound still gives a readout', () => {
    const g = newGame(3);
    const s = st('h', 'timber_cabin', 10, 10); s.stage = 0; s.finishedAt = null; s.supplied = false;
    g.structures.push(s);
    expect(blueprintPlan(g).marks[0].sub).toBe('being built');
    const e = blueprintPlan(newGame(4));
    expect(e.marks).toEqual([]);
    expect(e.readout.score).toBeGreaterThanOrEqual(0);
  });
});

describe('blueprint wall tops and doors', () => {
  it('a ring wall says what crowns it, and a doored tunnel says how long its door holds', () => {
    const g = newGame(3);
    const pts: Pt[] = [[4, 4], [20, 4], [20, 20], [4, 20], [4, 4]];
    const r = ring(g, 'stone_wall', pts);
    expect(blueprintPlan(g).marks.find(m => m.id === r.id)?.sub).not.toMatch(/on top/);
    r.razor = true;
    expect(blueprintPlan(g).marks.find(m => m.id === r.id)?.sub).toMatch(/razor coils on top/);
    const deck = planRun(g, 'wall_walk', pts); deck.hostId = r.id; deck.done = deck.hours; deck.supplied = true; deck.finishedAt = 0; g.perimeter.push(deck);
    expect(blueprintPlan(g).marks.find(m => m.id === r.id)?.sub).toMatch(/patrol deck and razor coils on top/);
    expect(blueprintPlan(g).marks.find(m => /^Gate/.test(m.label))).toBeUndefined();   // (no gate on this ring)
    const tb = planRun(g, 'tunnel_bridge', [[30, 4], [30, 16]]); tb.done = tb.hours; tb.supplied = true; tb.finishedAt = 0; g.perimeter.push(tb);
    expect(blueprintPlan(g).marks.find(m => m.id === tb.id)?.sub).toMatch(/steel door holds \d+ s by hand, \d+ s to a ram/);
  });
});

describe('blueprint gates', () => {
  it('says which ring gate checks visitors under the vetting policy', () => {
    const g = newGame(3);
    const outer: Pt[] = [[2, 2], [30, 2], [30, 30], [2, 30], [2, 2]], inner: Pt[] = [[10, 10], [22, 10], [22, 22], [10, 22], [10, 10]];
    const a = ring(g, 'stone_wall', outer, [{ at: 6, w: 0.6 }]), b = ring(g, 'stone_wall', inner, [{ at: 4, w: 0.6 }]);
    g.structures.push(st('h', 'timber_cabin', 16, 16));
    const sub = (id: string) => blueprintPlan(g).marks.find(m => m.id === `${id}:g0`)?.sub ?? '';
    g.gate.vet = 'none';
    expect(sub(a.id)).not.toMatch(/checked/);
    g.gate.vet = 'both';
    const subs = [sub(a.id), sub(b.id)];
    expect(subs.filter(x => /visitors checked here/.test(x)).length).toBe(2);
    g.gate.vet = 'outer';
    expect(blueprintPlan(g).marks.filter(m => m.cat === 'gate' && /checked/.test(m.sub ?? '')).length).toBe(1);
  });
});

describe('declutter', () => {
  it('keeps the higher priority of two crowded labels and drops one that sits on it', () => {
    const out = declutter([
      { id: 'a', x: 100, y: 100, prio: 1, w: 80, h: 20 },
      { id: 'b', x: 110, y: 104, prio: 9, w: 80, h: 20 },
      { id: 'c', x: 400, y: 300, prio: 1, w: 80, h: 20 },
    ]);
    expect(out).toEqual(['b', 'c']);
  });
  it('caps the number of labels', () => {
    const many = Array.from({ length: 200 }, (_, i) => ({ id: `m${i}`, x: (i % 20) * 100, y: Math.floor(i / 20) * 60, prio: 1, w: 40, h: 20 }));
    expect(declutter(many, 30).length).toBe(30);
  });
});
