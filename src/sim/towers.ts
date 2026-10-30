/**
 * Watch towers, as an upgrade chain (docs/DECISIONS.md; the user: "upgrade
 * paths like other games, e.g. small hill, nest on a hill, wooden
 * watchtower, concrete/steel watchtower, with floodlights and mounted
 * weapons"). Six tiers, each a structure of its own:
 *
 *   1 rise + lookout        a raised mound with a sniper's nest on it: cheap, small view
 *   2 wooden watchtower     a timber tower with a roofed cab
 *   3 concrete & steel      a poured shaft, a steel cab with firing slits
 *   4 with floodlights      the same tower with a light mast (needs power at night)
 *   5 manned mount          a heavy gun on a ring: needs a person on the tower and ammo
 *   6 automated turret      a powered, camera-aimed gun that fires with nobody on it
 *
 * Upgrading is in place, like the walls (sim/perimeter.ts upgradeRun): the new
 * tier is staked out BESIDE the old one, paid for in full, and the old tier
 * keeps working until the new one is finished; then it comes down and half
 * its materials come back (construction.ts completeUpgrade). Pure (tested).
 *
 * What a tier does: a better fighting post in battle (higher, more cover, a
 * longer reach), more warning (the posture's `detection`), and from tier 4
 * the lights; tiers 5 and 6 add firepower that needs people, power and ammo.
 */
import { isFinished, planStructure } from './construction';
import { applyForPermit } from './paperwork';
import { BLUEPRINTS, totalBill } from './blueprints';
import { log } from './economy';
import { powered } from './gear';
import { currentThreat, floodlightArmed, floodlightLit, type ThreatKind } from './lights';
import type { Caliber } from './armory';
import type { Stock } from './materials';
import { walkwayWatch } from './walkway';
import type { GameState, Structure } from './state';

export type TowerKind = 'rise_lookout' | 'watchtower_wood' | 'watchtower_concrete' | 'watchtower_flood' | 'watchtower_mount' | 'watchtower_turret' | 'watchtower_octagon' | 'watchtower_hex' | 'tower_pod';

export interface TowerDef {
  kind: TowerKind;
  tier: 1 | 2 | 3 | 4 | 5 | 6;
  name: string;
  blurb: string;
  /** Footprint, in 3 m build cells (square). */
  cells: number;
  /** The fighting post on top: height (world units), the share of hits that land, how much fighters prefer it, accuracy and reach factors. */
  post: { y: number; cover: number; value: number; acc: number; reach: number };
  /** Warning it adds to "seen coming" (0–100 points) and how much farther out the watch sees (world units). */
  view: number;
  viewR: number;
  /** Floodlights on a mast: light the approach at night, with power. */
  flood?: boolean;
  /** A heavy gun on a ring: a person on the tower and ammunition from the armory. */
  mount?: boolean;
  /** An autonomous gun: power, cameras and a lot of ammunition; can jam. */
  turret?: boolean;
}

