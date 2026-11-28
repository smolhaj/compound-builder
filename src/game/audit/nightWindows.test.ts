/**
 * Night windows follow who lives where (docs/DECISIONS.md, "Night windows by household"): a house whose household is awake shows a lit window,
 * not only the main house; a house whose people sleep (or are away) is dark. Staged late-game compound (several homes), real atmosphere layer.
 * NIGHTWIN_REPORT=file appends the lit / dark window counts of each hour.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildAuditWorld } from './harness';
import { CLASSIC } from '../../sim/site';
import { KIT } from '../buildkit/kit';

const env = (k: string): string | undefined => (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env[k];

describe('night windows follow the household', () => {
  it('lights each home whose household is awake, and only those', { timeout: 120_000 }, () => {
    const a = buildAuditWorld({ ...CLASSIC, region: 'ozarks' }, 7, 'built', 1, 'medium', true);
    const { world, g } = a;
    const homes = g.structures.filter(s => !s.unplaced && (KIT[s.kind]?.sleeps ?? 0) > 0 && s.kind !== 'bunker_hatch').sort((x, y) => KIT[y.kind].sleeps - KIT[x.kind].sleeps);
    expect(homes.length, 'a compound with several homes').toBeGreaterThanOrEqual(3);
    // the household lives in three houses (the quarters' own choice: sim/quarters Person.home)
    g.people.forEach((p, i) => { p.home = homes[Math.min(i, 2)].id; });
    const lit = (): Set<string> => {
      const on = new Set<string>();
      for (const [id, b] of (world as unknown as { _built: Map<string, { group: THREE.Group }> })._built) b.group.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh && /^kit_glow_(oil|electric)/.test((m.material as THREE.Material).name)) on.add(id); });
      return on;
    };
    const frame = (hour: number) => { for (let i = 0; i < 3; i++) world.updateAtmosphere({ dt: 0.1, time: i, hour, night: 1, daylight: 0, wind: 0, rain: 0, cloud: 0, snow: 0, viewportH: 720, battle: false }, g, 200); return lit(); };
    g.personState.forEach(s => { s.task = 'leisure' as never; });
    const evening = frame(20.5);
    const homesHoused = new Set(g.people.map(p => p.home));
    for (const id of homesHoused) expect(evening.has(id as string), `home ${id} lit with its household awake`).toBe(true);
    for (const h of homes) if (!homesHoused.has(h.id)) expect(evening.has(h.id), `empty home ${h.id} dark`).toBe(false);
    g.personState.forEach(s => { s.task = 'sleep' as never; });
    expect(frame(20.5).size, 'everyone asleep: dark').toBe(0);
    const out = env('NIGHTWIN_REPORT');
    if (out) { const mod = 'node:fs'; void (import(/* @vite-ignore */ mod) as Promise<{ appendFileSync(p: string, d: string): void }>).then(fs => fs.appendFileSync(out, `homes ${homes.length}\tlit evening ${evening.size}\n`)); }
  });
});
