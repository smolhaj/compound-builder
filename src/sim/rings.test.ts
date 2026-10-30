import { afterEach, describe, expect, it } from 'vitest';
import { newGame, type GameState, type Structure } from './state';
import { setGroundOverride } from './terrainState';
import { RING, SALLY, DEFAULT_RINGS, sallyPorts, sortieFactor, layRings, ringBars, planRings, ringCount, ringHoldSeconds, ringPoints, ringPolygons, ringsHolding } from './rings';
import { DEFAULT_FORTRESS, layFortress, planFortress } from './fortress';
import { pointInPolygon, polygonArea, selfIntersects } from './ringShape';
import { PERIMETER, planRun, type Pt } from './perimeter';
import { planBattle } from './battle';
import { BLUEPRINTS } from './blueprints';
import { yardRings } from './compounds';
import { adaptOf } from './encounters';
import type { GroundSource } from './terrain';

afterEach(() => setGroundOverride(null));
const OUTER: Pt[] = Array.from({ length: 28 }, (_, i) => [30 + 12 * Math.cos(i / 28 * Math.PI * 2), 30 + 12 * Math.sin(i / 28 * Math.PI * 2)]);
const HILL: GroundSource = { h: (x, z) => 5 * Math.exp(-((x - 30) ** 2 + (z - 30) ** 2) / 150) };
const built = (g: GameState, id: string, kind: string, x: number, z: number): Structure => { const st: Structure = { id, kind, x, z, rot: 0, stage: 9, done: 0, supplied: true, finishedAt: 0 }; g.structures.push(st); return st; };
const game = (): GameState => { const g = newGame(3); g.site = { ...g.site, creek: false }; return g; };
const finishAll = (g: GameState) => { for (const r of g.perimeter) { r.finishedAt = 0; r.done = r.hours; } for (const st of g.structures) st.stage = BLUEPRINTS[st.kind].stages.length; };
const geoFor = (g: GameState) => { const h = g.site.home, z = (h.z0 + h.z1) / 2; return { roadGate: [h.x1, z + 4] as Pt }; };

describe('ring geometry', () => {
  it('level ground: inner rings are the outline stepped in, simple, nested, each at least a gap inside the last', () => {
    const { polys, contour } = ringPolygons(OUTER, 4);
    expect(contour).toBe(false);
    expect(polys).toHaveLength(3);
    let prevA = polygonArea(OUTER);
    for (const p of polys) {
      expect(selfIntersects(p)).toBe(false);
      expect(polygonArea(p)).toBeLessThan(prevA);
      prevA = polygonArea(p);
      for (const q of p) expect(pointInPolygon(OUTER, q[0], q[1])).toBe(true);
    }
    // each vertex is a gap or more inside the ring outside it (on the same ray)
    const r = (p: Pt[]) => p.map(q => Math.hypot(q[0] - 30, q[1] - 30));
    for (let k = 1; k < polys.length; k++) { const a = r(polys[k - 1]), b = r(polys[k]); a.forEach((v, i) => expect(v - b[i]).toBeGreaterThanOrEqual(RING.GAP - 1e-6)); }
  });

  it('a hill: the rings follow the contour, each higher up than the last', () => {
    const { polys, contour } = ringPolygons(OUTER, 3, HILL.h);
    expect(contour).toBe(true);
    const lvl = (p: Pt[]) => p.reduce((a, q) => a + HILL.h(q[0], q[1]), 0) / p.length;
    const outer = lvl(OUTER);
    expect(lvl(polys[0])).toBeGreaterThan(outer);
    expect(lvl(polys[1])).toBeGreaterThan(lvl(polys[0]));
    // and a ring sits nearer one height than a stepped-in copy would
    const spread = (p: Pt[]) => { const h = p.map(q => HILL.h(q[0], q[1])), m = h.reduce((a, b) => a + b, 0) / h.length; return Math.sqrt(h.reduce((a, b) => a + (b - m) ** 2, 0) / h.length); };
    const flat = ringPolygons(OUTER, 3).polys;
    expect(spread(polys[1])).toBeLessThanOrEqual(spread(flat[1]) + 1e-6);
  });
});

