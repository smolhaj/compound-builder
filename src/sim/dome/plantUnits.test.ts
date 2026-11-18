import { describe, expect, it } from 'vitest';
import { newGame, SAVE_VERSION, type GameState, type Structure } from '../state';
import { migrate } from '../save/migrations';
import { BLUEPRINTS } from '../blueprints';
import { addDamageWork, openDamage } from '../raidDamage';
import { DOME_KIND, type DomeTier } from './tiers';
import { stepDome, domeOf, ownState, stateOf, setLockdown, buySpare, sparesProblem, domeClock, dayLoad, planPowered, domeCards, domeChoose, domeWaterFlows, spareBill } from './live';
import { damagePlant, fxOf, jobOf, plantJobs, unitsOf } from './plantLive';
import {
  PLANT_KINDS, RIDE_BANK_H, RIDE_UPS_H, SPAREABLE, capOf, plantFx, plantKinds, plantUnits, repairSpec, rushUsd, spareProblem, spareUsd, stepLine,
  type PlantCond, type PlantFx, type PlantHit, type PlantKind, type PlantSpec,
} from './plantUnits';

const CONDS: PlantCond[] = ['ok', 'damaged', 'down'];
const FULL: PlantSpec = { filtering: 'closed', loop: 'recycle', spares: [] };
const order = (c: PlantCond): number => CONDS.indexOf(c);
const hit = (unit: string, cond: 'damaged' | 'down', at = 0): PlantHit => ({ unit, cond, at });
const fields = (f: PlantFx): number[] => [f.climate, f.scrub, f.water, f.vent, ['dark', 'battery', 'derated', 'grid'].indexOf(f.power)];

describe('plant units', () => {
  it('a dome has only the units its equipment and tier give it', () => {
    expect(plantKinds('earthen', FULL)).toEqual([]);
    expect(plantKinds('glass', { filtering: 'none', loop: 'none', spares: [] })).toEqual(['chiller', 'substation', 'vents']);
    expect(plantKinds('glass', { filtering: 'scrubber', loop: 'none', spares: [] })).toContain('air');
    expect(plantKinds('glass', { filtering: 'scrubber', loop: 'grey', spares: [] })).toContain('water');
    expect(plantKinds('arcology', FULL).sort()).toEqual([...PLANT_KINDS].sort());
    expect(plantKinds('arcology', { ...FULL, filtering: 'advanced' })).not.toContain('battery');
  });
  it('a state is read from the open hits, and a second unit adds its capacity up to one whole unit', () => {
    const u = plantUnits('arcology', { ...FULL, spares: ['chiller'] }, [hit('chiller', 'down')]);
    expect(u.find(x => x.id === 'chiller')!.cap).toBe(0);
    expect(u.find(x => x.id === 'chiller2')!.cap).toBe(1);
    expect(capOf(u, 'chiller')).toBe(1);
    expect(capOf(plantUnits('arcology', FULL, [hit('chiller', 'damaged')]), 'chiller')).toBe(0.5);
    // both halves damaged make one whole unit, both down make none
    expect(capOf(plantUnits('arcology', { ...FULL, spares: ['air'] }, [hit('air', 'damaged'), hit('air2', 'damaged')]), 'air')).toBe(1);
    expect(capOf(plantUnits('arcology', { ...FULL, spares: ['air'] }, [hit('air', 'down'), hit('air2', 'down')]), 'air')).toBe(0);
    expect(capOf([], 'chiller')).toBe(1);   // a dome without the unit loses nothing
  });
  it('a spare is a chiller, a scrubber bank or a transformer, and only once', () => {
    for (const k of PLANT_KINDS) expect(SPAREABLE.includes(k)).toBe(['chiller', 'air', 'substation'].includes(k));
    expect(spareProblem('glass', FULL, 'chiller')).toBeNull();
    expect(spareProblem('glass', { ...FULL, spares: ['chiller'] }, 'chiller')).toMatch(/already/);
    expect(spareProblem('glass', FULL, 'water')).toMatch(/no spare/);
    expect(spareProblem('glass', { filtering: 'none', loop: 'none', spares: [] }, 'air')).toMatch(/not fitted/);
    for (const k of SPAREABLE) expect(spareUsd('arcology', 36, k, 'advanced')!).toBeGreaterThan(spareUsd('glass', 15, k, 'advanced')!);
  });
});

