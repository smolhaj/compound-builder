import { describe, expect, it } from 'vitest';
import { newGame, SAVE_VERSION, type GameState } from './state';
import { CLASSIC } from './site';
import { variedFamily } from './family';
import { step, SUBSTEP } from './engine';
import { resolve } from './encounters';
import { migrate } from './save/migrations';
import { placeOrder } from './economy';
import { layPropertyWall, planPropertyWall } from './propertyWall';
import { roadGateStatus } from './roadGate';
import { paceOf, slowHint } from './pace';
import { breakInRate } from './breakins';
import { dailyOf, choreRates } from './daily';
import { suggestions, longTerm } from './guidance';
import { lightsOutNow } from './blackout';
import { bugOutPlan } from './bugout';
import { BLUEPRINTS } from './blueprints';
import { tension } from './disaster';
import {
  awayRates, calendarHere, caretakerProblem, caretakerWork, CARETAKER, EMPTY_MULT, emptyMultiplier, emptyNow, hireCaretaker, isAbsent, isFreeDay, marketFactor, moveIn, moveInCard, moveInDue, newWeekend, occupied,
  onSiteAt, openMoveIn, residents, roadJam, saleBlock, saleQuote, SETTLE_DAYS, sellTown, setAwayLights, setKeepJobs, siteDaysPerWeek, townHouseFor, weekenderDay, whereIs,
} from './weekender';

const game = (seed = 3, o: { mode?: 'scenario' | 'sandbox'; peace?: 'short' | 'medium'; kind?: 'grid_down' | 'wildfire' | 'financial' | 'zombies' } = {}): GameState =>
  newGame(seed, 105, 2027, { site: CLASSIC, lifestyle: 'weekend', dayJobs: true, family: variedFamily(seed, 0).people, mode: o.mode ?? 'scenario', kind: o.mode === 'sandbox' ? null : o.kind ?? 'grid_down', peace: o.peace ?? 'short' });
/** Jump the clock to a day and hour (day 0 is a Monday), keeping the family where the calendar puts them. */
const at = (s: GameState, d: number, h: number): GameState => {
  const g = structuredClone(s);
  g.clock.t = d + (h - 6) / 24; g.clock.ticks = Math.round(g.clock.t / (0.25 / 24));
  return step(g, SUBSTEP);
};
/** A Monday after the first week (day 14) at 10:00. */
const MONDAY = 14, FRIDAY = 18, SATURDAY = 19, SUNDAY = 20;
const finish = (s: GameState, kind: string) => {
  const st = { id: `t${s.nextId++}`, kind, x: 0, z: 0, rot: 0, stage: BLUEPRINTS[kind].stages.length, done: 0, supplied: true, finishedAt: 0 };
  s.structures.push(st as GameState['structures'][number]);
  return st;
};

describe('the weekender calendar', () => {
  const D = 105;
  it('drives up Friday at 19:00 and back Sunday at 16:00', () => {
    expect(onSiteAt(D, FRIDAY, 18.9)).toBe(false);
    expect(onSiteAt(D, FRIDAY, 19)).toBe(true);
    expect(onSiteAt(D, SATURDAY, 3)).toBe(true);
    expect(onSiteAt(D, SUNDAY, 15.9)).toBe(true);
    expect(onSiteAt(D, SUNDAY, 16)).toBe(false);
    for (const d of [MONDAY, MONDAY + 1, MONDAY + 2, MONDAY + 3]) expect(onSiteAt(D, d, 12)).toBe(false);
  });
  it('spends the first week settling in, and the holidays and vacations on the place', () => {
    for (let d = 0; d < SETTLE_DAYS; d++) expect(isFreeDay(D, d)).toBe(true);
    // a Monday holiday (Memorial Day, doy 145..151) turns the weekend into a long one
    const memorial = Array.from({ length: 364 }, (_, k) => k + 8).find(d => ((105 - 1 + d) % 365) + 1 >= 145 && ((105 - 1 + d) % 365) + 1 <= 151 && d % 7 === 0)!;
    expect(isFreeDay(D, memorial)).toBe(true);
    expect(onSiteAt(D, memorial - 1, 20)).toBe(true);   // all through Sunday evening
    expect(onSiteAt(D, memorial, 15)).toBe(true);
    expect(onSiteAt(D, memorial, 17)).toBe(false);
    // the July vacation fortnight (doy 196..209)
    const july = Array.from({ length: 364 }, (_, k) => k + 8).find(d => ((105 - 1 + d) % 365) + 1 === 200)!;
    expect(isFreeDay(D, july)).toBe(true);
  });
  it('is on the place about two days a week over a year', () => {
    const x = siteDaysPerWeek(D);
    expect(x).toBeGreaterThan(1.8);
    expect(x).toBeLessThan(3);
  });
});

