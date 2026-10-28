import { describe, expect, it } from 'vitest';
import { newGame, type GameState } from './state';
import { exposureParts, opsecOf, raidPressure } from './opsec';
import { floodlightLit, lightsOf } from './lights';
import { autoMode, curtainCover, darkness, glowFactor, lightLines, lightsOutNow, lightsOutReason, mishapChance, nightWork, visibilityOf } from './blackout';
import { windowLight } from '../game/atmosphere/nightLife';
import { liveDay } from './needs';
import { migrate } from './save/migrations';

const fresh = (): GameState => newGame(1, 105, 2027, { mode: 'scenario', peace: 'short', kind: 'grid_down' });
const gridDown = (g: GameState) => { g.disaster.tracks.grid = 0; g.utilities.lit = ['a', 'b']; };
const house = (g: GameState, n = 1) => { for (let i = 0; i < n; i++) g.structures.push({ id: `h${i}`, kind: 'cottage', x: 0, z: 0, rot: 0, stage: 99, done: 0, supplied: true, finishedAt: 0 } as never); };

describe('light discipline', () => {
  it('manual switch, dusk routine and warning routine decide when the lights are out', () => {
    const g = fresh();
    expect(lightsOutNow(g)).toBe(false);
    opsecOf(g).auto = 'warned';
    expect(lightsOutNow(g)).toBe(false);
    g.lights = { ...lightsOf(g), alertUntil: g.clock.t + 1 };
    expect(lightsOutReason(g)).toBe('warned');
    g.lights.alertUntil = -1;
    opsecOf(g).auto = 'dusk';
    expect(lightsOutReason(g)).toBe('dusk');
    opsecOf(g).auto = 'off'; opsecOf(g).blackout = true;
    expect(lightsOutReason(g)).toBe('manual');
    expect(autoMode(g)).toBe('off');
  });

  it('a warning douses the house but keeps a motion-sensor floodlight; manual and dusk force floodlights off', () => {
    const g = fresh(); g.disaster.tracks.grid = 0; g.utilities.lit = ['a'];
    lightsOf(g).mode = 'sensor';
    opsecOf(g).auto = 'warned'; g.lights!.alertUntil = g.clock.t + 1;
    expect(lightsOutNow(g)).toBe(true);
    expect(floodlightLit(g, 'x', true)).toBe(true);
    opsecOf(g).blackout = true;
    expect(floodlightLit(g, 'x', true)).toBe(false);
  });

  it('curtains cover houses one set each, and cut both exposure and the cost of darkness', () => {
    const g = fresh(); gridDown(g); house(g, 2);
    const lit = exposureParts(g).lights;
    opsecOf(g).blackout = true;
    const bare = exposureParts(g).lights;
    expect(bare).toBeLessThan(lit);
    expect(glowFactor(g)).toBeCloseTo(0.35);
    expect(darkness(g)).toBe(1);
    g.stock.blackout_curtains = 1;
    expect(curtainCover(g)).toBeCloseTo(0.5);
    g.stock.blackout_curtains = 2;
    expect(curtainCover(g)).toBe(1);
    expect(darkness(g)).toBe(0);
    expect(exposureParts(g).lights).toBeLessThan(bare);
    expect(nightWork(g, 22)).toBe(1);
  });

  it('lights out raises no exposure it should not: raids come less often when dark', () => {
    const g = fresh(); gridDown(g);
    const lit = raidPressure(g);
    opsecOf(g).blackout = true;
    expect(raidPressure(g)).toBeLessThan(lit);
  });

  it('darkness costs night work and invites stumbles, until every house has curtains', () => {
    const g = fresh(); house(g);
    opsecOf(g).blackout = true;
    expect(nightWork(g, 22)).toBeCloseTo(0.8);
    expect(nightWork(g, 12)).toBe(1);
    expect(mishapChance(g)).toBeGreaterThan(0);
    g.stock.blackout_curtains = 1;
    expect(mishapChance(g)).toBe(0);
  });

  it('a generator is seen whatever the discipline', () => {
    const g = fresh(); g.disaster.tracks.grid = 0; g.utilities.report.genKwh = 4;
    opsecOf(g).blackout = true; g.stock.blackout_curtains = 9;
    expect(lightLines(g, 0).find(l => l.id === 'generator')!.points).toBeGreaterThan(0);
    expect(visibilityOf(lightLines(g, 0).reduce((a, l) => a + l.points, 0))).not.toBe('dark');
  });

  it('fire pit and yard lamps count until lights go out', () => {
    const g = fresh(); g.disaster.tracks.grid = 0; g.clock.t = g.disaster.hitAt + 1;
    expect(lightLines(g, 0).find(l => l.id === 'fire')!.points).toBeGreaterThan(0);
    opsecOf(g).blackout = true;
    expect(lightLines(g, 0).find(l => l.id === 'fire')!.points).toBe(0);
  });

  it('windows: curtained keeps the room lit, uncovered goes fully dark', () => {
    const base = { hour: 21, night: 1, home: true, awake: 2, powered: true, blackout: false, watch: false };
    expect(windowLight({ ...base, blackout: true })).toMatchObject({ kind: 'curtained' });
    expect(windowLight({ ...base, dark: true })).toEqual({ kind: 'off', room: 0 });
  });

  it('only people up at night (on watch) stumble; sleepers do not', () => {
    const g = fresh(); house(g); opsecOf(g).blackout = true;
    g.personState.forEach(p => { p.task = 'sleep'; p.needs.hurt = []; });
    for (let d = 0; d < 200; d++) liveDay(g, (d * 0.137) % 1);
    expect(g.personState.every(p => p.needs.hurt.length === 0)).toBe(true);
  });

  it('children feel the dark more and a day without curtains wears the mood down', () => {
    const run = (curtains: number) => {
      const g = fresh(); house(g); opsecOf(g).blackout = true; g.stock.blackout_curtains = curtains;
      for (const ps of g.personState) ps.needs.morale = 70;
      for (let d = 0; d < 40; d++) liveDay(g, 0.9);
      return g.personState.reduce((a, p) => a + p.needs.morale, 0);
    };
    expect(run(0)).toBeLessThan(run(1));
  });

  it('migrates a v46 save: routine off, curtains at zero', () => {
    const g = fresh(); g.opsec = { quietDeliveries: true, blackout: true };
    const old = { ...JSON.parse(JSON.stringify(g)), version: 46 };
    delete old.stock.blackout_curtains;
    const m = migrate(old);
    expect(m.opsec).toMatchObject({ quietDeliveries: true, blackout: true, auto: 'off' });
    expect(m.stock.blackout_curtains).toBe(0);
  });
});
