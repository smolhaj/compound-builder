import { afterEach, describe, expect, it } from 'vitest';
import { newGame, type GameState, type Structure } from './state';
import { setGroundOverride } from './terrainState';
import { planRun, PERIMETER, type Pt } from './perimeter';
import { WATER, airF, bridgeOff, bridgeOver, bridgeProblem, moatFx, moatSource, moatState, standingBridges, waterLines } from './waterWorks';
import { digDefense } from './tunnelers';

afterEach(() => setGroundOverride(null));
const flat = (creekZ: number | null) => ({ h: () => 0, creek: creekZ === null ? null : { zAt: () => creekZ, waterY: () => -0.1, halfWidth: 1.2 } });
function g0(): GameState { const g = newGame(3, 105, 2027, { mode: 'scenario', peace: 'short', kind: 'grid_down' }); g.clock.t = 400; return g; }
const ring = (h = 14): Pt[] => [[30 - h, 30 - h], [30 + h, 30 - h], [30 + h, 30 + h], [30 - h, 30 + h], [30 - h, 30 - h]];
const fin = (g: GameState, kind: Parameters<typeof planRun>[1], pts: Pt[], at = 0) => { const r = planRun(g, kind, pts); r.finishedAt = at; r.done = r.hours; r.supplied = true; return r; };

describe('the moat', () => {
  it('is a dug ditch that no truck crosses, priced like earthwork', () => {
    expect(PERIMETER.moat.blocks.vehicles).toBe(1);
    expect(PERIMETER.moat.height).toBeLessThan(0);
    expect(PERIMETER.moat.hours).toBeGreaterThan(PERIMETER.ditch.hours);
  });
  it('is fed by a creek within the leat\'s reach, else a pond, else only rain', () => {
    setGroundOverride(flat(40) as never);
    const g = g0(), r = fin(g, 'moat', ring());
    expect(moatSource(g, r)).toBe('creek');
    setGroundOverride(flat(300) as never);
    expect(moatSource(g, r)).toBe('rain');
    g.structures.push({ id: 'pd', kind: 'pond', x: 52, z: 30, rot: 0, stage: 9, done: 0, supplied: true, finishedAt: 0 } as Structure);
    expect(moatSource(g, r)).toBe('pond');
  });
  it('fills over days and tops out lower on rain alone', () => {
    setGroundOverride(flat(40) as never);
    const g = g0(), r = fin(g, 'moat', ring(), g.clock.t - 2);
    expect(moatState(g, r)!.level).toBeCloseTo(2 / WATER.FILL_DAYS.creek, 5);
    g.clock.t += 30;
    expect(moatState(g, r)!.level).toBe(1);
    setGroundOverride(flat(300) as never);
    expect(moatState(g, r)!.level).toBe(WATER.CAP.rain);
  });
  it('holds a crew at the water and hurts them wading, less so when it is shallow', () => {
    setGroundOverride(flat(40) as never);
    const g = g0(); fin(g, 'moat', ring());
    g.clock.t = 400.5;    // midday, summer-ish
    const fx = moatFx(g, [30, 30], Math.PI / 2, false)!;
    expect(fx.bridged).toBe(false);
    expect(fx.holdS).toBeGreaterThan(5);
    expect(fx.hazard!.p).toBeGreaterThan(0);
    setGroundOverride(flat(300) as never);
    const dry = moatFx(g, [30, 30], Math.PI / 2, false)!;
    expect(dry.holdS).toBeLessThan(fx.holdS);
  });
  it('does nothing to a crew that does not come across it', () => {
    setGroundOverride(flat(40) as never);
    const g = g0(); fin(g, 'moat', [[10, 60], [20, 60]]);
    expect(moatFx(g, [30, 30], Math.PI / 2, false)).toBeNull();
  });
  it('turns to ice in a hard freeze: crossed fast, with a risk of going through', () => {
    setGroundOverride(flat(40) as never);
    const g = g0(); fin(g, 'moat', ring());
    let cold = 0, warm = 0;
    let lo = Infinity, hi = -Infinity;
    for (let d = 0; d < 365; d++) { g.clock.t = 400 + d; const a = airF(g); if (a < lo) { lo = a; cold = d; } if (a > hi) { hi = a; warm = d; } }
    g.clock.t = 400 + warm; const sum = moatFx(g, [30, 30], Math.PI / 2, false)!;
    g.clock.t = 400 + cold; const win = moatFx(g, [30, 30], Math.PI / 2, false)!;
    expect(sum.frozen).toBe(false);
    if (lo <= 14) { expect(win.frozen).toBe(true); expect(win.holdS).toBeLessThan(sum.holdS); expect(win.hazard!.what).toBe('thin ice'); }
  });
  it('floods a tunnel dug beside it once it is full, as a ditch does', () => {
    setGroundOverride(flat(40) as never);
    const g = g0(), r = fin(g, 'moat', ring());
    const wall = fin(g, 'barbed_wire', [[10, 10], [50, 10]]);
    expect(digDefense(g, wall, [30, 12]).ditch).toBe(false);
    const w2 = fin(g, 'barbed_wire', [[10, 17], [50, 17]]);
    expect(digDefense(g, w2, [30, 17]).ditch).toBe(true);
    r.finishedAt = g.clock.t - 0.5;   // barely filled
    expect(digDefense(g, w2, [30, 17]).ditch).toBe(false);
  });
});

