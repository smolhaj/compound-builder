import { describe, expect, it } from 'vitest';
import { newGame, type GameState, type Structure } from './state';
import { planRun } from './perimeter';
import { fleetOf } from './vehicles';
import { syncParking } from './parking';
import { VEHICLE_YARD, YARD_RULES, exposed, lureOf, raidYardLosses, standingIn, vehicleYards, yardCover, yardLines, yardOutside } from './vehicleYard';

const yardAt = (g: GameState, x: number, z: number): Structure => { const st = { id: `vy${g.structures.length}`, kind: VEHICLE_YARD, x, z, rot: 0, stage: 9, done: 0, supplied: true, finishedAt: 0 } as Structure; g.structures.push(st); return st; };
function lot(): GameState {
  const g = newGame(5, 105, 2027, { mode: 'scenario', peace: 'short', kind: 'grid_down' });
  g.structures.push({ id: 'h', kind: 'timber_cabin', x: 30, z: 30, rot: 0, stage: 9, done: 0, supplied: true, finishedAt: 0 } as Structure);
  return g;
}
const ring = (g: GameState) => { const r = planRun(g, 'container_wall', [[20, 20], [40, 20], [40, 40], [20, 40], [20, 20]]); r.finishedAt = 0; r.done = r.hours; r.supplied = true; };
const park = (g: GameState) => { g.vehicles = fleetOf(g).slice(0, 1).concat(fleetOf(g).slice(1)); syncParking(g); };

describe('the vehicle yard', () => {
  it('is outside when no wall ring holds it, inside when one does', () => {
    const g = lot(); ring(g);
    expect(yardOutside(g, { x: 30, z: 30 })).toBe(false);
    expect(yardOutside(g, { x: 55, z: 30 })).toBe(true);
  });
  it('takes the fleet into its bays and exposes it past the walls', () => {
    const g = lot(); ring(g); const y = yardAt(g, 55, 30); park(g);
    expect(vehicleYards(g)).toHaveLength(1);
    expect(standingIn(g, y.id).length).toBeGreaterThan(0);
    expect(exposed(g).length).toBe(standingIn(g, y.id).length);
  });
  it('exposes nothing inside the walls', () => {
    const g = lot(); ring(g); yardAt(g, 30, 25); park(g);
    expect(exposed(g)).toHaveLength(0);
    expect(raidYardLosses(g, 'overrun', true, 1)).toEqual([]);
  });
  it('is covered by its fence, lights and a tower that sees it', () => {
    const g = lot(); const y = yardAt(g, 55, 30);
    const bare = yardCover(g, y).k;
    expect(bare).toBe(YARD_RULES.FENCED);
    g.utilities.lit.push(y.id);
    g.structures.push({ id: 't', kind: 'watchtower_wood', x: 52, z: 30, rot: 0, stage: 9, done: 0, supplied: true, finishedAt: 0 } as Structure);
    const guarded = yardCover(g, y);
    expect(guarded.lit && guarded.watched).toBe(true);
    expect(guarded.k).toBeLessThan(bare);
  });
  it('loses more of its vehicles when the house falls than when it holds, and a watch cuts the loss', () => {
    const count = (result: 'repelled' | 'overrun', guard: boolean) => {
      let lost = 0;
      for (let seed = 1; seed <= 200; seed++) {
        const g = lot(); ring(g); const y = yardAt(g, 55, 30); park(g);
        if (guard) { g.utilities.lit.push(y.id); g.structures.push({ id: 't', kind: 'watchtower_wood', x: 52, z: 30, rot: 0, stage: 9, done: 0, supplied: true, finishedAt: 0 } as Structure); }
        lost += raidYardLosses(g, result, true, seed).length;
      }
      return lost;
    };
    const fell = count('overrun', false), held = count('repelled', false), guarded = count('overrun', true);
    expect(fell).toBeGreaterThan(0);
    expect(held).toBeLessThan(fell);
    expect(guarded).toBeLessThan(fell);
  });
  it('a burned-out vehicle is dead, a driven-off one leaves the fleet', () => {
    const g = lot(); ring(g); yardAt(g, 55, 30); park(g);
    const before = fleetOf(g).length;
    for (let seed = 1; seed <= 60; seed++) raidYardLosses(g, 'overrun', true, seed);
    const after = fleetOf(g);
    expect(after.length).toBeLessThanOrEqual(before);
    expect(after.length < before || after.some(v => v.condition === 0)).toBe(true);
  });
  it('lures part of a big crew to the lot, never a small one, never all of them', () => {
    const g = lot(); ring(g); yardAt(g, 55, 30); park(g);
    expect(lureOf(g, 3)).toBe(0);
    const n = lureOf(g, 10);
    expect(n).toBeGreaterThan(0);
    expect(n).toBeLessThanOrEqual(Math.floor(10 * YARD_RULES.LURE_MAX));
    expect(lureOf(lot(), 10)).toBe(0);
  });
  it('is described for the Defense tab', () => {
    const g = lot(); ring(g); yardAt(g, 55, 30); park(g);
    expect(yardLines(g)[0]).toMatch(/outside the walls/);
  });
});
