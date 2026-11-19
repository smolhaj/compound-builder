/**
 * The slow climate kinds, runaway heat and the ice age (docs/design/climate_disasters.md PRs 2 and 3): the kind plumbing (tables, pools,
 * fate odds), the era hold and the winter-kind roll, difficulty scaling, determinism, and the homestead effects (grow, work gate, snow load,
 * cold equipment). Pure modules, plus a short run through the real engine.
 */
import { describe, expect, it } from 'vitest';
import { newGame, type GameState } from './state';
import { step } from './engine';
import { erasDay } from './eras';
import {
  DISASTERS, FATE_ODDS, SURPRISE_BASE, SURPRISE_POOL, TRACKS, VARIANT_FATE, curveLevel, fateOdds, newDisaster, nextEraDisaster, surpriseKind, surpriseWeight, tracksAt, type DisasterKind,
} from './disaster';
import { DIFFICULTY, type Difficulty } from './difficulty';
import { REGIONS } from './regions';
import { REGION_IDS } from './regions';
import { NO_WINTER, winterAt } from './winter';
import { HEAT_PEAK_F, coldAnomaly, heatPeakF, snowLoadPsf } from './climateCurve';
import {
  OCEAN_SHUTDOWN_K, SLOW_KINDS, WINTER_KINDS, climateTune, coldBatteryK, coldWoodK, dayPeakF, dieselGelK, eraHoldDays, heatDeltaF, heatGrow, heatLiftF, heatPeakDeltaF, heatThirstK,
  heatWellYield, heatWorkShare, iceColdF, iceGroundPsf, iceMeanDropF, iceWinter, isSlowKind, slowWoodK, slowYears, summerness,
} from './slowClimate';
import { heatWorkRate } from './heatWork';
import { meanLow } from './housing';
import { fx as heatFx, heatGridK, heatIllnessChance } from './disasters/runaway_heat';
import { fx as iceFx, roofSnow, shovelSnow } from './disasters/ice_age';
import { fxCtxFor, fxSupplyMods, fxPriceMod } from './disasterFx';
import { ROOF_CAP, roofRatio, density } from './ashfall';

const heatGame = (over: { region?: string; difficulty?: Difficulty; variant?: string; years?: number; doy?: number } = {}): GameState => {
  const g = newGame(7, 105, 2027, { mode: 'scenario', peace: 'short', kind: 'runaway_heat', variant: over.variant ?? 'dry_furnace', difficulty: over.difficulty ?? 'standard' });
  if (over.region) g.site.region = over.region as GameState['site']['region'];
  g.clock.t = g.disaster.hitAt + 365 * (over.years ?? 0) * climateTune(g.disaster.difficulty).stretch;
  if (over.doy) g.clock.startDoy = over.doy - Math.floor(g.clock.t);
  return g;
};
const iceGame = (over: { region?: string; difficulty?: Difficulty; variant?: string; years?: number } = {}): GameState => {
  const g = newGame(7, 105, 2027, { mode: 'scenario', peace: 'short', kind: 'ice_age', variant: over.variant ?? 'dimmed_sun', difficulty: over.difficulty ?? 'standard' });
  if (over.region) g.site.region = over.region as GameState['site']['region'];
  g.clock.t = g.disaster.hitAt + 365 * (over.years ?? 0) * climateTune(g.disaster.difficulty).stretch;
  return g;
};
const SLOW = ['runaway_heat', 'ice_age'] as const;