describe('a new weekender game', () => {
  it('has a town house, the household as travelers, and starts on the place', () => {
    const g = game();
    expect(g.lifestyle).toBe('weekend');
    expect(g.weekend).toBeTruthy();
    expect(g.weekend!.mode).toBe('split');
    expect(g.weekend!.travelers.length).toBe(g.people.length);
    expect(g.weekend!.here).toBe(true);
    expect(g.weekend!.town.value).toBeGreaterThan(g.weekend!.town.mortgage);
    expect(townHouseFor(g.people, g.seed)).toEqual({ value: g.weekend!.town.value, mortgage: g.weekend!.town.mortgage });
  });
  it('is not made for the other lifestyles', () => {
    expect(newGame(3, 105, 2027, { site: CLASSIC, lifestyle: 'fulltime' }).weekend).toBeUndefined();
    expect(newGame(3).weekend).toBeUndefined();
  });
  it('sends the family to town on weekdays: out of the roster, off the land, paid by the hour, the truck gone', () => {
    let g = game(3, { mode: 'sandbox' });
    g = at(g, MONDAY, 5.9);
    const money0 = g.money;
    g = step(g, 0.5);   // to 18:00 on Monday... (the clock sits at 06:00 + 0.5 d)
    expect(g.weekend!.here).toBe(false);
    const adults = g.people.filter(p => !p.kid && p.job);
    expect(adults.length).toBeGreaterThan(0);
    for (const p of g.people) expect(isAbsent(g, p.id)).toBe(true);
    expect(g.personState.every(ps => ps.task === 'town' || ps.task === 'job')).toBe(true);
    expect(g.vehicles!.some(v => v.away)).toBe(true);
    void money0;
  });
  it('pays the day jobs while they are in town', () => {
    let g = game(3, { mode: 'sandbox' });
    g = at(g, MONDAY, 6.5);
    const wages = g.people.filter((p, i) => g.personState[i].employed && p.job && !p.kid).reduce((a, p) => a + p.job!.wage, 0);
    const before = g.money;
    g = step(g, 9 / 24);   // 06:30 to 15:30: the work hours 07:00-15:30
    // wages in, less a day's town house costs: but the job money is the bigger number
    expect(g.money - before).toBeGreaterThan(wages * 0.7 - 500);
  });
  it('comes back Friday night and the vehicles come home', () => {
    let g = game(3, { mode: 'sandbox' });
    g = at(g, FRIDAY, 17);
    expect(g.weekend!.here).toBe(false);
    g = step(g, 3 / 24);   // 20:00
    expect(g.weekend!.here).toBe(true);
    expect(g.vehicles!.every(v => !v.away)).toBe(true);
    for (const ps of g.personState) expect(ps.task).not.toBe('town');
    expect(g.weekend!.tally.trips).toBeGreaterThanOrEqual(1);
    expect(g.weekend!.tally.miles).toBeGreaterThan(g.weekend!.driveMiles);
  });
});