export const TOWERS: Record<TowerKind, TowerDef> = {
  rise_lookout: { kind: 'rise_lookout', tier: 1, name: 'Rise & lookout', cells: 2, blurb: 'A mound of earth with a sandbagged nest and a plank roof on top: one rifle and a pair of eyes a few meters above the grass. Cheap, and a small view bonus.', post: { y: 0.38, cover: 0.34, value: 3.5, acc: 1.08, reach: 1.05 }, view: 5, viewR: 2.5 },
  watchtower_wood: { kind: 'watchtower_wood', tier: 2, name: 'Wooden watchtower', cells: 1, blurb: 'A 6 m timber tower with a roofed cab, a ladder and a trapdoor. Sees over the wall and the first hedgerow.', post: { y: 1.03, cover: 0.28, value: 4, acc: 1.15, reach: 1.1 }, view: 10, viewR: 5 },
  watchtower_concrete: { kind: 'watchtower_concrete', tier: 3, name: 'Concrete & steel tower', cells: 1, blurb: 'A poured shaft with a steel cab, firing slits and a hatch door. Bullets and fire barely touch it, and you see farther from it.', post: { y: 1.22, cover: 0.18, value: 4.2, acc: 1.2, reach: 1.2 }, view: 14, viewR: 7 },
  watchtower_flood: { kind: 'watchtower_flood', tier: 4, name: 'Tower with floodlights', cells: 1, blurb: 'The concrete tower with a light mast: the whole approach lit white at night when there is power. Without power it is only a tower.', post: { y: 1.27, cover: 0.17, value: 4.4, acc: 1.2, reach: 1.2 }, view: 14, viewR: 7, flood: true },
  watchtower_mount: { kind: 'watchtower_mount', tier: 5, name: 'Tower with a mounted gun', cells: 1, blurb: 'A taller armored cab with a ring-mounted machine gun and an ammunition locker. Needs a person up there and belts from the armory; big firepower and range.', post: { y: 1.32, cover: 0.15, value: 4.6, acc: 1.2, reach: 1.25 }, view: 16, viewR: 8, flood: true, mount: true },
  watchtower_turret: { kind: 'watchtower_turret', tier: 6, name: 'Tower with an automated turret', cells: 1, blurb: 'The armored tower with a remote turret on the roof, aimed from cameras: it fires with nobody on it. Needs power, cameras and a great deal of ammunition, and a turret can jam.', post: { y: 1.37, cover: 0.14, value: 4.8, acc: 1.2, reach: 1.25 }, view: 20, viewR: 9, flood: true, mount: true, turret: true },
  // a stand-alone, not part of the chain: a glazed pod on a slender steel mast. The best view of any tower for its price, the worst cover, and it shows for kilometers
  tower_pod: { kind: 'tower_pod', tier: 3, name: 'Tower pod', cells: 1, blurb: 'A glazed observation pod, 3 m across, on a 10 m steel mast with a spiral stair: the best view of any tower for the price (a long way out, day and night with the floodlit sweep), the worst cover (glass and thin plate), and a landmark for anyone on the road. Two can sleep in it.', post: { y: 1.65, cover: 0.12, value: 4.4, acc: 1.25, reach: 1.3 }, view: 20, viewR: 9 },
  // plan variants: the same tier as the square tower they stand beside, with the corners knocked off (an eight- or six-sided shaft: no dead ground at the corners, a little better cover)
  watchtower_octagon: { kind: 'watchtower_octagon', tier: 2, name: 'Octagonal timber tower', cells: 1, blurb: 'An eight-sided tower on a stone course: timber walls, a roofed cab all round with no dead corners, a ladder and a trapdoor. A wooden tower with a better field of fire and cover.', post: { y: 1.03, cover: 0.25, value: 4.1, acc: 1.17, reach: 1.1 }, view: 11, viewR: 5.5 },
  watchtower_hex: { kind: 'watchtower_hex', tier: 3, name: 'Hexagonal concrete tower', cells: 1, blurb: 'A six-sided poured shaft with a steel cab: every face takes a glancing blow, and it sees all round. A concrete tower with a little better cover.', post: { y: 1.22, cover: 0.16, value: 4.3, acc: 1.2, reach: 1.2 }, view: 14, viewR: 7 },
};

/** The chain, lowest tier first. */
export const TOWER_CHAIN: readonly TowerKind[] = ['rise_lookout', 'watchtower_wood', 'watchtower_concrete', 'watchtower_flood', 'watchtower_mount', 'watchtower_turret'];

/** The next tier up (upgraded in place: `upgradeTower`). */
export const TOWER_NEXT: Partial<Record<string, TowerKind>> = { ...Object.fromEntries(TOWER_CHAIN.slice(0, -1).map((k, i) => [k, TOWER_CHAIN[i + 1]])), watchtower_octagon: 'watchtower_concrete', watchtower_hex: 'watchtower_flood' };

export const isTower = (kind: string): kind is TowerKind => kind in TOWERS;

/** The old water tower's lookout deck is still a post (the plain timber one). */
export const WATER_TOWER_POST = TOWERS.watchtower_wood.post;

/** What a mounted gun and a turret shoot: the most plentiful of these calibers. */
export const HEAVY_CALIBERS: readonly Caliber[] = ['308', '762x39', '556'];
/** Rounds needed on hand before a gun on a ring is worth manning, and before a turret is armed. */
export const MOUNT_ROUNDS = 60, TURRET_ROUNDS = 200;
/** A turret's chance of jamming on any burst. */
export const TURRET_JAM = 0.012;

// ── high ground ──
/** The ground height at (x, z), set by the world when it has a terrain (tests set their own). */
let groundProbe: ((x: number, z: number) => number) | null = null;
export const setGroundProbe = (f: ((x: number, z: number) => number) | null): void => { groundProbe = f; };
/** A rise this high above the land round it (≈ 3 m) gives the whole bonus; more adds nothing. */
export const HIGH_FULL = 0.5;
/** How much each tier leans on the ground: the low rise gains most from a natural hill, a tall tower least. */
const HIGH_WEIGHT: Record<TowerKind, number> = { rise_lookout: 2, watchtower_wood: 1, watchtower_concrete: 0.6, watchtower_flood: 0.6, watchtower_mount: 0.6, watchtower_turret: 0.6, watchtower_octagon: 1, watchtower_hex: 0.6, tower_pod: 0.5 };

