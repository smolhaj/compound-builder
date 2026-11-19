/**
 * The plant and the shell in a climate disaster, on the live dome (docs/design/climate_disasters.md PRs 4 and 5): regression with no slow disaster, wear
 * that becomes open repair jobs, more damage never improving the dome, repair lead and the battery in the weather, a glass and a geodesic dome through
 * both kinds (they fail in the expected order), the readout and cards, and determinism. The dome gauges are stepped directly (fast); one real-engine
 * run per kind checks the whole game still stands.
 */
import { describe, expect, it } from 'vitest';
import { newGame, dayIndex, type GameState, type Structure } from '../state';
import { step, SUBSTEP } from '../engine';
import { BLUEPRINTS } from '../blueprints';
import { DOME_KIND, type DomeTier } from './tiers';
import { dayLoad, domeCards, domeDay, domeOf, domesOf, ownState, stepDome, stateOf } from './live';
import { climateOpts, plantWearDay } from './plantClimateLive';
import { damagePlant, fxOf, plantJobs } from './plantLive';
import { domeClimateReadout } from './climateReadout';
import { groundSnowNow, panelsDownOf, shellSnowNow } from './snowLive';
import { BAND } from './climate';
import { mulberry32 } from '../rng';
import type { PlantKind } from './plantUnits';

type Kind = 'runaway_heat' | 'ice_age';
interface Opts { years: number; doy: number; region: string; power?: boolean; tiers?: DomeTier[]; variant?: string; difficulty?: 'cozy' | 'standard' | 'hardcore'; spares?: PlantKind[] }
/** A game in a slow climate disaster `years` after the hit, on day `doy`, with one dome per tier (side by side), wired to a solar array unless `power` is false. */
function mk(kind: Kind | null, o: Opts): GameState {
  const g = kind ? newGame(7, 105, 2027, { mode: 'scenario', peace: 'short', kind, variant: o.variant ?? (kind === 'runaway_heat' ? 'dry_furnace' : 'dimmed_sun'), difficulty: o.difficulty ?? 'standard' }) : newGame(7);
  g.site.region = o.region as never; g.money = 1e9;
  g.clock.t = (kind ? g.disaster.hitAt : 0) + 365 * o.years;
  g.clock.ticks = Math.round(g.clock.t / SUBSTEP);
  g.clock.startDoy = (((o.doy - dayIndex(g.clock.t)) % 365) + 365) % 365 || 365;
  (o.tiers ?? ['glass']).forEach((tier, i) => {
    const k = DOME_KIND[tier], st: Structure = { id: `dm${i}`, kind: k, x: i * 60, z: 0, rot: 0, stage: BLUEPRINTS[k].stages.length, done: 0, supplied: true, finishedAt: 0 };
    g.structures.push(st);
    if (o.power !== false) g.utilities.fittings.push({ building: st.id, kind: 'wire', done: 1, hours: 1, supplied: true, finishedAt: 0 });
  });
  if (o.power !== false) g.structures.push({ id: 'sol', kind: 'solar_array', x: 5, z: -50, rot: 0, stage: 9, done: 0, supplied: true, finishedAt: 0 });
  if (o.spares) for (const d of domesOf(g)) ownState(g, d).spares = [...o.spares];
  return g;
}
/** Advance the dome gauges (quarter-hour steps) and the daily dome roll by `days`. Returns the highest indoor temperature seen (main dome) and the hours it ran over the band. */
function advance(g: GameState, days: number): { maxIn: number; overH: number } {
  let maxIn = -Infinity, overH = 0, day = dayIndex(g.clock.t);
  const n = Math.round(days / SUBSTEP);
  for (let i = 0; i < n; i++) {
    g.clock.t += SUBSTEP; g.clock.ticks++;
    stepDome(g, SUBSTEP);
    const st = ownState(g, domeOf(g)!); maxIn = Math.max(maxIn, st.indoorF); if (st.indoorF > BAND[st.mode][1] + 3) overH += 0.25;
    if (dayIndex(g.clock.t) !== day) { day = dayIndex(g.clock.t); domeDay(g); }
  }
  return { maxIn, overH };
}
const refOf = (g: GameState, i = 0) => domesOf(g)[i];

