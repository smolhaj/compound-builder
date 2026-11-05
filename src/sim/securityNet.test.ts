import { describe, expect, it } from 'vitest';
import { newGame, dayIndex, type GameState } from './state';
import { RESPONSE, armedResponseDay, breakinK, cancelResponse, emptyShare, patrolMinutes, responseActive, responseSigns, subscribe, subscribeProblem } from './armedResponse';
import { WATCH, communityPosture, foundWatch, inWatch, leaveWatch, watchDay, watchDefenders, watchOf, watchProblem } from './watch';
import { breakInRate, responseMinutes } from './breakins';
import { postureOf } from './encounters';
import { gearPosture } from './gear';
import { defenders } from './pact';
import { COLLAPSE } from './guards';
import { migrate } from './save/migrations';
import { SAVE_VERSION } from './state';

const game = (seed = 7): GameState => { const g = newGame(seed); g.money = 50000; return g; };
const advance = (g: GameState, days: number, f: (g: GameState) => string[]): string[] => { const out: string[] = []; for (let i = 0; i < days; i++) { g.clock.t += 1; out.push(...f(g)); } return out; };
const down = (g: GameState) => { g.disaster.tracks.banks = 0.1; g.disaster.tracks.law = 0.1; };

describe('armed response', () => {
  it('can be bought while the banks and the law work, for a setup fee, once', () => {
    const g = game();
    expect(subscribeProblem(g)).toBeNull();
    const m0 = g.money;
    expect(subscribe(g)).toBeNull();
    expect(m0 - g.money).toBe(RESPONSE.SETUP_USD);
    expect(responseActive(g)).toBe(true);
    expect(subscribeProblem(g)).toMatch(/already/);
    const h = game(); h.disaster.tracks.banks = 0;
    expect(subscribeProblem(h)).toMatch(/failed/);
  });

  it('bills monthly while the banks work and lapses after two unpaid months', () => {
    const g = game(); subscribe(g);
    const m0 = g.money;
    advance(g, RESPONSE.MONTH_DAYS * 3 + 1, armedResponseDay);
    expect(m0 - g.money).toBe(RESPONSE.MONTHLY_USD * 3);
    const h = game(); subscribe(h);
    h.disaster.tracks.banks = 0.3; h.disaster.tracks.law = 0.9;     // shut banks, a law that works: no payments, the firm still answers for a while
    expect(responseActive(h)).toBe(true);
    const said = advance(h, RESPONSE.MONTH_DAYS * 2 + 1, armedResponseDay).join(' ');
    expect(said).toMatch(/lapsed/);
    expect(responseActive(h)).toBe(false);
  });

  it('is gone for good once the banks and the law have both been down for 7 days (and does not come back)', () => {
    const g = game(); subscribe(g);
    down(g);
    advance(g, COLLAPSE.days - 1, armedResponseDay);
    const day6 = responseActive(g);
    const said = advance(g, 2, armedResponseDay).join(' ');
    expect(said).toMatch(/stopped answering/);
    expect(day6).toBe(false);          // the thresholds themselves already silence the patrol (the banks are under 25 %)
    g.disaster.tracks.banks = 1; g.disaster.tracks.law = 1;
    expect(responseActive(g)).toBe(false);
    expect(subscribeProblem(g)).toBeNull();          // a new contract is possible once the firm is back, but the old one is over
  });

  it('a recovering week resets the count: banks back above the line for a day save the contract', () => {
    const g = game(); subscribe(g);
    down(g); advance(g, 5, armedResponseDay);
    g.disaster.tracks.banks = 0.6; g.disaster.tracks.law = 0.6; advance(g, 1, armedResponseDay);
    down(g); advance(g, 5, armedResponseDay);
    g.disaster.tracks.banks = 0.6; g.disaster.tracks.law = 0.6;
    expect(responseActive(g)).toBe(true);
  });

  it('shortens the minutes to help (the shorter of the patrol and the sheriff), never lengthens them', () => {
    const g = game(), h = game();
    subscribe(h);
    for (let seed = 1; seed <= 60; seed++) {
      const r = () => (seed % 10) / 10;
      expect(responseMinutes(h, r)).toBeLessThanOrEqual(responseMinutes(g, r));
    }
    expect(responseMinutes(h, () => 0.9)).toBeLessThanOrEqual(patrolMinutes(h));
    expect(patrolMinutes(h)).toBeLessThanOrEqual(RESPONSE.MINUTES.MAX);
    down(h);
    expect(responseMinutes(h, () => 0.5)).toBe(responseMinutes(g, () => 0.5));   // the patrol is gone: back to the sheriff
  });

  it('makes break-ins rarer and an empty house burgled for less; the signs deter opportunists only', () => {
    const g = game(), h = game(); subscribe(h);
    expect(breakInRate(h)).toBeLessThan(breakInRate(g));
    expect(emptyShare(h)).toBeLessThan(1); expect(emptyShare(g)).toBe(1);
    expect(responseSigns(h)).toBeGreaterThan(0);
    const pg = gearPosture(g, 2), ph = gearPosture(h, 2);
    expect(ph.signs).toBeGreaterThan(pg.signs);
    expect(ph.deter).toBe(pg.deter);       // dogs and the like: unchanged, and what organized crews read
    expect(postureOf(h).signs).toBeGreaterThan(postureOf(g).signs ?? 0);
  });

  it('does nothing after the collapse: no signs, no minutes, no help', () => {
    const g = game(); subscribe(g); down(g);
    expect(responseActive(g)).toBe(false);
    expect(breakinK(g)).toBe(1); expect(responseSigns(g)).toBe(0); expect(emptyShare(g)).toBe(1);
  });

  it('can be cancelled', () => {
    const g = game(); subscribe(g);
    expect(cancelResponse(g)).toBeNull();
    expect(responseActive(g)).toBe(false);
    expect(cancelResponse(g)).toMatch(/no subscription/);
  });
});

