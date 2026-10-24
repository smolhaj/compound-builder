import { describe, expect, it } from 'vitest';
import { FATE_ODDS, newDisaster, rollFate, tracksAt, TRACKS, type DisasterKind } from './disaster';

const share = (kind: DisasterKind) => {
  const n = { full: 0, partial: 0, never: 0 };
  for (let s = 1; s <= 600; s++) n[newDisaster(s, 'scenario', 'short', kind).fate]++;
  return n;
};

describe('how the world comes out of it', () => {
  it('varies run to run, and by disaster: a wildfire nearly always passes, a nuclear war mostly doesn\'t', () => {
    const fire = share('wildfire'), nuke = share('nuclear'), grid = share('grid_down');
    expect(fire.full / 600).toBeGreaterThan(0.85);
    expect(nuke.never / 600).toBeGreaterThan(0.3);
    expect(nuke.full / 600).toBeLessThan(0.25);
    for (const n of [grid, nuke]) expect(n.full && n.partial && n.never).toBeTruthy();
    for (const [k, o] of Object.entries(FATE_ODDS)) expect(o!.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 5), void k;
    expect(rollFate('zombies', 0.01)).toBe('never');
  });

  it('full: everything comes back; partial: services settle part way and stay; never: nothing comes back', () => {
    const find = (fate: string) => { for (let s = 1; s < 500; s++) { const d = newDisaster(s, 'scenario', 'short', 'grid_down', 'ice_storm'); if (d.fate === fate) return d; } throw new Error(fate); };
    const late = (d: ReturnType<typeof find>) => tracksAt(d, d.hitAt + 900);
    expect(TRACKS.every(k => late(find('full'))[k] > 0.99)).toBe(true);
    const p = find('partial'), lp = late(p);
    for (const k of TRACKS) { expect(lp[k]).toBeLessThan(0.81); expect(lp[k]).toBeCloseTo(p.ceiling[k]!, 2); }
    expect(tracksAt(p, p.hitAt + 2000)).toEqual(lp);
    const nv = late(find('never'));
    expect(TRACKS.every(k => nv[k] < 0.5)).toBe(true);
  });
});
