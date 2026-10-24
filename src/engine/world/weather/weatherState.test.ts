import { describe, it, expect } from 'vitest';
import {
  WeatherSim, pickNextKind, weatherSeasonFor, morningFogCurve, hash01, isWeatherMode, SEASON_WEIGHTS,
  WEATHER_KINDS, WEATHER_MODES, KIND_TARGETS, STORM_APPROACH, supercellCurve, marineLayerCurve,
  regionSky, snowShownUnderRain, forcedKind,
  type WeatherKind,
} from './weatherState';

const run = (sim: WeatherSim, secs: number, season: string, hour = 12, mode: Parameters<WeatherSim['update']>[3] = 'auto', step = 0.5) => {
  for (let t = 0; t < secs; t += step) sim.update(step, season, hour, mode);
  return sim.out;
};

describe('weatherState', () => {
  it('hash01 is deterministic and in [0,1)', () => {
    for (let i = 0; i < 200; i++) {
      const v = hash01(i, i * 3);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      expect(hash01(i, i * 3)).toBe(v);
    }
  });

  it('pickNextKind honors season weights (no snow outside winter)', () => {
    const counts: Record<string, number> = {};
    for (let i = 0; i < 2000; i++) {
      const k = pickNextKind('summer', hash01(7, i));
      counts[k] = (counts[k] ?? 0) + 1;
    }
    expect(counts.snow ?? 0).toBe(0);
    expect(counts.clear).toBeGreaterThan(counts.rain ?? 0);
    let winterSnow = 0;
    for (let i = 0; i < 2000; i++) if (pickNextKind('winter', hash01(9, i)) === 'snow') winterSnow++;
    const w = SEASON_WEIGHTS.winter;
    const expected = w.snow / Object.values(w).reduce((a, b) => a + b, 0);
    expect(winterSnow / 2000).toBeGreaterThan(expected * 0.8);
    expect(winterSnow / 2000).toBeLessThan(expected * 1.2);
  });

  it('is deterministic for a seed', () => {
    const a = new WeatherSim(42), b = new WeatherSim(42);
    const seqA: WeatherKind[] = [], seqB: WeatherKind[] = [];
    for (let i = 0; i < 4000; i++) {
      a.update(0.5, 'spring', (i * 0.1) % 24); seqA.push(a.kind);
      b.update(0.5, 'spring', (i * 0.1) % 24); seqB.push(b.kind);
    }
    expect(seqA).toEqual(seqB);
    expect(a.out).toEqual(b.out);
  });

  it('cycles through several spells and outputs stay in range', () => {
    const sim = new WeatherSim(3);
    const seen = new Set<WeatherKind>();
    let bad = 0;
    for (let i = 0; i < 20000; i++) {
      const o = sim.update(0.5, 'fall', (i * 0.1) % 24);
      seen.add(sim.kind);
      for (const v of Object.values(o)) if (!(Number.isFinite(v) && v >= 0 && v <= 1.0000001)) bad++;
    }
    expect(bad).toBe(0);
    expect(seen.size).toBeGreaterThanOrEqual(3);
    expect(seen.has('snow')).toBe(false);
  });

  it('forced rain wets the ground; it dries once cleared', () => {
    const sim = new WeatherSim(1);
    const o = run(sim, 60, 'spring', 12, 'rain');
    expect(o.rain).toBeGreaterThan(0.6);
    expect(o.cloud).toBeGreaterThan(0.8);
    expect(o.wetness).toBeGreaterThan(0.7);
    run(sim, 400, 'spring', 12, 'clear');
    expect(o.rain).toBeLessThan(0.01);
    expect(o.wetness).toBeLessThan(0.05);
  });

  it('forced snow accumulates cover; it melts quickly outside winter', () => {
    const sim = new WeatherSim(1);
    const o = run(sim, 90, 'winter', 12, 'snow');
    expect(o.snow).toBeGreaterThan(0.6);
    expect(o.snowCover).toBeGreaterThan(0.9);
    run(sim, 60, 'spring', 12, 'clear');
    expect(o.snowCover).toBe(0);
  });

  it('a winter start already has lying snow', () => {
    const sim = new WeatherSim(5);
    sim.update(0.1, 'winter', 12);
    expect(sim.out.snowCover).toBeGreaterThan(0.4);
  });

  it('off zeroes everything immediately', () => {
    const sim = new WeatherSim(1);
    run(sim, 60, 'winter', 12, 'snow');
    const o = sim.update(0.1, 'winter', 12, 'off');
    expect(Object.values(o).every(v => v === 0)).toBe(true);
    expect(o.cloud).toBe(0);
  });

  it('forced fog builds fog without precipitation', () => {
    const sim = new WeatherSim(1);
    const o = run(sim, 60, 'summer', 14, 'fog');
    expect(o.fog).toBeGreaterThan(0.9);
    expect(o.rain).toBe(0);
    expect(o.snow).toBe(0);
  });

  it('morning fog curve peaks at dawn and burns off by late morning', () => {
    expect(morningFogCurve(3)).toBe(0);
    expect(morningFogCurve(6.5)).toBe(1);
    expect(morningFogCurve(9)).toBeGreaterThan(0);
    expect(morningFogCurve(9)).toBeLessThan(1);
    expect(morningFogCurve(11)).toBe(0);
    expect(morningFogCurve(15)).toBe(0);
  });

  it('some auto mornings are foggy and afternoons are not', () => {
    let foggyMornings = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const sim = new WeatherSim(seed);
      // Sweep one visual day from midnight to 7 a.m.
      let o = sim.out;
      for (let h = 0; h <= 7; h += 0.05) o = sim.update(0.25, 'fall', h);
      if (o.fog > 0.4 && sim.kind !== 'storm') foggyMornings++;
    }
    expect(foggyMornings).toBeGreaterThan(5);
    expect(foggyMornings).toBeLessThan(35);
  });

  it('derives the weather season from the day of the year (Dec–Feb winter)', () => {
    expect(weatherSeasonFor(10)).toBe('winter');  // Jan
    expect(weatherSeasonFor(50)).toBe('winter');  // Feb
    expect(weatherSeasonFor(80)).toBe('spring');  // Mar
    expect(weatherSeasonFor(253)).toBe('fall');      // Sept
    expect(weatherSeasonFor(353)).toBe('winter');   // Dec
    expect(weatherSeasonFor(186)).toBe('summer');
  });

  it('isWeatherMode validates', () => {
    expect(isWeatherMode('rain')).toBe(true);
    expect(isWeatherMode('hail')).toBe(false);
    expect(isWeatherMode(3)).toBe(false);
  });
});

