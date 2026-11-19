import { describe, expect, it } from 'vitest';
import { DOME_TIERS, TIER, kindOfCells } from './tiers';
import { digStops, DIG_DEEPER } from './crossing';
import { BLUEPRINTS } from '../blueprints';
import {
  BUNKER_DOME, LEARNED_DEEPER_FT, againstSkirt, bunkerBlueprint, bunkerProblemUnder, bunkerShellShare, coverOf, craterOpen, digReach, domeAt, floorFt,
  footingYd, holdDome, holdFor, inAirlockLane, projectHours, refuge, shellR, skirtNeedFt, skirtTurns, usableR, bpHours, type UnderDome,
} from './bunker';

const hatchRect = (x: number, z: number) => ({ x0: x - 0.25, z0: z - 0.25, x1: x + 0.25, z1: z + 0.25 });
const dome = (tier: typeof DOME_TIERS[number], cells = TIER[tier].cells) => domeAt(kindOfCells(tier, cells), 100, 100)!;
const FLOOR = floorFt(1, 1 - 0.8);   // the standard 16 ft shaft plus the slab

describe('where a bunker may stand under a dome', () => {
  it('the smallest earthen dome has no room for any bunker; a 30 ft one holds a hatch, a 40 ft one a bunkroom', () => {
    expect(againstSkirt(dome('earthen', 2), hatchRect(100, 100))).toBe('straddles');
    expect(againstSkirt(dome('earthen', 3), hatchRect(100, 100))).toBe('inside');
    expect(againstSkirt(dome('earthen', 3), { x0: 99.5, z0: 99.5, x1: 100.5, z1: 100.5 })).toBe('straddles');
    expect(againstSkirt(dome('earthen', 4), { x0: 99.5, z0: 99.5, x1: 100.5, z1: 100.5 })).toBe('inside');
  });
  it('a bigger dome holds a bunkroom', () => {
    for (const t of ['geodesic', 'glass', 'arcology'] as const) expect(againstSkirt(dome(t), { x0: 99.5, z0: 99.5, x1: 100.5, z1: 100.5 })).toBe('inside');
  });
  it('a room across the ring, or in the one cell next to it, is refused; one wholly outside is an ordinary bunker', () => {
    const d = dome('geodesic'), r = shellR(d);
    expect(bunkerProblemUnder(d, hatchRect(100 + r, 100), FLOOR)).toBe('straddles_skirt');
    expect(bunkerProblemUnder(d, hatchRect(100 + usableR(d), 100), FLOOR)).toBe('straddles_skirt');
    expect(bunkerProblemUnder(d, hatchRect(100 + r + 1, 100), FLOOR)).toBeNull();
    expect(bunkerProblemUnder(d, hatchRect(100, 100), FLOOR)).toBeNull();
  });
  it('the way in to an airlock stays clear', () => {
    const d = dome('geodesic');
    // the first airlock is at the front (+z)
    expect(inAirlockLane(d, hatchRect(100, 100 + usableR(d) - 0.1))).toBe(true);
    expect(inAirlockLane(d, hatchRect(100, 100))).toBe(false);
  });
});

describe('the skirt against the bunker floor', () => {
  it('floor plus margin is what the skirt must reach', () => { expect(skirtNeedFt(17)).toBe(20); expect(skirtNeedFt(17.2)).toBe(21); });
  it('geodesic and deeper skirts cover the standard bunker; the earthen dome needs a deep footing', () => {
    expect(coverOf('geodesic', FLOOR).state).toBe('covered');
    expect(coverOf('glass', FLOOR).state).toBe('covered');
    expect(coverOf('arcology', FLOOR).state).toBe('covered');
    const e = coverOf('earthen', FLOOR);
    expect(e.state).toBe('footing');
    expect(e.extra).toBe(skirtNeedFt(FLOOR) - TIER.earthen.skirtFt);
  });
  it('a floor too far down is refused, and a deeper tier never refuses what a shallower one allows', () => {
    expect(coverOf('earthen', 40).state).toBe('refused');
    for (let fl = 5; fl < 70; fl += 1) {
      const rank = DOME_TIERS.map(t => ['covered', 'footing', 'refused'].indexOf(coverOf(t, fl).state));
      for (let i = 1; i < rank.length; i++) expect(rank[i]).toBeLessThanOrEqual(rank[i - 1]);
    }
  });
  it('footing already paid lowers what is still owed', () => {
    expect(coverOf('earthen', FLOOR, 5).extra).toBe(coverOf('earthen', FLOOR).extra - 5);
    expect(footingYd(dome('earthen'), 0)).toBe(0);
    expect(footingYd(dome('earthen'), 10)).toBeGreaterThan(0);
  });
  it('a bunker under a ring too shallow for any footing is refused with the right reason', () => {
    expect(bunkerProblemUnder(dome('earthen', 4), hatchRect(100, 100), 40)).toBe('skirt_too_shallow');
  });
});

