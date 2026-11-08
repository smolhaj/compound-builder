/**
 * The user's rule: a lot with strong defenses must make a raid HARDER, never easier. Every defensive element is added to an armed lot in turn
 * and 150 seeded raids are fought on both; the breach rate (breached or overrun) with the element must not be higher than without it
 * beyond sampling noise (two standard deviations of the difference).
 */
import { afterEach, describe, expect, it } from 'vitest';
import { newGame, type GameState, type Structure } from './state';
import { setGroundOverride } from './terrainState';
import { applyBattle, planBattle } from './battle';
import { planRun, type Pt } from './perimeter';
import { DEFAULT_FORTRESS, layFortress, planFortress } from './fortress';
import { BLUEPRINTS } from './blueprints';
import { adoptDog } from './pets';
import { syncParking } from './parking';
import { sapperChance } from './corridors';
import { subscribe } from './armedResponse';
import { foundWatch } from './watch';

afterEach(() => setGroundOverride(null));
const N = 150;
const built = (g: GameState, id: string, kind: string, x: number, z: number): Structure => { const st: Structure = { id, kind, x, z, rot: 0, stage: 9, done: 0, supplied: true, finishedAt: 0 }; g.structures.push(st); return st; };
const finishAll = (g: GameState) => { for (const r of g.perimeter) { r.finishedAt = 0; r.done = r.hours; } for (const st of g.structures) st.stage = BLUEPRINTS[st.kind].stages.length; };
function base(night = true, seed = 3): GameState {
  const g = newGame(seed, 105, 2027, { mode: 'scenario', peace: 'short', kind: 'grid_down' });
  g.site = { ...g.site, creek: false };
  built(g, 'h', 'timber_cabin', 30, 30);
  g.disaster.tracks = { ...g.disaster.tracks, law: 0, stores: 0, deliveries: 0, banks: 0 };
  for (const [i, p] of g.people.entries()) if (!p.kid || p.age >= 15) { g.armory.guns.push({ id: `g${i}`, model: 'sw_mp15', condition: 1, fired: 0, where: 'house', carrier: p.id }); g.armory.skill[p.id] = 5; }
  g.armory.ammo['556'] = 3000;
  g.clock.t = Math.floor(g.disaster.hitAt + 60) + (night ? 0.8 : 0.25);
  return g;
}
const rate = (g: GameState, crew: number): number => { let n = 0; for (let seed = 1; seed <= N; seed++) { const r = planBattle(g, crew, seed).result; if (r === 'breached' || r === 'overrun') n++; } return n / N; };
/** Defenders killed a raid, mean and the standard error of the mean. */
const deaths = (g: GameState, crew: number): { mean: number; se: number } => {
  const xs: number[] = [];
  for (let seed = 1; seed <= N; seed++) xs.push(planBattle(g, crew, seed).events.filter(e => e.kind === 'death' && e.unit.startsWith('h_')).length);
  const mean = xs.reduce((a, b) => a + b, 0) / N;
  return { mean, se: Math.sqrt(xs.reduce((a, x) => a + (x - mean) ** 2, 0) / (N - 1) / N) };
};
/** Not worse beyond noise: with = without + 2 sigma of the difference. */
const notWorse = (without: number, withEl: number) => {
  const sd = Math.sqrt((without * (1 - without) + withEl * (1 - withEl)) / N);
  expect(withEl).toBeLessThanOrEqual(without + 2 * sd + 1e-9);
};

/** A finished moat ring round the camp (half-width `h` from (30,30)), and a finished covered bridge across its south side. */
function moat(g: GameState, h = 14): void {
  const r = planRun(g, 'moat', [[30 - h, 30 - h], [30 + h, 30 - h], [30 + h, 30 + h], [30 - h, 30 + h], [30 - h, 30 - h]] as Pt[]);
  r.finishedAt = 0; r.done = r.hours; r.supplied = true;
}
function bridge(g: GameState): void {
  const r = planRun(g, 'covered_bridge', [[30, 47], [30, 41]] as Pt[]);
  r.finishedAt = 0; r.done = r.hours; r.supplied = true;
}