describe('regional weather (REGION_WEATHER)', () => {
  const share = (season: string, region: string, kinds: string[]) => {
    let n = 0;
    for (let i = 0; i < 2000; i++) if (kinds.includes(pickNextKind(season, (i + 0.5) / 2000, null, region))) n++;
    return n / 2000;
  };
  it('PNW summers are dry and its winters wet; SoCal barely rains; Gulf summers storm', () => {
    expect(share('summer', 'pacific_northwest', ['rain', 'storm'])).toBeLessThan(0.08);
    expect(share('winter', 'pacific_northwest', ['rain', 'storm'])).toBeGreaterThan(0.3);
    expect(share('summer', 'southern_california', ['rain', 'storm'])).toBeLessThan(0.02);
    expect(share('summer', 'deep_south', ['storm'])).toBeGreaterThan(share('summer', 'new_england', ['storm']) * 2);
    // unknown region = baseline
    expect(share('winter', 'atlantis', ['rain'])).toBeCloseTo(share('winter', 'new_england', ['rain']), 5);
  });
});

describe('region arrives after the first spell', () => {
  it('re-rolls the opening spell with the region weights (a SoCal summer game does not open in rain)', () => {
    let rainy = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const sim = new WeatherSim(seed);
      sim.update(0.1, 'summer', 12, 'auto');       // first frame: climate not yet known
      sim.region = 'southern_california';           // the campus region arrives
      if (sim.kind === 'rain' || sim.kind === 'storm') rainy++;
    }
    expect(rainy).toBeLessThan(4);
  });
});

