/**
 * The raid sim in the LIVE game path: every number the cutscene and the aftermath read comes out of `planBattle` / `resolve` / `stageRaid` in a real
 * game state, for any seed, crew, layout and difficulty (user requirement: not only in recorded movies). Also the fuzz and long-run guards:
 * thousands of random raids and a year of days with raids, none throwing, state bounded, time bounded. Timings are printed.
 */
import { describe, expect, it } from 'vitest';
import { newGame, SAVE_VERSION, type GameState } from './state';
import { planRun, PERIMETER, type PerimeterKind, type PerimeterRun } from './perimeter';
import { applyBattle, planBattle, type BattleOptions, type PlannedBattle } from './battle';
import { resolve, type Encounter, type EncounterKind } from './encounters';
import { stageRaid } from './raidCutscene';
import { step } from './engine';
import { migrate } from './save/migrations';
import { holdingsOf } from './raidOutcomes';
import { dispositionOf } from './crewMercy';
import { crewKindOf } from './surrender';
import { mulberry32 } from './rng';
import type { Difficulty } from './difficulty';
import type { BattleEvent } from './battleTypes';

type Layout = 'bare' | 'armed' | 'chain' | 'container' | 'container_gate' | 'concrete_bollards' | 'ditch_wall' | 'palisade_tower';
const LAYOUTS: Layout[] = ['bare', 'armed', 'chain', 'container', 'container_gate', 'concrete_bollards', 'ditch_wall', 'palisade_tower'];
function place(seed: number, diff: Difficulty, layout: Layout): GameState {
  const g = newGame(seed, 105, 2027, { mode: 'scenario', peace: 'short', kind: 'grid_down', difficulty: diff });
  g.clock.t = Math.floor(g.disaster.hitAt + 40 + (seed % 5) * 60) + (seed % 2 ? 0.5 : 0.95);
  g.disaster.tracks = { ...g.disaster.tracks, law: 0, stores: 0, deliveries: 0, banks: 0 };
  Object.assign(g.stock, { canned: 40, staples: 20, frozen: 8, fuel: 12, meds: 4, ifak: 2, goat: 3, sheep: 2 });
  g.structures.push({ id: 'house', kind: 'farmhouse', x: 0, z: 0, rot: 0, stage: 99, done: 0, supplied: true, finishedAt: 0 }, { id: 'barn1', kind: 'barn', x: 7, z: -3, rot: 0, stage: 99, done: 0, supplied: true, finishedAt: 0 });
  const wall = (kind: PerimeterKind, half = 15, gates: PerimeterRun['gates'] = []) => { const r = planRun(g, kind, [[-half, -half], [half, -half], [half, half], [-half, half], [-half, -half]], gates); r.done = r.hours; r.supplied = true; r.finishedAt = 0; return r; };
  const arm = () => { for (const [i, p] of g.people.entries()) if (!p.kid || p.age >= 15) { g.armory.guns.push({ id: `g${i}`, model: 'sw_mp15', condition: 1, fired: 0, where: 'house', carrier: p.id }); g.armory.skill[p.id] = 4 + (i % 4); } g.armory.ammo['556'] = 1500; };
  if (layout !== 'bare') arm();
  if (layout === 'chain') wall('chain_link');
  if (layout === 'container') wall('container_wall');
  if (layout === 'container_gate') { wall('container_wall', 15, [{ at: 45, w: 2 }, { at: 75, w: 2 }, { at: 105, w: 2 }]); g.stock.gate_motor = 1; g.stock.sally_gate = 1; }
  if (layout === 'concrete_bollards') { wall('concrete_wall'); g.stock.bollards = 1; }
  if (layout === 'ditch_wall') { wall('log_palisade', 12); wall('ditch', 20); }
  if (layout === 'palisade_tower') { wall('log_palisade'); g.structures.push({ id: 'tw', kind: 'watchtower_wood', x: 6, z: 9, rot: 0, stage: 9, done: 0, supplied: true, finishedAt: 0 }); g.stock.sandbags = 3; }
  return g;
}
const CREWS: Array<{ kind: EncounterKind; temper: 'desperate' | 'hard' | 'savage'; n: number }> = [
  { kind: 'looters', temper: 'desperate', n: 5 }, { kind: 'gang', temper: 'hard', n: 8 }, { kind: 'gang', temper: 'savage', n: 10 }, { kind: 'militia', temper: 'hard', n: 8 },
  { kind: 'patrol', temper: 'desperate', n: 6 }, { kind: 'requisition', temper: 'hard', n: 7 }, { kind: 'horde', temper: 'savage', n: 14 }, { kind: 'looters', temper: 'hard', n: 6 },
];
const opts = (c: (typeof CREWS)[number]): BattleOptions => ({ temper: c.temper, kind: c.kind, organized: c.n >= 5, armed: c.kind !== 'horde' });

