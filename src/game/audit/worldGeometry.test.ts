/**
 * Geometry audit of the world the game builds (docs/DECISIONS.md, "Geometry audit"): the real HomesteadWorld on real ground, a compound built and
 * finished on it by the sim's own build functions, checked with numbers and no WebGL. Complements sim/sceneAudit.ts (layout, in data) with what
 * only the drawn geometry shows: a floor hovering over the road bed, NaN in a buffer, the road leaving its profile, animals in the creek.
 * Default corpus is a handful of steep and flat starts; AUDIT_FULL=1 runs every region x two seeds and the steep lots (slow, a few minutes).
 */
import { describe, expect, it } from 'vitest';
import { buildAuditWorld } from './harness';
import { clearance, nonFiniteMeshes, objectsOf, roadProfileGap, strayThings, terrainStats } from './worldAudit';
import { listings, type Site } from '../../sim/site';
import { makeLotSite } from '../../sim/lotListing';
import { STEEP_LOTS } from '../../sim/sceneAudit';
import { REGION_IDS, type RegionId } from '../../sim/regions';
import { PARCEL_SIZE } from '../parcel/parcelTerrain';
import { footingGeometry } from '../buildkit/footing';
import { hourOf } from '../../sim/state';

const FULL = !!(globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.AUDIT_FULL;
const lot = (region: RegionId, kind: Parameters<typeof makeLotSite>[0]['kind'], relief: number, seed: number, creek?: boolean) => makeLotSite({ region, kind, relief, seed, creek });
const pick = (region: RegionId, i: number, seed = 3): Site => listings(seed, region)[i];

const CORPUS: Array<[string, Site, number]> = FULL
  ? [...[3, 11].flatMap(seed => REGION_IDS.flatMap(r => [0, 2, 4].map(i => [`${r}#${i} seed ${seed}`, pick(r, i, seed), seed] as [string, Site, number]))), ...STEEP_LOTS.map((s, i) => [`steep${i} ${s.region}/${s.kind}`, lot(s.region, s.kind, s.relief, s.seed, s.creek), 3] as [string, Site, number])]
  : [
    ['mountain_west hillside', pick('mountain_west', 0), 3],
    ['mountain_west island, steep', lot('mountain_west', 'island', 8, 10), 3],
    ['north_woods bluff, steep', lot('north_woods', 'bluff', 6, 12), 3],
    ['appalachia hillside', pick('appalachia', 2), 3],
    ['pnw ordinary', pick('pnw', 0), 3],
    ['plains creek and bridge', pick('plains', 2), 3],
  ];

/** What counts as hovering: the lowest part of a building more than this above the drawn ground under it (u; 0.1 is 2 ft). */
const HOVER = 0.1;
/** The camp's low points above the drawn ground (u; 0.07 is under 17 inches). */
const CAMP_HOVER = 0.07;

describe('footing: a stem wall down to ground that falls away under a floor', () => {
  it('draws nothing on level ground and a wall to the ground where it falls away', () => {
    expect(footingGeometry(1, 1, () => 0)).toBeNull();
    expect(footingGeometry(1, 1, () => -0.02)).toBeNull();
    const g = footingGeometry(1, 1, (lx) => (lx > 0 ? -0.3 : 0))!;
    expect(g).not.toBeNull();
    g.computeBoundingBox();
    expect(g.boundingBox!.min.y).toBeLessThanOrEqual(-0.3);   // reaches the low ground
    expect(g.boundingBox!.max.y).toBeLessThanOrEqual(1e-6);   // and never rises above the floor
    expect(g.boundingBox!.min.x).toBeGreaterThanOrEqual(-0.01);   // only on the side where it falls
  });
});

const env = (k: string): string | undefined => (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env[k];

/** Every violation of a built world, as [class, detail]. */
function violations(a: ReturnType<typeof buildAuditWorld>): Array<[string, string]> {
  const { world, g } = a, out: Array<[string, string]> = [];
  for (const m of nonFiniteMeshes(a.scene)) out.push(['non-finite', m]);
  // buildings stand on the drawn ground: no floor hovers over it (a wall-walk deck rides its wall; bunkers and the camp are their own cases)
  for (const o of objectsOf(world)) {
    if (o.kind === 'run' || o.kind.startsWith('bunker')) continue;
    const c = clearance(o.group, world.groundAt);
    // (the camp and its yard sit on their own level pad: the tent and the woodpile are on the ground, not up to 4 ft over it; a camp a dome has hidden is not drawn)
    if (o.kind === 'camp') { if (o.group.visible && c.lowMax > CAMP_HOVER) out.push(['camp hover', `${o.id} ${c.lowMax.toFixed(2)} u at ${c.at.map(v => v.toFixed(1))}`]); continue; }
    if (c.nonFinite > 0 || c.lowMax > HOVER) out.push(['hover', `${o.kind} ${o.id} ${c.lowMax.toFixed(2)} u at ${c.at.map(v => v.toFixed(1))}`]);
  }
  // the terrain: no mesh normal points down, and the drawn surface is the parcel's own height function
  const ts = terrainStats(world, PARCEL_SIZE, 1);
  if (ts.flipped) out.push(['flipped normals', String(ts.flipped)]);
  if (ts.maxSeam >= 0.02) out.push(['terrain seam', ts.maxSeam.toFixed(3)]);
  // the drive keeps its profile on the ground (bridges, tunnels and culverts leave it on purpose)
  const gap = roadProfileGap(world);
  if (gap.worst >= 0.05) out.push(['road off its profile', `${gap.worst.toFixed(2)} u at station ${gap.at}`]);
  // animals and people a while later: none in the water, in a building, off the map or NaN
  for (const k of ['hen', 'goat', 'cow', 'sheep', 'pig'] as const) (g.stock as unknown as Record<string, number>)[k] = 4;
  for (let i = 0; i < 160; i++) {
    const t = g.clock.t + i * 0.01;
    world.updatePeople(0.25, g, hourOf(t), 1); world.updateWildlife(0.25, g, 1); world.updateLivestock(0.25, g, hourOf(t), 1);
  }
  for (const s of strayThings(world, PARCEL_SIZE)) out.push(['stray', `${s.what} (${s.x.toFixed(1)}, ${s.z.toFixed(1)})`]);
  return out;
}

describe('the built world, headless', () => {
  for (const [label, site, seed] of CORPUS) {
    it(label, { timeout: 180_000 }, () => {
      const a = buildAuditWorld(site, seed);
      expect(a.g.structures.length, 'a compound was built').toBeGreaterThan(5);
      const v = violations(a);
      const out = env('AUDIT_OUT');
      if (out) { const mod = 'node:fs'; void (import(/* @vite-ignore */ mod) as Promise<{ appendFileSync(p: string, d: string): void }>).then(fs => fs.appendFileSync(out, v.map(([k, d]) => `${label}\t${k}\t${d}\n`).join('') + `${label}\t(checked)\t0\n`)); }
      expect(v.map(([k, d]) => `${k}: ${d}`)).toEqual([]);
    });
  }
});
