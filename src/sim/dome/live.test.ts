import { describe, expect, it } from 'vitest';
import { newGame, SAVE_VERSION, type GameState, type Structure } from '../state';
import { migrate } from '../save/migrations';
import { step } from '../engine';
import { BLUEPRINTS } from '../blueprints';
import { FILTERING, freshAir, lockdownClock, type Filtering } from './air';
import { TIER, DOME_KIND, kindOfCells, sizesOf, type DomeTier } from './tiers';
import {
  buyFiltering, domeAirLine, domeCards, domeChoose, domeClean, domeFalloutAdj, domeKwhDay, domeLook, domeOf, domeShelter, effectiveScrub, filteringBill, filteringProblem,
  newDomeState, replaceFilters, setLockdown, stepDome, domeDay, tendEcology, airCtx, domeHeatK,
} from './live';
import { fxCards, fxChoose } from '../disasterFx';
import { nightKwhPerDay } from './climate';

const dome = (g: GameState, tier: DomeTier = 'geodesic', x = 0, z = 0): Structure => {
  const kind = DOME_KIND[tier];
  const st: Structure = { id: `d${g.structures.length}`, kind, x, z, rot: 0, stage: BLUEPRINTS[kind].stages.length, done: 0, supplied: true, finishedAt: 0 };
  g.structures.push(st);
  return st;
};
const wire = (g: GameState, id: string) => g.utilities.fittings.push({ building: id, kind: 'wire', done: 1, hours: 1, supplied: true, finishedAt: 0 });
const power = (g: GameState) => { g.structures.push({ id: 'sol', kind: 'solar_array', x: 5, z: 5, rot: 0, stage: 9, done: 0, supplied: true, finishedAt: 0 }); };
const base = (tier: DomeTier = 'geodesic'): GameState => { const g = newGame(5); g.money = 1e9; const st = dome(g, tier); wire(g, st.id); power(g); return g; };
const run = (g: GameState, hours: number) => { const n = Math.round(hours * 4); for (let i = 0; i < n; i++) stepDome(g, 0.25 / 24); };

describe('lockdown state', () => {
  it('needs a finished dome', () => {
    const g = newGame(5);
    expect(setLockdown(g, true)).toMatch(/no dome/);
    expect(g.dome).toBeUndefined();
  });
  it('seals, burns air and opens again', () => {
    const g = base();
    expect(setLockdown(g, true)).toBeNull();
    expect(setLockdown(g, true)).toMatch(/already/);
    run(g, 20);
    expect(g.dome!.co2ppm).toBeGreaterThan(freshAir().co2ppm + 500);
    expect(g.dome!.o2pct).toBeLessThan(20.9);
    expect(setLockdown(g, false)).toBeNull();
    run(g, 1);
    expect(g.dome!.co2ppm).toBe(freshAir().co2ppm);
  });
  it('the fail-safe vents open on their own and say so', () => {
    const g = base('earthen');
    setLockdown(g, true);
    const lines: string[] = [];
    for (let i = 0; i < 4 * 24 * 10 && g.dome!.lockdown; i++) lines.push(...stepDome(g, 0.25 / 24));
    expect(g.dome!.lockdown).toBe(false);
    expect(g.dome!.ventedAt).not.toBeNull();
    expect(lines.some(l => /fail-safe vents/.test(l))).toBe(true);
  });
  it('raises an air alarm on the board line before the vents open', () => {
    const g = base('earthen');
    setLockdown(g, true);
    let seen = false;
    for (let i = 0; i < 4 * 24 * 10 && g.dome!.lockdown; i++) { stepDome(g, 0.25 / 24); if (domeAirLine(g)) seen = true; }
    expect(seen).toBe(true);
  });
});