describe('weather state machine (clear / partly / overcast / rain / storm / fog / snow)', () => {
  it('every kind has targets, weights and a label; every forced mode maps to a kind', () => {
    for (const k of WEATHER_KINDS) {
      expect(KIND_TARGETS[k]).toBeDefined();
      for (const s of ['spring', 'summer', 'fall', 'winter'] as const) expect(SEASON_WEIGHTS[s][k]).toBeGreaterThanOrEqual(0);
    }
    for (const m of WEATHER_MODES) {
      if (m === 'auto' || m === 'off') expect(forcedKind(m)).toBeNull();
      else expect(WEATHER_KINDS).toContain(forcedKind(m));
    }
  });

  it('auto visits every non-winter state over a long run, and outputs stay in 0–1', () => {
    const seen = new Set<WeatherKind>();
    let bad = 0;
    for (let seed = 1; seed <= 6; seed++) {
      const sim = new WeatherSim(seed);
      sim.region = 'deep_south';
      for (let i = 0; i < 12000; i++) {
        const o = sim.update(0.5, i % 4000 < 2000 ? 'summer' : 'fall', (i * 0.1) % 24);
        seen.add(sim.kind);
        for (const v of Object.values(o)) if (!(Number.isFinite(v) && v >= 0 && v <= 1.0000001)) bad++;
      }
    }
    expect(bad).toBe(0);
    for (const k of ['clear', 'partly', 'overcast', 'rain', 'storm', 'fog'] as const) expect(seen.has(k)).toBe(true);
  });

  it('overcast is a flat deck (no puffy cumulus), partly cloudy is broken cumulus', () => {
    const sim = new WeatherSim(2);
    const ov = { ...run(sim, 120, 'fall', 12, 'overcast') };
    const pc = { ...run(new WeatherSim(2), 120, 'fall', 12, 'partly') };
    expect(ov.cloud).toBeGreaterThan(0.7);
    expect(pc.cloud).toBeLessThan(0.2);
    expect(pc.cumulus).toBeGreaterThan(ov.cumulus * 1.8);
    expect(ov.rain).toBe(0);
  });

  it('a forced storm is dark, gusty and wet with cells on the horizon', () => {
    const o = run(new WeatherSim(4), 90, 'summer', 15, 'storm');
    expect(o.storm).toBeGreaterThan(0.9);
    expect(o.rain).toBeGreaterThan(0.8);
    expect(o.wind).toBeGreaterThan(0.8);
    expect(o.distantStorm).toBeGreaterThan(0.4);
  });

  it('an auto storm comes in as a front: anvil on the horizon first, rain later', () => {
    // find a seed whose spell turns stormy, then follow it
    for (let seed = 1; seed < 400; seed++) {
      const sim = new WeatherSim(seed);
      sim.update(0.1, 'summer', 15);
      if (sim.kind !== 'storm') continue;
      const len = sim.spellLength;
      // halfway through the approach: a distant cell, little rain
      for (let t = 0; t < len * STORM_APPROACH * 0.8; t += 0.5) sim.update(0.5, 'summer', 15);
      if (sim.kind !== 'storm') continue;
      expect(sim.out.distantStorm).toBeGreaterThan(0.5);
      expect(sim.out.rain).toBeLessThan(0.1);
      for (let t = 0; t < len * 0.35; t += 0.5) sim.update(0.5, 'summer', 15);
      if (sim.kind !== 'storm') continue;
      expect(sim.out.rain).toBeGreaterThan(0.5);
      expect(sim.out.storm).toBeGreaterThan(0.5);
      return;
    }
    throw new Error('no storm spell found');
  });

  it('Midwest summer afternoons grow supercells on the horizon; a PNW never does', () => {
    const cells = (region: string) => {
      let n = 0;
      for (let seed = 1; seed <= 60; seed++) {
        const sim = new WeatherSim(seed);
        sim.region = region;
        let max = 0;
        for (let h = 0; h < 24; h += 0.05) { sim.update(0.5, 'summer', h, 'partly'); if (h > 17 && h < 20) max = Math.max(max, sim.out.distantStorm); }
        if (max > 0.4) n++;
      }
      return n;
    };
    expect(cells('midwest_plains')).toBeGreaterThan(15);
    expect(cells('pacific_northwest')).toBe(0);
    expect(supercellCurve(10)).toBe(0);
    expect(supercellCurve(18)).toBe(1);
  });

  it('SoCal June gloom: an overcast dawn that burns off by early afternoon', () => {
    expect(marineLayerCurve(7)).toBe(1);
    expect(marineLayerCurve(15)).toBe(0);
    let gloomy = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const sim = new WeatherSim(seed);
      sim.region = 'southern_california';
      let morning = 0, afternoon = 0;
      for (let h = 0; h < 24; h += 0.05) {
        sim.update(0.5, 'summer', h, 'auto');
        if (Math.abs(h - 8) < 0.03) morning = sim.out.cloud;
        if (Math.abs(h - 16) < 0.03) afternoon = sim.out.cloud;
      }
      if (morning > 0.5 && afternoon < 0.3) gloomy++;
    }
    expect(gloomy).toBeGreaterThan(5);
  });

  it('regional character: PNW rain is drizzle, Gulf summers hazy, New England falls crisp, Midwest towers biggest', () => {
    expect(regionSky('pacific_northwest').rain).toBeLessThan(0.7);
    expect(regionSky('deep_south').haze.summer).toBeGreaterThan(regionSky('new_england').haze.fall * 4);
    expect(regionSky('midwest_plains').cumulus).toBeGreaterThan(regionSky('southern_california').cumulus * 2);
    const pnw = run(Object.assign(new WeatherSim(1), { region: 'pacific_northwest' }), 60, 'winter', 12, 'rain');
    const ds = run(Object.assign(new WeatherSim(1), { region: 'deep_south' }), 60, 'winter', 12, 'rain');
    expect(pnw.rain).toBeLessThan(ds.rain);
  });

  it('fog: a forced fog has no rain and calm air', () => {
    const o = run(new WeatherSim(1), 60, 'fall', 10, 'fog');
    expect(o.fog).toBeGreaterThan(0.9);
    expect(o.rain).toBe(0);
    expect(o.wind).toBeLessThan(0.15);
  });

  it('rain shots never show snow: forced rain hides lying snow, auto rain washes it out', () => {
    expect(snowShownUnderRain(1, 0, 'rain')).toBe(0);
    expect(snowShownUnderRain(1, 0, 'storm')).toBe(0);
    expect(snowShownUnderRain(0.8, 0.6, 'auto')).toBe(0);
    expect(snowShownUnderRain(0.8, 0, 'auto')).toBeCloseTo(0.8);
    expect(snowShownUnderRain(0.8, 0, 'snow')).toBeCloseTo(0.8);
    const sim = new WeatherSim(1);
    run(sim, 90, 'winter', 12, 'snow');
    expect(sim.out.snowCover).toBeGreaterThan(0.9);
    run(sim, 20, 'winter', 12, 'rain');
    expect(sim.out.snowCover).toBe(0);
    expect(sim.out.snow).toBeLessThan(0.05);
  });

  it('a snow squall blows harder than gentle flurries', () => {
    let calm = 1, squall = 0;
    for (let seed = 1; seed < 300; seed++) {
      const sim = new WeatherSim(seed);
      sim.update(0.1, 'winter', 12);
      if (sim.kind !== 'snow') continue;
      for (let t = 0; t < 30; t += 0.5) sim.update(0.5, 'winter', 12);
      if (sim.kind !== 'snow') continue;
      calm = Math.min(calm, sim.out.wind);
      squall = Math.max(squall, sim.out.wind);
    }
    expect(squall).toBeGreaterThan(calm + 0.15);
  });

  it('the storm bearing comes from the west half of the sky', () => {
    for (let seed = 1; seed < 50; seed++) {
      const sim = new WeatherSim(seed);
      sim.update(0.1, 'summer', 12);
      // west = −x: cos(az) < 0
      expect(Math.cos(sim.stormAz)).toBeLessThan(0);
    }
  });
});
