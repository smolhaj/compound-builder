import { describe, expect, it } from 'vitest';
import { newGame, type GameState } from './state';
import { planRun, PERIMETER, footingOf, type PerimeterKind, type PerimeterRun, type Pt } from './perimeter';
import { enclosure } from './enclosure';
import { coveredRoute, hatches, linkedGroups, links, passageEntry, setPassageLocked, tripExposed, yardRings } from './compounds';
import { defenseReport } from './defenseReport';

const done = (g: GameState, kind: PerimeterKind, pts: Pt[]): PerimeterRun => { const r = planRun(g, kind, pts); r.done = r.hours; r.supplied = true; r.finishedAt = 0; return r; };
const yard = (g: GameState, cx: number, cz: number, h = 3) => done(g, 'container_wall', [[cx - h, cz - h], [cx + h, cz - h], [cx + h, cz + h], [cx - h, cz + h], [cx - h, cz - h]]);
const house = (g: GameState, id: string, x: number, z: number) => g.structures.push({ id, kind: 'farmhouse', x, z, rot: 0, stage: 99, done: 0, supplied: true, finishedAt: 0 });

function twoYards() {
  const g = newGame(3);
  const cx = (g.site.home.x0 + g.site.home.x1) / 2, cz = (g.site.home.z0 + g.site.home.z1) / 2;
  const a = yard(g, cx - 8, cz), b = yard(g, cx + 8, cz);
  house(g, 'h1', cx - 8, cz); house(g, 'h2', cx + 8, cz);
  return { g, a, b, cx, cz };
}

describe('linked compounds: covered walkways', () => {
  it('each walled yard stays its own ring; a walkway between them joins the two for the covered check', () => {
    const { g, a, b, cx, cz } = twoYards();
    const rings = yardRings(g);
    expect(rings.map(r => r.id).sort()).toEqual([a.id, b.id].sort());
    expect(linkedGroups(rings, links(g, rings))).toHaveLength(2);
    expect(coveredRoute(g, a.id, b.id)).toBe(false);
    expect(tripExposed(g, [cx - 8, cz], [cx + 8, cz])).toBe(true);
    const w = done(g, 'covered_walkway', [[cx - 5, cz], [cx + 5, cz]]);
    const ls = links(g);
    expect(ls).toHaveLength(1);
    expect(new Set([ls[0].a, ls[0].b])).toEqual(new Set([a.id, b.id]));
    expect(coveredRoute(g, a.id, b.id)).toBe(true);
    expect(tripExposed(g, [cx - 8, cz], [cx + 8, cz])).toBe(false);
    expect(tripExposed(g, [cx - 8, cz], [cx - 8, cz + 1])).toBe(false);
    // the walkway is not itself a yard
    expect(yardRings(g).some(r => r.id === w.id)).toBe(false);
    const rep = defenseReport(g);
    expect(rep.homes.every(h => h.covered)).toBe(true);
    expect(rep.homes[0].how).toMatch(/joined to 1 other yard/);
    expect(rep.linked.some(c => c.id === 'yards' && c.ok)).toBe(true);
  });

  it('counts as wall for the ring checks and is dark without power', () => {
    expect(PERIMETER.covered_walkway.blocks.people).toBeGreaterThanOrEqual(0.5);
    const { g, cx, cz } = twoYards();
    done(g, 'covered_walkway', [[cx - 5, cz], [cx + 5, cz]]);
    expect(links(g)[0].lit).toBe(false);
    g.utilities.lit = ['h1'];
    expect(links(g)[0].lit).toBe(true);
    // a walkway laid along an unwalled home counts toward the barrier like any wall
    const open = newGame(3); const c = (open.site.home.x0 + open.site.home.x1) / 2, z = open.site.home.z0;
    const before = enclosure(open).barrier;
    done(open, 'covered_walkway', [[c - 3, z], [c + 3, z]]);
    expect(enclosure(open).barrier).toBeGreaterThan(before);
  });

  it('a walkway with an end in open ground does not join anything', () => {
    const { g, cx, cz } = twoYards();
    done(g, 'covered_walkway', [[cx - 5, cz], [cx, cz + 12]]);
    expect(linkedGroups(yardRings(g), links(g))).toHaveLength(2);
    expect(defenseReport(g).linked.some(c => c.id.startsWith('walk_') && !c.ok)).toBe(true);
  });
});

describe('linked compounds: the underground passage', () => {
  it('between two yards both hatches are inside a wall: hidden, joined, and no way in', () => {
    const { g, a, b, cx, cz } = twoYards();
    done(g, 'underground_passage', [[cx - 8, cz], [cx + 8, cz]]);
    const hs = hatches(g);
    expect(hs).toHaveLength(2);
    expect(hs.every(h => !h.exposed)).toBe(true);
    expect(coveredRoute(g, a.id, b.id)).toBe(true);
    let got = 0;
    for (let i = 0; i < 100; i++) if (passageEntry(g, () => 0, true)) got++;
    expect(got).toBe(0);
  });

  it('a hatch out in the woods is the guarded weak point: the blast door holds unless forced', () => {
    const { g, cx, cz } = twoYards();
    const p = done(g, 'underground_passage', [[cx - 8, cz], [cx - 8, cz - 25]]);
    const out = hatches(g).filter(h => h.exposed);
    expect(out).toHaveLength(1);
    expect(out[0].locked).toBe(true);
    // found (r < 0.08), door holds (second draw low)
    const seq = (...xs: number[]) => { let i = 0; return () => xs[Math.min(i++, xs.length - 1)]; };
    expect(passageEntry(g, seq(0, 0), false)).toBeNull();
    // found, and a crew with explosives blows it
    expect(passageEntry(g, seq(0, 0.9), true)).toMatchObject({ runId: p.id, forced: true });
    // not found
    expect(passageEntry(g, seq(0.5), true)).toBeNull();
    // unbolted: found is enough
    setPassageLocked(g, p.id, false);
    expect(passageEntry(g, seq(0), false)).toMatchObject({ forced: false });
    // revealed: far easier to find
    setPassageLocked(g, p.id, true); p.revealed = true;
    expect(passageEntry(g, seq(0.3, 0.99), false)).not.toBeNull();
    expect(defenseReport(g).linked.some(c => c.id === `pass_${p.id}`)).toBe(true);
  });
});