describe('monotone: more filtering never reduces the air', () => {
  const levels = FILTERING;
  it('effective scrubbing never falls up the ladder, at any media health', () => {
    for (const h of [0, 0.3, 0.7, 1]) for (const e of [0, 0.4, 1]) {
      for (let i = 1; i < levels.length; i++) {
        const a = effectiveScrub(levels[i - 1], h, e), b = effectiveScrub(levels[i], h, e);
        expect(b.co2, `${levels[i]} h${h} e${e}`).toBeGreaterThanOrEqual(a.co2 - 1e-9);
        expect(b.o2).toBeGreaterThanOrEqual(a.o2 - 1e-9);
      }
    }
  });
  it('hours of air never fall as the level rises, powered, for every tier', () => {
    for (const tier of ['earthen', 'geodesic', 'glass', 'arcology'] as DomeTier[]) {
      let last = -1;
      for (const lv of levels) {
        const g = base(tier); g.dome = { ...newDomeState(), filtering: lv };
        const d = domeOf(g)!, st = g.dome!;
        const c = lockdownClock(freshAir(), airCtx(g, d, st, true));
        const hrs = c.hours === Infinity ? 1e12 : c.hours;
        expect(hrs, `${tier} ${lv}`).toBeGreaterThanOrEqual(last - 1e-6);
        last = hrs;
      }
    }
  });
  it('a closed ecology, powered, is never worse than none (and never worse than advanced)', () => {
    for (const h of [0, 0.5, 1]) {
      const g = base(); g.dome = { ...newDomeState(), filtering: 'closed', ecoHealth: h };
      const none = lockdownClock(freshAir(), airCtx(g, domeOf(g)!, { ...g.dome!, filtering: 'none' }, true)).hours;
      const closed = lockdownClock(freshAir(), airCtx(g, domeOf(g)!, g.dome!, true)).hours;
      expect(closed).toBeGreaterThanOrEqual(none);
    }
  });
  it('a sealed dome with a healthy closed ecology and power never runs out of air', () => {
    const g = base(); g.dome = { ...newDomeState(), filtering: 'closed', ecoHealth: 1 };
    setLockdown(g, true);
    stepDome(g, 1 / 24);
    run(g, 24 * 30);
    expect(g.dome!.lockdown).toBe(true);
    expect(g.dome!.alarm).toBe('ok');
    expect(g.dome!.co2ppm).toBeLessThan(2000);
  });
  it('more people, and a fouled bank, never lengthen the clock', () => {
    const g = base(); g.dome = { ...newDomeState(), filtering: 'advanced' };
    const d = domeOf(g)!;
    const fresh = lockdownClock(freshAir(), { ...airCtx(g, d, g.dome!, true), people: 4 }).hours;
    const crowded = lockdownClock(freshAir(), { ...airCtx(g, d, g.dome!, true), people: 12 }).hours;
    expect(crowded).toBeLessThanOrEqual(fresh);
  });
});

describe('purchases', () => {
  it('prices scale with the dome and the closed ecology is very expensive with a permit and a long fit', () => {
    const a = base('geodesic'), b = base('glass');
    expect(filteringBill(b, 'closed')!.usd).toBeGreaterThan(filteringBill(a, 'closed')!.usd);
    const c = filteringBill(a, 'closed')!;
    expect(c.usd).toBeGreaterThan(filteringBill(a, 'advanced')!.usd * 5);
    expect(c.permitUsd).toBeGreaterThan(0);
    expect(c.days).toBeGreaterThan(filteringBill(a, 'advanced')!.days);
  });
  it('the closed ecology needs the advanced bank first, and money', () => {
    const g = base();
    expect(filteringProblem(g, 'closed')).toMatch(/advanced/);
    g.money = 100;
    expect(filteringProblem(g, 'scrubber')).toMatch(/needs \$/);
  });
  it('buying takes the money, fits over days, then runs', () => {
    const g = base(); const m0 = g.money;
    expect(buyFiltering(g, 'advanced')).toBeNull();
    expect(g.money).toBeLessThan(m0);
    expect(g.dome!.filtering).toBe('none');
    expect(buyFiltering(g, 'scrubber')).toMatch(/being fitted/);
    g.clock.t += 20;
    domeDay(g);
    expect(g.dome!.filtering).toBe('advanced');
  });
  it('the earthen dome only takes scrubbers', () => {
    expect(filteringProblem(base('earthen'), 'advanced')).toMatch(/too small/);
  });
  it('swapping media restores it', () => {
    const g = base(); g.dome = { ...newDomeState(), filtering: 'advanced', filterHealth: 0.2 };
    expect(replaceFilters(g)).toBeNull();
    expect(g.dome!.filterHealth).toBe(1);
  });
  it('tending restores a blighted loop', () => {
    const g = base(); g.dome = { ...newDomeState(), filtering: 'closed', ecoHealth: 0.2 };
    expect(tendEcology(g)).toBeNull();
    expect(g.dome!.ecoHealth).toBe(1);
  });
});