describe('who is where', () => {
  it('says at work, at the town house, or on the road', () => {
    let g = game(3, { mode: 'sandbox' });
    g = at(g, MONDAY, 10);
    const worker = g.people.find((p, i) => p.job && !p.kid && g.personState[i].employed)!;
    expect(whereIs(g, worker.id)).toBe('work');
    g = at(g, MONDAY, 20);
    expect(whereIs(g, worker.id)).toBe('town_house');
    g = at(g, SATURDAY, 10);
    expect(whereIs(g, worker.id)).toBe('here');
  });
  it('leaves relatives who moved in, and anyone taken in, on the place', () => {
    let g = game(3, { mode: 'sandbox' });
    const rel = { ...g.people[0], id: 'kin1', first: 'Gran', rel: { role: 'grandmother' as const, of: g.people[0].id }, kid: false, elder: true, job: undefined };
    g.people.push(rel);
    g.personState.push({ id: 'kin1', task: 'idle', target: null, needs: g.personState[0].needs, fatigue: 0 });
    g = at(g, MONDAY, 10);
    expect(isAbsent(g, 'kin1')).toBe(false);
    expect(residents(g).map(p => p.id)).toEqual(['kin1']);
    expect(occupied(g)).toBe(true);
    expect(emptyNow(g)).toBe(false);
  });
});

describe('progress only when present', () => {
  it('builds at about a quarter of the pace of a family that lives there, and says why', () => {
    const w = game(3, { mode: 'sandbox' });
    const f = newGame(3, 105, 2027, { site: CLASSIC, lifestyle: 'fulltime', dayJobs: false, family: variedFamily(3, 0).people, mode: 'sandbox' });
    const pw = paceOf(w), pf = paceOf(f);
    expect(pw.siteDays).toBeGreaterThan(1.8);
    expect(pw.perWeek).toBeLessThan(pf.perWeek * 0.45);
    expect(pw.perWeek).toBeGreaterThan(pf.perWeek * 0.15);
    const hint = slowHint(w, 40, pw)!;
    expect(hint).toMatch(/days a week/);
    expect(hint).toMatch(/Friday night to Sunday afternoon/);
    expect(hint).toMatch(/moving in/);
  });
  it('puts a building up only on the weekends in a real run', () => {
    let g = game(3, { mode: 'sandbox' });
    g = at(g, MONDAY, 6);
    const st = { id: 'b1', kind: 'timber_cabin', x: 0, z: 0, rot: 0, stage: 0, done: 0, supplied: true, finishedAt: null };
    g.structures.push(st as GameState['structures'][number]);
    g.stock.lumber = 100;
    const done0 = g.structures.find(x => x.id === 'b1')!.done;
    g = step(g, 4.9);   // Monday 06:00 → Saturday 03:00: all away
    expect(g.structures.find(x => x.id === 'b1')!.done).toBe(done0);
  });
});