describe('stepped degradation: more damage never helps', () => {
  const kinds: PlantKind[] = ['chiller', 'air', 'substation', 'water', 'battery', 'vents'];
  const fx = (conds: PlantCond[], spec: PlantSpec, now = 0.01) => plantFx(plantUnits('arcology', spec, kinds.flatMap((k, i) => conds[i] === 'ok' ? [] : [hit(k, conds[i] as 'damaged' | 'down', 0)])), now);
  it('worsening any one unit never raises any effect, with and without a spare', () => {
    for (const spec of [FULL, { ...FULL, spares: ['chiller', 'air', 'substation'] as PlantKind[] }]) {
      for (let mask = 0; mask < 3 ** 6; mask += 7) {
        const base = Array.from({ length: 6 }, (_, i) => CONDS[Math.floor(mask / 3 ** i) % 3]);
        const a = fields(fx(base, spec));
        for (let i = 0; i < 6; i++) {
          if (base[i] === 'down') continue;
          const worse = base.slice(); worse[i] = CONDS[order(base[i]) + 1];
          const b = fields(fx(worse, spec));
          b.forEach((v, j) => expect(v).toBeLessThanOrEqual(a[j] + 1e-9));
        }
      }
    }
  });
  it('a whole plant does everything, and a wrecked one does nothing', () => {
    const w = fx(Array(6).fill('ok') as PlantCond[], FULL);
    expect(fields(w)).toEqual([1, 1, 1, 1, 3]); expect(w.whole).toBe(true);
    const dead = fx(Array(6).fill('down') as PlantCond[], FULL, 100);
    expect(fields(dead)).toEqual([0, 0, 0, 0, 0]); expect(dead.power).toBe('dark');
  });
  it('a lost substation falls back to the batteries and then goes dark; the battery block and time decide how long', () => {
    const u = (spec: PlantSpec) => plantUnits('arcology', spec, [hit('substation', 'down', 10)]);
    const closed = u(FULL), plain = u({ ...FULL, filtering: 'advanced' });
    expect(plantFx(closed, 10 + 1 / 24).power).toBe('battery');
    expect(plantFx(closed, 10 + 1 / 24).rideH).toBeGreaterThan(RIDE_UPS_H);
    expect(plantFx(closed, 10 + (RIDE_UPS_H + RIDE_BANK_H + 1) / 24).power).toBe('dark');
    expect(plantFx(plain, 10 + 1 / 24).power).toBe('battery');
    expect(plantFx(plain, 10 + (RIDE_UPS_H + 1) / 24).power).toBe('dark');
    // the battery block lost: no ride-through beyond the small one
    const noBank = plantUnits('arcology', FULL, [hit('substation', 'down', 10), hit('battery', 'down', 10)]);
    expect(plantFx(noBank, 10 + (RIDE_UPS_H + 1) / 24).power).toBe('dark');
    // one transformer of two out: derated, not dark
    expect(plantFx(plantUnits('arcology', FULL, [hit('substation', 'damaged', 10)]), 11).power).toBe('derated');
    // with a second transformer one loss is no loss
    expect(plantFx(plantUnits('arcology', { ...FULL, spares: ['substation'] }, [hit('substation', 'down', 10)]), 11).power).toBe('grid');
  });
  it('each lost unit costs its own thing: chiller the climate, air the scrubbing, water the loop, vents the free cooling', () => {
    expect(fx(['down', 'ok', 'ok', 'ok', 'ok', 'ok'], FULL).climate).toBe(0);
    expect(fx(['down', 'ok', 'ok', 'ok', 'ok', 'ok'], FULL).scrub).toBe(1);
    expect(fx(['ok', 'down', 'ok', 'ok', 'ok', 'ok'], FULL).scrub).toBe(0);
    expect(fx(['ok', 'ok', 'ok', 'down', 'ok', 'ok'], FULL).water).toBe(0);
    expect(fx(['ok', 'ok', 'ok', 'ok', 'ok', 'down'], FULL).vent).toBe(0);
    expect(fx(['ok', 'down', 'ok', 'ok', 'ok', 'ok'], FULL).climate).toBe(1);
  });
  it('every state has a line for the panel', () => { for (const k of PLANT_KINDS) { expect(stepLine(k, 'ok')).toBeNull(); expect(stepLine(k, 'damaged')).toBeTruthy(); expect(stepLine(k, 'down')).toBeTruthy(); } });
});