/** Distance from a point to the nearest piece of a run. */
function toRun(run: PerimeterRun, x: number, z: number): number {
  let best = Infinity;
  for (let i = 1; i < run.pts.length; i++) {
    const [ax, az] = run.pts[i - 1], [bx, bz] = run.pts[i], dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
    best = Math.min(best, Math.hypot(x - (ax + dx * t), z - (az + dz * t)));
  }
  return best;
}

/** Everything that must hold between a fight's events and its explicit facts. Returns the problems found (empty: consistent). */
export function problems(g: GameState, b: PlannedBattle, o: BattleOptions): string[] {
  const bad: string[] = [];
  const ev = b.events, last = ev[ev.length - 1];
  for (let i = 1; i < ev.length; i++) if (!(ev[i].t >= ev[i - 1].t)) { bad.push('events out of order'); break; }
  for (const e of ev) if (!Number.isFinite(e.t) || e.t < 0) { bad.push(`bad time on ${e.kind}`); break; }
  for (const e of ev) if ('x' in e && (!Number.isFinite((e as { x: number }).x) || !Number.isFinite((e as { z: number }).z))) { bad.push(`bad position on ${e.kind}`); break; }
  if (last.kind !== 'end' || last.result !== b.result) bad.push('end event disagrees with result');
  const raid = b.raid;
  if (!raid) return [...bad, 'no raid facts'];
  if (raid.result !== b.result) bad.push('facts disagree with result');
  const breach = ev.find(e => e.kind === 'breach') as Extract<BattleEvent, { kind: 'breach' }> | undefined;
  if (!!breach !== raid.linePassed) bad.push(`linePassed ${raid.linePassed} but breach event ${!!breach}`);
  if ((b.result === 'breached' || b.result === 'overrun') && !breach) bad.push('line lost with no breach event');
  if (b.result === 'overrun' && raid.reached !== 'house') bad.push('overrun but the house was not reached');
  if (b.result === 'breached' && raid.reached === 'wall') bad.push('breached but the crew never left the wall');
  if ((b.result === 'repelled' || b.result === 'fled') && raid.loot.length && !raid.beatenBack) bad.push('loot from a raid that was held');
  if (breach) {
    const m = breach.method ?? 'none';
    if (m === 'none') bad.push('breach without a method');
    if (raid.breach && raid.breach.method !== breach.method) bad.push('facts method differs from the breach event');
    if (breach.where) {
      const run = g.perimeter.find(r => r.id === breach.where!.runId);
      if (!run) bad.push('breach on a run that does not exist');
      else if (toRun(run, breach.x, breach.z) > 0.06) bad.push(`breach point is ${toRun(run, breach.x, breach.z).toFixed(2)} off the drawn wall`);
      if (Math.abs(breach.where.x - breach.x) > 0.011 || Math.abs(breach.where.z - breach.z) > 0.011) bad.push('breach point differs from its where');
      if (!ev.some(e => e.kind === 'gap' && e.runId === breach.where!.runId && e.t <= breach.t + 0.01) && (m === 'ram' || m === 'charge')) bad.push('a ram / charge breach with no gap event before it');
    }
    if (m === 'ram' && !ev.some(e => e.kind === 'ram' && e.ok !== false)) bad.push('a ram breach with no successful ram event');
    if (m === 'charge' && !ev.some(e => e.kind === 'explosion' && e.wrecks === 'wall')) bad.push('a charge breach with no wall-wrecking blast');
  }
  for (const e of ev) if (e.kind === 'ram' && e.ok === false && (e.stopX === undefined || e.stopZ === undefined)) bad.push('a failed ram with no stopping place');
  for (const a of raid.breach?.attempts ?? []) if (a.ok && a.why !== 'ok') bad.push('an attempt that worked with a reason');
  // a truck needs its driver, a charge its carrier: if the attempt failed for that reason the man really was down
  for (const e of ev) if (e.kind === 'ram' && e.why === 'driver_down') { const d = e.driver ?? ''; if (!ev.some(x => (x.kind === 'death' || x.kind === 'wound') && x.unit === d)) bad.push('driver_down but the driver was never hit'); }
  // fates: one per home unit at most, no dead man's fate twice, and the crew's temper is honored
  const seen = new Set<string>(), disp = dispositionOf(o.temper ?? 'desperate', crewKindOf(o.kind));
  if (raid.disposition !== disp) bad.push('disposition differs');
  for (const f of b.fates ?? []) {
    if (seen.has(f.unit)) bad.push('two fates for one unit'); seen.add(f.unit);
    const u = b.units.find(x => x.id === f.unit);
    if (!u || u.side !== 'home') bad.push('a fate for something that is not a defender');
    if (disp === 'merciful' && u?.personId) { const p = g.people.find(q => q.id === u.personId); if (p?.kid && (f.fate === 'killed' || f.fate === 'finished' || f.fate === 'taken')) bad.push(`a merciful crew ${f.fate} a child`); }
  }
  const takenEv = ev.filter(e => e.kind === 'taken').length;
  if (takenEv !== raid.hostages.length) bad.push('hostages differ from taken events');
  if (ev.filter(e => e.kind === 'hostage').length > takenEv) bad.push('more hostage events than people taken');
  // loot never exceeds what was there
  const have = holdingsOf(g as never);
  for (const it of raid.loot) if (it.n > (have[it.what] ?? 0)) bad.push(`looted more ${it.what} than there was`);
  if (raid.fires.length > 3) bad.push('too many fires');
  for (const f of raid.fires) if (!g.structures.some(s => s.id === f.structure)) bad.push('fire on a structure that does not exist');
  if (!raid.text) bad.push('no result text');
  if (raid.ending && b.result !== 'fled') bad.push('a talked end that is not a flight');
  if (raid.loss.people.killed !== b.events.filter(e => e.kind === 'death' && e.unit.startsWith('h_')).length) bad.push('killed count differs from death events');
  return bad;
}

