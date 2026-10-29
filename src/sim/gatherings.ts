/**
 * Gatherings (decided with the user: "also have parties and cookouts and
 * events to raise morale"). Pure.
 *
 *  Kinds      a cookout, a birthday, Thanksgiving, Christmas, the Fourth of
 *             July, a harvest festival, movie night (needs power), a campfire
 *             with stories, a wedding, a funeral, the neighbors over.
 *  When       called by the player (tonight at six, or now if it's later) or
 *             on their own: holidays, birthdays, the end of the harvest, a
 *             wedding the day after a couple forms, a funeral the day after
 *             a death, a campfire on a mild evening when spirits are low.
 *  Effects    a morale lift scaled by what's on the table (fresh food and
 *             meat lift more than canned and beans), that lingers a week or
 *             so; the cost in food and firewood (fuel for the movie); noise,
 *             light and smoke the county can see once others are hungry
 *             (opsec.ts `gatherings`). A funeral lets grief heal faster.
 */
import { calendarOf, dayIndex, hourOf, type GameState } from './state';
import { KCAL, FOODS, type FoodId } from './needs';
import { isFinished } from './construction';
import { seasons } from './regions';
import { log } from './economy';
import { mulberry32 } from './rng';
import { dailyOf } from './daily';
import { kinMorale } from './kin';
import { griefMorale, mourn, noteLosses, unmourned } from './grief';
import { bestHand, practice } from './skills';
import { faithOf } from './mind';
import { gatheringKitLift, noteShared, wearKits, type KitId } from './evenings';
import { regionFor } from './climate';

export type GatheringKind = 'cookout' | 'birthday' | 'thanksgiving' | 'christmas' | 'july4' | 'harvest' | 'movie' | 'campfire' | 'wedding' | 'funeral' | 'neighbors' | 'service';

export interface GatheringDef {
  name: string;
  /** Extra kcal a head. */
  kcal: number;
  /** Morale lift (immediate), before the food's quality. */
  lift: number;
  /** Noise / light / smoke (OPSEC points, fading over a few days). */
  noise: number;
  /** Firewood (ricks) for the fire / grill. */
  wood: number;
  /** Hours it runs. */
  hours: number;
  /** The player can call it from the panel. */
  callable: boolean;
}

export const GATHERING: Record<GatheringKind, GatheringDef> = {
  cookout: { name: 'Cookout', kcal: 1200, lift: 9, noise: 7, wood: 0.06, hours: 3.5, callable: true },
  birthday: { name: 'Birthday party', kcal: 600, lift: 6, noise: 3, wood: 0.02, hours: 2.5, callable: false },
  thanksgiving: { name: 'Thanksgiving dinner', kcal: 1800, lift: 12, noise: 4, wood: 0.05, hours: 4, callable: false },
  christmas: { name: 'Christmas', kcal: 1600, lift: 13, noise: 4, wood: 0.05, hours: 4, callable: false },
  july4: { name: 'Fourth of July', kcal: 1200, lift: 10, noise: 9, wood: 0.06, hours: 4, callable: false },
  harvest: { name: 'Harvest festival', kcal: 1500, lift: 12, noise: 6, wood: 0.08, hours: 4, callable: false },
  movie: { name: 'Movie night', kcal: 300, lift: 7, noise: 5, wood: 0, hours: 2.5, callable: true },
  campfire: { name: 'Campfire and stories', kcal: 200, lift: 6, noise: 3, wood: 0.05, hours: 3, callable: true },
  wedding: { name: 'Wedding', kcal: 1600, lift: 14, noise: 8, wood: 0.08, hours: 5, callable: false },
  funeral: { name: 'Funeral', kcal: 800, lift: 0, noise: 1, wood: 0.02, hours: 2.5, callable: true },
  neighbors: { name: 'The neighbors over', kcal: 1200, lift: 8, noise: 7, wood: 0.06, hours: 3.5, callable: true },
  service: { name: 'Service or meeting', kcal: 0, lift: 3, noise: 2, wood: 0.01, hours: 1.5, callable: true },
};

export interface Gathering { kind: GatheringKind; at: number; until: number; who?: string; guests?: string; applied?: boolean }

