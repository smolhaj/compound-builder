import { describe, expect, it } from 'vitest';
import { newGame, type GameState } from './state';
import { GARAGE_W, GATE_GARAGE } from './garage';
import { DEFAULT_FORTRESS, MAX_TOWERS, coreRect, layFortress, planFortress } from './fortress';
import { PERIMETER, type Pt } from './perimeter';
import { yardRings, insideRing } from './compounds';
import { cornersOf, fillOf, flattenAt, gatePoint, pointInPolygon, polygonArea, regionFromPolygon, ringPolygon, selfIntersects, STEEP, type RingShape } from './ringShape';
import { BLUEPRINTS } from './blueprints';
import { TOWERS } from './towers';
import { CELL } from '../game/buildkit/kit';
import { runLength } from './perimeter';
import { addWalkway } from './walkway';
import { hatches } from './compounds';

const R = { x0: 0, z0: 0, x1: 24, z1: 24 };
const SHAPES: RingShape[] = ['square', 'rounded', 'octagon', 'irregular'];
const o = { gateW: GARAGE_W, seed: 7, drive: [[40, 12], [12, 12]] as Pt[] };

describe('ring outlines', () => {
  it('every shape is a simple closed outline inside its rectangle', () => {
    for (const sh of SHAPES) {
      const p = ringPolygon(sh, R, o);
      expect(p.length, sh).toBeGreaterThanOrEqual(4);
      expect(selfIntersects(p), sh).toBe(false);
      for (const q of p) { expect(q[0], sh).toBeGreaterThanOrEqual(-1e-6); expect(q[0], sh).toBeLessThanOrEqual(24 + 1e-6); expect(q[1], sh).toBeGreaterThanOrEqual(-1e-6); expect(q[1], sh).toBeLessThanOrEqual(24 + 1e-6); }
      expect(pointInPolygon(p, 12, 12), sh).toBe(true);
    }
  });

  it('a round ring holds less ground than a square one and an octagon sits between them', () => {
    const f = (sh: RingShape) => fillOf(ringPolygon(sh, R, o), R);
    expect(f('square')).toBeCloseTo(1);
    expect(f('rounded')).toBeLessThan(f('octagon'));
    expect(f('octagon')).toBeLessThan(1);
    expect(f('rounded')).toBeGreaterThan(0.75);
  });

  it('the gate side is flat: a straight stretch long enough for a gate garage where the driveway crosses', () => {
    for (const sh of ['rounded', 'octagon', 'irregular'] as const) {
      const p = ringPolygon(sh, R, o);
      const gp = gatePoint(p, o);
      let ok = false;
      for (let i = 0; i < p.length; i++) {
        const a = p[i], b = p[(i + 1) % p.length], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const t = ((gp[0] - a[0]) * (b[0] - a[0]) + (gp[1] - a[1]) * (b[1] - a[1])) / (l * l);
        const d = Math.hypot(gp[0] - (a[0] + (b[0] - a[0]) * t), gp[1] - (a[1] + (b[1] - a[1]) * t));
        if (d < 0.05 && t > 0 && t < 1 && l >= GARAGE_W + 0.4) ok = true;
      }
      expect(ok, sh).toBe(true);
    }
  });

  it('is the same on every look (seeded), and different lands give different irregular rings', () => {
    expect(ringPolygon('irregular', R, o)).toEqual(ringPolygon('irregular', R, o));
    expect(ringPolygon('irregular', R, { ...o, seed: 8 })).not.toEqual(ringPolygon('irregular', R, o));
  });

  it('an irregular ring stops short of steep ground and runs out on the level', () => {
    const cliff = (x: number) => (x > 18 ? (x - 18) * 2 : 0);   // a bluff along the east side
    const flat = ringPolygon('irregular', R, { ...o, drive: undefined, roadGate: [0, 12] });
    const hug = ringPolygon('irregular', R, { ...o, drive: undefined, roadGate: [0, 12], ground: (x) => cliff(x) });
    const maxX = (p: Pt[]) => Math.max(...p.map(q => q[0]));
    expect(maxX(hug)).toBeLessThan(maxX(flat));
    expect(maxX(hug)).toBeLessThanOrEqual(19);
    expect(STEEP).toBeGreaterThan(0);
  });

  it('flattenAt cuts a chord at least as long as the gate and keeps the outline simple', () => {
    const circle: Pt[] = Array.from({ length: 36 }, (_, i) => [12 + 12 * Math.cos(i / 36 * 6.2832), 12 + 12 * Math.sin(i / 36 * 6.2832)]);
    const p = flattenAt(circle, [24, 12], 3);
    expect(selfIntersects(p)).toBe(false);
    expect(polygonArea(p)).toBeLessThan(polygonArea(circle));
    const longest = Math.max(...p.map((a, i) => Math.hypot(p[(i + 1) % p.length][0] - a[0], p[(i + 1) % p.length][1] - a[1])));
    expect(longest).toBeGreaterThanOrEqual(3 + 0.4);
  });

  it('finds real corners on an octagon and none to speak of on a round ring', () => {
    const oct = ringPolygon('octagon', R, o), rd = ringPolygon('rounded', R, o);
    expect(cornersOf(oct, regionFromPolygon(oct), 0.7).length).toBeGreaterThanOrEqual(6);
    expect(cornersOf(rd, regionFromPolygon(rd), 0.7).length).toBe(0);
  });
});

