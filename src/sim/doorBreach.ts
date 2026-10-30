/**
 * Breaching the steel door of a tunnel-bridge, slope tunnel or rock bore
 * (docs/DECISIONS.md, "Door breach roll"). The flat 8 s hold is gone: a crew
 * that comes to a locked door works at it with what it brought, and how long
 * that takes depends on the door, the crew's tools and explosives, what the
 * defenders do while it is stuck there, and a roll.
 *
 *  - Doors have a tier by kind: a tunnel-bridge or slope tunnel has a steel
 *    door (`steel`), a rock bore a blast door in its portal (`blast`).
 *  - A crew has tools: hand tools (bolt cutters, bars, a sledge: nearly
 *    useless on a blast door), a ram (a log or a truck bumper, from four men),
 *    a cutting torch (organized crews, later in the collapse: quiet but slow
 *    to start), and explosives (grenades tied together, a rocket). Explosives
 *    used on the door are gone for the fight.
 *  - Noise: a sledge and a ram carry from the first blow, a torch hisses
 *    (heard late), a charge is one bang at the end. The noise raises the
 *    alarm if the watch had not called the raid already.
 *  - Under fire the crew works slower: each tower with eyes on the door
 *    (`overwatch`) costs them time, and each sally port (a sortie from the
 *    flank) more. A door nobody can get through in `GIVE_UP` s sends them
 *    home. A stronger door tier, more eyes or a sortie always make the hold
 *    longer: a lot with strong defenses is never an easier raid.
 *  - A door that stands open (by day, with no warning) holds them only
 *    `DOOR_OPEN_DELAY` s (sim/terrainFx.ts).
 * Pure (tested).
 */
import type { PerimeterKind } from './perimeter';

export type DoorTier = 'steel' | 'blast';
export type DoorMethod = 'hand tools' | 'a ram' | 'a cutting torch' | 'a charge' | 'an open door';

export const DOOR = {
  /** Work (crew-seconds of a man with a sledge on a steel door) it takes to defeat a door of each tier. */
  RESIST: { steel: 40, blast: 120 } as Record<DoorTier, number>,
  /** Per man, hand tools: the work done a second (steel) and what a blast door leaves of it. */
  HAND: 0.5, HAND_BLAST: 0.1,
  /** A ram: from this many men, flat work a second (steel / blast). */
  RAM_MEN: 4, RAM: 2.4, RAM_BLAST: 0.55,
  /** A cutting torch: work a second (steel / blast), and the seconds to set it up. */
  TORCH: 2.2, TORCH_BLAST: 0.8, TORCH_SETUP: 10,
  /** Explosives: the work one grenade / one rocket does (steel / blast), and the seconds to place a charge. */
  GRENADE: { steel: 9, blast: 4 } as Record<DoorTier, number>, ROCKET: { steel: 26, blast: 12 } as Record<DoorTier, number>, PLACE: 5,
  /** Extra time (a share of the job) for each tower with eyes on the door and each sally port (a sortie from the flank). */
  OVERWATCH: 0.12, OVERWATCH_MAX: 4, SORTIE: 0.25, SORTIE_MAX: 2,
  /** A crew that cannot get through in this many seconds goes home. */
  GIVE_UP: 150,
  /** The fastest anyone is through a locked door (s). */
  MIN: 4,
  /** Seconds into the work the noise first carries, by method (a charge is heard when it goes). */
  NOISE_AT: { 'hand tools': 2, 'a ram': 1.5, 'a cutting torch': 14, 'a charge': -1, 'an open door': Infinity } as Record<DoorMethod, number>,
} as const;

/** The door's tier by what it is built into. */
export const doorTierOf = (kind: PerimeterKind | undefined, bore: boolean): DoorTier => (bore || kind === 'rock_tunnel') ? 'blast' : 'steel';

export interface DoorCrew {
  men: number;
  grenades: number;
  rockets: number;
  /** An organized crew (a gang, militia, patrol, requisition team). */
  organized: boolean;
  /** 0-1: how far into the collapse (armed, equipped crews come later). */
  late: number;
  /** 0-1: how far the crew has learned this place (Hardcore): better tools, and explosives kept for the door. */
  adapt: number;
}
export interface DoorDefense { tier: DoorTier; locked: boolean; overwatch: number; sallyPorts: number }

export interface DoorPlan {
  method: DoorMethod;
  /** Seconds until the way is open (the crew may give up first: see `gaveUp`). */
  secs: number;
  /** Seconds in when the noise reaches the defenders (Infinity: it does not). */
  noiseAt: number;
  /** Explosives used up on the door. */
  spent: { grenades: number; rockets: number };
  /** The crew gives up at `GIVE_UP` s instead of getting through. */
  gaveUp: boolean;
  tier: DoorTier;
}

/** Tools the crew has, rolled: [ram, torch]. */
function tools(c: DoorCrew, a: number, b: number): { ram: boolean; torch: boolean } {
  const ram = c.men >= DOOR.RAM_MEN && a < 0.3 + 0.3 * c.late + 0.3 * c.adapt;
  const torch = c.organized && c.late > 0.35 && b < 0.25 + 0.35 * c.adapt + 0.2 * c.late;
  return { ram, torch };
}