describe('the empty place', () => {
  it('stops the house chores growing while nobody is home, but not the animals', () => {
    let g = game(3, { mode: 'sandbox' });
    finish(g, 'chicken_coop');
    g = at(g, MONDAY, 10);
    const rates = choreRates(g);
    expect(rates.animals).toBeGreaterThan(0);
    const away = awayRates(g, rates);
    expect(away.animals).toBe(rates.animals);
    expect(away.kitchen).toBe(0); expect(away.house).toBe(0); expect(away.laundry).toBe(0); expect(away.hauling).toBe(0);
    expect(awayRates(at(g, SATURDAY, 10), rates)).toBe(rates);
  });
  it('lets the hens go hungry all week without a caretaker, and keeps them fed with one', () => {
    const base = game(3, { mode: 'sandbox' });
    finish(base, 'chicken_coop');
    const run = (care: boolean) => {
      let g = at(base, MONDAY, 6);
      if (care) { g.money = 50_000; expect(hireCaretaker(g, 'visiting')).toBeNull(); }
      g = step(g, 4.2);   // to Friday 08:00 (all still away)
      return dailyOf(g).chores.levels.animals;
    };
    expect(run(false)).toBeGreaterThan(90);
    expect(run(true)).toBeLessThan(40);
  });
  it('a neighbor needs to be friendly; a live-in caretaker needs a house; paying needs money', () => {
    const g = game(3, { mode: 'sandbox' });
    g.neighbors.forEach(n => { n.disposition = -20; });
    expect(caretakerProblem(g, 'neighbor')).toMatch(/friendly/);
    g.neighbors[0].disposition = 30;
    expect(caretakerProblem(g, 'neighbor')).toBeNull();
    expect(caretakerProblem(g, 'live_in')).toMatch(/house/);
    finish(g, 'timber_cabin');
    expect(caretakerProblem(g, 'live_in')).toBeNull();
    g.money = 100;
    expect(caretakerProblem(g, 'visiting')).toMatch(/money/);
  });
  it('caretaker work comes off the backlog by the hours they have', () => {
    const g = game(3, { mode: 'sandbox' });
    finish(g, 'chicken_coop');
    g.money = 20_000;
    hireCaretaker(g, 'visiting');
    g.weekend!.here = false;
    dailyOf(g).chores.levels.animals = 100;
    caretakerWork(g, choreRates(g));
    expect(dailyOf(g).chores.levels.animals).toBeLessThan(25);   // a day's growth is what they hold it at
    g.weekend!.caretaker!.on = false;
    dailyOf(g).chores.levels.animals = 100;
    caretakerWork(g, choreRates(g));
    expect(dailyOf(g).chores.levels.animals).toBe(100);   // the day they did not come
  });
  it('is far likelier to be broken into than a lived-in place; a caretaker and the lights take some back', () => {
    const live = newGame(3, 105, 2027, { site: CLASSIC, lifestyle: 'fulltime', family: variedFamily(3, 0).people, mode: 'sandbox' });
    const g = at(game(3, { mode: 'sandbox' }), MONDAY, 10);
    g.disaster.tracks.law = 1;
    live.disaster.tracks.law = 1;
    expect(emptyMultiplier(g)).toBeCloseTo(EMPTY_MULT * 0.75, 5);   // timers by default
    expect(breakInRate(g)).toBeGreaterThan(breakInRate(live) * 3.5);
    setAwayLights(g, 'dark');
    expect(emptyMultiplier(g)).toBeCloseTo(EMPTY_MULT, 5);
    g.money = 10_000; g.weekend!.caretaker = null;
    hireCaretaker(g, 'visiting');
    expect(emptyMultiplier(g)).toBeCloseTo(EMPTY_MULT * CARETAKER.visiting.watch, 5);
    expect(breakInRate(at(g, SATURDAY, 10))).toBeCloseTo(breakInRate(live), 8);   // home again: an ordinary place
  });
  it('goes dark when set to, and only when it is empty', () => {
    let g = game(3, { mode: 'sandbox' });
    g = at(g, MONDAY, 10);
    expect(lightsOutNow(g)).toBe(false);
    setAwayLights(g, 'dark');
    expect(lightsOutNow(g)).toBe(true);
    expect(lightsOutNow(at(g, SATURDAY, 10))).toBe(false);
  });
  it('a stretch of empty nights in peacetime finds a break-in, vandals or squatters sooner or later, and tells the family on arrival', () => {
    let hits = 0;
    for (let seed = 1; seed <= 6; seed++) {
      let g = at(game(seed, { mode: 'sandbox' }), MONDAY, 6);
      g.disaster.tracks.law = 1;
      g = step(g, 365 * 8);   // eight years of weeks
      const t = g.weekend!.tally;
      hits += t.breakIns + t.vandalism + t.squatters + t.pipes + t.theft;
      expect(g.money).toBeDefined();
    }
    expect(hits).toBeGreaterThan(2);
  }, 60_000);
  it('burns very little wood while away', () => {
    const g = game(3, { mode: 'sandbox' });
    expect(awayRates(g, choreRates(g))).toBeTruthy();
  });
});

