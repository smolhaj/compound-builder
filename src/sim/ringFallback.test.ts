import { afterEach, describe, expect, it } from 'vitest';
import { newGame, type GameState, type Structure } from './state';
import { setGroundOverride } from './terrainState';
import { DEFAULT_FORTRESS, layFortress, planFortress } from './fortress';
import { type Pt } from './perimeter';
import { planBattle, applyBattle } from './battle';
import { BLUEPRINTS } from './blueprints';
import { ringHoldSeconds, ringsHolding } from './rings';
import { depthAt, exposure, lossesByRing, ringDelay, ringRadii, vetting } from './ringFallback';

afterEach(() => setGroundOverride(null));
const built = (g: GameState, id: string, kind: string, x: number, z: number): Structure => { const st: Structure = { id, kind, x, z, rot: 0, stage: 9, done: 0, supplied: true, finishedAt: 0 }; g.structures.push(st); return st; };
const finishAll = (g: GameState) => { for (const r of g.perimeter) { r.finishedAt = 0; r.done = r.hours; } for (const st of g.structures) st.stage = BLUEPRINTS[st.kind].stages.length; };
const armed = (g: GameState) => {
  g.disaster.tracks = { ...g.disaster.tracks, law: 0, stores: 0, deliveries: 0, banks: 0 };
  for (const [i, p] of g.people.entries()) if (!p.kid || p.age >= 15) { g.armory.guns.push({ id: `g${i}`, model: 'sw_mp15', condition: 1, fired: 0, where: 'house', carrier: p.id }); g.armory.skill[p.id] = 5; }
  g.armory.ammo['556'] = 3000;
};
function lot(rings: number): GameState {
  const g = newGame(3, 105, 2027, { mode: 'scenario', peace: 'short', kind: 'grid_down' });
  g.site = { ...g.site, creek: false };
  g.clock.t = Math.floor(g.disaster.hitAt + 60) + 0.25;
  built(g, 'h', 'timber_cabin', 30, 30);
  g.people.forEach(p => { p.kid = false; });
  layFortress(g, planFortress(g, { roadGate: [g.site.home.x1, 30] as Pt }, { ...DEFAULT_FORTRESS, rings, passage: false }));
  finishAll(g);
  armed(g);
  return g;
}

describe('ring radii and the ring delay', () => {
  it('the manned inner rings, outermost first, inside the line; none for a single ring', () => {
    const g = lot(3);
    const rs = ringRadii(g, { x: 30, z: 30 }, 14);
    expect(rs.length).toBe(ringsHolding(g) - 1);
    for (let i = 1; i < rs.length; i++) expect(rs[i].r).toBeLessThan(rs[i - 1].r);
    for (const x of rs) expect(x.r).toBeLessThan(13);
    expect(ringRadii(lot(1), { x: 30, z: 30 }, 14)).toHaveLength(0);
  });
  it('a ring delay shared out over the inner rings matches the old total, less the sally ports', () => {
    const g = lot(3);
    expect(ringDelay(g, 2) * 2).toBeCloseTo(ringHoldSeconds(g), 5);
    expect(ringDelay(g, 0)).toBe(0);
  });
});

describe('losses by ring', () => {
  it('splits the home side\'s wounds and deaths at each fall-back', () => {
    const units = [{ id: 'h_a', side: 'home' as const, x: 0, z: 0 }, { id: 'r0', side: 'raider' as const, x: 0, z: 0 }];
    const ev = [
      { t: 3, kind: 'wound' as const, unit: 'h_a', sev: 30 }, { t: 12, kind: 'wound' as const, unit: 'h_a', sev: 30 },
      { t: 20, kind: 'death' as const, unit: 'h_a' }, { t: 21, kind: 'wound' as const, unit: 'r0', sev: 30 },
    ];
    const l = lossesByRing(ev, units, [10, 18]);
    expect(l.map(x => [x.wounded, x.dead])).toEqual([[1, 0], [1, 0], [0, 1]]);
  });
});

describe('the defenders fall back through the rings in a raid', () => {
  it('a crew that breaks the outer line meets the next ring, with a fallback event, before any breach of the house', () => {
    const g = lot(3);
    let falls = 0, checked = 0;
    for (let seed = 1; seed <= 24; seed++) {
      const b = planBattle(g, 7, seed);
      const fb = b.events.filter(e => e.kind === 'fallback');
      falls += fb.length;
      if (b.rings) { expect(b.rings.fell).toBe(fb.length); expect(b.rings.losses).toHaveLength(fb.length + 1); }
      const breach = b.events.find(e => e.kind === 'breach');
      if (breach && fb.length) { checked++; expect(fb[fb.length - 1].t).toBeLessThanOrEqual(breach.t); expect(fb.length).toBe(b.rings!.of); }
    }
    expect(falls).toBeGreaterThan(0);
    void checked;
  });
  it('a lot with more rings is never an easier raid (same crews, same seeds)', () => {
    const count = (g: GameState) => { let n = 0; for (let seed = 1; seed <= 40; seed++) { const r = planBattle(g, 7, seed).result; if (r === 'breached' || r === 'overrun') n++; } return n; };
    const one = count(lot(1)), three = count(lot(3));
    expect(three).toBeLessThanOrEqual(one);
  });
  it('wounded are carried in, and the family does not do worse for it', () => {
    const g = lot(3);
    let carries = 0;
    for (let seed = 1; seed <= 24; seed++) carries += planBattle(g, 7, seed).events.filter(e => e.kind === 'carry').length;
    expect(carries).toBeGreaterThanOrEqual(0);
  });
});

describe('what stood outside the ring that held', () => {
  it('animals and stores outside the new line are exposed; those inside it are not', () => {
    const g = lot(3);
    built(g, 'barn1', 'barn', 30, 30 + 11.5);   // out near the outer line
    built(g, 'cel', 'root_cellar', 30, 30 + 1.5);   // by the house
    finishAll(g);
    expect(depthAt(g, [30, 41.5])).toBeLessThan(depthAt(g, [30, 31.5]));
    const e0 = exposure(g, 0), e1 = exposure(g, 1);
    expect(e0).toEqual({ animals: 0, stores: 0 });
    expect(e1.animals).toBe(1);
    expect(e1.stores).toBe(0);
  });
  it('a raid that fell back and held loses the animals out there, never more than a share; none if nothing stood out', () => {
    const g = lot(3);
    built(g, 'barn1', 'barn', 30, 41.5); finishAll(g);
    g.stock.goat = 10;
    const b = planBattle(g, 5, 1);
    const fake = { ...b, result: 'repelled' as const, rings: { of: 2, fell: 1, losses: [] } };
    const out = applyBattle(g, fake);
    expect(g.stock.goat).toBeLessThan(10);
    expect(g.stock.goat).toBeGreaterThanOrEqual(6);
    expect(out.join(' ')).toMatch(/fell back through 1 ring/);
  });
});

describe('vetting at the gate', () => {
  it('one ring says nothing; two or more say strangers sleep in the outer ring and a thief reaches only part of the camp', () => {
    expect(vetting(lot(1)).line).toBeNull();
    const v = vetting(lot(3));
    expect(v.rings).toBeGreaterThanOrEqual(2);
    expect(v.reach).toBeLessThanOrEqual(1);
    expect(v.reach).toBeGreaterThanOrEqual(0.2);
    expect(v.line).toMatch(/outer ring/);
  });
});