describe('reaching the bunker by digging', () => {
  it('the same formula as the crossing rule', () => {
    expect(LEARNED_DEEPER_FT).toBe(DIG_DEEPER);
    for (const ft of [4, 10, 20, 30, 60]) for (const a of [0, 0.5, 1]) expect(skirtTurns(ft, a)).toBeCloseTo(digStops(ft, a));
  });
  it('is monotone: a deeper skirt, a built ring or more sensors never make it worse; a better crew never makes it better', () => {
    for (const adapt of [0, 0.5, 1]) {
      let prev = 2;
      for (let ft = 0; ft <= 70; ft += 2) { const v = digReach({ ringBuilt: true, skirtFt: ft, adapt }); expect(v).toBeLessThanOrEqual(prev + 1e-9); prev = v; }
      expect(digReach({ ringBuilt: true, skirtFt: 20, adapt })).toBeLessThanOrEqual(digReach({ ringBuilt: false, skirtFt: 20, adapt }));
    }
    for (let s = 0; s < 1; s += 0.1) expect(digReach({ ringBuilt: true, skirtFt: 12, sensorDetect: s + 0.1 })).toBeLessThanOrEqual(digReach({ ringBuilt: true, skirtFt: 12, sensorDetect: s }) + 1e-9);
    for (let a = 0; a < 1; a += 0.1) expect(digReach({ ringBuilt: true, skirtFt: 30, adapt: a + 0.1 })).toBeGreaterThanOrEqual(digReach({ ringBuilt: true, skirtFt: 30, adapt: a }) - 1e-9);
  });
  it('a plain crew cannot reach a standard bunker under any tier from geodesic up', () => {
    for (const t of ['geodesic', 'glass', 'arcology'] as const) expect(digReach({ ringBuilt: true, skirtFt: TIER[t].skirtFt })).toBeLessThan(0.01);
  });
});

describe('the refuge', () => {
  const rooms = ['bunker_hatch', 'bunker_dorm', 'bunker_galley', 'bunker_plant'];
  it('takes people from the dome through a finished entrance', () => {
    const r = refuge({ hazard: 'breach', people: 12, rooms, domePowered: true });
    expect(r.open).toBe(true);
    expect(r.places).toBe((8 + 2) + (2 + 2) + 2);
    expect(r.sheltered).toBe(12);
    expect(r.power).toBe('dome');
    expect(r.air).toBe('filtered');
  });
  it('has its own power when the dome plant is down, and none with no plant room', () => {
    expect(refuge({ hazard: 'fire', people: 3, rooms, domePowered: false }).power).toBe('own');
    expect(refuge({ hazard: 'fire', people: 3, rooms: ['bunker_hatch', 'bunker_dorm'], domePowered: false }).power).toBe('none');
  });
  it('without an entrance nobody goes down, and more rooms never shelter fewer', () => {
    expect(refuge({ hazard: 'siege', people: 5, rooms: ['bunker_dorm'], domePowered: true }).sheltered).toBe(0);
    let prev = 0;
    for (let n = 0; n < 6; n++) { const s = refuge({ hazard: 'siege', people: 99, rooms: ['bunker_hatch', ...Array(n).fill('bunker_dorm')], domePowered: true }).sheltered; expect(s).toBeGreaterThanOrEqual(prev); prev = s; }
  });
});