describe('the covered bridge', () => {
  it('needs water under it, a length a truss spans, and says why not', () => {
    setGroundOverride(flat(null) as never);
    const g = g0();
    expect(bridgeOff(g)).toMatch(/needs water/);
    expect(bridgeProblem(g, [[10, 10], [10, 14]])).toMatch(/nothing to cross/);
    fin(g, 'moat', ring());
    expect(bridgeOff(g)).toBeNull();
    expect(bridgeProblem(g, [[30, 47], [30, 41]])).toBeNull();
    expect(bridgeProblem(g, [[30, 47], [30, 46.5]])).toMatch(/too short/);
    expect(bridgeProblem(g, [[30, 90], [30, 10]])).toMatch(/too long/);
  });
  it('crosses the creek when the banks are on both sides of the channel', () => {
    setGroundOverride(flat(40) as never);
    const g = g0();
    expect(bridgeOver(g, [[20, 36], [20, 44]]).over).toBe('creek');
    expect(bridgeOver(g, [[20, 30], [20, 38]]).over).toBeNull();
  });
  it('turns a wading crew into a file across a gate: no wading, a walk to it, the gate hold', () => {
    setGroundOverride(flat(40) as never);
    const g = g0(); fin(g, 'moat', ring());
    const wet = moatFx(g, [30, 30], Math.PI / 2, false)!;
    fin(g, 'covered_bridge', [[30, 47], [30, 41]]);
    expect(standingBridges(g)).toHaveLength(1);
    const dry = moatFx(g, [30, 30], Math.PI / 2, false)!;
    expect(dry.bridged).toBe(true);
    expect(dry.hazard).toBeNull();
    const night = moatFx(g, [30, 30], Math.PI / 2, true)!;
    expect(night.holdS).toBeGreaterThan(dry.holdS);      // locked at night
    expect(wet.hazard).not.toBeNull();
    // a bridge on the far side costs the crew a walk round
    const g2 = g0(); fin(g2, 'moat', ring()); fin(g2, 'covered_bridge', [[16, 30], [10, 30]].map(([x, z]) => [x, z] as Pt));
    const far = moatFx(g2, [30, 30], Math.PI / 2, false)!;
    expect(far.holdS).toBeGreaterThan(dry.holdS);
  });
  it('a gap left in the moat for the drive is a causeway: no wading, no gate, but the walk to it and the file', () => {
    setGroundOverride(flat(40) as never);
    const g = g0(); const r = fin(g, 'moat', ring());
    const wet = moatFx(g, [30, 30], Math.PI / 2, false)!;
    r.gates.push({ at: 70, w: 0.8 });                      // the south side runs from (44,44) to (16,44), 56 to 84 along the ring: 70 is its middle
    const gap = moatFx(g, [30, 30], Math.PI / 2, false)!;
    expect(gap.hazard).toBeNull();
    expect(gap.holdS).toBeGreaterThan(0);
    expect(gap.holdS).toBeLessThan(wet.holdS);
    fin(g, 'covered_bridge', [[30, 47], [30, 41]]);
    const both = moatFx(g, [30, 30], Math.PI / 2, true)!;     // at night the bridge gate is locked, the causeway is not: they take the causeway
    expect(both.holdS).toBeLessThanOrEqual(gap.holdS + 1e-9);
  });
  it('is described in the Defense tab', () => {
    setGroundOverride(flat(40) as never);
    const g = g0(); fin(g, 'moat', ring()); fin(g, 'covered_bridge', [[30, 47], [30, 41]]);
    const lines = waterLines(g);
    expect(lines.some(l => /Moat/.test(l))).toBe(true);
    expect(lines.some(l => /Covered bridge over the moat/.test(l))).toBe(true);
  });
});
