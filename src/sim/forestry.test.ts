import { describe, expect, it } from 'vitest';
import { newGame } from './state';
import { step } from './engine';
import { addFellWork, markTree, nextFellJob, stageHours, unmarkTree, yieldOf } from './forestry';
import { planStructure } from './construction';

const pine = { id: 42, x: 10, z: 12, kind: 'conifer' as const, scale: 1 };

describe('forestry', () => {
  it('marks a tree once, and unmarks it until cutting starts', () => {
    const g = newGame(1);
    expect(markTree(g, pine, 20)).not.toBeNull();
    expect(markTree(g, pine, 20)).toBeNull();
    expect(unmarkTree(g, 42)).toBe(true);
    expect(g.forestry.jobs).toHaveLength(0);
    const j = markTree(g, pine, 20)!;
    addFellWork(g, j, 0.5);
    expect(unmarkTree(g, 42)).toBe(false);
  });

  it('fells, bucks and hauls, then credits logs and firewood and leaves a stump', () => {
    const g = newGame(1);
    const j = markTree(g, pine, 20)!;
    const total = stageHours(j) + stageHours({ ...j, stage: 'felled' }) + stageHours({ ...j, stage: 'bucked' });
    const logs0 = g.stock.logs, wood0 = g.stock.firewood;
    addFellWork(g, j, total / 2);
    expect(g.forestry.jobs).toHaveLength(1);
    expect(j.stage).not.toBe('marked');
    addFellWork(g, j, total / 2 + 1e-9);
    expect(g.forestry.jobs).toHaveLength(0);
    expect(g.forestry.cleared).toEqual([42]);
    expect(g.stock.logs - logs0).toBe(yieldOf('conifer', 1).logs);
    expect(g.stock.firewood - wood0).toBe(1);
    expect(markTree(g, pine, 20)).toBeNull();
  });

  it('cottonwood is firewood only; big pines give more logs', () => {
    expect(yieldOf('broad', 1).logs).toBe(0);
    expect(yieldOf('broad', 1).firewood).toBe(2);
    expect(yieldOf('conifer', 1.3).logs).toBeGreaterThan(yieldOf('conifer', 0.75).logs);
  });

  it('a further haul takes longer', () => {
    const g = newGame(1);
    const near = markTree(g, pine, 5)!, far = markTree(g, { ...pine, id: 7 }, 40)!;
    expect(far.haulHours).toBeGreaterThan(near.haulHours);
  });

  it('works a started job before new marks', () => {
    const g = newGame(1);
    markTree(g, pine, 5);
    const b = markTree(g, { ...pine, id: 7 }, 5)!;
    addFellWork(g, b, 0.2);
    expect(nextFellJob(g)).toBe(b);
  });

  it('the family fells marked trees in work hours', () => {
    let g = newGame(1);
    for (let i = 0; i < 3; i++) markTree(g, { ...pine, id: i }, 15);
    g = step(g, 3);
    expect(g.forestry.cleared.length).toBe(3);
    expect(g.stock.logs).toBeGreaterThanOrEqual(6);
    expect(g.personState.some(p => p.task === 'forestry') || g.forestry.jobs.length === 0).toBe(true);
  });

  it('splits the crew between building and the woods', () => {
    let g = newGame(1);
    planStructure(g, 'timber_cabin', 10, 10, 0);
    for (let i = 0; i < 40; i++) markTree(g, { ...pine, id: i }, 15);
    g = step(g, 0.2);                          // 06:00 → ~10:48, work hours
    const tasks = g.personState.filter((_, i) => !g.people[i].kid).map(p => p.task);
    expect(tasks).toContain('build');
    expect(tasks).toContain('forestry');
  });
});
