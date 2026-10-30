import { describe, expect, it } from 'vitest';
import { newGame } from './state';
import { planStructure } from './construction';
import { operational, operationalCount } from './operational';

const fresh = () => { const g = newGame(11); g.structures = []; g.perimeter = []; g.site = { ...g.site, gwDepth: 5 }; return g; };
const done = (g: ReturnType<typeof fresh>, kind: string) => { const st = planStructure(g, kind, 0, 0, 0)!; st.finishedAt = 0; return st; };

describe('the operational checklist', () => {
  it('lists shelter, water, power, food and defense, each unmet one with a one-line status', () => {
    const g = fresh();
    const items = operational(g);
    expect(items.map(i => i.id)).toEqual(['shelter', 'water', 'power', 'food', 'defense']);
    for (const i of items.filter(x => !x.done)) { expect(i.line.length).toBeLessThan(48); expect(i.line).not.toContain('\n'); }
    expect(items.find(i => i.id === 'shelter')!.act?.act).toEqual({ type: 'stake', kind: 'timber_cabin' });
    expect(items.find(i => i.id === 'water')!.act?.act).toEqual({ type: 'stake', kind: 'well_hand' });
    expect(items.find(i => i.id === 'food')!.act?.act).toEqual({ type: 'stake', kind: 'garden' });
  });

  it('ticks an item only when the thing is finished, and drops its button', () => {
    const g = fresh();
    planStructure(g, 'well_hand', 4, 4, 0);
    expect(operational(g).find(i => i.id === 'water')).toMatchObject({ done: false, line: 'Well going in' });
    expect(operational(g).find(i => i.id === 'water')!.act).toBeUndefined();
    done(g, 'solar_array');
    const o = operational(g);
    expect(o.find(i => i.id === 'power')).toMatchObject({ done: true });
    expect(o.find(i => i.id === 'power')!.act).toBeUndefined();
    expect(operationalCount(o).done).toBeGreaterThanOrEqual(1);
  });
});