describe('the two kinds in the collapse clock', () => {
  it('have the planned variants, eight service tracks each, and a warning of months', () => {
    expect(DISASTERS.runaway_heat!.variants.map(v => v.id)).toEqual(['dry_furnace', 'humid_furnace']);
    expect(DISASTERS.ice_age!.variants.map(v => v.id)).toEqual(['dimmed_sun', 'ocean_shutdown']);
    for (const k of SLOW) {
      const d = DISASTERS[k]!;
      expect(d.pulpy).toBe(false);
      expect(d.warn[0]).toBeGreaterThanOrEqual(90);
      for (const v of d.variants) for (const t of TRACKS) expect(v.curves[t], `${k}/${v.id} ${t}`).toBeDefined();
      for (const h of d.hints) expect(h.length).toBeGreaterThanOrEqual(3);
      expect(d.hit[0]).toContain('{cause}');
    }
  });
  it('every service track only ever falls (monotone, nothing comes back inside a run)', () => {
    for (const k of SLOW) for (const v of DISASTERS[k]!.variants) for (const t of TRACKS) {
      const c = v.curves[t]!;
      expect(c.back, `${k}/${v.id} ${t}`).toBeNull();
      let prev = 1;
      for (let day = 0; day <= 3000; day += 25) { const lv = curveLevel(c, undefined, day); expect(lv).toBeLessThanOrEqual(prev + 1e-12); expect(lv).toBeGreaterThanOrEqual(c.floor - 1e-12); prev = lv; }
    }
  });
  it('the plan\'s curves are what is coded (heat grid 120/600/0.15, ice grid 30/200/0.2)', () => {
    expect(DISASTERS.runaway_heat!.variants[0].curves.grid).toMatchObject({ at: 120, fall: 600, floor: 0.15 });
    expect(DISASTERS.ice_age!.variants[0].curves.grid).toMatchObject({ at: 30, fall: 200, floor: 0.2 });
  });
  it('are in the Surprise pool, with the planned base weights, and in both fate tables', () => {
    for (const k of SLOW) { expect(SURPRISE_POOL).toContain(k); expect(FATE_ODDS[k]!.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9); }
    expect(SURPRISE_BASE.runaway_heat).toBe(0.15);
    expect(SURPRISE_BASE.ice_age).toBe(0.12);
    expect(FATE_ODDS.runaway_heat).toEqual([0.02, 0.18, 0.8]);
    expect(FATE_ODDS.ice_age).toEqual([0.05, 0.25, 0.7]);
    for (const [key, v] of Object.entries(VARIANT_FATE)) { expect(v.reduce((a, b) => a + b, 0), key).toBeCloseTo(1, 9); const [k, id] = key.split('/'); expect(DISASTERS[k as DisasterKind]!.variants.some(x => x.id === id), key).toBe(true); }
    expect(fateOdds('runaway_heat', 'humid_furnace')[2]).toBeGreaterThan(fateOdds('runaway_heat', 'dry_furnace')[2]);
  });
  it('chain into the planned follow-ons', () => {
    expect(DISASTERS.runaway_heat!.chain.map(c => c.kind)).toEqual(expect.arrayContaining(['mass_exodus', 'water_war', 'global_famine', 'wildfire', 'lawless']));
    expect(DISASTERS.ice_age!.chain.map(c => c.kind)).toEqual(expect.arrayContaining(['global_famine', 'mass_exodus', 'lawless']));
    for (const k of SLOW) for (const c of DISASTERS[k]!.chain) expect(DISASTERS[c.kind], c.kind).toBeDefined();
  });
  it('region odds are sane and say what the plan says', () => {
    for (const id of REGION_IDS) for (const k of SLOW) { const o = REGIONS[id].odds[k] ?? 1; expect(o, `${id} ${k}`).toBeGreaterThan(0); expect(o).toBeLessThanOrEqual(2.5); }
    const heat = (id: (typeof REGION_IDS)[number]) => REGIONS[id].odds.runaway_heat ?? 1, ice = (id: (typeof REGION_IDS)[number]) => REGIONS[id].odds.ice_age ?? 1;
    expect(heat('desert')).toBe(2); expect(heat('hill_country')).toBe(1.8); expect(heat('plains')).toBe(1.5); expect(heat('ozarks')).toBe(1.5); expect(heat('north_woods')).toBe(0.4); expect(heat('pnw')).toBe(0.5);
    expect(ice('north_woods')).toBe(2); expect(ice('new_england')).toBe(1.6); expect(ice('upper_midwest')).toBe(1.6); expect(ice('mountain_west')).toBe(1.3); expect(ice('hill_country')).toBe(0.4); expect(ice('desert')).toBe(0.5);
    expect(surpriseWeight('runaway_heat', REGIONS.desert.odds)).toBeGreaterThan(surpriseWeight('runaway_heat', REGIONS.north_woods.odds));
  });
});

