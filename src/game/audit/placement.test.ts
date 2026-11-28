/**
 * Walls, roads and trees on a full homestead (docs/DECISIONS.md, "Sweep follow-ups"): the late-game compound (a dozen houses and sheds, the fortify ring,
 * the gate house) built headless on the classic forty of each region. No wall across the drive without a gate, none on the county road, the gate house on
 * the drive; no tree standing in a building or on a wall line, and no crown reaching more than 35 % of its radius over a roof.
 * AUDIT_FULL=1 runs every region x two seeds. PLACEMENT_REPORT=file appends one line per place.
 */
import { describe, expect, it } from 'vitest';
import { buildAuditWorld } from './harness';
import { crownsOverBuildings, treesOnBuildings, wallsOnRoads } from './worldAudit';
import { CLASSIC } from '../../sim/site';
import { REGION_IDS, type RegionId } from '../../sim/regions';

const env = (k: string): string | undefined => (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env[k];
const FULL = !!env('AUDIT_FULL');
const places: Array<[RegionId, number]> = FULL ? REGION_IDS.flatMap(r => [3, 7].map(s => [r, s] as [RegionId, number])) : [['ozarks', 7], ['new_england', 7], ['desert', 7], ['rust_belt', 7], ['hill_country', 7]];

describe('walls, roads and trees on a full homestead', () => {
  for (const [region, seed] of places) {
    it(`${region} seed ${seed}`, { timeout: 180_000 }, () => {
      const a = buildAuditWorld({ ...CLASSIC, region }, seed, 'built', 1, 'medium', true);
      expect(a.g.structures.length, 'a full compound').toBeGreaterThan(20);
      const roads = wallsOnRoads(a.world, a.g), trees = treesOnBuildings(a.world), crowns = crownsOverBuildings(a.world);
      const out = env('PLACEMENT_REPORT');
      if (out) { const mod = 'node:fs'; void (import(/* @vite-ignore */ mod) as Promise<{ appendFileSync(p: string, d: string): void }>).then(fs => fs.appendFileSync(out, `${region} ${seed}\troads ${roads.length}\ttrees ${trees.length}\tcrowns ${crowns.length}\n`)); }
      expect(roads.map(r => `${r.what}: ${r.detail}`)).toEqual([]);
      expect(trees.map(t => `${t.what} (${t.x.toFixed(1)}, ${t.z.toFixed(1)})`)).toEqual([]);
      expect(crowns.map(c => `crown r ${c.r.toFixed(2)} at (${c.x.toFixed(1)}, ${c.z.toFixed(1)})`)).toEqual([]);
    });
  }
});
