import { describe, expect, it } from 'vitest';
import { newGame, type GameState } from './state';
import { BLUEPRINTS } from './blueprints';
import { hasForge } from './farm';
import { improvise, kitOf, repair, repairPlan, REPAIR_TOLL } from './tools';
import { KIT } from '../game/buildkit/kit';

const game = (forge: boolean): GameState => {
  const g = newGame(2);
  g.stock.hardware = 0;
  if (forge) g.structures.push({ id: 'fg', kind: 'forge', x: 20, z: 20, rot: 0, stage: BLUEPRINTS.forge.stages.length, done: 0, supplied: true, finishedAt: 0 });
  return g;
};
const withTool = (g: GameState, cond: number) => { const kit = kitOf(g); kit.items.length = 0; kit.items.push({ id: 't1', kind: 'hammer', cond, max: 1, sharp: 1, repairs: 0 } as never); };

describe('the forge', () => {
  it('is a real building: a blueprint, a kit piece and a finished forge counts', () => {
    expect(BLUEPRINTS.forge.stages.length).toBe(5);
    expect(KIT.forge.cellsX).toBe(2);
    expect(hasForge(game(false))).toBe(false);
    expect(hasForge(game(true))).toBe(true);
  });
  it('mends a tool from scrap iron with no hardware, where the bare place cannot', () => {
    const a = game(false); withTool(a, 0.2);
    expect(repairPlan(a, 't1').ok).toBe(false);
    const b = game(true); withTool(b, 0.2);
    const plan = repairPlan(b, 't1');
    expect(plan.ok).toBe(true); expect(plan.uses).toMatch(/forge/);
    expect(repair(b, 't1')).toBeNull();
    expect(b.stock.hardware).toBe(0);
  });
  it('the repair leaves the tool stronger than a bench alone: a lighter toll', () => {
    const a = game(true); withTool(a, 0.2); repair(a, 't1');
    expect(kitOf(a).items[0].max).toBeGreaterThan(1 - REPAIR_TOLL);
  });
  it('improvised steel tools come out tempered (0.9) without hardware', () => {
    const a = game(false); expect(improvise(a, 'cut').cond).toBeLessThan(0.7);
    const b = game(true); expect(improvise(b, 'cut').cond).toBeCloseTo(0.9);
  });
});
