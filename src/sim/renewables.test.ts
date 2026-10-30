import { afterEach, describe, expect, it } from 'vitest';
import { newGame, type GameState, type Structure } from './state';
import { setGroundOverride } from './terrainState';
import type { GroundSource } from './terrain';
import { planRun } from './perimeter';
import { balanceDay, plant, UTILITY } from './utilities';
import { BLUEPRINTS, totalBill, totalHours } from './blueprints';
import { MATERIALS, type MaterialId } from './materials';
import { needsPermit } from './paperwork';
import { CHORES } from './daily';
import {
  HYDRO, TURBINE, bladesIced, creekInFlood, creekLps, dayWindFactor, hubMeanMs, hydroDay, hydroProblem, hydroSiteAt, intakeCare,
  intakeIce, meanKw, plantChoreRate, powerKw, renewablesDay, turbineNoise, windDay, windExposure,
} from './renewables';

afterEach(() => setGroundOverride(null));

// a creek running east along z = 30 that falls 0.06 units per unit of length (about 3.6 m per 10 units), on a gentle bench
const FALLING: GroundSource = { h: (x, z) => -0.06 * x + 0.04 * Math.abs(z - 30), creek: { zAt: () => 30, waterY: x => -0.06 * x - 0.2, halfWidth: 0.8 } };
const FLATCREEK: GroundSource = { h: () => 0, creek: { zAt: () => 30, waterY: () => -0.2, halfWidth: 0.8 } };
const built = (g: GameState, id: string, kind: string, x: number, z: number): Structure => { const st: Structure = { id, kind, x, z, rot: 0, stage: 9, done: 0, supplied: true, finishedAt: 0 }; g.structures.push(st); return st; };
const place = (region: GameState['site']['region'] = 'mountain_west'): GameState => { const g = newGame(5); g.site = { ...g.site, region, creek: true, lot: null, home: { x0: 0, z0: 0, x1: 67, z1: 67 } }; return g; };
const atDoy = (g: GameState, doy: number) => { g.clock.t = ((doy - g.clock.startDoy) % 365 + 365) % 365 + 0.5; };

