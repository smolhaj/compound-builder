/**
 * Soak invariants (pure; no DOM, no THREE). `checkState` looks at one GameState (and optionally the day before) and returns the
 * ways it is broken, each as `code: detail`. The soak harness (scripts/soak.test.ts) runs it after every simulated day of
 * many scenario x seed games; `src/sim/soak/invariants.test.ts` pins each check on a hand-broken state.
 * Codes are stable so failures can be grouped and minimized to a seed + scenario + day.
 */
import type { GameState } from '../state';
import { MATERIAL_IDS } from '../materials';
import { isFinished } from '../construction';

export interface Violation { code: string; detail: string }

/** Where the first non-finite numbers are (path strings), looking through arrays and plain objects. Stops after `limit`. */
export function nonFinitePaths(root: unknown, limit = 5): string[] {
  const out: string[] = [], seen = new Set<object>();
  const walk = (v: unknown, path: string): void => {
    if (out.length >= limit) return;
    if (typeof v === 'number') { if (!Number.isFinite(v)) out.push(`${path}=${v}`); return; }
    if (v === null || typeof v !== 'object') return;
    if (seen.has(v as object)) { out.push(`${path} is a shared / cyclic reference`); return; }
    seen.add(v as object);
    if (Array.isArray(v)) { for (let i = 0; i < v.length; i++) walk(v[i], `${path}[${i}]`); }
    else for (const k of Object.keys(v as object)) walk((v as Record<string, unknown>)[k], path ? `${path}.${k}` : k);
    seen.delete(v as object);
  };
  walk(root, '');
  return out;
}

/** Paths holding `undefined` inside an array (JSON turns it into null: a lost value) or a Map / Set / function (JSON drops them). */
export function unsavablePaths(root: unknown, limit = 5): string[] {
  const out: string[] = [];
  const walk = (v: unknown, path: string, depth: number): void => {
    if (out.length >= limit || depth > 40) return;
    if (typeof v === 'function' || v instanceof Map || v instanceof Set) { out.push(`${path} (${typeof v === 'function' ? 'function' : v.constructor.name})`); return; }
    if (v === null || typeof v !== 'object') return;
    if (Array.isArray(v)) { for (let i = 0; i < v.length; i++) { if (v[i] === undefined) out.push(`${path}[${i}]=undefined`); else walk(v[i], `${path}[${i}]`, depth + 1); } }
    else for (const k of Object.keys(v as object)) walk((v as Record<string, unknown>)[k], path ? `${path}.${k}` : k, depth + 1);
  };
  walk(root, '', 0);
  return out;
}

/** A stable 32-bit hash of the whole state (FNV-1a over its JSON). Two runs of the same seed and the same moves must agree. */
export function hashState(s: unknown): string {
  const text = JSON.stringify(s);
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, '0') + ':' + text.length;
}

const money = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

/** What a day's log says about a building lost: fire, raid, storm, demolition, an upgrade that replaced it, a collapse. */
const LOSS_WORDS = /burn|fire|flame|destroy|collaps|demolish|torn|tore|wreck|ruin|lost|flood|replace|upgrade|swept|crush|razed|knock|taken|took|sold|dismantl|salvag|gone|blown|blew|washed|wiped|overrun|breach|cave|sink|sank|fell|fallen|hail|tornado|quake|storm|bomb|shell|rubble|stripped|looted|scrap|comes? down|pulled down|torn down|cancel/i;

/** The little of a state that the next day's check needs (a snapshot: the state itself is cloned or mutated between days). */
export interface Summary { t: number; finished: Array<{ id: string; kind: string }> }
export const summarize = (s: GameState): Summary => ({ t: s.clock.t, finished: s.structures.filter(isFinished).map(x => ({ id: x.id, kind: x.kind })) });

export interface CheckOptions {
  /** What the state looked like a day earlier (see `summarize`), to see what vanished. */
  prev?: Summary;
  /** Skip the (slower) deep scans. */
  fast?: boolean;
}

