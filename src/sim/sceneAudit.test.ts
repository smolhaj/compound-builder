import { describe, expect, it } from 'vitest';
import { corpus, makeScene, layStarterCompound, layHamlet, sceneProblems, STEEP_LOTS, type SceneSpec } from './sceneAudit';
import { makeLotSite } from './lotListing';
import { REGION_IDS } from './regions';
import { KIT, placementProblem, footprint, type SiteQuery } from '../game/buildkit/kit';
import { improvementSpots } from '../game/buildkit/improvementSpots';
import { fenceLineProblems } from './starterCompound';
import { planPropertyWall } from './propertyWall';
import { newGame } from './state';
import { culvertEnds } from '../game/region/roadWorks';
import { roadPlanFor } from './roadState';
import { animalGoal, doorOf, type Home } from '../game/livestock/livestockPlan';

/**
 * The scene audit (sceneAudit.ts) as CI: real compounds on every region's real listings and on steep, creek, cliff and shore lots, checked for the
 * ways individually sound structures combine badly (a building on water or off the lot, buildings on each other or on a neighbour's retaining wall, a
 * building buried in or hovering over its own pad, a door onto a wall or a cliff, the drive through a house, a fence through the creek, a tree through
 * a house). A failure names the scene (region, listing, lot kind) and the two things that clash: reproduce with
 * `makeScene(listings(seed, region)[k], seed)` or the steep lot's spec.
 */

const fmt = (ps: Array<{ scene: string; what: string; detail: string }>) => ps.map(p => `${p.scene} | ${p.what} | ${p.detail}`);

describe('scene audit: the starter compound on every region\'s listings', () => {
  for (const region of REGION_IDS) {
    it(`${region}: six listings, each with what came with the land and the starter compound laid`, { timeout: 120_000 }, () => {
      const specs = corpus([1], [region]);
      const bad: string[] = [];
      for (const spec of specs) {
        const sc = makeScene(spec.site, spec.seed, spec.label);
        layStarterCompound(sc);
        bad.push(...fmt(sceneProblems(sc)));
      }
      expect(bad).toEqual([]);
    });
  }
});

describe('scene audit: steep, creek, cliff and shore lots', () => {
  const specs: SceneSpec[] = STEEP_LOTS.map((o, i) => ({ label: `steep ${o.region} ${o.kind}`, site: makeLotSite(o), seed: 7 + i }));
  it('the starter compound on 14 steep lots, trees planted round it', { timeout: 180_000 }, () => {
    const bad: string[] = [];
    for (const spec of specs) {
      const sc = makeScene(spec.site, spec.seed, spec.label);
      layStarterCompound(sc);
      bad.push(...fmt(sceneProblems(sc, { trees: true })));
    }
    expect(bad).toEqual([]);
  });
});

describe('scene audit: a hamlet-scale compound', () => {
  const picks = [
    { label: 'hillside creek', site: makeLotSite({ region: 'mountain_west', kind: 'hillside', relief: 10, seed: 3, creek: true }), seed: 7 },
    { label: 'appalachia hillside', site: makeLotSite({ region: 'appalachia', kind: 'hillside', relief: 9, seed: 11, creek: true }), seed: 8 },
    { label: 'pnw bench', site: makeLotSite({ region: 'pnw', kind: 'bench', relief: 8, seed: 5 }), seed: 9 },
  ];
  for (const p of picks) {
    it(`${p.label}: ten more pieces, each where the placement rules put it`, { timeout: 180_000 }, () => {
      const sc = makeScene(p.site, p.seed, `hamlet ${p.label}`);
      layStarterCompound(sc);
      expect(layHamlet(sc, ['barn', 'workshop', 'guest_house', 'chicken_coop', 'greenhouse', 'cistern', 'solar_array', 'sheep_barn', 'cottage', 'metal_garage'])).toBeGreaterThan(3);
      expect(fmt(sceneProblems(sc))).toEqual([]);
    });
  }
});