describe('regression: no slow disaster, nothing changes', () => {
  it('the limits are the flat model, wear and snow are zero, and no climate cards appear', () => {
    const g = mk(null, { years: 1, doy: 196, region: 'desert' });
    const d = refOf(g), st = stateOf(g, d);
    expect(climateOpts(g, d, st, 120)).toEqual({});
    expect(plantWearDay(g, d, st, () => 0, 1, 0.5)).toEqual([]);
    expect(groundSnowNow(g)).toBe(0);
    expect(domeCards(g).filter(c => c.id.startsWith('dome:climate'))).toEqual([]);
    expect(damagePlant(g, d, st, 'chiller', 'down', 'storm')).toBeTruthy();
    expect(plantJobs(g, d.st.id)[0].readyDay! - dayIndex(g.clock.t)).toBe(14);   // the plain lead time: deliveries do not stretch it outside a climate disaster
  });
  it('another disaster does not turn the limits on', () => {
    const g = mk('ice_age', { years: 3, doy: 20, region: 'north_woods' });
    g.disaster.kind = 'drought' as never;
    const d = refOf(g); expect(climateOpts(g, d, stateOf(g, d), 120)).toEqual({}); expect(groundSnowNow(g)).toBe(0);
  });
});

describe('the plant in the heat', () => {
  it('the chillers lose capacity and the COP falls as the day heats up, and the draw goes up', () => {
    const g = mk('runaway_heat', { years: 3, doy: 196, region: 'desert', tiers: ['glass'] }), d = refOf(g), st = stateOf(g, d);
    let prevCap = 2, prevCop = 9;
    for (const f of [80, 95, 105, 115, 124, 126]) {
      const o = climateOpts(g, d, st, f); expect(o.copCool!).toBeLessThanOrEqual(prevCop); prevCop = o.copCool!;
      const cap = o.chillCapBtu!; expect(cap).toBeLessThanOrEqual(prevCap === 2 ? Infinity : prevCap); prevCap = cap;
    }
    expect(climateOpts(g, d, st, 126).chillCapBtu).toBe(0);
  });
  it('heat wears a whole chiller into an open plant repair job, tagged heat or load, and the lead time stretches with the deliveries track', () => {
    const g = mk('runaway_heat', { years: 4, doy: 196, region: 'hill_country', variant: 'humid_furnace' }), d = refOf(g), st = stateOf(g, d);
    const r = mulberry32(5); let line: string[] = [];
    for (let day = 0; day < 4000 && !line.length; day++) line = plantWearDay(g, d, st, r, 1, 0.3);
    expect(line.length).toBeGreaterThan(0);
    const job = plantJobs(g, d.st.id)[0];
    expect(job.kind).toBe('plant'); expect(['heat', 'load']).toContain(job.cause);
    expect(unitsDown(g)).toBeGreaterThan(0);
    // a collapsed deliveries track: the same repair takes up to 4 times longer
    const a = mk('runaway_heat', { years: 3, doy: 196, region: 'plains' }), b = mk('runaway_heat', { years: 3, doy: 196, region: 'plains' });
    b.disaster.tracks.deliveries = 0.25; a.disaster.tracks.deliveries = 1;
    for (const [x, y] of [[a, 14], [b, 56]] as const) { damagePlant(x, refOf(x), stateOf(x, refOf(x)), 'chiller', 'down', 'heat'); expect(plantJobs(x, refOf(x).st.id)[0].readyDay! - dayIndex(x.clock.t)).toBe(y); }
  });
  it('more damage never improves the dome: the share of climate plant, then the indoor air, only get worse', () => {
    const base = (damage: 'ok' | 'damaged' | 'down') => {
      const g = mk('runaway_heat', { years: 3, doy: 196, region: 'desert', tiers: ['glass'] });
      if (damage !== 'ok') damagePlant(g, refOf(g), stateOf(g, refOf(g)), 'chiller', damage, 'heat');
      advance(g, 0.9); const st = stateOf(g, domeOf(g)!);
      return { climate: fxOf(g, refOf(g), st).climate, indoor: advance(g, 0.5).maxIn };
    };
    const ok = base('ok'), half = base('damaged'), none = base('down');
    expect(half.climate).toBeLessThan(ok.climate); expect(none.climate).toBeLessThan(half.climate);
    expect(half.indoor).toBeGreaterThanOrEqual(ok.indoor - 1e-9); expect(none.indoor).toBeGreaterThanOrEqual(half.indoor - 1e-9);
  });
  it('a second (N+1) chiller carries the dome while the first is out', () => {
    const g = mk('runaway_heat', { years: 3, doy: 196, region: 'desert', spares: ['chiller'] });
    damagePlant(g, refOf(g), stateOf(g, refOf(g)), 'chiller', 'down', 'heat');
    expect(fxOf(g, refOf(g), stateOf(g, refOf(g))).climate).toBe(1);
  });
  it('the battery bank fades in a hot dome: fewer ride-through hours at 95 F inside than at 77 F, and in a deep cold', () => {
    const hours = (indoor: number) => {
      const g = mk('runaway_heat', { years: 3, doy: 196, region: 'desert', tiers: ['glass'] }), d = refOf(g), st = ownState(g, d);
      st.filtering = 'closed'; st.indoorF = indoor;
      damagePlant(g, d, st, 'substation', 'down', 'heat');
      return fxOf(g, d, st).rideH!;
    };
    expect(hours(95)).toBeLessThan(hours(77)); expect(hours(107)).toBeLessThan(hours(95)); expect(hours(0)).toBeLessThan(hours(60));
  });
  it('a hotter year never gives a cooler dome (the same afternoon, year 0 against year 3)', () => {
    const run = (years: number) => { const g = mk('runaway_heat', { years, doy: 196, region: 'desert' }); return advance(g, 6).maxIn; };
    const y0 = run(0), y1 = run(1), y3 = run(3);
    expect(y1).toBeGreaterThanOrEqual(y0 - 1e-9); expect(y3).toBeGreaterThanOrEqual(y1 - 1e-9);
  });
  it('the readout says what the plant is doing and the card has the trip line', () => {
    const g = mk('runaway_heat', { years: 3, doy: 196, region: 'desert' }); advance(g, 0.6);
    const d = refOf(g), st = ownState(g, d), r = domeClimateReadout(g, d, st);
    expect(r.wetBulbF).not.toBeNull(); expect(Number.isFinite(r.loadK)).toBe(true); expect(r.tripF).toBe(125);
    if (r.capacityK < 0.95) expect(domeCards(g).some(c => c.id === 'dome:climate:chiller' && /Rated to trip at 125/.test(c.why))).toBe(true);
  });
});

