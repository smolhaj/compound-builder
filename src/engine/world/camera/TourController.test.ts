import { describe, it, expect } from 'vitest';
import {
  slideMove, followGround, boxBlocker, anyBlocked, findFreeSpot, pushOutOfBoxes, walkBlocker, pickTourStops,
  buildCinematicPath, captionStopAt, occlusionScore, TOUR_EYE_HEIGHT, TOUR_BODY_RADIUS,
  type TourBuildingInfo, type TourBox,
  type SiteBlockedFn,
} from './TourController';

/** Site test: a building at (10..14, 10..14), a creek at x 20..24, a walkable path; outside 0..40 blocked. */
function makeMask(): SiteBlockedFn {
  const rects: Array<[number, number, number, number]> = [[10, 10, 14, 14], [20, 0, 24, 40]];
  return (x, z, r) => {
    if (x - r < 0 || z - r < 0 || x + r > 40 || z + r > 40) return true;
    return rects.some(([x0, z0, x1, z1]) => x + r > x0 && x - r < x1 && z + r > z0 && z - r < z1);
  };
}

const box = (x0: number, z0: number, x1: number, z1: number, h: number): TourBox =>
  ({ minX: x0, minY: 0, minZ: z0, maxX: x1, maxY: h, maxZ: z1 });

const info = (id: string, defId: string, b: TourBox, extra: Partial<TourBuildingInfo> = {}): TourBuildingInfo => ({
  id, defId, name: id, typeName: defId, tier: 1, builtDay: 0, historic: false, solid: true, box: b, ...extra,
});

describe('TourController — walking collision', () => {
  it('walks freely across open ground and paths', () => {
    const blocked = walkBlocker(makeMask());
    const p = slideMove(2, 2, 3, 0, blocked);
    expect(p.x).toBeCloseTo(5, 5);
    expect(p.z).toBeCloseTo(2, 5);
    const q = slideMove(2, 31, 4, 0, blocked);
    expect(q.x).toBeCloseTo(6, 5);
  });

  it('stops at a building wall instead of walking through it', () => {
    const blocked = walkBlocker(makeMask());
    const p = slideMove(8, 12, 6, 0, blocked); // head-on into the block at x=10
    expect(p.x).toBeLessThan(10 - TOUR_BODY_RADIUS + 0.01);
    expect(p.x).toBeGreaterThan(9);
    expect(p.z).toBeCloseTo(12, 5);
  });

  it('slides along a wall when moving diagonally into it', () => {
    const blocked = walkBlocker(makeMask());
    const p = slideMove(9.5, 11, 2, 2, blocked); // diagonal into the west face
    expect(p.x).toBeLessThan(10);
    expect(p.z).toBeGreaterThan(12.5); // kept moving along the wall
  });

  it('cannot walk into water or off the lot', () => {
    const blocked = walkBlocker(makeMask());
    expect(slideMove(18, 5, 5, 0, blocked).x).toBeLessThan(20);
    expect(slideMove(1, 5, -5, 0, blocked).x).toBeGreaterThanOrEqual(0);
  });

  it('refuses ground steeper than the max grade but climbs gentle slopes', () => {
    const free = () => false;
    const cliff = (x: number) => (x > 5 ? 3 : 0);          // 3-unit wall at x=5
    const ramp = (x: number) => Math.max(0, (x - 5) * 0.3); // gentle 0.3 grade
    expect(slideMove(4, 0, 3, 0, free, cliff).x).toBeLessThanOrEqual(5.01);
    expect(slideMove(4, 0, 3, 0, free, ramp).x).toBeCloseTo(7, 5);
  });
});

describe('TourController — building overhangs', () => {
  it('keeps the walker off facades that overhang the grid footprint', () => {
    const mask = makeMask();
    // Portico sticking 1.2 units out of the west face of the block at x=10
    const blocked = anyBlocked(walkBlocker(mask), boxBlocker([box(8.8, 10, 14, 14, 3)], 0.2));
    const p = slideMove(6, 12, 4, 0, blocked);
    expect(p.x).toBeLessThanOrEqual(8.6);
    expect(p.x).toBeGreaterThan(8.3);
    expect(blocked(5, 5)).toBe(false);
  });
});

describe('TourController — ground following', () => {
  it('converges to ground + eye height and never sinks below half the eye height', () => {
    let y = 5;
    for (let i = 0; i < 120; i++) y = followGround(y, 1, 1 / 60);
    expect(y).toBeCloseTo(1 + TOUR_EYE_HEIGHT, 3);
    // Sudden rise: the eye is immediately lifted to at least half-eye above the new ground
    y = followGround(1 + TOUR_EYE_HEIGHT, 2, 1 / 60);
    expect(y).toBeGreaterThanOrEqual(2 + TOUR_EYE_HEIGHT * 0.5);
  });

  it('snaps from an undefined start', () => {
    expect(followGround(NaN, 0.4, 0.016)).toBeCloseTo(0.4 + TOUR_EYE_HEIGHT);
  });
});

