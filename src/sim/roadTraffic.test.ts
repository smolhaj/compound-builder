import { describe, expect, it } from 'vitest';
import { LANE, MAX_SHOWN, SLOT, approachDistance, busWindow, partyForEncounter, spawnFor, stalledCars, trafficLevel, weekdayOf, type TrafficCtx } from './roadTraffic';

const base: TrafficCtx = {
  seed: 7, region: 'plains', hour: 12, dow: 2, month: 5, phase: 'peace', kind: null, variant: '', sinceHit: -999, tension: 0,
  tracks: { fuel: 1, law: 1, grid: 1, deliveries: 1 },
};
const after = (kind: TrafficCtx['kind'], d: number, tr: Partial<TrafficCtx['tracks']> = {}): TrafficCtx => ({ ...base, phase: 'survival', kind, sinceHit: d, tracks: { fuel: 0.05, law: 0.2, grid: 0, deliveries: 0.05, ...tr } });
const total = (c: TrafficCtx) => { const l = trafficLevel(c); return l.motor + l.bus + l.farm + l.cycle + l.convoy + l.wanderers + l.raiders; };
const count = (c: TrafficCtx, n = 4000) => { let k = 0; for (let i = 0; i < n; i++) if (spawnFor(c, i)) k++; return k; };

describe('road traffic: density', () => {
  it('peaks at the commute and sleeps at night', () => {
    expect(trafficLevel({ ...base, hour: 7.5 }).motor).toBeGreaterThan(trafficLevel({ ...base, hour: 12 }).motor);
    expect(trafficLevel({ ...base, hour: 3 }).motor).toBeLessThan(trafficLevel({ ...base, hour: 12 }).motor * 0.2);
  });
  it('is busier in New England than the desert, and quieter on Sundays', () => {
    expect(trafficLevel({ ...base, region: 'new_england' }).motor).toBeGreaterThan(trafficLevel({ ...base, region: 'desert' }).motor * 2);
    expect(trafficLevel({ ...base, dow: 0 }).motor).toBeLessThan(trafficLevel({ ...base, dow: 2 }).motor);
  });
  it('runs the school bus on weekday mornings and afternoons only, never in summer', () => {
    expect(busWindow(7, 2, 9)).toBe(true);
    expect(busWindow(15, 4, 1)).toBe(true);
    expect(busWindow(12, 2, 9)).toBe(false);
    expect(busWindow(7, 6, 9)).toBe(false);
    expect(busWindow(7, 2, 6)).toBe(false);
  });
  it('puts tractors only in farm country', () => {
    expect(trafficLevel({ ...base, region: 'plains' }).farm).toBeGreaterThan(0);
    expect(trafficLevel({ ...base, region: 'desert' }).farm).toBe(0);
  });
});

describe('road traffic: the collapse curve', () => {
  it('is busier in the warning, drops at the hit and stays sparse after', () => {
    const peace = trafficLevel(base).motor;
    const warn = trafficLevel({ ...base, phase: 'warning', kind: 'grid_down', tension: 1, sinceHit: -1 }).motor;
    const hit = trafficLevel(after('grid_down', 0.5)).motor;
    const later = trafficLevel(after('grid_down', 60)).motor;
    expect(warn).toBeGreaterThan(peace * 1.3);
    expect(hit).toBeLessThan(peace * 0.35);
    expect(later).toBeLessThan(peace * 0.25);
  });
  it('leaves almost nothing after a nuclear war, an asteroid or an ash winter', () => {
    for (const k of ['nuclear', 'asteroid', 'ash_winter'] as const) expect(trafficLevel(after(k, 30)).motor).toBeLessThan(trafficLevel(base).motor * 0.08);
  });
  it('comes back as the fuel track recovers', () => {
    const dead = trafficLevel(after('lawless', 200)).motor;
    const back = trafficLevel(after('lawless', 200, { fuel: 1, deliveries: 1, law: 1 })).motor;
    expect(back).toBeGreaterThan(dead * 2);
  });
  it('strands cars after a solar flare and a grid collapse, and tows them when the grid and fuel return', () => {
    expect(trafficLevel(after('solar_flare', 3)).stalled).toBeGreaterThanOrEqual(5);
    expect(trafficLevel(after('solar_flare', 0.05)).stalled).toBeLessThan(trafficLevel(after('solar_flare', 3)).stalled);
    expect(trafficLevel(after('solar_flare', 90, { grid: 1, fuel: 1 })).stalled).toBe(0);
    expect(trafficLevel(after('financial', 30)).stalled).toBe(0);
    expect(trafficLevel(after('grid_down', 20)).stalled).toBeGreaterThan(0);
  });
  it('runs no headlights after a solar flare', () => {
    expect(trafficLevel(after('solar_flare', 3)).lightsOk).toBe(false);
    expect(trafficLevel(after('nuclear', 3)).lightsOk).toBe(true);
  });
  it('shows early convoys for the kinds that have them', () => {
    expect(trafficLevel({ ...base, phase: 'warning', kind: 'nuclear', tension: 0.9, sinceHit: -2 }).convoy).toBeGreaterThan(0);
    expect(trafficLevel({ ...base, phase: 'warning', kind: 'pandemic', tension: 0.9, sinceHit: -2 }).convoyKind).toBe('hazmat');
    expect(trafficLevel(after('invasion', 3)).convoy).toBeGreaterThan(0);
    expect(trafficLevel(after('invasion', 200)).convoy).toBe(0);
    expect(trafficLevel(after('lawless', 3)).convoy).toBe(0);
  });
  it('puts more people on foot and bicycles when the fuel is gone, and none in the first week of fallout', () => {
    expect(trafficLevel(after('financial', 40)).wanderers).toBeGreaterThan(0);
    expect(trafficLevel(after('nuclear', 3)).wanderers).toBeLessThan(trafficLevel(after('nuclear', 30)).wanderers);
    expect(trafficLevel(after('financial', 40)).cycle).toBeGreaterThan(trafficLevel(base).cycle);
  });
  it('roving crews need the law gone', () => {
    expect(trafficLevel(after('lawless', 60, { law: 0.05 })).raiders).toBeGreaterThan(0);
    expect(trafficLevel(after('lawless', 60, { law: 1 })).raiders).toBe(0);
    expect(trafficLevel(base).raiders).toBe(0);
  });
  it('stays the same road in peace as in a sandbox with no disaster', () => {
    expect(total(base)).toBeGreaterThan(0);
  });
});

