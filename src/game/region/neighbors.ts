/**
 * neighbors — the farms around the homestead (GDS §5.5: neighbors with
 * history; for now just their farmsteads on the land). Seeded per parcel:
 * a few Cache Valley / Gallatin Valley style farms on the plain east and
 * south of the parcel, on gentle ground clear of the creek and the reservoir.
 */
import type { Farmstead } from '../../engine/world/houses/farmstead';
import { PARCEL_SIZE, type ParcelTerrain } from '../parcel/parcelTerrain';

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function planNeighbors(t: ParcelTerrain, count = 3): Farmstead[] {
  const rnd = mulberry32(t.seed * 31 + 5);
  const out: Farmstead[] = [];
  const c = PARCEL_SIZE / 2;
  const wy = t.region.waterY ?? -Infinity;
  for (let tries = 0; tries < 400 && out.length < count; tries++) {
    // mostly east / south-east / north-east on the plain (the range is west)
    const a = (rnd() - 0.5) * Math.PI * 1.4;
    const d = 70 + rnd() * 150;
    const x = c + Math.cos(a) * d, z = c + Math.sin(a) * d;
    if (Math.max(Math.abs(x - c), Math.abs(z - c)) < c + 22) continue;   // off the parcel and its trees
    if (out.some(f => Math.hypot(f.x - x, f.z - z) < 60)) continue;
    // a level yard, dry, away from the creek
    let lo = Infinity, hi = -Infinity;
    for (const [dx, dz] of [[-9, -9], [9, -9], [-9, 9], [9, 9], [0, 0]]) {
      const h = t.height(x + dx, z + dz);
      lo = Math.min(lo, h); hi = Math.max(hi, h);
    }
    if (hi - lo > 1.2 || lo < wy + 0.6) continue;
    if (Math.abs(z - t.creek.zAt(x)) < 16) continue;
    const rot = Math.floor(rnd() * 4) * Math.PI / 2 + (rnd() - 0.5) * 0.1;
    out.push({ x, z, rot, big: rnd() < 0.35 });
  }
  return out;
}