describe('doorways and footings', () => {
  it('planning a walkway cuts a doorway in each yard wall where it meets, and the rings stay closed and covered', () => {
    const { g, a, b, cx, cz } = twoYards();
    const w = planRun(g, 'covered_walkway', [[cx - 5, cz], [cx + 5, cz]]);
    w.done = w.hours; w.supplied = true; w.finishedAt = 0;
    expect(a.gates).toHaveLength(1);
    expect(b.gates).toHaveLength(1);
    expect(a.gates[0].w).toBeGreaterThan(0.3);
    // each doorway sits where the walkway's end meets the wall (the east side of yard a, the west side of yard b)
    expect(a.gates[0].at).toBeGreaterThan(0);
    expect(yardRings(g).map(r => r.id).sort()).toEqual([a.id, b.id].sort());
    expect(coveredRoute(g, a.id, b.id)).toBe(true);
    expect(defenseReport(g).homes.every(h => h.covered)).toBe(true);
    // planning another from the same spot does not cut a second door
    planRun(g, 'covered_walkway', [[cx - 5, cz + 0.05], [cx + 5, cz + 0.05]]);
    expect(a.gates).toHaveLength(1);
  });

  it('every people-stopping wall tier stands on a footing that closes it to the ground', () => {
    for (const k of Object.keys(PERIMETER) as PerimeterKind[]) {
      const d = PERIMETER[k];
      const needs = d.blocks.people > 0 && d.height > 0 && !d.walkway && !d.twoWay && !d.egressOnly && !['thorn_hedge', 'earth_berm', 'creek_bars'].includes(k);
      expect(footingOf(k) !== null, k).toBe(needs);
    }
    expect(footingOf('container_wall')).toBe('plinth');
    expect(footingOf('steel_wall')).toBe('curb');
    expect(footingOf('concrete_wall')).toBe('plinth');
  });
});

import { UPGRADE_NEXT, upgradeRun, runBlocked, addRunWork, runBill, SALVAGE } from './perimeter';

describe('the wall chain: containers and the poured-concrete top tier', () => {
  it('containers upgrade to a steel wall, and the chain ends at poured concrete', () => {
    expect(UPGRADE_NEXT.container_wall).toBe('steel_wall');
    expect(UPGRADE_NEXT.electric_steel).toBe('concrete_wall');
    expect(UPGRADE_NEXT.concrete_wall).toBeUndefined();
    let k: PerimeterKind | undefined = 'split_rail'; const seen: string[] = [];
    while (k) { seen.push(k); k = UPGRADE_NEXT[k]; }
    expect(seen.at(-1)).toBe('concrete_wall');
    // stronger at each step from a container up
    expect(PERIMETER.steel_wall.blocks.people).toBeGreaterThan(PERIMETER.container_wall.blocks.people);
    expect(PERIMETER.concrete_wall.blocks.people).toBeGreaterThan(PERIMETER.electric_steel.blocks.people - 1e-9);
    expect(PERIMETER.concrete_wall.deepFooting).toBe(true);
    expect(PERIMETER.concrete_wall.height).toBeGreaterThan(PERIMETER.steel_wall.height);
  });

  it('upgrading a finished container wall lays out steel beside it, and the containers go (half their cost back) once it is done', () => {
    const g = newGame(5); g.stock.rebar = 60; g.stock.concrete = 60; g.stock.hardware = 20; g.stock.wire = 20; g.stock.container = 0;
    const c = done(g, 'container_wall', [[0, 0], [6, 0], [6, 6], [0, 6], [0, 0]]);
    expect(upgradeRun(g, c.id)).toBeNull();
    const steel = g.perimeter.find(r => r.replaces === c.id)!;
    expect(steel.kind).toBe('steel_wall');
    addRunWork(g, steel, steel.hours);
    expect(g.perimeter.some(r => r.id === c.id)).toBe(false);
    expect(g.stock.container).toBe(Math.floor((runBill('container_wall', 24)).container! * SALVAGE));
  });

  it('a poured-concrete wall needs a county permit (fee and a review) before work starts; no county, no wait', () => {
    const g = newGame(5); g.disaster.tracks = { ...g.disaster.tracks, banks: 1, law: 1 };
    g.stock.rebar = 99; g.stock.concrete = 99; g.stock.hardware = 9;
    const money = g.money;
    const r = planRun(g, 'concrete_wall', [[0, 0], [5, 0]]);
    expect(g.money).toBeLessThan(money);
    expect(runBlocked(g, r)).toMatch(/county permit/);
    g.clock.t += 40;
    expect(runBlocked(g, r)).toBeNull();
    const h = newGame(5); h.disaster.tracks = { ...h.disaster.tracks, banks: 0, law: 0 };
    const r2 = planRun(h, 'concrete_wall', [[0, 0], [5, 0]]);
    expect(r2.permitAt).toBeUndefined();
  });
});
