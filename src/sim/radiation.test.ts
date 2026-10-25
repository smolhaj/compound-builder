import { describe, expect, it } from 'vitest';
import { newGame, type GameState } from './state';
import { freshNeeds, type Needs } from './needs';
import { arsPhase, CANCER_PER_SV, careScore, deathRisk, effectiveDose, ld50Of, radiationDay, takeIodide, type RadCare } from './radiation';

/** Fed and with clean water, but no medical care ("untreated"). */
const NONE: RadCare = { medic: 0, meds: false, bay: false, cleanWater: true, fed: true };
const FULL: RadCare = { medic: 8, meds: true, bay: true, cleanWater: true, fed: true };

/** Live `days` days for one person with a dose schedule (Sv on each day), resting and fed (+0.6 health a day). */
function live(g: GameState, i: number, doses: (day: number) => number, days: number, care: RadCare, n: Needs = freshNeeds()) {
  let worst = 0;
  const out: string[] = [];
  for (let d = 0; d < days && n.died == null; d++) {
    g.clock.t = d;
    n.dose += doses(d);
    const dh = 0.6 + radiationDay(g, i, g.people[0], n, care, out);
    n.health = Math.max(0, Math.min(100, n.health + dh));
    worst = Math.max(worst, effectiveDose(n));
    if (n.health <= 0) n.died = d;
  }
  return { n, worst, out };
}

describe('radiation sickness', () => {
  it('the dose curve: LD50 about 4 Sv untreated, few deaths at 1–2 Sv, 6 Sv usually fatal, care moves it up', () => {
    expect(deathRisk(0.8)).toBe(0);
    expect(deathRisk(1.65)).toBeLessThan(0.02);
    expect(deathRisk(2)).toBeLessThan(0.05);
    expect(deathRisk(4)).toBeCloseTo(0.5, 2);
    expect(deathRisk(6)).toBeGreaterThan(0.95);
    expect(deathRisk(9, ld50Of(FULL))).toBeGreaterThan(0.95);
    expect(deathRisk(4, ld50Of(FULL))).toBeLessThan(0.02);
    expect(deathRisk(6, ld50Of(FULL))).toBeLessThan(0.5);
    expect(careScore(FULL)).toBeCloseTo(1);
    expect(careScore(NONE)).toBe(0);
    expect(ld50Of(NONE)).toBe(4);
    // hungry and drinking dirty water: worse odds
    expect(ld50Of({ ...NONE, fed: false, cleanWater: false })).toBeLessThan(4);
  });

  it('the course: nausea first, a latent spell, then the illness, then recovery', () => {
    expect(arsPhase(3, 0).phase).toBe('prodrome');
    expect(arsPhase(3, 5).phase).toBe('latent');
    expect(arsPhase(3, 20).phase).toBe('manifest');
    expect(arsPhase(3, 60).phase).toBe('recovery');
    expect(arsPhase(3, 200).phase).toBe('done');
    // the latent spell is shorter at higher doses
    expect(arsPhase(7, 9).phase).toBe('manifest');
  });

  it('the body repairs: 1.5 Sv spread over two months never makes anyone sick, the same in a day does', () => {
    const g = newGame(1);
    const slow = live(g, 0, d => (d < 60 ? 1.5 / 60 : 0), 120, NONE);
    expect(slow.worst).toBeLessThan(1);
    expect(slow.n.rad?.ars).toBeUndefined();
    expect(slow.n.health).toBe(100);
    const fast = live(g, 1, d => (d === 0 ? 1.5 : 0), 5, NONE);
    expect(fast.n.rad?.ars).toBeDefined();
    expect(fast.n.hurt.some(h => h.what.startsWith('radiation sickness'))).toBe(true);
  });

  it('1.65 Sv (the playtest family that all died): sick for a while, then recovered for good', () => {
    const g = newGame(1);
    const r = live(g, 0, d => (d === 0 ? 1.65 : 0), 200, NONE);
    expect(r.n.died).toBeNull();
    expect(r.n.rad?.ars?.done).toBe(true);
    expect(r.n.hurt.length).toBe(0);
    expect(r.n.health).toBe(100);
  });

  it('about half die at 4 Sv untreated (LD50/60); with care almost all live', () => {
    const g = newGame(1);
    const deaths = (care: RadCare) => { let k = 0; for (let i = 0; i < 300; i++) if (live(g, i, d => (d === 0 ? 4 : 0), 90, care).n.died != null) k++; return k / 300; };
    const untreated = deaths(NONE);
    expect(untreated).toBeGreaterThan(0.35);
    expect(untreated).toBeLessThan(0.65);
    expect(deaths(FULL)).toBeLessThan(0.05);
    // 7 Sv: hardly anyone, untreated
    let k = 0; for (let i = 0; i < 100; i++) if (live(g, i, d => (d === 0 ? 7 : 0), 90, NONE).n.died != null) k++;
    expect(k).toBeGreaterThan(95);
  });

  it('the dose taken in the shelter weeks adds to the cancer risk (5 % a sievert, children twice); iodide cuts the thyroid part', () => {
    const g = newGame(1);
    g.disaster.kind = 'nuclear'; g.disaster.hitAt = 0;
    const adult = g.people.findIndex(p => !p.kid), kid = g.people.findIndex(p => p.kid);
    const run = (i: number, ki: boolean) => { const n = freshNeeds(); if (ki) n.rad!.ki = true; n.dose += 1; g.clock.t = 1; radiationDay(g, i, g.people[i], n, NONE, []); return n.rad!.risk; };
    expect(run(adult, false)).toBeCloseTo(CANCER_PER_SV + 0.005, 4);
    expect(run(kid, false)).toBeCloseTo(2 * CANCER_PER_SV + 0.03, 4);
    expect(run(kid, true)).toBeCloseTo(2 * CANCER_PER_SV + 0.003, 4);
  });

  it('potassium iodide at the strike: one pack a person, the children first', () => {
    const g = newGame(1);
    g.stock.potassium_iodide = 2;
    const line = takeIodide(g);
    expect(line).toMatch(/youngest first/);
    expect(g.stock.potassium_iodide).toBe(0);
    const kids = g.people.map((p, i) => [p, g.personState[i].needs] as const).filter(([p]) => p.kid);
    expect(kids.every(([, n]) => n.rad?.ki)).toBe(true);
  });
});
