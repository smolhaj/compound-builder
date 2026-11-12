import { describe, expect, it } from 'vitest';
import { newGame } from './state';
import { planStructure } from './construction';
import { applyForPermit } from './paperwork';
import { suggestions, plansNeedLines } from './guidance';
import { permitWait, permitWaitText } from './permitWait';

const base = () => { const g = newGame(7); g.structures = g.structures.filter(x => x.pre); g.perimeter = []; g.money = 300_000; return g; };

describe('guidance while the county reviews a permit', () => {
  it('says nothing with no review under way', () => {
    const g = base();
    expect(permitWait(g, [])).toBeNull();
    expect(suggestions(g, 40).some(x => x.id === 'permit_wait')).toBe(false);
  });
  it('names the wait and the permit-free work, and keeps the permit rules as they were', () => {
    const g = base();
    const st = planStructure(g, 'cottage', 0, 0, 0);
    applyForPermit(g, st);
    expect(st.permit).toBe('review');
    const days = (st.permitAt ?? 0) - g.clock.t;
    const w = permitWait(g, plansNeedLines(g))!;
    expect(w.days).toBe(Math.ceil(days));
    expect(w.stakeFree.join(' ')).toMatch(/privy/);
    const t = permitWaitText(w);
    expect(t.title).toMatch(/days to go/);
    expect(t.why).toMatch(/no permit|neither needs a permit/);
    const card = suggestions(g, 40).find(x => x.id === 'permit_wait');
    expect(card?.acts?.some(a => a.label === 'Show me')).toBe(true);
  });
  it('goes away in the last day', () => {
    const g = base(), st = planStructure(g, 'cottage', 0, 0, 0);
    applyForPermit(g, st);
    g.clock.t = (st.permitAt ?? 0) - 1;
    expect(permitWait(g, [])).toBeNull();
  });
});
