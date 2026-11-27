/**
 * Soak harness: headless, pure-sim games across every disaster scenario and many seeds, with the scripted bots of scripts/playtest.test.ts
 * playing (build, order, hire, guns, joiners, gate answers) and src/sim/soak/invariants.ts checked after EVERY simulated day:
 * no NaN / Infinity, no negative stock, rosters in step, no orphaned crews / fittings / targets, no finished building gone without a loss
 * in the log, time forward, ids unique. Also: save round trip (export, import, migrate, compare) at random days, and determinism
 * (a second run of the same seed + scenario must hash the same at every checkpoint). A fraction of the gate answers is swapped for a random
 * stance the card offers (bad ones too).
 *
 *   SOAK=1 SOAK_SEEDS=20 SOAK_OUT=/tmp/soak.jsonl npx vitest run scripts/soak.test.ts
 *   env: SOAK_SHARD=0/4 (one shard per core), SOAK_KINDS=water_war,crop_blight, SOAK_YEARS=8 (else 5-15 by seed), SOAK_DET=0 (skip the double runs),
 *        SOAK_FROM=<first seed index>, SOAK_ONE=kind:seedIndex[:years] (replay one run; prints every violation with its day).
 *   node scripts/soakReport.mjs /tmp/soak.jsonl
 * Without SOAK the small fast subset below runs in the ordinary `npm test` (a few scenarios, a few simulated months).
 */
import { describe, expect, it } from 'vitest';
import { appendFileSync } from 'node:fs';
import { play, siteFor, HOOKS, type Strategy } from './playtest.test';
import { DISASTERS, type DisasterKind } from '../src/sim/disaster';
import { REGION_IDS, PLAYABLE, type RegionId } from '../src/sim/regions';
import { checkState, firstDifference, hashState, summarize, type Summary, type Violation } from '../src/sim/soak/invariants';
import { exportJson, importJson } from '../src/sim/save/migrations';
import { daysOfFood } from '../src/sim/needs';
import { mulberry32 } from '../src/sim/rng';
import type { GameState } from '../src/sim/state';

const DIFFS = ['cozy', 'standard', 'hardcore'] as const, LIVES = ['fulltime', 'independent', 'weekend', 'fulltime'] as const;
const STRATS: Strategy[] = ['homestead', 'prepper', 'fortress', 'careless', 'passive', 'idle'];
const YEARS = [5, 6, 7, 8, 10, 12, 15];
const REGIONS = REGION_IDS.filter(r => PLAYABLE.has(r)) as RegionId[];
export const KINDS = Object.keys(DISASTERS) as DisasterKind[];

export interface SoakSpec { kind: DisasterKind; j: number; seed: number; region: RegionId; diff: (typeof DIFFS)[number]; life: (typeof LIVES)[number]; strat: Strategy; peace: 'short' | 'medium'; years: number }
export function specFor(kind: DisasterKind, j: number, years?: number): SoakSpec {
  const k = KINDS.indexOf(kind);
  return { kind, j, seed: 20_000 + j * 131 + k * 7, region: REGIONS[(j + k) % REGIONS.length], diff: DIFFS[j % 3], life: LIVES[(j + k) % LIVES.length], strat: STRATS[(j + 2 * k) % STRATS.length], peace: (j + k) % 2 ? 'short' : 'medium', years: years ?? YEARS[(j * 3 + k) % YEARS.length] };
}

export interface SoakRecord { spec: SoakSpec; ms: number; ending: string; endDay: number; alive: number; total: number; money: number; peakMoney: number; minMoney: number; foodMin: number; hitAt: number; causes: string;
  failures: Array<{ code: string; day: number; detail: string; count: number }>; checks: number; roundTrips: number; deterministic: boolean | null; error: string | null }

const roll = (a: number, b: number) => { let h = (a * 73856093) ^ (b * 19349663); h = Math.imul(h ^ (h >>> 13), 0x5bd1e995); return ((h ^ (h >>> 15)) >>> 0) / 4294967296; };

