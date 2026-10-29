import { describe, expect, it } from 'vitest';
import { newGame, type GameState } from './state';
import { bunkerAlert, cameraCount, consoleManned, hasControlRoom, hatchOpen, securityFeeds } from './bunkerLife';
import { watchDetection, watchNow } from './daily';

const fresh = (): GameState => newGame(2, 105, 2027, { mode: 'scenario', peace: 'short', kind: 'grid_down' });
const add = (g: GameState, kind: string, id = kind) => g.structures.push({ id, kind, x: 0, z: 0, rot: 0, stage: 99, done: 0, supplied: true, finishedAt: 0 } as never);
const power = (g: GameState) => { g.utilities.lit = ['x']; };
const night = (g: GameState) => { g.clock.t = Math.floor(g.clock.t) + 0.95; };
const watchers = (g: GameState, k = 1) => { for (let i = 0; i < k; i++) g.personState[i].task = 'watch'; };

describe('control room screens', () => {
  it('no cameras: every feed is a dead panel; cameras without power: dark; with both: live where there is something to see', () => {
    const g = fresh(); add(g, 'bunker_comms'); power(g);
    expect(securityFeeds(g).cams.every(c => c.state === 'nosignal')).toBe(true);
    g.stock.cameras = 1; g.utilities.lit = []; g.utilities.grid = false;
    expect(securityFeeds(g).cams.every(c => c.state === 'dark')).toBe(true);
    power(g);
    const f = securityFeeds(g);
    // a camera unit is four cameras; nothing built to look at yet: no view, except the gate
    expect(cameraCount(g).ir).toBe(4);
    expect(f.cams.find(c => c.id === 'gate')!.state).toBe('live');
    expect(f.cams.find(c => c.id === 'solar')!.state).toBe('noview');
    add(g, 'solar_array'); add(g, 'garden'); add(g, 'cottage');
    expect(securityFeeds(g).cams.map(c => c.state)).toEqual(['live', 'live', 'live', 'live']);
  });

  it('the thermal camera lights the gate by itself; a driveway sensor plus a visitor shows motion; the key changes with the picture', () => {
    const g = fresh(); power(g); g.stock.thermal_cam = 1;
    const a = securityFeeds(g);
    expect(a.cams.find(c => c.id === 'gate')!.thermal).toBe(true);
    expect(a.cams.find(c => c.id === 'house')!.state).toBe('nosignal');
    g.stock.driveway_alarm = 1;
    g.gate.pending = { id: 'e1', kind: 'gang', size: 5 } as never;
    const b = securityFeeds(g);
    expect(b.cams.find(c => c.id === 'gate')!.motion).toBe(true);
    expect(b.key).not.toBe(a.key);
    expect(b.radar.blips.length).toBe(5);
  });
});

describe('the Watch duty station', () => {
  it('at night the first watcher sits at the console when there is a control room, power and a camera', () => {
    const g = fresh(); night(g); watchers(g, 2); add(g, 'watchtower_wood');
    expect(watchNow(g)[0].post).toBe('tower');
    add(g, 'bunker_comms'); power(g); g.stock.cameras = 1;
    expect(hasControlRoom(g) && consoleManned(g)).toBe(true);
    const w = watchNow(g);
    expect(w.map(x => x.post)).toEqual(['console', 'tower']);
    expect(watchDetection(g)).toBeGreaterThan(0);
  });

  it('not in daylight, and not without cameras', () => {
    const g = fresh(); watchers(g, 1); add(g, 'bunker_comms'); power(g); g.stock.cameras = 1;
    g.clock.t = Math.floor(g.clock.t) + 0.5;
    expect(watchNow(g)[0].post).not.toBe('console');
    night(g); g.stock.cameras = 0;
    expect(watchNow(g)[0].post).not.toBe('console');
  });
});

describe('the hatch', () => {
  it('stands open on a raid at the gate, closed in peace', () => {
    const g = fresh();
    expect(bunkerAlert(g)).toBe('none');
    expect(hatchOpen(g)).toBe(false);
    g.gate.pending = { id: 'e2', kind: 'looters', size: 3 } as never;
    expect(bunkerAlert(g)).toBe('raid');
    expect(hatchOpen(g)).toBe(true);
    g.gate.pending = { id: 'e3', kind: 'trader', size: 1 } as never;
    expect(hatchOpen(g)).toBe(false);
  });
});

import { bunkerOccupants } from './bunkerLife';
describe('who is down there', () => {
  it('the console watcher sits at the screens; the fallout shelter days fill the seats by day and the bunks at night', () => {
    const g = fresh(); night(g); watchers(g, 1); add(g, 'bunker_comms'); power(g); g.stock.cameras = 1;
    expect(bunkerOccupants(g)).toEqual([{ id: g.personState[0].id, role: 'console' }]);
    const h = fresh();
    h.disaster.kind = 'nuclear'; h.disaster.hitAt = h.clock.t - 1;
    h.personState[0].task = 'shelter'; h.personState[1].task = 'sleep';
    const o = bunkerOccupants(h);
    expect(o.find(x => x.id === h.personState[0].id)!.role).toBe('seat');
    expect(o.find(x => x.id === h.personState[1].id)!.role).toBe('bed');
  });
});