describe('the Surprise roll', () => {
  it('a first Surprise run never rolls a slow kind, and the roll for everything else is as it was', () => {
    for (let seed = 1; seed <= 400; seed++) for (const id of REGION_IDS) {
      const d = newDisaster(seed, 'surprise', 'random', null, undefined, 'standard', REGIONS[id].odds);
      expect(SLOW as readonly string[]).not.toContain(d.kind);
    }
    // the unfiltered roll can reach them (so the filter is what keeps them out)
    let seen = false;
    for (let i = 0; i < 4000 && !seen; i++) seen = isSlowKind(surpriseKind((i + 0.5) / 4000));
    expect(seen).toBe(true);
  });
  it('Scenario mode can choose either kind and either variant', () => {
    for (const k of SLOW) for (const v of DISASTERS[k]!.variants) {
      const d = newDisaster(3, 'scenario', 'short', k, v.id);
      expect(d.kind).toBe(k); expect(d.variant).toBe(v.id);
    }
  });
  it('the era roll never puts one winter kind right after another, and can still roll a slow kind after a plain one', () => {
    const g = newGame(5, 105, 2027, { mode: 'surprise' });
    for (const prev of WINTER_KINDS) {
      let rolled = 0;
      for (let seed = 0; seed < 300; seed++) for (const era of [2, 3, 5]) {
        const d = nextEraDisaster({ ...g.disaster, kind: prev, tracks: { ...g.disaster.tracks } }, 400, seed, era);
        expect(d.kind, `${prev} then nothing`).not.toBeNull();
        expect(WINTER_KINDS, `${prev} then ${d.kind}`).not.toContain(d.kind);
        rolled++;
      }
      expect(rolled).toBeGreaterThan(0);
    }
    const seen = new Set<DisasterKind>();
    for (let seed = 0; seed < 4000; seed++) { const k = nextEraDisaster({ ...g.disaster, kind: 'drought' }, 400, seed, 2).kind; if (k) seen.add(k); }
    expect(seen.has('runaway_heat') || seen.has('ice_age')).toBe(true);
  });
  it('the other pool rules are unchanged: the previous kind is never repeated and a dead grid never rolls grid kinds', () => {
    const g = newGame(5, 105, 2027, { mode: 'surprise' });
    for (let seed = 0; seed < 200; seed++) {
      const d = nextEraDisaster({ ...g.disaster, kind: 'drought', tracks: { ...g.disaster.tracks, grid: 0.05 } }, 400, seed, 3);
      expect(d.kind).not.toBe('drought');
      expect(['grid_down', 'cyberattack', 'solar_flare', 'emp']).not.toContain(d.kind);
    }
  });
});

describe('the winter engine', () => {
  it('winterAt with the default coldScale gives exactly what it always did (the ash winter, the asteroid)', () => {
    // severity 1, Mountain West (k = 1), well into the winter (curve 1): -10 F, grow 0.15, solar 0.6, sun 0.55
    const w = winterAt(200, 1, 'mountain_west');
    expect(w.coldF).toBeCloseTo(-10, 10); expect(w.grow).toBeCloseTo(0.15, 10); expect(w.solar).toBeCloseTo(0.6, 10); expect(w.sunDim).toBeCloseTo(0.55, 10); expect(w.foodStress).toBeCloseTo(0.9275, 10);
    for (const days of [-5, 0, 30, 60, 120, 200, 365, 600, 900]) for (const sev of [0, 0.35, 1, 1.1]) for (const id of REGION_IDS) expect(winterAt(days, sev, id)).toEqual(winterAt(days, sev, id, 1));
    expect(winterAt(-1, 1, 'plains')).toEqual(NO_WINTER);
  });
  it('coldScale scales only the cold: grow, solar, sun and food stress are untouched', () => {
    const a = winterAt(150, 1.1, 'north_woods'), b = winterAt(150, 1.1, 'north_woods', 3);
    expect(b.coldF).toBeCloseTo(a.coldF * 3, 10);
    expect({ ...b, coldF: 0 }).toEqual({ ...a, coldF: 0 });
  });
});