/** How far (x, z) stands above the mean of a ring of ground 24 m out (world units, never negative). */
export function highGroundAt(x: number, z: number): number {
  if (!groundProbe) return 0;
  let ring = 0;
  for (let i = 0; i < 8; i++) ring += groundProbe(x + Math.cos(i * Math.PI / 4) * 4, z + Math.sin(i * Math.PI / 4) * 4);
  return Math.max(0, groundProbe(x, z) - ring / 8);
}
/** Record the high ground under a freshly staked tower. */
export function stampHighGround(st: Structure): void {
  if (isTower(st.kind)) st.high = Math.round(highGroundAt(st.x, st.z) * 100) / 100;
}
/** 0–1: how much of the full bonus a tower's ground gives. */
export const highShare = (st: Structure): number => Math.min(1, (st.high ?? 0) / HIGH_FULL);
/** What the ground adds to a tower: warning points, how far out the watch sees (units), and a reach factor. Modest and capped. */
export function highBonus(st: Structure, kind: TowerKind): { view: number; viewR: number; reach: number } {
  const k = highShare(st) * HIGH_WEIGHT[kind];
  return { view: Math.min(10, 5 * k), viewR: Math.min(5, 2.5 * k), reach: Math.min(0.2, 0.08 * k) };
}

/** A finished tower of the chain. */
export function towersBuilt(s: GameState): Array<{ st: Structure; def: TowerDef }> {
  return s.structures.filter(st => isTower(st.kind) && isFinished(st)).map(st => ({ st, def: TOWERS[st.kind as TowerKind] }));
}

/** Every post on top of a tower, the old water tower's deck included (battle.ts). */
export function towerPosts(s: GameState): Array<{ st: Structure; post: TowerDef['post']; def: TowerDef | null }> {
  const out = towersBuilt(s).map(({ st, def }) => ({ st, post: def.post, def: def as TowerDef | null }));
  for (const st of s.structures) if (st.kind === 'water_tower' && isFinished(st)) out.push({ st, post: WATER_TOWER_POST, def: null });
  return out;
}

/** The caliber with the most rounds on hand (at least `need`), or null. */
export function heavyCaliber(s: GameState, need: number): Caliber | null {
  let best: Caliber | null = null;
  for (const c of HEAVY_CALIBERS) if ((s.armory.ammo[c] ?? 0) >= need && (best === null || (s.armory.ammo[c] ?? 0) > (s.armory.ammo[best] ?? 0))) best = c;
  return best;
}

/** Adults (and big teens) who could be sent up a tower: not dead, not away. */
function crewAvailable(s: GameState): number {
  return s.people.filter((p, i) => s.personState[i]?.needs.died == null && s.personState[i]?.task !== 'gone' && s.personState[i]?.task !== 'away' && s.personState[i]?.task !== 'town' && (!p.kid || p.age >= 15)).length;
}

/** The manned mount is in use: a finished mount tower, a person to put on it, and the ammunition. */
export function mountReady(s: GameState): { st: Structure; cal: Caliber } | null {
  const t = towersBuilt(s).filter(x => x.def.mount);
  if (!t.length || crewAvailable(s) < 1) return null;
  const cal = heavyCaliber(s, MOUNT_ROUNDS);
  return cal ? { st: t[0].st, cal } : null;
}

/** A turret is armed: a finished turret tower, power, and plenty of ammunition. Nobody needs to be on it. */
export function turretsReady(s: GameState): Array<{ st: Structure; cal: Caliber }> {
  if (!powered(s)) return [];
  const cal = heavyCaliber(s, TURRET_ROUNDS);
  if (!cal) return [];
  return towersBuilt(s).filter(x => x.def.turret).map(x => ({ st: x.st, cal }));
}

/** Floodlights on a tower, with power to run them (by night; by day they are only lamps). */
export function floodReady(s: GameState): boolean {
  return towersBuilt(s).some(x => x.def.flood && floodlightArmed(s, x.st.id));
}

/** Towers with a light mast (the lights' ids are their structure ids). */
export const floodTowerIds = (s: GameState): string[] => towersBuilt(s).filter(x => x.def.flood).map(x => x.st.id);
/** Towers whose floodlights are lit now (power, blackout, mode; `threat`: a raid is on). */
export const litTowerIds = (s: GameState, threat: ThreatKind | boolean | null = currentThreat(s)): string[] => floodTowerIds(s).filter(id => floodlightLit(s, id, threat));

