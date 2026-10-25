/**
 * Wild food (decided with the user: hunting and fishing by habitat; the
 * landscape can be poisoned; seasons and licenses too). Pure.
 *
 *  Habitat     the region's game (regions.ts): elk and deer in the timber,
 *              antelope on open ground, moose in the north woods, javelina in
 *              the desert; trout or bass or catfish in the creek; rabbits and
 *              grouse everywhere. Timber on the place makes big game likelier.
 *  Peacetime   in season and with a tag: deer and elk in the fall, a fishing
 *              license for the year, small game. Meat goes in the freezer.
 *              Without a tag it's poaching: a game warden fine if caught.
 *  After       no seasons, no wardens, everyone hunting: the game thins out
 *              fast and comes back slowly. An ash winter kills half of it; a
 *              drought kills the fish; fallout makes game and fish hot for months.
 *  Gear        a rifle and rounds for big game (armory.ts), fishing gear for
 *              the creek, snares for rabbits; a smoker turns meat into jerky
 *              that keeps without a freezer.
 */
import { log } from './economy';
import { calendarOf, type GameState } from './state';
import { REGIONS, type Game } from './regions';
import { huntingRifle, smallGameGun } from './armory';
import { mulberry32 } from './rng';
import { addFoodKcal } from './pantry';

export type GameClass = 'big' | 'small' | 'fish';
const BIG: Game[] = ['elk', 'deer', 'moose', 'antelope', 'javelina', 'turkey'];
const FISH: Game[] = ['trout', 'bass', 'catfish', 'salmon', 'panfish'];
/** Meat a kill gives (fresh baskets of ~2,000 kcal). */
const MEAT: Partial<Record<Game, number>> = { elk: 60, moose: 90, deer: 20, antelope: 14, javelina: 8, turkey: 3 };

export const TAG_USD = { deer: 40, elk: 60, fishing: 35, small: 25 } as const;
export type License = keyof typeof TAG_USD;
export const POACH_FINE = 1500;

export interface Wild {
  /** How much game is left (1 = as it was). */
  abundance: Record<GameClass, number>;
  /** Licenses bought, by year. */
  licenses: Partial<Record<License, number>>;
  /** Hunt without a tag in peacetime (and risk the warden). */
  poach: boolean;
  /** Fallout in the wild meat and fish: until this day. */
  hotUntil: number;
  /** One-time blows applied (ash, drought). */
  done: string[];
}
export const newWild = (): Wild => ({ abundance: { big: 1, small: 1, fish: 1 }, licenses: {}, poach: false, hotUntil: -1, done: [] });

/** What's in season (peacetime): deer and elk in the fall, small game fall and winter, fishing late spring to fall. */
export function inSeason(s: GameState, what: License): boolean {
  const doy = calendarOf(s.clock).doy;
  if (what === 'deer') return doy >= 280 && doy <= 330;
  if (what === 'elk') return doy >= 250 && doy <= 300;
  if (what === 'small') return doy >= 245 || doy <= 60;
  return doy >= 130 && doy <= 300;
}
export const hasLicense = (s: GameState, what: License) => s.wild.licenses[what] === calendarOf(s.clock).year;
export const lawful = (s: GameState) => s.disaster.tracks.law >= 0.5;

export function buyLicense(s: GameState, what: License): string | null {
  if (!lawful(s)) return 'nobody is selling licenses now';
  if (hasLicense(s, what)) return 'already have it this year';
  if (what === 'elk' && !REGIONS[s.site.region].game.includes('elk')) return 'no elk here';
  if (s.money < TAG_USD[what]) return 'not enough money';
  s.money -= TAG_USD[what];
  s.wild.licenses[what] = calendarOf(s.clock).year;
  log(s, `Bought a ${what === 'fishing' ? 'fishing license' : what === 'small' ? 'small-game license' : `${what} tag`} for the year ($${TAG_USD[what]}).`);
  return null;
}

/** The region's game of a class, as it lives on this place. */
function local(s: GameState, cls: GameClass): Game[] {
  const g = REGIONS[s.site.region].game;
  if (cls === 'big') return g.filter(x => BIG.includes(x) && x !== 'turkey');
  if (cls === 'fish') return g.filter(x => FISH.includes(x));
  return g.filter(x => x === 'rabbit' || x === 'grouse' || x === 'turkey');
}

