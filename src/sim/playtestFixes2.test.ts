import { describe, expect, it } from 'vitest';
import { newGame, type GameState } from './state';
import { BLUEPRINTS } from './blueprints';
import { planStructure } from './construction';
import { emptyStock } from './materials';
import { compoundBoard } from './compoundBoard';
import { topChips } from './vitals';
import { whatToDo } from './whatToDo';
import { takeInFood, TAKE_IN_SAFE_DAYS } from './takeInFood';
import { autoOrderParts, noteStalls, roadNote, waiters, AUTO_PARTS_DAYS, AUTO_PARTS_USD } from './stalls';
import { suggestions } from './guidance';
import { midGoals, MID_HEADING } from './midGoals';
import { listAndMarket } from './homeAdvice';
import { ownBuildQuote } from './joinerHome';
import type { Encounter } from './encounters';
import type { Fix } from './improvements';

const peace = (seed = 5): GameState => { const g = newGame(seed); g.clock.t = 5.5; g.disaster.phase = 'peace'; return g; };
const empty = (g: GameState) => { g.stock = emptyStock(); return g; };

/** Test helper: a stuck project with a pile at the road gets the road sentence on its card. */
export function guidanceStuckWhy(): boolean {
  const g = newGame(3); g.stock = emptyStock(); g.structures = []; g.money = 300000;
  const st = planStructure(g, 'trailer', 0, 0, 0);
  st.stage = BLUEPRINTS.trailer.stages.findIndex(x => x.id === 'roof'); st.roofLost = true;
  noteStalls(g); g.clock.t += 5; noteStalls(g);
  g.roadside = [{ id: 'r1', lines: [{ material: 'hardware' as never, qty: 1 }], hours: 3, done: 0 } as never];
  g.site.improvements.drive = false as never;
  const card = suggestions(g, 5).find(x => x.id === 'stalled');
  return !!card && /no drive in/.test(card.why);
}

describe('1. thin pantry in peacetime is calm yellow, red only in the warning window or hunger', () => {
  it('peace, nobody hungry, nothing put by: yellow "Nothing put by"', () => {
    const g = empty(peace());
    const f = compoundBoard(g).vitals.find(v => v.id === 'food')!;
    expect(f.tone).toBe('warn'); expect(f.calm).toBe(true);
    const chip = topChips(g, compoundBoard(g)).find(c => c.id === 'food')!;
    expect(chip.tone).toBe('warn'); expect(chip.full).toBe('Nothing put by');
    const row = whatToDo(g).rows.find(r => r.id === 'alarm:food')!;
    expect(row.tone).toBe('warn'); expect(row.title).toBe('Nothing put by');
  });
  it('stays yellow for hundreds of days of peace', () => {
    const g = empty(peace()); g.clock.t = 700.5;
    expect(compoundBoard(g).vitals.find(v => v.id === 'food')!.tone).toBe('warn');
  });
  it('turns red in the warning window, in a collapse, or when hungry', () => {
    for (const phase of ['warning', 'impact', 'survival'] as const) {
      const g = empty(peace()); g.disaster.phase = phase;
      expect(compoundBoard(g).vitals.find(v => v.id === 'food')!.tone, phase).toBe('bad');
    }
    const g = empty(peace()); g.food.fromStores = false; g.food.needKcal = 1000; g.food.ateKcal = 0;
    expect(compoundBoard(g).vitals.find(v => v.id === 'food')!.tone).toBe('bad');
  });
  it('day 0 stays amber (PR 432)', () => {
    const g = empty(newGame(5)); g.clock.t = 0;
    const f = compoundBoard(g).vitals.find(v => v.id === 'food')!;
    expect(f.tone).toBe('warn'); expect(f.first).toBe(true);
  });
});

const party = (n: number, brings: Encounter['brings'] = {}): Pick<Encounter, 'people' | 'brings' | 'stances'> => ({
  people: Array.from({ length: n }, (_, i) => ({ id: `x${i}`, first: 'A', last: 'B', age: 30, kid: false, body: 'm', skills: { builder: 0, gardener: 0, medic: 0, mechanic: 0, hunter: 0, negotiator: 0, teacher: 0, radio: 0 }, shirt: 0 })) as never,
  brings, stances: ['take_in', 'turn_away'],
});
describe('2. take them in is never the lit default on thin food', () => {
  it('no food: risky, with an honest line', () => {
    const g = empty(peace());
    const t = takeInFood(g, party(5))!;
    expect(t.risky).toBe(true); expect(t.line).toMatch(/going hungry/); expect(t.days).toBeLessThan(TAKE_IN_SAFE_DAYS);
  });
  it('a full shelf, or food they bring, is not risky', () => {
    const g = peace(); g.stock = { ...emptyStock(), canned: 4000 } as never;
    expect(takeInFood(g, party(2))!.risky).toBe(false);
    const g2 = empty(peace());
    expect(takeInFood(g2, party(1, { canned: 4000 } as never))!.risky).toBe(false);
  });
  it('no take_in stance, or nobody arriving: no verdict', () => {
    expect(takeInFood(peace(), { ...party(2), stances: ['turn_away'] })).toBeNull();
    expect(takeInFood(peace(), party(0))).toBeNull();
  });
});

