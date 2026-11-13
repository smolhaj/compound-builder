/**
 * Which places burn or smolder on the compound right now (sim/raidFire.ts fires; sim/raidDamage.ts uncleared burn scars), as the
 * world-space sources FireFx draws. Pure: the caller supplies each structure's box and the ground. No new sim state.
 */
import type { FireSource } from '../../engine/world/fx/FireFx';

export interface FireBox { cx: number; cz: number; w: number; d: number; y0: number; h: number }
export interface FireGame {
  raidFires?: ReadonlyArray<{ structure: string; x: number; z: number; intensity: number }>;
  raidDamage?: ReadonlyArray<{ kind: string; x: number; z: number; day: number; done: number; hours: number }>;
  clock: { t: number };
}

/** Days a cleared-not-yet scar keeps smoking. */
export const SMOLDER_DAYS = 10;
const MAX = 8;

export function fireSources(g: FireGame, boxOf: (structureId: string) => FireBox | undefined, ground: (x: number, z: number) => number): FireSource[] {
  const out: FireSource[] = [];
  for (const f of [...(g.raidFires ?? [])].sort((a, b) => b.intensity - a.intensity)) {
    if (out.length >= MAX) break;
    const b = boxOf(f.structure);
    const gy = ground(f.x, f.z);
    if (b) out.push({ x: b.cx, y: b.y0 + b.h * 0.55, z: b.cz, radius: Math.max(0.15, Math.min(b.w, b.d) * 0.36), height: b.h * 0.85 + 0.25, intensity: clamp01(f.intensity), smolder: 0 });
    else out.push({ x: f.x, y: gy + 0.25, z: f.z, radius: 0.3, height: 0.6, intensity: clamp01(f.intensity), smolder: 0 });
  }
  const day = Math.floor(g.clock.t);
  const scars = (g.raidDamage ?? []).filter(d => d.kind === 'burn' && d.done < d.hours).map(d => ({ d, k: 1 - (day - d.day) / SMOLDER_DAYS })).filter(s => s.k > 0).sort((a, b) => b.k - a.k);
  for (const { d, k } of scars) {
    if (out.length >= MAX) break;
    out.push({ x: d.x, y: ground(d.x, d.z) + 0.04, z: d.z, radius: 0.28, height: 0.35, intensity: 0, smolder: clamp01(k) * 0.9 });
  }
  return out;
}
const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));
