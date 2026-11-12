import { describe, expect, it } from 'vitest';
import { dayIndex, newGame } from './state';
import { freshNeeds } from './needs';
import { coldDay, rooflessGain } from './cold';
import { weatherDay, weatherOf } from './weatherThreats';
import { plansNeedLines, suggestions } from './guidance';
import { placeOrder } from './economy';
import { lineRows } from './priority';
import { compactCard } from './feedbackDiff';
import { useGameStore } from '../store/gameStore';
import { crewWeeksFor, totalHoursLeft, weeksUntil } from './pace';
import type { Person } from './family';

const adult = { id: 'a', first: 'Ann', last: 'Doe', age: 35, kid: false } as Person;

describe('a home that lost its roof', () => {
  it('halves the chill gain while the stove is lit, and leaves everything else alone', () => {
    const g = newGame(5, 15);
    g.structures.push({ id: 'h', kind: 'timber_cabin', x: 30, z: 30, rot: 0, stage: 3, done: 0, supplied: false, finishedAt: null, roofLost: true });
    expect(rooflessGain(g, true)).toBe(0.5);
    expect(rooflessGain(g, false)).toBe(1);
    const a = freshNeeds(), b = freshNeeds();
    coldDay(adult, a, 0, false, []);
    coldDay(adult, b, 0, false, [], rooflessGain(g, true));
    expect(b.chill).toBeCloseTo((a.chill ?? 0) / 2);
  });
  it('a blizzard drops a roof at most once per run', () => {
    let any = 0;
    for (let seed = 1; seed <= 30; seed++) {
      let fell = 0;
      const g = newGame(seed, 15);
      g.structures.push({ id: 'h', kind: 'timber_cabin', x: 30, z: 30, rot: 0, stage: 5, done: 0, supplied: true, finishedAt: 0, fixes: [{ part: 'roof', done: 0, hours: 40 } as never] });
      for (let k = 0; k < 4; k++) {
        const st = g.structures[0];
        if (st.roofLost) { delete st.roofLost; st.finishedAt = 0; st.stage = 5; st.fixes = [{ part: 'roof', done: 0, hours: 40 } as never]; }
        const d = dayIndex(g.clock.t);
        g.weather = { ...weatherOf(g), active: { kind: 'blizzard', at: d, until: d + 1 }, last: -999 };
        if (weatherDay(g).some(l => /snow load/.test(l))) fell++;
        g.clock.t += 5;
      }
      expect(fell).toBeLessThanOrEqual(1);
      any += fell;
    }
    expect(any).toBeGreaterThan(0);
  });
  it('the re-roof card offers order and crew in one tap', () => {
    const g = newGame(5, 15);
    g.money = 150000;
    g.structures.push({ id: 'h', kind: 'timber_cabin', x: 30, z: 30, rot: 0, stage: 3, done: 0, supplied: false, finishedAt: null, roofLost: true });
    const c = suggestions(g, 10).find(x => x.id === 'reroof');
    expect(c).toBeTruthy();
    expect(suggestions(g, 1)[0].id).toBe('reroof');
    expect(c!.acts?.some(a => a.act.type === 'crew' && Array.isArray((a.act as { lines?: unknown }).lines))).toBe(true);
  });
});

describe('the slope retaining wall card', () => {
  const steep = () => {
    const g = newGame(5, 105);
    g.structures.length = 0;
    const st = { id: 'o', kind: 'outhouse', x: 30, z: 30, rot: 0, stage: 0, done: 0, supplied: false, finishedAt: null, grade: 0.18 };
    g.structures.push(st as never);
    g.stock.fieldstone = 0;
    return g;
  };
  const card = (g: ReturnType<typeof newGame>) => suggestions(g, 20).find(x => x.id === 'retaining')!;
  it('never says you have the stone when the yard is empty', () => {
    const g = steep();
    const need = plansNeedLines(g).find(l => l.material === 'fieldstone')!.qty;
    expect(need).toBeGreaterThanOrEqual(9);
    expect(card(g).why).not.toMatch(/you have them/);
    expect(card(g).acts?.some(a => a.act.type === 'order')).toBe(true);
  });
  it('says the stone is on order once it is, and the plans-need list holds the wall stone', () => {
    const g = steep();
    g.money = 100000;
    expect(placeOrder(g, plansNeedLines(g))).not.toBeNull();
    expect(card(g).why).toMatch(/on order/);
    expect(card(g).why).not.toMatch(/you have them/);
  });
  it('stone in the yard for the wall but short for another plan still offers the order', () => {
    const g = steep();
    g.stock.fieldstone = 9;
    g.structures.push({ id: 'c', kind: 'outhouse', x: 40, z: 40, rot: 0, stage: 0, done: 0, supplied: false, finishedAt: null } as never);
    expect(card(g).acts?.some(a => a.act.type === 'order')).toBe(true);
  });
});

describe('the pace box counts hired crews', () => {
  it('a building with a crew on it is timed by the crew, not the family', () => {
    const g = newGame(5, 105);
    g.structures.length = 0;
    g.structures.push({ id: 'c', kind: 'cottage', x: 30, z: 30, rot: 0, stage: 0, done: 0, supplied: true, finishedAt: null } as never);
    const slow = weeksUntil(g, 'c')!, hours = totalHoursLeft(g);
    g.crews = [{ id: 'k', target: 'c', hiredAt: 0, hours: 0, paid: 0 }];
    expect(totalHoursLeft(g)).toBe(0);
    const fast = weeksUntil(g, 'c')!;
    expect(hours).toBeGreaterThan(0);
    expect(fast).toBeLessThan(slow);
    expect(fast).toBeCloseTo(hours / 180, 5);
    expect(crewWeeksFor(g, 'c')).toBeCloseTo(fast, 5);
  });
});

describe('goal popups and the welcome line', () => {
  it('a goal card is a small strip while the clock runs, the parchment card only when paused', () => {
    expect(compactCard({ kicker: 'Goal 1 of 6 done' }, true)).toBe(true);
    expect(compactCard({ kicker: 'Goal 1 of 6 done' }, false)).toBe(false);
    expect(compactCard({}, true)).toBe(false);
  });
  it('laying the starter compound closes the welcome line', () => {
    const st = useGameStore.getState();
    st.setWelcome(true);
    const n = st.layStarter([{ kind: 'outhouse', x: st.game.site.home.x0 + 6, z: st.game.site.home.z0 + 6, rot: 0 }], null, { center: null, drive: [] } as never);
    expect(n).toBeGreaterThan(0);
    expect(useGameStore.getState().welcome).toBe(false);
  });
});

describe('Lines going in', () => {
  it('two runs of one kind are one row', () => {
    const g = newGame(5, 105);
    const run = (id: string) => ({ id, kind: 'woven_wire', pts: [[0, 0], [10, 0]], gates: [], hours: 40, done: 0, supplied: false, finishedAt: null }) as never;
    g.perimeter = [run('a'), run('b')];
    const rows = lineRows(g);
    expect(rows).toHaveLength(1);
    expect(rows[0].label).toMatch(/Game fence.*2 runs/);
  });
});