export interface Social {
  /** The gathering on tonight (or now). */
  active: Gathering | null;
  /** Last time each kind was held (game time). */
  last: Partial<Record<GatheringKind, number>>;
  /** Afterglow: morale target points, and when they were set (fades over ~a week). */
  glow: number;
  glowAt: number;
  /** OPSEC noise points and when (fades over a few days). */
  noise: number;
  noiseAt: number;
  /** Gatherings held (the report card). */
  held: number;
  /** Holidays, birthdays, weddings, funerals and the odd campfire happen on their own (off: only what the player calls). */
  auto?: boolean;
}

const socialOf = (s: GameState) => dailyOf(s).social;

/** Is there power for a movie (a lit home or the grid up)? */
export const powerOn = (s: GameState) => s.utilities.lit.length > 0 || (s.utilities.grid && s.disaster.tracks.grid > 0.5);

/** A guitar in the house (seeded per family: about two in three). Music lifts a gathering a little. */
export const hasGuitar = (s: GameState) => (Math.imul(s.seed + 7, 2654435761) >>> 0) % 3 !== 0;

/** Why a gathering can't be called now, or null. */
export function gatheringProblem(s: GameState, kind: GatheringKind): string | null {
  const so = socialOf(s);
  if (so.active && s.clock.t < so.active.until) return `the ${GATHERING[so.active.kind].name.toLowerCase()} is on`;
  if (kind === 'movie' && !powerOn(s)) return 'no power for a movie';
  if (kind === 'funeral' && !unmourned(s).length) return 'nobody to bury';
  if (kind === 'neighbors' && !friendlyNeighbor(s)) return 'no neighbors on good terms nearby';
  const last = so.last[kind];
  if (last != null && s.clock.t - last < 2) return 'you just had one';
  return null;
}

const friendlyNeighbor = (s: GameState) => s.neighbors.filter(n => n.status === 'home' && n.disposition > 10).sort((a, b) => b.disposition - a.disposition)[0] ?? null;

/** Plan one for this evening (18:00) or right now if it's past six. */
export function callGathering(s: GameState, kind: GatheringKind, who?: string): string | null {
  const why = gatheringProblem(s, kind);
  if (why) return why;
  const so = socialOf(s), h = hourOf(s.clock.t);
  const startH = h >= 17.5 || h < 3 ? h : 18;
  const at = s.clock.t + ((startH - h + 24) % 24) / 24;
  const g: Gathering = { kind, at, until: at + GATHERING[kind].hours / 24 };
  if (who) g.who = who;
  if (kind === 'funeral') g.who = who ?? unmourned(s)[0]?.id;
  if (kind === 'neighbors') g.guests = friendlyNeighbor(s)?.id;
  so.active = g;
  log(s, CALL_LINE[kind](s, g));
  // putting an evening together is practice in running things (sim/skills.ts)
  { const lead = bestHand(s, 'leadership'); if (lead) practice(s, lead.id, 'leadership', 1); }
  return null;
}

const nameOf = (s: GameState, id?: string) => s.people.find(p => p.id === id)?.first ?? 'them';
const CALL_LINE: Record<GatheringKind, (s: GameState, g: Gathering) => string> = {
  cookout: () => '"Fire up the grill. We\'re eating outside tonight."',
  birthday: (s, g) => `It's ${nameOf(s, g.who)}'s birthday. Somebody found enough sugar for a cake.`,
  thanksgiving: () => 'Thanksgiving. Everyone at the table tonight, and nobody on their phone.',
  christmas: () => 'Christmas. A tree in the corner and whatever we could make for each other.',
  july4: () => 'The Fourth of July. Burgers, if we have them, and the flag up on the pole.',
  harvest: () => 'The last of the harvest is in. Tonight we celebrate.',
  movie: () => '"Movie night! Somebody pick something we haven\'t seen fifty times."',
  campfire: () => '"Let\'s build a fire tonight and tell some stories."',
  wedding: (_s, g) => `${g.who ?? 'The couple'} are getting married this evening, out by the fire pit.`,
  funeral: (s, g) => `We'll bury ${nameOf(s, g.who)} this evening and say a few words.`,
  neighbors: (s, g) => `The ${s.neighbors.find(n => n.id === g.guests)?.name ?? 'neighbors'} are coming over for supper.`,
  service: () => 'Everybody in the front room at six: a reading, a hymn or two, and a few words about the week. Whatever each believes, it is an hour of sitting together.',
};

