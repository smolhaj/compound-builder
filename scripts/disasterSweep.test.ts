/**
 * Disaster sweep (WP10): one short game per (kind x difficulty x seed) with the homestead bot, DAYS days after the hit. Reports survival
 * (anyone alive at the end), NaN checks and the minimum track level. Slow, so off by default:
 *
 *   DSWEEP=2 DSWEEP_DAYS=120 DSWEEP_OUT=/tmp/dsweep.jsonl npx vitest run scripts/disasterSweep.test.ts
 *   (DSWEEP = seeds per cell; DSWEEP_KINDS=oil_shock,water_war to narrow; DSWEEP_DIFFS=cozy; DSWEEP_STYLE=passive|careless|homestead|prepper)
 *   node scripts/dsweepReport.mjs /tmp/dsweep.jsonl
 */
import { describe, expect, it } from 'vitest';
import { appendFileSync } from 'node:fs';
import { play, siteFor, type Strategy } from './playtest.test';
import { DISASTERS, TRACKS, type DisasterKind } from '../src/sim/disaster';
import { REGION_IDS, PLAYABLE, type RegionId } from '../src/sim/regions';

const N = Number(process.env.DSWEEP ?? 0), DAYS = Number(process.env.DSWEEP_DAYS ?? 120);
const KINDS = (process.env.DSWEEP_KINDS?.split(',') ?? Object.keys(DISASTERS)) as DisasterKind[];
const DIFFS = (process.env.DSWEEP_DIFFS?.split(',') ?? ['cozy', 'standard', 'hardcore']) as Array<'cozy' | 'standard' | 'hardcore'>;
const STYLE = (process.env.DSWEEP_STYLE ?? 'homestead') as Strategy;
const REGIONS = REGION_IDS.filter(r => PLAYABLE.has(r)) as RegionId[];

describe.skipIf(!N)('disaster sweep', () => {
  it('plays the games', () => {
    const out = process.env.DSWEEP_OUT ?? '/tmp/dsweep.jsonl';
    let n = 0;
    for (const kind of KINDS) for (const diff of DIFFS) for (let i = 0; i < N; i++) {
      const seed = 9100 + i * 7 + KINDS.indexOf(kind), region = REGIONS[(seed + i) % REGIONS.length];
      process.env.DIFF = diff; process.env.LIFESTYLE = 'fulltime';
      const t0 = Date.now();
      let rec: Record<string, unknown>;
      try {
        const res = play(STYLE, kind, seed, 'short', siteFor(seed, region), 0, DAYS);
        const s = res.s, alive = s.personState.filter(p => p.needs.died == null).length, tr = s.disaster.tracks;
        const nan = TRACKS.some(t => !Number.isFinite(tr[t])) || !Number.isFinite(s.money);
        rec = { kind, diff, seed, region, ending: res.ending, alive, total: s.personState.length, nan, variant: s.disaster.variant, fate: s.disaster.fate, minTrack: Math.round(Math.min(...TRACKS.map(t => tr[t])) * 100) / 100, ms: Date.now() - t0 };
      } catch (e) { rec = { kind, diff, seed, region, error: String((e as Error).message ?? e).slice(0, 160), ms: Date.now() - t0 }; }
      appendFileSync(out, JSON.stringify(rec) + '\n'); n++;
    }
    expect(n).toBeGreaterThan(0);
  }, 3 * 3_600_000);
});