describe('the raid sim in the live path', () => {
  it('every field the cutscene and the aftermath read comes out consistent: all layouts, crews, difficulties, seeds', () => {
    const all: string[] = [], t0 = performance.now(), ms: number[] = [];
    const stats = { n: 0, breaches: 0, ram: 0, charge: 0, climb: 0, failedRam: 0, failedCharge: 0, beaten: 0, tribute: 0, passage: 0, fires: 0, loot: 0, hostages: 0, spared: 0, hid: 0, orders: 0, snaps: 0, gate: 0, results: { repelled: 0, fled: 0, breached: 0, overrun: 0 } as Record<string, number> };
    let i = 0;
    for (const diff of ['cozy', 'standard', 'hardcore'] as Difficulty[]) for (const layout of LAYOUTS) for (const crew of CREWS) for (let k = 0; k < 4; k++, i++) {
      const g = place(1 + (i % 9), diff, layout), o = opts(crew);
      const withOrders: BattleOptions = i % 5 === 0 ? { ...o, orders: [{ t: 0, order: 'fallback' }] } : i % 7 === 0 ? { ...o, orders: [{ t: 12, order: 'counter' }] } : o;
      const a = performance.now();
      const b = planBattle(g, crew.n, 100 + i, withOrders);
      ms.push(performance.now() - a);
      const bad = problems(g, b, withOrders);
      if (bad.length) all.push(`${diff}/${layout}/${crew.kind}-${crew.temper}/#${i}: ${bad.join('; ')}`);
      // and written into the game it does not break it
      const gg = structuredClone(g);
      const lines = applyBattle(gg, b);
      for (const [key, v] of Object.entries(gg.stock)) if (typeof v === 'number' && (!Number.isFinite(v) || v < 0)) all.push(`${diff}/${layout}/#${i}: stock ${key} = ${v}`);
      if (!Array.isArray(lines)) all.push('applyBattle returned no lines');
      const r = b.raid!; stats.n++; stats.results[b.result]++;
      if (r.breach) { stats.breaches++; stats[r.breach.method]++; if (r.breach.where?.gate) stats.gate++; for (const at of r.breach.attempts) if (!at.ok) at.how === 'ram' ? stats.failedRam++ : stats.failedCharge++; }
      if (r.beatenBack) stats.beaten++;
      if (r.ending?.kind === 'tribute') stats.tribute++; if (r.ending?.kind === 'passage') stats.passage++;
      stats.fires += r.fires.length; stats.loot += r.loot.length; stats.hostages += r.hostages.length; stats.spared += r.loss.people.spared; stats.snaps += r.snaps.length; stats.orders += r.orders.length;
      stats.hid += (b.fates ?? []).filter(f => f.fate === 'hid').length;
    }
    ms.sort((a, b) => a - b);
    const total = performance.now() - t0;
    // eslint-disable-next-line no-console
    console.log(`raidLive: ${stats.n} raids in ${(total / 1000).toFixed(1)} s; planBattle median ${ms[Math.floor(ms.length / 2)].toFixed(1)} ms, p99 ${ms[Math.floor(ms.length * 0.99)].toFixed(1)} ms, max ${ms[ms.length - 1].toFixed(1)} ms`, JSON.stringify(stats));
    expect(all.slice(0, 12)).toEqual([]);
    // the new mechanics really happen in live fights (not only in unit tests)
    expect(stats.ram + stats.charge).toBeGreaterThan(5);
    expect(stats.failedRam + stats.failedCharge).toBeGreaterThan(0);
    expect(stats.climb).toBeGreaterThan(5);
    expect(stats.fires).toBeGreaterThan(0); expect(stats.loot).toBeGreaterThan(20); expect(stats.hostages).toBeGreaterThan(0);
    expect(ms[Math.floor(ms.length / 2)]).toBeLessThan(150);
  }, 240000);

  it('the same raid in the same state plays the same (the seeded stream is the only source)', () => {
    const a = planBattle(place(3, 'hardcore', 'container_gate'), 9, 77, opts(CREWS[1])), b = planBattle(place(3, 'hardcore', 'container_gate'), 9, 77, opts(CREWS[1]));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('counters work in live fights: bollards, a reinforced gate, an anti-vehicle ditch and a hard wall cut the successful rams; the driver shot first stops the truck', () => {
    const run = (layout: Layout, diff: Difficulty = 'hardcore') => {
      let ok = 0, tried = 0, driverDown = 0, bol = 0;
      for (let s = 0; s < 80; s++) {
        const g = place(1 + (s % 7), diff, layout), b = planBattle(g, 8, 500 + s, { temper: 'hard', kind: 'gang', organized: true, means: { truck: true, satchels: 0 } });
        for (const at of b.raid!.breach?.attempts ?? []) if (at.how === 'ram') { tried++; if (at.ok) ok++; if (at.why === 'driver_down') driverDown++; if (at.why === 'bollards') bol++; }
      }
      return { ok, tried, driverDown, bol };
    };
    const chain = run('chain'), container = run('container'), conc = run('concrete_bollards'), ditch = run('ditch_wall'), tower = run('palisade_tower');
    expect(chain.tried).toBeGreaterThan(40);
    expect(chain.ok / chain.tried).toBeGreaterThan(container.ok / Math.max(1, container.tried));
    expect(conc.ok / Math.max(1, conc.tried)).toBeLessThan(chain.ok / chain.tried);
    expect(ditch.ok).toBe(0);
    expect(chain.driverDown + container.driverDown + tower.driverDown).toBeGreaterThan(0);
  }, 120000);

  it('Standard is more forgiving than Hardcore against the same truck and the same wall', () => {
    const rate = (diff: Difficulty) => { let ok = 0, t = 0; for (let s = 0; s < 70; s++) { const b = planBattle(place(1 + (s % 7), diff, 'chain'), 8, 900 + s, { temper: 'hard', kind: 'gang', organized: true, means: { truck: true, satchels: 0 } }); for (const a of b.raid!.breach?.attempts ?? []) { t++; if (a.ok) ok++; } } return ok / Math.max(1, t); };
    expect(rate('standard')).toBeLessThan(rate('hardcore'));
  }, 120000);

  it('orders change the fight: falling back to the house costs what stood outside it and gives better cover; holding is the old fight', () => {
    let exposed = 0, stages = 0;
    for (let s = 0; s < 30; s++) {
      const g = place(1 + (s % 6), 'standard', 'container');
      const hold = planBattle(g, 6, 40 + s, opts(CREWS[0])), plain = planBattle(g, 6, 40 + s, { ...opts(CREWS[0]), orders: [{ t: 0, order: 'hold' }] });
      expect(JSON.stringify(plain.events)).toBe(JSON.stringify(hold.events));   // a hold order is no order
      const fb = planBattle(g, 6, 40 + s, { ...opts(CREWS[0]), orders: [{ t: 0, order: 'fallback' }] });
      if (fb.raid!.orders.some(o => o.order === 'fallback')) stages++;
      if (fb.raid!.stage !== 'wall') exposed++;
      expect(fb.events.some(e => e.kind === 'order')).toBe(true);
    }
    expect(stages).toBe(30); expect(exposed).toBeGreaterThan(10);
  });

  it('a timed order replays the same fight up to its second', () => {
    const g = place(2, 'standard', 'container'), base = planBattle(g, 7, 61, opts(CREWS[1])), o = planBattle(g, 7, 61, { ...opts(CREWS[1]), orders: [{ t: 20, order: 'counter' }] });
    const before = (b: PlannedBattle) => JSON.stringify(b.events.filter(e => e.t < 19 && e.kind !== 'end'));
    expect(before(o)).toBe(before(base));
  });

  it('through the cutscene (stageRaid -> resolve -> applyBattle): the report carries the facts, the outcome card says them, the clock is untouched', () => {
    let staged = 0, kinds = new Set<string>();
    for (let s = 0; s < 24; s++) {
      const g = place(1 + (s % 8), (['cozy', 'standard', 'hardcore'] as const)[s % 3], LAYOUTS[s % LAYOUTS.length]);
      const c = CREWS[s % CREWS.length];
      g.gate.pending = { id: `e${s}`, kind: c.kind, day: 5 + s, title: 'A crew', dossier: [], size: c.n, armed: c.kind !== 'horde', strength: 90, wants: { canned: 5 }, stances: ['hide', 'parley', 'defend'], temper: c.temper } as Encounter;
      const t0 = g.clock.t;
      const st = stageRaid(g, 'defend', undefined, s % 2 ? [{ t: 0, order: 'fallback' }] : undefined);
      expect(g.clock.t).toBe(t0);
      expect(g.gate.orders).toBeUndefined();
      const f = st.report.facts;
      if (st.staged.gate.battle) { expect(f).toBeDefined(); expect(f!.result).toBe(st.staged.gate.battle.raid!.result); staged++; kinds.add(f!.result); if (f!.result === 'breached' || f!.result === 'overrun') expect(st.outcome.text).toBe(f!.text); }
      expect(st.staged.gate.orders).toBeUndefined();
    }
    expect(staged).toBeGreaterThan(15); expect(kinds.size).toBeGreaterThan(1);
  }, 120000);
});

describe('degrades instead of throwing', () => {
  it('no walls, no defenders, one raider, no raiders, an odd structure kind, an old save: always a plain result', () => {
    const g = place(1, 'standard', 'bare');
    g.personState.forEach(ps => { ps.needs.died = 1; });
    for (const n of [0, 1, 2, 40]) { const b = planBattle(g, n, 5, opts(CREWS[1])); expect(['repelled', 'fled', 'breached', 'overrun']).toContain(b.result); expect(b.events[b.events.length - 1].kind).toBe('end'); }
    const empty = newGame(1); empty.structures = [];
    expect(() => planBattle(empty, 5, 3, opts(CREWS[2]))).not.toThrow();
    const odd = place(2, 'standard', 'container'); odd.perimeter.push({ id: 'weird', kind: 'chain_link', pts: [[0, 0]], gates: [], done: 1, hours: 1, supplied: true, finishedAt: 0 });
    expect(() => planBattle(odd, 6, 9, opts(CREWS[1]))).not.toThrow();
    const noRaidFields = place(3, 'standard', 'armed'); delete (noRaidFields as { raidFires?: unknown }).raidFires;
    expect(() => step(noRaidFields, 3)).not.toThrow();
  });
  it('an old save (v86) migrates to the current version, with no raid fires, and plays a raid', () => {
    const old = JSON.parse(JSON.stringify(place(4, 'standard', 'container'))); old.version = 86; delete old.raidFires;
    const g = migrate(old);
    expect(g.version).toBe(SAVE_VERSION); expect(g.raidFires).toBeUndefined();
    expect(['repelled', 'fled', 'breached', 'overrun']).toContain(planBattle(g, 6, 3, opts(CREWS[0])).result);
  });
  it('a battle from before v87 (no facts, no breach method) still applies', () => {
    const g = place(5, 'standard', 'armed'), b = planBattle(g, 8, 3, opts(CREWS[1]));
    const old = JSON.parse(JSON.stringify(b)); delete old.raid; for (const e of old.events) if (e.kind === 'breach') { delete e.method; delete e.where; }
    expect(() => applyBattle(structuredClone(g), old)).not.toThrow();
  });
});

describe('long runs stay bounded', () => {
  it('thousands of random raids: none throws, state does not grow', () => {
    const r = mulberry32(99);
    let count = 0, worst = 0, sizes: number[] = [];
    const g = place(7, 'hardcore', 'container_gate');
    for (let i = 0; i < 1500; i++) {
      const c = CREWS[Math.floor(r() * CREWS.length)], diff = (['cozy', 'standard', 'hardcore'] as const)[i % 3];
      g.disaster.difficulty = diff;
      const gg = i % 40 === 0 ? place(1 + (i % 9), diff, LAYOUTS[i % LAYOUTS.length]) : structuredClone(g);
      const a = performance.now();
      const b = planBattle(gg, Math.max(1, Math.round(c.n * (0.5 + r()))), Math.floor(r() * 1e6), { ...opts(c), ...(r() < 0.3 ? { orders: [{ t: Math.floor(r() * 30), order: (['hold', 'fallback', 'counter'] as const)[Math.floor(r() * 3)] }] } : {}) });
      worst = Math.max(worst, performance.now() - a); count++;
      expect(b.events.length).toBeLessThan(6000);
      sizes.push(JSON.stringify(b).length);
      applyBattle(gg, b);
    }
    // eslint-disable-next-line no-console
    console.log(`fuzz: ${count} raids, worst ${worst.toFixed(0)} ms, battle json max ${Math.max(...sizes)} bytes`);
    expect(worst).toBeLessThan(3000);
    expect(Math.max(...sizes)).toBeLessThan(600_000);
  }, 300000);

  it('a year of days with a raid every 12 days: fires, damage and the log stay bounded', () => {
    let g = place(8, 'hardcore', 'container_gate');
    const t0 = performance.now();
    const base = JSON.stringify(g).length;
    let maxFires = 0, maxDamage = 0, raids = 0;
    for (let d = 0; d < 365; d++) {
      if (d % 12 === 5) {
        const c = CREWS[(d / 12 | 0) % CREWS.length];
        g.gate.pending = { id: `e${d}`, kind: c.kind, day: Math.floor(g.clock.t), title: 'A crew', dossier: [], size: c.n, armed: true, strength: 90, wants: { canned: 5 }, stances: ['defend'], temper: c.temper } as Encounter;
        g = structuredClone(g); resolve(g, 'defend'); raids++;
      }
      g = step(g, 1);
      maxFires = Math.max(maxFires, g.raidFires?.length ?? 0); maxDamage = Math.max(maxDamage, g.raidDamage?.length ?? 0);
    }
    const grown = JSON.stringify(g).length / base;
    // eslint-disable-next-line no-console
    console.log(`year: ${raids} raids, ${((performance.now() - t0) / 1000).toFixed(1)} s, state x${grown.toFixed(2)}, max fires ${maxFires}, max damage records ${maxDamage}`);
    expect(maxFires).toBeLessThanOrEqual(8); expect(maxDamage).toBeLessThanOrEqual(40);
    expect(g.log.length).toBeLessThanOrEqual(60);
    expect(grown).toBeLessThan(4);
  }, 300000);
});

void PERIMETER;
