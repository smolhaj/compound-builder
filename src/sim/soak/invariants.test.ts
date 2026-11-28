import { describe, expect, it } from 'vitest';
import { newGame } from '../state';
import { step } from '../engine';
import { planStructure } from '../construction';
import { checkState, firstDifference, hashState, nonFinitePaths, summarize, unsavablePaths } from './invariants';
import { liveDay } from '../needs';
import { exportJson, importJson } from '../save/migrations';

const fresh = () => newGame(7);
const codes = (s: ReturnType<typeof fresh>, prev?: ReturnType<typeof summarize>) => checkState(s, { prev }).map(v => v.code);

describe('soak invariants', () => {
  it('a new game and a week of it are clean', () => {
    let s = fresh();
    expect(codes(s)).toEqual([]);
    for (let d = 0; d < 7; d++) { const prev = summarize(s); s = step(s, 1); expect(checkState(s, { prev })).toEqual([]); }
  });
  it('finds NaN and Infinity anywhere, with the path', () => {
    const s = fresh();
    s.money = NaN; s.personState[0].needs.hunger = Infinity;
    expect(nonFinitePaths(s)).toEqual(expect.arrayContaining(['money=NaN', 'personState[0].needs.hunger=Infinity']));
    expect(codes(s)).toContain('nan');
  });
  it('finds a lost array value, a Map and a function', () => {
    expect(unsavablePaths({ a: [1, undefined], b: new Map(), c: () => 1 }).length).toBe(3);
  });
  it('flags negative stock and unexplained debt', () => {
    const s = fresh();
    s.stock.lumber = -3; s.money = -80_000;
    expect(codes(s)).toEqual(expect.arrayContaining(['stock_negative', 'money_negative']));
  });
  it('flags rosters out of step and orphaned references', () => {
    const s = fresh();
    s.personState.pop();
    s.crews.push({ id: 'c1', target: 'nope', hiredAt: 0, hours: 0, paid: 0 });
    s.utilities.fittings.push({ building: 'ghost', kind: 'wire', done: 0, hours: 10, supplied: false, finishedAt: null });
    s.focus = 'gone';
    expect(codes(s)).toEqual(expect.arrayContaining(['people_out_of_step', 'crew_orphan', 'fitting_orphan', 'focus_orphan']));
  });
  it('flags a finished building that vanishes without a word, but not one the log explains', () => {
    const s = fresh();
    const st = planStructure(s, 'garden', 5, 5, 0);
    st.stage = 99; st.finishedAt = 1;
    const prev = summarize(s);
    s.structures = s.structures.filter(x => x.id !== st.id);
    expect(codes(s, prev)).toContain('structure_vanished');
    s.log.push({ t: s.clock.t, text: 'Fire! The garden burns down.' });
    expect(codes(s, prev)).not.toContain('structure_vanished');
  });
  it('names a vanished solar array separately', () => {
    const s = fresh();
    const st = planStructure(s, 'solar_array', 5, 5, 0);
    st.stage = 99; st.finishedAt = 1;
    const prev = summarize(s);
    s.structures = s.structures.filter(x => x.id !== st.id);
    expect(codes(s, prev)).toContain('solar_vanished');
  });
  it('hashes equal states equal and different states different', () => {
    expect(hashState(newGame(3))).toBe(hashState(newGame(3)));
    expect(hashState(newGame(3))).not.toBe(hashState(newGame(4)));
  });
  it('the save round trip of a played state is identical', () => {
    let s = fresh();
    s = step(s, 30);
    expect(firstDifference(s, importJson(exportJson(s)))).toBeNull();
    const t = importJson(exportJson(s));
    t.money += 1;
    expect(firstDifference(s, t)).toBe('money: ' + s.money + ' vs ' + t.money);
  });
});

describe('soak regressions', () => {
  it('nobody at home to eat: the food report stays finite and survives a save (was daysLeft = Infinity -> null)', () => {
    const s = newGame(5);
    for (const ps of s.personState) ps.needs.died = 0;
    const r = liveDay(s, 0.5);
    expect(Number.isFinite(r.daysLeft)).toBe(true);
    s.food = r;
    expect(firstDifference(s, importJson(exportJson(s)))).toBeNull();
  });
});
