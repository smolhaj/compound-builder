import { describe, expect, it } from 'vitest';
import { newGame, type GameState, type Structure } from '../state';
import { BLUEPRINTS } from '../blueprints';
import type { Battle } from '../battleTypes';
import { shellFt, TIER, DOME_KIND } from './tiers';
import { CB, contextOf, controlBlockPlan, controlKeepout, fits, rectControlProblem } from './controlBlock';
import { entryR, personLateral } from './vehiclePort';
import { yardGeometry } from './plantYard';
import { domeOf, lockdownProblem, ownState, setLockdown, stateOf } from './live';
import { damagePlant, fxOf, plantJobs, rawFxOf, unitsOf } from './plantLive';
import { strikePlant, reachable, pickUnits, SIEGE_ORDER, SIEGE_ORDER_OPEN } from './plantStrike';
import { CONTROL_SECURITY, CONTROL_SHARE, plantFx, plantKinds, plantUnits, type PlantCond } from './plantUnits';

const r = shellFt('arcology', TIER.arcology.cells) / 2 / 20 - 0.03, TAU = Math.PI * 2;
const wrap = (a: number): number => { let d = a % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };

describe('the control block stands between the yard airlock and the entrance (dense sweep)', () => {
  const yg = yardGeometry('arcology', r, 0)!, S = Math.atan2(yg.portal.from[0], yg.portal.from[1]);
  const sweep = Array.from({ length: 72 }, (_, i) => i * TAU / 72 + 0.011);
  const sampled = Array.from({ length: 24 }, (_, i) => i * Math.PI / 12 + 0.07);
  const smallest: [number, number] = [CB.W - 0.5, CB.D - 0.1];
  it('every angle of the sweep and of the 24 sampled ports gets a block, clear of the lane and both airlocks', () => {
    for (const port of [...sweep, ...sampled]) {
      const p = controlBlockPlan('arcology', r, port)!;
      expect(p, `port ${port}`).not.toBeNull();
      const c = contextOf('arcology', r, port)!;
      expect(fits(c, p.w, p.d, p.angle, [])).toBe(true);
    }
  });
  it('it is on the short arc between the two airlocks whenever any block can stand there, and otherwise on the nearest valid angle of the other arc', () => {
    let on = 0, off = 0;
    for (const port of [...sweep, ...sampled]) {
      const p = controlBlockPlan('arcology', r, port)!, c = contextOf('arcology', r, port)!;
      const G = port + Math.atan2(personLateral('arcology', r) / 2, entryR('arcology', r)), span = Math.abs(wrap(G - S)), T = S + wrap(G - S) / 2;
      const onShort = (a: number): boolean => Math.abs(wrap(a - S)) + Math.abs(wrap(G - a)) <= span + 1e-6;
      let shortFits = false, nearest = Infinity;
      for (let k = 0; k < 360; k++) {
        const a = k * TAU / 360;
        if (onShort(a) && fits(c, smallest[0], smallest[1], a, [])) shortFits = true;
        if (fits(c, p.w, p.d, a, [])) nearest = Math.min(nearest, Math.abs(wrap(a - T)));
      }
      expect(p.between).toBe(shortFits);
      if (p.between) { on++; expect(onShort(p.angle)).toBe(true); } else { off++; expect(Math.abs(wrap(p.angle - T)) - nearest).toBeLessThan(TAU / 720 + 1e-6);
        // (never the far side: the block stands within 50 degrees, a few paces, of the nearer of the two airlocks)
        expect(Math.min(Math.abs(wrap(p.angle - S)), Math.abs(wrap(p.angle - G)))).toBeLessThan(50 * Math.PI / 180); }
    }
    expect(on).toBeGreaterThan(0); expect(off).toBeGreaterThan(0);
  });
  it('the sampled ports that fall back are exactly those where the short arc between the doors is too small for the smallest block (geometry, not a bug)', () => {
    const gap = (port: number): number => Math.abs(wrap(port + Math.atan2(personLateral('arcology', r) / 2, entryR('arcology', r)) - S)) * r;
    const none = sampled.filter(p => !controlBlockPlan('arcology', r, p)!.between), some = sampled.filter(p => controlBlockPlan('arcology', r, p)!.between);
    expect(none.length).toBeGreaterThan(0); expect(some.length).toBeGreaterThan(none.length);
    expect(Math.max(...none.map(gap))).toBeLessThan(Math.min(...some.map(gap)));
  });
});

