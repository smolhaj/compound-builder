/**
 * What a raid leaves standing, and what it does not (raid depth, user decision 2). Pure and seeded.
 *
 * A fight the family lost, or won narrowly, breaks things, and they stay broken until the family mends them:
 *
 *   breach   a gap knocked through the fence where the crew came over (the battle's own `breach` point, on the nearest wall run)
 *   gate     the gate leaf wrenched off its hinges, when the crew came through the gate
 *   burn     a scorched, charred patch where something was set on fire (a shed, a coop); the wreck has to be cleared
 *   glass    the windows of the house: this is the existing repair job on a building (`Structure.fixes`, part "glass")
 *
 * Open damage costs real work and material (`bill`, `hours`), is worked by the family like any other repair (engine.ts takes the oldest
 * one when nothing is under construction), shows as a Next-steps card and, when the materials are missing, as a stuck project
 * (stalls.ts, guidance.ts), and weakens the line until it is mended (`damagePenalty` is subtracted from the walls' barrier in
 * `postureOf`). The saved state is `GameState.raidDamage`; an old save has none.
 */
import type { Battle } from './battleTypes';
import { hasAll, shortfall, type MaterialId, type Stock } from './materials';
import { PERIMETER, runBill, runFinished, type PerimeterRun, type Pt } from './perimeter';
import { crackGlass, pendingFixes } from './improvements';
import { isFinished } from './construction';
import { isHome } from './blueprints';
import { log } from './economy';
import { dayIndex, type GameState } from './state';

export type DamageKind = 'breach' | 'gate' | 'burn';

export interface RaidDamage {
  id: string;
  kind: DamageKind;
  x: number;
  z: number;
  /** The wall run broken through (breach, gate). */
  runId?: string;
  /** Game day index it happened. */
  day: number;
  hours: number;
  done: number;
  /** The materials have been taken from the stockpile. */
  supplied: boolean;
  bill: Partial<Stock>;
  /** What it was, for the card ("the ruins of the shed"). */
  what?: string;
}

/** How much a breach and a broken gate take off the walls' barrier score until mended (and the most damage can take off). */
export const PENALTY = { breach: 7, gate: 11, burn: 0, cap: 28 } as const;
const MAX_OPEN = 6;

export const openDamage = (s: GameState): RaidDamage[] => (s.raidDamage ?? []).filter(d => d.done < d.hours);

/** Barrier points the open breaches and broken gates take off the line. */
export function damagePenalty(s: GameState): number {
  let p = 0;
  for (const d of openDamage(s)) p += PENALTY[d.kind];
  return Math.min(PENALTY.cap, p);
}

function nearestOnRun(run: PerimeterRun, x: number, z: number): { d: number; x: number; z: number } {
  let best = { d: Infinity, x: 0, z: 0 };
  for (let i = 1; i < run.pts.length; i++) {
    const [ax, az] = run.pts[i - 1] as Pt, [bx, bz] = run.pts[i] as Pt;
    const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
    const px = ax + dx * t, pz = az + dz * t, d = Math.hypot(x - px, z - pz);
    if (d < best.d) best = { d, x: px, z: pz };
  }
  return best;
}

/** The finished, people-stopping wall run nearest a point (the one a crew came through). */
export function nearestWall(s: GameState, x: number, z: number): { run: PerimeterRun; x: number; z: number; d: number } | null {
  let best: { run: PerimeterRun; x: number; z: number; d: number } | null = null;
  for (const run of s.perimeter) {
    const def = PERIMETER[run.kind];
    if (!def || !runFinished(run) || def.blocks.people < 0.5 || def.height < 0.3 || run.pts.length < 2) continue;
    const n = nearestOnRun(run, x, z);
    if (!best || n.d < best.d) best = { run, ...n };
  }
  return best;
}

/** Whether a point is at one of a run's gates (within about 2 units of the gate's middle along the run). */
function atGate(run: PerimeterRun, x: number, z: number): boolean {
  if (!run.gates.length) return false;
  let acc = 0;
  const marks: Array<{ at: number; x: number; z: number }> = [];
  for (let i = 1; i < run.pts.length; i++) {
    const [ax, az] = run.pts[i - 1] as Pt, [bx, bz] = run.pts[i] as Pt;
    const len = Math.hypot(bx - ax, bz - az);
    for (const g of run.gates) if (g.at >= acc && g.at < acc + len) { const t = (g.at - acc) / (len || 1); marks.push({ at: g.at, x: ax + (bx - ax) * t, z: az + (bz - az) * t }); }
    acc += len;
  }
  return marks.some(m => Math.hypot(m.x - x, m.z - z) < 2.2);
}

const damageId = (s: GameState) => `d${s.nextId++}`;

/**
 * Lay damage on the place after a raid that got in (or nearly): `battle` is the fight (its `breach` events say where the line broke), `overrun`
 * whether they took the house. Returns lines for the outcome card.
 */