describe('TourController — spawn + drone collision', () => {
  it('finds the nearest free spot outside a building', () => {
    const blocked = walkBlocker(makeMask(), TOUR_BODY_RADIUS * 2);
    const p = findFreeSpot(12, 12, blocked)!;
    expect(p).not.toBeNull();
    expect(blocked(p.x, p.z)).toBe(false);
    expect(Math.hypot(p.x - 12, p.z - 12)).toBeLessThan(4);
  });

  it('pushes the drone out of a building box along the shallowest axis', () => {
    const b = box(10, 10, 14, 14, 6);
    const side = pushOutOfBoxes({ x: 10.2, y: 2, z: 12 }, [b], 0.3);
    expect(side.x).toBeCloseTo(9.7);
    const top = pushOutOfBoxes({ x: 12, y: 5.9, z: 12 }, [b], 0.3);
    expect(top.y).toBeCloseTo(6.3);
    const clear = pushOutOfBoxes({ x: 5, y: 2, z: 5 }, [b], 0.3);
    expect(clear).toEqual({ x: 5, y: 2, z: 5 });
  });
});

describe('TourController — cinematic tour', () => {
  const infos = [
    info('home', 'cabin', box(0, 0, 6, 6, 5), { highlight: 'The homestead' }),
    info('tower', 'watchtower', box(20, 0, 26, 6, 14)),
    info('barn', 'barn', box(0, 30, 16, 44, 4)),
    info('new', 'bunkhouse', box(30, 30, 34, 34, 3), { builtDay: 120 }),
    info('old', 'shed', box(40, 0, 44, 4, 3), { builtDay: 1, historic: true }),
    info('beds', 'garden_bed', box(50, 50, 54, 54, 4), { solid: false }),
  ];

  it('picks the landmarks with reasons and skips open lots', () => {
    const stops = pickTourStops(infos);
    const reasons = new Map(stops.map(s => [s.info.id, s.reason]));
    expect(reasons.get('home')).toBe('The homestead');
    expect(reasons.get('tower')).toMatch(/tallest/i);
    expect(reasons.get('barn')).toMatch(/largest/i);
    expect(reasons.get('new')).toMatch(/newest/i);
    expect(reasons.get('old')).toMatch(/oldest/i);
    expect(reasons.has('beds')).toBe(false);
    expect(stops[0].info.id).toBe('home');
    expect(new Set(stops.map(s => s.info.id)).size).toBe(stops.length);
  });

  it('respects the stop limit and returns nothing for an empty lot', () => {
    expect(pickTourStops(infos, 3)).toHaveLength(3);
    expect(pickTourStops([])).toEqual([]);
  });

  it('builds a closed path that stays above ground and captions each stop', () => {
    const stops = pickTourStops(infos);
    const path = buildCinematicPath(stops, { x: 25, z: 25 }, () => 0)!;
    expect(path.segs).toHaveLength(stops.length * 3);
    for (let i = 0; i <= 40; i++) {
      const p = path.pos.getPointAt(i / 40);
      expect(Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z)).toBe(true);
      expect(p.y).toBeGreaterThan(0.5);
    }
    // Dwell segments caption their own stop; transit hands over to the next
    expect(captionStopAt(path, 0, 0.5)).toBe(0);
    expect(captionStopAt(path, 2, 0.1)).toBe(0);
    expect(captionStopAt(path, 2, 0.5)).toBeNull();
    expect(captionStopAt(path, 2, 0.9)).toBe(1 % stops.length);
  });

  it('scores blocked sight lines and frames buildings from a clear side', () => {
    const target = box(20, 20, 24, 24, 4);
    const wall = box(10, 14, 18, 30, 12); // tall block on the west (site-centre) side
    expect(occlusionScore({ x: 8, y: 5, z: 22 }, { x: 22, y: 2, z: 22 }, [wall, target], target)).toBeGreaterThan(0);
    expect(occlusionScore({ x: 36, y: 5, z: 22 }, { x: 22, y: 2, z: 22 }, [wall, target], target)).toBe(0);
    const path = buildCinematicPath([{ info: info('t', 'cabin', target), reason: 'x' }], { x: 0, z: 22 }, () => 0, [wall, target])!;
    const mid = path.pos.points[1];
    expect(occlusionScore(mid, { x: 22, y: 1.6, z: 22 }, [wall, target], target)).toBe(0);
    expect(mid.x).toBeGreaterThan(18); // not behind the wall
  });
});
