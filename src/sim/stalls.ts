/**
 * Stalled projects (QA run 4: a family lived in tents for years, with $697k in the bank, because one metal
 * roofing was never ordered). Everything a project can be "waiting for materials" on is listed here, the
 * days it has waited are counted, and once it has waited long enough with the cash to fix it the game says
 * so loudly: a Next-steps card at the top, a board line, a log/ticker line, each with a one-click order.
 *
 * Pure. `waiters` is also the test oracle for `guidance.plansNeedLines` (the order button must cover every
 * material any waiting project lacks). The only saved state is `GameState.stalls` (project key -> first day seen waiting).
 */
import { shortfall, MATERIALS, MATERIAL_IDS, billText, type MaterialId, type Stock } from './materials';
import { onOrder, orderCost, orderProblem, prices } from './economy';
import { blueprintOf, isFinished } from './construction';
import { runFinished, runBill, wallLength } from './perimeter';
import { fixBill, pendingFixes } from './improvements';
import { FIT } from './utilities';
import { hardenCost } from './hardening';
import { isHome } from './blueprints';
import { KIT } from '../game/buildkit/kit';
import type { GameState, OrderLine } from './state';
import { pluralize } from './words';
import { queuedLogs } from './forestry';
import { damageNoun, openDamage } from './raidDamage';
import { NEED_KEYS, activeNeeds, needDays, type NeedKey } from './needsStuck';

/** Days a project waits for materials, with the cash to buy them, before the game makes noise about it. */
export const STALL_DAYS = 3;
/** A stall this old, with the cash in hand, is escalated: red card at the top, red board line, a second log line. */
export const ESCALATE_DAYS = 7;

type Miss = Partial<Record<MaterialId, number>>;
export interface Waiter { key: string; label: string; home: boolean; miss: Miss; /** The building to select (null: a wall run). */ at: string | null }

const nameOf = (kind: string) => (KIT[kind]?.name ?? kind.replace(/_/g, ' '));

/** Every project that cannot go on for want of materials, with what it lacks right now (the stockpile only; orders on the way are not counted). */
export function waiters(s: GameState): Waiter[] {
  const out: Waiter[] = [];
  const push = (key: string, label: string, home: boolean, bill: Partial<Stock>, at: string | null) => {
    const miss = shortfall(s.stock, bill);
    if (Object.keys(miss).length) out.push({ key, label, home, miss, at });
  };
  for (const st of s.structures) {
    if (!isFinished(st) && !st.supplied) {
      const stage = blueprintOf(st).stages[st.stage];
      if (stage) push(`s:${st.id}`, nameOf(st.kind), isHome(st.kind), stage.materials, st.id);
    }
    for (const f of pendingFixes(st)) if (!f.supplied) push(`f:${st.id}:${f.part}`, `${nameOf(st.kind)} (${f.part} repair)`, isHome(st.kind), fixBill(f), st.id);
  }
  for (const d of openDamage(s)) if (!d.supplied) push(`d:${d.id}`, damageNoun(d), false, d.bill, null);
  for (const r of s.perimeter) if (!runFinished(r) && !r.supplied) push(`r:${r.id}`, 'the wall', false, runBill(r.kind, wallLength(r)), null);
  for (const j of s.hardenJobs) {
    const st = s.structures.find(x => x.id === j.building);
    if (j.finishedAt === null && !j.supplied && st) push(`h:${j.id}`, `${nameOf(st.kind)} hardening`, false, hardenCost(st.kind, j.upgrade, j.tier).materials, st.id);
  }
  for (const f of s.utilities.fittings) if (f.finishedAt === null && !f.supplied) {
    const st = s.structures.find(x => x.id === f.building);
    push(`u:${f.building}:${f.kind}`, `${st ? nameOf(st.kind) : 'the building'} ${f.kind === 'plumb' ? 'plumbing' : 'wiring'}`, !!st && isHome(st.kind), FIT[f.kind].materials, st?.id ?? null);
  }
  return out;
}

