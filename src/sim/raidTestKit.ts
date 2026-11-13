/**
 * Shared kit for the live raid tests (sim/raidLive.test.ts, sim/raidLive2.test.ts): lots with a farmhouse and a wall, crews, and the consistency check
 * between a fight's events and its explicit facts. Not a test file.
 */
import { newGame, type GameState } from './state';
import { planRun, type PerimeterKind, type PerimeterRun } from './perimeter';
import type { BattleOptions, PlannedBattle } from './battle';
import type { EncounterKind } from './encounters';
import { holdingsOf } from './raidOutcomes';
import { dispositionOf } from './crewMercy';
import { crewKindOf } from './surrender';
import type { Difficulty } from './difficulty';
import type { BattleEvent } from './battleTypes';
import { isGuardUnit } from './defenseTune';

export type Layout = 'bare' | 'armed' | 'chain' | 'container' | 'container_gate' | 'concrete_bollards' | 'ditch_wall' | 'palisade_tower';
export const LAYOUTS: Layout[] = ['bare', 'armed', 'chain', 'container', 'container_gate', 'concrete_bollards', 'ditch_wall', 'palisade_tower'];
export function place(seed: number, diff: Difficulty, layout: Layout): GameState {
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
export const CREWS: Array<{ kind: EncounterKind; temper: 'desperate' | 'hard' | 'savage'; n: number }> = [
  { kind: 'looters', temper: 'desperate', n: 5 }, { kind: 'gang', temper: 'hard', n: 8 }, { kind: 'gang', temper: 'savage', n: 10 }, { kind: 'militia', temper: 'hard', n: 8 },
  { kind: 'patrol', temper: 'desperate', n: 6 }, { kind: 'requisition', temper: 'hard', n: 7 }, { kind: 'horde', temper: 'savage', n: 14 }, { kind: 'looters', temper: 'hard', n: 6 },
];
export const opts = (c: (typeof CREWS)[number]): BattleOptions => ({ temper: c.temper, kind: c.kind, organized: c.n >= 5, armed: c.kind !== 'horde' });

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
  if (raid.loss.people.killed !== b.events.filter(e => e.kind === 'death' && e.unit.startsWith('h_') && !isGuardUnit(e.unit)).length) bad.push('killed count differs from death events');
  return bad;
}

