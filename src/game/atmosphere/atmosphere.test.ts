import { describe, expect, it } from 'vitest';
import { containerWear, fenceLean, leanAt, NO_WEAR, overgrowth, packWear, structureAge, unpackWear, wearFor, wetnessOf } from './aging';
import { awakeAtHome, firePitLit, flashlightCarriers, generatorRunning, windowLight, type NightPerson } from './nightLife';
import { driftDepth, frostAt, mudSeason, sideFor, troughIce } from './seasonCover';

describe('aging', () => {
  it('new is un-aged, and every channel only grows with years', () => {
    expect(wearFor(0, 0.5)).toEqual({ ...NO_WEAR });
    let prev = wearFor(0, 0.5);
    for (let y = 1; y <= 40; y++) {
      const w = wearFor(y, 0.5);
      for (const k of ['rust', 'gray', 'peel', 'moss', 'grime'] as const) expect(w[k]).toBeGreaterThanOrEqual(prev[k]);
      prev = w;
    }
  });
  it('wood grays within a few years; a galvanized roof holds for years, then rusts', () => {
    expect(wearFor(3, 0.1).gray).toBeGreaterThan(0.6);
    expect(wearFor(5, 0.1).rust).toBe(0);
    expect(wearFor(15, 0.1).rust).toBeGreaterThan(0.25);
    expect(containerWear(5, 0.1).rust).toBeGreaterThan(wearFor(5, 0.1).rust);
  });
  it('moss needs a wet region', () => {
    expect(wearFor(20, wetnessOf(400)).moss).toBeLessThan(0.15);
    expect(wearFor(20, wetnessOf(1500)).moss).toBeGreaterThan(0.8);
  });
  it('a repair shows fresh boards that weather back in', () => {
    expect(wearFor(10, 0.2, 0).patch).toBeCloseTo(0.4);
    expect(wearFor(10, 0.2, 6).patch).toBeLessThan(0.05);
    expect(wearFor(10, 0.2).patch).toBe(0);
  });
  it('age counts the years before the family came for what came with the land, and a worn roof', () => {
    expect(structureAge({ finishedAt: null, t: 900, nowYear: 2030, startYear: 2027 })).toBe(0);
    expect(structureAge({ finishedAt: 0, t: 365 * 15, nowYear: 2042, startYear: 2027 })).toBeCloseTo(15);
    expect(structureAge({ finishedAt: 0, t: 0, pre: true, builtYear: 1962, nowYear: 2027, startYear: 2027 })).toBe(65);
    expect(structureAge({ finishedAt: 0, t: 0, nowYear: 2027, startYear: 2027, condition: 'poor' })).toBe(16);
  });
  it('packs and unpacks losslessly enough, and an un-aged mesh is the GL default (0, 0, 0, 1)', () => {
    expect(packWear(NO_WEAR, 'wood')).toEqual([0, 0, 0, 1]);
    expect(packWear(wearFor(30, 1), null)).toEqual([0, 0, 0, 1]);
    const w = { rust: 0.62, gray: 0.8, peel: 0.3, moss: 0.45, patch: 0.3, grime: 0.5 };
    const u = unpackWear(packWear(w, 'container'));
    expect(u.rust).toBeCloseTo(0.62, 5); expect(u.grime).toBeCloseTo(0.5, 5); expect(u.peel).toBeCloseTo(0.3, 5);
    expect(u.patch).toBeCloseTo(0.3, 5); expect(u.moss).toBe(0);
    expect(unpackWear(packWear(w, 'roof')).moss).toBeCloseTo(0.45, 5);
    // wood doesn't rust; metal doesn't gray
    expect(unpackWear(packWear(w, 'wood')).rust).toBe(0);
    expect(packWear(w, 'metal')[1]).toBe(0);
    // full rust survives the grime packing
    expect(unpackWear(packWear({ ...w, rust: 1, grime: 1 }, 'metal')).rust).toBeCloseTo(1, 5);
  });
  it('fields go to weeds in a summer and to saplings in a few years', () => {
    expect(overgrowth(0)).toEqual({ weeds: 0, saplings: 0 });
    expect(overgrowth(120).weeds).toBe(1);
    expect(overgrowth(120).saplings).toBe(0);
    expect(overgrowth(365 * 7).saplings).toBe(1);
  });
  it('old fence posts lean a few degrees, never fall flat', () => {
    expect(leanAt(3, 4, 1, 0)).toEqual({ dx: 0, dz: 0, sag: 0 });
    const k = fenceLean(40);
    expect(k).toBe(1);
    let max = 0;
    for (let x = 0; x < 30; x += 0.37) { const l = leanAt(x, x * 0.3, 5, k); max = Math.max(max, Math.hypot(l.dx, l.dz)); }
    expect(max).toBeGreaterThan(0.05);
    expect(max).toBeLessThan(0.33);
  });
});

const P = (id: string, task: string, kid = false, gone = false): NightPerson => ({ id, task, kid, gone });

