/**
 * Nobody floats (user rule, stated as fact: nobody is elevated unless there is something to stand on). Real sim raids on several wall types, staged and prepared
 * as the game does; every actor is sampled on every step of the playback and any height above the ground must be a real surface under them: a drawn fighting
 * step, a building's upper floor or a tower, or a ladder prop (an animated climb on a visible ladder). And the sim grants an elevated post only where the
 * surface is drawn.
 */
import { describe, expect, it } from 'vitest';
import { scenes, prepared, yardSolid, HOUSE } from './cutFixtures';
import { walkBattle } from './cutNav';
import { navFor } from './cutLive';
import { stepSegments, stepHeightAt } from './standingSurfaces';
import { fireBoxesOf } from './lineOfFire';
import type { Battle } from './battleTypes';
import type { GameState } from './state';

const WALLS = ['log_palisade', 'stone_wall', 'container_wall', 'steel_wall'] as const;

/** Every sample where someone is above the ground with nothing under them. */
function floaters(b: Battle, g: GameState): string[] {
  const steps = stepSegments(g.perimeter), boxes = fireBoxesOf(g).filter(x => x.kind === 'building');
  const ladders = b.events.filter((e): e is Extract<typeof e, { kind: 'ladder' }> => e.kind === 'ladder');
  const bad: string[] = [];
  walkBattle(b, navFor(b, yardSolid(g, [HOUSE], 0.012)), {
    route: false,
    onStep: (id, t, _a, c, y) => {
      if (y < 0.04) return;
      const step = stepHeightAt(steps, c.x, c.z);
      if (step !== null && y <= step + 0.03) return;
      if (boxes.some(bx => c.x >= bx.x0 - 0.1 && c.x <= bx.x1 + 0.1 && c.z >= bx.z0 - 0.1 && c.z <= bx.z1 + 0.1 && y <= bx.h + 0.05)) return;
      for (const l of ladders) {
        if (l.t > t + 0.01) continue;
        // on the ladder: near its line, and no higher than the fraction of the climb he has made
        const dx = l.x - l.fx, dz = l.z - l.fz, len = Math.hypot(dx, dz) || 1, u = ((c.x - l.fx) * dx + (c.z - l.fz) * dz) / (len * len);
        const px = l.fx + dx * u, pz = l.fz + dz * u, off = Math.hypot(c.x - px, c.z - pz);
        if (u >= -0.1 && u <= 1.15 && off < 0.07 && y <= l.h * Math.max(0, Math.min(1, u)) + 0.1) return;
      }
      if (bad.length < 8) bad.push(`${id} at t=${t.toFixed(2)} (${c.x.toFixed(2)}, ${c.z.toFixed(2)}) y=${y.toFixed(2)}`);
    },
  });
  return bad;
}

describe('nobody floats', () => {
  const cases: Array<[string, number, 'gang' | 'looters' | 'militia', number, 'desperate' | 'hard' | 'savage']> = [
    ['night raid', 2.25, 'looters', 6, 'desperate'], ['night gang', 2.25, 'gang', 10, 'hard'], ['day raid', 12.5, 'gang', 8, 'hard'], ['invasion', 2.25, 'gang', 12, 'savage'],
  ];
  for (const wall of WALLS) for (const [label, hour, kind, size, temper] of cases) for (const seed of [3, 5, 8]) {
    it(`${wall}, ${label}, seed ${seed}: every actor stands on something`, () => {
      const { g, battles } = scenes(seed, hour, kind, size, temper, wall);
      for (const b of battles) {
        const out = prepared(b, g, seed * 17);
        expect(floaters(out, g), `${wall} ${label} s${seed}`).toEqual([]);
      }
    }, 90000);
  }
});

describe('the checker is not vacuous', () => {
  it('takes the ladders away and the climbers float', () => {
    let climbs = 0, flagged = 0;
    for (const seed of [3, 5, 8]) {
      const { g, battles } = scenes(seed, seed % 2 ? 2.25 : 12.5, 'looters', 8, 'hard', 'log_palisade');
      for (const b of battles) {
        const out = prepared(b, g, seed * 17);
        climbs += out.events.filter(e => e.kind === 'ladder').length;
        flagged += floaters({ ...out, events: out.events.filter(e => e.kind !== 'ladder') }, g).length;
      }
    }
    expect(climbs, 'ladders staged').toBeGreaterThan(0);
    expect(flagged, 'floaters without ladders').toBeGreaterThan(0);
  }, 120000);
});

describe('the sim grants an elevated shot only where a surface is drawn', () => {
  it('a defender is put up on a wall only where a fighting step stands there; a plain wall gets none', () => {
    let elevated = 0, plainElevated = 0;
    for (const wall of WALLS) for (const seed of [1, 2, 3, 4]) {
      const { g, battles } = scenes(seed, 2.25, 'gang', 10, 'hard', wall);
      const steps = stepSegments(g.perimeter), boxes = fireBoxesOf(g).filter(x => x.kind === 'building');
      for (const b of battles) for (const e of b.events) {
        if (e.kind !== 'move' || !((e.y ?? 0) > 0.05)) continue;
        const u = b.units.find(x => x.id === e.unit);
        if (!u || u.side !== 'home') continue;
        const onStep = stepHeightAt(steps, e.x, e.z) !== null, inBuilding = boxes.some(bx => e.x >= bx.x0 - 0.1 && e.x <= bx.x1 + 0.1 && e.z >= bx.z0 - 0.1 && e.z <= bx.z1 + 0.1);
        expect(onStep || inBuilding, `${wall} s${seed}: ${e.unit} at ${e.x},${e.z} y=${e.y}`).toBe(true);
        if (onStep) elevated++;
        if (wall === 'steel_wall' && onStep) plainElevated++;
      }
    }
    expect(plainElevated).toBe(0);
    expect(elevated).toBeGreaterThan(0);
  }, 180000);
  it('the step exists exactly on the walls that come with one, inside the loop, and not across a gate', () => {
    const { g } = scenes(1, 2.25, 'gang', 6, 'hard', 'log_palisade');
    const segs = stepSegments(g.perimeter);
    expect(segs.length).toBeGreaterThan(0);
    // the loop is +-10: the step is just inside the east wall (x < 10), never outside it
    expect(stepHeightAt(segs, 10 - 0.2, 0)).not.toBeNull();
    expect(stepHeightAt(segs, 10 + 0.2, 0)).toBeNull();
    // the gate (15 along the first side = x 5, z -10, 2 wide) is open ground
    expect(stepHeightAt(segs, 5, -10 + 0.2)).toBeNull();
    expect(stepSegments(scenes(1, 2.25, 'gang', 6, 'hard', 'steel_wall').g.perimeter)).toEqual([]);
  });
});