describe('micro-hydro', () => {
  it('head is the creek\'s fall over the penstock, and the siting rule says why not', () => {
    setGroundOverride(FALLING);
    const g = place();
    const site = hydroSiteAt(g, 40, 33)!;
    expect(site.lenM).toBe(100);
    expect(site.headM).toBeCloseTo(0.06 * (100 / 6) * 6, 1);   // 6 m
    expect(site.netM).toBeCloseTo(site.headM * HYDRO.NET, 3);
    expect(hydroProblem(g, 40, 33)).toBeNull();
    expect(hydroProblem(g, 40, 60)).toBe('not_on_bank');
    expect(hydroProblem(g, 40, 30.3)).toBe('not_on_bank');   // in the channel
    setGroundOverride(FLATCREEK);
    expect(hydroProblem(g, 40, 33)).toBe('no_head');
    g.site = { ...g.site, creek: false };
    expect(hydroProblem(g, 40, 33)).toBe('no_creek');
  });

  it('the intake is not drawn off your land: a house by the upstream edge gets a short pipe and little head', () => {
    setGroundOverride(FALLING);
    const g = place();
    const site = hydroSiteAt(g, 8, 33)!;
    expect(site.lenM).toBeLessThan(40);
    expect(site.headM).toBeLessThan(2.5);
    expect(hydroProblem(g, 8, 33)).toBe('no_head');
  });

  it('power follows 9.81 x flow x head x efficiency, the runoff beats the August low, and a dry creek stops it', () => {
    setGroundOverride(FALLING);
    const g = place();
    const st = built(g, 'hy', 'micro_hydro', 40, 33);
    atDoy(g, 140);
    const spring = hydroDay(g, st);
    atDoy(g, 235);
    const august = hydroDay(g, st);
    expect(spring.state).toBe('running');
    expect(spring.kw).toBeGreaterThan(august.kw);
    expect(spring.kw).toBeLessThanOrEqual(HYDRO.MAX_KW);
    expect(spring.kw).toBeCloseTo(Math.min(HYDRO.MAX_KW, 9.81 * spring.lps * spring.netM * HYDRO.ETA / 1000), 3);
    expect(spring.kwh).toBeCloseTo(spring.kw * 24, 3);
    // a drought
    g.disaster = { ...g.disaster, kind: 'drought', hitAt: 0 };
    expect(creekLps(g, 235, 235)).toBeLessThan(creekLps({ ...g, disaster: { ...g.disaster, kind: null } } as GameState, 235, 235) * 0.5);
  });

  it('ice at the intake cuts a cold region\'s winter output, a mild one barely notices, and a flood shuts the gate', () => {
    setGroundOverride(FALLING);
    const cold = place('north_woods'), mild = place('hill_country');
    expect(intakeIce(cold, 20)).toBeGreaterThan(intakeIce(mild, 20));
    expect(intakeIce(cold, 200)).toBe(0);
    const st = built(cold, 'hy', 'micro_hydro', 40, 33);
    atDoy(cold, 20);
    const winter = hydroDay(cold, st), summer = (atDoy(cold, 200), hydroDay(cold, st));
    expect(winter.kw).toBeLessThan(summer.kw);
    atDoy(cold, 201);
    const d0 = Math.floor(cold.clock.t);
    cold.weather = { active: { kind: 'flood', at: d0 - 1, until: d0 + 2 }, last: 0 } as GameState['weather'];
    expect(creekInFlood(cold)).toBe(true);
    expect(hydroDay(cold, st).state).toBe('flood');
    expect(hydroDay(cold, st).kwh).toBe(0);
  });

  it('a screen packed with leaves costs up to 40 %', () => {
    expect(intakeCare(0)).toBe(1);
    expect(intakeCare(100)).toBeCloseTo(0.6, 5);
    setGroundOverride(FALLING);
    const g = place();
    const st = built(g, 'hy', 'micro_hydro', 40, 33);
    atDoy(g, 140);
    expect(hydroDay(g, st, { care: 0.6 }).kw).toBeLessThan(hydroDay(g, st).kw);
  });

  it('a broken plant makes nothing; a flood can take the weir; repair is the pump\'s path', () => {
    setGroundOverride(FALLING);
    const g = place();
    const st = built(g, 'hy', 'micro_hydro', 40, 33);
    atDoy(g, 140);
    expect(hydroDay(g, st, { broken: true }).state).toBe('broken');
    const day = Math.floor(g.clock.t);
    g.weather = { active: { kind: 'flood', at: day, until: day + 3 }, last: 0 } as GameState['weather'];
    const r = renewablesDay(g, 0.01);
    expect(g.utilities.broken).toContain('hy');
    expect(r.notes[0]).toMatch(/weir/);
  });
});

describe('the wind turbine', () => {
  it('the power curve: nothing below cut-in, a cubic ramp, rated, furled above 25', () => {
    expect(powerKw(2)).toBe(0);
    expect(powerKw(TURBINE.CUT_IN)).toBe(0);
    expect(powerKw(7)).toBeGreaterThan(powerKw(5));
    expect(powerKw(TURBINE.RATED_MS)).toBe(TURBINE.RATED_KW);
    expect(powerKw(20)).toBe(TURBINE.RATED_KW);
    expect(powerKw(26)).toBe(0);
  });

  it('a Rayleigh day: capacity factor is realistic (about 10-30 % at 5-6 m/s hub wind) and grows with the wind', () => {
    const cf = (v: number) => meanKw(v) / TURBINE.RATED_KW;
    expect(cf(3)).toBeLessThan(0.06);
    expect(cf(5.5)).toBeGreaterThan(0.1);
    expect(cf(5.5)).toBeLessThan(0.3);
    expect(cf(8)).toBeGreaterThan(cf(5.5));
    expect(cf(8)).toBeLessThan(0.55);
  });

  it('the ground decides: a ridge beats a hollow, the plains beat the Appalachian valleys, timber costs wind', () => {
    const open = place('plains'), valley = place('appalachia');
    setGroundOverride({ h: () => 0 });
    expect(hubMeanMs(open, 30, 30)).toBeGreaterThan(hubMeanMs(valley, 30, 30));
    // a knoll against a dish: the analysed wind field reads high ground as exposed
    setGroundOverride({ h: (x, z) => 2.5 * Math.exp(-((x - 30) ** 2 + (z - 30) ** 2) / 120) - 2.5 * Math.exp(-((x - 50) ** 2 + (z - 50) ** 2) / 120) });
    const g = place('mountain_west');
    expect(windExposure(g, 30, 30)).toBeGreaterThan(windExposure(g, 50, 50));
    const wooded = place('mountain_west'); wooded.site.timber = 1.4;
    expect(windExposure(wooded, 30, 30)).toBeLessThan(windExposure(g, 30, 30));
  });

  it('a gale furls it, an ice storm ices it, a derecho can break it, and the day factor is seeded', () => {
    setGroundOverride({ h: () => 0 });
    const g = place('plains');
    const st = built(g, 'wt', 'wind_turbine', 30, 30);
    atDoy(g, 100);
    const day = Math.floor(g.clock.t);
    g.weather = { active: { kind: 'derecho', at: day, until: day + 1 }, last: 0 } as GameState['weather'];
    expect(windDay(g, st).state).toBe('furled');
    g.weather = { active: { kind: 'ice_storm', at: day, until: day + 1 }, last: 0 } as GameState['weather'];
    expect(bladesIced(g)).toBe(true);
    const iced = windDay(g, st);
    expect(['iced', 'calm', 'furled']).toContain(iced.state);
    g.weather = { active: { kind: 'derecho', at: day, until: day + 1 }, last: 0 } as GameState['weather'];
    renewablesDay(g, 0.05);
    expect(g.utilities.broken).toContain('wt');
    expect(dayWindFactor(5, 10)).toBe(dayWindFactor(5, 10));
    expect(dayWindFactor(5, 10)).not.toBe(dayWindFactor(5, 11));
  });

  it('noise tells scouts: a running turbine adds to the visibility, a still one does not', () => {
    const g = place();
    expect(turbineNoise(g)).toBe(0);
    g.utilities.report.windKwh = 30;
    expect(turbineNoise(g)).toBeGreaterThan(5);
  });
});

