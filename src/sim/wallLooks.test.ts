import { describe, expect, it } from 'vitest';
import { newGame, type GameState } from './state';
import { CONTAINER_KINDS, CONTAINER_LOOKS, PERIMETER, PERIMETER_ORDER, PREDATOR_BLOCK, SALVAGE, UPGRADE_NEXT, isContainerKind, planRun, runBill, runStops, type PerimeterKind } from './perimeter';
import { MATERIALS, type MaterialId } from './materials';
import { costPer100m, perimeterTiers, upgradeChain } from './guidance';
import { DEFAULT_FORTRESS, RING_WALLS, layFortress, planFortress } from './fortress';
import { WALL_CHOICES, layPropertyWall, planPropertyWall } from './propertyWall';
import { canHostWalkway } from './walkway';
import { enclosure } from './enclosure';
import { migrate } from './save/migrations';
import { SAVE_VERSION } from './state';
import type { Pt } from './perimeter';

const unit = (k: PerimeterKind) => (Object.entries(PERIMETER[k].materials) as Array<[MaterialId, number]>).reduce((a, [m, q]) => a + (MATERIALS[m].price ?? 0) * q, 0);
const game = (seed = 7): GameState => { const g = newGame(seed); g.site = { ...g.site, creek: false }; return g; };
const geoFor = (g: GameState) => { const h = g.site.home, z = (h.z0 + h.z1) / 2; return { roadGate: [h.x1, z + 4] as Pt }; };

describe('wall materials: one price table', () => {
  it('stacked containers cost twice a single row and stand twice as high; stone is a real wall in between', () => {
    expect(unit('container_stack')).toBe(2 * unit('container_wall'));
    expect(PERIMETER.container_stack.height).toBeCloseTo(2 * PERIMETER.container_wall.height, 1);
    expect(PERIMETER.container_stack.blocks.people).toBeGreaterThan(PERIMETER.container_wall.blocks.people);
    expect(unit('stone_wall')).toBeGreaterThan(unit('log_palisade'));
    expect(unit('stone_wall')).toBeLessThan(unit('concrete_wall'));
    expect(PERIMETER.stone_wall.blocks.people).toBeGreaterThan(PERIMETER.log_palisade.blocks.people);
    expect(PERIMETER.stone_wall.blocks.people).toBeLessThanOrEqual(PERIMETER.concrete_wall.blocks.people);
    for (const k of ['stone_wall', 'container_stack'] as const) { expect(costPer100m(k)).toBeGreaterThan(0); expect(PERIMETER_ORDER).toContain(k); expect(PREDATOR_BLOCK[k]).toBe(1); expect(PERIMETER[k].hours).toBeGreaterThan(0); }
  });

  it('the palisade upgrades to stone: it costs real money, more than the half salvaged, and the tiers rise', () => {
    expect(UPGRADE_NEXT.log_palisade).toBe('stone_wall');
    const net = unit('stone_wall') - SALVAGE * unit('log_palisade');
    expect(net).toBeGreaterThan(0);
    expect(net).toBeGreaterThanOrEqual(unit('stone_wall') * 0.5);
    expect(PERIMETER.stone_wall.blocks.people).toBeGreaterThanOrEqual(PERIMETER.log_palisade.blocks.people);
    expect(upgradeChain('log_palisade')).toEqual(['log_palisade', 'stone_wall']);
    // the old chain is untouched
    expect(UPGRADE_NEXT.container_wall).toBe('steel_wall');
  });

  it('shows in the Perimeter list by price tier', () => {
    const all = perimeterTiers().flatMap(t => t.kinds);
    expect(all).toContain('stone_wall');
    expect(all).toContain('container_stack');
    expect(WALL_CHOICES).toContain('stone_wall');
  });

  it('a stone wall holds the property line like any wall, and a stack takes a deck', () => {
    const g = game();
    const plan = planPropertyWall(g, 'stone_wall', geoFor(g));
    layPropertyWall(g, plan, geoFor(g));
    for (const r of g.perimeter) r.finishedAt = 0;
    expect(enclosure(g).openShare).toBeLessThan(0.1);
    expect(runStops(g.perimeter[0], 'people', 0)).toBeCloseTo(PERIMETER.stone_wall.blocks.people);
    expect(canHostWalkway('stone_wall')).toBe(true);
    expect(canHostWalkway('container_stack')).toBe(true);
    expect(runBill('stone_wall', 6)).toEqual({ fieldstone: 24, lumber: 2, concrete: 6 });
  });
});

describe('container paint', () => {
  it('there is a palette, containers are the only kinds that take it', () => {
    expect(CONTAINER_LOOKS.map(l => l.id)).toEqual(['black', 'rust', 'red', 'blue', 'green', 'tan', 'mixed']);
    expect(CONTAINER_KINDS.every(isContainerKind)).toBe(true);
    expect(isContainerKind('stone_wall')).toBe(false);
  });

  it('Wall my property and Fortify my ring lay their runs with the chosen paint; it changes nothing about the price or the strength', () => {
    const g = game();
    const a = planPropertyWall(g, 'container_wall', geoFor(g), { look: 'rust' }), b = planPropertyWall(g, 'container_wall', geoFor(g), { look: 'black' });
    expect(a.cost).toBe(b.cost);
    expect(a.runs.filter(r => r.kind === 'container_wall').every(r => r.look === 'rust')).toBe(true);
    layPropertyWall(g, a, geoFor(g));
    expect(g.perimeter.filter(r => r.kind === 'container_wall').every(r => r.look === 'rust')).toBe(true);
    const g2 = game();
    const p = planFortress(g2, geoFor(g2), { ...DEFAULT_FORTRESS, look: 'tan' });
    layFortress(g2, p);
    expect(g2.perimeter.find(r => r.kind === 'container_wall')?.look).toBe('tan');
  });

  it('the ring can be built in any of its walls; the deck, the garage and the towers follow', () => {
    for (const wall of RING_WALLS) {
      const g = game();
      const p = planFortress(g, geoFor(g), { ...DEFAULT_FORTRESS, wall });
      expect(p.wall.kind).toBe(wall);
      expect(p.walkwayLen, wall).toBeGreaterThan(0);
      layFortress(g, p);
      expect(g.perimeter.some(r => r.kind === wall), wall).toBe(true);
    }
  });

  it('is optional on a run: an older save without it still loads, the paint just reads as mixed', () => {
    const g = game();
    planRun(g, 'container_wall', [[0, 0], [10, 0]]);
    expect(g.perimeter[0].look).toBeUndefined();
    const back = migrate(JSON.parse(JSON.stringify(g)));
    expect(back.perimeter[0].look).toBeUndefined();
    expect(back.version).toBe(SAVE_VERSION);
  });
});