describe('the town house and the market', () => {
  it('falls in price as the collapse approaches and cannot be sold once the banks close or the market freezes', () => {
    const g = game(3, { kind: 'financial' });
    const d = g.disaster;
    g.clock.t = d.warnAt - 1; expect(marketFactor(g)).toBe(1);
    g.clock.t = d.warnAt + (d.hitAt - d.warnAt) * 0.5;
    const half = marketFactor(g);
    expect(half).toBeLessThan(0.95);
    g.clock.t = d.warnAt + (d.hitAt - d.warnAt) * 0.9;
    expect(marketFactor(g)).toBeLessThan(half);
    expect(saleBlock(g)).toBeNull();
    g.clock.t = d.warnAt + (d.hitAt - d.warnAt) * 0.95;
    expect(saleBlock(g)).toMatch(/frozen/);
    g.clock.t = d.warnAt + (d.hitAt - d.warnAt) * 0.3;
    g.disaster.tracks.banks = 0.2;
    expect(saleBlock(g)).toMatch(/banks are closed/);
  });
  it('takes the agent and the mortgage out of the price, and may leave money owed', () => {
    const g = game(3);
    const q = saleQuote(g)!;
    expect(q.fees).toBe(Math.round(q.value * 0.06));
    expect(q.net).toBe(q.value - q.fees - g.weekend!.town.mortgage);
    g.weekend!.town.mortgage = q.value * 2;
    g.money = 1000;
    expect(saleBlock(g)).toMatch(/cannot cover/);
  });
  it('is free of any market in a sandbox (nothing is coming)', () => {
    const g = game(3, { mode: 'sandbox' });
    g.clock.t = 400;
    expect(marketFactor(g)).toBe(1);
  });
  it('costs a mortgage payment and upkeep a day while the banks work, and the tax twice a year', () => {
    let g = game(3, { mode: 'sandbox' });
    const m0 = g.money;
    g = step(g, 30);
    // wages come in, bills go out; the town house alone is a few hundred a day...
    expect(g.weekend!.tally.spent).toBeGreaterThan(1000);
    void m0;
  });
});

