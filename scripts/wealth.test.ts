/**
 * Wealth harness (playtest round 3): the same bot plays the same seeds at three wealth levels and the rows are compared.
 *
 *   WEALTH=20 WEALTH_OUT=/tmp/wealth.jsonl npx vitest run scripts/wealth.test.ts
 *   (WEALTH_SHARD=0/4 .. 3/4 to use four cores; WEALTH_STRATS=prepper,homestead; WEALTH_DAYS=365 days after the hit; WEALTH_SPEND=0 turns the idle-cash policy off.)
 *
 * Wealth (sim/startFunds.ts ranges, sim/site.ts LIFESTYLE): poor = full-time family at the floor of its range ($450k, jobs in town),
 * middle = full-time at $800k, rich = a financially independent family's real roll ($1M to $2M, passive income, no jobs). Each puts at most 40 %
 * of its nest egg into land and buys the priciest listing under that. The spend policy is the same for all three (what the Idle-cash and crew
 * cards offer a player): hire crews on unfinished work while the cash covers a week of wages plus a reserve, and hire contract guards with cash
 * to spare. So any gap in the rows is money, not a different player.
 */
import { describe, expect, it } from 'vitest';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { play, siteFor, HOOKS, type Strategy } from './playtest.test';
import { type RegionId } from '../src/sim/regions';
import { operational } from '../src/sim/operational';
import { daysOfFood } from '../src/sim/needs';
import { hireCrew, crewProblem } from '../src/sim/crews';
import { hireGuard, guardCount } from '../src/sim/guards';
import { isFinished } from '../src/sim/construction';
import { isHome } from '../src/sim/blueprints';
import { runFinished } from '../src/sim/perimeter';
import { defenseOf, postureOf } from '../src/sim/encounters';
import type { GameState } from '../src/sim/state';
import type { DisasterKind } from '../src/sim/disaster';
import type { PlannedBattle } from '../src/sim/battle';

export const WEALTH = {
  poor: { life: 'fulltime', funds: 450_000 },
  middle: { life: 'fulltime', funds: 800_000 },
  rich: { life: 'independent', funds: 0 },     // 0: the family's real independent roll
} as const;
type W = keyof typeof WEALTH;
const REGIONS: RegionId[] = (process.env.WEALTH_REGIONS?.split(',') ?? ['mountain_west', 'appalachia', 'plains']) as RegionId[];
const KINDS: DisasterKind[] = (process.env.WEALTH_KINDS?.split(',') ?? ['grid_down', 'financial']) as DisasterKind[];
const DIFFS = (process.env.WEALTH_DIFFS?.split(',') ?? ['standard', 'hardcore']);
const STRATS = (process.env.WEALTH_STRATS?.split(',') ?? ['prepper']) as Strategy[];
const N = Number(process.env.WEALTH ?? 0);
const [SH, SHN] = (process.env.WEALTH_SHARD ?? '0/1').split('/').map(Number);
const SPEND = process.env.WEALTH_SPEND !== '0';
const living = (s: GameState) => s.personState.filter(p => p.needs.died == null).length;