describe('the era holds for a slow kind', () => {
  it('is the curve plus a year: 5 years of heat and 4 of cold at Standard, longer on Cozy, shorter on Hardcore', () => {
    for (const [k, years] of [['runaway_heat', 4], ['ice_age', 3]] as const) {
      expect(eraHoldDays({ kind: k, difficulty: 'standard' })).toBe((years + 1) * 365);
      expect(eraHoldDays({ kind: k, difficulty: 'cozy' })).toBeGreaterThan(eraHoldDays({ kind: k, difficulty: 'standard' }));
      expect(eraHoldDays({ kind: k, difficulty: 'hardcore' })).toBeLessThan(eraHoldDays({ kind: k, difficulty: 'standard' }));
    }
  });
  it('is zero for every other kind, so their era timing cannot change', () => {
    for (const k of Object.keys(DISASTERS) as DisasterKind[]) if (!isSlowKind(k)) for (const d of ['cozy', 'standard', 'hardcore'] as const) expect(eraHoldDays({ kind: k, difficulty: d }), k).toBe(0);
    expect(eraHoldDays({ kind: null, difficulty: 'standard' })).toBe(0);
  });
  const ended = (kind: DisasterKind) => {
    const g = newGame(5, 105, 2027, { mode: 'surprise', kind });
    g.disaster.kind = kind; g.disaster.hitAt = 0; g.disaster.warnAt = -10; g.disaster.fate = 'never'; g.disaster.phase = 'survival'; g.disaster.back = {};
    g.ending = { kind: 'equilibrium', day: 400, continued: true };
    return g;
  };
  it('an existing kind still settles after a year of nothing (never) or three years, exactly as before', () => {
    const a = ended('grid_down'); a.clock.t = 364; erasDay(a); expect(a.lineage.era).toBe(1);
    const b = ended('grid_down'); b.clock.t = 366; erasDay(b); expect(b.lineage.era).toBe(2);
    const c = ended('grid_down'); c.disaster.fate = 'partial'; c.clock.t = 3 * 365 - 1; c.stats.okSince = -1; erasDay(c); expect(c.lineage.era).toBe(1);
    c.clock.t = 3 * 365; erasDay(c); expect(c.lineage.era).toBe(2);
  });
  it('a slow kind does not settle at a year or three, only at the hold, and then the next era rolls', () => {
    for (const k of SLOW) {
      const hold = eraHoldDays({ kind: k, difficulty: 'standard' });
      const a = ended(k); a.clock.t = 3 * 365 + 5; a.stats.okSince = 100; erasDay(a); expect(a.lineage.era, `${k} early`).toBe(1); expect(a.lineage.settling).toBe(true);
      a.clock.t = hold - 1; erasDay(a); expect(a.lineage.era).toBe(1);
      a.clock.t = hold; erasDay(a); expect(a.lineage.era, `${k} hold`).toBe(2);
      expect(WINTER_KINDS as readonly (DisasterKind | null)[]).not.toContain(a.disaster.kind);
    }
  });
});

describe('difficulty bends the curve through DIFFICULTY only', () => {
  it('Cozy stretches 1.5x and shrinks the amplitude to 0.7; Hardcore is faster and deeper; Standard is exactly 1', () => {
    expect(climateTune('cozy')).toEqual({ stretch: 1.5, amp: 0.7 });
    expect(climateTune('standard')).toEqual({ stretch: 1, amp: 1 });
    expect(climateTune('hardcore').stretch).toBeLessThan(1);
    expect(climateTune('hardcore').amp).toBe(1.2);
    expect(DIFFICULTY.cozy.climateStretch).toBe(1.5);
  });
  it('the heat gets hotter and sooner as the difficulty rises', () => {
    const at = (difficulty: Difficulty, days: number) => { const g = heatGame({ difficulty, region: 'plains' }); g.clock.t = g.disaster.hitAt + days; return heatPeakDeltaF(g); };
    for (const days of [200, 500, 900, 1300]) { expect(at('cozy', days)).toBeLessThan(at('standard', days)); expect(at('standard', days)).toBeLessThan(at('hardcore', days)); }
    // the plateau: plains year 4 is +38 F at Standard, 0.7x on Cozy and 1.2x on Hardcore
    expect(at('standard', 365 * 5)).toBeCloseTo(38, 6);
    expect(at('cozy', 365 * 8)).toBeCloseTo(38 * 0.7, 6);
    expect(at('hardcore', 365 * 5)).toBeCloseTo(38 * 1.2, 6);
  });
  it('the cold gets colder and sooner as the difficulty rises', () => {
    const at = (difficulty: Difficulty, days: number) => { const g = iceGame({ difficulty, region: 'north_woods' }); g.clock.t = g.disaster.hitAt + days; return iceColdF(g); };
    for (const days of [200, 400, 700]) { expect(at('cozy', days)).toBeLessThan(at('standard', days)); expect(at('standard', days)).toBeLessThan(at('hardcore', days)); }
  });
});

