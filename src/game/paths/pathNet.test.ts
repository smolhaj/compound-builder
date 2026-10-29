import { describe, expect, it } from 'vitest';
import { newGame, type GameState } from '../../sim/state';
import { HIDDEN_WEAR, PATH_WIDTH, doorOf, edgeKey, layPaths, pathsOf } from '../../sim/paths';
import { CELL, KIT, footprint } from '../buildkit/kit';
import { hubOf, layShares, newNetCache, planNetwork, routeVia, summarize, surfaceIndex, walkGraph, wantedWalks, type NetWorld, type PathNetwork } from './pathNet';
import { pathNodes } from '../../sim/paths';

const fin = (id: string, kind: string, x: number, z: number, rot = 0, at = 0) => ({ id, kind, x, z, rot, stage: 99, done: 0, supplied: true, finishedAt: at as number | null });

function place(t: number, extra: Array<ReturnType<typeof fin>> = []): GameState {
  const g = newGame(3, 105, 2027, {});
  g.structures = [fin('h', 'farmhouse', 40, 40), fin('b', 'barn', 30, 30), fin('c', 'chicken_coop', 28, 42, 1), fin('g', 'garden', 42, 26), fin('w', 'well_hand', 46, 50), fin('o', 'outhouse', 54, 38, 3), fin('s', 'workshop', 52, 46, 3), ...extra];
  g.clock.t = t;
  return g;
}

/** A flat open world: only the buildings are in the way (padded), plus whatever wall the test adds. */
const world = (g: GameState, wall?: (x: number, z: number) => boolean): NetWorld => ({
  blocked: (x, z) => {
    if (wall?.(x, z)) return true;
    for (const s of g.structures) { const f = footprint(KIT[s.kind], s.x, s.z, s.rot, false); if (x > f.x0 - 0.14 && x < f.x1 + 0.14 && z > f.z0 - 0.14 && z < f.z1 + 0.14) return true; }
    return false;
  },
});

describe('who walks where', () => {
  it('the main house is the hub, and every stop is wanted a walk to it', () => {
    const g = place(100);
    const nodes = pathNodes(g, { camp: { x: 36, z: 36 }, yard: { x: 60, z: 40 } });
    expect(hubOf(nodes)!.id).toBe('h');
    const w = wantedWalks(nodes, g);
    for (const n of nodes) if (n.id !== 'h') expect(w.some(x => edgeKey(x.a.id, x.b.id) === edgeKey('h', n.id))).toBe(true);
    // busiest first
    for (let i = 1; i < w.length; i++) expect(w[i - 1].trips).toBeGreaterThanOrEqual(w[i].trips);
    // the work links the barn and the coop, the well and the garden
    expect(w.some(x => edgeKey(x.a.id, x.b.id) === edgeKey('b', 'c'))).toBe(true);
    expect(w.some(x => edgeKey(x.a.id, x.b.id) === edgeKey('w', 'g'))).toBe(true);
  });
  it('without a house the camp is the hub', () => {
    const g = place(100); g.structures = g.structures.filter(s => s.kind !== 'farmhouse');
    expect(hubOf(pathNodes(g, { camp: { x: 36, z: 36 } }))!.id).toBe('camp');
  });
});

