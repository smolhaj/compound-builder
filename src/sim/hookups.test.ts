import { describe, expect, it } from 'vitest';
import { newGame, type GameState } from './state';
import { planStructure } from './construction';
import { planRun, type Pt } from './perimeter';
import { backupPower, fitRows, hookupsFor, needsHookup, storageTip } from './hookups';
import { defenseReport } from './defenseReport';
import { addFitWork, orderFit } from './utilities';

const fresh = () => { const g = newGame(11); g.structures = []; g.perimeter = []; g.utilities.grid = false; return g; };
const built = (g: GameState, kind: string, x: number, z: number) => { const st = planStructure(g, kind, x, z, 0); st.stage = 99; st.finishedAt = 0; return st; };
const line = (g: GameState, kind: 'power_cable' | 'water_pipe', a: Pt, b: Pt) => { const r = planRun(g, kind, [a, b], []); r.done = r.hours; r.finishedAt = 0; r.supplied = true; return r; };

describe('finished is not working (sim/hookups.ts)', () => {
  it('a finished house with no cable says so, and what to do', () => {
    const g = fresh();
    const h = built(g, 'cottage', 10, 10);
    const hk = hookupsFor(g, h);
    const wire = hk.find(x => x.kind === 'wire')!;
    expect(wire.state).toBe('missing');
    expect(wire.text).toMatch(/No power/);
    expect(wire.todo).toMatch(/cable/i);
    expect(wire.tool).toBe('fence:power_cable');
    const plumb = hk.find(x => x.kind === 'plumb')!;
    expect(plumb.state).toBe('missing');
    expect(plumb.todo).toMatch(/drill a well or build a water tower/);   // no pressure source anywhere
    expect(needsHookup(g).map(x => x.kind)).toEqual(expect.arrayContaining(['wire', 'plumb']));
  });

  it('with a cable from the solar array the house needs wiring: one click, then it works', () => {
    const g = fresh();
    const h = built(g, 'cottage', 10, 10), sol = built(g, 'solar_array', 14, 10);
    line(g, 'power_cable', [sol.x, sol.z], [h.x, h.z]);
    const wire = hookupsFor(g, h).find(x => x.kind === 'wire')!;
    expect(wire.state).toBe('ready');
    expect(wire.text).toBe('Needs wiring');
    const f = orderFit(g, h.id, 'wire');
    expect(hookupsFor(g, h).find(x => x.kind === 'wire')!.state).toBe('underway');
    g.stock.cable += 3; g.stock.hardware += 1;
    addFitWork(g, f, 100, 5);
    expect(hookupsFor(g, h).find(x => x.kind === 'wire')!.state).toBe('done');
  });

  it('a solar array and a battery that share no cable are both flagged, and the Defense tab says there is no backup', () => {
    const g = fresh();
    const sol = built(g, 'solar_array', 14, 10), bat = built(g, 'battery_shed', 30, 30);
    expect(hookupsFor(g, bat).find(x => x.kind === 'power_link')!.state).toBe('missing');
    expect(hookupsFor(g, sol).find(x => x.kind === 'power_link')!.todo).toMatch(/Draw a power cable/);
    expect(backupPower(g).ok).toBe(false);
    expect(backupPower(g).detail).toMatch(/not on a cable/);
    expect(defenseReport(g).catastrophes.find(c => c.id === 'power')!.ok).toBe(false);
    line(g, 'power_cable', [sol.x, sol.z], [bat.x, bat.z]);
    expect(hookupsFor(g, bat).find(x => x.kind === 'power_link')!.state).toBe('done');
    const bp = backupPower(g);
    expect(bp.ok).toBe(true);
    expect(bp.detail).toMatch(/solar \+ battery bank/);
    expect(defenseReport(g).catastrophes.find(c => c.id === 'power')!.ok).toBe(true);
  });

  it('solar alone on the grid shuts off in an outage: not a backup', () => {
    const g = fresh();
    g.utilities.grid = true;
    const sol = built(g, 'solar_array', 14, 10), h = built(g, 'cottage', 10, 10);
    line(g, 'power_cable', [sol.x, sol.z], [h.x, h.z]);
    const bp = backupPower(g);
    expect(bp.ok).toBe(false);
    expect(bp.detail).toMatch(/Add a battery/);
  });

  it('tells you power is made but nothing keeps it', () => {
    const g = fresh();
    expect(storageTip(g)).toBeNull();
    built(g, 'solar_array', 14, 10);
    expect(storageTip(g)?.kind).toBe('battery_shed');
    planStructure(g, 'battery_shed', 20, 10, 0);   // staked is enough: it is on its way
    expect(storageTip(g)).toBeNull();
  });

  it('a hand well or a cistern does not pressurize a house: plumbing explains that in words', () => {
    const g = fresh();
    const h = built(g, 'cottage', 10, 10), w = built(g, 'well_hand', 14, 10);
    line(g, 'water_pipe', [w.x, w.z], [h.x, h.z]);
    const plumb = hookupsFor(g, h).find(x => x.kind === 'plumb')!;
    expect(plumb.state).toBe('missing');
    expect(plumb.todo).toMatch(/does not pressurize/);
    const d = built(g, 'well_drilled', 16, 10);
    line(g, 'water_pipe', [d.x, d.z], [h.x, h.z]);
    expect(hookupsFor(g, h).find(x => x.kind === 'plumb')!.state).toBe('ready');
  });

  it('bunker rooms and sources do not get wire / plumb rows', () => {
    expect(fitRows('bunker_dorm', false, false)).toEqual({ wire: false, plumb: false });
    expect(fitRows('solar_array', false, false)).toEqual({ wire: false, plumb: false });
    expect(fitRows('cottage', false, false)).toEqual({ wire: true, plumb: true });
  });

  it('a fresh game with the family house pre-fitted has nothing to finish', () => {
    const g = newGame(11);
    expect(needsHookup(g).filter(x => x.kind === 'wire' || x.kind === 'plumb')).toHaveLength(0);
  });
});
