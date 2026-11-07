/**
 * Balance harness: plays many seeded games (region, lot, lifestyle, difficulty, disaster and bot style all come from the game's index)
 * and writes one JSON line per game. Slow, so off by default:
 *
 *   BALANCE=200 BALANCE_OUT=/tmp/balance.jsonl npx vitest run scripts/balance.test.ts
 *   (BALANCE_SHARD=0/2 and BALANCE_SHARD=1/2 in two shells to use two cores; BALANCE_FROM=0 to start at another index;
 *    BALANCE_STYLES=passive,average BALANCE_DIFFS=hardcore to narrow a cell; BALANCE_DAYS=365 to cap a game's days after the hit.)
 *   (BALANCE_ODDS=1 also records the gate card's win / lose-someone odds for every wave: slower, about twice the time.)
 *   node scripts/balanceReport.mjs /tmp/balance.jsonl > REPORT.md
 *
 * Bot styles: passive (only the buttons the cards offer: src/sim/fuzz/passiveBot.ts), careless (a house, no guns, no stockpile, takes
 * the first answer at every gate), average (homestead), careful (prepper), walled (fortress). The cell for game i is
 * difficulty = i % 3, style = (i / 3) % 5 (balanced), the rest from the seed. Results and the numbers changed: docs/DECISIONS.md "Balance pass".
 */
import { describe, expect, it } from 'vitest';
import { appendFileSync } from 'node:fs';
import { play, siteFor, HOOKS, type Strategy } from './playtest.test';
import { REGION_IDS, PLAYABLE, type RegionId } from '../src/sim/regions';
import { SURPRISE_POOL, type DisasterKind } from '../src/sim/disaster';
import { fightOdds, postureOf } from '../src/sim/encounters';
import { daysOfFood } from '../src/sim/needs';
import { isHome } from '../src/sim/blueprints';
import { isFinished } from '../src/sim/construction';
import { crewQuote } from '../src/sim/crews';
import { mulberry32 } from '../src/sim/rng';
import type { GameState } from '../src/sim/state';
import type { PlannedBattle } from '../src/sim/battle';

export const STYLES: Record<string, Strategy> = { passive: 'passive', careless: 'careless', average: 'homestead', careful: 'prepper', walled: 'fortress' };
const DIFFS = ['cozy', 'standard', 'hardcore'] as const, LIVES = ['fulltime', 'independent', 'weekend'] as const;
const REGIONS = REGION_IDS.filter(r => PLAYABLE.has(r)) as RegionId[];
const N = Number(process.env.BALANCE ?? 0), FROM = Number(process.env.BALANCE_FROM ?? 0);
const [SH, SHN] = (process.env.BALANCE_SHARD ?? '0/1').split('/').map(Number);
const pick = <T,>(r: () => number, a: readonly T[]): T => a[Math.floor(r() * a.length)];

export interface GameRecord {
  i: number; seed: number; region: string; life: string; diff: string; style: string; kind: string; peace: string;
  ending: string; endDay: number; causes: string; hitAt: number; alive: number; total: number; hungry: number; grade: string;
  cash: Record<string, number>; minMoney: number; homeDay: number | null; homeCrew: boolean; homeCrewQuote: number | null; crewCardDay: number | null;
  foodAt: Record<string, number>; foodMin: number; waterShortDays: number; sickPeopleShare: number; sickDays: number; deadFirstYear: number;
  waves: Array<{ n: number; day: number; size: number; def: number; result: string; homeDead: number; people: number; win?: number; lose?: number; fighters?: number }>;
  firstRaid: { day: number; result: string; homeDead: number } | null; nothingToDo: number; quiet: number; ms: number;
}

