/**
 * FL4: what a decision card can do to the world. A small closed set of effects that edit real state (stock, money, humanity, neighbor
 * standing, health and morale, wounds, the next raid, the stealth posture), plus the cost rules (charge, afford) shared by the card
 * engine (cards.ts), the generic library (cardLibrary.ts) and the tests. Pure and deterministic given the dice; JSON-safe state only.
 */
import type { GameState } from '../state';
import { dayIndex } from '../state';
import { MATERIALS, type MaterialId } from '../materials';
import { DIFFICULTY } from '../difficulty';
import type { Cost } from './types';

export type Fx =
  | { k: 'stock'; id: MaterialId; n: number }
  | { k: 'money'; n: number }
  | { k: 'humanity'; n: number }
  /** Disposition of the neighbors still at home: the nearest takes `n`, the rest half of it. */
  | { k: 'standing'; n: number }
  | { k: 'morale'; n: number }
  | { k: 'health'; n: number; who: 'one' | 'all' }
  | { k: 'hurt'; what: string; sev: number }
  | { k: 'fever' }
  | { k: 'dose'; n: number }
  /** Days added to (or, negative, taken off) the wait for the next visitor at the gate. */
  | { k: 'raidDelay'; days: number }
  | { k: 'respect'; n: number }
  | { k: 'blackout' };

const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
const living = (s: GameState) => s.personState.map((ps, i) => ({ ps, p: s.people[i] })).filter(x => x.p && x.ps.needs.died == null);
export const adultsOf = (s: GameState) => living(s).filter(x => !x.p.kid);
export const homeNeighbors = (s: GameState) => s.neighbors.filter(n => n.status === 'home');
export const householdSize = (s: GameState): number => Math.max(1, s.people.length);
/** Round a price to the nearest $25. */
export const r25 = (x: number): number => Math.max(25, Math.round(x / 25) * 25);

/** Apply one effect; returns a plain line for the log, or null when it changed nothing worth saying. */
export function applyFx(s: GameState, fx: Fx, r: () => number): string | null {
  switch (fx.k) {
    case 'stock': {
      const before = s.stock[fx.id] ?? 0, after = Math.max(0, before + fx.n);
      s.stock[fx.id] = after;
      const d = after - before;
      return d === 0 ? null : `${d > 0 ? '+' : '-'}${Math.abs(Math.round(d * 10) / 10)} ${MATERIALS[fx.id].name.toLowerCase()}`;
    }
    case 'money': s.money = Math.max(0, s.money + fx.n); return fx.n ? `${fx.n > 0 ? '+' : '-'}$${Math.abs(Math.round(fx.n)).toLocaleString('en-US')}` : null;
    case 'humanity': s.gate.humanity = clamp(s.gate.humanity + fx.n, 0, 100); return fx.n ? `humanity ${fx.n > 0 ? 'up' : 'down'}` : null;
    case 'standing': {
      const home = homeNeighbors(s).sort((a, b) => a.km - b.km);
      home.forEach((n, i) => { n.disposition = clamp(n.disposition + (i === 0 ? fx.n : fx.n / 2), -100, 100); });
      return home.length && fx.n ? `${home[0].name[0].toUpperCase()}${home[0].name.slice(1)} think ${fx.n > 0 ? 'better' : 'worse'} of you` : null;
    }
    case 'morale': for (const { ps } of living(s)) ps.needs.morale = clamp(ps.needs.morale + fx.n, 0, 100); return fx.n ? `morale ${fx.n > 0 ? 'up' : 'down'}` : null;
    case 'health': {
      const all = living(s);
      if (!all.length) return null;
      const who = fx.who === 'all' ? all : [all.slice().sort((a, b) => a.ps.needs.health - b.ps.needs.health)[0]];
      for (const { ps } of who) ps.needs.health = clamp(ps.needs.health + fx.n, 0, 100);
      return `${fx.who === 'all' ? 'everyone' : who[0].p.first} ${fx.n > 0 ? 'better' : 'worse'}`;
    }
    case 'hurt': {
      const pool = adultsOf(s).filter(x => x.ps.needs.hurt.length < 3);
      if (!pool.length) return null;
      const t = pool[Math.floor(r() * pool.length)];
      t.ps.needs.hurt.push({ what: fx.what, sev: fx.sev });
      return `${t.p.first}: ${fx.what}`;
    }
    case 'fever': {
      const pool = living(s).filter(x => !x.ps.needs.hurt.some(h => h.what === 'fever'));
      if (!pool.length) return null;
      const t = pool[Math.floor(r() * pool.length)];
      t.ps.needs.hurt.push({ what: 'fever', sev: 40 });
      return `${t.p.first} has a fever`;
    }
    case 'dose': for (const { ps } of living(s)) ps.needs.dose += fx.n; return 'a dose of radiation';
    case 'raidDelay': {
      const day = dayIndex(s.clock.t), cur = s.gate.next < 0 ? day + 6 : s.gate.next;
      s.gate.next = Math.max(day + 1, cur + fx.days);
      return fx.days > 0 ? 'the road stays quieter' : 'trouble is likelier on the road';
    }
    case 'respect': s.gate.respect = clamp((s.gate.respect ?? 0) + fx.n, 0, 1); return null;
    case 'blackout': (s.opsec ??= { quietDeliveries: false, blackout: false }).blackout = true; return 'the house goes dark at night';
  }
}