describe('repair: parts, labor hours and a wait', () => {
  it('a wrecked unit takes more than a damaged one, and a bigger dome more than a smaller', () => {
    for (const k of PLANT_KINDS) {
      const d = repairSpec('glass', 15, k, 'damaged'), w = repairSpec('glass', 15, k, 'down');
      expect(w.hours).toBeGreaterThan(d.hours); expect(w.usd).toBeGreaterThanOrEqual(d.usd); expect(w.leadDays).toBeGreaterThanOrEqual(d.leadDays);
      expect(Object.keys(w.bill).length).toBeGreaterThan(0);
      expect(repairSpec('arcology', 36, k, 'down').usd).toBeGreaterThanOrEqual(w.usd);
      expect(rushUsd(w)).toBeGreaterThan(w.usd);
    }
  });
});

// ── the live dome ──

const dome = (g: GameState, tier: DomeTier): Structure => {
  const kind = DOME_KIND[tier], st: Structure = { id: `d${g.structures.length}`, kind, x: 0, z: 0, rot: 0, stage: BLUEPRINTS[kind].stages.length, done: 0, supplied: true, finishedAt: 0 };
  g.structures.push(st);
  return st;
};
const base = (tier: DomeTier = 'glass', filtering: 'scrubber' | 'advanced' = 'advanced'): GameState => {
  const g = newGame(5); g.money = 1e9; const st = dome(g, tier);
  g.utilities.fittings.push({ building: st.id, kind: 'wire', done: 1, hours: 1, supplied: true, finishedAt: 0 });
  g.structures.push({ id: 'sol', kind: 'solar_array', x: 5, z: 5, rot: 0, stage: 9, done: 0, supplied: true, finishedAt: 0 });
  const d = domeOf(g)!, o = ownState(g, d); o.filtering = filtering; o.loop = 'grey';
  return g;
};
const run = (g: GameState, hours: number) => { for (let i = 0; i < Math.round(hours * 4); i++) { g.clock.t += 0.25 / 24; stepDome(g, 0.25 / 24); } };
const hurt = (g: GameState, unit: string, cond: 'damaged' | 'down'): void => { const d = domeOf(g)!; expect(damagePlant(g, d, stateOf(g, d), unit, cond, 'raid')).toBeTruthy(); };