const ELEMENTS: Array<[string, (g: GameState) => void]> = [
  ['three watchtowers', g => { [[27, 36], [33, 36], [30, 40]].forEach(([x, z], i) => built(g, `t${i}`, 'watchtower_wood', x, z)); finishAll(g); }],
  ['one watchtower', g => { built(g, 't0', 'watchtower_wood', 30, 38); finishAll(g); }],
  ['a container wall', g => { const r = planRun(g, 'container_wall', [[20, 20], [40, 20], [40, 40], [20, 40], [20, 20]] as Pt[]); r.finishedAt = 0; r.done = r.hours; r.supplied = true; }],
  ['a stone wall and towers', g => { const r = planRun(g, 'stone_wall', [[20, 20], [40, 20], [40, 40], [20, 40], [20, 20]] as Pt[]); r.finishedAt = 0; r.done = r.hours; r.supplied = true; built(g, 't0', 'watchtower_wood', 30, 38); finishAll(g); }],
  ['a guard dog', g => { adoptDog(g, { ageYears: 3, training: 80, guard: true }); }],
  ['floodlights', g => { g.stock.floodlights = 3; }],
  ['sandbags', g => { g.stock.sandbags = 3; }],
  ['window bars', g => { g.stock.window_bars = 1; }],
  ['house hardening (window bars and ballistic panels)', g => { g.stock.window_bars = 1; g.stock.ballistic_panels = 1; }],
  ['a hardened gate house', g => { g.stock.gate_house = 1; }],
  ['a clinic suite and a radio mast', g => { g.stock.clinic_suite = 1; g.stock.radio_mast = 1; g.stock.sw_radio = 1; }],
  ['security (trellis) gates on the doors', g => { g.stock.trellis_gates = 1; }],
  ['an intercom and gate camera (lit)', g => { g.utilities.lit = ['h']; g.stock.gate_intercom = 1; }],
  ['a caged gate motor', g => { g.stock.gate_motor = 1; }],
  ['a double gate (vehicle sally port)', g => { g.stock.sally_gate = 1; }],
  ['steel bollards across the approach (turn a ram truck)', g => { g.stock.bollards = 1; }],
  ['the whole gate kit with a gate house, lit', g => { g.utilities.lit = ['h']; g.stock.gate_intercom = 1; g.stock.gate_motor = 1; g.stock.sally_gate = 1; g.stock.trellis_gates = 1; g.stock.gate_house = 1; }],
  ['an armed-response subscription (the law is gone: nothing answers)', g => { g.money = 9999; g.disaster.tracks.banks = 1; g.disaster.tracks.law = 1; subscribe(g); g.disaster.tracks.banks = 0; g.disaster.tracks.law = 0; }],
  ['a road watch with the neighbors', g => { g.money = 9999; for (const n of g.neighbors) { n.disposition = 40; n.status = 'home'; n.members = Math.max(1, n.members); n.km = 1.5; } foundWatch(g); }],
  ['mines', g => { g.stock.mines = 6; }],
  ['a moat (rain and seep only)', g => { moat(g); }],
  ['a pond-fed moat', g => { built(g, 'pd', 'pond', 52, 30); moat(g); }],
  ['a moat with a covered bridge', g => { built(g, 'pd', 'pond', 52, 30); moat(g); bridge(g); }],
  ['a vehicle yard outside the walls', g => { built(g, 'vy', 'vehicle_yard', 56, 30); syncParking(g); }],
  ['a vehicle yard, a moat and a stone wall', g => { built(g, 'vy', 'vehicle_yard', 56, 30); syncParking(g); moat(g, 12); const r = planRun(g, 'stone_wall', [[24, 24], [36, 24], [36, 36], [24, 36], [24, 24]] as Pt[]); r.finishedAt = 0; r.done = r.hours; r.supplied = true; finishAll(g); }],
  ['a moat behind a stone wall and a tower', g => { moat(g, 12); const r = planRun(g, 'stone_wall', [[24, 24], [36, 24], [36, 36], [24, 36], [24, 24]] as Pt[]); r.finishedAt = 0; r.done = r.hours; r.supplied = true; built(g, 't0', 'watchtower_wood', 30, 38); finishAll(g); }],
  // raid depth: the tunnel itself is a way in (see the sappers block below, which compares against a lot that already has the tunnel)
  ['per-ring vetting chosen at the gates (nobody is at the gate that day)', g => { g.gate.vet = 'both'; }],
];

describe('every defensive element is monotone: a raid is never easier with it', () => {
  for (const crew of [6, 10]) for (const [name, add] of ELEMENTS) {
    it(`${name} (crew of ${crew})`, () => {
      const a = base(), b = base();
      add(b);
      notWorse(rate(a, crew), rate(b, crew));
    }, 120000);
    it(`${name} does not get more defenders killed (crew of ${crew})`, () => {
      const a = base(), b = base();
      add(b);
      const da = deaths(a, crew), db = deaths(b, crew);
      expect(db.mean).toBeLessThanOrEqual(da.mean + 2 * Math.hypot(da.se, db.se) + 1e-9);
    }, 120000);
  }
  it('rings: three manned rings against one, with and without sally ports', () => {
    const ringed = (rings: number, sally: boolean): GameState => {
      const g = base(); g.people.forEach(p => { p.kid = false; });
      layFortress(g, planFortress(g, { roadGate: [g.site.home.x1, 30] as Pt }, { ...DEFAULT_FORTRESS, rings, ringSally: sally, passage: false }));
      finishAll(g);
      return g;
    };
    const one = rate(ringed(1, false), 10), three = rate(ringed(3, false), 10), sally = rate(ringed(3, true), 10);
    notWorse(one, three);
    notWorse(three, sally);
  }, 240000);
});


