/**
 * Animals on a tunnel-bridge (docs/DECISIONS.md, "Wildlife on open tunnel-bridges"): by day, while the steel doors stand open, a deer, an elk, an antelope, a
 * javelina, a coyote or a wolf near a bridge's mouth may walk across it, at the deck's own height, and come off the far end. Doors shut dusk to dawn and
 * on the alarm (sim/corridors `locksNow`): nothing starts a crossing then, and one under way is finished (the leaf is not drawn on the beast). Rock tunnels
 * stay closed to animals: a bore is dark, a long way and a blast door. Pure (tested); the renderer supplies the bridges and the clock.
 */
import type { SpeciesId } from '../../sim/wildlife';

/** The kinds that use a bridge: the hoofed grazers of open country and the dogs. Bears and cougars keep to the cover; small game keeps to its burrows. */
export const CROSSERS: ReadonlySet<SpeciesId> = new Set<SpeciesId>(['deer', 'elk', 'antelope', 'javelina', 'coyote', 'wolf']);
export const speciesCrosses = (sp: SpeciesId): boolean => CROSSERS.has(sp);

/** A tunnel-bridge as the animals see it: its deck (portal to portal, absolute height) and the free ground at each end. */
export interface Bridge { id: string; deck: ReadonlyArray<readonly [number, number, number]>; mouth: readonly [readonly [number, number], readonly [number, number]] }

/** How near a mouth an animal has to be to think of the bridge (units, 60 m), and the chance a second while grazing there. */
export const CROSS_REACH = 10, CROSS_PER_S = 0.04;

export interface CrossPlan { bridge: Bridge; from: 0 | 1; mouth: [number, number] }

/** The bridge an animal at (x, z) would use now: the nearest mouth within reach, when the doors are open and it is a kind that crosses; else null. */
export function planCross(sp: SpeciesId, x: number, z: number, bridges: readonly Bridge[], open: boolean, reach = CROSS_REACH): CrossPlan | null {
  if (!open || !speciesCrosses(sp)) return null;
  let best: CrossPlan | null = null, bd = reach;
  for (const b of bridges) for (const e of [0, 1] as const) {
    const m = b.mouth[e], d = Math.hypot(m[0] - x, m[1] - z);
    if (d < bd) { bd = d; best = { bridge: b, from: e, mouth: [m[0], m[1]] }; }
  }
  return best;
}

/** The deck points in walking order from the end the animal stands at, then the far mouth (where it steps off). */
export function deckFrom(b: Bridge, from: 0 | 1, ground?: (x: number, z: number) => number): Array<[number, number, number]> {
  const d = b.deck.map(p => [p[0], p[1], p[2]] as [number, number, number]);
  const far = b.mouth[from === 0 ? 1 : 0], last = d[from === 0 ? d.length - 1 : 0];
  const out = from === 0 ? d : d.reverse();
  // the far mouth is on the ground: the last leg runs from the deck down (or up) to the ground it steps onto, so there is no step in the air
  out.push([far[0], far[1], ground ? ground(far[0], far[1]) : last[2]]);
  return out;
}

export interface OnDeck { x: number; z: number; y?: number; rot: number; deck?: Array<[number, number, number]> }

/**
 * Walk `dist` units along the deck: sets the position, the deck height and the heading. Returns true when the animal has stepped off the far end (the deck
 * and the height are cleared).
 */
export function advanceDeck(b: OnDeck, dist: number): boolean {
  const d = b.deck;
  if (!d || !d.length) return true;
  let left = dist;
  for (;;) {
    const n = d[0], dx = n[0] - b.x, dz = n[1] - b.z, l = Math.hypot(dx, dz);
    if (l > 1e-6) b.rot = Math.atan2(dx, dz);
    if (l <= left || l < 1e-6) {
      b.x = n[0]; b.z = n[1]; b.y = n[2]; left -= l; d.shift();
      if (!d.length) { b.deck = undefined; b.y = undefined; return true; }
      if (left <= 1e-9) return false;
    } else {
      const t = left / l, yFrom = b.y ?? n[2];
      b.x += dx * t; b.z += dz * t; b.y = yFrom + (n[2] - yFrom) * t;
      return false;
    }
  }
}