/** One game, checked every day. `hashes` collects a state hash every 60 days (for the determinism comparison). */
export function soakRun(spec: SoakSpec, opt: { roundTrips?: boolean; hashes?: string[]; verbose?: boolean } = {}): SoakRecord {
  process.env.DIFF = spec.diff; process.env.LIFESTYLE = spec.life;
  const fails = new Map<string, { code: string; day: number; detail: string; count: number }>();
  const note = (day: number, v: Violation) => { const f = fails.get(v.code); if (f) f.count++; else fails.set(v.code, { code: v.code, day, detail: v.detail.slice(0, 300), count: 1 }); if (opt.verbose) appendFileSync(process.env.SOAK_VERBOSE_OUT ?? '/tmp/soak-verbose.txt', `d${day} ${v.code}: ${v.detail}\n`); };
  let prev: Summary | undefined, checks = 0, trips = 0, peak = 0, minMoney = 1e12, foodMin = 1e9, lastDay = 0, ending = 'running', error: string | null = null;
  const rnd = mulberry32(spec.seed ^ 0x5eed);
  HOOKS.day = (s: GameState, day: number) => {
    lastDay = day; checks++;
    for (const v of checkState(s, { prev })) note(day, v);
    prev = summarize(s);
    peak = Math.max(peak, s.money); minMoney = Math.min(minMoney, s.money);
    if (s.clock.t >= s.disaster.hitAt && s.personState.some(p => p.needs.died == null)) foodMin = Math.min(foodMin, daysOfFood(s));
    if (opt.hashes && day % 60 === 0) opt.hashes.push(`${day}:${hashState(s)}`);
    if (opt.roundTrips && (day === 1 || roll(spec.seed, day) < 1 / 220)) {
      try {
        const back = importJson(exportJson(s));
        const d = firstDifference(s, back);
        trips++;
        if (d) note(day, { code: 'roundtrip', detail: d });
        const again = checkState(back);
        for (const v of again) note(day, { code: 'roundtrip_' + v.code, detail: v.detail });
      } catch (e) { note(day, { code: 'roundtrip_throw', detail: String((e as Error).message).slice(0, 200) }); }
    }
  };
  // a fifth of the gate answers is a random stance the card offers: the bad ones too (a hide that is found, a fight that is lost, a take_in with no food)
  HOOKS.stance = (_s, e, dflt) => rnd() < 0.2 ? e.stances[Math.floor(rnd() * e.stances.length)] : dflt;
  const t0 = Date.now();
  let res: ReturnType<typeof play> | null = null;
  try {
    res = play(spec.strat, spec.kind, spec.seed, spec.peace, siteFor(spec.seed, spec.region), spec.years, 0);
  } catch (e) {
    error = `${(e as Error).message}\n${String((e as Error).stack ?? '').split('\n').slice(1, 5).join('\n')}`.slice(0, 700);
    note(lastDay, { code: 'exception', detail: error });
  } finally { HOOKS.day = HOOKS.stance = undefined; }
  if (res) {
    ending = res.ending;
    for (const b of res.bugs) note(lastDay, { code: 'play_bug', detail: b });
    if (opt.roundTrips) {
      try { const d = firstDifference(res.s, importJson(exportJson(res.s))); trips++; if (d) note(lastDay, { code: 'roundtrip', detail: 'final ' + d }); } catch (e) { note(lastDay, { code: 'roundtrip_throw', detail: 'final ' + String((e as Error).message).slice(0, 200) }); }
    }
  }
  const s = res?.s;
  return { spec, ms: Date.now() - t0, ending, endDay: lastDay, alive: s ? s.personState.filter(p => p.needs.died == null).length : -1, total: s ? s.personState.length : -1, money: s ? Math.round(s.money) : 0,
    peakMoney: Math.round(peak), minMoney: Math.round(minMoney), foodMin: foodMin === 1e9 ? -1 : Math.round(foodMin), hitAt: s ? Math.round(s.disaster.hitAt) : -1, causes: res?.causes ?? '',
    failures: [...fails.values()], checks, roundTrips: trips, deterministic: null, error };
}

/** Same spec twice: the checkpoint hashes must agree. Returns null when they do, else the first checkpoint that differs. */
export function determinismBreak(spec: SoakSpec): string | null {
  const a: string[] = [], b: string[] = [];
  soakRun(spec, { hashes: a }); soakRun(spec, { hashes: b });
  for (let i = 0; i < Math.max(a.length, b.length); i++) if (a[i] !== b[i]) return `checkpoint ${i} (day ${(a[i] ?? b[i] ?? '').split(':')[0]}): ${a[i]} vs ${b[i]}`;
  return null;
}

const SOAK = process.env.SOAK;
const SEEDS = Number(SOAK && SOAK !== '1' ? SOAK : process.env.SOAK_SEEDS ?? 20);

describe.skipIf(!SOAK)('soak: every scenario x many seeds, invariants after every day', () => {
  it('plays the matrix', () => {
    const out = process.env.SOAK_OUT ?? '/tmp/soak.jsonl', [sh, shn] = (process.env.SOAK_SHARD ?? '0/1').split('/').map(Number);
    const kinds = (process.env.SOAK_KINDS?.split(',') ?? KINDS) as DisasterKind[], yrs = process.env.SOAK_YEARS ? Number(process.env.SOAK_YEARS) : undefined;
    const doDet = process.env.SOAK_DET !== '0', from = Number(process.env.SOAK_FROM ?? 0);
    if (process.env.SOAK_ONE) {
      const [k, j, y] = process.env.SOAK_ONE.split(':');
      const rec = soakRun(specFor(k as DisasterKind, Number(j), y ? Number(y) : undefined), { roundTrips: true, verbose: true });
      appendFileSync(out, JSON.stringify(rec) + '\n');
      return;
    }
    let n = 0, idx = 0;
    for (const kind of kinds) for (let j = from; j < from + SEEDS; j++, idx++) {
      if (idx % shn !== sh) continue;
      const spec = specFor(kind, j, yrs);
      const rec = soakRun(spec, { roundTrips: true });
      if (doDet && j % 4 === 0 && !rec.error) {
        const d = determinismBreak(spec);
        rec.deterministic = d === null;
        if (d) rec.failures.push({ code: 'nondeterministic', day: 0, detail: d, count: 1 });
      }
      appendFileSync(out, JSON.stringify(rec) + '\n'); n++;
    }
    expect(n).toBeGreaterThan(0);
  }, 24 * 3_600_000);
});

// The fast subset (ordinary `npm test`): a handful of scenarios x a seed, a few simulated months each, every invariant, one save round trip, one determinism pair.
describe.skipIf(!!SOAK)('soak (fast subset)', () => {
  const FAST: DisasterKind[] = ['grid_down', 'water_war', 'crop_blight', 'pandemic'];
  for (const [i, kind] of FAST.entries()) {
    it(`${kind}: ${Math.round(365 * (0.4 + 0.1 * i))} days with every invariant, a save round trip`, () => {
      const rec = soakRun(specFor(kind, 1 + i, 0.4 + 0.1 * i), { roundTrips: true });
      expect(rec.failures, JSON.stringify(rec.failures, null, 1)).toEqual([]);
      expect(rec.checks).toBeGreaterThan(40);
    }, 60_000);
  }
  it('the same seed hashes the same (determinism)', () => {
    expect(determinismBreak(specFor('grid_down', 3, 0.3))).toBeNull();
  }, 60_000);
});