describe('runaway heat: the curves in the world', () => {
  it('is zero before the warning and ramps up, never down, to the table through year 4', () => {
    const g = heatGame({ region: 'desert' });
    g.clock.t = g.disaster.warnAt - 5; expect(heatPeakDeltaF(g)).toBe(0);
    let prev = 0;
    for (let d = Math.floor(g.disaster.warnAt); d <= g.disaster.hitAt + 365 * 6; d += 10) { g.clock.t = d; const v = heatPeakDeltaF(g); expect(v).toBeGreaterThanOrEqual(prev - 1e-9); prev = v; }
    g.clock.t = g.disaster.hitAt + 365 * 2; expect(heatPeakDeltaF(g)).toBeCloseTo(heatPeakF('desert', 2) - HEAT_PEAK_F.desert[0], 9);
    g.clock.t = g.disaster.hitAt + 365 * 4; expect(heatPeakDeltaF(g)).toBeCloseTo(34, 9);
  });
  it('the warning signs lift the peak by up to 8 F by the hit, and the curve does not drop at the hit', () => {
    const g = heatGame({ region: 'plains' });
    g.clock.t = g.disaster.hitAt - 0.01; const before = heatPeakDeltaF(g);
    g.clock.t = g.disaster.hitAt + 0.01; const after = heatPeakDeltaF(g);
    expect(before).toBeGreaterThan(7.9); expect(before).toBeLessThanOrEqual(8); expect(after).toBeGreaterThanOrEqual(before - 0.05);
  });
  it('lifts the night (meanLow) in a heat disaster and in no other', () => {
    const calm = newGame(7, 105, 2027, { mode: 'scenario', peace: 'short', kind: 'grid_down' }); calm.clock.t = calm.disaster.hitAt + 800;
    const hot = heatGame({ years: 3, region: 'plains' });
    hot.site.region = calm.site.region = 'plains';
    expect(meanLow(hot, 200)).toBeGreaterThan(meanLow(calm, 200) + 20);
    expect(heatLiftF(calm, 200)).toBe(0);
    expect(heatLiftF(hot, 15)).toBeGreaterThan(0);   // (winters turn mild, a smaller lift)
    expect(heatLiftF(hot, 15)).toBeLessThan(heatLiftF(hot, 196));
  });
  it('the grow factor falls with the heat, in summer, and only in summer; the dry and the humid furnace agree on it', () => {
    let prev = 1;
    for (const years of [0, 1, 2, 3, 4]) { const g = heatGame({ years, region: 'plains' }); const v = heatGrow(g, 196); expect(v).toBeLessThanOrEqual(prev + 1e-12); prev = v; }
    expect(prev).toBeLessThan(0.45);
    const g = heatGame({ years: 4, region: 'plains' });
    expect(heatGrow(g, 15)).toBeGreaterThan(0.99);
    expect(heatGrow(g, 196)).toBeGreaterThanOrEqual(0);
    expect(heatGrow(heatGame({ years: 0, region: 'plains' }), 196)).toBeGreaterThan(0.7);   // (the warning's +8 F is in the peak at the hit: crops are already a fifth down)
    // the kind's hook writes it
    const sm = fxSupplyMods(Object.assign(g, {}));
    expect(sm.grow).toBeLessThanOrEqual(1); expect(sm.cold).toBe(0);
  });
  it('wet-bulb gates outdoor work: the humid furnace closes the day sooner than the dry one at the same temperature', () => {
    const dry = heatGame({ years: 3, region: 'ozarks', variant: 'dry_furnace' }), humid = heatGame({ years: 3, region: 'ozarks', variant: 'humid_furnace' });
    for (const air of [90, 100, 110, 120]) expect(heatWorkShare(humid, air, air)).toBeLessThanOrEqual(heatWorkShare(dry, air, air));
    expect(heatWorkShare(humid, 120, 120)).toBe(0);
    expect(heatWorkShare(dry, 70, 70)).toBe(1);
    // monotone in temperature
    let prev = 1;
    for (let air = 60; air <= 140; air += 4) { const v = heatWorkShare(dry, air, air); expect(v).toBeLessThanOrEqual(prev + 1e-12); prev = v; }
    expect(heatWorkShare(newGame(1), 120, 120)).toBe(1);   // (no heat disaster: no gate)
  });
  it('the work rate is 1 outside a heat disaster and for indoor duties, and never above 1 inside one', () => {
    const calm = newGame(7);
    expect(heatWorkRate(calm, 'build')).toBe(1);
    const hot = heatGame({ years: 4, region: 'ozarks', variant: 'humid_furnace' });
    expect(heatWorkRate(hot, 'kitchen')).toBe(1);
    for (let h = 0; h < 24; h += 3) { hot.clock.t = Math.floor(hot.clock.t) + h / 24; const v = heatWorkRate(hot, 'build'); expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(1); }
    // the middle of a deep-summer day is closed and the dead of night is not
    const g = heatGame({ years: 4, region: 'ozarks', variant: 'humid_furnace', doy: 200 });
    g.clock.t = Math.floor(g.clock.t) + 0.35; const noon = heatWorkRate(g, 'build');
    g.clock.t = Math.floor(g.clock.t) + 0.9; const night = heatWorkRate(g, 'build');
    expect(night).toBeGreaterThanOrEqual(noon);
  });
  it('the grid fails on summer afternoons: nothing in winter, harder each year, whole summers dark from year 3', () => {
    expect(heatGridK(0, 196)).toBe(1); expect(heatGridK(3, 15)).toBeCloseTo(1, 1);
    let prev = 1; for (const y of [0.5, 1, 2, 3, 4]) { const v = heatGridK(y, 196); expect(v).toBeLessThanOrEqual(prev); prev = v; }
    expect(heatGridK(3, 196)).toBeCloseTo(0.1, 9);
    const g = heatGame({ years: 3, region: 'plains' });
    expect(heatFx.serviceMods!(g).grid).toBeLessThanOrEqual(1);
  });
  it('heat illness needs a hot house and falls with cooling', () => {
    const g = heatGame({ years: 3, region: 'plains', doy: 200 });
    const raw = heatIllnessChance(g, false);
    expect(raw).toBeGreaterThan(0.02);
    expect(heatIllnessChance(g, true)).toBeGreaterThan(raw);
    const cool = heatGame({ years: 3, region: 'plains', doy: 200 });
    (cool.disaster.fx ??= {}).runaway_heat = { coolUntil: 1e9, ill: 0, told: [] };
    expect(heatIllnessChance(cool, false)).toBeLessThan(raw);
    expect(heatIllnessChance(heatGame({ years: 0, region: 'north_woods', doy: 15 }), false)).toBe(0);
  });
  it('wells drop with the years, the hand pump faster; thirst goes up in summer', () => {
    const y = (n: number) => heatGame({ years: n, region: 'plains' });
    expect(heatWellYield(y(0), 'well_hand')).toBe(1);
    expect(heatWellYield(y(4), 'well_hand')).toBeLessThan(heatWellYield(y(4), 'well_drilled'));
    expect(heatWellYield(y(2), 'well_drilled')).toBeGreaterThan(heatWellYield(y(4), 'well_drilled'));
    expect(heatThirstK(heatGame({ years: 4, region: 'plains', doy: 200 }), 200)).toBeGreaterThan(1.3);
    expect(heatThirstK(newGame(1), 200)).toBe(1);
  });
  it('prices climb through the warning and the years and stay finite', () => {
    const g = heatGame({ years: 0 }); g.clock.t = g.disaster.warnAt + (g.disaster.hitAt - g.disaster.warnAt) / 2;
    expect(fxPriceMod(g)).toBeGreaterThan(1);
    const later = heatGame({ years: 4 });
    expect(fxPriceMod(later)).toBeGreaterThan(fxPriceMod(heatGame({ years: 0 })));
    expect(Number.isFinite(fxPriceMod(later))).toBe(true);
  });
  it('the wet cool room costs water and is refused without it', () => {
    const g = heatGame({ years: 3, region: 'plains', doy: 200 });
    g.utilities.storedL = 10;
    expect(heatFx.choose!(g, 'heat:cool')).toMatch(/not enough/);
    g.utilities.storedL = 1000;
    expect(heatFx.choose!(g, 'heat:cool')).toMatch(/wet sheets/);
    expect(g.utilities.storedL).toBe(850);
    expect(heatFx.choose!(g, 'nope')).toBeNull();
  });
});