describe('the road watch', () => {
  const neighbors = (g: GameState, disp: number) => { for (const n of g.neighbors) { n.disposition = disp; n.status = 'home'; n.members = Math.max(1, n.members); } };

  it('is founded with the neighbors who trust the family, for a small cost; not with fewer than two', () => {
    const g = game(); neighbors(g, 0);
    expect(watchProblem(g)).toMatch(/needs 2 neighbors/);
    neighbors(g, 40);
    expect(watchProblem(g)).toBeNull();
    const m0 = g.money;
    expect(foundWatch(g)).toBeNull();
    expect(m0 - g.money).toBe(WATCH.SETUP_USD);
    expect(watchOf(g)!.members.length).toBeGreaterThanOrEqual(2);
    expect(watchProblem(g)).toMatch(/already/);
  });

  it('gives a steady little warning, and more when strangers are two days out', () => {
    const g = game(); neighbors(g, 40); foundWatch(g);
    g.gate.next = -1;
    const calm = communityPosture(g).detection;
    expect(calm).toBe(WATCH.BASE);
    g.gate.next = dayIndex(g.clock.t) + 1;
    expect(communityPosture(g).detection).toBe(WATCH.BASE + WATCH.ALERT);
    g.gate.next = dayIndex(g.clock.t) + 6;
    expect(communityPosture(g).detection).toBe(WATCH.BASE);
    const none = game();
    expect(communityPosture(none).detection).toBe(0);
    expect(gearPosture(g, 2).detection).toBeGreaterThan(gearPosture(none, 2).detection);
  });

  it('the chat lights up once when something is two days out', () => {
    const g = game(); neighbors(g, 40); foundWatch(g);
    g.gate.next = dayIndex(g.clock.t) + 2;
    const a = watchDay(g).join(' ');
    expect(a).toMatch(/strangers on the county road/);
    expect(watchDay(g).join(' ')).not.toMatch(/strangers on the county road/);
  });

  it('members within earshot come when there is shooting, in or out of a pact', () => {
    const g = game(); neighbors(g, 40);
    for (const n of g.neighbors) { n.radio = false; n.km = 1.5; }
    const before = defenders(g).length;
    foundWatch(g);
    expect(defenders(g).length).toBeGreaterThan(before);
    expect(watchDefenders(g).length).toBe(defenders(g).length);
    for (const n of g.neighbors) n.km = 9;
    expect(defenders(g).length).toBeLessThanOrEqual(before);
  });

  it('dues each month while the banks work, goodwill grows, a household that is gone drops out, and under two it dissolves', () => {
    const g = game(); neighbors(g, 40); foundWatch(g);
    const w = watchOf(g)!, id = w.members[0], d0 = g.neighbors.find(n => n.id === id)!.disposition, m0 = g.money;
    advance(g, WATCH.MONTH_DAYS + 1, watchDay);
    expect(m0 - g.money).toBe(WATCH.MONTHLY_USD);
    expect(g.neighbors.find(n => n.id === id)!.disposition).toBeGreaterThan(d0);
    expect(inWatch(g, id)).toBe(true);
    for (const n of g.neighbors) n.status = 'gone' as never;
    const said = watchDay(g).join(' ');
    expect(said).toMatch(/dissolved/);
    expect(watchOf(g)).toBeNull();
  });

  it('no dues once the banks are shut; the watch keeps going, which is the point', () => {
    const g = game(); neighbors(g, 40); foundWatch(g); down(g);
    const m0 = g.money;
    advance(g, WATCH.MONTH_DAYS * 2 + 1, watchDay);
    expect(g.money).toBe(m0);
    expect(watchOf(g)).not.toBeNull();
  });

  it('leaving costs a little goodwill', () => {
    const g = game(); neighbors(g, 40); foundWatch(g);
    const lead = g.neighbors.find(n => n.id === watchOf(g)!.leader)!, d0 = lead.disposition;
    expect(leaveWatch(g)).toBeNull();
    expect(lead.disposition).toBeLessThan(d0);
    expect(watchOf(g)).toBeNull();
    expect(leaveWatch(g)).toMatch(/not in/);
  });
});

describe('old saves', () => {
  it('a game with no security state loads and behaves as before', () => {
    const g = game();
    expect(g.security).toBeUndefined();
    expect(communityPosture(g)).toEqual({ detection: 0, members: 0 });
    expect(responseActive(g)).toBe(false);
    expect(migrate(JSON.parse(JSON.stringify(g)) as unknown).version).toBe(SAVE_VERSION);
  });
});