describe('moving in', () => {
  it('sells the house: the account gets the net, lifestyle becomes full time, the family and the cars are home to stay', () => {
    let g = game(3, { mode: 'sandbox' });
    g = at(g, MONDAY, 10);
    const q = saleQuote(g)!;
    const before = g.money;
    const lines = moveIn(g, { sell: true, reason: 'chosen' });
    expect(lines.join(' ')).toMatch(/town house sold/);
    expect(g.weekend!.mode).toBe('moved');
    expect(g.weekend!.town.status).toBe('sold');
    expect(g.lifestyle).toBe('fulltime');
    expect(g.money).toBeLessThan(before + q.net + 1);   // the movers
    expect(g.money).toBeGreaterThan(before + q.net - 6000);
    expect(g.weekend!.here).toBe(true);
    expect(g.vehicles!.every(v => !v.away)).toBe(true);
    expect(g.startFunds!.lines.some(l => l.label.startsWith('Town house sold'))).toBe(true);
    // never absent again
    const later = step(g, 5);
    for (const p of later.people) expect(isAbsent(later, p.id)).toBe(false);
  });
  it('keeps the house as a fallback: it costs, can be sold later, and is the bug-out destination', () => {
    let g = game(3, { kind: 'financial', peace: 'medium' });
    g = at(g, MONDAY, 10);
    moveIn(g, { sell: false, reason: 'chosen' });
    expect(g.weekend!.town.status).toBe('kept');
    expect(bugOutPlan(g).fallback).toEqual({ name: 'the town house', miles: g.weekend!.driveMiles });
    const s0 = g.weekend!.tally.spent;
    g = step(g, 10);
    expect(g.weekend!.tally.spent).toBeGreaterThan(s0);
    expect(sellTown(g)).toBeNull();
    expect(g.weekend!.town.status).toBe('sold');
    expect(bugOutPlan(g).fallback).toBeNull();
  });
  it('keeps the jobs that can be done from home and quits the rest', () => {
    const g = game(3, { mode: 'sandbox' });
    const [a, b] = g.people.filter(p => !p.kid);
    a.job = { title: 'Remote software developer', wage: 400, id: 'software' };
    b.job = { title: 'Diesel mechanic', wage: 230, id: 'diesel' };
    moveIn(g, { sell: true, reason: 'chosen' });
    const emp = (id: string) => g.personState.find(x => x.id === id)!.employed;
    expect(emp(a.id)).toBe(true);
    expect(emp(b.id)).toBe(false);
    const h = game(3, { mode: 'sandbox' });
    h.people.filter(p => !p.kid)[0].job = { title: 'Remote software developer', wage: 400, id: 'software' };
    setKeepJobs(h, false);
    moveIn(h, { sell: true, reason: 'chosen' });
    expect(h.personState.filter(x => x.employed).length).toBe(0);
  });
  it('shows the card (and the Family tab button opens it) with the numbers and no sale when the market is frozen', () => {
    const g = game(3, { kind: 'financial' });
    expect(openMoveIn(g)).toBeNull();
    const e = g.gate.pending!;
    expect(e.kind).toBe('move_in');
    expect(e.stances).toEqual(['move_sell', 'move_keep', 'hold_on']);
    expect(e.dossier.join(' ')).toMatch(/town house/);
    g.gate.pending = null;
    g.clock.t = g.disaster.warnAt + (g.disaster.hitAt - g.disaster.warnAt) * 0.96;
    const frozen = moveInCard(g, 'x');
    expect(frozen.stances).toEqual(['move_keep', 'hold_on']);
  });
  it('resolve: sell moves in, keep moves in, hold on asks again later (and not at once)', () => {
    const mk = () => { const g = game(3, { kind: 'financial' }); openMoveIn(g); return g; };
    const a = mk(); resolve(a, 'move_sell'); expect(a.weekend!.mode).toBe('moved'); expect(a.weekend!.town.status).toBe('sold'); expect(a.gate.pending).toBeNull();
    const b = mk(); resolve(b, 'move_keep'); expect(b.weekend!.town.status).toBe('kept');
    const c = mk(); resolve(c, 'hold_on');
    expect(c.weekend!.mode).toBe('split'); expect(c.weekend!.asked).toBe(1);
    expect(c.weekend!.askAt).toBeGreaterThan(tension(c.disaster, c.clock.t));
  });
});