describe('the ice age: the cold, the snow, the equipment', () => {
  it('comes through the winter engine: the plateau mean drop is the region\'s, scaled by the difficulty, and never warms', () => {
    for (const id of REGION_IDS) {
      const g = iceGame({ region: id, years: 4 });
      expect(iceWinter(g).coldF, id).toBeCloseTo(iceMeanDropF(id), 6);
      let prev = 0;
      for (let d = 0; d <= 365 * 5; d += 30) { g.clock.t = g.disaster.hitAt + d; const c = iceColdF(g); expect(c).toBeGreaterThanOrEqual(prev - 1e-9); prev = c; }
    }
    expect(iceColdF(iceGame({ region: 'north_woods', years: 4 }))).toBeGreaterThan(30);   // "minus 30 to 40 F"
    expect(iceColdF(iceGame({ region: 'north_woods', years: 4, difficulty: 'cozy' }))).toBeLessThan(iceColdF(iceGame({ region: 'north_woods', years: 4 })));
  });
  it('the ocean shutdown is hardest in the north and half as hard in the south', () => {
    const cold = (id: string, variant: string) => iceColdF(iceGame({ region: id, variant, years: 4 }));
    expect(cold('north_woods', 'ocean_shutdown')).toBeCloseTo(cold('north_woods', 'dimmed_sun'), 6);
    expect(cold('hill_country', 'ocean_shutdown')).toBeCloseTo(cold('hill_country', 'dimmed_sun') * OCEAN_SHUTDOWN_K.hill_country, 6);
    expect(cold('hill_country', 'ocean_shutdown')).toBeLessThan(cold('north_woods', 'ocean_shutdown'));
  });
  it('the growing season collapses and the supply hook says so; the cold index feeds the night', () => {
    const y = (n: number) => iceGame({ region: 'upper_midwest', years: n });
    let prev = 1; for (const n of [0, 1, 2, 3, 4]) { const w = iceWinter(y(n)); expect(w.grow).toBeLessThanOrEqual(prev + 1e-12); prev = w.grow; }
    expect(prev).toBeLessThan(0.3);
    const m = fxSupplyMods(y(4));
    expect(m.grow).toBeCloseTo(iceWinter(y(4)).grow, 9);
    expect(m.cold).toBeGreaterThan(0.5); expect(m.cold).toBeLessThanOrEqual(1.1);
    expect(iceWinter(y(0)).grow).toBeGreaterThan(0.8);   // (the warning's first cold has begun to bite by the hit)
  });
  it('the ground snow load follows the cold curve, is deeper in winter, and never falls as the cold deepens', () => {
    const g = iceGame({ region: 'mountain_west' });
    let prev = 0;
    for (let d = 0; d <= 365 * 4; d += 60) { g.clock.t = g.disaster.hitAt + d; const v = iceGroundPsf(g, 30); expect(v).toBeGreaterThanOrEqual(prev - 1e-9); prev = v; }
    g.clock.t = g.disaster.hitAt + 365 * 4;
    expect(iceGroundPsf(g, 30)).toBeCloseTo(snowLoadPsf('mountain_west', 4, 1), 9);
    expect(iceGroundPsf(g, 30)).toBeGreaterThan(iceGroundPsf(g, 196));
    expect(coldAnomaly(4)).toBe(1);
    expect(iceGroundPsf(newGame(1), 30)).toBe(0);
  });
  it('a roof carries snow against the same table as ash: a timber cabin falls at a 90 psf ground load, a braced one holds longer, a barn goes first', () => {
    const g = iceGame({ region: 'mountain_west', years: 4 });
    const st = (kind: string) => ({ id: `t_${kind}`, kind });
    const cabin = roofSnow(g, st('timber_cabin'))!, barn = roofSnow(g, st('barn'))!, tunnel = roofSnow(g, st('high_tunnel'))!;
    expect(cabin.ratio).toBeCloseTo(roofRatio(cabin.psf / density(false), ROOF_CAP.timber_cabin, false, false), 9);
    expect(barn.ratio).toBeGreaterThan(cabin.ratio); expect(tunnel.ratio).toBeGreaterThan(barn.ratio);
    expect(roofSnow(g, st('well_hand'))).toBeNull();
    // more snow never improves the verdict: the ratio rises with the ground load
    let prev = 0;
    for (const years of [1, 2, 3, 4]) { const h = iceGame({ region: 'mountain_west', years }); h.clock.startDoy = 25; const r = roofSnow(h, st('timber_cabin'))!.ratio; expect(r).toBeGreaterThanOrEqual(prev - 1e-9); prev = r; }
  });
  it('shoveling clears a roof, costs a crew money, and has nothing to do before the snow', () => {
    const g = iceGame({ region: 'mountain_west', years: 3 });
    g.money = 100000;
    g.structures.push({ id: 'cabin1', kind: 'timber_cabin', x: 0, z: 0, rot: 0, stage: 99, done: 0, supplied: true, finishedAt: 0 } as never);
    expect(shovelSnow(newGame(1), 'family')).toMatch(/nothing worth/);
    const before = g.money;
    const out = shovelSnow(g, 'crew');
    expect(out).toMatch(/crew shoveled/); expect(g.money).toBeLessThan(before);
    expect(roofSnow(g, { id: 'cabin1', kind: 'timber_cabin' })!.psf).toBeCloseTo(0, 9);
  });
  it('cold equipment: batteries lose up to half, wood use doubles, diesel gels unless treated', () => {
    expect(coldBatteryK(0)).toBe(1); expect(coldBatteryK(30)).toBeCloseTo(0.5, 9); expect(coldBatteryK(80)).toBeCloseTo(0.5, 9);
    expect(coldWoodK(0)).toBe(1); expect(coldWoodK(30)).toBe(2); expect(coldWoodK(60)).toBe(2);
    expect(dieselGelK(40, false)).toBe(1); expect(dieselGelK(-20, false)).toBeLessThan(dieselGelK(-20, true)); expect(dieselGelK(-20, false)).toBeLessThan(dieselGelK(5, false));
    expect(slowWoodK(iceGame({ region: 'north_woods', years: 4 }))).toBeGreaterThan(1.5);
    expect(slowWoodK(heatGame({ region: 'plains', years: 4 }))).toBeLessThan(1);
    expect(slowWoodK(newGame(1))).toBe(1);
  });
  it('the sky and the snow cover come from the look hook; prices stay finite and rise', () => {
    const g = iceGame({ region: 'north_woods', years: 3 }); g.clock.startDoy = 25 - Math.floor(g.clock.t);
    const l = iceFx.look!(g, { ashCover: 0, snowCover: 0 } as never);
    expect(l.snowCover).toBeGreaterThan(0.5);   // (its own field now: a snowfall does not thin it, as it thins ash)
    expect(l.ashCover).toBeUndefined();
    expect(fxPriceMod(g)).toBeGreaterThan(1.3);
  });
});