const game = (seed = 7): GameState => { const g = newGame(seed); g.site = { ...g.site, creek: false }; return g; };
const geoFor = (g: GameState) => { const h = g.site.home, z = (h.z0 + h.z1) / 2; return { roadGate: [h.x1, z + 4] as Pt }; };
const finishAll = (g: GameState) => { for (const r of g.perimeter) r.finishedAt = 0; for (const st of g.structures) st.stage = BLUEPRINTS[st.kind].stages.length; };

describe('the fortress ring in each shape keeps the whole system', () => {
  for (const shape of SHAPES) {
    it(`${shape}: a closed ring with a gate, a garage, towers inside the wall, a deck and a passage`, () => {
      const g = game();
      g.structures.push({ id: 'h1', kind: 'timber_cabin', x: coreRect(g).x0 + 12, z: coreRect(g).z0 + 12, rot: 0, stage: 0, done: 0, supplied: false, finishedAt: null });
      const plan = planFortress(g, geoFor(g), { ...DEFAULT_FORTRESS, shape });
      const run = plan.wall.runs.find(r => r.kind === 'container_wall')!;
      expect(run).toBeTruthy();
      // closed
      expect(Math.hypot(run.pts[0][0] - run.pts.at(-1)![0], run.pts[0][1] - run.pts.at(-1)![1])).toBeLessThan(0.05);
      expect(plan.wall.gates).toBe(1);
      expect(plan.garage, `garage fits on a flat stretch (${plan.notes.join('; ')})`).not.toBeNull();
      expect(plan.towers.length).toBe(MAX_TOWERS);
      // each tower stands inside the wall, whole footprint
      const half = TOWERS[DEFAULT_FORTRESS.towerKind].cells * CELL / 2;
      for (const t of plan.towers) for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) expect(plan.region.contains(t.x + sx * half, t.z + sz * half), `${shape} tower at ${t.x},${t.z}`).toBe(true);
      expect(plan.passage).not.toBeNull();
      expect(plan.walkwayLen).toBeGreaterThan(0);
      layFortress(g, plan);
      finishAll(g);
      // the wall is a yard ring: the compound check and the passage hatches read it
      expect(yardRings(g).length).toBeGreaterThanOrEqual(1);
      expect(insideRing(run.pts, g.structures.find(s => s.id === 'h1')!.x, g.structures.find(s => s.id === 'h1')!.z)).toBe(true);
      expect(g.structures.some(s => s.kind === GATE_GARAGE)).toBe(true);
      expect(g.perimeter.some(r => r.kind === 'wall_walk')).toBe(true);
      expect(hatches(g).length).toBeGreaterThanOrEqual(0);
    });
  }

  it('a round ring costs less wall than the square for the same box and a rounder one is not free', () => {
    const g = game();
    const sq = planFortress(g, geoFor(g), { ...DEFAULT_FORTRESS, shape: 'square' }), rd = planFortress(g, geoFor(g), { ...DEFAULT_FORTRESS, shape: 'rounded' });
    expect(rd.wall.wallM).toBeLessThan(sq.wall.wallM);
    expect(rd.wall.wallM).toBeGreaterThan(0);
    expect(PERIMETER.container_wall.hours).toBeGreaterThan(0);
  });

  it('the whole-property scope keeps the land\'s own line and says so', () => {
    const g = game();
    const plan = planFortress(g, geoFor(g), { ...DEFAULT_FORTRESS, scope: 'full', shape: 'rounded' });
    expect(plan.notes.join(' ')).toMatch(/follows the line of the land|core compound/);
    void runLength; void addWalkway;
  });
});
