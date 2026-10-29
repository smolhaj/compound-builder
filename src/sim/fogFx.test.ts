import { describe, expect, it } from 'vitest';
import { newGame, calendarOf, type GameState } from './state';
import { makeLotSite } from './lotListing';
import { fogDay, fogOn } from './fog';
import { fogLineFor, fogLog, fogNow, fogPlaceOf, fogRadioLine, fogSightK, solarFogK } from './fogFx';
import { gearPosture } from './gear';
import { postureOf } from './encounters';

const lotGame = (seed: number, doy: number, region: 'pnw' | 'mountain_west' | 'appalachia' = 'pnw') =>
  newGame(seed, doy, 2027, { site: makeLotSite({ region, kind: 'hillside', seed: 8, relief: 9, elevM: 600 }) });

/** Set the clock to an hour of the current day (the day turns at 06:00; t has fractional part (hour - 6) / 24). */
const atHour = (g: GameState, hour: number) => { g.clock.t = Math.floor(g.clock.t) + (((hour - 6) % 24) + 24) % 24 / 24; };

/** A seed and a calendar day with a dense valley-fog morning and a clear day for comparison. */
function findDay(region: 'pnw' | 'mountain_west' | 'appalachia', want: (d: ReturnType<typeof fogDay>) => boolean): { seed: number; doy: number } {
  for (let seed = 1; seed < 80; seed++) for (let doy = 244; doy < 334; doy++) if (want(fogDay(seed, doy, region))) return { seed, doy };
  throw new Error('no such day');
}

describe('fog in the game', () => {
  it('reads the camp from the lot: how far above the valley floor and how far under the ridges', () => {
    const p = fogPlaceOf(lotGame(7, 288));
    expect(p.mountain).toBe(true);
    expect(p.campAboveFloorM).toBeGreaterThanOrEqual(0);
    expect(p.ridgeAboveCampM).toBeGreaterThanOrEqual(0);
    expect(p.campAboveFloorM + p.ridgeAboveCampM).toBeGreaterThan(20);
  });

  it('the readout names how far the fog is below the camp and the sight range', () => {
    const { seed, doy } = findDay('pnw', d => d.valley > 0.8 && d.overcast < 0.5 && !d.inversion);
    const g = lotGame(seed, doy);
    const t = fogLineFor(g, doy, 6.5);
    expect(t).toMatch(/^(Fog down to \d+ m below camp|Camp in fog, \d+ m under its top), sight range/);
    expect(fogLineFor(g, doy, 14)).not.toMatch(/Fog down|Camp in fog/);   // burned off by the afternoon
  });

  it('dense fog cuts spotting for the eye, the camera and the floodlights, and thermal sees through it', () => {
    const { seed, doy } = findDay('appalachia', d => d.valley > 0.97 && d.depth > 0.9 && !d.inversion);
    const g = lotGame(seed, doy, 'appalachia');
    // the camp is low in the hollow: it stands in the fog
    const place = fogPlaceOf(g);
    expect(place.campAboveFloorM).toBeGreaterThanOrEqual(0);
    g.stock.cameras = 1; g.stock.thermal_cam = 1; g.stock.nvg = 1; g.stock.thermal = 1; g.stock.driveway_alarm = 1;
    g.utilities.lit = ['x'];
    atHour(g, 6.5);
    const now = fogNow(g);
    const fogged = gearPosture(g, 2).detection;
    atHour(g, 15);
    const clear = gearPosture(g, 2).detection;
    expect(now.inFog).toBe(true);
    expect(fogged).toBeLessThan(clear);
    expect(fogSightK(g, 'eye')).toBe(1);   // (now 15:00)
    // the same morning, thermal alone: keeps nearly all of it
    const onlyThermal = (hour: number) => { const x = lotGame(seed, doy, 'appalachia'); x.stock.thermal_cam = 1; x.utilities.lit = ['x']; atHour(x, hour); return gearPosture(x, 2).detection; };
    expect(onlyThermal(6.5)).toBeGreaterThanOrEqual(onlyThermal(15) - 4);
    const onlyCamera = (hour: number) => { const x = lotGame(seed, doy, 'appalachia'); x.stock.cameras = 1; x.utilities.lit = ['x']; atHour(x, hour); return gearPosture(x, 2).detection; };
    expect(onlyCamera(6.5)).toBeLessThan(onlyCamera(15));
  });

  it('the watch is worth less in the fog (postureOf)', () => {
    const { seed, doy } = findDay('appalachia', d => d.valley > 0.97 && d.depth > 0.9 && !d.inversion);
    const mk = (hour: number) => { const x = lotGame(seed, doy, 'appalachia'); atHour(x, hour); return postureOf(x).detection; };
    const fogK = (() => { const x = lotGame(seed, doy, 'appalachia'); atHour(x, 6.5); return fogSightK(x, 'eye'); })();
    expect(fogK).toBeLessThan(1);
    expect(mk(6.5)).toBeLessThan(mk(15));
  });

  it('overcast cuts the day\'s solar, a clear day does not', () => {
    const over = findDay('pnw', d => d.overcast > 0.8);
    const clear = findDay('pnw', d => d.overcast === 0 && d.valley === 0);
    expect(solarFogK(lotGame(over.seed, over.doy))).toBeLessThan(0.55);
    expect(solarFogK(lotGame(clear.seed, clear.doy))).toBe(1);
  });

  it('logs this morning\'s fog and the forecast, each at most once a spell', () => {
    const { seed, doy } = findDay('pnw', d => d.valley > 0.6);
    const g = lotGame(seed, doy);
    const lines = fogLog(g);
    expect(lines.length).toBeGreaterThan(0);
    expect(fogLog(g)).toEqual([]);   // gated: not again the same morning
    expect(calendarOf(g.clock).doy).toBe(doy);
  });

  it('the radio gives tomorrow\'s fog forecast', () => {
    let found: string | null = null;
    for (let doy = 244; doy < 334 && !found; doy++) found = fogRadioLine(lotGame(3, doy));
    expect(found).toMatch(/^Forecast:/);
  });

  it('a clear desert morning has no fog at all', () => {
    const g = newGame(5, 200);
    expect(fogNow(g).bankM).toBe(0);
    expect(fogSightK(g, 'eye')).toBe(1);
    expect(fogOn(5, 200, 6.5, 'desert').density).toBe(0);
  });
});