describe('night life', () => {
  const base = { hour: 21, night: 1, home: true, awake: 2, powered: false, blackout: false, watch: false };
  it('nobody lights a lamp by day', () => {
    expect(windowLight({ ...base, night: 0 }).kind).toBe('off');
  });
  it('oil lamps without power, electric light with it', () => {
    expect(windowLight(base).kind).toBe('oil');
    expect(windowLight({ ...base, powered: true }).kind).toBe('electric');
  });
  it('a dark house when everyone is asleep or away; a low lamp for the watch', () => {
    expect(windowLight({ ...base, awake: 0 }).kind).toBe('off');
    expect(windowLight({ ...base, hour: 2, awake: 0, watch: true })).toEqual({ kind: 'oil', room: 0.25 });
  });
  it('blackout curtains keep the room lit and the window dark', () => {
    const w = windowLight({ ...base, blackout: true });
    expect(w.kind).toBe('curtained');
    expect(w.room).toBeGreaterThan(0);
  });
  it('counts the living who are home and awake', () => {
    expect(awakeAtHome([P('a', 'leisure'), P('b', 'sleep'), P('c', 'job'), P('d', 'leisure', false, true)])).toBe(1);
  });
  it('the fire pit burns when people sit out of an evening, not in the rain or under blackout after the collapse', () => {
    const f = { hour: 20, sittingOut: 2, rain: 0, cold: 0.2, hasHome: true, blackout: false, collapsed: false, night: 1 };
    expect(firePitLit(f)).toBe(1);
    expect(firePitLit({ ...f, sittingOut: 0 })).toBe(0);
    expect(firePitLit({ ...f, rain: 0.8 })).toBe(0);
    expect(firePitLit({ ...f, blackout: true, collapsed: true })).toBe(0);
    expect(firePitLit({ ...f, hasHome: false, sittingOut: 0, hour: 7 })).toBe(1);
  });
  it('flashlights: whoever is on watch; else the adults outdoors when something is out there', () => {
    const ppl = [P('a', 'watch'), P('b', 'leisure'), P('k', 'leisure', true)];
    const out = new Set(['a', 'b', 'k']);
    const calm = { radioWarned: false, atGate: false, battle: false, dogs: false };
    expect(flashlightCarriers(ppl, out, 1, calm)).toEqual(['a']);
    expect(flashlightCarriers(ppl, out, 0, calm)).toEqual([]);
    const noWatch = [P('b', 'leisure'), P('k', 'leisure', true)];
    expect(flashlightCarriers(noWatch, out, 1, calm)).toEqual([]);
    expect(flashlightCarriers(noWatch, out, 1, { ...calm, radioWarned: true })).toEqual(['b']);
    expect(flashlightCarriers(noWatch, new Set(), 1, { ...calm, radioWarned: true })).toEqual([]);
  });
  it('the generator runs the evening load', () => {
    expect(generatorRunning(0, 7, 19)).toBe(false);
    expect(generatorRunning(14, 7, 18)).toBe(true);
    expect(generatorRunning(14, 7, 2)).toBe(false);
    expect(generatorRunning(100, 7, 2)).toBe(true);
  });
});

describe('season cover', () => {
  it('mud season is the thaw round the last frost, in a cold-winter region', () => {
    expect(mudSeason(60, 140, 1)).toBe(0);
    expect(mudSeason(135, 140, 1)).toBe(1);
    expect(mudSeason(200, 140, 1)).toBe(0);
    expect(mudSeason(135, 140, 0.2)).toBeLessThan(0.6);
  });
  it('frost shows at dawn in the shoulder seasons, not at noon, not under snow', () => {
    expect(frostAt(6.5, 0.6, 0)).toBeGreaterThan(0.8);
    expect(frostAt(13, 0.6, 0)).toBe(0);
    expect(frostAt(6.5, 0, 0)).toBe(0);
    expect(frostAt(6.5, 0.6, 1)).toBe(0);
    expect(frostAt(6.5, 0.6, 0, 1)).toBeLessThan(frostAt(6.5, 0.6, 0, 0));
  });
  it('drifts build deepest in the lee of a wall', () => {
    expect(driftDepth(0, 'lee').h).toBe(0);
    expect(driftDepth(1, 'lee').h).toBeGreaterThan(driftDepth(1, 'flank').h);
    expect(driftDepth(1, 'flank').h).toBeGreaterThan(driftDepth(1, 'windward').h);
    expect(driftDepth(1, 'lee').h).toBeLessThanOrEqual(0.12);   // ≈ 0.6 m
    // westerlies blow toward +x: the east wall is in the lee
    expect(sideFor(1, 0, 1, 0.2)).toBe('lee');
    expect(sideFor(-1, 0, 1, 0.2)).toBe('windward');
    expect(sideFor(0, 1, 1, 0.2)).toBe('flank');
  });
  it('the stock tank ices over in winter and skins on a hard frost', () => {
    expect(troughIce(0, 0)).toBe(0);
    expect(troughIce(1, 0)).toBe(1);
    expect(troughIce(0, 1)).toBe(1);
  });
});
