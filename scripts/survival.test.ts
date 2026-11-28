/**
 * Survival harness: the wipe rate by scenario and difficulty with a COMPETENT scripted player (the 'prepper' bot by default, one of the
 * balance harness's "careful" bots). One JSON line per game: who is alive at 365 and 730 days after the hit, and the day of the wipe.
 *
 *   SURVIVAL=30 SURV_KINDS=nuclear,grid_down SURV_DIFFS=cozy,standard,hardcore SURV_OUT=/tmp/surv.jsonl npx vitest run scripts/survival.test.ts
 *   env: SURV_STYLE=prepper|homestead|fortress (default prepper), SURV_DAYS=731 (days after the hit to play), SURV_SHARD=0/2, SURV_FROM=0 (first seed index)
 *   python3 scripts/survivalTable.py /tmp/surv.jsonl   (the table by scenario x difficulty)
 * Season, region, lot, lifestyle and peace come from the seed index, as in scripts/balance.test.ts. Docs: docs/DECISIONS.md "Wipe-rate balance".
 */
import { describe, expect, it } from 'vitest';
import { appendFileSync } from 'node:fs';
import { play, siteFor, HOOKS, type Strategy } from './playtest.test';
import { REGION_IDS, PLAYABLE, type RegionId } from '../src/sim/regions';
import { DISASTERS, type DisasterKind } from '../src/sim/disaster';
import { mulberry32 } from '../src/sim/rng';

const N = Number(process.env.SURVIVAL ?? 0), FROM = Number(process.env.SURV_FROM ?? 0);
const DIFFS = (process.env.SURV_DIFFS ?? 'cozy,standard,hardcore').split(',') as Array<'cozy' | 'standard' | 'hardcore'>;
const KINDS = (process.env.SURV_KINDS?.split(',') ?? Object.keys(DISASTERS)) as DisasterKind[];
const LIVES = ['fulltime', 'independent', 'weekend'] as const;
const REGIONS = REGION_IDS.filter(r => PLAYABLE.has(r)) as RegionId[];
const [SH, SHN] = (process.env.SURV_SHARD ?? '0/1').split('/').map(Number);

describe.skipIf(!N)('survival harness', () => {
  it('plays the games', () => {
    const out = process.env.SURV_OUT ?? '/tmp/surv.jsonl', strat = (process.env.SURV_STYLE ?? 'prepper') as Strategy, days = Number(process.env.SURV_DAYS ?? 731);
    let idx = 0;
    for (const kind of KINDS) for (const diff of DIFFS) for (let j = FROM; j < FROM + N; j++, idx++) {
      if (idx % SHN !== SH) continue;
      const r = mulberry32(j * 7919 + KINDS.indexOf(kind) * 131 + 17), seed = 7000 + j * 31 + KINDS.indexOf(kind);
      const region = REGIONS[Math.floor(r() * REGIONS.length)], life = LIVES[Math.floor(r() * LIVES.length)], peace = r() < 0.5 ? 'short' : 'medium';
      process.env.DIFF = diff; process.env.LIFESTYLE = life;
      const site = siteFor(seed, region);
      const at: Record<string, number> = {}; let wipeDay: number | null = null, era0 = -1;
      HOOKS.halt = s => s.lineage.era !== era0;
      HOOKS.day = (s) => {
        if (era0 < 0) era0 = s.lineage.era;
        const since = Math.floor(s.clock.t - s.disaster.hitAt);
        if (since < 0) return;
        const alive = s.personState.filter(p => p.needs.died == null && !p.needs.left).length;
        if (since === 0 || since === 90 || since === 180 || since === 365 || since === 548 || since === 730) at['d' + since] = alive;
        if (alive === 0 && wipeDay === null) wipeDay = since;
      };
      const t0 = Date.now();
      let res;
      try { res = play(strat, kind, seed, peace, site, 0, days); } finally { HOOKS.day = HOOKS.halt = undefined; }
      const s = res.s, total = s.personState.filter(p => !p.needs.left).length;
      appendFileSync(out, JSON.stringify({ kind, diff, j, seed, region, life, peace, strat, ending: res.ending, wipeDay, at, total, causes: res.causes, ms: Date.now() - t0 }) + '\n');
    }
    expect(idx).toBeGreaterThan(0);
  }, 24 * 3_600_000);
});