describe('the campaign: a fortress is never worse for the family than a bare lot', () => {
  /** Six raids in a row on one lot, growing crews, written into the game each time (people killed or hurt stay so); how many of the family are alive after. */
  const campaign = (fortress: boolean, seed: number): number => {
    const g = base(true, seed);
    g.people.forEach(p => { p.kid = false; });
    if (fortress) {
      layFortress(g, planFortress(g, { roadGate: [g.site.home.x1, 30] as Pt }, { ...DEFAULT_FORTRESS, passage: false }));
      finishAll(g);
    }
    for (let k = 0; k < 6; k++) { applyBattle(g, planBattle(g, 5 + 2 * k, seed * 31 + k)); g.clock.t += 20; }
    return g.personState.filter(ps => ps.needs.died == null).length;
  };
  it('over many seeds the fortress family has at least as many survivors, and fewer total deaths', () => {
    let fort = 0, bare = 0;
    for (let seed = 1; seed <= 30; seed++) { fort += campaign(true, seed); bare += campaign(false, seed); }
    expect(fort).toBeGreaterThan(bare);
  }, 240000);
});

describe('a tunnel-bridge on the lot: the counters at its portal only make a raid harder than the bare tunnel', () => {
  const tunnel = (g: GameState): void => { const r = planRun(g, 'tunnel_bridge', [[60, 24], [60, 36]] as Pt[]); r.finishedAt = 0; r.done = r.hours; r.supplied = true; };
  const ADD: Array<[string, (g: GameState) => void]> = [
    ['guard posts at the portal', g => { built(g, 't0', 'watchtower_wood', 58, 30); built(g, 't1', 'watchtower_wood', 62, 30); finishAll(g); }],
    ['listening posts', g => { g.stock.ground_sensor = 4; }],
    ['a collapsed portal (rubble in the way)', g => { g.perimeter[0].collapsed = { at: 0, rubbleM3: 640, clearsAt: null }; }],
  ];
  for (const crew of [6, 10]) for (const [name, add] of ADD) it(`${name} (crew of ${crew})`, () => {
    const a = base(), b = base();
    tunnel(a); tunnel(b); add(b);
    notWorse(rate(a, crew), rate(b, crew));
  }, 120000);
});

describe('sappers and the portal: every counter only lowers the chance a tunnel is brought down', () => {
  it('a blast door, guard posts and listening posts never raise it, in any combination', () => {
    const mk = (kind: 'tunnel_bridge' | 'rock_tunnel', towers: number, sensors: number): GameState => {
      const g = base();
      const r = planRun(g, kind, [[60, 24], [60, 36]] as Pt[]); r.finishedAt = 0; r.done = r.hours; r.supplied = true;
      for (let i = 0; i < towers; i++) built(g, `tw${i}`, 'watchtower_wood', 58 + 2 * i, 30);
      g.stock.ground_sensor = sensors;
      return g;
    };
    for (const kind of ['tunnel_bridge', 'rock_tunnel'] as const) for (const charges of [1, 3, 9]) for (const result of ['breached', 'overrun'] as const) {
      let prev = Infinity;
      for (const [tw, se] of [[0, 0], [1, 0], [2, 0], [3, 0], [3, 4]] as const) {
        const g = mk(kind, tw, se), id = g.perimeter[0].id;
        const p = sapperChance(g, id, charges, result);
        expect(p).toBeLessThanOrEqual(prev + 1e-12);
        prev = p;
      }
    }
  });
});

describe('wall tops on a stone wall: every top only makes a raid harder than the bare wall', () => {
  const stone = (g: GameState): void => { const r = planRun(g, 'stone_wall', [[20, 20], [40, 20], [40, 40], [20, 40], [20, 20]] as Pt[]); r.finishedAt = 0; r.done = r.hours; r.supplied = true; };
  const lit = (g: GameState): void => { g.utilities.lit = ['h']; };
  const ADD: Array<[string, (g: GameState) => void]> = [
    ['razor coils', g => { g.perimeter[0].razor = true; }],
    ['a live electric fence', g => { lit(g); g.perimeter[0].electric = true; }],
    ['a live electric fence with a battery backup', g => { lit(g); g.perimeter[0].electric = true; g.perimeter[0].backup = true; }],
    ['a dark electric fence (no power, no battery)', g => { g.perimeter[0].electric = true; }],
    ['a live electric fence choked in brush', g => { lit(g); g.perimeter[0].electric = true; g.perimeter[0].brush = 1; }],
  ];
  for (const crew of [6, 10]) for (const [name, add] of ADD) it(`${name} (crew of ${crew})`, () => {
    const a = base(), b = base();
    lit(a); stone(a); stone(b); add(b);
    notWorse(rate(a, crew), rate(b, crew));
    const da = deaths(a, crew), db = deaths(b, crew);
    expect(db.mean).toBeLessThanOrEqual(da.mean + 2 * Math.hypot(da.se, db.se) + 1e-9);
  }, 120000);
});
