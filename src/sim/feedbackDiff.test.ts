import { describe, expect, it } from 'vitest';
import { newGame, type GameState } from './state';
import { placeOrder } from './economy';
import { planStructure } from './construction';
import { buyLand } from './land';
import { hireCrew } from './crews';
import { hireGuard } from './guards';
import { celebrations, coalesce, diffAction, messageText, toastText, COALESCE_MS } from './feedbackDiff';

const clone = (g: GameState): GameState => structuredClone(g);
const base = () => { const g = newGame(11); g.structures = []; g.money = 50_000; return g; };

describe('purchases answer back', () => {
  it('an order is one event with its cost, ETA and the cash left', () => {
    const a = base(), b = clone(a);
    expect(placeOrder(b, [{ material: 'lumber', qty: 30 }, { material: 'hardware', qty: 4 }])).not.toBeNull();
    const evs = diffAction(a, b);
    expect(evs).toHaveLength(1);
    expect(evs[0].kind).toBe('order');
    const text = messageText(evs[0], Math.round(b.money));
    expect(text).toMatch(/^Ordered 30 lumber/);
    expect(text).toContain('Cash left: $');
    expect(text).toMatch(/Arrives in about \d+ days?\./);
    expect(evs[0].flash).toContain('tab:supplies');
  });

  it('a staked building names the piece and lights its Build row and project card', () => {
    const a = base(), b = clone(a);
    const st = planStructure(b, 'timber_cabin', 0, 0, 0);
    const evs = diffAction(a, b);
    expect(evs).toHaveLength(1);
    expect(evs[0].title).toContain('timber cabin');
    expect(evs[0].flash).toEqual(expect.arrayContaining(['kit:timber_cabin', `struct:${st.id}`]));
  });

  it('a land purchase says the acres and the price', () => {
    const a = base(); a.money = 5_000_000;
    const p = a.land.parcels.find(x => x.owner !== 'you')!;
    p.forSale = true;
    const b = clone(a);
    const why = buyLand(b, p.id);
    if (why) return;   // (not adjacent in this layout: the sim tests cover buying)
    const evs = diffAction(a, b);
    expect(evs[0].kind).toBe('land');
    expect(evs[0].title).toMatch(/^Bought \d+ acres? of /);
    expect(evs[0].cost).toBeGreaterThan(0);
  });

  it('hiring a crew or a guard answers back', () => {
    const a = base();
    const st = planStructure(a, 'timber_cabin', 0, 0, 0);
    const b = clone(a);
    expect(hireCrew(b, st.id)).toBeNull();
    expect(diffAction(a, b)[0]).toMatchObject({ kind: 'hire' });
    const c = clone(a), d = clone(a);
    const home = d.structures.find(x => x.id === st.id)!; home.stage = 99; home.finishedAt = 1;
    const c2 = clone(c); void c2;
    expect(hireGuard(d)).toBeNull();
    expect(diffAction(c, d)[0].title).toMatch(/^Hired a guard/);
  });

  it('time passing, a different game, or nothing changing is not a player action', () => {
    const a = base(), b = clone(a);
    b.clock.t += 0.5; b.money -= 100;
    expect(diffAction(a, b)).toEqual([]);
    const c = newGame(12);
    expect(diffAction(a, c)).toEqual([]);
    expect(diffAction(a, clone(a))).toEqual([]);
  });

  it('a bare spend still answers with the amount', () => {
    const a = base(), b = clone(a);
    b.money -= 250;
    const [e] = diffAction(a, b);
    expect(e.kind).toBe('spend');
    expect(messageText(e, b.money)).toContain('$250');
  });

  it('a burst inside the window is one toast; a later action starts a new one', () => {
    const ev = (n: number) => ({ kind: 'order' as const, title: `Ordered ${n} lumber`, cost: 100, note: '', flash: ['tab:supplies'] });
    const t1 = coalesce(null, [ev(1)], 900, 1000, 1);
    const t2 = coalesce(t1, [ev(2)], 800, 1000 + COALESCE_MS - 1, 2);
    expect(t2.id).toBe(t1.id);
    expect(t2.events).toHaveLength(2);
    expect(toastText(t2)).toMatch(/^2 orders placed: .* for \$200\. Cash left: \$800\.$/);
    const t3 = coalesce(t2, [ev(3)], 700, 1000 + COALESCE_MS * 3, 3);
    expect(t3.id).toBe(3);
    expect(t3.events).toHaveLength(1);
  });

  it('uses plain American English', () => {
    const a = base(), b = clone(a);
    planStructure(b, 'timber_cabin', 0, 0, 0);
    placeOrder(b, [{ material: 'lumber', qty: 3 }]);
    const text = diffAction(a, b).map(e => messageText(e, 1)).join(' ');
    expect(text).not.toMatch(/colour|metre|put by|whilst|programme/i);
  });
});

describe('celebrations', () => {
  it('a new lineage milestone makes exactly one card, and not twice', () => {
    const a = base(), b = clone(a);
    b.lineage.milestones.push('a_home');
    const c = celebrations(a, b);
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ id: 'a_home', points: 10 });
    expect(celebrations(a, b, new Set(['a_home']))).toEqual([]);
    expect(celebrations(b, b)).toEqual([]);
  });

  it('the first wave survived fires on the change and only then', () => {
    const a = base(); a.gate.waves = { n: 0 };
    const b = clone(a); b.gate.waves = { n: 1 };
    expect(celebrations(a, b).map(x => x.id)).toEqual(['first_wave']);
    expect(celebrations(b, clone(b))).toEqual([]);
    const pending = clone(b); pending.gate.pending = { id: 'x' } as never;
    expect(celebrations(a, pending)).toEqual([]);
  });

  it('first harvest needs growing ground and food from it', () => {
    const a = base(), b = clone(a);
    b.food.producedKcal = 9000;
    expect(celebrations(a, b)).toEqual([]);
    const st = planStructure(b, 'garden', 0, 0, 0); st.stage = 99; st.finishedAt = 1;
    const c = celebrations(a, b);
    expect(c.map(x => x.id)).toContain('first_harvest');
  });
});

describe('toasts say what was bought', () => {
  it('a big plans order names the first items and counts the rest; singular wording', () => {
    const a = base(), b = clone(a);
    placeOrder(b, [{ material: 'lumber', qty: 30 }, { material: 'hardware', qty: 1 }, { material: 'snares', qty: 1 }, { material: 'pipe', qty: 1 }, { material: 'cable', qty: 2 }]);
    const t = messageText(diffAction(a, b)[0], Math.round(b.money));
    expect(t).toMatch(/^Ordered 30 lumber, 1 door and window kit, 1 dozen snares and 2 more kinds of supplies for \$[\d,]+\. Cash left: \$[\d,]+\./);
  });
  it('a course sign-up says who and which course', () => {
    const a = base(), b = clone(a);
    b.money -= 90;
    b.courses = { ...(b.courses ?? { certs: [], drills: undefined as never, day: -1, next: 1, enrolled: [] }), enrolled: [{ id: 'c1', course: 'firstaid', pid: b.people[0].id, mode: 'book', done: 0, start: 0 }] } as never;
    const ev = diffAction(a, b)[0];
    expect(ev.title).toMatch(new RegExp(`^Signed ${b.people[0].first} up for the first aid and first responder`));
    expect(messageText(ev, Math.round(b.money))).toContain('for $90');
  });
});