describe('3a. small repair parts are ordered for the player', () => {
  const stuck = (): GameState => {
    const g = empty(peace()); g.money = 300000; g.orders = [];
    const st = planStructure(g, 'trailer', 0, 0, 0);
    st.finishedAt = 0; st.stage = 99 as never; st.supplied = false;
    const f: Fix = { part: 'film', cond: 'poor', done: 0, hours: 10, supplied: false };
    st.fixes = [f];
    return g;
  };
  it('after the grace days, orders the parts once, with a line saying so', () => {
    const g = stuck();
    expect(waiters(g).some(w => w.key.startsWith('f:'))).toBe(true);
    noteStalls(g);
    expect(autoOrderParts(g)).toEqual([]);   // too soon
    g.clock.t += AUTO_PARTS_DAYS + 0.1; noteStalls(g);
    const money = g.money, lines = autoOrderParts(g);
    expect(lines).toHaveLength(1); expect(lines[0]).toMatch(/^Ordered for you:/);
    expect(g.orders.length).toBe(1); expect(g.money).toBeLessThan(money);
    expect(autoOrderParts(g)).toEqual([]);   // already on the way
  });
  it('does not spend more than the cap or a twentieth of the cash', () => {
    const g = stuck(); noteStalls(g); g.clock.t += 3; noteStalls(g);
    g.money = 2000;   // the parts cost more than 5 % of this
    expect(autoOrderParts(g)).toEqual([]);
    expect(AUTO_PARTS_USD).toBeLessThanOrEqual(3000);
  });
  it('never auto-orders a building stage', () => {
    const g = empty(peace()); g.money = 900000; planStructure(g, 'trailer', 0, 0, 0);
    noteStalls(g); g.clock.t += 5; noteStalls(g);
    expect(autoOrderParts(g)).toEqual([]);
  });
});

describe('3b. the stuck card says when parts sit at the road', () => {
  it('roadNote only with a pile and no drive', () => {
    const g = peace();
    expect(roadNote(g)).toBeNull();
    g.roadside = [{ id: 'r1', lines: [{ material: 'cable' as never, qty: 1 }], hours: 3, done: 0 } as never];
    g.site.improvements.drive = false as never;
    expect(roadNote(g)).toMatch(/no drive in/);
    g.site.improvements.drive = true as never;
    expect(roadNote(g)).toBeNull();
  });
  it('is on the guidance card text', () => { expect(guidanceStuckWhy()).toBe(true); });
});

describe('3c. a second tier of goals once Get operational is done', () => {
  it('six goals, each one button or an honest line, from existing systems', () => {
    const m = midGoals(peace());
    expect(m.heading).toBe(MID_HEADING);
    expect(m.total).toBe(6); expect(m.complete).toBe(false);
    for (const g of m.goals) { expect(g.why.length).toBeGreaterThan(20); expect(g.id).toMatch(/^mid_/); }
    expect(m.goals.filter(g => g.act).length).toBeGreaterThanOrEqual(5);
  });
  it('a year of food ticks when the shelf holds it', () => {
    const g = peace(); g.stock = { ...emptyStock(), canned: 900000 } as never;
    expect(midGoals(g).goals.find(x => x.id === 'mid_year_food')!.status).toBe('done');
  });
  it('the card leads with it when the first tier is complete', async () => {
    const { firstHour } = await import('./firstHour');
    const g = peace();
    // fake "complete" first tier through memory: everything seen and done
    const mem = { seen: ['roof', 'water', 'food', 'power', 'drive', 'fence'] as never, done: ['roof', 'water', 'food', 'power', 'drive', 'fence'] as never };
    expect(firstHour(g, undefined, mem).complete).toBe(true);
    const w = whatToDo(g, { goalMem: mem });
    const goal = w.rows.find(r => r.kind === 'goal');
    expect(goal?.id).toMatch(/^goal:mid_/);
    expect(w.progress?.heading).toBe(MID_HEADING);
    expect(whatToDo(g, { goalMem: mem, goalsClosed: 'dismissed' }).rows.some(r => r.kind === 'goal')).toBe(false);
  });
});

describe('4. two prices, labeled', () => {
  it('list and market agree when nothing is marked up, and market is what an order costs', () => {
    const g = peace();
    const a = listAndMarket(g, 'timber_cabin');
    expect(a.market).toBeGreaterThanOrEqual(a.list);
    g.disaster.phase = 'survival'; g.clock.t = g.disaster.hitAt + 40;
    const b = listAndMarket(g, 'timber_cabin');
    expect(b.list).toBe(a.list);
    expect(b.marked).toBe(b.market > b.list * 1.05);
    const q = ownBuildQuote(g, 'guest_house', 2);
    expect(q.list).toBeLessThanOrEqual(q.cost);
  });
});