describe('road traffic: determinism', () => {
  it('gives the same party for the same seed, slot and context', () => {
    for (let i = 0; i < 300; i++) expect(spawnFor(base, i)).toEqual(spawnFor(base, i));
  });
  it('differs by seed', () => {
    let diff = 0;
    for (let i = 0; i < 300; i++) if (JSON.stringify(spawnFor(base, i)) !== JSON.stringify(spawnFor({ ...base, seed: 8 }, i))) diff++;
    expect(diff).toBeGreaterThan(5);
  });
  it('spawns about rate x time', () => {
    const c = { ...base, hour: 12 };
    const exp = total(c) * SLOT * 4000;
    const got = count(c);
    expect(got).toBeGreaterThan(exp * 0.7);
    expect(got).toBeLessThan(exp * 1.3);
  });
  it('spawns far less after the hit', () => {
    expect(count(after('nuclear', 40))).toBeLessThan(count(base) * 0.2);
  });
  it('puts northbound traffic in one lane and southbound in the other', () => {
    for (let i = 0; i < 400; i++) { const p = spawnFor(base, i); if (p && p.cls === 'traffic') expect(Math.sign(p.members[0].lat)).toBe(-p.dir); }
    expect(LANE).toBeGreaterThan(0);
  });
});

describe('road traffic: stalled cars', () => {
  it('only gains wrecks: the first n stay where they are', () => {
    const a = stalledCars(5, 3, -100, 190, 40), b = stalledCars(5, 7, -100, 190, 40);
    expect(b.slice(0, 3)).toEqual(a);
    expect(b).toHaveLength(7);
  });
  it('keeps clear of the gate mouth and of each other', () => {
    for (let s = 1; s < 30; s++) {
      const l = stalledCars(s, 7, -100, 190, 40);
      for (const c of l) expect(Math.abs(c.z - 40)).toBeGreaterThanOrEqual(3.9);
      const zs = l.map(c => c.z).sort((x, y) => x - y);
      for (let i = 1; i < zs.length; i++) expect(zs[i] - zs[i - 1]).toBeGreaterThan(1.5);
    }
  });
});

describe('road traffic: the party that arrives is the party you saw', () => {
  const enc = (kind: string, size: number, extras?: object) => ({ id: 'e9', kind, size, day: 12, extras: extras as never });
  it('carries the encounter headcount', () => {
    for (const [k, n] of [['gang', 9], ['looters', 4], ['refugees', 11], ['militia', 7], ['arrival', 3], ['horde', 40]] as const) {
      const p = partyForEncounter(enc(k, n), 3);
      expect(p.heads).toBe(Math.min(n, MAX_SHOWN));
      expect(p.encounter).toBe('e9');
    }
  });
  it('puts exactly the heads in the vehicles (driver plus riders) for a crew in trucks', () => {
    const p = partyForEncounter(enc('gang', 10), 3);
    const heads = p.members.reduce((a, m) => a + 1 + m.riders, 0);
    expect(heads).toBe(10);
    expect(p.members.length).toBe(3);
    expect(p.members.every(m => m.kind === 'raider')).toBe(true);
  });
  it('puts refugees on foot, one walker per head', () => {
    const p = partyForEncounter(enc('refugees', 12), 3);
    expect(p.members.filter(m => m.kind === 'walker')).toHaveLength(12);
  });
  it('brings the pickup and the rig a stranger brings', () => {
    const a = partyForEncounter(enc('arrival', 4, { vehicle: 'pickup' }), 3);
    expect(a.members[0].kind).toBe('pickup');
    expect(a.members.reduce((n, m) => n + (m.kind === 'walker' ? 1 : 1 + m.riders), 0)).toBe(4);
    expect(partyForEncounter(enc('arrival', 3, { rig: 'rv_camper' }), 3).members[0].kind).toBe('rv');
  });
  it('is the same party every time', () => {
    expect(partyForEncounter(enc('gang', 9), 3)).toEqual(partyForEncounter(enc('gang', 9), 3));
  });
  it('approaches the gate as the raid hour nears and stands there after', () => {
    expect(approachDistance(10.0, 10.0, 10.5)).toBe(Infinity);
    const d1 = approachDistance(10.2, 10.0, 10.5), d2 = approachDistance(10.4, 10.0, 10.5);
    expect(d1).toBeGreaterThan(d2);
    expect(approachDistance(10.5, 10.0, 10.5)).toBe(0);
    // rolled late: it shows from the roll itself, at a pace no faster than a car
    expect(approachDistance(10.0, 10.0, 10.08)).toBeGreaterThan(0);
    expect(approachDistance(10.0, 10.0, 10.08)).toBeLessThan(Infinity);
  });
});

describe('road traffic: the calendar', () => {
  it('finds the weekday', () => {
    expect(weekdayOf(1, 2025, 0)).toBe(3);   // 1 Jan 2025 was a Wednesday
    expect(weekdayOf(1, 2025, 4)).toBe(0);
  });
});
