/**
 * Where a dome may stand and what it takes to stake one: the footprint inside the property line (free placement, owner decision 6), what stands
 * under it (inside, straddling the wall, outside), the wealth gate and the permit (owner decisions 5 and 8), and the buried skirt against
 * tunnelers (decision 7). Pure (tested).
 */
import { TIER, type DomeTier } from './tiers';

export interface Circle { x: number; z: number; r: number }
export interface Rect { x0: number; z0: number; x1: number; z1: number }

/** How a rectangle sits against a circle: whole inside, clear of it, or across the wall. Exact for a rectangle. */
export function rectVsCircle(c: Circle, r: Rect): 'inside' | 'outside' | 'straddles' {
  const nx = Math.max(r.x0, Math.min(c.x, r.x1)), nz = Math.max(r.z0, Math.min(c.z, r.z1));
  const near = Math.hypot(nx - c.x, nz - c.z);
  const far = Math.max(...[[r.x0, r.z0], [r.x1, r.z0], [r.x0, r.z1], [r.x1, r.z1]].map(([x, z]) => Math.hypot(x - c.x, z - c.z)));
  if (far <= c.r) return 'inside';
  if (near >= c.r) return 'outside';
  return 'straddles';
}

/** Does the whole shell ring (and its interior, sampled) lie on the player's land? `owned(x, z)` is the parcel test. Returns the first sample off the lot, or null. */
export function offParcel(c: Circle, owned: (x: number, z: number) => boolean, rings = 4): [number, number] | null {
  if (!owned(c.x, c.z)) return [c.x, c.z];
  for (let i = 1; i <= rings; i++) {
    const rr = c.r * i / rings, n = Math.max(8, Math.round(rr * 12));
    for (let k = 0; k < n; k++) { const a = k / n * Math.PI * 2, x = c.x + Math.cos(a) * rr, z = c.z + Math.sin(a) * rr; if (!owned(x, z)) return [x, z]; }
  }
  return null;
}

/** Why the family cannot stake this tier with this much cash (null = it can). Founder and Magnate classes gate the big two. */
export function wealthGate(tier: DomeTier, cash: number): string | null {
  const g = TIER[tier].gateUsd;
  if (cash >= g) return null;
  const cls = tier === 'arcology' ? 'Magnate' : 'Founder';
  return `Needs about $${(g / 1e6).toFixed(0)} million in the bank (${cls} class)`;
}

/** County permit: fee scales with how strict the county is, the review is long. */
export const permitFee = (tier: DomeTier, strict: number): number => Math.round(TIER[tier].permitFee * (0.6 + 0.4 * strict) / 10) * 10;
export const reviewDays = (tier: DomeTier, strict: number, permitsK = 1): number => TIER[tier].reviewDays ? Math.max(1, Math.round(TIER[tier].reviewDays * strict * permitsK)) : 0;
export const needsPermit = (tier: DomeTier): boolean => TIER[tier].permitFee > 0;

/** A tunnel crew digs at about 6 to 14 ft: a skirt this much deeper than the dig turns it back. */
export const DIG_DEPTH_FT: [number, number] = [6, 14];
export const SKIRT_MARGIN_FT = 3;
export const skirtStopsDig = (skirtFt: number, digFt: number): boolean => skirtFt >= digFt + SKIRT_MARGIN_FT;
/** Share of dig attempts at the shell the skirt turns round (what `tunnelers.ts` would read as its skirt stop, 0.92 for a wall skirt). */
export function skirtStops(skirtFt: number): number { const [lo, hi] = DIG_DEPTH_FT; return Math.max(0, Math.min(0.995, (skirtFt - SKIRT_MARGIN_FT - lo) / (hi - lo))); }
/** Tunnels and the escape route cross the shell only through an airlock or sally port. */
export const TUNNEL_CROSSES_AT = 'airlock';
