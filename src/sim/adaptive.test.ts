import { describe, expect, it } from 'vitest';
import { newGame, dayIndex, type GameState } from './state';
import { DIFFICULTY, type Difficulty } from './difficulty';
import { ADAPT, WINTER, adaptation, defensiveStrength, adaptedHeads, cadenceFactor, digFactor, extraKit, firstWinter, followDays, inFreeze, probeHeads, probes, whyBigger, winterDay } from './adaptive';
import { adaptOf, cadence, gateDay, postureOf, resolve } from './encounters';
import { planRun } from './perimeter';
import { digChancePerDay } from './tunnelers';
import { step } from './engine';

const SINCE_FULL = ADAPT.FULL_DAY + 10;

describe('the adaptation number (Hardcore: the world learns a place that holds)', () => {
  it('is zero before the end of year one, whatever the defense', () => {
    for (const d of [0, 100, 300, ADAPT.FROM_DAY]) expect(adaptation(1, d, { defense: 200 })).toBe(0);
  });
  it('is zero for a place nobody has to respect, however late', () => {
    expect(adaptation(1, 2000, { defense: 0 })).toBe(0);
    expect(adaptation(1, 2000, { defense: ADAPT.DEFENSE_FLOOR })).toBe(0);
  });
  it('grows with time and with defense, and tops out at 1', () => {
    let last = 0;
    for (let d = ADAPT.FROM_DAY; d <= ADAPT.FULL_DAY + 100; d += 30) { const a = adaptation(1, d, { defense: 80 }); expect(a).toBeGreaterThanOrEqual(last); last = a; }
    last = 0;
    for (let def = 0; def <= 160; def += 10) { const a = adaptation(1, SINCE_FULL, { defense: def }); expect(a).toBeGreaterThanOrEqual(last); last = a; }
    expect(adaptation(1, SINCE_FULL, { defense: ADAPT.DEFENSE_FULL })).toBe(1);
    expect(adaptation(1, 99999, { defense: 9999 })).toBe(1);
  });
  it('is weighted by the level: gentle on Cozy and Standard, full on Hardcore, none with weight 0', () => {
    const a = (l: Difficulty) => adaptation(DIFFICULTY[l].adapt, SINCE_FULL, { defense: 100 });
    expect(a('cozy')).toBeGreaterThan(0);
    expect(a('cozy')).toBeLessThan(a('standard'));
    expect(a('standard')).toBeLessThan(a('hardcore'));
    expect(a('hardcore')).toBe(1);
    expect(adaptation(0, SINCE_FULL, { defense: 100 })).toBe(0);
  });
  it('defensive strength: defense, terrain points and a year of food all count, the best of them wins, and terrain adds to defense', () => {
    expect(defensiveStrength({ defense: 0 })).toBe(0);
    expect(defensiveStrength({ defense: ADAPT.DEFENSE_FULL })).toBe(1);
    expect(defensiveStrength({ defense: 0, foodDays: ADAPT.PRIZE_FULL })).toBe(1);
    expect(defensiveStrength({ defense: 50, terrain: 20 })).toBeGreaterThan(defensiveStrength({ defense: 50 }));
    expect(defensiveStrength({ defense: 50, terrain: 0 })).toBe(defensiveStrength({ defense: 50 }));
  });
  it('the crew scaling stays smaller than what a strong defense is worth: at most +HEADS heads even at full weight', () => {
    expect(adaptedHeads(10, 1)).toBeLessThanOrEqual(Math.round(10 * (1 + ADAPT.HEADS)));
    expect(ADAPT.HEADS).toBeLessThan(0.5);
  });
});