export function applyRaidDamage(s: GameState, battle: Battle | null, overrun: boolean, r: () => number): string[] {
  const lines: string[] = [];
  const day = dayIndex(s.clock.t);
  const add = (d: Omit<RaidDamage, 'id' | 'day' | 'done' | 'supplied'>): void => {
    if (openDamage(s).length >= MAX_OPEN) return;
    (s.raidDamage ??= []).push({ ...d, id: damageId(s), day, done: 0, supplied: Object.keys(d.bill).length === 0 });
  };
  const breaches = battle ? battle.events.filter(e => e.kind === 'breach') : [];
  let made = 0;
  for (const e of breaches) {
    if (e.kind !== 'breach' || made >= 2) break;
    const w = nearestWall(s, e.x, e.z);
    if (!w || w.d > 14) continue;
    if (openDamage(s).some(d => d.runId === w.run.id && Math.hypot(d.x - w.x, d.z - w.z) < 3)) continue;
    const gate = atGate(w.run, w.x, w.z);
    if (gate) { add({ kind: 'gate', x: w.x, z: w.z, runId: w.run.id, hours: 20, bill: { lumber: 3, hardware: 3 }, what: 'the gate' }); lines.push('The gate was wrenched off its hinges.'); }
    else { add({ kind: 'breach', x: w.x, z: w.z, runId: w.run.id, hours: 12 + Math.round(r() * 6), bill: runBill(w.run.kind, 3), what: 'the fence' }); lines.push('They knocked a gap through the fence.'); }
    made++;
  }
  // the windows: a crew that reached the house, or took it
  const home = s.structures.find(st => isFinished(st) && isHome(st.kind));
  const nearHouse = !!home && breaches.some(e => e.kind === 'breach' && Math.hypot(e.x - home.x, e.z - home.z) < 7);
  if (home && (overrun || nearHouse || (made > 0 && r() < 0.35))) {
    if (!pendingFixes(home).some(f => f.part === 'glass') && crackGlass(home, overrun ? 'poor' : 'fair')) lines.push(overrun ? 'Most of the downstairs windows are broken.' : 'A few windows were shot out.');
  }
  return lines;
}

/** A wreck to clear where something was set on fire. */
export function addBurnScar(s: GameState, x: number, z: number, what: string): void {
  if (openDamage(s).length >= MAX_OPEN) return;
  (s.raidDamage ??= []).push({ id: damageId(s), kind: 'burn', x, z, day: dayIndex(s.clock.t), hours: 8, done: 0, supplied: true, bill: {}, what });
}

const blocked = (s: GameState, d: RaidDamage): boolean => !d.supplied && !hasAll(s.stock, d.bill);

/** The next damage the family can work on (oldest first). */
export function nextDamage(s: GameState): RaidDamage | null {
  for (const d of openDamage(s)) if (!blocked(s, d)) return d;
  return null;
}

export const damageNoun = (d: RaidDamage): string => d.kind === 'gate' ? 'gate repair' : d.kind === 'breach' ? 'fence repair' : 'cleanup of the burned wreck';
export const damageName = (d: RaidDamage): string => d.kind === 'gate' ? 'Hang the gate again' : d.kind === 'breach' ? 'Mend the gap in the fence' : `Clear the burned ${d.what ?? 'ground'}`;

/** Work on a damage job; returns hours used. Finishing it takes the damage off the list. */
export function addDamageWork(s: GameState, d: RaidDamage, hours: number): number {
  if (d.done >= d.hours) return 0;
  if (!d.supplied) {
    if (!hasAll(s.stock, d.bill)) return 0;
    for (const [k, n] of Object.entries(d.bill) as Array<[MaterialId, number]>) s.stock[k] -= n;
    d.supplied = true;
  }
  const use = Math.min(hours, d.hours - d.done);
  d.done += use;
  if (d.done >= d.hours - 1e-9) { d.done = d.hours; log(s, `${damageName(d)}: done.`); }
  return use;
}

/** Materials the open damage still lacks (for the order button and the stuck-project card). */
export function damageNeed(s: GameState): Array<{ d: RaidDamage; miss: Partial<Stock> }> {
  const out: Array<{ d: RaidDamage; miss: Partial<Stock> }> = [];
  for (const d of openDamage(s)) if (!d.supplied) { const miss = shortfall(s.stock, d.bill); if (Object.keys(miss).length) out.push({ d, miss }); }
  return out;
}

/** Plain words for the card and the report: "a gap in the fence, the gate". */
export function damageSummary(s: GameState): string[] {
  const o = openDamage(s);
  const out: string[] = [];
  const n = (k: DamageKind) => o.filter(d => d.kind === k).length;
  if (n('breach')) out.push(n('breach') === 1 ? 'a gap in the fence' : `${n('breach')} gaps in the fence`);
  if (n('gate')) out.push('the gate off its hinges');
  if (n('burn')) out.push(n('burn') === 1 ? 'a burned wreck' : `${n('burn')} burned wrecks`);
  if (s.structures.some(st => isHome(st.kind) && pendingFixes(st).some(f => f.part === 'glass'))) out.push('broken windows');
  return out;
}

/** The work left on all open damage, in hours. */
export const damageHoursLeft = (s: GameState): number => openDamage(s).reduce((a, d) => a + d.hours - d.done, 0);

/** What a raid broke that is new since `before`, in plain words, for the report card. */
export function newDamage(before: GameState, after: GameState): string[] {
  const had = new Set((before.raidDamage ?? []).map(d => d.id));
  const out: string[] = [];
  for (const d of after.raidDamage ?? []) if (!had.has(d.id)) out.push(d.kind === 'gate' ? 'the gate off its hinges' : d.kind === 'breach' ? 'a gap in the fence' : `the ${d.what ?? 'building'} burned`);
  const glass = (g: GameState) => g.structures.some(st => isHome(st.kind) && pendingFixes(st).some(f => f.part === 'glass'));
  if (glass(after) && !glass(before)) out.push('broken windows');
  return out;
}
