import { describe, expect, it } from 'vitest';
import { exportJson, importJson, migrate, SaveVersionError } from './migrations';
import { newGame, SAVE_VERSION } from '../state';
import { step } from '../engine';
import { planStructure } from '../construction';
import { makeLotSite } from '../lotListing';

describe('save migrations', () => {
  it('round-trips the current version through JSON export / import', () => {
    let g = newGame(7);
    planStructure(g, 'timber_cabin', 10, 10, 1);
    g = step(g, 3.3);
    const back = importJson(exportJson(g));
    expect(back).toEqual(g);
    expect(back.version).toBe(SAVE_VERSION);
  });

  it('refuses garbage, missing versions and saves from the future', () => {
    expect(() => migrate(null)).toThrow(SaveVersionError);
    expect(() => migrate({ seed: 1 })).toThrow(/version/);
    expect(() => migrate({ ...newGame(1), version: SAVE_VERSION + 1 })).toThrow(/newer/);
    expect(() => importJson(JSON.stringify({ version: 1 }))).toThrow(/Compound Builder/);
    const g = newGame(1) as unknown as Record<string, unknown>;
    delete g.people;
    expect(() => migrate(g)).toThrow(/people/);
  });

  it('upgrades a version 1 save (no forestry, no firewood)', () => {
    const v1 = structuredClone(newGame(3)) as unknown as Record<string, unknown>;
    v1.version = 1;
    delete v1.forestry; delete v1.heat;
    delete (v1.stock as Record<string, number>).firewood;
    const g = migrate(v1);
    expect(g.version).toBe(SAVE_VERSION);
    expect(g.stock.firewood).toBe(0);
    expect(g.forestry).toEqual({ jobs: [], cleared: [] });
    expect(g.heat.burned).toBe(0);
    expect(() => step(g, 2)).not.toThrow();
  });

  it('upgrades a v38 save: nothing owed (a negative balance goes on the card), no camps, nobody coming back', () => {
    const v38 = structuredClone(newGame(4)) as unknown as Record<string, unknown>;
    v38.version = 38;
    delete (v38.fin as Record<string, unknown>).debt;
    delete (v38.gate as Record<string, unknown>).camps;
    delete (v38.gate as Record<string, unknown>).comeBack;
    v38.money = -7668;
    let g = migrate(v38);
    expect(g.version).toBe(SAVE_VERSION);
    expect(g.fin.debt).toEqual({ owed: 0, stage: 'none', missed: 0, statementDay: -1, interest: 0, lien: 0 });
    expect(g.gate.camps).toEqual([]);
    expect(g.gate.comeBack).toBeNull();
    g = step(g, 1.2);
    expect(g.money).toBeGreaterThanOrEqual(0);
    expect(g.fin.debt.owed).toBeGreaterThan(7000);
  });

  it('v60 → v61: fields count as sown, a season of saved seed in store, canners for canning families', () => {
    const g = newGame(3);
    g.structures.push({ id: 'f1', kind: 'field', x: 5, z: 5, rot: 0, stage: 5, done: 0, supplied: true, finishedAt: -10 });
    g.stock.lids = 12;
    const old = JSON.parse(JSON.stringify(g));
    old.version = 60;
    for (const k of ['seed_hybrid', 'seed_saved', 'canner', 'compost', 'manure']) delete old.stock[k];
    delete old.farm;
    const m = migrate(old);
    expect(m.version).toBe(SAVE_VERSION);
    expect(m.stock.canner).toBe(1);
    expect(m.stock.seed_saved).toBe(2);
    expect(m.farm?.plots?.f1.planted).toBe(true);
  });
  it('v64 → v65: the plain seed is the hybrid now, the old heirloom stock moves to its own good, fields keep the line they were sown with', () => {
    const g = newGame(3);
    g.structures.push({ id: 'f1', kind: 'field', x: 5, z: 5, rot: 0, stage: 5, done: 0, supplied: true, finishedAt: -10 });
    const old = JSON.parse(JSON.stringify(g));
    old.version = 64;
    delete old.stock.seed_heirloom;
    old.stock.seed = 5; old.stock.seed_hybrid = 2; old.stock.seed_saved = 3;
    old.farm = { plots: { f1: { kind: 'field', fert: 1, prev: null, prev2: null, crop: 'beans', loads: 0, cover: false, settled: -1, planted: true, sown: { y: 2027, doy: 140, line: 'heirloom', v: 1, late: 1 } } } };
    const m = migrate(old);
    expect(m.version).toBe(SAVE_VERSION);
    expect(m.stock.seed_heirloom).toBe(5);
    expect(m.stock.seed).toBe(2);
    expect((m.stock as unknown as Record<string, number>).seed_hybrid).toBeUndefined();
    expect(m.stock.seed_saved).toBe(3);
    expect(m.farm?.plots?.f1.sown?.line).toBe('heirloom');
  });

  it('v67 → v68: an old place has no lot (its ground is the classic benches), a lot place keeps its spec, and both run on', () => {
    const old = JSON.parse(JSON.stringify(newGame(3)));
    old.version = 67;
    delete old.site.lot;
    const m = migrate(old);
    expect(m.version).toBe(SAVE_VERSION);
    expect(m.site.lot).toBeNull();
    const withLot = JSON.parse(JSON.stringify(newGame(3, 105, 2027, { site: makeLotSite({ kind: 'gorge', seed: 4 }) })));
    withLot.version = 67;
    const kept = migrate(withLot);
    expect(kept.site.lot?.kind).toBe('gorge');
    // and a day on a lot place runs (the climate, the road and the grade read the lot)
    const g = step(structuredClone(kept), 3);
    expect(g.site.lot?.kind).toBe('gorge');
  });

  it('v68 → v69: the bridge on the way in is standing in every old game, and the road runs on', () => {
    const old = JSON.parse(JSON.stringify(newGame(3)));
    old.version = 68;
    delete old.roadBridge;
    const m = migrate(old);
    expect(m.version).toBe(SAVE_VERSION);
    expect(m.roadBridge).toEqual({ down: false, due: null });
    expect(() => step(structuredClone(m), 3)).not.toThrow();
  });
});