function run(w: W, region: RegionId, kind: DisasterKind, diff: string, strat: Strategy, k: number) {
  const seed = 7000 + k * 13 + REGIONS.indexOf(region) * 3 + KINDS.indexOf(kind);
  const spec = WEALTH[w];
  process.env.LIFESTYLE = spec.life; process.env.DIFF = diff; process.env.LANDSHARE = '0.4';
  if (spec.funds) process.env.FUNDS = String(spec.funds); else delete process.env.FUNDS;
  const site = siteFor(seed, region);
  const opDay: Record<string, number> = {}, paidSeen = new Map<string, number>(), orderSeen = new Set<string>();
  let crewPaid = 0, orders = 0, peakCrews = 0, guardsMax = 0, firstGuard = -1;
  const waves: Array<{ day: number; result: string; dead: number; lostPeople: number; def: number; size: number; stance: string }> = [];
  let pend: { size: number; def: number; stance: string; before: number } | null = null, lastB: unknown, hides = 0;
  HOOKS.day = (s, day) => {
    for (const c of s.crews ?? []) { crewPaid += c.paid - (paidSeen.get(c.id) ?? 0); paidSeen.set(c.id, c.paid); }
    for (const o of s.orders) if (!orderSeen.has(o.id)) { orderSeen.add(o.id); orders += o.cost; }
    peakCrews = Math.max(peakCrews, (s.crews ?? []).length);
    if (day % 2 === 0) {
      const ops = operational(s);
      for (const it of ops) if (it.done && opDay[it.id] === undefined) opDay[it.id] = day;
      if (ops.every(i => i.done) && opDay.all === undefined) opDay.all = day;
    }
    if (SPEND && day % 2 === 0) {
      // crews: the cash covers a week of wages plus a reserve; as many as 2 + one per $150k over the reserve
      const reserve = 40_000, spare = s.money - reserve, cap = 2 + Math.floor(Math.max(0, spare) / 150_000);
      if (spare > 10_000) {
        const open = [...s.structures.filter(x => !isFinished(x) && x.supplied), ...s.perimeter.filter(r => !runFinished(r))];
        for (const t of open) { if ((s.crews ?? []).length >= cap) break; if (!crewProblem(s, t)) hireCrew(s, t.id); }
      }
      // a contract guard per $120k over a $150k cushion, once there is a roof to guard
      if (s.structures.some(x => isHome(x.kind) && isFinished(x)) && guardCount(s) < Math.floor((s.money - 150_000) / 120_000) && !hireGuard(s) && firstGuard < 0) firstGuard = day;
      guardsMax = Math.max(guardsMax, guardCount(s));
    }
  };
  HOOKS.gate = (s, e, stance, def) => { pend = e.wave ? { size: e.size, def, stance, before: living(s) } : null; lastB = s.gate.battle; if (stance === 'hide') hides++; };
  HOOKS.after = (s) => {
    const b = (s.gate.battle !== lastB ? s.gate.battle : undefined) as PlannedBattle | undefined;
    if (pend) waves.push({ day: Math.floor(s.clock.t - s.disaster.hitAt), result: b?.result ?? pend.stance, dead: b ? b.events.filter(x => x.kind === 'death' && x.unit.startsWith('h_')).length : 0, lostPeople: pend.before - living(s), size: pend.size, def: pend.def, stance: pend.stance });
  };
  const t0 = Date.now();
  let r;
  try { r = play(strat, kind, seed, (process.env.WEALTH_PEACE ?? 'medium') as 'short' | 'medium', site, 0, 365); } finally { HOOKS.day = HOOKS.gate = HOOKS.after = undefined; }
  const s = r.s, total = s.personState.filter(p => !p.needs.left).length, alive = living(s);
  const hit = Math.round(s.disaster.hitAt), guardsPaid = s.guards?.paid ?? 0, land = Math.round(s.site.price * 1.03);
  const initial = Math.round((s.startFunds?.budget ?? 0) - s.site.price * 1.03);   // the cash on day one, after the land and closing costs
  const spentOther = Math.round(initial - s.money - crewPaid - orders - guardsPaid);   // negative: wages and passive income came in
  return {
    k, seed, wealth: w, region, kind, diff, strat, ending: r.ending, grade: r.grade, alive, total, lost: total - alive, causes: r.causes, hungry: r.hungry, hit,
    landUsd: land, acres: s.site.acres, startMoney: initial, passive: s.startFunds?.passive ?? 0, moneyAtHit: r.moneyAtHit, endMoney: Math.round(s.money), minMoney: r.minMoney, builtAtHit: r.builtAtHit,
    opDay, opAll: opDay.all ?? null, foodDays: Math.round(daysOfFood(s)), crewPaid: Math.round(crewPaid), orders: Math.round(orders), guardsPaid: Math.round(guardsPaid), other: spentOther, peakCrews, guardsMax, firstGuard,
    waves, raids: waves.length, raidsWon: waves.filter(x => x.result === 'repelled' || x.result === 'fled').length, raidDead: waves.reduce((a, x) => a + x.lostPeople, 0), raidsLostSomeone: waves.filter(x => x.lostPeople > 0).length, hides, defense: Math.round(defenseOf(postureOf(s))),
    structures: s.structures.filter(isFinished).length, ms: Date.now() - t0, bugs: r.bugs,
  };
}

describe.skipIf(!N)('wealth harness', () => {
  it('plays the cells', () => {
    const out = process.env.WEALTH_OUT ?? '/tmp/wealth.jsonl'; let n = 0, idx = 0;
    // resume: rows already in the file are not played again
    const done = new Set<string>(existsSync(out) ? readFileSync(out, 'utf8').split('\n').filter(Boolean).map(l => { const r = JSON.parse(l); return `${r.k ?? Math.floor((r.seed - 7000) / 13)}|${r.wealth}|${r.region}|${r.kind}|${r.diff}|${r.strat}`; }) : []);
    for (let k = 0; k < N; k++) for (const region of REGIONS) for (const kind of KINDS) for (const diff of DIFFS) for (const strat of STRATS) for (const w of ['poor', 'middle', 'rich'] as W[]) {
      if (idx++ % SHN !== SH) continue;
      if (done.has(`${k}|${w}|${region}|${kind}|${diff}|${strat}`)) continue;
      let row; try { row = run(w, region, kind, diff, strat, k); } catch (e) { row = { wealth: w, region, kind, diff, strat, k, err: String(e).slice(0, 200) }; }
      appendFileSync(out, JSON.stringify(row) + '\n'); n++;
    }
    expect(n).toBeGreaterThan(0);
  }, 24 * 3_600_000);
});