describe('on the place', () => {
  it('both are registered: power sources, priced from the one table, staged, permitted, a chore', () => {
    for (const k of ['micro_hydro', 'wind_turbine']) {
      expect(UTILITY[k].renew).toBeTruthy();
      expect(BLUEPRINTS[k].stages).toHaveLength(5);
      expect(needsPermit(k)).toBe(true);
      for (const m of Object.keys(totalBill(BLUEPRINTS[k]))) expect(MATERIALS[m as MaterialId].price, m).not.toBeNull();
    }
    const cost = (k: string) => Object.entries(totalBill(BLUEPRINTS[k])).reduce((a, [m, n]) => a + (MATERIALS[m as MaterialId].price ?? 0) * n, 0);
    expect(cost('micro_hydro')).toBeGreaterThan(12_000);
    expect(cost('micro_hydro')).toBeLessThan(25_000);
    expect(cost('wind_turbine')).toBeGreaterThan(20_000);
    expect(cost('wind_turbine')).toBeLessThan(35_000);
    expect(totalHours(BLUEPRINTS.micro_hydro)).toBeGreaterThan(200);
    expect(CHORES).toContain('plant');
  });

  it('the intake chore: nothing without a turbine; leaves in October and the runoff in May load it', () => {
    setGroundOverride(FALLING);
    const g = place();
    expect(plantChoreRate(g, 290)).toBe(0);
    built(g, 'hy', 'micro_hydro', 40, 33);
    expect(plantChoreRate(g, 290)).toBeGreaterThan(plantChoreRate(g, 220));
    expect(plantChoreRate(g, 140)).toBeGreaterThan(plantChoreRate(g, 220));
  });

  it('balanceDay: the hydro plant lights a wired house; broken, it does not; the report says how much it made', () => {
    setGroundOverride(FALLING);
    const g = place();
    atDoy(g, 140);
    const hy = built(g, 'hy', 'micro_hydro', 40, 33);
    const home = built(g, 'h', 'timber_cabin', 44, 36);
    const r = planRun(g, 'power_cable', [[40, 33], [44, 36]]); r.done = r.hours; r.supplied = true; r.finishedAt = 0;
    g.utilities.fittings.push({ building: 'h', kind: 'wire', done: 30, hours: 30, supplied: true, finishedAt: 0 });
    balanceDay(g, plant(g), 0.99);
    expect(g.utilities.report.hydroKwh).toBeGreaterThan(10);
    expect(g.utilities.report.solarKwh).toBeGreaterThan(10);
    expect(g.utilities.lit).toContain(home.id);
    g.utilities.broken.push(hy.id);
    g.utilities.lit = [];
    balanceDay(g, plant(g), 0.99);
    expect(g.utilities.report.hydroKwh).toBe(0);
    expect(g.utilities.lit).not.toContain(home.id);
  });
});
