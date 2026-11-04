import { describe, expect, it } from 'vitest';
import { newGame, SAVE_VERSION, dayIndex, type GameState } from './state';
import { step } from './engine';
import { lineageDay, chronicleUpkeep, gridChanged, winterOffGrid, UPKEEP_NOTES_PER_YEAR } from './lineage';
import { fosterHome, orphaned, canFoster } from './orphans';
import { tallyDay } from './report';
import { threatsDay, rollDoy, THREAT_K, brokenWorld } from './threats';
import { threatOn } from './threatState';
import { climate } from './effects';
import { raidPressure } from './opsec';
import { winterDay, inFreeze } from './adaptive';
import { knockBack, isFinished, planStructure } from './construction';
import { migrate } from './save/migrations';
import { tracksAt } from './disaster';

const day = (g: GameState) => dayIndex(g.clock.t);
const live = (g: GameState, days: number) => { const t0 = Math.floor(g.clock.t); for (let d = 1; d <= days; d++) { g.clock.t = t0 + d; lineageDay(g); } };
const kill = (g: GameState, pred: (p: GameState['people'][number]) => boolean) => g.people.forEach((p, i) => { if (pred(p)) g.personState[i].needs.died = Math.floor(g.clock.t); });
const orphan = (seed = 3) => {
  const g = newGame(seed);
  g.neighbors.forEach(n => { n.status = 'home'; n.members = 3; n.disposition = 20; });
  g.neighbors[0].name = 'the Hendersons'; g.neighbors[0].disposition = 60; g.neighbors[0].kind = 'old_farmer';
  kill(g, p => !p.kid);
  return g;
};
/** A world that has not come back, a few years on. */
const broken = (g: GameState, years = 3) => {
  g.disaster.kind = 'grid_down'; g.disaster.hitAt = 0; g.disaster.warnAt = -10; g.disaster.phase = 'survival'; g.disaster.fate = 'never'; g.disaster.back = {};
  g.clock.t = years * 365 + 10;
  g.disaster.tracks = tracksAt(g.disaster, g.clock.t);
  g.stats.okSince = -1;
  return g;
};

describe('orphans', () => {
  it('a neighbor household takes the kids in, named, and the run is not a wipe', () => {
    const g = orphan();
    const kids = g.people.filter(p => p.kid).length;
    expect(kids).toBeGreaterThan(0);
    expect(orphaned(g)).toHaveLength(kids);
    g.clock.t += 1;
    lineageDay(g);
    expect(g.people.filter((_, i) => g.personState[i].needs.died == null)).toHaveLength(0);
    expect(g.lineage.wards).toHaveLength(kids);
    expect(g.lineage.wards[0].by).toBe(g.neighbors[0].id);
    expect(g.lineage.chronicle.some(e => /Henderson household took in/.test(e.text))).toBe(true);
    expect(tallyDay(g)).toBeNull();
    expect(g.ending).toBeNull();
  });

  it('with no neighbor who can, it is a wipe', () => {
    const g = orphan();
    g.neighbors.forEach(n => { n.status = 'gone'; });
    g.clock.t += 1;
    lineageDay(g);
    expect(g.lineage.wards).toHaveLength(0);
    expect(tallyDay(g)?.kind).toBe('wipe');
  });

  it('does not take the kids while a grown person is left; hostile and recluse households will not', () => {
    const g = newGame(3);
    g.clock.t += 1;
    lineageDay(g);
    expect(g.lineage.wards).toHaveLength(0);
    const n = g.neighbors[0];
    n.status = 'home'; n.members = 3; n.disposition = -60;
    expect(canFoster(n)).toBe(false);
    n.disposition = 10; n.kind = 'loner';
    expect(canFoster(n)).toBe(false);
    g.neighbors.forEach(x => { x.status = 'left'; });
    expect(fosterHome(g)).toBeNull();
  });

  it('the place is held, the eldest comes of age, and the heirs come home to it', () => {
    const g = orphan();
    const kid = g.people.filter(p => p.kid).sort((a, b) => b.age - a.age)[0];
    kid.age = 16;
    const stock = { ...g.stock };
    g.clock.t += 1;
    lineageDay(g);
    // the sim carries on with nobody home: no crash, nothing goes NaN, no ending is dealt
    let s = g;
    for (let i = 0; i < 30; i++) s = step(s, 1);
    expect(s.ending).toBeNull();
    expect(s.lineage.wards.length).toBeGreaterThan(0);
    expect(Object.values(s.stock).every(v => Number.isFinite(v))).toBe(true);
    live(s, 3 * 365);
    expect(s.lineage.wards).toHaveLength(0);
    const back = s.people.find(p => p.id === kid.id)!;
    expect(back.age).toBeGreaterThanOrEqual(18);
    expect(back.kid).toBe(false);
    expect(s.people.length).toBe(s.personState.length);
    expect(s.personState.find(ps => ps.id === kid.id)!.needs.died).toBeNull();
    expect(s.lineage.chronicle.some(e => e.kind === 'coming' && /came home to the place/.test(e.text))).toBe(true);
    expect(s.structures.length).toBe(g.structures.length);
    expect(stock).toBeTruthy();
  });

  it('a host that is wiped out passes them on, or loses them', () => {
    const g = orphan();
    g.clock.t += 1;
    lineageDay(g);
    const n = g.neighbors[0];
    n.status = 'gone'; n.members = 0;
    live(g, 1);
    expect(g.lineage.wards.length > 0 && g.lineage.wards[0].by !== n.id).toBe(true);
    g.neighbors.forEach(x => { x.status = 'gone'; });
    live(g, 1);
    expect(g.lineage.wards).toHaveLength(0);
    expect(g.ending?.kind).toBe('wipe');
  });
});