/**
 * Roll how a crew gets through a door. `r` is a 0-1 draw (the battle's own seeded stream), used a fixed number of times so a plan reads the
 * same however it comes out.
 */
export function planBreach(crew: DoorCrew, def: DoorDefense, r: () => number): DoorPlan {
  const u1 = r(), u2 = r(), u3 = r(), u4 = r(), u5 = r(), u6 = r();
  if (!def.locked) return { method: 'an open door', secs: 2, noiseAt: Infinity, spent: { grenades: 0, rockets: 0 }, gaveUp: false, tier: def.tier };
  const blast = def.tier === 'blast';
  let work = DOOR.RESIST[def.tier];
  const spent = { grenades: 0, rockets: 0 };
  // explosives first, if they mean to use them (most do; a rocket is saved for the towers unless the door is a blast door)
  const useCharges = u1 < 0.55 + 0.3 * crew.adapt + (blast ? 0.15 : 0);
  if (useCharges) {
    if (crew.rockets > 0 && (blast || u2 < 0.3)) { spent.rockets = 1; work -= DOOR.ROCKET[def.tier]; }
    while (work > 0 && spent.grenades < crew.grenades) { spent.grenades++; work -= DOOR.GRENADE[def.tier]; }
  }
  const charged = spent.grenades + spent.rockets > 0;
  const kit = tools(crew, u5, u6);
  let method: DoorMethod = 'hand tools';
  let rate = crew.men * (blast ? DOOR.HAND_BLAST : DOOR.HAND), setup = 0;
  if (kit.ram) { rate = Math.max(rate, blast ? DOOR.RAM_BLAST : DOOR.RAM) + crew.men * 0.1 * (blast ? 0.2 : 1); method = 'a ram'; }
  if (kit.torch) { const tr = blast ? DOOR.TORCH_BLAST : DOOR.TORCH; if (tr + crew.men * 0.05 > rate) { rate = tr + crew.men * 0.05; method = 'a cutting torch'; setup = DOOR.TORCH_SETUP; } }
  let secs: number;
  if (work <= 0) { secs = DOOR.PLACE + (spent.grenades + spent.rockets) * 1.5; method = 'a charge'; }
  else {
    secs = work / Math.max(0.05, rate) + setup;
    if (charged) secs += DOOR.PLACE;
  }
  // the jitter of a real job (0.75 to 1.35), then the defenders' share
  secs *= 0.75 + 0.6 * u3;
  secs *= 1 + DOOR.OVERWATCH * Math.min(DOOR.OVERWATCH_MAX, def.overwatch) + DOOR.SORTIE * Math.min(DOOR.SORTIE_MAX, def.sallyPorts);
  secs = Math.max(DOOR.MIN, secs);
  // a long job under fire in the dark: some jobs go quicker than they should, a job nobody can finish does not
  secs = Math.round(secs * (0.97 + 0.06 * u4) * 10) / 10;
  const gaveUp = secs > DOOR.GIVE_UP;
  const noiseAt = method === 'a charge' ? secs : charged ? Math.min(DOOR.PLACE, secs) : DOOR.NOISE_AT[method];
  return { method, secs: gaveUp ? DOOR.GIVE_UP : secs, noiseAt: Math.min(noiseAt, gaveUp ? DOOR.GIVE_UP : secs), spent, gaveUp, tier: def.tier };
}

/** Typical seconds a door holds: four men with hand tools, and a crew with a ram, towers in view and sally ports counted. */
export function holdSeconds(tier: DoorTier, overwatch = 0, sallyPorts = 0): { hand: number; ram: number } {
  const f = 1 + DOOR.OVERWATCH * Math.min(DOOR.OVERWATCH_MAX, overwatch) + DOOR.SORTIE * Math.min(DOOR.SORTIE_MAX, sallyPorts);
  const blast = tier === 'blast';
  return { hand: DOOR.RESIST[tier] / (4 * (blast ? DOOR.HAND_BLAST : DOOR.HAND)) * f, ram: DOOR.RESIST[tier] / (blast ? DOOR.RAM_BLAST : DOOR.RAM) * f };
}

/** The Defense tab's words for how long a door holds: typical times for a plain crew (hand tools), a ram crew and the worst case (a torch or charges). */
export function holdLine(tier: DoorTier, overwatch = 0, sallyPorts = 0): string {
  const f = 1 + DOOR.OVERWATCH * Math.min(DOOR.OVERWATCH_MAX, overwatch) + DOOR.SORTIE * Math.min(DOOR.SORTIE_MAX, sallyPorts);
  const blast = tier === 'blast';
  const hand = DOOR.RESIST[tier] / (4 * (blast ? DOOR.HAND_BLAST : DOOR.HAND)) * f;
  const ram = DOOR.RESIST[tier] / (blast ? DOOR.RAM_BLAST : DOOR.RAM) * f;
  const sec = (x: number) => x > DOOR.GIVE_UP ? 'longer than they will stay' : `${Math.round(x)} s`;
  return `${blast ? 'The blast door' : 'The steel door'} holds four men with hand tools about ${sec(hand)}, a crew with a ram about ${sec(ram)}; explosives and a torch cut that, and every tower that sees the door and every sally port makes it longer. The noise of the work wakes the camp.`;
}