describe('what an adapted crew is', () => {
  it('has the same heads, gap, kit and digging at 0 (a level that does not adapt is untouched)', () => {
    for (const n of [1, 3, 8, 14]) expect(adaptedHeads(n, 0)).toBe(n);
    expect(cadenceFactor(0)).toBe(1);
    expect(digFactor(0)).toBe(1);
    expect(extraKit(10, 0, true)).toEqual({ grenades: 0, plate: 0, auto: 0, rocket: false });
  });
  it('has more heads (up to +HEADS), never fewer, and comes oftener', () => {
    for (const n of [1, 3, 8, 14]) { expect(adaptedHeads(n, 1)).toBeGreaterThanOrEqual(n); expect(adaptedHeads(n, 1)).toBeLessThanOrEqual(Math.ceil(n * (1 + ADAPT.HEADS))); }
    expect(adaptedHeads(10, 1)).toBe(Math.round(10 * (1 + ADAPT.HEADS)));
    expect(cadenceFactor(1)).toBeCloseTo(1 - ADAPT.CADENCE, 10);
    expect(digFactor(1)).toBeCloseTo(1 + ADAPT.DIG, 10);
  });
  it('brings more kit: grenades, plate, automatic rifles, and a rocket for an organized crew once well learned', () => {
    const k = extraKit(10, 1, true);
    expect(k.grenades).toBeGreaterThan(0); expect(k.plate).toBeGreaterThan(0); expect(k.auto).toBeGreaterThan(0); expect(k.rocket).toBe(true);
    expect(extraKit(10, ADAPT.ROCKET_AT - 0.01, true).rocket).toBe(false);
    expect(extraKit(10, 1, false).rocket).toBe(false);
    expect(extraKit(10, 1, false).grenades).toBeLessThan(k.grenades);
  });
  it('explains itself in the dossier, more plainly as it grows, and says nothing at 0', () => {
    expect(whyBigger(0)).toBeNull();
    expect(whyBigger(0.2)).toContain('Word has gone round');
    expect(whyBigger(1)).toContain('Everybody in the county knows');
  });
});

describe('probing raids', () => {
  it('start once adapted, not before, not twice inside the cooldown, and follow the dice', () => {
    expect(probes(ADAPT.PROBE_AT - 0.01, undefined, 500, 0)).toBe(false);
    expect(probes(ADAPT.PROBE_AT, undefined, 500, 0)).toBe(true);
    expect(probes(0.9, undefined, 500, ADAPT.PROBE_CHANCE)).toBe(false);
    expect(probes(0.9, 500 - ADAPT.PROBE_COOLDOWN + 1, 500, 0)).toBe(false);
    expect(probes(0.9, 500 - ADAPT.PROBE_COOLDOWN, 500, 0)).toBe(true);
  });
  it('are two or three men, and the crew behind them follows in four to nine days', () => {
    for (let i = 0; i < 20; i++) { const x = i / 20; expect(probeHeads(x)).toBeGreaterThanOrEqual(2); expect(probeHeads(x)).toBeLessThanOrEqual(3); expect(followDays(x)).toBeGreaterThanOrEqual(4); expect(followDays(x)).toBeLessThanOrEqual(9); }
  });
});

/** A game well after a grid-down hit with the law gone, a walled compound, and a family of armed adults. */
function late(l: Difficulty, daysAfter: number, seed = 3): GameState {
  const g = newGame(seed, 105, 2027, { mode: 'scenario', peace: 'short', kind: 'grid_down', difficulty: l });
  g.clock.t = g.disaster.hitAt + daysAfter;
  g.disaster.tracks = { ...g.disaster.tracks, law: 0, stores: 0, deliveries: 0, banks: 0 };
  const r = planRun(g, 'container_wall', [[0, 0], [20, 0], [20, 20], [0, 20], [0, 0]]);
  r.done = r.hours; r.supplied = true; r.finishedAt = 0;
  return g;
}