describe('scene audit: the rules the scenes caught', () => {
  const flat = (blocked: (x: number, z: number) => boolean, water: (x: number, z: number) => boolean = () => false): SiteQuery =>
    ({ height: () => 0, owned: () => true, water, blocked });

  it('a thin drive or creek between the sample points of a big footprint still stops it (the heated greenhouse stood on the county road)', () => {
    const def = KIT.greenhouse_heated, fp = footprint(def, 10, 10, 0, true), mid = (fp.x0 + fp.x1) / 2 + 0.13;
    expect(fp.x1 - fp.x0).toBeGreaterThanOrEqual(1.5);
    expect(placementProblem(def, 10, 10, 0, flat(x => Math.abs(x - mid) < 0.275), [])).toBe('overlaps');
    expect(placementProblem(def, 10, 10, 0, flat(() => false, x => Math.abs(x - mid) < 0.275), [])).toBe('water');
    expect(placementProblem(def, 10, 10, 0, flat(() => false), [])).toBeNull();
  });

  it('what came with the land never has its pad cut into another at a different level (a septic buried a farmhouse corner 3 m)', { timeout: 60_000 }, () => {
    const spec = corpus([2], ['mountain_west']).find(s => s.label.startsWith('mountain_west#2.4'))!;
    const sc = makeScene(spec.site, spec.seed, spec.label);
    layStarterCompound(sc);
    expect(fmt(sceneProblems(sc))).toEqual([]);
    expect(sc.g.structures.some(s => s.kind === 'farmhouse')).toBe(true);
  });

  it('improvementSpots places the house first and keeps every spot legal', () => {
    const g = newGame(3, undefined, undefined, { site: makeLotSite({ kind: 'bench', relief: 6, seed: 2 }) });
    const q: SiteQuery = { height: () => 0, owned: () => true, water: () => false };
    const spots = improvementSpots([{ id: 'a', kind: 'well_drilled' }, { id: 'b', kind: 'timber_cabin' }], q, { x: 30, z: 30 }, []);
    expect(Object.keys(spots).sort()).toEqual(['a', 'b']);
    expect(Math.hypot(spots.b.x - 28.5, spots.b.z - 27.5)).toBeLessThan(9);
    expect(g.structures).toBeDefined();
  });

  it('the starter fence is pulled in off water and cliffs, or reported as a bad line', () => {
    const wetBand: SiteQuery = { height: () => 0, owned: () => true, water: (x, z) => x > 12.4 && x < 13.2 && z < 30 };
    const rect = { x0: 5, z0: 5, x1: 13.5, z1: 12 };
    const core = { x0: 6, z0: 6, x1: 11, z1: 11 };
    expect(fenceLineProblems(rect, core, wetBand)).toBe(0);
    expect(rect.x1).toBeLessThanOrEqual(12.4);
    const hopeless = { x0: 5, z0: 5, x1: 13.5, z1: 12 };
    expect(fenceLineProblems(hopeless, { x0: 6, z0: 6, x1: 13, z1: 11 }, wetBand)).toBeGreaterThan(0);
  });

  it('the herd is turned out only onto ground it can stand on (cows were sent into the next shed, hens into the greenhouse, pigs into the creek)', () => {
    const barn: Home = { id: 'b', kind: 'barn', x: 20, z: 20, rot: 0, w: 3, d: 2, depth: 0 };
    const door = doorOf(barn), neighbour = { x0: door.x - 2, x1: door.x + 2, z0: door.z + 0.9, z1: door.z + 4 };
    const free = (x: number, z: number) => !(x > neighbour.x0 && x < neighbour.x1 && z > neighbour.z0 && z < neighbour.z1);
    const ctx = { hour: 12, raided: false, storm: false, house: [20, 20] as [number, number] };
    let raw = 0;
    for (let i = 0; i < 40; i++) {
      const a = { id: `cow${i}`, kind: 'cow' as const };
      const g0 = animalGoal(a, [barn], { ...ctx, clock: i * 0.5 }), g1 = animalGoal(a, [barn], { ...ctx, clock: i * 0.5 }, undefined, free);
      if (!free(g0.x, g0.z)) raw++;
      expect(free(g1.x, g1.z)).toBe(true);
    }
    expect(raw).toBeGreaterThan(3);
    // nowhere free at all: at the door, never in the wall
    const g = animalGoal({ id: 'cow1', kind: 'cow' }, [barn], { ...ctx, clock: 1 }, undefined, () => false);
    expect(Math.hypot(g.x - door.x, g.z - door.z)).toBeLessThan(0.5);
  });

  it('a property line that grazes the creek without crossing it is barred there, not posted in the water', () => {
    const g = newGame(5);
    g.site = { ...g.site, creek: true };
    const creekZ = () => 39.5;
    const plan = planPropertyWall(g, 'woven_wire', { creekZ, creekHalf: 0.7 }, { rects: [{ x0: 10, z0: 30, x1: 20, z1: 39.0 }] });
    expect(plan.runs.some(r => r.kind === 'creek_bars')).toBe(true);
  });
});

describe('scene audit: road culverts on the real, carved terrain', () => {
  it('every culvert pipe on the market listings runs under the road surface, never on top of it', { timeout: 120_000 }, () => {
    const bad: string[] = [];
    let n = 0;
    for (const seed of [1, 2]) for (const spec of corpus([seed])) {
      const sc = makeScene(spec.site, spec.seed, spec.label), plan = roadPlanFor(spec.site, spec.seed, sc.parcel);
      for (const sx of plan.structures) {
        if (sx.kind !== 'culvert' && sx.kind !== 'arch_culvert') continue;
        n++;
        const m = Math.round((sx.s0 + sx.s1) / 2), p = plan.pts[m], q = plan.pts[Math.min(plan.pts.length - 1, m + 1)], o = plan.pts[Math.max(0, m - 1)];
        const L = Math.hypot(q.x - o.x, q.z - o.z) || 1, f = { x: p.x, z: p.z, y: p.y, nx: -(q.z - o.z) / L, nz: (q.x - o.x) / L };
        const { A, B, r } = culvertEnds(f, (x, z) => sc.parcel.height(x, z), (x, z) => sc.parcel.natural(x, z).h, sx.kind === 'arch_culvert');
        const top = Math.max(A[1], B[1]) + r;
        if (top > p.y - 0.02) bad.push(`${spec.label} ${sx.kind}: pipe top ${top.toFixed(2)} over road ${p.y.toFixed(2)}`);
      }
    }
    expect(n).toBeGreaterThan(10);
    expect(bad).toEqual([]);
  });
});
