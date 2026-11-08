import { describe, expect, it } from 'vitest';
import { freezeSecs, heroOdds, lastWords, panicOdds, traitsOf, fightsBefore, type DefenderTraits } from './defenderTraits';
import { newGame } from './state';
import { mulberry32 } from './rng';

const t = (o: Partial<DefenderTraits> = {}): DefenderTraits => ({ trauma: 0, stress: 20, grief: 0, experience: 4, veteran: false, firstFight: false, courage: 'steady', kin: [], history: [], ...o });

describe('what a defender is made of', () => {
  it('reads the person on the place without writing to the game', () => {
    const g = newGame(3), before = JSON.stringify(g), p = g.people.find(q => !q.kid)!;
    const tr = traitsOf(g, p, id => `h_${id}`);
    expect(JSON.stringify(g)).toBe(before);
    expect(tr.firstFight).toBe(true); expect(tr.history).toContain('first_fight'); expect(['freezes', 'steady', 'heroic']).toContain(tr.courage);
    expect(fightsBefore(g)).toBe(0);
  });
  it('names who they love: partner, children, parents, with the unit when they are in the fight', () => {
    const g = newGame(4);
    const withKin = g.people.filter(p => !p.kid).map(p => traitsOf(g, p, id => `h_${id}`)).filter(x => x.kin.length);
    expect(withKin.length).toBeGreaterThan(0);
    for (const x of withKin) for (const k of x.kin) { expect(k.name.length).toBeGreaterThan(0); expect(k.unit).toBe(`h_${k.id}`); }
  });
  it('a veteran who has fought is heroic; a green, shaken person freezes; trauma pulls anyone down', () => {
    const g = newGame(5), adults = g.people.filter(p => !p.kid);
    const green = adults[0];
    g.mind = { psyche: { [green.id]: { stress: 90, trauma: 80, low: 40, kills: 0 } } } as unknown as typeof g.mind;
    expect(traitsOf(g, green).courage).toBe('freezes');
    g.gate.raidsHeld = 6;
    const vet = adults.find(p => traitsOf(g, p).veteran);
    if (vet) expect(traitsOf(g, vet).courage).not.toBe('freezes');
  });
});
describe('panic, heroics, last words', () => {
  const rate = (f: (r: () => number) => boolean, N = 3000) => { const r = mulberry32(2); let n = 0; for (let i = 0; i < N; i++) if (f(r)) n++; return n / N; };
  it('the green and the shaken lock up when someone falls, more when it is their own; a veteran hardly at all; nobody if nobody fell', () => {
    const odds = (o: Partial<DefenderTraits>, kin = false) => panicOdds(t(o), { kinFell: kin, allyFell: true });
    expect(odds({ courage: 'freezes', firstFight: true, trauma: 60 })).toBeGreaterThan(odds({ courage: 'steady' }));
    expect(odds({ courage: 'steady' })).toBeGreaterThan(odds({ courage: 'heroic', veteran: true }));
    expect(odds({ courage: 'steady' }, true)).toBeGreaterThan(odds({ courage: 'steady' }));
    expect(panicOdds(t({ courage: 'freezes' }), { kinFell: true, allyFell: false })).toBe(0);
    for (const c of ['freezes', 'steady', 'heroic'] as const) { const p = panicOdds(t({ courage: c, trauma: 100, firstFight: true }), { kinFell: true, allyFell: true }); expect(p).toBeGreaterThanOrEqual(0); expect(p).toBeLessThanOrEqual(0.9); }
    expect(rate(r => r() < odds({ courage: 'freezes' }))).toBeGreaterThan(0.4);
  });
  it('a freeze is a few seconds, longer for the traumatized', () => { const r = mulberry32(1); expect(freezeSecs(t({ trauma: 90 }), r)).toBeGreaterThan(freezeSecs(t({ trauma: 0, veteran: true }), () => 0.5) - 1); expect(freezeSecs(t(), () => 0)).toBeGreaterThanOrEqual(3 - 1.5); });
  it('heroes step in more for their own, and a heroic veteran most', () => {
    expect(heroOdds(t({ courage: 'heroic', veteran: true }), false)).toBeGreaterThan(heroOdds(t({ courage: 'steady' }), false));
    expect(heroOdds(t({ courage: 'freezes' }), true)).toBeGreaterThan(heroOdds(t({ courage: 'freezes' }), false));
  });
  it('last words come from who they love and what they have been through', () => {
    const r = () => 0.3;
    const partner = lastWords(t({ kin: [{ id: 'a', name: 'Maya', rel: 'partner' }] }), { first: 'Tom' }, r);
    expect(partner).toMatch(/Maya/);
    const child = lastWords(t({ kin: [{ id: 'b', name: 'Josh', rel: 'child' }] }), { first: 'Tom' }, () => 0.01);
    expect(child).toMatch(/Josh/);
    expect(lastWords(t({ veteran: true, history: ['veteran'] }), { first: 'Tom' }, () => 0.5)).toMatch(/line|door|sectors/i);
    expect(lastWords(t({ history: ['lost_before'] }), { first: 'Tom', lostName: 'Ellie' }, () => 0.01)).toMatch(/Ellie/);
    expect(lastWords(t({ firstFight: true, history: ['first_fight'] }), { first: 'Tom' }, () => 0.5)).toBeTruthy();
    expect(lastWords(t(), { first: 'Tom' }, () => 0.5)).toBeTruthy();
  });
});