describe('yearly threats', () => {
  const threatsOver = (g: GameState, years: number) => {
    const seen: string[] = [];
    for (let d = 0; d < years * 365; d++) {
      g.clock.t += 1;
      const had = g.lineage.threat;
      threatsDay(g, () => undefined);
      if (g.lineage.threat && g.lineage.threat !== had) seen.push(g.lineage.threat.kind);
    }
    return seen;
  };

  it('Cozy never has one; Standard some years; Hardcore more', () => {
    const count = (diff: 'cozy' | 'standard' | 'hardcore') => {
      let n = 0;
      for (let seed = 1; seed <= 6; seed++) { const g = broken(newGame(seed, 105, 2027, { difficulty: diff, mode: 'scenario' })); n += threatsOver(g, 30).length; }
      return n;
    };
    expect(THREAT_K.cozy).toBe(0);
    expect(count('cozy')).toBe(0);
    const std = count('standard'), hc = count('hardcore');
    expect(std).toBeGreaterThan(20);
    expect(std).toBeLessThan(90);   // 180 years at 0.35 a year
    expect(hc).toBeGreaterThan(std);
  });

  it('a world that has come back, a first year, or an ended run has none', () => {
    const g = broken(newGame(2, 105, 2027, { difficulty: 'hardcore', mode: 'scenario' }));
    g.stats.okSince = 100;
    expect(brokenWorld(g)).toBe(false);
    expect(threatsOver(g, 20)).toHaveLength(0);
    const young = broken(newGame(2, 105, 2027, { difficulty: 'hardcore', mode: 'scenario' }), 0);
    young.clock.t = 200;
    expect(brokenWorld(young)).toBe(false);
    const done = broken(newGame(2, 105, 2027, { difficulty: 'hardcore', mode: 'scenario' }));
    done.ending = { kind: 'wipe', day: 1, continued: false };
    expect(brokenWorld(done)).toBe(false);
  });

  it('the roll is in the autumn, one threat at a time, and it ends', () => {
    const g = broken(newGame(4, 105, 2027, { difficulty: 'hardcore', mode: 'scenario' }), 2);
    expect(rollDoy(g.seed, 2030)).toBeGreaterThanOrEqual(250);
    expect(rollDoy(g.seed, 2030)).toBeLessThan(290);
    let started = 0, ended = 0;
    for (let d = 0; d < 40 * 365; d++) {
      g.clock.t += 1;
      const before = g.lineage.threat;
      threatsDay(g, (_, t) => { if (/passed|behind|let go|moved on|run its course|quiet again/.test(t)) ended++; });
      if (g.lineage.threat && g.lineage.threat !== before) { started++; expect(before).toBeNull(); }
    }
    expect(started).toBeGreaterThan(5);
    expect(ended).toBeGreaterThanOrEqual(started - 1);
  });

  it('famine cuts the growing season, a warlord raises raid pressure, a plague brings fevers, a hard winter burns wood', () => {
    const g = broken(newGame(5, 105, 2027, { difficulty: 'hardcore', mode: 'scenario' }));
    const d0 = day(g);
    const base = { grow: climate(g).grow, raid: raidPressure(g) };
    g.lineage.threat = { kind: 'famine', from: d0, to: d0 + 100, k: 1 };
    expect(climate(g).grow).toBeCloseTo(base.grow * 0.65);
    g.lineage.threat = { kind: 'famine', from: d0, to: d0 + 100, k: 0.5 };
    expect(climate(g).grow).toBeCloseTo(base.grow * 0.825);
    g.lineage.threat = { kind: 'famine', from: d0 + 5, to: d0 + 100, k: 1 };
    expect(climate(g).grow).toBeCloseTo(base.grow);
    g.lineage.threat = { kind: 'warlord', from: d0, to: d0 + 40, k: 1 };
    expect(raidPressure(g)).toBeCloseTo(base.raid * 1.5);
    expect(threatOn(g, 'famine')).toBe(0);
    g.lineage.threat = { kind: 'plague', from: d0, to: d0 + 59, k: 1 };
    let fevers = 0;
    for (let i = 0; i < 59; i++) { g.clock.t += 1; fevers += threatsDay(g, () => undefined).length; }
    expect(fevers).toBeGreaterThan(0);
    expect(g.personState.some(ps => ps.needs.hurt.some(h => h.what === 'fever'))).toBe(true);
    // a hard winter: window of its own, wood goes, then the thaw
    const w = broken(newGame(5, 105, 2027, { difficulty: 'standard', mode: 'scenario' }));
    w.stock.firewood = 40; w.stock.fresh = 10;
    const from = day(w) + 2;
    w.lineage.threat = { kind: 'hard_winter', from, to: from + 7 + 2, k: 1 };
    expect(inFreeze(w, from)).toBe(true);
    expect(inFreeze(w, from + 9)).toBe(false);
    let lines = 0;
    for (let x = from; x <= from + 9; x++) lines += winterDay(w, x).length;
    expect(w.stock.firewood).toBeLessThan(40);
    expect(lines).toBeGreaterThanOrEqual(2);
  });
});