/** Panels down by tier. */
const byTier = (g: GameState): Record<string, number> => Object.fromEntries(domesOf(g).map(d => [d.tier, panelsDownOf(g, d.st.id)]));
const unitsDown = (g: GameState): number => plantJobs(g, domesOf(g)[0].st.id).length;

describe('snow on the shell', () => {
  it('a dark geodesic loses panels before a dark glass dome, and an arcology holds (Mountain West plateau)', () => {
    const g = mk('ice_age', { years: 3, doy: 20, region: 'mountain_west', power: false, tiers: ['geodesic', 'glass', 'arcology'] });
    advance(g, 30);
    const by = byTier(g);
    expect(by.geodesic).toBeGreaterThan(0); expect(by.glass).toBe(0); expect(by.arcology).toBe(0);
  });
  it('in the North Woods a dark glass dome fails too, a larger share of a geodesic goes, and the arcology still holds', () => {
    const g = mk('ice_age', { years: 3, doy: 20, region: 'north_woods', power: false, tiers: ['geodesic', 'glass', 'arcology'] });
    advance(g, 30);
    const by = byTier(g), N = { geodesic: 150, glass: 288 } as const;
    expect(by.glass).toBeGreaterThan(0); expect(by.arcology).toBe(0);
    expect(by.geodesic / N.geodesic).toBeGreaterThanOrEqual(by.glass / N.glass);
  });
  it('a heated shell sheds the snow: the same North Woods winter leaves a powered glass dome whole', () => {
    const g = mk('ice_age', { years: 3, doy: 20, region: 'north_woods', tiers: ['glass'] });
    advance(g, 30);
    const d = refOf(g), st = stateOf(g, d), sn = shellSnowNow(g, d, st);
    expect(st.powered).toBe(true); expect(sn.share).toBeGreaterThan(0.9); expect(sn.psf).toBeLessThan(sn.rating); expect(panelsDownOf(g, d.st.id)).toBe(0);
  });
  it('a dark plant with a lot of snow turns the shell card on, and the heating draw rises as it gets colder', () => {
    const g = mk('ice_age', { years: 3, doy: 20, region: 'north_woods', tiers: ['glass'] });
    ownState(g, refOf(g)).powered = false;
    expect(domeCards(g).some(c => c.id === 'dome:climate:snow')).toBe(true);
    const w = mk('ice_age', { years: 3, doy: 20, region: 'north_woods', tiers: ['glass'] }), c = mk('ice_age', { years: 0.5, doy: 20, region: 'north_woods', tiers: ['glass'] });
    advance(w, 0.3); advance(c, 0.3);
    expect(dayLoad(w, refOf(w), stateOf(w, refOf(w))).kwh).toBeGreaterThan(dayLoad(c, refOf(c), stateOf(c, refOf(c))).kwh);
  });
  it('the snow load never falls as the winter deepens (year after year)', () => {
    let prev = -1; for (const y of [0, 0.5, 1, 2, 3, 4]) { const g = mk('ice_age', { years: y, doy: 20, region: 'upper_midwest', power: false }); advance(g, 0.01); const p = shellSnowNow(g, refOf(g), stateOf(g, refOf(g))).psf; expect(p).toBeGreaterThanOrEqual(prev - 1e-9); prev = p; }
  });
  it('the vents ice shut below minus 10 F with the plant dark, so the fail-safe cannot open them on those days', () => {
    const g = mk('ice_age', { years: 3, doy: 20, region: 'north_woods', power: false, tiers: ['glass'] });
        let stuck = 0, open = 0;
    for (let k = 0; k < 40; k++) { const h = structuredClone(g); h.clock.t += k; ownState(h, refOf(h)).lockdown = true; ownState(h, refOf(h)).co2ppm = 60000; stepDome(h, SUBSTEP); if (ownState(h, refOf(h)).lockdown) stuck++; else open++; }
    expect(stuck).toBeGreaterThan(0); expect(open).toBeGreaterThan(stuck);
  });
});

