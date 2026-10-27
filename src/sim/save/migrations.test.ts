import { describe, expect, it } from 'vitest';
import { exportJson, importJson, migrate, SaveVersionError } from './migrations';
import { newGame, SAVE_VERSION } from '../state';
import { step } from '../engine';
import { planStructure } from '../construction';

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
});