/** The materials some waiting project lacks right now (the family carries those loads in from the road first). */
export function wantedNow(s: GameState): Set<MaterialId> {
  const out = new Set<MaterialId>();
  for (const w of waiters(s)) for (const k of Object.keys(w.miss) as MaterialId[]) out.add(k);
  return out;
}

/** The buyable part of a shortfall as order lines, less what is already on the way (whole units: any sliver still blocks the crew). */
export function missLines(s: GameState, miss: Miss, pending: Miss = onOrder(s)): OrderLine[] {
  const lines: OrderLine[] = [];
  const left: Miss = { ...pending };
  for (const k of MATERIAL_IDS) {
    const m = miss[k] ?? 0;
    if (m <= 0 || MATERIALS[k].price === null) continue;
    const covered = Math.min(m, left[k] ?? 0); left[k] = (left[k] ?? 0) - covered;
    const qty = Math.ceil(m - covered);
    if (qty > 0) lines.push({ material: k, qty });
  }
  return lines;
}

/** Keep `s.stalls` (key -> first day seen waiting) in step with who waits now; returns the keys that are newly past the limit and not yet announced. */
export function noteStalls(s: GameState): Array<{ w: Waiter; days: number }> {
  const now = s.clock.t, cur = waiters(s), old = s.stalls ?? {}, next: NonNullable<GameState['stalls']> = {};
  const fresh: Array<{ w: Waiter; days: number }> = [];
  for (const w of cur) {
    const was = old[w.key];
    next[w.key] = was ?? { since: now };
    const days = now - next[w.key].since;
    if (days >= STALL_DAYS && !next[w.key].said) fresh.push({ w, days });
  }
  // food, beds and medicine are tracked in the same table once they are short (sim/needsStuck.ts)
  for (const k of activeNeeds(s)) next[k] = old[k] ?? { since: now };
  s.stalls = next;
  return fresh;
}

export interface Stuck { /** Waited ESCALATE_DAYS or more with the cash to fix it. */ escalated: boolean; key: string; at: string | null; label: string; days: number; lines: OrderLine[]; cost: number; others: number }

/** The one stalled project to nag about: a home first, then the longest wait. Null when none is past the limit, nothing is buyable, or the cash is not there. */
export function stuckProject(s: GameState): Stuck | null {
  const marks = s.stalls ?? {};
  const cands = waiters(s)
    .map(w => ({ w, days: s.clock.t - (marks[w.key]?.since ?? s.clock.t) }))
    .filter(x => x.days >= STALL_DAYS)
    .sort((a, b) => Number(b.w.home) - Number(a.w.home) || b.days - a.days);
  const pending = onOrder(s);
  for (const c of cands) {
    const lines = missLines(s, c.w.miss, pending);
    if (!lines.length || orderProblem(s, lines)) continue;
    return { escalated: c.days >= ESCALATE_DAYS, key: c.w.key, at: c.w.at, label: c.w.label, days: Math.floor(c.days), lines, cost: orderCost(lines, prices(s)), others: cands.length - 1 };
  }
  return null;
}

/** A project that waits on logs: they cannot be bought, only felled from the family's own trees (sim/forestry.ts). */
export interface LogWait {
  key: string; at: string | null; label: string; home: boolean; days: number;
  /** Logs the project lacks, the logs already coming from marked trees, and the logs still to be marked. */
  short: number; queued: number; need: number;
  /** A hired crew is on this project (it stands idle until the logs are in). */
  crewed: boolean;
}

/** The project to nag about for want of logs: a home first, then the longest wait. Null when nothing waits on logs. */
export function logWait(s: GameState): LogWait | null {
  const marks = s.stalls ?? {}, queued = queuedLogs(s);
  const cands = waiters(s).filter(w => (w.miss.logs ?? 0) > 0)
    .map(w => ({ w, days: Math.max(0, s.clock.t - (marks[w.key]?.since ?? s.clock.t)) }))
    .sort((a, b) => Number(b.w.home) - Number(a.w.home) || b.days - a.days);
  const c = cands[0];
  if (!c) return null;
  const short = Math.ceil(c.w.miss.logs ?? 0);
  return { key: c.w.key, at: c.w.at, label: c.w.label, home: c.w.home, days: Math.floor(c.days), short, queued, need: Math.max(0, Math.ceil(short - queued)),
    crewed: !!c.w.at && (s.crews ?? []).some(x => x.target === c.w.at) };
}

