/**
 * The camp on its ground (docs/DECISIONS.md, "Camp pad"): the tent, the table, the barrel and the chore yard (woodpile, block, line, tub) stand on the
 * drawn ground, not up to 4 ft over it on a slope. Bare worlds (the camp is the first thing there), the steep lots and every region.
 * CAMP_REPORT=file appends one line per place (the before / after numbers of the PR).
 */
import { describe, expect, it } from 'vitest';
import { buildAuditWorld } from './harness';
import { clearance, objectsOf } from './worldAudit';
import { listings, type Site } from '../../sim/site';
import { makeLotSite } from '../../sim/lotListing';
import { STEEP_LOTS } from '../../sim/sceneAudit';
import { REGION_IDS } from '../../sim/regions';

const env = (k: string): string | undefined => (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env[k];
/** The camp's low points above the drawn ground (u; 0.07 is under 17 inches; before the pad it was up to 0.9 on the steep lots). */
export const CAMP_HOVER_MAX = 0.07;

const places: Array<[string, Site, number]> = [
  ...STEEP_LOTS.map((s, i) => [`steep${i} ${s.region}/${s.kind}`, makeLotSite({ region: s.region, kind: s.kind, relief: s.relief, seed: s.seed, creek: s.creek }), 3] as [string, Site, number]),
  ...REGION_IDS.flatMap(r => [3, 11].flatMap(seed => [0, 1, 2, 3, 4].map(i => [`${r}#${i} seed ${seed}`, listings(seed, r)[i], seed] as [string, Site, number]))),
];

describe('the camp stands on the ground', () => {
  for (const [label, site, seed] of places) {
    it(label, { timeout: 120_000 }, () => {
      const a = buildAuditWorld(site, seed, 'bare');
      let worst = 0, what = '';
      for (const o of objectsOf(a.world)) {
        if (o.kind !== 'camp' || !o.group.visible) continue;
        const c = clearance(o.group, a.world.groundAt);
        if (c.lowMax > worst) { worst = c.lowMax; what = o.id; }
      }
      const out = env('CAMP_REPORT');
      if (out) { const mod = 'node:fs'; void (import(/* @vite-ignore */ mod) as Promise<{ appendFileSync(p: string, d: string): void }>).then(fs => fs.appendFileSync(out, `${label}\t${what}\t${worst.toFixed(3)}\n`)); }
      expect(worst, `${what} hovers`).toBeLessThanOrEqual(CAMP_HOVER_MAX);
    });
  }
});
