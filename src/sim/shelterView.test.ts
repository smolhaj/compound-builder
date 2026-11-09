import { describe, expect, it } from 'vitest';
import { newGame } from './state';
import { DOSE_SICK, doseText, radiationKnown, radiationSub, radiationSummary, shelterDose, shelterRows } from './shelterView';
import { bestShelter, shelterOf } from './nuclear';
import { blueprintPlan } from '../game/blueprint/blueprintPlan';

function nuclearGame() {
  const g = newGame(5, 105, 2027, { kind: 'nuclear' } as never);
  g.disaster.kind = 'nuclear'; g.disaster.variant = 'distant';
  const add = (kind: string, id: string) => g.structures.push({ id, kind, x: 10, z: 10, rot: 0, stage: 99, done: 0, supplied: true, finishedAt: 0 } as never);
  add('root_cellar', 'c1'); add('timber_cabin', 'k1'); add('trailer', 't1');
  return g;
}

describe('shelter view', () => {
  it('doses fall with the protection factor and the best shelter matches bestShelter', () => {
    expect(shelterDose('nearby', 40)).toBeLessThan(shelterDose('nearby', 3));
    expect(shelterDose('nearby', 1)).toBeCloseTo(shelterDose('nearby', 1.0), 9);
    const g = nuclearGame(), rows = shelterRows(g);
    expect(rows[0].pf).toBe(bestShelter(g)[0]);
    expect(rows.map(r => r.pf)).toEqual([...rows.map(r => r.pf)].sort((a, b) => b - a));
    expect(rows.find(r => r.kind === 'root_cellar')!.tone).toBe('good');
    expect(rows.find(r => r.kind === 'trailer')!.tone).toBe('bad');
    expect(rows.find(r => r.kind === 'trailer')!.doseSv).toBeGreaterThan(DOSE_SICK);
  });
  it('skips what is not finished or not a shelter', () => {
    const g = nuclearGame();
    g.structures.push({ id: 'u', kind: 'root_cellar', x: 0, z: 0, rot: 0, stage: 0, done: 0, supplied: false, finishedAt: null } as never, { id: 'w', kind: 'garden', x: 0, z: 0, rot: 0, stage: 99, done: 0, supplied: true, finishedAt: 0 } as never);
    const ids = shelterRows(g).map(r => r.id);
    expect(ids).not.toContain('u'); expect(ids).not.toContain('w');
    expect(shelterOf({ kind: 'garden' } as never)).toBeNull();
  });
  it('is known only in a nuclear run with the warning out', () => {
    const g = nuclearGame();
    g.clock.t = 0; g.disaster.phase = 'peace' as never; g.disaster.warnAt = 50;
    expect(radiationKnown(g)).toBe(false);
    g.clock.t = 51; expect(radiationKnown(g)).toBe(true);
    g.disaster.kind = 'flood' as never; expect(radiationKnown(g)).toBe(false);
  });
  it('blueprint marks carry PF and a tone only when known', () => {
    const g = nuclearGame(); g.clock.t = 0; g.disaster.warnAt = 50; g.disaster.phase = 'peace' as never;
    expect(blueprintPlan(g).marks.some(m => m.tone)).toBe(false);
    expect(blueprintPlan(g).readout.radiation).toBeUndefined();
    g.clock.t = 60;
    const bp = blueprintPlan(g), cell = bp.marks.find(m => m.id === 'c1')!;
    expect(cell.sub).toContain('PF 40'); expect(cell.tone).toBe('good');
    expect(bp.marks.find(m => m.id === 't1')!.tone).toBe('bad');
    expect(bp.readout.radiation).toContain('Best shelter the root cellar');
  });
  it('text', () => {
    expect(doseText(0.004)).toBe('under 0.01 Sv'); expect(doseText(0.5)).toBe('0.50 Sv'); expect(doseText(2.34)).toBe('2.3 Sv');
    expect(radiationSub({ pf: 1234, doseSv: 0.1 })).toBe('PF 1,234 · 0.10 Sv in 14 days');
    const g = nuclearGame(); g.structures.length = 0;
    expect(radiationSummary(g)).toContain('No shelter yet');
  });
});