describe('with the dome or after it', () => {
  const ud = (w: boolean, footYd = 0): UnderDome => ({ id: 's1', with: w, footFt: 0, footYd });
  it('built with the dome is never longer than apart, and never free', () => {
    for (const k of Object.keys(BLUEPRINTS).filter(k => k.startsWith('bunker_'))) {
      const bp = BLUEPRINTS[k], w = bunkerBlueprint(bp, ud(true)), a = bunkerBlueprint(bp, ud(false));
      expect(bpHours(w)).toBeLessThanOrEqual(bpHours(bp));
      expect(bpHours(w)).toBeGreaterThan(0);
      expect(bpHours(a)).toBeGreaterThanOrEqual(bpHours(bp));
      expect(bpHours(w)).toBeLessThan(bpHours(a));
      expect(w.stages.map(s => s.id)).toEqual(bp.stages.map(s => s.id));
      for (const st of w.stages) { expect(st.hours).toBeGreaterThanOrEqual(1); for (const n of Object.values(st.materials)) expect(n!).toBeGreaterThanOrEqual(0); }
    }
    const h = BLUEPRINTS.bunker_dorm.stages.reduce((s, x) => s + x.hours, 0);
    expect(projectHours(5000, [h, h], 'with')).toBeLessThanOrEqual(projectHours(5000, [h, h], 'apart'));
    expect(projectHours(5000, [h, h], 'with')).toBeLessThan(projectHours(5000, [h, h], 'after'));
    expect(BUNKER_DOME.WITH_HOURS).toBeGreaterThanOrEqual(0.4); expect(BUNKER_DOME.WITH_HOURS).toBeLessThanOrEqual(0.6);
  });
  it('saves a little on the excavator hire; the shored dig needs lumber; the footing adds concrete and labor', () => {
    const bp = BLUEPRINTS.bunker_dorm, f = (b: typeof bp) => b.stages.find(s => s.id === 'foundation')!;
    expect(f(bunkerBlueprint(bp, ud(true))).materials.excavator ?? 0).toBeLessThanOrEqual(f(bp).materials.excavator ?? 0);
    expect(f(bunkerBlueprint(bp, ud(false))).materials.lumber ?? 0).toBeGreaterThan(f(bp).materials.lumber ?? 0);
    const foot = f(bunkerBlueprint(bp, ud(true, 40)));
    expect(foot.materials.concrete!).toBe(f(bp).materials.concrete! + 40);
    expect(foot.hours).toBeGreaterThan(f(bunkerBlueprint(bp, ud(true))).hours);
  });
});

describe('stage order and the progress readout', () => {
  const piece = (stage: number, w = true) => ({ id: 'b', kind: 'bunker_dorm', stage, done: 0, underDome: { id: 'd', with: w, footFt: 0, footYd: 0 } });
  it('the dome waits to backfill until the walls and roof stand', () => {
    expect(holdDome(2, [piece(3)])).toMatch(/walls and roof/);
    expect(holdDome(2, [piece(4)])).toBeNull();
    expect(holdDome(1, [piece(1)])).toBeNull();
    expect(holdDome(2, [piece(1, false)])).toBeNull();
    expect(holdDome(2, [])).toBeNull();
  });
  it('a piece waits for the crater to be as deep as it needs', () => {
    const early = { tier: 'geodesic' as const, stage: 0, f: 0.3 }, deep = { tier: 'geodesic' as const, stage: 1, f: 0.1 };
    expect(holdFor(piece(1), early, 20)).toMatch(/crater/);
    expect(holdFor(piece(1), deep, 20)).toBeNull();
    expect(holdFor(piece(0), early, 20)).toBeNull();
    expect(holdFor(piece(1, false), early, 20)).toBeNull();
  });
  it('the crater is open only before the backfill stage', () => { expect(craterOpen(0)).toBe(true); expect(craterOpen(1)).toBe(true); expect(craterOpen(2)).toBe(false); });
  it('the shell share runs 0 to 1 over the shell stages and matches them', () => {
    const bp = BLUEPRINTS.bunker_dorm;
    expect(bunkerShellShare([])).toBeNull();
    expect(bunkerShellShare([{ bp, stage: 0, done: 0 }])).toBe(0);
    expect(bunkerShellShare([{ bp, stage: 4, done: 0 }])).toBe(1);
    let prev = -1;
    for (let st = 0; st < 4; st++) for (let k = 0; k <= 4; k++) { const v = bunkerShellShare([{ bp, stage: st, done: bp.stages[st].hours * k / 4 }])!; expect(v).toBeGreaterThanOrEqual(prev); prev = v; }
  });
});