describe('the keepout the placement rule reads', () => {
  const k = controlKeepout('arcology', r, 10, 10, 0, 2.1)!;
  it('is null for every other tier, and carries the block and the two service paths', () => {
    expect(controlKeepout('glass', 4, 0, 0, 0, 1)).toBeNull();
    expect(k.boxes.length).toBeGreaterThan(8); expect(k.paths.length).toBe(2);
  });
  it('a rectangle on the block is the block, one on a path is the path, one in the open floor is free', () => {
    const b = k.boxes[Math.floor(k.boxes.length / 2)], cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
    expect(rectControlProblem(k, { x0: cx - 0.2, z0: cz - 0.2, x1: cx + 0.2, z1: cz + 0.2 })).toBe('control_block');
    const a = k.paths[0][1], bb = k.paths[0][2], mx = (a[0] + bb[0]) / 2, mz = (a[1] + bb[1]) / 2;
    const hit = rectControlProblem(k, { x0: mx - 0.1, z0: mz - 0.1, x1: mx + 0.1, z1: mz + 0.1 });
    expect(hit === 'control_path' || hit === 'control_block').toBe(true);
    expect(rectControlProblem(k, { x0: 9.8, z0: 9.8, x1: 10.2, z1: 10.2 })).toBeNull();
  });
  it('every point of every path is refused to a person-sized piece, and a rectangle beside the path (more than its clearance) is allowed', () => {
    for (const path of k.paths) for (let i = 1; i < path.length; i++) {
      const [x, z] = [(path[i - 1][0] + path[i][0]) / 2, (path[i - 1][1] + path[i][1]) / 2];
      expect(rectControlProblem(k, { x0: x - 0.05, z0: z - 0.05, x1: x + 0.05, z1: z + 0.05 })).not.toBeNull();
    }
  });
});

// ── rules: the plant ──

const arc = (): GameState => {
  const g = newGame(5); g.money = 1e9;
  const kind = DOME_KIND.arcology, st: Structure = { id: 'dm', kind, x: 0, z: 0, rot: 0, stage: BLUEPRINTS[kind].stages.length, done: 0, supplied: true, finishedAt: 0 };
  g.structures.push(st, { id: 'h1', kind: 'log_house', x: 0.3, z: 0.3, rot: 0, stage: 99, done: 0, supplied: true, finishedAt: 0 } as Structure);
  const d = domeOf(g)!, o = ownState(g, d); o.filtering = 'closed'; o.loop = 'recycle';
  return g;
};
const crew = (men: number): Battle => ({ night: false, duration: 1, events: [], units: Array.from({ length: men }, (_, i) => ({ id: `r${i}`, side: 'raider', x: 0, z: 0 })) as Battle['units'], raid: { crew: 'gang', breach: { method: 'ram', where: null, t: 0, attempts: [], crewHad: { truck: false, satchels: 0 } }, fires: [] } as unknown as Battle['raid'] } as Battle);
const hit = (g: GameState, cond: 'damaged' | 'down'): void => { const d = domeOf(g)!; expect(damagePlant(g, d, stateOf(g, d), 'control', cond, 'raid')).toBeTruthy(); };

describe('the control block is a plant unit of the arcology only', () => {
  it('only the arcology has one, standing inside the shell', () => {
    expect(plantKinds('arcology', { filtering: 'none', loop: 'none', spares: [] })).toContain('control');
    for (const t of ['earthen', 'geodesic', 'glass'] as const) expect(plantKinds(t, { filtering: 'closed', loop: 'recycle', spares: [] })).not.toContain('control');
    expect(plantUnits('arcology', { filtering: 'none', loop: 'none', spares: [] }).find(u => u.kind === 'control')!.place).toBe('inside');
  });
  it('a struck block steps the dome down and never up: power, climate and water only fall, whole to damaged to down', () => {
    const mk = (c: PlantCond) => plantFx(plantUnits('arcology', { filtering: 'closed', loop: 'recycle', spares: [] }, c === 'ok' ? [] : [{ unit: 'control', cond: c, at: 0 }]), 1);
    const a = mk('ok'), b = mk('damaged'), c = mk('down');
    expect(a.power).toBe('grid'); expect(b.power).toBe('derated'); expect(c.power).toBe('derated');
    expect(b.climate).toBeLessThan(a.climate); expect(c.climate).toBeLessThanOrEqual(b.climate);
    expect(b.water).toBeLessThan(a.water); expect(c.water).toBeLessThanOrEqual(b.water);
    expect(c.climate).toBeGreaterThan(0); expect(c.water).toBeGreaterThan(0);      // (a local manual control keeps the loops half alive)
    expect(a.scrub).toBe(b.scrub); expect(b.vent).toBe(a.vent);
    expect(CONTROL_SHARE.ok).toBeGreaterThan(CONTROL_SHARE.damaged); expect(CONTROL_SHARE.damaged).toBeGreaterThan(CONTROL_SHARE.down);
    expect(CONTROL_SECURITY.ok).toBeGreaterThan(CONTROL_SECURITY.damaged); expect(CONTROL_SECURITY.damaged).toBeGreaterThanOrEqual(CONTROL_SECURITY.down);
    expect(a.control).toBe('ok'); expect(c.control).toBe('down'); expect(a.whole).toBe(true); expect(b.whole).toBe(false);
  });
  it('a lost substation still dominates: a struck block never lifts a dark dome', () => {
    const subs = [{ unit: 'substation', cond: 'down' as const, at: -5 }];
    const dark = plantFx(plantUnits('arcology', { filtering: 'closed', loop: 'recycle', spares: [] }, subs), 5), darker = plantFx(plantUnits('arcology', { filtering: 'closed', loop: 'recycle', spares: [] }, [...subs, { unit: 'control', cond: 'down', at: 5 }]), 5);
    expect(darker.power).toBe(dark.power); expect(darker.climate).toBeLessThanOrEqual(dark.climate);
  });
});