const usd = (n: number) => '$' + Math.round(n).toLocaleString('en-US');
/** "1 metal roofing" for order lines. */
export const linesText = (lines: readonly OrderLine[]): string => billText(Object.fromEntries(lines.map(l => [l.material, l.qty])));
/** "Order 1 metal roofing, $525". */
export const stuckAction = (x: Stuck): string => `Order ${linesText(x.lines)}, ${usd(x.cost)}`;
/** The same on a narrow button: "Order it, $525". */
export const stuckShort = (x: Stuck): string => `Order it, ${usd(x.cost)}`;

/** Once a day: log (and ticker) a line the first time a project has waited past the limit while the order is affordable. Returns the lines. */
export function stallsDay(s: GameState): string[] {
  const fresh = noteStalls(s), pending = onOrder(s), out: string[] = [];
  for (const { w, days } of fresh) {
    const lines = missLines(s, w.miss, pending);
    if (!lines.length || orderProblem(s, lines)) continue;
    s.stalls![w.key].said = true;
    out.push(`The ${w.label} has been stuck for ${pluralize(Math.floor(days), 'day')} waiting on ${linesText(lines)}. Order it (${usd(orderCost(lines, prices(s)))}) so work can continue.`);
  }
  // food, beds and medicine that stay short get the same loud line when they cross the limit
  const NEED_LINE: Record<NeedKey, (d: number) => string> = {
    'need:food': d => `Out of food for ${pluralize(d, 'day')}. Open the food shelf and order staples or add everything missing.`,
    'need:beds': d => `Somebody has had no bed for ${pluralize(d, 'day')}. Stake a home or buy tents (Build tab).`,
    'need:meds': d => `Somebody has been out of their medicine for ${pluralize(d, 'day')}. Fill the prescriptions or open the medical shelf.`,
  };
  for (const k of NEED_KEYS) {
    const m = s.stalls![k];
    if (!m || m.said) continue;
    const d = needDays(s, k);
    if (d >= STALL_DAYS) { m.said = true; out.push(NEED_LINE[k](d)); }
  }
  // waiting on logs (not for sale): say what to do once, with the crew named if one stands idle
  const lw = logWait(s);
  if (lw && lw.days >= 1 && !s.stalls![lw.key].said) {
    s.stalls![lw.key].said = true;
    out.push(lw.need > 0
      ? `The ${lw.label.toLowerCase()} is waiting for ${pluralize(lw.short, 'log')}, and logs are not for sale. Mark trees to fell (Build tab, Next steps): pines and aspens give logs, cottonwoods only firewood.${lw.crewed ? ' The hired crew stands idle until the logs are in.' : ''}`
      : `The ${lw.label.toLowerCase()} is waiting for ${pluralize(lw.short, 'log')}. The marked trees will cover it once the family has felled them.${lw.crewed ? ' The hired crew stands idle until then.' : ''}`);
  }
  // still there two weeks on, with the cash in hand: a louder second line (nothing stored; it fires on the day it crosses)
  for (const w of waiters(s)) {
    const days = Math.floor(s.clock.t - (s.stalls?.[w.key]?.since ?? s.clock.t));
    if (days !== ESCALATE_DAYS) continue;
    const lines = missLines(s, w.miss, pending);
    if (!lines.length || orderProblem(s, lines)) continue;
    out.push(`STILL STUCK: the ${w.label} has waited ${pluralize(days, 'day')} and you have ${usd(s.money)}. Order ${linesText(lines)} (${usd(orderCost(lines, prices(s)))}) or the work cannot go on.`);
  }
  return out;
}