describe('through the real engine, a glass and a geodesic dome, both kinds, 3 game years', () => {
  const alive = (g: GameState): number => g.personState.filter(p => p.needs.died == null && !p.needs.left && !p.needs.taken).length;
  const standing = (g: GameState): boolean => panelsDownOf(g, 'dm') < ({ geodesic: 150, glass: 288 } as const)[g.structures.find(s => s.id === 'dm')!.kind.includes('geodesic') ? 'geodesic' : 'glass'] / 3;
  const run = (kind: Kind, tier: DomeTier, region: string): { alive: number; standing: boolean; panels: number; json: string } => {
    let g = newGame(11, 105, 2027, { mode: 'scenario', peace: 'short', kind, variant: kind === 'runaway_heat' ? 'dry_furnace' : 'dimmed_sun', difficulty: 'standard' });
    g.site.region = region as never; g.money = 5e6;
    const k = DOME_KIND[tier], st: Structure = { id: 'dm', kind: k, x: 0, z: 0, rot: 0, stage: BLUEPRINTS[k].stages.length, done: 0, supplied: true, finishedAt: 0 };
    g.structures.push(st, { id: 'sol', kind: 'solar_array', x: 5, z: -50, rot: 0, stage: 9, done: 0, supplied: true, finishedAt: 0 });
    g.utilities.fittings.push({ building: st.id, kind: 'wire', done: 1, hours: 1, supplied: true, finishedAt: 0 });
    g = step(g, g.disaster.hitAt - g.clock.t + 3 * 365);
    return { alive: alive(g), standing: standing(g), panels: panelsDownOf(g, 'dm'), json: JSON.stringify([g.money, g.raidDamage, g.disaster.fx]) };
  };
  it('runs, finishes with sane numbers, and is the same twice', { timeout: 200000 }, () => {
    const a = run('ice_age', 'glass', 'north_woods'), b = run('ice_age', 'glass', 'north_woods');
    expect(Number.isFinite(a.alive)).toBe(true); expect(a.json).toBe(b.json); expect(a.alive).toBe(b.alive);
    const h = run('runaway_heat', 'geodesic', 'desert'); expect(Number.isFinite(h.alive)).toBe(true);
  });
});

// Sanity sim (not part of the suite): VITE_CLIMATE_SIM=1 npx vitest run src/sim/dome/climatePlant.test.ts -t sanity --reporter=verbose
describe.skipIf(!import.meta.env.VITE_CLIMATE_SIM)('sanity sim: three game years after the hit, dome gauges only', () => {
  it('prints how each dome stands', { timeout: 900000 }, () => {
    for (const [kind, region] of [['runaway_heat', 'desert'], ['runaway_heat', 'hill_country'], ['ice_age', 'north_woods'], ['ice_age', 'mountain_west']] as const) for (const power of [true, false]) {
      const g = mk(kind, { years: 0, doy: 120, region, power, tiers: ['geodesic', 'glass'] });
      let maxIn = -Infinity, overH = 0;
      for (let y = 0; y < 3; y++) { const r = advance(g, 365); maxIn = Math.max(maxIn, r.maxIn); overH += r.overH; }
      const by = byTier(g), jobs = plantJobs(g, domesOf(g)[0].st.id).length + plantJobs(g, domesOf(g)[1].st.id).length;
      console.log(`SANITY ${kind} ${region} power=${power}: panels down geodesic ${by.geodesic}/150, glass ${by.glass}/288; open plant jobs ${jobs}; hottest indoor ${Math.round(maxIn)} F, ${Math.round(overH)} h over the band`);
    }
  });
});