export function checkState(s: GameState, opt: CheckOptions = {}): Violation[] {
  const v: Violation[] = [];
  const add = (code: string, detail: string) => { v.push({ code, detail }); };

  // numbers: nothing NaN / infinite anywhere
  if (!opt.fast) {
    const bad = nonFinitePaths(s);
    if (bad.length) add('nan', bad.join(', '));
    const lost = unsavablePaths(s);
    if (lost.length) add('unsavable', lost.join(', '));
  } else {
    for (const [k, n] of Object.entries({ money: s.money, t: s.clock.t })) if (!Number.isFinite(n)) add('nan', `${k}=${n}`);
  }

  // money: the account may dip under zero within a day (the card takes it next morning), but not far, and debt must explain it
  if (s.money < -25_000 && !(s.fin.debt && s.fin.debt.owed > 0)) add('money_negative', `${money(s.money)} with no debt on file`);
  if (s.money > 5e9) add('money_runaway', money(s.money));

  // stock
  for (const m of MATERIAL_IDS) {
    const n = s.stock[m];
    if (typeof n !== 'number') { add('stock_type', `${m} is ${typeof n}`); continue; }
    if (n < -1e-6) add('stock_negative', `${m}=${n}`);
  }
  const u = s.utilities;
  if (u.storedL < -1e-6) add('water_negative', `stored ${u.storedL} L`);
  if (u.batteryKwh < -1e-6) add('battery_negative', `${u.batteryKwh} kWh`);
  if ((u.pondL ?? 0) < -1e-6) add('pond_negative', `${u.pondL} L`);
  if (u.fuelL < -1e-6) add('fuel_negative', `${u.fuelL} L`);

  // people: both rosters in step, ids unique and matched
  if (s.people.length !== s.personState.length) add('people_out_of_step', `${s.people.length} people, ${s.personState.length} states`);
  const pids = new Set<string>();
  for (let i = 0; i < s.people.length; i++) {
    const p = s.people[i], ps = s.personState[i];
    if (pids.has(p.id)) add('person_dup', p.id);
    pids.add(p.id);
    if (ps && ps.id !== p.id) add('person_mismatch', `slot ${i}: ${p.id} vs ${ps.id}`);
    if (!ps) continue;
    const n = ps.needs;
    if (n.health < -1e-6 || n.health > 100 + 1e-6) add('health_range', `${p.id} ${n.health}`);
    if (n.hunger < -1e-6) add('hunger_negative', `${p.id} ${n.hunger}`);
    if (n.dose < -1e-9) add('dose_negative', `${p.id} ${n.dose}`);
    if (p.age < 0 || p.age > 130) add('age_range', `${p.id} ${p.age}`);
    if (n.died != null && n.health > 0.5 && !n.left && !n.taken) add('dead_but_healthy', `${p.id} health ${n.health}`);
  }

  // structures and what points at them
  const sids = new Set<string>(), rids = new Set<string>();
  const nStages = (st: GameState['structures'][number]): number | null => {
    try { return Number.isInteger(st.stage) ? st.stage : null; } catch { return null; }
  };
  for (const st of s.structures) {
    if (sids.has(st.id)) add('structure_dup', st.id);
    sids.add(st.id);
    if (!Number.isFinite(st.x) || !Number.isFinite(st.z)) add('structure_pos', st.id);
    if (nStages(st) === null || st.stage < 0) add('structure_stage', `${st.id} ${st.kind} stage ${st.stage}`);
    if (st.done < -1e-6) add('structure_done_negative', `${st.id} ${st.kind} ${st.done}`);
    if (isFinished(st) && st.finishedAt == null) add('finished_without_time', `${st.id} ${st.kind}`);
  }
  for (const r of s.perimeter) { if (rids.has(r.id)) add('perimeter_dup', r.id); rids.add(r.id); if (r.done < -1e-6) add('perimeter_done_negative', r.id); }
  const targets = new Set<string>([...sids, ...rids]);
  const crewIds = new Set<string>();
  for (const c of s.crews) {
    if (crewIds.has(c.id)) add('crew_dup', c.id);
    crewIds.add(c.id);
    if (!targets.has(c.target)) add('crew_orphan', `crew ${c.id} works on missing ${c.target}`);
  }
  for (const f of s.utilities.fittings) if (!sids.has(f.building)) add('fitting_orphan', `${f.kind} on missing ${f.building}`);
  for (const id of s.utilities.broken) if (!sids.has(id)) add('broken_orphan', id);
  for (const id of s.utilities.fried) if (!sids.has(id)) add('fried_orphan', id);
  for (const id of s.utilities.off) if (!sids.has(id)) add('off_orphan', id);
  if (s.focus && !targets.has(s.focus)) add('focus_orphan', s.focus);
  for (const h of s.hardenJobs) { const id = (h as unknown as { building?: string; structure?: string }).building ?? (h as unknown as { structure?: string }).structure; if (id && !sids.has(id)) add('harden_orphan', id); }
  for (const ps of s.personState) {
    if (ps.needs.died != null || !ps.target) continue;
    if (ps.task === 'build' && !targets.has(ps.target)) add('person_target_orphan', `${ps.id} builds missing ${ps.target}`);
  }

  // orders: unique, finite, a delivered order is not due in the future
  const oids = new Set<string>();
  for (const o of s.orders) {
    if (oids.has(o.id)) add('order_dup', o.id);
    oids.add(o.id);
    if (o.status === 'delivered' && o.dueAt > s.clock.t + 1e-6) add('order_early', `${o.id} delivered before ${o.dueAt}`);
    for (const l of o.lines) if (l.qty < 0) add('order_negative', `${o.id} ${l.material} ${l.qty}`);
  }

  // ids: the counter is ahead of every numbered id
  const ahead = (id: string) => { const m = /^[a-z]+(\d+)$/.exec(id); return m ? Number(m[1]) : -1; };
  for (const id of [...sids, ...rids, ...oids]) if (ahead(id) >= s.nextId) add('nextid_behind', `${id} >= ${s.nextId}`);

  // time only moves forward
  if (opt.prev && s.clock.t < opt.prev.t - 1e-9) add('time_backwards', `${opt.prev.t} -> ${s.clock.t}`);

  // a finished building does not disappear without a word in the log
  if (opt.prev) {
    const now = new Set(s.structures.map(x => x.id)), fresh = s.log.filter(l => l.t >= opt.prev!.t - 1e-9);
    for (const st of opt.prev.finished) {
      if (now.has(st.id)) continue;
      // an upgrade in place hands its id to a replacement; a joiner's rig may leave with its owner
      if (s.structures.some(x => x.replaces === st.id)) continue;
      if (!fresh.some(l => LOSS_WORDS.test(l.text))) add(st.kind.includes('solar') ? 'solar_vanished' : 'structure_vanished', `${st.kind} ${st.id} gone with no loss in the log`);
    }
  }
  return v;
}

/** Save round trip: export to JSON, import (migrate), and compare with the live state. Returns the first differing path, or null. */
export function firstDifference(a: unknown, b: unknown, path = ''): string | null {
  if (a === b) return null;
  if (typeof a === 'number' && typeof b === 'number') return Object.is(a, b) || (Number.isNaN(a) && Number.isNaN(b)) ? null : `${path}: ${a} vs ${b}`;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return `${path}: ${JSON.stringify(a)?.slice(0, 60)} vs ${JSON.stringify(b)?.slice(0, 60)}`;
  const A = a as Record<string, unknown>, B = b as Record<string, unknown>;
  if (Array.isArray(a) !== Array.isArray(b)) return `${path}: array vs object`;
  const keys = new Set([...Object.keys(A), ...Object.keys(B)]);
  for (const k of keys) {
    // `undefined` and "absent" are the same thing in a save
    if (A[k] === undefined && B[k] === undefined) continue;
    const d = firstDifference(A[k], B[k], path ? `${path}.${k}` : k);
    if (d) return d;
  }
  return null;
}