/** Take a gathering's food: fresh first, then frozen, canned and staples (the bought kind while the stores work). Returns the share eaten and how good it was. */
function serve(s: GameState, kcal: number): { covered: number; quality: number } {
  if (kcal <= 0) return { covered: 1, quality: 1 };
  if (s.disaster.tracks.stores > 0.5 && s.money > 0) { s.money -= Math.round(kcal / 1000 * 6); return { covered: 1, quality: 1.2 }; }
  let got = 0, good = 0;
  for (const f of FOODS as FoodId[]) {
    if (got >= kcal) break;
    const take = Math.min(s.stock[f], (kcal - got) / KCAL[f]);
    if (take <= 1e-6) continue;
    s.stock[f] -= take; got += take * KCAL[f];
    if (f === 'fresh' || f === 'frozen') good += take * KCAL[f];
  }
  const covered = Math.min(1, got / kcal);
  return { covered, quality: 0.7 + 0.6 * (got > 0 ? good / got : 0) };
}

/** Each sub-step: start / finish the gathering. Returns the people present (the engine gives them the `party` task). */
export function gatheringStep(s: GameState): Gathering | null {
  const so = socialOf(s), g = so.active;
  if (!g) return null;
  if (s.clock.t >= g.until) { so.active = null; return null; }
  if (s.clock.t < g.at) return null;
  if (!g.applied) { g.applied = true; for (const line of holdGathering(s, g)) log(s, line); }
  return g;
}

/** Hold it: food, firewood, the lift, the noise. */
export function holdGathering(s: GameState, g: Gathering): string[] {
  const so = socialOf(s), def = GATHERING[g.kind], out: string[] = [];
  const here = s.personState.filter(ps => ps.needs.died == null && ps.task !== 'away' && ps.task !== 'town');
  const guests = g.kind === 'neighbors' ? Math.min(6, s.neighbors.find(n => n.id === g.guests)?.members ?? 3) : 0;
  const { covered, quality } = serve(s, def.kcal * (here.length + guests));
  s.stock.firewood = Math.max(0, s.stock.firewood - def.wood);
  if (g.kind === 'movie' && s.utilities.report.genKwh > 0.1) s.stock.fuel = Math.max(0, s.stock.fuel - 0.15);
  const music = hasGuitar(s) && g.kind !== 'funeral' && g.kind !== 'movie';
  // the goods on hand (sim/evenings.ts): cards, music, something to read aloud, the little ones' toys; they wear with the evening
  const kit = gatheringKitLift(s, g.kind);
  const lift = (def.lift + (music ? 2 : 0) + kit.lift) * quality * (0.4 + 0.6 * covered);
  for (const ps of here) {
    const p = s.people.find(x => x.id === ps.id);
    // a service lifts people of faith a lot and the rest a little
    const faith = g.kind === 'service' && p ? (faithOf(s, p) ? 4 : -1.5) : 0;
    ps.needs.morale = Math.min(100, ps.needs.morale + lift + faith);
  }
  if (kit.used.length) {
    const users: Partial<Record<KitId, number>> = {};
    for (const k of kit.used) users[k] = here.length;
    out.push(...wearKits(s, users));
    noteShared(s, kit.lift);
  }
  // the afterglow (the morale target, fading over about a week)
  so.glow = Math.min(10, glowNow(s) + lift * 0.6); so.glowAt = s.clock.t;
  // the noise, light and smoke: it matters once others are hungry
  const hungry = s.disaster.tracks.stores < 0.5;
  so.noise = noiseNow(s) + def.noise * (hungry ? 1 : 0.25) * (music ? 1.2 : 1); so.noiseAt = s.clock.t;
  so.last[g.kind] = s.clock.t; so.held++;
  if (g.kind === 'funeral') mourn(s, g.who);
  if (g.kind === 'neighbors') { const n = s.neighbors.find(x => x.id === g.guests); if (n) n.disposition = Math.min(100, n.disposition + 8); }
  if (covered < 0.5) out.push('There wasn\'t much to go round, but we were together.');
  else if (quality >= 1.1) out.push(RICH_LINE[g.kind]);
  if (music && g.kind !== 'birthday' && g.kind !== 'service') out.push('Somebody got the guitar out and we sang until the fire burned down.');
  else if (kit.used.length >= 2) out.push(kit.used.includes('games') ? 'The cards came out after supper, and somebody put the music on. Nobody went to bed early.' : 'The evening ran long over the music.');
  if (hungry && def.noise >= 6) out.push('"Keep it down. Sound carries a long way out here now, and so does the smell of meat."');
  return out;
}

