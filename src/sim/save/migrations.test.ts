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

  it('upgrades a version 39 save: radiation with repair, dehydration, the cold, the hand pump', () => {
    const v39 = structuredClone(newGame(3)) as unknown as { version: number; clock: { t: number }; disaster: { kind: string; hitAt: number }; stock: Record<string, number>; heat: Record<string, number>; personState: Array<{ needs: Record<string, unknown> }>; utilities: { report: Record<string, number> } };
    v39.version = 39;
    v39.clock.t = 300; v39.disaster.kind = 'nuclear'; v39.disaster.hitAt = 100;
    for (const k of ['hand_pump', 'potassium_iodide', 'sleeping_bags']) delete v39.stock[k];
    delete v39.heat.cold; delete v39.utilities.report.handL; delete v39.utilities.report.handH;
    for (const ps of v39.personState) { delete ps.needs.rad; delete ps.needs.dry; delete ps.needs.chill; ps.needs.dose = 1.65; }
    const g = migrate(v39);
    expect(g.version).toBe(SAVE_VERSION);
    expect(g.stock.hand_pump).toBe(0);
    expect(g.heat.cold).toBe(-1);
    const n = g.personState[0].needs;
    // 200 days on, most of the 1.65 Sv has been repaired: no radiation sickness on loading
    expect(n.rad?.seen).toBe(1.65);
    expect(n.rad!.rep).toBeLessThan(0.02);
    expect(n.rad!.risk).toBeCloseTo(0.0825, 4);
    expect(n.dry).toBe(0);
    expect(() => step(g, 2)).not.toThrow();
  });
});
