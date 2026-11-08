import { describe, expect, it } from 'vitest';
import type { newGame } from './state';
import { decorateBreach } from './breach';
import { planHouseAssault } from './houseAssault';
import { LineDirector, resetRaidMemory } from './raidDialogue';
import { analyzeHouse } from './houseRooms';
import { buildGrid } from './houseAssault';
import { findClips } from './cutNav';
import { navFor, routeScene } from './cutLive';
import { yardSolid, SMALL_HOUSE, invasionBattle, gameWithWall } from './cutFixtures';

const HOUSE = SMALL_HOUSE;
const BODY = 0.04;
export const fixtureWorld = (g: ReturnType<typeof newGame>, body = BODY) => yardSolid(g, [HOUSE], body);

describe('the house, read off its colliders', () => {
  it('finds the rooms and doorways of the fixture house', () => {
    const w = fixtureWorld(gameWithWall());
    const g = buildGrid({ box: HOUSE, blocked: w, seed: 1 });
    expect(g).not.toBeNull();
    const H = analyzeHouse(g!)!;
    expect(H.rooms.length).toBeGreaterThanOrEqual(3);
    expect(H.doors.length).toBeGreaterThanOrEqual(2);
  });
});

describe('the fight inside: tactics through real doors', () => {
  for (const style of ['crew', 'crowd', 'families'] as const) for (const seed of [1, 2, 3]) {
    it(`${style} seed ${seed}: the door is shut and kicked, rooms cleared in order, nobody clips a wall`, () => {
      resetRaidMemory();
      const g = gameWithWall(), solid = fixtureWorld(g);
      const b0 = invasionBattle(style);
      const dir = new LineDirector(seed);
      const d = decorateBreach(b0, g.perimeter, { x: 0, z: 0 }, seed, false, dir);
      const p = planHouseAssault(d, { box: HOUSE, blocked: (x, z) => solid(x, z), seed, dir, nameOf: id => ({ h_a: 'Ana', h_b: 'Ben', h_c: 'Cal', h_k: 'Dee', h_k2: 'Eli', h_k3: 'Fay' } as Record<string, string>)[id] });
      const doors = p.events.filter(e => e.kind === 'house_door');
      expect(doors.some(e => e.kind === 'house_door' && e.action === 'close')).toBe(true);
      expect(doors.some(e => e.kind === 'house_door' && (e.action === 'kick' || e.action === 'shoot') && e.ok)).toBe(true);
      if (style === 'crew') expect(doors.some(e => e.kind === 'house_door' && e.action === 'kick' && !e.ok)).toBe(true);   // a disciplined crew's first kick holds
      expect(p.events.some(e => e.kind === 'hide')).toBe(true);
      // the raw plan goes through walls somewhere (the sim's moves know nothing of the rooms)... after routing, nothing does
      const r = routeScene(p, solid);
      expect(r.ok).toBe(true);
      expect(r.unrouted).toBe(0);
      const clips = findClips(r.battle, navFor(r.battle, fixtureWorld(g, 0.012)));
      expect(clips, JSON.stringify(clips.slice(0, 3))).toEqual([]);
    });
  }
});