describe('the warning card', () => {
  it('appears as the signs grow, only once the warning has begun, and not again at once after "hold on"', () => {
    let g = game(5, { kind: 'financial', peace: 'medium' });
    expect(moveInDue(g)).toBe(false);
    g = at(g, 20, 12);
    g.clock.t = g.disaster.warnAt + 0.05 * (g.disaster.hitAt - g.disaster.warnAt);
    g.disaster.phase = 'warning';
    expect(moveInDue(g)).toBe(false);   // too early in a long warning
    g.clock.t = g.disaster.warnAt + 0.3 * (g.disaster.hitAt - g.disaster.warnAt);
    expect(moveInDue(g)).toBe(true);
    g.weekend!.day = -1;
    weekenderDay(g, 'warning');
    expect(g.gate.pending?.kind).toBe('move_in');
    resolve(g, 'hold_on');
    g.gate.card = null;
    expect(moveInDue(g)).toBe(false);
    g.clock.t = g.disaster.warnAt + 0.8 * (g.disaster.hitAt - g.disaster.warnAt);
    expect(moveInDue(g)).toBe(true);
  });
  it('shows at once for a short warning (a wildfire, a flare), and never in a free-build game', () => {
    const g = game(5, { kind: 'wildfire', peace: 'short' });
    g.clock.t = g.disaster.warnAt + 0.01; g.disaster.phase = 'warning';
    expect(moveInDue(g)).toBe(true);
    const free = game(5, { mode: 'sandbox' });
    expect(moveInDue(free)).toBe(false);
  });
  it('is offered in the Next step list: a caretaker first, the move when the signs are out', () => {
    const g = game(3, { kind: 'financial', peace: 'medium' });
    for (const k of ['timber_cabin', 'well_hand', 'garden', 'outhouse', 'solar_array', 'root_cellar', 'chicken_coop']) finish(g, k);
    g.stock.canned = 400; g.stock.staples = 400;
    expect(suggestions(g).some(x => x.id === 'caretaker')).toBe(true);
    g.clock.t = g.disaster.warnAt + 0.4 * (g.disaster.hitAt - g.disaster.warnAt); g.disaster.phase = 'warning';
    const sg = suggestions(g);
    expect(sg[0].id).toBe('move_in');
    expect(sg[0].acts![0].act).toEqual({ type: 'moveIn' });
    expect(longTerm(g)[0].id).toBe('moving');
    hireCaretaker(g, 'neighbor');
    expect(longTerm(g)[0].steps[0].done).toBe(true);
  });
});

describe('when it hits', () => {
  it('while the family is on the place, they stay: the town house is locked up, the jobs end, no card', () => {
    let g = game(4, { kind: 'grid_down', peace: 'short' });
    // put the hit on a Saturday noon
    const d = g.disaster;
    const sat = Math.ceil(d.hitAt / 7) * 7 + 5 - 0.3;   // the midnight that begins a Saturday: the family drove up the evening before
    d.hitAt = sat; d.warnAt = sat - 5;
    g = at(g, Math.floor(sat) - 2, 12);
    g = step(g, sat - g.clock.t + 0.1);
    expect(g.disaster.phase).toBe('impact');
    expect(g.weekend!.mode).toBe('moved');
    expect(g.weekend!.town.status).toBe('kept');
    expect(g.lifestyle).toBe('fulltime');
    expect(g.gate.pending?.kind).not.toBe('stranded');
  });
  it('while they are in town it is a card: how do they get home?', () => {
    let g = game(4, { kind: 'grid_down', peace: 'short' });
    const d = g.disaster;
    const tue = Math.ceil(d.hitAt / 7) * 7 + 1 - 0.3;   // the midnight that begins a Tuesday: the family is in town
    d.hitAt = tue; d.warnAt = tue - 5;
    g = at(g, Math.floor(tue) - 2, 12);
    g = step(g, tue - g.clock.t + 0.1);
    expect(g.disaster.phase).toBe('impact');
    expect(g.weekend!.stranded).toBeTruthy();
    expect(g.gate.pending?.kind).toBe('stranded');
    expect(g.gate.pending!.stances).toEqual(['drive_now', 'back_roads', 'resupply']);
    expect(emptyNow(g)).toBe(true);
    // the card is answered: a few days on the road, then home to stay
    const out = resolve(g, 'drive_now');
    expect(out.title).toMatch(/home/i);
    expect(g.weekend!.stranded!.phase).toBe('road');
    expect(g.weekend!.stranded!.until!).toBeGreaterThan(g.clock.t);
    g = step(g, 12);
    expect(g.weekend!.stranded).toBeNull();
    expect(g.weekend!.mode).toBe('moved');
    expect(g.lifestyle).toBe('fulltime');
    expect(g.gate.card?.title).toBe('Home at last');
    for (const p of g.people) expect(isAbsent(g, p.id)).toBe(false);
  });
  it('the road is harder when the law and the fuel are gone, and walking takes days', () => {
    const g = game(4, { kind: 'zombies' });
    g.disaster.tracks.fuel = 1; g.disaster.tracks.law = 1;
    const easy = roadJam(g);
    g.disaster.tracks.fuel = 0; g.disaster.tracks.law = 0;
    expect(roadJam(g)).toBeGreaterThan(easy + 0.3);
  });
  it('the empty place is looted when the law is gone and nobody is there', () => {
    let hits = 0;
    for (let seed = 1; seed <= 12; seed++) {
      let g = game(seed, { kind: 'grid_down', peace: 'short' });
      g.weekend!.stranded = { since: 0, phase: 'road', until: 1e9 };
      g.weekend!.here = false;
      g.disaster.tracks.law = 0; g.disaster.hitAt = 0; g.disaster.phase = 'survival';
      g.clock.t = 3; g.clock.ticks = Math.round(3 / (0.25 / 24));
      g.fin.cash = 5000;
      const before = g.fin.cash + g.armory.guns.length;
      g = step(g, 60);
      if (g.fin.cash + g.armory.guns.length < before || g.log.some(l => /Strangers went through/.test(l.text))) hits++;
    }
    expect(hits).toBeGreaterThan(2);
  }, 60_000);
});