/**
 * What the towers add to the gate's posture: warning (the best tower's view
 * plus a little per extra one; floodlights add more with power), how far they
 * can be seen from the road, and a firepower factor (a manned mount with
 * ammo, a turret that is armed).
 */
export function towerPosture(s: GameState): { detection: number; visibility: number; fire: number } {
  const t = towersBuilt(s);
  const posts = towerPosts(s);
  // the patrol deck on the wall (sim/walkway.ts): a long, low post; a guard on it adds all of its view
  const deck = walkwayWatch(s);
  if (!posts.length && deck.view <= 0) return { detection: 0, visibility: 0, fire: 1 };
  const views = [...posts.map(p => (p.def?.view ?? TOWERS.watchtower_wood.view) + (p.def ? highBonus(p.st, p.def.kind).view : 0)), ...(deck.view > 0 ? [deck.view] : [])].sort((a, b) => b - a);
  let detection = views[0] + 2 * Math.min(3, views.length - 1);
  if (floodReady(s)) detection += 6;
  if (turretsReady(s).length) detection += 4;
  const best = t.reduce((a, x) => Math.max(a, x.def.tier), 0);
  const fire = 1 + 0.02 * best + (mountReady(s) ? 0.22 : 0) + (turretsReady(s).length ? 0.18 : 0);
  return { detection: Math.min(30, detection), visibility: t.length ? 4 + (litTowerIds(s, false).length ? 6 : 0) : 0, fire };
}

/** How much farther out the watch sees a crew coming (world units), from the best tower. */
export function towerReach(s: GameState, night: boolean, lit: boolean): number {
  let r = 0;
  const deck = walkwayWatch(s);
  if (deck.viewR > 0) r = night ? deck.viewR * 0.5 : deck.viewR;
  for (const p of towerPosts(s)) {
    const base = (p.def?.viewR ?? TOWERS.watchtower_wood.viewR) + (p.def ? highBonus(p.st, p.def.kind).viewR : 0);
    // in the dark an unlit tower sees about half as far
    r = Math.max(r, night && !(lit && p.def?.flood) ? base * 0.5 : base);
  }
  return r;
}

// ── upgrading in place ──

/** The bill for a tier (every stage's materials). */
export const towerBill = (kind: TowerKind): Partial<Stock> => totalBill(BLUEPRINTS[kind]);

/** Why a tower can't be upgraded (null = it can). */
export function towerUpgradeProblem(s: GameState, st: Structure): string | null {
  if (!isTower(st.kind)) return 'not a tower';
  if (!isFinished(st)) return 'not finished yet';
  if (!TOWER_NEXT[st.kind]) return 'nothing better to upgrade to';
  if (s.structures.some(x => x.replaces === st.id && !isFinished(x))) return 'an upgrade is already under way';
  return null;
}

/** Spots beside a tower, nearest first: the new tier rises next to the old one. */
export function upgradeSpots(from: Structure, next: TowerKind): Array<[number, number]> {
  const gap = (TOWERS[from.kind as TowerKind].cells + TOWERS[next].cells) / 2 * 0.5 + 0.1;
  return [[gap, 0], [-gap, 0], [0, gap], [0, -gap], [gap, gap * 0.7], [-gap, gap * 0.7]].map(([dx, dz]) => [from.x + dx, from.z + dz] as [number, number]);
}

/** Half the footprint of a structure, in world units (a tower knows; anything else is guessed generously). */
const halfOf = (kind: string) => (isTower(kind) ? TOWERS[kind].cells * 0.25 : 0.75);

/** Upgrade a finished tower in place: stake out the next tier beside it (the old one stands until it is done). */
export function upgradeTower(s: GameState, id: string): string | null {
  const old = s.structures.find(x => x.id === id);
  if (!old) return 'no such tower';
  const why = towerUpgradeProblem(s, old);
  if (why) return why;
  const next = TOWER_NEXT[old.kind]!;
  const clear = (x: number, z: number) => s.structures.every(o => o.id === old.id || o.unplaced
    || Math.abs(o.x - x) >= halfOf(next) + halfOf(o.kind) + 0.05 || Math.abs(o.z - z) >= halfOf(next) + halfOf(o.kind) + 0.05);
  const spots = upgradeSpots(old, next);
  const [x, z] = spots.find(([sx, sz]) => clear(sx, sz)) ?? spots[0];
  const st = planStructure(s, next, x, z, old.rot);
  st.replaces = old.id;
  stampHighGround(st);
  applyForPermit(s, st);
  log(s, `Upgrading the ${TOWERS[old.kind as TowerKind].name.toLowerCase()} to a ${TOWERS[next].name.toLowerCase()}, rising beside it. The old one stands until the new one is up.`);
  return null;
}
