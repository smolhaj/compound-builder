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
});
