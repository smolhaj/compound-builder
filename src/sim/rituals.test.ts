import { describe, expect, it } from 'vitest';
import { newGame, type GameState } from './state';
import { step } from './engine';
import { CLASSIC } from './site';
import {
  CALM_MIN, CALM_RISE, HELP_CAP, MORALE_CAP, RETURN_BAND, calmStep, dayLift, nextScore, returnsAt, ritualDay, ritualHelp, ritualHour, ritualKind, ritualMorale, ritualsOf, stanceOf, tableSet,
} from './rituals';
import { mindDay, mindOf } from './mind';
import { dayIndex } from './state';

const game = (seed = 3) => { const g = newGame(seed, 105, 2027, { site: CLASSIC }); g.disaster.tracks.law = 1; return g; };
const toHour = (g: GameState, hour: number, days = 1): GameState => {
  // clock.t fraction: hour = (frac*24+6)%24, so frac = ((hour-6+24)%24)/24
  const frac = (((hour - 6) % 24) + 24) % 24 / 24;
  const t = Math.floor(g.clock.t) + days + frac;
  return step(g, Math.max(0.01, t - g.clock.t));
};

describe('ritual windows and stance', () => {
  it('dinner, fireside and play follow the plan tasks and the hour', () => {
    expect(ritualKind('meal', false, 18.5)).toBe('dinner');
    expect(ritualKind('meal', false, 12.5)).toBeNull();
    expect(ritualKind('leisure', false, 20)).toBe('fireside');
    expect(ritualKind('leisure', true, 15)).toBe('play');
    expect(ritualKind('leisure', false, 15)).toBeNull();
    expect(ritualKind('garden', false, 19)).toBeNull();
    expect(ritualKind('sleep', true, 21)).toBeNull();
  });
  it('calm falls at once and climbs slowly', () => {
    expect(calmStep(1, 0.2)).toBe(0.2);
    expect(calmStep(0.2, 1)).toBeCloseTo(0.2 + CALM_RISE);
    expect(calmStep(0.2, 1, 3)).toBeCloseTo(0.2 + 3 * CALM_RISE);
    expect(calmStep(0.9, 0.95, 10)).toBe(0.95);
  });
  it('the family returns to the table one at a time as calm recovers', () => {
    let calm = 0.1, back = 0;
    const seen: number[] = [];
    for (let h = 0; h < 12; h++) { calm = calmStep(calm, 1); const n = [0, 1, 2, 3, 4, 5].filter(i => stanceOf(calm, i) === 'settled').length; seen.push(n); back = n; }
    expect(back).toBe(6);
    expect(seen[0]).toBe(0);
    for (let k = 1; k < seen.length; k++) expect(seen[k]).toBeGreaterThanOrEqual(seen[k - 1]);
    expect(new Set(seen).size).toBeGreaterThanOrEqual(3);
    for (let i = 0; i < 12; i++) { expect(returnsAt(i)).toBeGreaterThanOrEqual(CALM_MIN); expect(returnsAt(i)).toBeLessThanOrEqual(CALM_MIN + RETURN_BAND + 1e-9); }
    expect(stanceOf(0.2, 0)).toBe('alert');
    expect(stanceOf(0.5, 0)).toBe('wary');
  });
});

describe('what the rituals are worth', () => {
  it('is small and capped', () => {
    expect(dayLift({ dinner: true, fireside: 3 }, false)).toBe(2);
    expect(dayLift({ dinner: true, fireside: 3, play: 2 }, true)).toBeCloseTo(2.8);
    expect(dayLift({ dinner: true, fireside: 1 }, false)).toBe(1);
    let score = 0;
    for (let d = 0; d < 30; d++) score = nextScore(score, 2.8);
    expect(ritualHelp(score)).toBeLessThanOrEqual(HELP_CAP);
    expect(ritualMorale(score)).toBeLessThanOrEqual(MORALE_CAP);
    expect(ritualHelp(0)).toBe(0);
    expect(nextScore(2, 0)).toBeLessThan(2);
  });
});

describe('in the engine', () => {
  it('a safe family with food has dinner and a fireside evening, and it lifts them a little', () => {
    let g = game();
    g = toHour(g, 17, 1);   // 5 p.m. tomorrow
    g = toHour(g, 23, 0);   // through the evening
    const R = ritualsOf(g);
    expect(tableSet(g)).toBe(true);
    const fed = g.people.filter(p => R.today[p.id]?.dinner || (R.today[p.id]?.fireside ?? 0) > 0);
    expect(fed.length).toBeGreaterThanOrEqual(1);
    g = toHour(g, 1, 1);    // past midnight: the day rolls up
    const R2 = ritualsOf(g);
    expect(Object.values(R2.score).some(v => v > 0)).toBe(true);
    expect(Math.max(...Object.values(R2.score))).toBeLessThan(3);
  });
  it('no dinner is counted when the larder is bare, and none while a crew that means harm is at the gate', () => {
    const bare = game(4);
    bare.stock.staples = 0; bare.stock.canned = 0; bare.stock.frozen = 0; bare.pantry.items = {};
    expect(tableSet(bare)).toBe(false);
    let g = game(5);
    g = toHour(g, 17, 1);
    g.gate.pending = { id: 'e', kind: 'gang', armed: true, title: 'Gang', dossier: [] } as unknown as GameState['gate']['pending'];
    g = toHour(g, 20.5, 0);
    const R = ritualsOf(g);
    expect(R.calm).toBeLessThan(0.3);
    expect(g.people.every(p => !R.today[p.id]?.dinner)).toBe(true);
  });
  it('the mind reads the score as a help, and the strain it reports comes down', () => {
    const g = game(6);
    mindDay(g);
    const p = g.people[0];
    const base = mindOf(g).psyche[p.id];
    expect(base).toBeDefined();
    ritualsOf(g).score[p.id] = 2;
    g.clock.t += 1;
    mindDay(g);
    const helps = (mindOf(g).psyche[p.id].helps ?? []).map(h => h[0]);
    expect(helps).toContain('family evenings');
  });
  it('writes a birthday supper into the chronicle, once, and respects the yearly cap', () => {
    const g = game(7);
    const p = g.people[0]; p.kin = true;
    const R = ritualsOf(g);
    const doy = ((g.clock.startDoy - 1 + dayIndex(g.clock.t - 0.5)) % 365) + 1;
    p.bday = doy;
    for (const q of g.people) R.today[q.id] = { dinner: true };
    const before = g.lineage.chronicle.length;
    const lines = ritualDay(g);
    expect(lines.some(l => l.includes('turned'))).toBe(true);
    expect(g.lineage.chronicle.length).toBe(before + 1);
    expect(g.lineage.chronicle.at(-1)!.kind).toBe('home');
    ritualHour(g, 18);
  });
});