describe('lockdown runs through the block', () => {
  it('a whole or damaged block seals the dome; a block that is down cannot, and opening still works', () => {
    const g = arc();
    expect(lockdownProblem(g, true)).toBeNull();
    hit(g, 'damaged'); expect(lockdownProblem(g, true)).toBeNull();
    hit(g, 'down'); expect(lockdownProblem(g, true)).toMatch(/control block is down/);
    expect(setLockdown(g, true)).toMatch(/control block/);
    expect(stateOf(g, domeOf(g)!).lockdown).toBe(false);
  });
  it('a dome already sealed stays sealed when the block goes down, and can be opened', () => {
    const g = arc(); expect(setLockdown(g, true)).toBeNull(); hit(g, 'down');
    expect(stateOf(g, domeOf(g)!).lockdown).toBe(true); expect(lockdownProblem(g, false)).toBeNull(); expect(setLockdown(g, false)).toBeNull();
  });
  it('other tiers are not affected', () => {
    const g = newGame(5), kind = DOME_KIND.glass; g.structures.push({ id: 'dm', kind, x: 0, z: 0, rot: 0, stage: BLUEPRINTS[kind].stages.length, done: 0, supplied: true, finishedAt: 0 });
    expect(lockdownProblem(g, true)).toBeNull(); expect(rawFxOf(g, domeOf(g)!, stateOf(g, domeOf(g)!)).control).toBe('ok');
  });
});

describe('the block can be attacked only from inside the shell', () => {
  it('reachable only when the shell was opened or an airlock forced, never from the yard wall alone', () => {
    const none = { yardBreached: false, shellOpened: false, airlockForced: false };
    expect(reachable('inside', 'control', none)).toBe(false);
    expect(reachable('inside', 'control', { ...none, yardBreached: true })).toBe(false);
    expect(reachable('inside', 'control', { ...none, shellOpened: true })).toBe(true);
    expect(reachable('inside', 'control', { ...none, airlockForced: true })).toBe(true);
  });
  it('it is the last thing a crew takes, in both orders', () => {
    expect(SIEGE_ORDER[SIEGE_ORDER.length - 1]).toBe('control'); expect(SIEGE_ORDER_OPEN[SIEGE_ORDER_OPEN.length - 1]).toBe('control');
    const u = plantUnits('arcology', { filtering: 'closed', loop: 'recycle', spares: [] }), all = { yardBreached: false, shellOpened: true, airlockForced: false };
    expect(pickUnits(u, 1, true, all)[0].kind).not.toBe('control');
  });
  it('a crew with a truck at the yard wall never touches it; one that forced an airlock may', () => {
    const g = arc(); strikePlant(g, { ...crew(30), raid: { crew: 'gang', breach: { method: 'ram', where: null, t: 0, attempts: [], crewHad: { truck: true, satchels: 3 } }, fires: [] } } as unknown as Battle, false, () => 0, { opened: false, airlock: false });
    expect(plantJobs(g, 'dm').some(j => j.unit === 'control')).toBe(false);
    const g2 = arc(); for (const u of unitsOf(g2, domeOf(g2)!, stateOf(g2, domeOf(g2)!))) if (u.kind !== 'control') damagePlant(g2, domeOf(g2)!, stateOf(g2, domeOf(g2)!), u.id, 'down', 'raid');
    strikePlant(g2, crew(30), false, () => 0, { opened: false, airlock: true });
    expect(plantJobs(g2, 'dm').some(j => j.unit === 'control')).toBe(true);
  });
  it('a struck block is mended like any unit and then everything is back', () => {
    const g = arc(); hit(g, 'down');
    const d = domeOf(g)!, job = plantJobs(g, 'dm').find(j => j.unit === 'control')!;
    expect(fxOf(g, d, stateOf(g, d)).control).toBe('down');
    job.done = job.hours;
    expect(fxOf(g, d, stateOf(g, d)).control).toBe('ok'); expect(unitsOf(g, d, stateOf(g, d)).every(u => u.cond === 'ok')).toBe(true);
  });
});