describe('power and climate', () => {
  it('the draw is the climate plant plus the air plant while sealed', () => {
    const g = base(); g.dome = { ...newDomeState(), filtering: 'advanced' };
    const st = domeOf(g)!.st;
    const open = domeKwhDay(g, st);
    g.dome.lockdown = true;
    expect(domeKwhDay(g, st)).toBeGreaterThan(open);
    expect(open).toBeGreaterThan(0);
  });
  it('a colder mode costs more and the frost mode is the cheapest', () => {
    const g = base(); const st = domeOf(g)!.st;
    const k = (m: 'frost' | 'temperate' | 'comfortable') => { g.dome = { ...newDomeState(), mode: m }; return domeKwhDay(g, st); };
    expect(k('frost')).toBeLessThanOrEqual(k('temperate') + 1e-9);
    expect(k('temperate')).toBeLessThanOrEqual(k('comfortable') + 1e-9);
  });
  it('matches the pure model on a night with no sun', () => {
    expect(nightKwhPerDay('geodesic', TIER.geodesic.cells, 20, 'frost')).toBeGreaterThan(0);
  });
  it('an unwired dome has an unpowered plant and a floating temperature', () => {
    const g = newGame(5); dome(g);
    setLockdown(g, true); stepDome(g, 0.25 / 24);
    expect(g.dome!.powered).toBe(false);
  });
  it('a wired dome with power runs, indoors held inside the band', () => {
    const g = base(); g.dome = { ...newDomeState(), mode: 'comfortable' };
    stepDome(g, 0.25 / 24);
    expect(g.dome!.powered).toBe(true);
    expect(g.dome!.indoorF).toBeGreaterThanOrEqual(63.9);
  });
  it('a powered dome over homes saves firewood', () => {
    const g = base(); g.dome = { ...newDomeState(), powered: true };
    expect(domeHeatK(g)).toBe(1);   // no home under it yet
    g.structures.push({ id: 'h', kind: 'cottage', x: 0.2, z: 0.2, rot: 0, stage: 9, done: 0, supplied: true, finishedAt: 0 });
    expect(domeHeatK(g)).toBeLessThan(1);
  });
});

describe('fallout and the clean zone', () => {
  it('open with dust outside lets it in; sealed keeps the zone clean', () => {
    const open = base(); open.disaster.kind = 'nuclear'; open.disaster.hitAt = 0; open.clock.t = 0.2; open.disaster.variant = 'distant';
    run(open, 12);
    expect(open.dome!.dust).toBeGreaterThan(0.25);
    expect(domeClean(open)).toBe(false);
    const sealed = base(); sealed.disaster.kind = 'nuclear'; sealed.disaster.hitAt = 0; sealed.clock.t = 0.2; sealed.disaster.variant = 'distant';
    setLockdown(sealed, true);
    run(sealed, 12);
    expect(sealed.dome!.dust).toBe(0);
    expect(domeClean(sealed)).toBe(true);
    expect(domeFalloutAdj(sealed)!.foodK).toBeLessThan(domeFalloutAdj(open)!.foodK);
    expect(domeShelter(sealed)).not.toBeNull();
    expect(domeShelter(open)).toBeNull();
  });
  it('a sealed dome cuts the dose a family working in the yard takes', () => {
    const mk = (seal: boolean) => { const g = base('arcology'); g.disaster.kind = 'nuclear'; g.disaster.hitAt = 0; g.disaster.variant = 'distant'; g.clock.t = 20; if (seal) setLockdown(g, true); return step(g, 1); };
    const a = mk(false), b = mk(true);
    const dose = (g: GameState) => g.personState.reduce((x, p) => x + p.needs.dose, 0);
    expect(dose(b)).toBeLessThanOrEqual(dose(a));
  });
  it('harsh weather outside does not change a sealed dome\'s air', () => {
    const g = base(); setLockdown(g, true); const c0 = domeAirLine(g);
    g.weather = { active: { kind: 'blizzard', at: 0, until: 5 }, last: 0 };
    run(g, 2);
    expect(c0).toBeNull();
    expect(g.dome!.co2ppm).toBeLessThan(2000);
  });
});

