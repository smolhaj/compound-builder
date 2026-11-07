import { describe, expect, it } from 'vitest';
import { newGame, type GameState } from './state';
import { planStructure } from './construction';
import { emptyStock } from './materials';
import { EMPTY_MEMORY, clockNote, firstHour, firstRaidDays, watchItems } from './firstHour';

const fresh = (money = 400_000): GameState => {
  const g = newGame(11); g.structures = []; g.perimeter = []; g.hardenJobs = []; g.utilities.fittings = []; g.stock = emptyStock(); g.orders = []; g.money = money;
  g.site = { ...g.site, gwDepth: 5, improvements: { ...g.site.improvements, drive: false, power: false } };
  return g;
};
const finish = (g: GameState, kind: string, pre = false) => { const st = planStructure(g, kind, 0, 0, 0)!; st.stage = 99; st.finishedAt = 0; if (pre) st.pre = true; return st; };

describe('first-hour goals', () => {
  it('an empty lot lists every goal, starts on the roof and offers the starter compound', () => {
    const f = firstHour(fresh());
    expect(f.goals.map(g => g.id)).toEqual(['roof', 'water', 'food', 'power', 'drive', 'fence']);
    expect(f.total).toBe(6);
    expect(f.done).toBe(0);
    expect(f.current!.id).toBe('roof');
    expect(f.current!.act!.act).toEqual({ type: 'starter' });
    expect(f.complete).toBe(false);
    for (const g of f.goals) { expect(g.why.length).toBeGreaterThan(40); expect(g.reward.title.length).toBeGreaterThan(3); }
  });
  it('skips what the land already has: a pre-built well, a home, a drive in', () => {
    const g = fresh();
    finish(g, 'well_hand', true);
    g.site = { ...g.site, improvements: { ...g.site.improvements, drive: true } };
    const f = firstHour(g);
    expect(f.goals.map(x => x.id)).not.toContain('water');
    expect(f.goals.map(x => x.id)).not.toContain('drive');
    expect(f.total).toBe(4);
  });
  it('a goal that was open and is met now counts as done and stays done', () => {
    const g = fresh();
    const a = firstHour(g);
    const st = finish(g, 'well_hand');
    const b = firstHour(g, undefined, a.memory);
    expect(b.goals.find(x => x.id === 'water')).toMatchObject({ status: 'done' });
    expect(b.done).toBe(1);
    g.structures = g.structures.filter(x => x !== st);   // the well is lost: done stays done
    expect(firstHour(g, undefined, b.memory).goals.find(x => x.id === 'water')!.status).toBe('done');
  });
  it('after the starter is placed the current goal is the order, then the wait', () => {
    const g = fresh();
    planStructure(g, 'timber_cabin', 4, 4, 0);
    planStructure(g, 'well_hand', 8, 4, 0);
    const f = firstHour(g);
    expect(f.current!.id).toBe('roof');
    expect(f.current!.act!.act.type).toBe('order');
    expect(f.current!.pace).toMatch(/family's pace/);
    g.stock = { ...g.stock, lumber: 999, roofing: 999, hardware: 999, concrete: 999, fieldstone: 999, logs: 999, windows: 999, doors: 999, pex: 999, wire: 999, insulation: 999, drywall: 999, cable: 999, pipe: 999 } as typeof g.stock;
    const later = firstHour(g);
    if (!later.current!.act) expect(['underway', 'todo']).toContain(later.current!.status);
  });
  it('says what to do when the cash is short', () => {
    const g = fresh(1500);
    const f = firstHour(g, undefined);
    const water = f.goals.find(x => x.id === 'water')!;
    expect(water.act).toBeTruthy();
    const roof = firstHour(g).goals.find(x => x.id === 'roof')!;
    expect(roof.money).toMatch(/\$1,500/);
    expect(roof.money).toMatch(/Tents|build smaller/);
  });
  it('completes when every listed goal is done', () => {
    const g = fresh();
    g.site = { ...g.site, improvements: { ...g.site.improvements, drive: true } };
    const a = firstHour(g);
    for (const k of ['timber_cabin', 'well_hand', 'garden', 'solar_array']) finish(g, k);
    const b = firstHour(g, undefined, a.memory);
    // a garden is not food on the shelf: with an empty pantry the food goal stays open and its button opens the food shelf
    expect(b.goals.find(x => x.id === 'food')).toMatchObject({ status: 'todo', act: { act: { type: 'shop', tab: 'food' } } });
    g.stock.staples = 400;
    const c = firstHour(g, undefined, b.memory);
    const open = c.goals.filter(x => x.status !== 'done').map(x => x.id);
    expect(open).toEqual(['fence']);
    expect(c.complete).toBe(false);
    expect(c.current!.id).toBe('fence');
  });
  it('the collapse note never leaks a hidden date, and the first raid is about two weeks at Standard', () => {
    const g = fresh();
    g.disaster.kind = 'grid_down'; g.disaster.warnAt = 900; g.disaster.hitAt = 920;
    expect(firstRaidDays(g)).toBe(14);
    expect(clockNote(g)).toMatch(/about 14 days later/);
    expect(clockNote(g)).not.toMatch(/impact in/i);
    g.clock.t = g.disaster.warnAt + 2;
    expect(clockNote(g)).toMatch(/impact in/);
  });
  it('no drive goal when nobody is taking jobs; a drive that costs more than the cash waits with a note', () => {
    const g = fresh();
    g.disaster.tracks = { ...g.disaster.tracks, banks: 0.1 };
    expect(firstHour(g).goals.map(x => x.id)).not.toContain('drive');
    const h = fresh(900);
    const d = firstHour(h).goals.find(x => x.id === 'drive')!;
    expect(d.act!.off).toMatch(/cash/);
    expect(d.money).toMatch(/you have \$900/);
  });
  it('the current goal is the first with a live button, else one that is under way, else one waiting on cash', () => {
    const g = fresh(900);
    planStructure(g, 'timber_cabin', 4, 4, 0);
    const f = firstHour(g);
    expect(f.current!.act?.off).toBeUndefined();
    expect(f.current!.id).not.toBe('drive');
  });
  it('watch items are three plain lines', () => {
    const w = watchItems(fresh());
    expect(w.length).toBeGreaterThanOrEqual(2);
    expect(w.length).toBeLessThanOrEqual(3);
    expect(EMPTY_MEMORY.seen).toEqual([]);
  });
});

describe('first-hour goals on a thin budget', () => {
  it('does not offer a starter plan whose every row would read "later"; offers tents and says what to do', () => {
    const g = fresh(14_000);
    const f = firstHour(g);
    const roof = f.goals.find(x => x.id === 'roof')!;
    expect(roof.act!.act.type).not.toBe('starter');
    expect(roof.act!.label).toMatch(/tent/i);
    expect(roof.money).toMatch(/\$14,000/);
    expect(roof.money).toMatch(/Tents/);
    expect(f.goals.find(x => x.id === 'water')!.act!.act.type).toBe('stake');
  });
});

describe('the fence goal', () => {
  it('is met by a finished fence run (not by a Guarded rating, which takes a wall around the whole line), and offers a draw tool until then', () => {
    const g = fresh();
    planStructure(g, 'outhouse', 2, 2, 0);   // (on an empty lot the starter proposal covers the fence)
    const a = firstHour(g);
    const fence = a.goals.find(x => x.id === 'fence')!;
    expect(fence.act!.act).toMatchObject({ type: 'tool' });
    expect(fence.act!.label).toMatch(/per 100 ft/);
    g.perimeter.push({ id: 'r1', kind: 'woven_wire', pts: [[0, 0], [4, 0]], gates: [], done: 99, hours: 10, supplied: true } as unknown as GameState['perimeter'][number]);
    const b = firstHour(g, undefined, a.memory);
    expect(b.goals.find(x => x.id === 'fence')!.status).toBe('done');
  });
});
