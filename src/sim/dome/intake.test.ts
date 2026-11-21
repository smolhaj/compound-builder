import { describe, expect, it } from 'vitest';
import { newGame, type GameState } from '../state';
import { BLUEPRINTS } from '../blueprints';
import { DOME_KIND, type DomeTier } from './tiers';
import { LIMIT_PPM } from './air';
import { INTAKE, hasFilteredIntake, intakeAir } from './intake';
import { setLockdown, stepDome } from './live';

const base = (tier: DomeTier): GameState => {
  const g = newGame(5); g.money = 1e9;
  const kind = DOME_KIND[tier];
  g.structures.push({ id: 'd0', kind, x: 0, z: 0, rot: 0, stage: BLUEPRINTS[kind].stages.length, done: 0, supplied: true, finishedAt: 0 });
  // no power and no air plant: the fail-safe is the only thing between the people and bad air
  g.disaster.kind = 'nuclear'; g.disaster.hitAt = 0; g.clock.t = 0.2; g.disaster.variant = 'distant';
  return g;
};
const run = (g: GameState, days: number): string[] => { const out: string[] = []; for (let i = 0; i < days * 96; i++) out.push(...stepDome(g, 0.25 / 24)); return out; };

describe('the filtered emergency intakes (owner decision 2026-11-21)', () => {
  it('only the arcology has them', () => {
    expect((['earthen', 'geodesic', 'glass', 'arcology'] as const).map(hasFilteredIntake)).toEqual([false, false, false, true]);
  });
  it('the intake pulls the air toward fresh and never makes it worse', () => {
    const bad = { co2ppm: LIMIT_PPM.hard + 5000, o2pct: 14 }, a = intakeAir(bad, 1);
    expect(a.co2ppm).toBeLessThan(bad.co2ppm); expect(a.o2pct).toBeGreaterThan(bad.o2pct);
    expect(intakeAir(bad, 0)).toEqual(bad);
    expect(INTAKE.PULL).toBeGreaterThan(0);
  });
  it('fallout with a dark air plant: the arcology stays sealed, takes in no dust and its air stays breathable; glass and geodesic open their vents and let dust in', () => {
    const arc = base('arcology'); setLockdown(arc, true); arc.dome!.co2ppm = LIMIT_PPM.hard + 1000;   // (the plant failed days ago: the air is already past the fail-safe)
    const lines = run(arc, 10);
    expect(arc.dome!.lockdown).toBe(true);
    expect(arc.dome!.dust).toBe(0);
    expect(arc.dome!.ventedAt).toBeNull();
    expect(arc.dome!.co2ppm).toBeLessThan(LIMIT_PPM.hard * 1.5);
    expect(arc.dome!.lockdown && arc.dome!.dust === 0).toBe(true);
    expect(lines.some(l => /filtered emergency intakes/.test(l))).toBe(true);
    for (const t of ['geodesic', 'glass'] as const) {
      const g = base(t); setLockdown(g, true); g.dome!.co2ppm = LIMIT_PPM.hard + 1000;
      run(g, 10);
      expect(g.dome!.ventedAt, t).not.toBeNull();
      expect(g.dome!.lockdown, t).toBe(false);
      expect(g.dome!.dust, t).toBeGreaterThan(0);
    }
  });
});