describe('the network', () => {
  const net = (t: number, ex = {}, wall?: (x: number, z: number) => boolean, g0?: GameState): { g: GameState; n: PathNetwork } => {
    const g = g0 ?? place(t);
    return { g, n: planNetwork(g, { camp: { x: 36, z: 36 }, yard: { x: 62, z: 40 }, ...ex }, world(g, wall), newNetCache()) };
  };

  it('routes every walk door to door, round the buildings, and the routes merge into shared trails', () => {
    const { g, n } = net(400);
    expect(n.edges.length).toBeGreaterThanOrEqual(8);
    for (const e of n.edges) {
      expect(e.route.length).toBeGreaterThan(3);
      const a = n.nodes.find(x => x.id === e.a)!, b = n.nodes.find(x => x.id === e.b)!;
      const near = (p: [number, number], q: [number, number]) => Math.hypot(p[0] - q[0], p[1] - q[1]);
      const ends = [e.route[0], e.route[e.route.length - 1]];
      const goal = (s: typeof a) => (s.ring ? [s.x, s.z] as [number, number] : [s.ax, s.az] as [number, number]);
      expect(Math.min(near(ends[0], goal(a)), near(ends[1], goal(a))), `${e.key} ends at ${e.a}`).toBeLessThan(a.ring ? a.ring + 0.3 : 0.31);
      expect(Math.min(near(ends[0], goal(b)), near(ends[1], goal(b))), `${e.key} ends at ${e.b}`).toBeLessThan(b.ring ? b.ring + 0.3 : 0.31);
      // (the last stride into a door is allowed to touch its own front)
      for (const p of e.route.filter(q => Math.min(near(q, ends[0]), near(q, ends[1])) > 0.45)) for (const s of g.structures) { const f = footprint(KIT[s.kind], s.x, s.z, s.rot, false); expect(p[0] > f.x0 - 0.05 && p[0] < f.x1 + 0.05 && p[1] > f.z0 - 0.05 && p[1] < f.z1 + 0.05, `${e.key} crosses ${s.id}`).toBe(false); }
    }
    // shared ground: more walks than trails
    const used = new Set(n.edges.flatMap(e => e.trails));
    expect(used.size).toBeLessThan(n.edges.reduce((a, e) => a + e.trails.length, 0));
    // the unique metres add up to no more than the sum of the trail lengths
    expect(n.edges.reduce((a, e) => a + e.uniqueM, 0)).toBeLessThanOrEqual(n.trails.reduce((a, t) => a + t.lenM, 0) + 1);
  });

  it('is not ruler-straight: a walk across open ground bends a little', () => {
    const { n } = net(400);
    const e = n.edges.find(x => x.key === edgeKey('h', 'w'))!;
    expect(e).toBeTruthy();
    const a = e.route[0], b = e.route[e.route.length - 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    let worst = 0;
    for (const p of e.route) worst = Math.max(worst, Math.abs((b[0] - a[0]) * (a[1] - p[1]) - (a[0] - p[0]) * (b[1] - a[1])) / L);
    expect(worst).toBeGreaterThan(0.005);
  });

  it('wears with time: a day-old place has no tracks, a year-old place has bare ones where it is busy', () => {
    const day1 = net(1).n, year = net(400).n, years3 = net(1200).n;
    expect(day1.trails.every(t => t.surface === null)).toBe(true);
    expect(year.trails.some(t => t.surface === 'dirt')).toBe(true);
    expect(year.trails.some(t => t.surface === 'desire' || t.surface === 'dirt')).toBe(true);
    const mean = (n: PathNetwork) => n.trails.reduce((a, t) => a + t.wear, 0) / n.trails.length;
    expect(mean(years3)).toBeGreaterThan(mean(year));
    expect(mean(year)).toBeGreaterThan(mean(day1));
  });

  it('busier ground wears first: the trunk to the house is more worn than a branch to the outhouse in the first weeks', () => {
    const { n } = net(25);
    const hw = n.edges.find(x => x.key === edgeKey('h', 'o'))!, hw2 = n.edges.find(x => x.key === edgeKey('h', 's'))!;
    expect(hw.trips).toBeGreaterThan(hw2.trips);
    expect(hw.meanWear).toBeGreaterThan(hw2.meanWear);
  });

  it('what came with the land is already walked into the ground on the first day', () => {
    const g = place(2);
    for (const s of g.structures) (s as { pre?: boolean }).pre = true;
    g.site.improvements.house = { kind: 'farmhouse', built: 1960, roof: 'good', wiring: 'good', plumbing: 'good' };
    g.site.improvements.barn = { built: 1960, roof: 'good' };
    const n = net(2, {}, undefined, g).n;
    expect(n.trails.some(t => t.surface === 'dirt')).toBe(true);
  });

  it('a track to the bunker hatch never wears past a faint line and cannot be laid', () => {
    const g = place(2000, [fin('hatch', 'bunker_hatch', 24, 44)]);
    const n = net(2000, {}, undefined, g).n;
    const e = n.edges.find(x => x.a === 'hatch' || x.b === 'hatch')!;
    expect(e).toBeTruthy();
    expect(e.hidden).toBe(true);
    expect(e.can.gravel).toBe(false);
    const own = e.trails.filter(i => !n.edges.some(o => o !== e && !o.hidden && o.trails.includes(i)));
    for (const i of own) expect(n.trails[i].wear).toBeLessThanOrEqual(HIDDEN_WEAR + 1e-9);
  });

  it('shows what is laid, on the trails it runs along, and not on the others', () => {
    const g = place(400);
    g.stock.fieldstone = 20; g.stock.lumber = 20; g.stock.concrete = 20;
    const before = net(400, {}, undefined, g).n;
    const hb = before.edges.find(x => x.key === edgeKey('h', 'b'))!;
    expect(layPaths(g, [{ a: hb.a, b: hb.b, lenM: hb.lenM }], 'gravel')).toBeNull();
    const n = net(400, {}, undefined, g).n;
    const e = n.edges.find(x => x.key === hb.key)!;
    expect(e.laid).toBe('gravel');
    expect(e.surface).toBe('gravel');
    for (const i of e.trails) expect(n.trails[i].laid).toBe('gravel');
    const other = n.edges.find(x => x.key === edgeKey('h', 'o'))!;
    expect(other.laid).toBeNull();
    expect(pathsOf(g).laid).toHaveLength(1);
    // a laid walk stays on the map even when nothing links its ends any more
    expect(summarize(n).edges.find(x => x.key === hb.key)!.laid).toBe('gravel');
  });

  it('finds the gap in a wall and gives up on a stop sealed off', () => {
    const g = place(400);
    // a wall at x = 60 with a gap at z in [36, 38]; the yard is outside it
    const gap = (x: number, z: number) => Math.abs(x - 60) < 0.25 && !(z > 36 && z < 38.4);
    const n = planNetwork(g, { yard: { x: 66, z: 40 } }, world(g, gap), newNetCache());
    const y = n.edges.find(e => e.a === 'yard' || e.b === 'yard')!;
    expect(y).toBeTruthy();
    expect(y.route.some(p => p[0] > 59.6 && p[0] < 60.4 && p[1] > 35.5 && p[1] < 39)).toBe(true);
    const sealed = planNetwork(g, { yard: { x: 66, z: 40 } }, world(g, (x) => Math.abs(x - 60) < 0.25), newNetCache());
    expect(sealed.edges.some(e => e.a === 'yard' || e.b === 'yard')).toBe(false);
  });

  it('is cheap to plan again once the routes are found', () => {
    const g = place(400);
    const cache = newNetCache(), w = world(g);
    const a = planNetwork(g, { camp: { x: 36, z: 36 } }, w, cache);
    g.clock.t = 800;
    const b = planNetwork(g, { camp: { x: 36, z: 36 } }, w, cache);
    expect(b.edges.map(e => e.key)).toEqual(a.edges.map(e => e.key));
    expect(b.trails.map(t => t.pts.length)).toEqual(a.trails.map(t => t.pts.length));
  });
});

describe('what laying costs', () => {
  it('buys a shared trunk once, however many walks are laid on it, and not at all where it is already laid', () => {
    const g = place(400);
    const n = planNetwork(g, { camp: { x: 36, z: 36 }, yard: { x: 62, z: 40 } }, world(g), newNetCache());
    const sum = summarize(n);
    const walks = sum.edges.filter(e => !e.hidden);
    const shares = layShares(sum, walks, 'gravel');
    const total = shares.reduce((a, x) => a + x.lenM, 0);
    const used = new Set(walks.flatMap(e => e.trailIds));
    expect(total).toBe([...used].reduce((a, i) => a + sum.trails[i].m, 0));
    expect(total).toBeLessThan(walks.reduce((a, e) => a + e.lenM, 0));
    // laying it again with the same surface costs nothing; a better one costs again; a worse one nothing
    const laidAll = { trails: sum.trails.map(t => ({ ...t, laid: 'gravel' as const })) };
    expect(layShares(laidAll, walks, 'gravel').reduce((a, x) => a + x.lenM, 0)).toBe(0);
    expect(layShares(laidAll, walks, 'paved').reduce((a, x) => a + x.lenM, 0)).toBe(total);
    expect(layShares({ trails: sum.trails.map(t => ({ ...t, laid: 'paved' as const })) }, walks, 'gravel').reduce((a, x) => a + x.lenM, 0)).toBe(0);
  });
});

describe('underfoot and on the way', () => {
  it('says what is under a point: the surface on a path, nothing off it', () => {
    const g = place(1200);
    const n = planNetwork(g, { camp: { x: 36, z: 36 } }, world(g), newNetCache());
    const idx = surfaceIndex(n, s => PATH_WIDTH[s]);
    const t = n.trails.find(x => x.surface)!;
    const mid = t.pts[Math.floor(t.pts.length / 2)];
    expect(idx(mid[0], mid[1])).toBe(t.surface);
    expect(idx(2, 2)).toBeNull();
  });

  it('a walker is sent along the paths, round a wall rather than through it; or straight when the paths are no help', () => {
    const g = place(1200);
    const wall = (x: number, z: number) => Math.abs(x - 47) < 0.25 && z > 30 && z < 56 && !(z > 33 && z < 35);
    const w = world(g, wall);
    const n = planNetwork(g, { camp: { x: 36, z: 36 } }, w, newNetCache());
    const graph = walkGraph(n);
    const [dx, dz] = doorOf(g.structures.find(s => s.id === 'h')!);
    const via = routeVia(graph, dx, dz, 52, 40);
    // either straight (no good path) or a way that never passes through the wall
    for (const p of via) expect(wall(p[0], p[1])).toBe(false);
    expect(routeVia(graph, 0, 0, 1, 1)).toEqual([]);
    expect(routeVia(graph, 30, 30, 30.2, 30.2)).toEqual([]);
    void CELL;
  });
});

describe('the self-sufficient interior and the family on the paths', () => {
  const interior = [
    fin('gh', 'greenhouse_heated', 60, 24), fin('og', 'orchard_grove', 20, 56), fin('sf', 'solar_farm', 70, 56), fin('bb', 'battery_bank', 76, 56),
    fin('pd', 'pond', 24, 76), fin('rv', 'reservoir', 62, 76), fin('sb', 'sheep_barn', 12, 30), fin('ey', 'equipment_yard', 66, 40, 3),
    fin('gu', 'guest_house', 54, 56), fin('mh', 'moms_house', 36, 60),
  ];
  const full = (): GameState => place(900, interior);
  const planned = (g: GameState, cars: Array<{ x: number; z: number; rot: number; hw: number; hl: number }> = []) => {
    const w = world(g);
    const blocked = w.blocked;
    return planNetwork(g, { camp: { x: 36, z: 36 }, yard: { x: 62, z: 10 } }, { ...w, blocked: (x, z) => blocked(x, z) || cars.some(c => Math.hypot(c.x - x, c.z - z) < c.hl + 0.12) }, newNetCache());
  };

  it('knows what each new building is for', () => {
    const roles = Object.fromEntries(pathNodes(full(), {}).map(n => [n.id, n.role]));
    expect(roles).toMatchObject({ gh: 'greenhouse', og: 'orchard', sf: 'power', bb: 'power', pd: 'bank', rv: 'bank', sb: 'barn', ey: 'work', gu: 'guest', mh: 'guest' });
  });

  it('walks to the greenhouse, the sheep barn, both houses and the water banks, to their doors and round every new structure', () => {
    const g = full(), n = planned(g);
    for (const id of ['gh', 'sb', 'gu', 'mh', 'pd', 'rv', 'ey']) {
      const e = n.edges.find(x => x.a === id || x.b === id);
      expect(e, `a walk to ${id}`).toBeDefined();
      expect(e!.route.length).toBeGreaterThan(2);
      const node = n.nodes.find(x => x.id === id)!;
      const ends = [e!.route[0], e!.route[e!.route.length - 1]];
      expect(Math.min(...ends.map(p => Math.hypot(p[0] - node.ax, p[1] - node.az))), `${id} door`).toBeLessThan(0.31);
    }
    // no walk goes through any structure (the last stride into its own door may touch its front)
    for (const e of n.edges) {
      const ends = [e.route[0], e.route[e.route.length - 1]];
      for (const p of e.route.filter(q => Math.min(...ends.map(d => Math.hypot(q[0] - d[0], q[1] - d[1]))) > 0.45)) {
        for (const s of g.structures) { const f = footprint(KIT[s.kind], s.x, s.z, s.rot, false); expect(p[0] > f.x0 - 0.05 && p[0] < f.x1 + 0.05 && p[1] > f.z0 - 0.05 && p[1] < f.z1 + 0.05, `${e.key} crosses ${s.id}`).toBe(false); }
      }
    }
  });

  it('a walk goes round the cars standing in the yard', () => {
    const g = full();
    const car = { x: 48, z: 38, rot: 0, hw: 0.17, hl: 0.46 };
    const n = planned(g, [car]);
    for (const e of n.edges) for (const p of e.route) expect(Math.hypot(p[0] - car.x, p[1] - car.z), `${e.key} clips the car`).toBeGreaterThan(car.hl);
  });

  it('the pond and the reservoir are ordinary (not hidden) stops that can be laid', () => {
    const g = full();
    expect(wantedWalks(pathNodes(g, {}), g).find(w => w.a.id === 'pd' || w.b.id === 'pd')!.trips).toBeGreaterThan(0);
    const n = planned(g);
    expect(n.edges.find(e => e.a === 'pd' || e.b === 'pd')!.can.gravel).toBe(true);
  });
});