describe('failure events', () => {
  it('a fouled bank raises a card that fxCards carries, and the swap clears it', () => {
    const g = base(); g.dome = { ...newDomeState(), filtering: 'advanced', filterHealth: 0.2, lockdown: true };
    domeDay(g);
    expect(domeCards(g).map(c => c.id)).toContain('dome:foul');
    expect(fxCards(g).map(c => c.id)).toContain('dome:foul');
    expect(fxChoose(g, 'dome:foul:swap')).toBeTruthy();
    expect(g.dome!.filterHealth).toBe(1);
    expect(domeCards(g).length).toBe(0);
  });
  it('the opening choice ends a lockdown', () => {
    const g = base(); g.dome = { ...newDomeState(), filtering: 'advanced', lockdown: true, cards: ['power'] };
    domeChoose(g, 'dome:open');
    expect(g.dome!.lockdown).toBe(false);
    expect(g.dome!.cards).toEqual([]);
  });
  it('a seized plant stops the plant; the crew brings it back', () => {
    const g = base(); g.dome = { ...newDomeState(), filtering: 'advanced', lockdown: true, plantDownUntil: g.clock.t + 3, cards: ['plant'] };
    stepDome(g, 0.25 / 24);
    expect(g.dome!.powered).toBe(false);
    domeChoose(g, 'dome:plant:crew');
    stepDome(g, 0.25 / 24);
    expect(g.dome!.powered).toBe(true);
  });
  it('Cozy is gentler than Hardcore', async () => {
    const { failScale } = await import('./live');
    const g = base(); g.disaster.difficulty = 'cozy'; const c = failScale(g); g.disaster.difficulty = 'hardcore';
    expect(c).toBeLessThan(failScale(g));
  });
});

describe('look and save', () => {
  it('haze rises with CO2 and plants show only with the closed loop', () => {
    const g = base(); g.dome = { ...newDomeState(), lockdown: true, co2ppm: 12000 };
    expect(domeLook(g).haze).toBeGreaterThan(0.3);
    expect(domeLook(g).plants).toBe(0);
    g.dome.filtering = 'closed';
    expect(domeLook(g).plants).toBeGreaterThan(0);
  });
  it('a v98 save with no dome migrates and the field stays absent; a dome state round-trips', () => {
    const g = newGame(5); const raw = JSON.parse(JSON.stringify({ ...g, version: 98 }));
    const m = migrate(raw);
    expect(m.version).toBe(SAVE_VERSION);
    expect(SAVE_VERSION).toBeGreaterThanOrEqual(99);
    expect(m.dome).toBeUndefined();
    const h = base(); setLockdown(h, true); run(h, 3);
    const back = migrate(JSON.parse(JSON.stringify(h)));
    expect(back.dome).toEqual(h.dome);
  });
  it('a long sealed run through the real engine keeps the clock sane', () => {
    let g = base(); setLockdown(g, true);
    g = step(g, 1);
    expect(g.dome!.co2ppm).toBeGreaterThan(freshAir().co2ppm);
  });
  it('filtering types cover the ladder', () => { expect((FILTERING as readonly Filtering[]).length).toBe(4); });
});

describe('a resized dome runs its own size', () => {
  it('a bigger shell has more cells and a bigger power draw than the tier default', () => {
    const small = base(), big = base();
    const st = big.structures.find(x => x.kind === DOME_KIND.geodesic)!;
    st.kind = kindOfCells('geodesic', Math.max(...sizesOf('geodesic'))); st.stage = BLUEPRINTS[st.kind].stages.length;
    expect(domeOf(big)!.cells).toBeGreaterThan(domeOf(small)!.cells);
    expect(domeKwhDay(big, st)).toBeGreaterThan(domeKwhDay(small, small.structures.find(x => x.kind === DOME_KIND.geodesic)!));
  });
});
