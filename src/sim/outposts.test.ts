import { afterEach, describe, expect, it } from 'vitest';
import { newGame, type GameState, type Structure } from './state';
import { CLASSIC } from './site';
import { setGroundOverride } from './terrainState';
import { AIRLIFT_USD, AIRLIFT_INSURED, airliftBill, airliftCase, airliftReady, hasHelipad, VILLAGE_WATCH, villageWatch, RAISED_KINDS } from './outposts';
import { BLUEPRINTS, totalBill, totalHours, isHome } from './blueprints';
import { MATERIALS, type MaterialId } from './materials';
import { medicalDay, startCase, casesOf } from './medical';
import { postureOf } from './encounters';
import { capacity } from './housing';
import { floodCandidates } from './terrainFx';
import { TOWERS, isTower, towerPosture } from './towers';
import { needsPermit } from './paperwork';
import { KIT } from '../game/buildkit/kit';

afterEach(() => setGroundOverride(null));
const game = (): GameState => newGame(5, 105, 2027, { site: CLASSIC });
const built = (g: GameState, id: string, kind: string, x = 30, z = 30): Structure => { const st: Structure = { id, kind, x, z, rot: 0, stage: 9, done: 0, supplied: true, finishedAt: 0 }; g.structures.push(st); return st; };

describe('the cabin village', () => {
  it('twelve bunks for guests, and the outer cabins hear the drive', () => {
    const g = game();
    const before = capacity(g);
    built(g, 'v', 'cabin_village');
    expect(capacity(g).bunks).toBe(before.bunks + 12);
    expect(villageWatch(g)).toBeGreaterThan(0);
    const base = game(); const d0 = postureOf(base).detection, d1 = postureOf(g).detection;
    expect(d1).toBeGreaterThanOrEqual(d0 + VILLAGE_WATCH / 2);
    expect(villageWatch(base)).toBe(0);
  });
});

describe('the helipad', () => {
  it('the air ambulance needs a pad, a working county and a bad enough case, and bills the family', () => {
    const g = game(); g.disaster.tracks.medical = 1; g.disaster.tracks.banks = 1; g.disaster.tracks.law = 1;
    expect(airliftReady(g)).toBe(false);
    built(g, 'h', 'helipad');
    expect(hasHelipad(g)).toBe(true);
    expect(airliftReady(g)).toBe(true);
    expect(airliftBill(g)).toBe(Math.round(AIRLIFT_USD * (g.paper.insured ? AIRLIFT_INSURED : 1)));
    g.paper.insured = false; expect(airliftBill(g)).toBe(AIRLIFT_USD);
    expect(airliftCase('wound', 70)).toBe(true);
    expect(airliftCase('wound', 40)).toBe(false);
    expect(airliftCase('fracture', 45, 'wrist')).toBe(false);
    expect(airliftCase('fracture', 55, 'leg')).toBe(true);
    g.disaster.tracks.medical = 0.2;
    expect(airliftReady(g)).toBe(false);
  });

  it('a deep wound is flown out and closed; without the pad it stays with the family', () => {
    const run = (pad: boolean) => {
      const g = game(); g.disaster.tracks.medical = 1; g.disaster.tracks.banks = 1; g.disaster.tracks.law = 1; g.money = 200_000;
      if (pad) built(g, 'h', 'helipad');
      startCase(g, g.people[0].id, 'wound', 75, {}, 'shot in the leg');
      const out = medicalDay(g);
      return { g, out };
    };
    const a = run(true), b = run(false);
    expect(a.out.join(' ')).toMatch(/flown out/);
    expect(a.g.money).toBeLessThan(200_000);
    expect(casesOf(a.g, a.g.people[0].id).length).toBe(0);
    expect(b.out.join(' ')).not.toMatch(/flown out/);
  });
});

describe('the tower pod', () => {
  it('is a stand-alone tower with the longest sight and the worst cover', () => {
    expect(isTower('tower_pod')).toBe(true);
    const pod = TOWERS.tower_pod, wood = TOWERS.watchtower_wood, conc = TOWERS.watchtower_concrete;
    expect(pod.view).toBeGreaterThan(conc.view);
    expect(pod.viewR).toBeGreaterThan(conc.viewR);
    expect(pod.post.cover).toBeLessThan(wood.post.cover);
    const g = game(); const before = towerPosture(g).detection;
    built(g, 'p', 'tower_pod');
    expect(towerPosture(g).detection).toBeGreaterThanOrEqual(before + pod.view);
  });
});

describe('the stilted house', () => {
  it('is a home that sleeps four, stands on a slope the others cannot, and a flood goes under it', () => {
    expect(isHome('stilted_house')).toBe(true);
    expect(KIT.stilted_house.maxSlope).toBeGreaterThan(KIT.timber_cabin.maxSlope);
    expect(KIT.stilted_house.stilts).toBe(true);
    expect(RAISED_KINDS).toContain('stilted_house');
    // a creek at z = 30 and a low bench: a grounded house at (30, 32) floods, the stilted one does not
    const g = game(); g.site = { ...g.site, creek: true };
    setGroundOverride({ h: (_x, z) => 0.05 * Math.abs(z - 30), creek: { zAt: () => 30, waterY: () => -0.1, halfWidth: 0.7 } });
    const house = built(g, 'a', 'timber_cabin', 30, 32), stilts = built(g, 'b', 'stilted_house', 40, 32);
    const hit = floodCandidates(g, [house, stilts]).map(x => x.id);
    expect(hit).toContain('a');
    expect(hit).not.toContain('b');
    expect(capacity(g).beds).toBeGreaterThanOrEqual(4);
  });
});

describe('priced from the table and staged', () => {
  it('each has a real bill, five stages, a permit', () => {
    const cost = (k: string) => Object.entries(totalBill(BLUEPRINTS[k])).reduce((a, [m, n]) => a + (MATERIALS[m as MaterialId].price ?? 0) * n, 0);
    const want: Record<string, [number, number]> = { cabin_village: [20_000, 40_000], helipad: [6_000, 14_000], tower_pod: [10_000, 22_000], stilted_house: [18_000, 34_000] };
    for (const [k, [lo, hi]] of Object.entries(want)) {
      expect(BLUEPRINTS[k].stages, k).toHaveLength(5);
      expect(cost(k), k).toBeGreaterThan(lo); expect(cost(k), k).toBeLessThan(hi);
      expect(needsPermit(k), k).toBe(true);
      for (const m of Object.keys(totalBill(BLUEPRINTS[k]))) expect(MATERIALS[m as MaterialId].price, m).not.toBeNull();
    }
    expect(totalHours(BLUEPRINTS.cabin_village)).toBeGreaterThan(600);
  });
});
