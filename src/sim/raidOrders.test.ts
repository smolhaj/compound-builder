import { describe, expect, it } from 'vitest';
import { ORDER_FX, STAGES, STAGE_COVER, exposedBeyond, nextStage, orderAt, stageRadius } from './raidOrders';
import { newGame } from './state';

describe('the family\'s orders', () => {
  it('the order in force is the latest one given; none means hold', () => {
    expect(orderAt(undefined, 5)).toBe('hold'); expect(orderAt([], 5)).toBe('hold');
    const o = [{ t: 0, order: 'fallback' as const }, { t: 30, order: 'counter' as const }];
    expect(orderAt(o, 0)).toBe('fallback'); expect(orderAt(o, 29.9)).toBe('fallback'); expect(orderAt(o, 30)).toBe('counter'); expect(orderAt(o, 200)).toBe('counter');
    expect(orderAt([{ t: 10, order: 'counter' }], 3)).toBe('hold');
  });
  it('holding changes nothing; falling back is better cover and a pause; a counterattack hits harder, is hit harder, and shakes the crew', () => {
    expect(ORDER_FX.hold).toEqual({ acc: 1, hit: 1, morale: 1, move: 0 });
    expect(ORDER_FX.fallback.hit).toBeLessThan(1); expect(ORDER_FX.fallback.move).toBeGreaterThan(0);
    expect(ORDER_FX.counter.acc).toBeGreaterThan(1); expect(ORDER_FX.counter.hit).toBeGreaterThan(1); expect(ORDER_FX.counter.morale).toBeLessThan(1);
  });
  it('the stages run wall, yard, house; the house is the best cover; the line moves in', () => {
    expect(STAGES).toEqual(['wall', 'yard', 'house']);
    expect(nextStage('wall')).toBe('yard'); expect(nextStage('yard')).toBe('house'); expect(nextStage('house')).toBe('house');
    expect(STAGE_COVER.house).toBeLessThan(STAGE_COVER.yard); expect(STAGE_COVER.yard).toBeLessThan(STAGE_COVER.wall);
    expect(stageRadius('wall', 20)).toBe(20); expect(stageRadius('yard', 20)).toBe(10); expect(stageRadius('house', 20)).toBeLessThan(stageRadius('yard', 20));
  });
  it('what stands beyond the line is exposed once the family gives it up', () => {
    const g = newGame(1);
    g.structures.push({ id: 'b', kind: 'barn', x: 14, z: 0, rot: 0, stage: 99, done: 0, supplied: true, finishedAt: 0 }, { id: 'c', kind: 'root_cellar', x: 1, z: 1, rot: 0, stage: 99, done: 0, supplied: true, finishedAt: 0 });
    expect(exposedBeyond(g, { x: 0, z: 0 }, 'wall', 20)).toEqual({ animals: 0, stores: 0 });
    expect(exposedBeyond(g, { x: 0, z: 0 }, 'yard', 20).animals).toBe(1);
    expect(exposedBeyond(g, { x: 0, z: 0 }, 'house', 20)).toEqual({ animals: 1, stores: 0 });
  });
});
