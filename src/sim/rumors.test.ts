import { describe, expect, it } from 'vitest';
import { newGame, dayIndex, type GameState } from './state';
import { CLASSIC } from './site';
import { radioDay, type Heard } from './radio';
import { clarity, openRumors, roadRisk, scoutDay, scoutProblem, sendScout } from './rumors';
import { isAway } from './rescue';

const afterHit = (seed = 3): GameState => {
  const g = newGame(seed, 105, 2027, { site: CLASSIC });
  g.disaster.kind = 'grid_down'; g.disaster.phase = 'survival'; g.disaster.hitAt = 0; g.clock.t = 20;
  return g;
};
const heard = (g: GameState, over: Partial<Heard> = {}): Heard => {
  const h: Heard = { id: 'h1', day: dayIndex(g.clock.t), text: 'Over the fence: raiders burned out a place near here last night.', kind: 'raiders', truth: false, status: 'open', ...over };
  (g.radio ??= { warnedUntil: -1, bonus: 0, truths: 0, rumors: 0 }).heard = [h];
  return h;
};
const nextDay = (g: GameState) => { g.clock.t += 1; return scoutDay(g); };

describe('radio keeps what it heard', () => {
  it('records true news and false rumors with their truth hidden in the ledger', () => {
    const g = afterHit(); g.stock.ham_rig = 1; g.stock.sw_radio = 1;
    let t = 0, f = 0;
    for (let d = 0; d < 80; d++) { g.clock.t = 20 + d; radioDay(g); }
    for (const h of g.radio!.heard!) { if (h.truth) t++; else f++; }
    expect(g.radio!.heard!.length).toBeGreaterThan(0);
    expect(g.radio!.heard!.length).toBeLessThanOrEqual(8);
    expect(t + f).toBe(g.radio!.heard!.length);
  });
});

describe('checking a rumor', () => {
  it('sends an adult away for a day; they are not at the place meanwhile', () => {
    const g = afterHit(); heard(g);
    const adult = g.people.find(p => !p.kid)!;
    expect(sendScout(g, 'h1', adult.id)).toBeNull();
    expect(isAway(g, adult.id)).toBe(true);
    expect(scoutProblem(g, 'h1', adult.id)).toBe('someone is already out');
    expect(nextDay(g).length).toBeGreaterThan(0);
    expect(isAway(g, adult.id)).toBe(false);
  });
  it('a kid cannot go and a checked rumor cannot be checked again', () => {
    const g = afterHit(); heard(g);
    const kid = g.people.find(p => p.kid)!;
    expect(scoutProblem(g, 'h1', kid.id)).toBe('they can\'t go');
    heard(g, { status: 'false' });
    expect(scoutProblem(g, 'h1', g.people.find(p => !p.kid)!.id)).toBe('already checked');
  });
  it('a false rumor is put to rest; a true raider warning puts the watch up', () => {
    let falseRest = 0, trueWatch = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const a = afterHit(seed); heard(a, { truth: false }); sendScout(a, 'h1', a.people.find(p => !p.kid)!.id); scoutDay(a); a.clock.t += 1; scoutDay(a);
      if (a.radio!.heard![0].status === 'false') falseRest++;
      const b = afterHit(seed); heard(b, { truth: true }); sendScout(b, 'h1', b.people.find(p => !p.kid)!.id); b.clock.t += 1; scoutDay(b);
      if (b.radio!.heard![0].status === 'confirmed') { trueWatch++; expect(b.radio!.warnedUntil).toBeGreaterThan(dayIndex(b.clock.t)); expect(b.radio!.bonus).toBeGreaterThanOrEqual(12); }
    }
    expect(falseRest).toBeGreaterThan(20);
    expect(trueWatch).toBeGreaterThan(20);
  });
  it('sometimes the scout cannot tell and the rumor stays open; a hunter sees better', () => {
    expect(clarity(0)).toBeCloseTo(0.7); expect(clarity(8)).toBeGreaterThan(clarity(2)); expect(clarity(20)).toBeLessThanOrEqual(0.97);
    const g = afterHit(); heard(g);
    expect(openRumors(g).length).toBe(1);
  });
  it('the road is riskier with the law gone and safer with a hunter', () => {
    const g = afterHit(); g.disaster.tracks.law = 1; const calm = roadRisk(g, 0);
    g.disaster.tracks.law = 0; const lawless = roadRisk(g, 0);
    expect(lawless).toBeGreaterThan(calm * 2);
    expect(roadRisk(g, 8)).toBeLessThan(lawless);
  });
});