/** Once a day (from the eating step): hunting, fishing, snares; the game thinning out; one-time blows. Returns kcal of meat brought in. */
export function wildDay(s: GameState, freezer: boolean): number {
  const w = s.wild, d = s.disaster, day = Math.floor(s.clock.t + 0.25);
  const r = mulberry32(s.seed * 2357 + day * 19 + 5);
  const after = !!d.kind && s.clock.t >= d.hitAt;
  const hunter = Math.max(0, ...s.people.filter((p, i) => !p.kid && s.personState[i]?.needs.died == null).map(p => p.skills.hunter));
  // the world's blows to the wild
  if (after && d.kind === 'ash_winter' && !w.done.includes('ash')) { w.done.push('ash'); w.abundance.big *= 0.5; w.abundance.small *= 0.5; w.abundance.fish *= 0.6; }
  if (after && d.kind === 'drought' && !w.done.includes('drought')) { w.done.push('drought'); w.abundance.fish *= 0.2; }
  if (after && d.kind === 'nuclear' && !w.done.includes('fallout')) { w.done.push('fallout'); w.hotUntil = day + 150; }
  // everyone's out hunting once the stores are gone: the game thins, then slowly comes back
  for (const c of ['big', 'small', 'fish'] as GameClass[]) {
    if (after && d.tracks.stores < 0.5) w.abundance[c] = Math.max(0.05, w.abundance[c] - (c === 'big' ? 0.0012 : 0.0006));
    w.abundance[c] = Math.min(1, w.abundance[c] + (c === 'small' ? 0.0008 : 0.0003));
  }
  let meat = 0;
  const bring = (baskets: number, what: string, cls: GameClass) => {
    meat += baskets * 2000;
    // a freezer, a smoker (jerky keeps like staples), or eat it fresh
    if (freezer) addFoodKcal(s, 'game_meat', baskets * 2000);
    else if (s.stock.smoker >= 1 && baskets > 4) { addFoodKcal(s, 'smoked_meat', baskets * 2000 * 0.8); meat -= baskets * 2000 * 0.2; }
    else s.stock.fresh += baskets;
    w.abundance[cls] = Math.max(0.05, w.abundance[cls] - (cls === 'big' ? 0.02 : 0.004));
    if (day <= w.hotUntil) for (const ps of s.personState) if (ps.needs.died == null) ps.needs.dose += 0.004 * baskets / 4;
    if (baskets >= 8) log(s, `${what} down: meat for weeks${s.stock.smoker >= 1 && !freezer ? ' (smoked into jerky)' : ''}.${day <= w.hotUntil ? ' It reads hot on the counter.' : ''}`);
  };
  const warden = () => { if (lawful(s) && r() < 0.15) { s.money -= POACH_FINE; log(s, `The game warden caught it: a $${POACH_FINE.toLocaleString('en-US')} fine and the meat taken.`); return true; } return false; };
  // big game: a hunter, a rifle, and (in peacetime) the season and a tag
  const timber = Math.min(1.4, 0.6 + s.site.timber * 0.5);
  const bigs = local(s, 'big');
  if (hunter >= 2 && bigs.length) {
    const elk = bigs.includes('elk') && (after || (inSeason(s, 'elk') && hasLicense(s, 'elk')));
    const deerOk = after || (inSeason(s, 'deer') && (hasLicense(s, 'deer') || w.poach)) || (inSeason(s, 'elk') && bigs.includes('elk') && w.poach);
    const winter = calendarOf(s.clock).doy < 60 || calendarOf(s.clock).doy > 340;
    if ((elk || deerOk) && r() < 0.03 * hunter / 5 * w.abundance.big * timber * (winter ? 0.5 : 1) && huntingRifle(s, true)) {
      const kind: Game = elk && r() < 0.4 ? 'elk' : bigs.find(x => x !== 'elk') ?? bigs[0];
      const poached = !after && !(kind === 'elk' ? hasLicense(s, 'elk') : hasLicense(s, 'deer'));
      if (!(poached && warden())) bring(MEAT[kind] ?? 15, kind[0].toUpperCase() + kind.slice(1), 'big');
    }
  }
  // small game: snares, or a .22 / shotgun
  const smallOk = after || (inSeason(s, 'small') && hasLicense(s, 'small'));
  if (smallOk && (s.stock.snares >= 1 || (hunter >= 1 && smallGameGun(s))) && r() < 0.06 * w.abundance.small) {
    if (s.stock.snares < 1) s.armory.ammo['22lr'] = Math.max(0, (s.armory.ammo['22lr'] ?? 0) - 3);
    bring(1, 'A rabbit', 'small');
  }
  // fishing: the creek (yours, or the neighbor's down the road), gear, and a license in peacetime
  const fishOk = after || hasLicense(s, 'fishing') && inSeason(s, 'fishing');
  if (fishOk && s.stock.fishing_gear >= 1 && local(s, 'fish').length && r() < (s.site.creek ? 0.15 : 0.06) * w.abundance.fish) bring(0.6, 'Fish', 'fish');
  return meat;
}