describe('the gate on Hardcore', () => {
  it('adapts only on Hardcore, only after year one, only when the place is defended', () => {
    expect(adaptOf(late('hardcore', 100))).toBe(0);
    const std = late('standard', SINCE_FULL), strong = { ...postureOf(std), barrier: 100, fighters: 6, firepower: 1.5, detection: 80 };
    expect(adaptOf(std, strong)).toBeGreaterThan(0);
    expect(adaptOf(std, strong)).toBeLessThan(adaptOf(late('hardcore', SINCE_FULL), strong));
    expect(adaptOf(std, strong, 40)).toBeGreaterThanOrEqual(adaptOf(std, strong));   // terrain only ever adds
    const h = late('hardcore', SINCE_FULL);
    expect(adaptOf(h, { ...postureOf(h), barrier: 100, fighters: 6, firepower: 1.5, detection: 80 })).toBeGreaterThan(0.5);
    expect(adaptOf(h, { ...postureOf(h), barrier: 0, fighters: 1, firepower: 1, detection: 10 })).toBe(0);
  });
  it('visits come oftener on a defended Hardcore place than the same place would see without adapting', () => {
    const h = late('hardcore', SINCE_FULL), s = late('standard', SINCE_FULL);
    const p = { ...postureOf(h), barrier: 100, fighters: 6, firepower: 1.5, detection: 80 };
    const a = adaptOf(h, p);
    expect(a).toBeGreaterThan(0.5);
    // the same Hardcore table with the knob off would be longer by exactly the cadence factor
    expect(cadence(h, p) * (1 / cadenceFactor(a))).toBeGreaterThan(cadence(h, p));
    expect(cadence(s, p)).toBeGreaterThan(cadence(h, p));
  });
  it('digs come more often against a defended place on Hardcore', () => {
    const h = late('hardcore', SINCE_FULL);
    const hardcoreRate = digChancePerDay(h);
    expect(hardcoreRate).toBeGreaterThan(0);
    const same = late('hardcore', SINCE_FULL); same.disaster.difficulty = 'standard';
    // Hardcore's own 1.5 and the adapting 1+: strictly more than Standard's
    expect(hardcoreRate).toBeGreaterThan(digChancePerDay(same) * 1.5 - 1e-12);
  });
  it('crews are bigger and carry the reason, a probe comes first now and then, and the crew behind the probe follows', () => {
    let probed = 0, bigger = 0, withWhy = 0, followed = 0, crews = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const h = late('hardcore', SINCE_FULL, seed);
      h.gate.day = -5; h.gate.next = 0;
      const e = gateDay(h);
      if (!e || !e.strength || !['looters', 'gang', 'militia'].includes(e.kind) && !e.probe) continue;
      crews++;
      if (e.probe) {
        probed++;
        expect(e.size).toBeLessThanOrEqual(3);
        expect(e.dossier.join(' ')).toContain('fence line');
        expect(h.gate.lastProbe).toBe(dayIndex(h.clock.t));
        resolve(h, e.stances.includes('hide') ? 'hide' : e.stances[0]);
        expect(h.gate.comeBack?.probed).toBe(true);
        expect(h.gate.next).toBeLessThanOrEqual(e.day + ADAPT.PROBE_FOLLOW_MIN + ADAPT.PROBE_FOLLOW_SPREAD);
        followed++;
      } else if (e.adapt) { bigger++; if (e.dossier.join(' ').match(/Word has gone round|Everybody in the county/)) withWhy++; }
    }
    expect(crews).toBeGreaterThan(5);
    // this place has a wall and it is late: crews are adapted, and now and then a probe comes first
    expect(bigger).toBeGreaterThan(3);
    expect(probed).toBeGreaterThan(0);
    expect(withWhy).toBe(bigger);
    expect(followed).toBe(probed);
  }, 60_000);
  it('Cozy and Standard never get a probing raid, and before the end of year one no level adapts', () => {
    for (const l of ['cozy', 'standard'] as const) {
      for (let seed = 1; seed <= 30; seed++) {
        const g = late(l, SINCE_FULL, seed); g.gate.day = -5; g.gate.next = 0;
        const e = gateDay(g);
        if (e) expect(e.probe).toBeUndefined();
        expect(g.gate.lastProbe).toBeUndefined();
      }
    }
    for (const l of ['cozy', 'standard', 'hardcore'] as const) {
      for (let seed = 1; seed <= 20; seed++) {
        const g = late(l, 200, seed); g.gate.day = -5; g.gate.next = 0;
        const e = gateDay(g);
        if (e) { expect(e.adapt).toBeUndefined(); expect(e.probe).toBeUndefined(); }
      }
    }
  }, 60_000);
});