const RICH_LINE: Record<GatheringKind, string> = {
  cookout: 'Burgers off the grill and corn from the garden. Best night in weeks.',
  birthday: 'Cake, candles, a song slightly off key. The kids talked about it for days.',
  thanksgiving: 'A real Thanksgiving: the table full and everyone saying what they\'re grateful for.',
  christmas: 'A good Christmas. Something under the tree for everyone.',
  july4: 'Hot dogs and a fire in the pit. We even had a few sparklers.',
  harvest: 'The harvest supper: new potatoes, roast, pie. We earned it.',
  movie: 'Popcorn and a movie on the wall. For two hours it felt like before.',
  campfire: 'Stories round the fire until the kids fell asleep on our laps.',
  wedding: 'A wedding under the string lights. There wasn\'t a dry eye.',
  funeral: 'We said what needed saying, and then we ate together.',
  neighbors: 'The neighbors came over. It was good to hear other voices at the table.',
  service: 'We sang badly and meant it. Nobody wanted to be the first to get up.',
};

/** The afterglow now (morale target points). */
export function glowNow(s: GameState): number {
  const so = s.daily?.social;
  return so ? so.glow * Math.exp(-Math.max(0, s.clock.t - so.glowAt) / 5) : 0;
}

/** OPSEC points from recent gatherings (fades over ~3 days). */
export function noiseNow(s: GameState): number {
  const so = s.daily?.social;
  return so ? so.noise * Math.exp(-Math.max(0, s.clock.t - so.noiseAt) / 3) : 0;
}

/** Morale target terms from gatherings and grief (needs.ts). */
export const socialMorale = (s: GameState) => glowNow(s) + griefMorale(s) + kinMorale(s);

/** Once a day: deaths noted, and the gatherings that happen on their own. Returns log lines. */
export function gatheringsDay(s: GameState): string[] {
  const so = socialOf(s), out: string[] = [];
  const { doy } = calendarOf(s.clock), day = dayIndex(s.clock.t);
  noteLosses(s);
  if (so.active || so.auto === false) return out;
  const since = (k: GatheringKind) => s.clock.t - (so.last[k] ?? -1e9);
  const auto = (k: GatheringKind, who?: string) => { callGathering(s, k, who); };
  // a funeral the day after (one at a time)
  const toBury = unmourned(s).find(g => s.clock.t - g.at >= 0.5);
  if (toBury) { auto('funeral', toBury.id); return out; }
  // holidays (Thanksgiving: the fourth Thursday of November ≈ day 327)
  if (doy === 327 && since('thanksgiving') > 300) { auto('thanksgiving'); return out; }
  if (doy === 359 && since('christmas') > 300) { auto('christmas'); return out; }
  if (doy === 185 && since('july4') > 300) { auto('july4'); return out; }
  // a wedding the day after a couple forms
  const wed = s.lineage.chronicle.filter(e => e.kind === 'partner' && s.clock.t - e.t <= 1.5).pop();
  if (wed && since('wedding') > 30) {
    const m = /^(\S+) (?:and (\S+) are|married (\S+))/.exec(wed.text);
    auto('wedding', m ? `${m[1]} and ${m[2] ?? m[3]}` : undefined);
    return out;
  }
  // birthdays (kin; one party a day)
  const bd = s.people.find((p, i) => p.bday === doy && p.age >= 1 && s.personState[i]?.needs.died == null && (p.kin || p.kid));
  if (bd && since('birthday') > 0.8) { auto('birthday', bd.id); return out; }
  // the harvest is in (the day after the field harvest ends)
  const H = seasons(regionFor(s.site)).harvest;
  if (doy === H[1] && s.structures.some(st => st.kind === 'field' && isFinished(st)) && since('harvest') > 300) { auto('harvest'); return out; }
  // a campfire on a mild evening when spirits are low
  const alive = s.personState.filter(ps => ps.needs.died == null);
  const mood = alive.reduce((a, ps) => a + ps.needs.morale, 0) / Math.max(1, alive.length);
  const r = mulberry32(s.seed * 4099 + day * 7)();
  if (mood < 50 && doy > 120 && doy < 290 && since('campfire') > 10 && r < 0.3) auto('campfire');
  return out;
}