/** Why a cost cannot be paid right now (null: it can). */
export function costProblem(s: GameState, c: Cost): string | null {
  if (c.money && s.money < c.money) return `It costs $${Math.round(c.money).toLocaleString('en-US')} and you have $${Math.floor(s.money).toLocaleString('en-US')}.`;
  for (const [id, n] of Object.entries(c.stock ?? {}) as Array<[MaterialId, number]>) {
    if ((s.stock[id] ?? 0) < n) return `You do not have ${n} ${MATERIALS[id].name.toLowerCase()}.`;
  }
  if (c.hours && !adultsOf(s).length) return 'There is nobody able to do the work.';
  return null;
}

/** Charge a cost (call `costProblem` first). Hours tire the grown-ups; humanity and standing are paid in points lost. */
export function charge(s: GameState, c: Cost, r: () => number): void {
  if (c.money) s.money -= c.money;
  for (const [id, n] of Object.entries(c.stock ?? {}) as Array<[MaterialId, number]>) s.stock[id] = Math.max(0, (s.stock[id] ?? 0) - n);
  if (c.hours) {
    const a = adultsOf(s);
    for (const { ps } of a) ps.fatigue = clamp((ps.fatigue ?? 0) + (c.hours * 2) / a.length, 0, 100);
  }
  if (c.humanity) applyFx(s, { k: 'humanity', n: -c.humanity }, r);
  if (c.standing) applyFx(s, { k: 'standing', n: -c.standing }, r);
}

/** How likely the bad branch is, from the base chance: the difficulty's wound scale, a thin crew and a tired one. */
export function badChance(s: GameState, base: number): number {
  const k = DIFFICULTY[s.disaster.difficulty ?? 'standard'].wound;
  const a = adultsOf(s), tired = a.length > 0 && a.reduce((t, x) => t + (x.ps.fatigue ?? 0), 0) / a.length > 50;
  return clamp(base * k + (a.length < 2 ? 0.08 : 0) + (tired ? 0.07 : 0), 0.04, 0.92);
}

/** Rich or poor, for the wording: cash on hand against what a typical hundred-dollar fix costs this household. */
export const wealthOf = (s: GameState): 'poor' | 'getting by' | 'rich' => {
  const per = s.money / householdSize(s);
  return per < 1200 ? 'poor' : per < 8000 ? 'getting by' : 'rich';
};