function runGame(i: number): GameRecord {
  const r = mulberry32(i * 7919 + 13), seed = 5000 + i;
  const diff = DIFFS[i % 3], styleName = Object.keys(STYLES)[Math.floor(i / 3) % 5], strat = STYLES[styleName];
  const region = pick(r, REGIONS), life = pick(r, LIVES), kind = pick(r, SURPRISE_POOL) as DisasterKind, peace = pick(r, ['short', 'medium'] as const);
  process.env.DIFF = diff; process.env.LIFESTYLE = life;
  const site = siteFor(seed, region);
  const cash: Record<string, number> = {}, foodAt: Record<string, number> = {}, sick = new Set<string>();
  const waves: GameRecord['waves'] = [], rec = { homeDay: null as number | null, homeCrew: false, homeCrewQuote: null as number | null, crewCardDay: null as number | null, foodMin: 1e9, water: 0, sickDays: 0, nothing: 0, nothingRun: 0, quiet: 0, quietRun: 0, lastLog: -1, lastDay: 0, deadFirstYear: 0, firstRaid: null as GameRecord['firstRaid'] };
  let personDays = 0, pendingWave: { n: number; size: number; def: number; win?: number; lose?: number; fighters?: number } | null = null, lastB: unknown, stanceNow = '';
  const living = (s: GameState) => s.personState.filter(p => p.needs.died == null).length;
  let era0 = -1;
  HOOKS.halt = s => s.lineage.era !== era0;   // the world has moved on to the next era (after an ending): the year is over
  HOOKS.day = (s, day) => {
    if (era0 < 0) era0 = s.lineage.era;
    for (const d of [0, 30, 90, 180, 365]) if (day === d) cash['d' + d] = Math.round(s.money);
    const sinceHit = s.clock.t - s.disaster.hitAt;
    rec.lastDay = Math.max(0, Math.floor(sinceHit));
    const homes = s.structures.filter(x => isHome(x.kind) && !x.unplaced);
    if (rec.homeDay === null && homes.some(isFinished)) rec.homeDay = day;
    const open = homes.find(h => !isFinished(h));
    if (open) {
      if ((s.crews ?? []).some(c => c.target === open.id)) rec.homeCrew = true;
      if (rec.homeCrewQuote === null && !isFinished(open)) rec.homeCrewQuote = Math.round(crewQuote(open).usd);
    }
    if (sinceHit >= 0) {
      for (const d of [0, 90, 180, 365]) if (Math.floor(sinceHit) === d) cash['h' + d] = Math.round(s.money);
      const live = s.personState.filter(p => p.needs.died == null);
      for (const d of [0, 90, 180, 365]) if (Math.floor(sinceHit) === d) foodAt['d' + d] = Math.round(daysOfFood(s));
      if (live.length) rec.foodMin = Math.min(rec.foodMin, daysOfFood(s));
      if (s.utilities.report.shortL > 0) rec.water++;
      for (const p of live) { personDays++; const ill = p.needs.hurt.some(h => !h.trauma); if (ill) { rec.sickDays++; sick.add(p.id); } }
    }
    const nl = s.log.length ? s.log[s.log.length - 1].t : -1;
    if (nl > rec.lastLog) { rec.quietRun = 0; rec.lastLog = nl; } else { rec.quiet = Math.max(rec.quiet, ++rec.quietRun); }
    const busy = s.structures.some(x => !isFinished(x)) || s.orders.some(o => o.status === 'ordered') || !!s.gate.pending;
    if (!busy && s.money > 0) rec.nothing = Math.max(rec.nothing, ++rec.nothingRun); else rec.nothingRun = 0;
  };
  HOOKS.gate = (s, e, stance, def) => { pendingWave = e.wave ? { n: e.wave, size: e.size, def } : null;
    if (pendingWave && process.env.BALANCE_ODDS && e.stances.includes('defend')) { const o = fightOdds(s, e); pendingWave.win = +o.win.toFixed(2); pendingWave.lose = +o.loseSomeone.toFixed(2); pendingWave.fighters = postureOf(s).fighters; } stanceNow = stance; lastB = s.gate.battle; };
  HOOKS.after = (s, e) => {
    const b = (s.gate.battle !== lastB ? s.gate.battle : undefined) as PlannedBattle | undefined, dead = b ? b.events.filter(x => x.kind === 'death' && x.unit.startsWith('h_')).length : 0;
    const day = Math.floor(s.clock.t - s.disaster.hitAt);
    if (pendingWave && e.wave) waves.push({ ...pendingWave, day, result: b?.result ?? stanceNow, homeDead: dead, people: living(s) });
    if (!rec.firstRaid && b) rec.firstRaid = { day, result: b.result, homeDead: dead };
  };
  const t0 = Date.now();
  let res;
  try { res = play(strat, kind, seed, peace, site, 0, Number(process.env.BALANCE_DAYS ?? 365)); } finally { HOOKS.day = HOOKS.gate = HOOKS.after = HOOKS.halt = undefined; }
  const s = res.s, total = s.personState.filter(p => !p.needs.left).length, alive = living(s);
  rec.deadFirstYear = s.personState.filter(p => p.needs.died != null && !p.needs.left).length;
  return {
    i, seed, region, life, diff, style: styleName, kind, peace, ending: res.ending, endDay: rec.lastDay, causes: res.causes, hitAt: Math.round(s.disaster.hitAt), alive, total, hungry: res.hungry, grade: res.grade,
    cash, minMoney: res.minMoney, homeDay: rec.homeDay, homeCrew: rec.homeCrew, homeCrewQuote: rec.homeCrewQuote, crewCardDay: rec.crewCardDay, foodAt, foodMin: rec.foodMin === 1e9 ? -1 : Math.round(rec.foodMin),
    waterShortDays: rec.water, sickPeopleShare: s.personState.length ? +(Math.min(1, sick.size / s.personState.length)).toFixed(3) : 0, sickDays: personDays ? +(rec.sickDays / personDays).toFixed(4) : 0, deadFirstYear: rec.deadFirstYear,
    waves, firstRaid: rec.firstRaid, nothingToDo: rec.nothing, quiet: rec.quiet, ms: Date.now() - t0,
  };
}

describe.skipIf(!N)('balance harness', () => {
  it('plays the games', () => {
    const out = process.env.BALANCE_OUT ?? '/tmp/balance.jsonl', diffs = process.env.BALANCE_DIFFS?.split(','), styles = process.env.BALANCE_STYLES?.split(',');
    let n = 0;
    for (let i = FROM; i < FROM + N; i++) {
      if (i % SHN !== SH) continue;
      if (diffs && !diffs.includes(DIFFS[i % 3])) continue;
      if (styles && !styles.includes(Object.keys(STYLES)[Math.floor(i / 3) % 5])) continue;
      const g = runGame(i); n++;
      appendFileSync(out, JSON.stringify(g) + '\n');
    }
    expect(n).toBeGreaterThan(0);
  }, 24 * 3_600_000);
});
