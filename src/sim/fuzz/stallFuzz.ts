import { newGame, type GameState } from '../state';
import { step } from '../engine';
import { listings, ANY_WISH, type LandWish } from '../site';
import { REGION_IDS, PLAYABLE, type RegionId } from '../regions';
import { DIFFICULTY, type Difficulty } from '../difficulty';
import { SURPRISE_POOL, type DisasterKind } from '../disaster';
import { waiters, missLines, stuckProject, STALL_DAYS } from '../stalls';
import { orderCost, orderProblem, prices, onOrder } from '../economy';
import { plansNeedLines, suggestions } from '../guidance';
import { logWait } from '../stalls';
import { planStructure } from '../construction';
import { applyForPermit } from '../paperwork';
import { housingShortfall } from '../housing';
import { crewQuote } from '../crews';
import { isHome } from '../blueprints';
import { isFinished } from '../construction';
import { botTurn, type BotLog } from './passiveBot';
import { mulberry32 } from '../rng';

const REGIONS = REGION_IDS.filter(r => PLAYABLE.has(r)) as RegionId[];
const DIFFS = Object.keys(DIFFICULTY) as Difficulty[];
const BUILT: Array<LandWish['built']> = ['raw', 'house', 'any'];
const LIVES = ['fulltime', 'independent', 'weekend'] as const;

export interface Violation { seed: number; kind: string; day: number; detail: string }
export interface FuzzRun { seed: number; setup: string; violations: Violation[]; wipedAt: number | null; stats: BotLog }

function pick<T>(r: () => number, a: readonly T[]): T { return a[Math.floor(r() * a.length)]; }

/** One seeded start: region, lot, pre-built home, disaster and difficulty all come from the seed. */
export function startFor(seed: number): { g: GameState; setup: string } {
  const r = mulberry32(seed * 7 + 3);
  const region = pick(r, REGIONS), built = pick(r, BUILT), diff = pick(r, DIFFS), life = pick(r, LIVES);
  const mode = r() < 0.5 ? 'surprise' : 'scenario';
  const kind = pick(r, SURPRISE_POOL);
  const wish = { ...ANY_WISH, built } as LandWish;
  const lots = listings(seed, region, wish, 6, 400_000);
  const site = lots[Math.floor(r() * lots.length)];
  const g = newGame(seed, undefined, undefined, { site, lifestyle: life, mode, peace: mode === 'scenario' ? pick(r, ['short', 'medium', 'long'] as const) : 'random', kind: mode === 'scenario' ? (kind as DisasterKind) : null, difficulty: diff, dayJobs: life !== 'independent', grid: true });
  return { g, setup: `${region}/${site.id}/${built}/${site.improvements.house?.kind ?? 'raw'}/${diff}/${life}/${mode === 'scenario' ? kind : 'surprise'}` };
}

const DAYS = 400, STEP = 2, WAIT_LIMIT = 21, SHELTER_LIMIT = 200;

export interface FuzzOpts {
  /** Stake a log house by hand before the first day (the stall QA run 6 found): the passive player must be led to mark trees for logs. */
  logHouse?: boolean;
}

export function fuzz(seed: number, days = DAYS, opts: FuzzOpts = {}): FuzzRun {
  const start = startFor(seed);
  let g = start.g;
  if (opts.logHouse) {
    const h = g.site.home;
    const st = planStructure(g, 'log_house', (h.x0 + h.x1) / 2 - 6, (h.z0 + h.z1) / 2, 0);
    applyForPermit(g, st);
    g.money = Math.max(g.money, 250_000);
  }
  const log: BotLog = { placed: 0, orders: 0, crews: 0 }, out: Violation[] = [];
  const waitSince: Record<string, number> = {}, seen = new Set<string>();
  const add = (kind: string, day: number, detail: string, key = kind) => { if (!seen.has(key)) { seen.add(key); out.push({ seed, kind, day, detail }); } };
  let wipedAt: number | null = null, richSince: number | null = null;
  for (let day = 0; day < days; day += STEP) {
    botTurn(g, log);
    // invariants, checked after the bot has had its turn on this day
    const now = g.clock.t, cur = waiters(g), keys = new Set(cur.map(w => w.key));
    for (const k of Object.keys(waitSince)) if (!keys.has(k)) delete waitSince[k];
    for (const w of cur) {
      waitSince[w.key] ??= now;
      const waited = now - waitSince[w.key];
      const lines = missLines(g, w.miss);
      const canBuy = lines.length > 0 && !orderProblem(g, lines);
      if (waited > WAIT_LIMIT && canBuy) add('waits-with-cash', day, `${w.label} (${w.key}) waited ${Math.floor(waited)}d for ${JSON.stringify(lines)} with $${Math.round(g.money)}; pending ${JSON.stringify(onOrder(g))}`, `w:${w.key}`);
      if (waited > STALL_DAYS + 1 && canBuy && !stuckProject(g)) add('stuck-without-card', day, `${w.label} (${w.key}) waited ${Math.floor(waited)}d, buyable, no stuck card`, `c:${w.key}`);
    }
    // a project waiting on a material that cannot be bought (logs): there must be a Next-steps card that says what to do, or marked trees that will cover it
    { const lw = logWait(g);
      if (lw) { waitSince['L:' + lw.key] ??= now; }
      for (const k of Object.keys(waitSince)) if (k.startsWith('L:') && (!lw || k !== 'L:' + lw.key)) delete waitSince[k];
      if (lw && now - waitSince['L:' + lw.key] > STALL_DAYS + 1 && lw.need > 0 && !suggestions(g, 12).some(x => x.id === 'logs')) add('unbuyable-without-card', day, `${lw.label} waits ${Math.floor(now - waitSince['L:' + lw.key])}d for ${lw.short} logs (not for sale), ${lw.queued} marked, no Next-steps card`, 'ub:' + lw.key);
      if (lw && now - waitSince['L:' + lw.key] > 150) add('unbuyable-stall', day, `${lw.label} waits ${Math.floor(now - waitSince['L:' + lw.key])}d for ${lw.short} logs with ${lw.queued} marked`, 'us:' + lw.key); }
    // shelter: after SHELTER_LIMIT days, with the crew and the order affordable (plus a margin) for two weeks running, somebody is still outside
    const sh = housingShortfall(g), homes = g.structures.filter(st => isHome(st.kind) && !st.unplaced);
    const open = homes.filter(h => !isFinished(h));
    const q = open.reduce((a, h) => a + crewQuote(h).usd, 0), need = orderCost(plansNeedLines(g), prices(g));
    const crewed = open.some(h => (g.crews ?? []).some(c => c.target === h.id));   // a crew on the job is progress, not a stall
    if (sh.outside > 0 && open.length && !crewed && g.money >= q + need + 9000) richSince ??= now; else richSince = null;
    if (day >= SHELTER_LIMIT && richSince !== null && now - richSince >= 14) add('shelter-unresolved', day, `${sh.outside} outside at day ${day}, open homes ${open.map(h => `${h.kind}@${h.stage}`).join(',')}, cash $${Math.round(g.money)} >= crew $${q} + order $${Math.round(need)}; crews ${(g.crews ?? []).length}`);
    if (day >= SHELTER_LIMIT && sh.outside > 0 && !homes.length && g.money > 100_000) add('shelter-no-home', day, `${sh.outside} outside, no home staked, cash $${Math.round(g.money)}`);
    g = step(g, STEP);
    if (g.ending) { wipedAt = day; break; }
  }
  return { seed, setup: start.setup, violations: out, wipedAt, stats: log };
}
