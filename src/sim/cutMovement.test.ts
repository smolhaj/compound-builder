/**
 * The hard movement rule over whole generated scenes (user: nobody clips a wall, a closed door, furniture or another building). Real raid sims
 * (night raid, day raid, an invasion that breaks the line), staged exactly as the game stages them (sim/raidCutscene.ts, then the cutscene's own
 * prepare: breach look, house assault, movement router), on a fixture yard (the game's wall runs with their gate, a hollow house with a door,
 * partitions and a table). Any step that crosses something solid fails the test.
 */
import { describe, expect, it } from 'vitest';
import type { Encounter } from './encounters';
import { navFor } from './cutLive';
import { findClips } from './cutNav';
import { yardSolid, HOUSE, scenes, prepared as prepare } from './cutFixtures';

describe('nobody clips: whole generated scenes, routed through the openings', () => {
  const cases: Array<[string, number, Encounter['kind'], number, Encounter['temper']]> = [
    ['night raid', 2.25, 'looters', 6, 'desperate'], ['night gang', 2.25, 'gang', 10, 'hard'], ['day raid', 12.5, 'gang', 8, 'hard'], ['day militia', 14, 'militia', 9, 'savage'],
  ];
  for (const [label, hour, kind, size, temper] of cases) for (const seed of [1, 2, 3, 4]) {
    it(`${label}, seed ${seed}`, () => {
      const { g, battles } = scenes(seed, hour, kind, size, temper);
      const solid = yardSolid(g, [HOUSE], 0.012);
      for (const b of battles) {
        const out = prepare(b, g, seed * 17);
        const clips = findClips(out, navFor(out, solid));
        expect(clips, `${label} s${seed}: ${JSON.stringify(clips.slice(0, 2))}`).toEqual([]);
      }
    }, 60000);
  }
  it('an invasion that breaks the line: the door is shut, kicked open, rooms cleared, and nobody clips', () => {
    let invasions = 0, rawClips = 0;
    for (let seed = 1; seed <= 12 && invasions < 3; seed++) {
      const { g, battles } = scenes(seed, 2.25, 'gang', 12, 'savage');
      const last = battles[battles.length - 1];
      if (!last.events.some(e => e.kind === 'breach')) continue;
      const solid = yardSolid(g, [HOUSE], 0.012);
      const out = prepare(last, g, seed * 31);
      // (walls/hide balance pass: a breach that comes so late the fight ends before the crew reaches the house has no door scene to check: that is not an invasion of the house)
      if (!out.events.some(e => e.kind === 'house_door')) continue;
      invasions++;
      const cl = findClips(out, navFor(out, solid));
      expect(cl).toEqual([]);
      expect(out.events.some(e => e.kind === 'house_door' && e.action === 'close')).toBe(true);
      rawClips += findClips(last, navFor(last, solid)).length;
    }
    expect(invasions, 'no seed produced a breach to test').toBeGreaterThan(0);
    // the unrouted sim timeline does cross walls (the checker is not vacuous)
    expect(rawClips).toBeGreaterThan(0);
  }, 120000);
});