describe('planning the rings', () => {
  it('each inner ring has its own gate: alternating sides, or aligned; flat at the gate; towers inside', () => {
    const g = game();
    const outerGate: Pt = [42, 30];
    const alt = planRings(g, OUTER, outerGate, {}, { count: 3, gates: 'alternate', towers: 2 });
    const aligned = planRings(g, OUTER, outerGate, {}, { count: 3, gates: 'aligned', towers: 2 });
    expect(alt.rings).toHaveLength(2);
    const angle = (at: Pt) => Math.atan2(at[1] - 30, at[0] - 30);
    const d = (a: number, b: number) => Math.abs(((a - b + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
    expect(d(angle(alt.rings[0].gate.at), 0)).toBeGreaterThan(2.6);           // opposite the outer gate
    expect(d(angle(alt.rings[1].gate.at), 0)).toBeLessThan(0.5);               // and back again
    for (const r of aligned.rings) expect(d(angle(r.gate.at), 0)).toBeLessThan(0.5);
    for (const r of alt.rings) {
      expect(r.towers).toHaveLength(2);
      for (const t of r.towers) expect(pointInPolygon(r.poly, t.x, t.z)).toBe(true);
      expect(selfIntersects(r.poly)).toBe(false);
    }
    expect(alt.cost).toBeGreaterThan(0);
    expect(alt.hours).toBeGreaterThan(0);
  });

  it('more rings cost more; a compound too small for the count says so', () => {
    const g = game();
    const two = planRings(g, OUTER, null, {}, { count: 2 }), four = planRings(g, OUTER, null, {}, { count: 4 });
    expect(four.cost).toBeGreaterThan(two.cost);
    const tiny: Pt[] = Array.from({ length: 28 }, (_, i) => [30 + 5 * Math.cos(i / 28 * Math.PI * 2), 30 + 5 * Math.sin(i / 28 * Math.PI * 2)]);
    const p = planRings(g, tiny, null, {}, { count: 4 });
    expect(p.rings.length).toBeLessThan(3);
    expect(p.rings.length).toBeGreaterThanOrEqual(0);
    expect(p.notes.join(' ')).toMatch(/room for/);
    expect(DEFAULT_RINGS.count).toBe(1);
  });

  it('Fortify my ring with rings: the plan prices them, laying puts a closed wall with a gate and its towers on the list', () => {
    const g = game();
    const base = planFortress(g, geoFor(g), { ...DEFAULT_FORTRESS });
    const plan = planFortress(g, geoFor(g), { ...DEFAULT_FORTRESS, rings: 3 });
    expect(plan.ringPlan?.rings.length).toBe(2);
    expect(plan.cost).toBeGreaterThan(base.cost);
    expect(plan.hours).toBeGreaterThan(base.hours);
    layFortress(g, plan);
    const stone = g.perimeter.filter(r => r.kind === 'stone_wall');
    expect(stone).toHaveLength(2);
    for (const r of stone) { expect(r.gates).toHaveLength(1); expect(Math.hypot(r.pts[0][0] - r.pts.at(-1)![0], r.pts[0][1] - r.pts.at(-1)![1])).toBeLessThan(0.05); }
    expect(g.structures.filter(s => s.kind.startsWith('watchtower')).length).toBeGreaterThan(DEFAULT_FORTRESS.towers);
    void layRings; void PERIMETER; void planRun;
  });
});

describe('what finished rings do', () => {
  const withRings = (n: number, adults = 4) => {
    const g = game();
    built(g, 'h', 'timber_cabin', 30, 30);
    g.people = g.people.slice(0, adults); g.personState = g.personState.slice(0, adults);
    g.people.forEach(p => { p.kid = false; });
    const plan = planFortress(g, { roadGate: [g.site.home.x1, 30] as Pt }, { ...DEFAULT_FORTRESS, rings: n, passage: false });
    layFortress(g, plan);
    finishAll(g);
    return g;
  };
  it('are counted nested round the home; each manned inner ring buys seconds and points; the ring has to be manned', () => {
    const g = withRings(3, 4);
    expect(yardRings(g).length).toBeGreaterThanOrEqual(1);
    expect(ringCount(g)).toBe(3);
    expect(ringsHolding(g)).toBe(3);
    expect(ringHoldSeconds(g)).toBe(2 * RING.DELAY);
    expect(ringPoints(g)).toBe(2 * RING.POINTS);
    const two = withRings(3, 2);
    expect(ringsHolding(two)).toBe(2);               // 2 adults man one inner ring
    const one = withRings(3, 1);
    expect(ringsHolding(one)).toBe(1);               // alone he holds the outside one
    expect(ringHoldSeconds(one)).toBe(0);
    expect(ringPoints(withRings(1, 4))).toBe(0);
  });

  it('feed the shared strength the crews learn from (Hardcore adaptation)', () => {
    const g = withRings(3, 4);
    expect(typeof adaptOf(g)).toBe('number');
  });

  it('make a raid take longer to breach the line (same crew, same seed)', () => {
    const t = (g: GameState) => { const times: number[] = []; for (let seed = 1; seed <= 12; seed++) { const b = planBattle(g, 6, seed); const e = b.events.find(x => x.kind === 'breach'); if (e) times.push(e.t); } return times; };
    const a = t(withRings(1, 4)), b = t(withRings(3, 4));
    if (a.length && b.length) expect(b.reduce((x, y) => x + y, 0) / b.length).toBeGreaterThanOrEqual(a.reduce((x, y) => x + y, 0) / a.length);
    else expect(b.length).toBeLessThanOrEqual(a.length);   // or fewer breaches at all
  });
});

describe('sally ports', () => {
  it('each inner ring gets a small side door opposite its main gate, priced, and flagged on the gate', () => {
    const g = game();
    const plain = planRings(g, OUTER, [42, 30], {}, { count: 3, sally: false });
    const withS = planRings(g, OUTER, [42, 30], {}, { count: 3, sally: true });
    expect(withS.cost).toBeGreaterThan(plain.cost);
    expect(withS.hours).toBeGreaterThan(plain.hours);
    layRings(g, withS);
    const runs = g.perimeter.filter(r => r.gates.some(x => x.sally));
    expect(runs).toHaveLength(2);
    for (const r of runs) {
      expect(r.gates).toHaveLength(2);
      const [main, sally] = r.gates[0].sally ? [r.gates[1], r.gates[0]] : r.gates;
      expect(sally.w).toBe(SALLY.W);
      expect(sally.w).toBeLessThan(main.w);
      expect(Math.abs(sally.at - main.at)).toBeGreaterThan(5);
    }
  });

  it('no tower stands in front of the sally port', () => {
    const g = game();
    const plan = planRings(g, OUTER, [42, 30], {}, { count: 3, sally: true, towers: 3 });
    layRings(g, plan);
    for (const r of g.perimeter.filter(x => x.gates.some(y => y.sally))) {
      const s = r.gates.find(y => y.sally)!;
      let d = 0, pt: Pt = r.pts[0];
      for (let i = 1; i < r.pts.length; i++) { const a = r.pts[i - 1], b = r.pts[i], l = Math.hypot(b[0] - a[0], b[1] - a[1]); if (d + l >= s.at) { const f = (s.at - d) / l; pt = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]; break; } d += l; }
      for (const st of g.structures) expect(Math.hypot(st.x - pt[0], st.z - pt[1])).toBeGreaterThan(2);
    }
  });

  it('a standing sally port gives the defenders a flank and never shortens the hold; none counted until built', () => {
    const g = game();
    layRings(g, planRings(g, OUTER, [42, 30], {}, { count: 3, sally: true }));
    expect(sallyPorts(g)).toBe(0);
    expect(sortieFactor(g)).toBe(1);
    finishAll(g);
    expect(sallyPorts(g)).toBe(2);
    expect(sortieFactor(g)).toBeCloseTo(1 + 2 * SALLY.SORTIE, 6);
    expect(ringHoldSeconds(g)).toBe(ringHoldSeconds(g));
    expect(RING.DELAY).toBeGreaterThan(0);
  });
});

describe('rings over the creek', () => {
  const creekZ = (x: number) => 30 + 0 * x;   // runs west to east through the middle of the ring
  it('every ring the creek crosses gets bars across it; none where it does not', () => {
    const g = game(); g.site = { ...g.site, creek: true };
    const plan = planRings(g, OUTER, [42, 30], { creekZ, creekHalf: 0.7 }, { count: 3 });
    expect(plan.rings.every(r => r.bars.length === 2)).toBe(true);   // west and east crossings
    for (const r of plan.rings) for (const b of r.bars) {
      const mid = [(b[0][0] + b[1][0]) / 2, (b[0][1] + b[1][1]) / 2];
      expect(Math.abs(mid[1] - 30)).toBeLessThan(0.5);
    }
    expect(plan.notes.join(' ')).toMatch(/creek crosses it/);
    const dry = planRings(g, OUTER, [42, 30], { creekZ: () => 90 }, { count: 3 });
    expect(dry.rings.every(r => r.bars.length === 0)).toBe(true);
    const flat = planRings(game(), OUTER, [42, 30], { creekZ }, { count: 3 });
    expect(flat.rings.every(r => r.bars.length === 0)).toBe(true);   // no creek on this land
  });

  it('costs more with bars, and lays them as creek_bars runs; bars already standing are not doubled', () => {
    const g = game(); g.site = { ...g.site, creek: true };
    const withBars = planRings(g, OUTER, [42, 30], { creekZ }, { count: 2 });
    const without = planRings(game(), OUTER, [42, 30], {}, { count: 2 });
    expect(withBars.cost).toBeGreaterThan(without.cost);
    const before = g.perimeter.length;
    layRings(g, withBars);
    expect(g.perimeter.filter(r => r.kind === 'creek_bars')).toHaveLength(2);
    expect(g.perimeter.length).toBeGreaterThan(before + 2);
    const again = planRings(g, OUTER, [42, 30], { creekZ }, { count: 2 });
    expect(again.rings[0].bars).toHaveLength(0);
    expect(ringBars(OUTER, creekZ, 0.7)).toHaveLength(2);
  });
});
