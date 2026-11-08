/**
 * Mercy by crew temper: who a crew spares, who it kills, who it takes, and whether a defender shoots a man who has surrendered. Pure and seeded.
 * The scene side only: `MercySource` is the small interface the sim agent will fill with real data; `styleMercy` is the stand-in that reads the
 * crew's style until then, and tests pass explicit `MercyData` fixtures. Deaths of every kind are drawn the same way (the user's choice).
 */
import type { Battle, MercyData } from './battleTypes';
import type { CrewStyle } from './raiderKinds';
import { mulberry32 } from './rng';

export type Fate = 'killed' | 'captured' | 'spared';
export interface Found { id: string; child: boolean; armed: boolean; /** Came out when told to, hands up. */ complies: boolean }

export interface MercySource { read(b: Battle): MercyData }

/** The stand-in until the sim supplies temper: a family or a scout party is merciful; a crowd, a crew or opportunists are hostile. */
export function styleMercy(style: CrewStyle | undefined): MercyData {
  return style === 'families' || style === 'scouts' ? { temper: 'merciful', spareChance: 0.85 } : { temper: 'hostile', captiveChance: style === 'crew' ? 0.35 : 0.2 };
}
export const styleSource: MercySource = { read: b => b.mercy ?? styleMercy(b.units.find(u => u.side === 'raider' && u.look)?.look?.style) };

/**
 * What becomes of the people a crew finds. Hostile: everyone found is killed, except that now and then (captiveChance) one is taken alive, and at
 * most a third of them. Merciful: children always spared; an unarmed adult who complies usually spared; an armed one never.
 */
export function decideFates(m: MercyData, found: readonly Found[], seed: number): Map<string, Fate> {
  const r = mulberry32(seed * 977 + 41), out = new Map<string, Fate>();
  if (m.temper === 'hostile') {
    let taken = 0;
    const cap = Math.max(found.length >= 3 ? 1 : 0, Math.floor(found.length / 3));
    for (const f of found) {
      if (taken < cap && r() < (m.captiveChance ?? 0.25) * (f.armed ? 0.5 : 1.4)) { out.set(f.id, 'captured'); taken++; } else out.set(f.id, 'killed');
    }
    return out;
  }
  for (const f of found) {
    if (f.child) out.set(f.id, 'spared');
    else if (f.armed) out.set(f.id, 'killed');
    else out.set(f.id, f.complies && r() < (m.spareChance ?? 0.85) ? 'spared' : 'killed');
  }
  return out;
}

/**
 * Does the defender shoot a raider who has put his hands up? A grieving defender (someone just died) mostly does, an angry one about half the time,
 * the rest almost never.
 */
export function shootsSurrenderer(d: { grieving?: boolean; angry?: boolean } | undefined, seed: number): boolean {
  const p = d?.grieving ? 0.75 : d?.angry ? 0.5 : 0.05;
  return mulberry32(seed * 1327 + 7)() < p;
}
