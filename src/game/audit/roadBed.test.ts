/**
 * The county road's graded bed (docs/DECISIONS.md, "County road bed"): its drawn centre line is smooth and inside the road grade, and the
 * surface sits on the ground across its width. Run on the steep lots and on flat regions. AUDIT_FULL=1 adds every region x two seeds;
 * ROADBED_REPORT=file appends one line per place (the before / after numbers of the PR).
 */
import { describe, expect, it } from 'vitest';
import { buildAuditWorld } from './harness';
import { countyStats } from './worldAudit';
import { listings, type Site } from '../../sim/site';
import { makeLotSite } from '../../sim/lotListing';
import { STEEP_LOTS } from '../../sim/sceneAudit';
import { REGION_IDS } from '../../sim/regions';

const env = (k: string): string | undefined => (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env[k];
const FULL = !!env('AUDIT_FULL');

/** The centre line strays from its own 6 u running mean by no more than this (u; 0.08 is under 2 ft; the old road bounced 0.1 to 0.8). */
export const BOUNCE_MAX = 0.08;
/** The steepest local grade of the drawn county road: the 10 % sustained limit with a little for a sample step; on the steep lots, where holding 10 % would mean a fill taller than COUNTY_DEV, the road keeps within that and takes the land's grade (never past 27 % at a sample). */
export const GRADE_MAX = 0.13, STEEP_GRADE_MAX = 0.27;
/** The surface against the drawn ground across the road (the mesh is 0.5 u a cell): no floating over or burying in the slope (u; 0.14 is under 3 ft where the old road was out by 0.6). */
export const ACROSS_MAX = 0.14;
/** The drive's first station against the road it leaves (u). */
export const JOIN_MAX = 0.05;

/** Regions whose first listing is hill country: the land along the road is steeper than the grade limit over long runs. */
const HILLY = ['appalachia', 'pnw', 'ozarks', 'rust_belt'];
const places: Array<[string, Site, number, boolean]> = [
  ...STEEP_LOTS.map((s, i) => [`steep${i} ${s.region}/${s.kind}`, makeLotSite({ region: s.region, kind: s.kind, relief: s.relief, seed: s.seed, creek: s.creek }), 3, true] as [string, Site, number, boolean]),
  ...REGION_IDS.flatMap(r => (FULL ? [3, 11] : [3]).map(seed => [`${r}#0 seed ${seed}`, listings(seed, r)[0], seed, HILLY.includes(r)] as [string, Site, number, boolean])),
];

describe('the county road bed', () => {
  for (const [label, site, seed, steep] of places) {
    it(label, { timeout: 180_000 }, () => {
      const a = buildAuditWorld(site, seed, 'bare');
      const c = countyStats(a.world);
      const out = env('ROADBED_REPORT');
      if (out) { const mod = 'node:fs'; void (import(/* @vite-ignore */ mod) as Promise<{ appendFileSync(p: string, d: string): void }>).then(fs => fs.appendFileSync(out, `${label}\tbounce ${c.bounce.toFixed(3)}@${c.bounceAt.toFixed(0)}\tgrade ${c.maxGrade.toFixed(2)}@${c.at.toFixed(0)}\tacross ${c.across.toFixed(2)}\tjoin ${c.join.toFixed(2)}\tearth ${c.earth.toFixed(2)}\n`)); }
      if (env('ROADBED_REPORT') && env('ROADBED_NOASSERT')) return;
      expect(c.bounce, `bounce at z ${c.at.toFixed(1)}`).toBeLessThanOrEqual(BOUNCE_MAX);
      expect(c.maxGrade, `grade at z ${c.at.toFixed(1)}`).toBeLessThanOrEqual(steep ? STEEP_GRADE_MAX : GRADE_MAX);
      expect(Math.abs(c.across), 'surface against ground').toBeLessThanOrEqual(ACROSS_MAX);
      expect(c.join, 'drive joins the county road').toBeLessThanOrEqual(JOIN_MAX);
    });
  }
});
