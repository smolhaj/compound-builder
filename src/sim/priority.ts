/**
 * Project priority: the family works through the staked buildings oldest
 * first, then the lines, then the fittings (sim/engine.ts). "Work on this
 * first" puts one building or one wall ahead of all of it, so a perimeter
 * that has sat at 54% for a year can be pulled forward without waiting for
 * every building to be done. A focus on something that is waiting for
 * materials is skipped (the family never stands idle for it). Pure (tested).
 */
import { blockedReason, canGoOn, isFinished, progress } from './construction';
import { hoursLeft } from './crews';
import { runBlocked, runFinished, runProgress, PERIMETER, type PerimeterRun } from './perimeter';
import type { GameState, Structure } from './state';

export interface Focused { st: Structure | null; run: PerimeterRun | null }

/** What `s.focus` points at, if it is still unfinished. */
export function focusOf(s: GameState): Focused | null {
  if (!s.focus) return null;
  const st = s.structures.find(x => x.id === s.focus && !isFinished(x)) ?? null;
  const run = st ? null : s.perimeter.find(r => r.id === s.focus && !runFinished(r)) ?? null;
  return st || run ? { st, run } : null;
}

/** The structure and the run the family should work on now: the focus first when it can go on, else the default order. */
export function pickWork(s: GameState, defaults: { building: () => Structure | null; line: () => PerimeterRun | null }): { target: Structure | null; run: PerimeterRun | null } {
  const f = focusOf(s);
  const fst = f?.st && canGoOn(s, f.st) ? f.st : null;
  const frun = f?.run && runBlocked(s, f.run) === null ? f.run : null;
  const target = frun ? null : fst ?? defaults.building();
  const run = target ? null : frun ?? defaults.line();
  return { target, run };
}

/** Put a project first (null clears it). Returns a reason when it cannot. */
export function setFocus(s: GameState, id: string | null): string | null {
  if (id === null) { s.focus = null; return null; }
  const st = s.structures.find(x => x.id === id), run = s.perimeter.find(r => r.id === id);
  if (st ? isFinished(st) : run ? runFinished(run) : true) return 'that is finished';
  s.focus = id;
  return null;
}

export interface ProjectRow {
  id: string;
  kind: 'building' | 'line';
  name: string;
  /** Person-hours left. */
  hours: number;
  /** 0–1 done. */
  pct: number;
  /** Why the family cannot work on it now (null = it can). */
  blocked: string | null;
  first: boolean;
}

/** Everything under way, in the order the family will get to it (the focus first). */
export function projectRows(s: GameState): ProjectRow[] {
  const rows: ProjectRow[] = [];
  for (const st of s.structures) if (!isFinished(st)) rows.push({ id: st.id, kind: 'building', name: st.kind, hours: hoursLeft(st), pct: progress(st), blocked: blockedReason(s, st), first: false });
  for (const r of s.perimeter) if (!runFinished(r)) rows.push({ id: r.id, kind: 'line', name: PERIMETER[r.kind].name, hours: Math.max(0, r.hours - r.done), pct: runProgress(r), blocked: runBlocked(s, r), first: false });
  const f = s.focus ? rows.findIndex(r => r.id === s.focus) : -1;
  if (f > 0) { const [x] = rows.splice(f, 1); rows.unshift(x); }
  if (rows.length && f >= 0) rows[0].first = true;
  return rows;
}