describe('through the real engine', () => {
  it('both kinds, all four variants, run a few weeks past the hit with sane numbers and the same result twice (determinism by seed)', { timeout: 110000 }, () => {
    for (const k of SLOW) for (const v of DISASTERS[k]!.variants) {
      const run = () => { let g = newGame(11, 105, 2027, { mode: 'scenario', peace: 'short', kind: k, variant: v.id }); g = step(g, g.disaster.hitAt - g.clock.t + 1); g = step(g, 20); return g; };
      const a = run(), b = run();
      for (const t of TRACKS) expect(Number.isFinite(a.disaster.tracks[t])).toBe(true);
      expect(Number.isFinite(a.money)).toBe(true);
      expect(JSON.stringify(a.disaster)).toBe(JSON.stringify(b.disaster));
      expect(a.money).toBe(b.money);
      expect(a.personState.map(p => p.needs.died)).toEqual(b.personState.map(p => p.needs.died));
    }
  });
  it('the kind state is plain JSON (no save bump) and the tracks read through tracksAt', () => {
    const g = heatGame({ years: 2, region: 'plains' });
    heatFx.daily!(g, fxCtxFor(g, 1));
    const bag = JSON.parse(JSON.stringify(g.disaster.fx));
    expect(bag.runaway_heat).toBeDefined();
    expect(tracksAt(g.disaster, g.clock.t).grid).toBeLessThan(1);
  });
  it('summerness and the peak make sense', () => {
    expect(summerness(196)).toBeCloseTo(1, 9); expect(summerness(15)).toBeLessThan(0.1);
    const g = heatGame({ years: 0, region: 'plains' });
    expect(dayPeakF(g, 196)).toBeCloseTo(REGIONS.plains.julyHighF + heatPeakDeltaF(g), 6);
    expect(dayPeakF(newGame(1, 105, 2027, { mode: 'surprise' }), 196)).toBeCloseTo(REGIONS[newGame(1).site.region].julyHighF, 6);
    expect(slowYears(heatGame({ years: 2, difficulty: 'cozy' }))).toBeCloseTo(2, 9);
    expect(heatDeltaF(newGame(1), 196)).toBe(0);
    expect(SLOW_KINDS.length).toBe(2);
  });
});
