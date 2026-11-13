import { describe, expect, it } from 'vitest';
import { dayIndex, newGame, type GameState } from './state';
import { step } from './engine';
import { isFinished } from './construction';
import { isHome } from './blueprints';
import { suggestions } from './guidance';
import { placeOrder, orderProblem } from './economy';
import { hireCrew } from './crews';
import { daysToSeason, weatherOf } from './weatherThreats';
import { ROOF_GRACE_DAYS, roofEmergencyDay, winterRoofRisk, WINTER_ROOF_LEAD_DAYS } from './roofSafety';
import { affordable, listings } from './site';
import { generateFamily } from './family';
import { startFunds } from './startFunds';
import { orderHookup, placeImprovements, pendingFixes } from './improvements';
import { resolve } from './encounters';
import { botTurn } from './fuzz/passiveBot';
import type { RegionId } from './regions';

/** A finished farmhouse that came with the land and kept its old roof. */
function oldRoof(region: RegionId, doyAhead: number): GameState {
  const g = newGame(5, 105);
  g.site.region = region;
  g.structures.length = 0;
  g.structures.push({ id: 'h', kind: 'farmhouse', x: 30, z: 30, rot: 0, stage: 5, done: 0, supplied: true, finishedAt: 0, pre: true, fixes: [{ part: 'roof', cond: 'poor', done: 0, hours: 160, supplied: false }] } as never);
  g.clock.t = doyAhead;
  g.money = 200_000;
  return g;
}

describe('the pre-winter roof warning', () => {
  it('opens about four months before the blizzard season, and only in a region that has blizzards', () => {
    const g = oldRoof('north_woods', 0);
    // start doy 105: the season opens at doy 335, 230 days on
    expect(daysToSeason(g, 'blizzard')).toBe(230);
    expect(winterRoofRisk(g)).toBeNull();
    g.clock.t = 230 - WINTER_ROOF_LEAD_DAYS + 1;
    expect(winterRoofRisk(g)?.days).toBeLessThanOrEqual(WINTER_ROOF_LEAD_DAYS);
    expect(suggestions(g, 30).find(c => c.id === 'roof_winter')).toBeTruthy();
    const warm = oldRoof('desert', 0);
    warm.clock.t = 200;
    expect(daysToSeason(warm, 'blizzard')).toBeNull();
    expect(winterRoofRisk(warm)).toBeNull();
  });
  it('goes away once the roof is mended, a crew is on it, or the snow has already brought one down', () => {
    const g = oldRoof('north_woods', 200);
    expect(winterRoofRisk(g)).not.toBeNull();
    g.crews = [{ id: 'k', target: 'h', hiredAt: 0, hours: 0, paid: 0 }];
    expect(suggestions(g, 30).find(c => c.id === 'roof_winter')).toBeUndefined();
    g.crews = [];
    weatherOf(g).snowCollapsed = true;
    expect(winterRoofRisk(g)).toBeNull();
    weatherOf(g).snowCollapsed = false;
    g.structures[0].fixes![0].done = 160;
    expect(winterRoofRisk(g)).toBeNull();
  });
  it('is plain, in U.S. words, urgent inside two months, and its first button orders the roofing and hires the crew', () => {
    const g = oldRoof('north_woods', 190);   // 40 days to the season
    const c = suggestions(g, 30).find(x => x.id === 'roof_winter')!;
    expect(c.why).toMatch(/will not take a snowload; fix it before winter/);
    expect(c.urgency).toBeGreaterThanOrEqual(90);
    const a = c.acts![0].act;
    expect(a.type).toBe('crew');
    expect((a as { lines?: unknown[] }).lines?.length).toBeGreaterThan(0);
    // press it the way the HUD does
    const lines = (a as unknown as { lines: Array<{ material: never; qty: number }> }).lines;
    expect(orderProblem(g, lines)).toBeNull();
    expect(placeOrder(g, lines)).not.toBeNull();
    expect(hireCrew(g, 'h')).toBeNull();
    expect(suggestions(g, 30).find(x => x.id === 'roof_winter')).toBeUndefined();
  });
  it('is a lower card months out, so it does not crowd the first weeks', () => {
    const g = oldRoof('north_woods', 130);   // about 100 days out
    expect(suggestions(g, 30).find(x => x.id === 'roof_winter')!.urgency).toBeLessThan(80);
  });
});

describe('a home that lost its roof with nobody under a roof', () => {
  const bare = (): GameState => {
    const g = oldRoof('north_woods', 235);
    const h = g.structures[0];
    Object.assign(h, { stage: 3, done: 0, supplied: false, finishedAt: null, roofLost: true, roofLostAt: g.clock.t, fixes: [] });
    g.stock.roofing = 0; g.stock.lumber = 0;
    return g;
  };
  it('the top card is the one-tap order + hire', () => {
    const g = bare();
    const top = suggestions(g, 1)[0];
    expect(top.id).toBe('reroof');
    expect(top.acts![0].act.type).toBe('crew');
    expect((top.acts![0].act as { lines?: unknown[] }).lines?.length).toBeGreaterThan(0);
  });
  it('the family hires the crew itself a day later if nobody has', () => {
    const g = bare();
    expect(roofEmergencyDay(g)).toEqual([]);   // the grace day: the player gets the first move
    g.clock.t += ROOF_GRACE_DAYS + 0.01;
    const lines = roofEmergencyDay(g);
    expect(lines.join(' ')).toMatch(/hired a crew/);
    expect(g.crews?.some(c => c.target === 'h')).toBe(true);
    expect(g.orders.length).toBeGreaterThan(0);
    expect(roofEmergencyDay(g)).toEqual([]);   // once: the crew is on it
  });
  it('stays out of it when another finished home keeps the family dry, or the money is not there', () => {
    const g = bare();
    g.clock.t += 3;
    g.structures.push({ id: 'c', kind: 'cottage', x: 40, z: 40, rot: 0, stage: 5, done: 0, supplied: true, finishedAt: 0 } as never);
    expect(roofEmergencyDay(g)).toEqual([]);
    const poor = bare();
    poor.clock.t += 3;
    poor.money = 2000;
    expect(roofEmergencyDay(poor)).toEqual([]);
  });
});