describe('first winter off-grid', () => {
  const run = (startOnGrid: boolean, leaveAt: number | null) => {
    const g = newGame(6);
    g.utilities.grid = startOnGrid; g.lineage.startedOnGrid = startOnGrid;
    const t0 = Math.floor(g.clock.t);
    let got = -1;
    for (let d = 1; d <= 2 * 365; d++) {
      g.clock.t = t0 + d;
      if (leaveAt === d) { g.utilities.grid = false; gridChanged(g, false); }
      lineageDay(g);
      if (got < 0 && g.lineage.milestones.includes('off_grid_winter')) got = d;
    }
    return got;
  };
  it('only after leaving a grid you started on, and only once a winter has passed', () => {
    expect(run(false, null)).toBe(-1);                     // never on the grid
    expect(run(true, null)).toBe(-1);                      // still on it
    const got = run(true, 20);
    expect(got).toBeGreaterThan(20);
    expect(got).toBeLessThan(365);
    const late = run(true, 300);                           // left in the autumn (start doy 105): the winter ahead counts
    expect(late).toBeGreaterThan(300);
  });
  it('rejoining resets it; a grid the place never had does not count', () => {
    const g = newGame(6);
    g.utilities.grid = true; g.lineage.startedOnGrid = true;
    gridChanged(g, false);
    expect(g.lineage.gridLeft).not.toBeNull();
    gridChanged(g, true);
    expect(g.lineage.gridLeft).toBeNull();
    const h = newGame(6);
    gridChanged(h, false);
    expect(h.lineage.gridLeft).toBeNull();
    expect(winterOffGrid(h)).toBe(false);
  });
});

describe('the chronicle logs upgrades and rebuilds, capped', () => {
  it('one line each, at most a few a year', () => {
    const g = newGame(7);
    const before = g.lineage.chronicle.length;
    let written = 0;
    for (let i = 0; i < 10; i++) if (chronicleUpkeep(g, `The thing ${i} was upgraded.`)) written++;
    expect(written).toBe(UPKEEP_NOTES_PER_YEAR);
    expect(g.lineage.chronicle.length).toBe(before + UPKEEP_NOTES_PER_YEAR);
    g.clock.t += 400;
    expect(chronicleUpkeep(g, 'Next year.')).toBe(true);
  });
  it('a finished structure knocked back and finished again is a rebuild', () => {
    const g = newGame(7);
    const st = planStructure(g, 'timber_cabin', 20, 20, 0);
    st.stage = 99; st.finishedAt = 1;
    expect(isFinished(st)).toBe(true);
    knockBack(g, st, 0);
    expect(st.lost).toBe(true);
    const fresh = planStructure(g, 'timber_cabin', 30, 30, 0);
    knockBack(g, fresh, 0);
    expect(fresh.lost).toBeUndefined();   // never stood: not a rebuild
  });
});

describe('save', () => {
  it('migrates 74 to 75 with the new fields', () => {
    const g = newGame(1);
    const old = JSON.parse(JSON.stringify(g)) as { version: number; lineage: Record<string, unknown>; utilities: { grid: boolean } };
    old.version = 74;
    for (const k of ['wards', 'threat', 'threatYear', 'startedOnGrid', 'gridLeft', 'noteYear', 'noteCount']) delete old.lineage[k];
    old.utilities.grid = true;
    const back = migrate(old);
    expect(back.version).toBe(SAVE_VERSION);
    expect(back.lineage.wards).toEqual([]);
    expect(back.lineage.threat).toBeNull();
    expect(back.lineage.startedOnGrid).toBe(true);
    expect(back.lineage.gridLeft).toBeNull();
  });
});