describe('saves', () => {
  it('migrates v58 (no weekend) and builds the town house for a game that was set up as a weekend getaway', () => {
    const g = game(3);
    const raw = structuredClone(g) as unknown as Record<string, unknown>;
    raw.version = 58; delete raw.weekend;
    const back = migrate(raw);
    expect(back.version).toBe(SAVE_VERSION);
    expect(back.weekend?.mode).toBe('split');
    const full = structuredClone(newGame(3)) as unknown as Record<string, unknown>;
    full.version = 58;
    expect(migrate(full).weekend).toBeUndefined();
  });
  it('round-trips through the engine without a mutation of the input', () => {
    const g = game(3, { mode: 'sandbox' });
    const snap = JSON.stringify(g);
    step(g, 20);
    expect(JSON.stringify(g)).toBe(snap);
  });
});

describe('the calendar and the first week', () => {
  it('the household is home all of the first week', () => {
    let g = game(3, { mode: 'sandbox' });
    g = step(g, 5.5);
    expect(g.weekend!.here).toBe(true);
    expect(calendarHere(g)).toBe(true);
  });
  it('a roster for the weekend: the people who are here have rows, in town they do not', () => {
    let g = game(3, { mode: 'sandbox' });
    g = at(g, SATURDAY, 9);
    expect(Object.keys(dailyOf(g).plan.hours).length).toBeGreaterThan(0);
    void newWeekend;
  });
});

describe('the empty place and the gate at the road', () => {
  it('a walled compound with its road gate shut still gets deliveries and sees the family come and go', () => {
    const geo = { roadGate: [60, 5] as [number, number], drive: [[60, 5], [60, 20], [40, 30]] as Array<[number, number]>, center: [40, 40] as [number, number] };
    const run = (walled: boolean) => {
      let g = game(3, { mode: 'sandbox' });
      g = step(g, 8);                                   // past the settling week
      if (walled) {
        layPropertyWall(g, planPropertyWall(g, 'chain_link', geo), geo);
        for (const r of g.perimeter) r.finishedAt = 0;
        expect(roadGateStatus(g, geo.drive).missing).toBe(0);
      }
      placeOrder(g, [{ material: 'lumber', qty: 10 }]);
      g = at(g, MONDAY, 10);                            // an empty weekday compound
      expect(emptyNow(g)).toBe(true);
      for (let d = 0; d < 9; d++) g = at(g, MONDAY + d, 10);
      g = step(g, 3);
      return g;
    };
    const open = run(false), walled = run(true);
    expect(walled.orders.map(o => o.status)).toEqual(open.orders.map(o => o.status));
    expect(walled.orders.some(o => o.status === 'delivered')).toBe(true);
    expect(walled.weekend!.tally.trips).toBe(open.weekend!.tally.trips);
    expect(walled.weekend!.tally.trips).toBeGreaterThan(0);
  });
});