describe('the dome steps down with its plant', () => {
  it('a lost scrubber house shortens the sealed air clock; a spare covers it', () => {
    const mk = (spare: boolean, c: 'damaged' | 'down' | null) => { const g = base('geodesic', 'scrubber'); if (spare) ownState(g, domeOf(g)!).spares = ['air']; setLockdown(g, true); if (c) hurt(g, 'air', c); return domeClock(g)!.hours; };
    const whole = mk(false, null);
    expect(mk(false, 'down')).toBeLessThan(whole);
    expect(mk(true, 'down')).toBeCloseTo(whole, 3);
  });
  it('half a scrubber house is between whole and none', () => {
    const mk = (c: 'damaged' | 'down' | null) => { const g = base('geodesic', 'scrubber'); setLockdown(g, true); if (c) hurt(g, 'air', c); return domeClock(g)!.hours; };
    const a = mk(null), b = mk('damaged'), c = mk('down');
    expect(a).toBeGreaterThan(b); expect(b).toBeGreaterThan(c);
  });
  it('a lost chiller lets the air drift toward the outside', () => {
    const mk = (c: 'damaged' | 'down' | null) => { const g = base(); g.clock.t = 200.6; if (c) hurt(g, 'chiller', c); run(g, 6); const st = stateOf(g, domeOf(g)!); return { f: st.indoorF, out: st.outF, mid: (50 + 85) / 2 }; };
    const w = mk(null), h = mk('damaged'), d = mk('down');
    expect(Math.abs(d.f - w.f)).toBeGreaterThanOrEqual(Math.abs(h.f - w.f) - 1e-9);
    expect(Math.abs(d.f - w.mid)).toBeGreaterThanOrEqual(Math.abs(w.f - w.mid) - 1e-9);
  });
  it('a lost substation runs on the batteries, then the dome goes dark (fans, lights, pumps stop)', () => {
    const g = base(); const d = domeOf(g)!;
    run(g, 1);
    expect(stateOf(g, d).powered).toBe(true);
    hurt(g, 'substation', 'down');
    run(g, 1);
    expect(fxOf(g, d, stateOf(g, d)).power).toBe('battery');
    expect(stateOf(g, d).powered).toBe(true);
    run(g, RIDE_UPS_H + 2);
    expect(fxOf(g, d, stateOf(g, d)).power).toBe('dark');
    expect(planPowered(g, d, stateOf(g, d))).toBe(false);
    expect(stateOf(g, d).powered).toBe(false);
  });
  it('a lost water plant stops the rain and graywater loop', () => {
    const g = base(); const d = domeOf(g)!;
    const flows = () => domeWaterFlows(g, 10, 100, () => true);
    const whole = flows();
    hurt(g, 'water', 'down');
    const out = flows();
    expect(out.reuseL).toBe(0); expect(whole.reuseL).toBeGreaterThan(0);
    expect(out.rainL).toBeLessThan(whole.rainL);
    void d;
  });
  it('the draw never rises with a lost climate plant', () => {
    const g = base(), d = domeOf(g)!, w = dayLoad(g, d).kwh;
    hurt(g, 'chiller', 'down');
    expect(dayLoad(g, d).kwh).toBeLessThanOrEqual(w + 1e-9);
  });
  it('mending the job mends the unit, with parts and labor, and a contractor can rush it', () => {
    const g = base(), d = domeOf(g)!;
    hurt(g, 'chiller', 'down');
    const job = jobOf(g, d.st.id, 'chiller')!;
    expect(job.kind).toBe('plant'); expect(job.hours).toBeGreaterThan(8); expect(Object.keys(job.bill).length).toBeGreaterThan(0); expect((job.readyDay ?? 0)).toBeGreaterThan(job.day);
    expect(fxOf(g, d, stateOf(g, d)).climate).toBe(0);
    const cards = domeCards(g);
    expect(cards.some(c => c.id.startsWith('dome:plantjob:'))).toBe(true);
    // the family works it
    job.supplied = true;
    addDamageWork(g, job, job.hours);
    expect(openDamage(g).length).toBe(0);
    expect(fxOf(g, d, stateOf(g, d)).climate).toBe(1);
    // and a second, rushed
    hurt(g, 'substation', 'down');
    const j2 = plantJobs(g, d.st.id)[0], before = g.money;
    expect(domeChoose(g, `dome:rush:${j2.id}`)).toBeTruthy();
    expect(g.money).toBeLessThan(before); expect(plantJobs(g, d.st.id).length).toBe(0);
  });
  it('a unit already wrecked stays wrecked; a damaged one can be made worse; the log says what happened', () => {
    const g = base(), d = domeOf(g)!, st = stateOf(g, d);
    expect(damagePlant(g, d, st, 'chiller', 'damaged', 'raid')).toMatch(/chiller/);
    expect(damagePlant(g, d, st, 'chiller', 'damaged', 'raid')).toBeNull();
    expect(damagePlant(g, d, st, 'chiller', 'down', 'raid')).toBeTruthy();
    expect(damagePlant(g, d, st, 'chiller', 'damaged', 'raid')).toBeNull();
    expect(unitsOf(g, d, st).find(u => u.id === 'chiller')!.cond).toBe('down');
    expect(damagePlant(g, d, st, 'nope', 'down', 'raid')).toBeNull();
    expect(g.log.some(l => /chiller/.test(l.text))).toBe(true);
  });
  it('a second unit is bought once, priced, and then covers the first', () => {
    const g = base(), d = domeOf(g)!;
    expect(spareBill(g, 'chiller')).toBeGreaterThan(10000);
    expect(buySpare(g, 'chiller')).toBeNull();
    expect(buySpare(g, 'chiller')).toMatch(/already/);
    expect(sparesProblem(g, 'water')).toMatch(/no spare/);
    expect(stateOf(g, d).spares).toEqual(['chiller']);
    hurt(g, 'chiller', 'down');
    expect(fxOf(g, d, stateOf(g, d)).climate).toBe(1);
    hurt(g, 'chiller2', 'down');
    expect(fxOf(g, d, stateOf(g, d)).climate).toBe(0);
  });
});

describe('save', () => {
  it('a v102 save loads as the current version with its plant jobs intact', () => {
    const g = base(); const d = domeOf(g)!; hurt(g, 'air', 'down');
    const old = JSON.parse(JSON.stringify({ ...g, version: 102 }));
    const m = migrate(old);
    expect(m.version).toBe(SAVE_VERSION);
    expect(m.raidDamage!.some(j => j.kind === 'plant' && j.unit === 'air')).toBe(true);
    expect(unitsOf(m, domeOf(m)!, stateOf(m, domeOf(m)!)).find(u => u.id === 'air')!.cond).toBe('down');
    void d;
  });
  it('a v102 save with no plant fields at all is fine, and the plant reads whole', () => {
    const g = base(); delete (g as { raidDamage?: unknown }).raidDamage;
    const m = migrate(JSON.parse(JSON.stringify({ ...g, version: 102 })));
    const d = domeOf(m)!;
    expect(fxOf(m, d, stateOf(m, d)).whole).toBe(true);
  });
});