describe('the first hard winter', () => {
  const fresh = (l: Difficulty, kind: 'grid_down' | 'nuclear' = 'grid_down', seed = 5) => newGame(seed, 105, 2027, { mode: 'scenario', peace: 'short', kind, difficulty: l });

  it('is the first deep-winter window at least a month after the hit, derived from the seed (no saved state), and a few days long', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const g = fresh('hardcore', 'grid_down', seed);
      const w = firstWinter(g)!;
      expect(w.from).toBeGreaterThanOrEqual(Math.floor(g.disaster.hitAt) + WINTER.AFTER_HIT);
      expect(w.to - w.from + 1).toBeGreaterThanOrEqual(WINTER.LASTS);
      expect(w.to - w.from + 1).toBeLessThanOrEqual(WINTER.LASTS + WINTER.LASTS_SPREAD);
      expect(w.thaw).toBe(w.to + WINTER.THAW_AFTER);
      expect(w.from - Math.floor(g.disaster.hitAt)).toBeLessThan(WINTER.AFTER_HIT + 400);
      expect(firstWinter(g)).toEqual(w);
    }
  });
  it('is the winter, not the summer', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const g = fresh('hardcore', 'grid_down', seed), w = firstWinter(g)!;
      const doy = (((g.clock.startDoy - 1 + w.from) % 365) + 365) % 365 + 1;
      expect(doy >= WINTER.FROM_DOY || doy <= WINTER.TO_DOY + 12).toBe(true);
    }
  });
  it('takes wood and fuel in the freeze and fresh and frozen food at the thaw, once, on Hardcore only', () => {
    for (const l of ['cozy', 'standard'] as const) {
      const g = fresh(l), w = firstWinter(g)!;
      g.stock.firewood = 30; g.stock.fuel = 40; g.stock.fresh = 100; g.stock.frozen = 100; g.stock.canned = 100;
      const before = { ...g.stock };
      for (let d = w.from; d <= w.thaw + 2; d++) expect(winterDay(g, d)).toEqual([]);
      expect(g.stock).toEqual(before);
      expect(inFreeze(g, w.from)).toBe(false);
    }
    const g = fresh('hardcore'), w = firstWinter(g)!;
    g.stock.firewood = 40; g.stock.fuel = 40; g.stock.fresh = 100; g.stock.frozen = 100; g.stock.canned = 100; g.stock.staples = 100;
    const lines: string[] = [];
    for (let d = w.from - 3; d <= w.thaw + 3; d++) lines.push(...winterDay(g, d));
    const days = w.to - w.from + 1;
    expect(g.stock.firewood).toBe(40 - Math.floor(days * WINTER.RICKS_PER_DAY));
    expect(g.stock.fuel).toBe(40 - Math.floor(40 * WINTER.FUEL_SHARE));
    expect(g.stock.fresh).toBe(100 - Math.floor(100 * WINTER.SPOIL_FRESH));
    expect(g.stock.frozen).toBe(100 - Math.floor(100 * WINTER.SPOIL_FROZEN));
    expect(g.stock.canned).toBe(100 - Math.floor(100 * WINTER.SPOIL_CANNED));
    expect(g.stock.staples).toBe(100 - Math.floor(100 * WINTER.SPOIL_STAPLES));
    expect(lines.some(l => l.includes('deep freeze'))).toBe(true);
    expect(lines.some(l => l.includes('The thaw'))).toBe(true);
    expect(inFreeze(g, w.from)).toBe(true); expect(inFreeze(g, w.to + 1)).toBe(false);
  });
  it('runs through the engine: Hardcore loses wood and fuel in the first winter that Standard keeps', () => {
    const run = (l: Difficulty) => {
      let g = fresh(l); g.stock.firewood = 60; g.stock.fuel = 40;
      const w = firstWinter(g)!;
      g = step(g, w.thaw + 1 - g.clock.t);
      return g;
    };
    const h = run('hardcore'), s = run('standard');
    expect(h.stock.fuel).toBeLessThan(s.stock.fuel);
    expect(h.log.some(e => e.text.includes('deep freeze'))).toBe(true);
    expect(s.log.some(e => e.text.includes('deep freeze'))).toBe(false);
  }, 60_000);
});