// ── the strategy-playtest family: seed 7005, north woods, full time, the listing with the old farmhouse ──

function seed5(): GameState {
  const seed = 7005, region: RegionId = 'north_woods';
  const family = generateFamily(seed);
  const budget = startFunds(family, 'fulltime', seed, 0, 'own').budget;
  const ls = listings(seed, region, undefined, 6, budget), want = ls[seed % 4];
  const site = affordable(want, budget) && want.price <= budget ? want : (ls.filter(l => affordable(l, budget) && l.price <= budget).sort((a, b) => b.price - a.price)[0] ?? ls[0]);
  const s = newGame(seed, 105, 2027, { site, lifestyle: 'fulltime', townPlan: 'own', mode: 'scenario', peace: 'short', kind: 'wildfire', dayJobs: true, grid: true, difficulty: 'standard' } as never);
  const h = s.site.home, spots: Record<string, { x: number; z: number; rot: number }> = {};
  s.structures.filter(x => x.unplaced).forEach((st, i) => { spots[st.id] = { x: h.x0 + (44 + (i % 2) * 8) / 67 * (h.x1 - h.x0), z: h.z0 + (44 + Math.floor(i / 2) * 8) / 67 * (h.z1 - h.z0), rot: 0 }; });
  placeImprovements(s, spots);
  for (const what of ['drive', 'power'] as const) orderHookup(s, what);
  return s;
}
const living = (s: GameState) => s.personState.filter(p => p.needs.died == null).length;

/** One day: the bot's turn (if any), then the sim, answering the gate the way a passive player does. */
function play(s0: GameState, days: number, bot: ((s: GameState, day: number) => void) | null): GameState {
  let s = s0;
  for (let day = 0; day < days; day++) {
    bot?.(s, day);
    s = step(s, 1);
    for (let g = 0; s.gate.pending && g < 5; g++) { const k = s.gate.pending.stances; resolve(s, k.includes('turn_away') ? 'turn_away' : k.includes('hide') ? 'hide' : k[0]); s.gate.card = null; }
  }
  return s;
}
/** Force the day's storm: a blizzard on the next day, until the old roof comes down (it is a coin flip a storm, seeded per day). */
function stormUntilCollapse(s: GameState, from: number, to: number): GameState {
  for (let day = from; day < to && !weatherOf(s).snowCollapsed; day++) {
    s = play(s, 1, null);
    // (the blizzard roll skips a run while any structure has lost its roof; an unfinished outbuilding that did must not hide the farmhouse's)
    for (const x of s.structures) if (!isHome(x.kind)) delete x.roofLost;
    const d = dayIndex(s.clock.t);
    if (!weatherOf(s).active) weatherOf(s).active = { kind: 'blizzard', at: d + 1, until: d + 2 };
  }
  return s;
}
const pressTop = (s: GameState): void => {
  const a = suggestions(s, 1)[0]?.acts?.[0]?.act;
  if (a?.type === 'crew') { if (a.lines?.length && !orderProblem(s, a.lines)) placeOrder(s, a.lines); hireCrew(s, a.id); }
  else if (a?.type === 'order' && !orderProblem(s, a.lines)) placeOrder(s, a.lines);
};

describe('seed 5 (strategy playtest): the unrepaired farmhouse roof and a blizzard', () => {
  it('starts in a farmhouse with an unrepaired roof', () => {
    const s = seed5();
    const house = s.structures.find(x => x.pre && x.kind === 'farmhouse')!;
    expect(house).toBeTruthy();
    expect(pendingFixes(house).some(f => f.part === 'roof')).toBe(true);
  });
  it('a player who presses the top card each visit never loses the roof, and the family lives through winter', () => {
    let s = seed5();
    const log = { placed: 0, orders: 0, crews: 0 };
    s = play(s, 330, (g, day) => { if (day % 2 === 0) botTurn(g, log); });
    expect(living(s)).toBe(s.people.length);
    expect(s.structures.find(x => x.pre && x.kind === 'farmhouse' && x.roofLost)).toBeUndefined();
  }, 240_000);
  it('a family that never presses the warning card loses the roof, and still lives: the top card gets the re-roof built', () => {
    let s = seed5();
    s = play(s, 232, null);   // the family has been on the place since April and does not touch the old roof
    s = stormUntilCollapse(s, 232, 330);
    expect(weatherOf(s).snowCollapsed).toBe(true);
    const house = () => s.structures.find(x => x.pre && x.kind === 'farmhouse')!;
    expect(house().roofLost).toBe(true);
    s = play(s, 1, g => pressTop(g));   // the player takes the card the day it falls
    s = play(s, 90, null);
    expect(isFinished(house())).toBe(true);
    expect(house().roofLost).toBeUndefined();
    expect(living(s)).toBe(s.people.length);
  }, 240_000);
  it('and a family that presses nothing at all is saved by the crew the household hires on its own', () => {
    let s = seed5();
    s = play(s, 232, null);
    s = stormUntilCollapse(s, 232, 330);
    expect(weatherOf(s).snowCollapsed).toBe(true);
    s = play(s, 90, null);
    const house = s.structures.find(x => x.pre && x.kind === 'farmhouse')!;
    expect(isFinished(house)).toBe(true);
    expect(living(s)).toBe(s.people.length);
  }, 240_000);
});
