/**
 * Hiding in the bunker costs something, and it can be found (docs/DECISIONS.md "Bunker hiding", GDS §6 "Hiding"). Pure and seeded; sim/encounters.ts `resolve` calls it.
 *
 * Hiding used to be nearly free: one roll for "they find the place lived in", then the family came up with nothing spent. Now:
 *
 *  1 The cost. Every person hidden eats and drinks from the stored stock for every day below: their daily need in food (sim/needs.ts: adult 2,400 kcal, child
 *    1,700, baby 1,000) and 10 liters of water (sim/water.ts WATER_L_PER_DAY, the unit the board's "water days" use). Nothing is grown, hauled or cooked down
 *    there. If the stored food or water runs out before the crew leaves, the family has to come up into them. Nothing stored: no hiding (`viable`).
 *    The days are charged on top of the normal day's meals (nobody works the garden below), so a long hide is a real hole in the pantry.
 *  2 The risk. A crew that has found the place lived in searches the grounds for the entrance, once a day for as long as it stays (`stayDays`). Each day's
 *    chance rises with how exposed the entrance is (the weakest finished one: a floor hatch under a rug, a steel lid in the yard, a stairwell headhouse; fallout
 *    earth cover and blast doors help hide it), with noise (generator, dogs), smoke and the path trodden to the hatch, with the crew's size and temper, and
 *    with each day they stay (the search widens). A crew that never finds the place never looks for the bunker.
 *  3 If found, the fight is at the choke point (the hatch's ladder, the stairs): one or two men can come at a time, the family has cover behind concrete and
 *    fires first (the crew has just opened the door). With guns (or tools to swing) below, a shootout (`fightBunker`); a hardened door may simply hold.
 *    With nobody armed the crew loots the bunker, and judges whoever is down there by the same rules as everywhere else (sim/crewMercy.ts: hostile crews
 *    kill all but now and then take a captive, merciful crews spare the children).
 */
import type { GameState } from './state';
import type { Encounter } from './encounters';
import { isFinished } from './construction';
import { BUNKER_ENTRANCES } from './bunkerEntrances';
import { tierOf } from './hardening';
import { diffOf } from './difficulty';
import { FOODS, KCAL, needOf, type FoodId } from './needs';
import { eatFrom } from './pantry';
import { JUG_L, WATER_L_PER_DAY } from './water';
import { GUN, gunWeight, isAutoGun, skillOf, type Caliber } from './armory';
import { dogCount } from './pets';
import { dogsQuiet } from './stealthState';
import { chimneyPoints } from './stealth';
import { genSound } from './blackout';
import { dispositionOf, hostileVerdict, mercifulVerdict, type Found } from './crewMercy';
import { takeCap } from './breachFates';
import { crewKindOf } from './surrender';
import { backgroundOf } from './family';
import { gallonsText } from './units';
import { pluralize } from './words';

/** Every number here is tunable. */
export const BUNKER_HIDE = {
  /** Liters of water a person uses a day below (drinking, cooking, washing): the same figure the stored-water days elsewhere use. */
  WATER_L: WATER_L_PER_DAY,
  /** Entrance concealment, 0-100 (how well the way down hides from a crew walking the grounds). A floor hatch is under a rug inside the house. */
  CONCEAL: { bunker_floorhatch: 70, bunker_hatch: 50, bunker_stairs: 25 } as Record<string, number>,
  /** Concealment points per fallout tier (earth over the lid, a baffled entry) and per blast tier (flush steel, no seams, no handle). */
  CONCEAL_FALLOUT: 5, CONCEAL_BLAST: 3,
  /** The door's own hardness, 0-100, before hardening (a ladder hatch, a stairwell's blast door, a lid in the floor), and per tier. */
  HARD: { bunker_floorhatch: 15, bunker_hatch: 35, bunker_stairs: 30 } as Record<string, number>,
  HARD_BLAST: 20, HARD_FALLOUT: 5, HARD_CAP: 95,
  /** The trodden path to the entrance, in exposure points (a lid out in the yard is walked to; a floor hatch is inside the house). */
  TRACKS: { bunker_floorhatch: 2, bunker_hatch: 6, bunker_stairs: 8 } as Record<string, number>,
  /** Per-day find chance: base search chance, then each exposure point adds a hundredth. */
  BASE: 0.08,
  /** Noise points: a running generator (times its sound factor), each dog (capped), a quiet dog keeps this share; a crew with dogs of its own. */
  GEN: 8, DOG: 3, DOG_CAP: 9, DOG_QUIET: 0.25, RAIDER_DOGS: 10,
  /** The stove's smoke from the night before, times the chimney points. */
  SMOKE: 1.5,
  /** The search widens each day by this much. */
  WIDEN: 0.35,
  /** Crew size: 0.8 for a pair, plus this per extra man, to the cap; temper multiplies. */
  CREW: 0.05, CREW_MIN: 0.8, CREW_MAX: 1.6, TEMPER: { desperate: 0.85, hard: 1, savage: 1.2 } as Record<string, number>, SCOUTED: 1.25,
  MAX_DAY: 0.9,
  /** The fight at the choke point. */
  ROUNDS: 8, WIDTH: { bunker_floorhatch: 1, bunker_hatch: 1, bunker_stairs: 2 } as Record<string, number>,
  /** Cover behind the choke: defenders' hits times (ADV_BASE + hardness * ADV_HARD); the crew's hits times (1 - hardness * COVER_HIT). */
  ADV_BASE: 1.3, ADV_HARD: 0.7, COVER_HIT: 0.5,
  /** Hit chance per shot: a defender with a gun, with a tool in hand; a raider with a gun, with his hands. */
  GUN_HIT: 0.3, MELEE_HIT: 0.22, RAIDER_GUN: 0.22, RAIDER_BARE: 0.4,
  /** Share of a crew that goes down (killed or hurt) before it breaks and goes back up, by temper. */
  BREAK: { desperate: 0.3, hard: 0.4, savage: 0.6 } as Record<string, number>,
  /** The chance the closed door gives way to a crew with time, 1 - hardness / FORCE (a hard blast door holds most crews). */
  FORCE: 130,
  /** Rounds an armed defender fires in a round of the fight. */
  ROUNDS_PER: 6, ROUNDS_AUTO: 18,
  /** Share of the stores below a crew carries off when it gets in: hostile, merciful. */
  LOOT: { hostile: 0.6, merciful: 0.35 },
} as const;

// ── who is down there ─────────────────────────────────────────────────────

export interface Hider { i: number; id: string; first: string; kid: boolean; age: number; vet: boolean }

/** Everyone alive and at home: the people who go down. */
export function hidersOf(s: GameState): Hider[] {
  const out: Hider[] = [];
  s.people.forEach((p, i) => {
    const n = s.personState[i]?.needs;
    if (!n || n.died != null || s.personState[i].task === 'gone' || s.personState[i].task === 'town') return;
    out.push({ i, id: p.id, first: p.first, kid: p.kid, age: p.age, vet: backgroundOf(p) !== null });
  });
  return out;
}

// ── the cost ──────────────────────────────────────────────────────────────

export interface HideSupplies {
  people: number;
  /** What the group eats and drinks below in a day. */
  kcalPerDay: number;
  litersPerDay: number;
  /** Days the stored food, and the stored water, would last them. */
  foodDays: number;
  waterDays: number;
  /** The shorter of the two. */
  days: number;
  /** At least a day of both: with less, hiding is not viable. */
  viable: boolean;
}

const storedKcal = (s: GameState): number => FOODS.reduce((a, f) => a + Math.max(0, s.stock[f]) * KCAL[f], 0);
const storedWaterL = (s: GameState): number => Math.max(0, s.utilities.storedL) + Math.max(0, s.stock.water_jugs ?? 0) * JUG_L;

export function hideSupplies(s: GameState): HideSupplies {
  const hs = hidersOf(s);
  const kcalPerDay = hs.reduce((a, h) => a + needOf({ kid: h.kid, age: h.age }), 0);
  const litersPerDay = hs.length * BUNKER_HIDE.WATER_L;
  const foodDays = kcalPerDay > 0 ? storedKcal(s) / kcalPerDay : Infinity;
  const waterDays = litersPerDay > 0 ? storedWaterL(s) / litersPerDay : Infinity;
  const days = Math.min(foodDays, waterDays);
  return { people: hs.length, kcalPerDay, litersPerDay, foodDays, waterDays, days, viable: hs.length > 0 && days >= 1 };
}

/** Take `days` of food and water out of the stores (never below nothing). Returns what was really used. */
export function drainStores(s: GameState, days: number): { kcal: number; liters: number; shortFood: boolean; shortWater: boolean } {
  const sup = hideSupplies(s);
  const wantK = sup.kcalPerDay * days, wantL = sup.litersPerDay * days;
  // shelf-stable first (the bunker's stores room), then the freezer, then fresh
  let need = wantK, got = 0;
  for (const f of ['canned', 'staples', 'frozen', 'fresh'] as FoodId[]) {
    if (need <= 1e-6 || s.stock[f] <= 1e-9) continue;
    if (f === 'fresh') { const take = Math.min(s.stock.fresh, need / KCAL.fresh); s.stock.fresh -= take; got += take * KCAL.fresh; need -= take * KCAL.fresh; continue; }
    const before = s.stock[f];
    const e = eatFrom(s, f, need, { thawed: f === 'frozen' });
    const used = Math.max(0, before - s.stock[f]) * KCAL[f];
    got += Math.max(e.eff, used); need = wantK - got;
  }
  let water = wantL, drawn = 0;
  const jug = Math.min(Math.max(0, s.stock.water_jugs ?? 0), water / JUG_L);
  if (jug > 0) { s.stock.water_jugs -= jug; drawn += jug * JUG_L; water -= jug * JUG_L; }
  const tank = Math.min(Math.max(0, s.utilities.storedL), water);
  if (tank > 0) { s.utilities.storedL -= tank; drawn += tank; }
  return { kcal: Math.min(got, wantK), liters: drawn, shortFood: got < wantK - 1, shortWater: drawn < wantL - 1e-6 };
}

// ── how long they stay, and how well the way down hides ───────────────────

/** Days a crew that has found the place stays and searches. */
export function stayDays(e: Pick<Encounter, 'kind' | 'temper' | 'back' | 'scouted'>): number {
  const base: Partial<Record<Encounter['kind'], number>> = { looters: 1, patrol: 1, requisition: 1, refugees: 1, militia: 2, gang: 2, horde: 3, tunnelers: 2 };
  return Math.min(5, (base[e.kind] ?? 1) + (e.temper === 'savage' ? 1 : 0) + (e.back ? 1 : 0) + (e.scouted ? 1 : 0));
}

export interface Entrance { kind: string; id: string; concealment: number; hardness: number; width: number; fallout: number; blast: number }

/** The way into the bunker a crew would find first: the weakest finished entrance (least concealed). Null: no bunker. */
export function entranceOf(s: GameState): Entrance | null {
  let best: Entrance | null = null;
  for (const st of s.structures) {
    if (!isFinished(st) || !BUNKER_ENTRANCES.includes(st.kind)) continue;
    const fallout = tierOf(st, 'fallout'), blast = tierOf(st, 'blast');
    const concealment = Math.min(98, (BUNKER_HIDE.CONCEAL[st.kind] ?? 40) + BUNKER_HIDE.CONCEAL_FALLOUT * fallout + BUNKER_HIDE.CONCEAL_BLAST * blast);
    const hardness = Math.min(BUNKER_HIDE.HARD_CAP, (BUNKER_HIDE.HARD[st.kind] ?? 20) + BUNKER_HIDE.HARD_BLAST * blast + BUNKER_HIDE.HARD_FALLOUT * fallout);
    const e: Entrance = { kind: st.kind, id: st.id, concealment, hardness, width: BUNKER_HIDE.WIDTH[st.kind] ?? 1, fallout, blast };
    if (!best || e.concealment < best.concealment) best = e;
  }
  return best;
}

export const entranceWord = (kind: string): string => (kind === 'bunker_floorhatch' ? 'the floor hatch' : kind === 'bunker_stairs' ? 'the stairs' : 'the hatch');

/** The give-aways in exposure points: noise, dogs, smoke, the trodden path, and a crew with dogs of its own. */
export function giveAways(s: GameState, e: Pick<Encounter, 'temper' | 'scouted'>, ent: Pick<Entrance, 'kind'>): { noise: number; dogs: number; smoke: number; tracks: number; raiderDogs: number; total: number } {
  const noise = s.utilities.report.genKwh > 0.05 ? BUNKER_HIDE.GEN * genSound(s) : 0;
  const dogs = Math.min(BUNKER_HIDE.DOG_CAP, dogCount(s) * BUNKER_HIDE.DOG) * (dogsQuiet(s) ? BUNKER_HIDE.DOG_QUIET : 1);
  const smoke = chimneyPoints(s) * BUNKER_HIDE.SMOKE;
  const tracks = BUNKER_HIDE.TRACKS[ent.kind] ?? 4;
  const raiderDogs = e.temper === 'savage' || e.scouted ? BUNKER_HIDE.RAIDER_DOGS : 0;
  return { noise, dogs, smoke, tracks, raiderDogs, total: noise + dogs + smoke + tracks + raiderDogs };
}

/** One day's chance the crew finds the bunker's entrance (day 1 = the first day they search). */
export function dayFindChance(s: GameState, e: Pick<Encounter, 'kind' | 'size' | 'temper' | 'scouted'>, day: number, ent: Entrance | null = entranceOf(s)): number {
  if (!ent) return 0;
  const exposure = Math.max(0.02, 1 - ent.concealment / 100);
  const pts = giveAways(s, e, ent).total;
  const crew = Math.max(BUNKER_HIDE.CREW_MIN, Math.min(BUNKER_HIDE.CREW_MAX, BUNKER_HIDE.CREW_MIN + BUNKER_HIDE.CREW * (e.size - 2)));
  const widen = 1 + BUNKER_HIDE.WIDEN * (Math.max(1, day) - 1);
  const temper = (BUNKER_HIDE.TEMPER[e.temper ?? 'hard'] ?? 1) * (e.scouted ? BUNKER_HIDE.SCOUTED : 1);
  const hunt = 1 + diffOf(s.disaster).hunt / 100;
  return Math.max(0, Math.min(BUNKER_HIDE.MAX_DAY, exposure * (BUNKER_HIDE.BASE + pts / 100) * crew * widen * temper * hunt));
}

/** The chance the bunker is found over `days` days of searching, and each day's chance. */
export function bunkerFindChance(s: GameState, e: Pick<Encounter, 'kind' | 'size' | 'temper' | 'scouted'>, days: number, ent: Entrance | null = entranceOf(s)): { perDay: number[]; total: number } {
  const perDay: number[] = [];
  let live = 1;
  for (let d = 1; d <= days; d++) { const p = dayFindChance(s, e, d, ent); perDay.push(p); live *= 1 - p; }
  return { perDay, total: 1 - live };
}

// ── who can fight down there ──────────────────────────────────────────────

export interface Fighter {
  id: string; first: string; kid: boolean; age: number; vet: boolean;
  /** A loaded gun: its caliber, weight in the fight (type x skill x condition), full-auto. Null: no gun. */
  gun: { cal: Caliber; w: number; auto: boolean; gunId: string } | null;
  /** What he swings when the gun is empty or he has none (0 = nothing in hand). */
  melee: number;
}
export interface Arms { fighters: Fighter[]; guns: number; melee: number; /** At least one loaded gun, or two with a tool to swing. */ armed: boolean }

/** Tools that hurt when swung, and how much (a felling axe is a weapon; a hammer is a poor one). */
const MELEE_TOOLS: Record<string, number> = { axe: 0.35, pick_mattock: 0.3, hammer: 0.2, shovel: 0.2 };

/** Who is armed down there: adults (and teenagers when there are fewer than two adults) with a loaded gun, else a tool to swing. Guns in the bunker's safe come down too. */
export function arms(s: GameState): Arms {
  const hs = hidersOf(s);
  const adultsN = hs.filter(h => !h.kid).length;
  const can = (h: Hider) => !h.kid || (h.age >= 15 && adultsN < 2);
  const fighters = hs.filter(can);
  const safeBelow = s.structures.some(st => isFinished(st) && st.kind === 'bunker_comms');
  const loaded = s.armory.guns.filter(g => (s.armory.ammo[GUN[g.model].cal] ?? 0) >= (isAutoGun(GUN[g.model].type) ? 90 : 10) && (fighters.some(f => f.id === g.carrier) || (!g.carrier && g.where === 'safe' && safeBelow)));
  const free = [...loaded].sort((a, b) => gunWeight(b) - gunWeight(a));
  const tools = (s.tools?.items ?? []).filter(t => (MELEE_TOOLS[t.kind] ?? 0) > 0 && t.cond > 0.2).sort((a, b) => (MELEE_TOOLS[b.kind] ?? 0) - (MELEE_TOOLS[a.kind] ?? 0));
  const out: Fighter[] = [];
  const unarmed: Fighter[] = [];
  for (const h of fighters) {
    const own = free.find(g => g.carrier === h.id) ?? free.find(g => !g.carrier);
    const f: Fighter = { id: h.id, first: h.first, kid: h.kid, age: h.age, vet: h.vet, gun: null, melee: 0 };
    if (own) {
      free.splice(free.indexOf(own), 1);
      const m = GUN[own.model];
      f.gun = { cal: m.cal, w: gunWeight(own) * (0.5 + 0.06 * skillOf(s, h.id)) * (own.condition < 0.5 ? 0.6 : 1), auto: isAutoGun(m.type), gunId: own.id };
    } else unarmed.push(f);
    out.push(f);
  }
  let melee = 0;
  for (const f of [...out].sort((a, b) => (a.gun ? 1 : 0) - (b.gun ? 1 : 0))) {
    const t = tools.shift();
    if (!t) break;
    f.melee = MELEE_TOOLS[t.kind]; melee++;
  }
  const guns = out.filter(f => f.gun).length;
  return { fighters: out, guns, melee, armed: guns >= 1 || (melee >= 2) };
}

// ── the fight at the choke point ──────────────────────────────────────────

export interface FightIn {
  /** Men in the crew, armed with guns or not, and their temper (when they break). */
  men: number; gunned: boolean; temper: string;
  /** The way down: how many can come at once, how hard the door and its cover are (0-100). */
  width: number; hardness: number;
  fighters: ReadonlyArray<Pick<Fighter, 'id' | 'gun' | 'melee'>>;
  /** Rounds on hand by caliber (a gun with none left is a club). */
  ammo: Partial<Record<Caliber, number>>;
}
export type FightResult = 'repelled' | 'overrun' | 'stalemate';
export interface FightOut {
  result: FightResult;
  rounds: number;
  /** Crew men killed, hurt (out of the fight, left at the foot of the stairs), and who ran. */
  raidersDead: number; raidersHurt: number; raidersLeft: number;
  /** Fates of the family's fighters. */
  killed: string[]; wounded: string[];
  /** Rounds fired by caliber. */
  spent: Partial<Record<Caliber, number>>;
}

/**
 * The shootout. Each round is a short exchange (about twenty seconds): the family fires at the men on the stairs, then the men that are up fire back. The
 * family fires first in the first round (the crew has just opened the door). A man hurt or dead is out. Only `width` men come at a time; the cover behind the
 * door makes the family's shots count for more and the crew's for less. The crew breaks (goes back up) when a share of it is down; the family is overrun when
 * none of its fighters can still shoot.
 */
export function fightBunker(inp: FightIn, r: () => number): FightOut {
  const adv = BUNKER_HIDE.ADV_BASE + BUNKER_HIDE.ADV_HARD * (inp.hardness / 100);
  const hitK = 1 - BUNKER_HIDE.COVER_HIT * (inp.hardness / 100);
  const state = new Map<string, 'ok' | 'hurt' | 'down' | 'dead'>(inp.fighters.map(f => [f.id, 'ok']));
  const ammo: Partial<Record<Caliber, number>> = { ...inp.ammo };
  const spent: Partial<Record<Caliber, number>> = {};
  let live = inp.men, dead = 0, hurt = 0, rounds = 0;
  const breakAt = Math.max(1, Math.ceil(inp.men * (BUNKER_HIDE.BREAK[inp.temper] ?? 0.4)));
  const perMan = inp.gunned ? BUNKER_HIDE.RAIDER_GUN : BUNKER_HIDE.RAIDER_BARE * BUNKER_HIDE.RAIDER_GUN;
  const standing = () => inp.fighters.filter(f => state.get(f.id) === 'ok' || state.get(f.id) === 'hurt');
  let result: FightResult = 'stalemate';
  for (let round = 1; round <= BUNKER_HIDE.ROUNDS; round++) {
    const engaged = () => Math.min(live, inp.width);
    // the family fires
    for (const f of standing()) {
      if (engaged() <= 0) break;
      const weak = state.get(f.id) === 'hurt' ? 0.5 : 1;
      const useGun = !!f.gun && (ammo[f.gun.cal] ?? 0) > 0;
      if (useGun) {
        const n = f.gun!.auto ? BUNKER_HIDE.ROUNDS_AUTO : BUNKER_HIDE.ROUNDS_PER, used = Math.min(n, ammo[f.gun!.cal] ?? 0);
        ammo[f.gun!.cal] = (ammo[f.gun!.cal] ?? 0) - used; spent[f.gun!.cal] = (spent[f.gun!.cal] ?? 0) + used; rounds += used;
      }
      const p = useGun ? Math.min(0.6, BUNKER_HIDE.GUN_HIT * f.gun!.w * adv * weak * (f.gun!.auto ? 1.2 : 1)) : Math.min(0.5, BUNKER_HIDE.MELEE_HIT * (f.melee > 0 ? f.melee / 0.35 : 0.3) * adv * weak);
      if (r() < p) { live--; if (r() < 0.55) dead++; else hurt++; }
    }
    if (dead + hurt >= breakAt || live <= 0) { result = 'repelled'; break; }
    if (round === 1 && inp.fighters.some(f => f.gun && (ammo[f.gun.cal] ?? 0) > 0)) continue;   // the opening volley: they have just opened the door
    // the crew fires back at whoever is still standing
    const targets = standing();
    if (!targets.length) { result = 'overrun'; break; }
    for (let k = 0; k < engaged(); k++) {
      const t = targets[Math.floor(r() * targets.length)];
      if (r() >= perMan * hitK) continue;
      const st = state.get(t.id)!;
      if (st === 'ok') state.set(t.id, r() < 0.2 ? 'dead' : 'hurt');
      else if (st === 'hurt') state.set(t.id, r() < 0.4 ? 'dead' : 'down');
    }
    if (!standing().length) { result = 'overrun'; break; }
  }
  const raidersLeft = result === 'repelled' ? Math.max(0, live) : 0;
  return {
    result, rounds, raidersDead: dead, raidersHurt: hurt, raidersLeft, spent,
    killed: inp.fighters.filter(f => state.get(f.id) === 'dead').map(f => f.id),
    wounded: inp.fighters.filter(f => state.get(f.id) === 'hurt' || state.get(f.id) === 'down').map(f => f.id),
  };
}

// ── the preview the gate card shows ───────────────────────────────────────

export interface HidePreview {
  viable: boolean;
  /** "Hiding costs ...": the daily drain in words. */
  costLine: string;
  /** "Stores last ...": supplies days against the crew's stay. */
  daysLine: string;
  /** "If they find the place ...": the chance the bunker is found. */
  riskLine: string;
  /** What happens if found: armed or not. */
  foundLine: string;
  stay: number;
  find: number;
}

const inTen = (x: number): string => (x < 0.05 ? 'almost never' : x > 0.95 ? 'almost always' : `about ${Math.round(x * 10)} in 10`);
const daysWord = (d: number): string => (d >= 99 ? '99+ days' : d < 1 ? 'less than a day' : `${Math.floor(d * 10) / 10 === Math.floor(d) ? Math.floor(d) : (Math.floor(d * 10) / 10).toFixed(1)} day${Math.floor(d * 10) / 10 === 1 ? '' : 's'}`);

/** The lines for the hide choice: what it costs a day, how long the stores last, how likely the bunker is found, what happens if it is. */
export function hidePreview(s: GameState, e: Pick<Encounter, 'kind' | 'size' | 'temper' | 'back' | 'scouted'>, houseFound: number): HidePreview {
  const sup = hideSupplies(s), ent = entranceOf(s), stay = stayDays(e);
  const cases = sup.kcalPerDay / KCAL.canned;
  const costLine = `Below, ${pluralize(sup.people, 'person', 'people')} eat about ${cases >= 1 ? cases.toFixed(1) : '<1'} cases of canned food and drink ${gallonsText(sup.litersPerDay)} a day from your stores`;
  const daysLine = sup.viable
    ? `Stored food lasts ${daysWord(sup.foodDays)}, water ${daysWord(sup.waterDays)}; they expect to stay ${pluralize(stay, 'day')} if found${sup.days < stay ? ' (you will run out first and have to come up)' : ''}`
    : 'Not enough food or water stored for even one day below: you cannot hide down there';
  const f = ent ? bunkerFindChance(s, e, Math.min(stay, Math.max(1, Math.floor(sup.days))), ent) : { total: 0, perDay: [] as number[] };
  const find = houseFound * f.total;
  const a = arms(s);
  const searchDays = Math.min(stay, Math.max(1, Math.floor(sup.days)));
  const riskLine = ent ? `They find the bunker ${inTen(find)}: ${entranceWord(ent.kind).replace('the ', '')} ${Math.round(ent.concealment)}% hidden, door ${Math.round(ent.hardness)}% hard. First they must find the place (${inTen(houseFound)}), then search ${pluralize(searchDays, 'day')}` : 'No bunker to hide in';
  const armsText = [a.guns ? pluralize(a.guns, 'gun') : '', a.melee ? `${pluralize(a.melee, 'person', 'people')} with tools to swing` : ''].filter(Boolean).join(' and ');
  const foundLine = a.armed ? `If found: a shootout at ${ent ? entranceWord(ent.kind) : 'the door'} (${armsText} below; the family fires first)` : 'If found, nobody below is armed: they loot the bunker and take or kill whoever they find';
  return { viable: sup.viable, costLine, daysLine, riskLine, foundLine, stay, find };
}

// ── when they find it ─────────────────────────────────────────────────────

export interface BunkerResult {
  /** What happened at the bunker: not found, the door held, a shootout, or the crew looted it. */
  fight: 'hidden' | 'door_held' | 'shootout' | 'loot';
  days: number;
  /** The day the entrance was found (0 = never). */
  foundDay: number;
  forcedOut: boolean;
  /** The fight's result when there was one. */
  result?: FightResult;
}

const FRAGMENTS = [
  '"Quiet. Quiet. Please."', '"Don\'t breathe. Don\'t. Oh God."', '"They\'re on the stairs. They\'re on the...!"', '"Get down. Get the kids down!"', '"Is that the hatch? Is that...?"', '"No. No no no."',
  '"Somebody. Somebody do something."', '"Shh. Shh. Baby, shh."', '"They found it. They found it!"',
];
const CALM = ['"Door. Stay low."', '"Hold. Let them come down."', '"Steady. Wait for it."'];
const pickLine = (r: () => number, vet: boolean): string => { const a = vet ? CALM : FRAGMENTS; return a[Math.floor(r() * a.length)]; };

const hurtMany = (s: GameState, i: number, sev: number, what: string): void => {
  const n = s.personState[i].needs;
  if (n.died != null) return;
  n.hurt.push({ what, sev, trauma: true });
  n.health = Math.max(s.disaster.difficulty === 'cozy' ? 5 : 1, n.health - sev * 0.5);
};
const killPerson = (s: GameState, i: number, taken: boolean): void => {
  const n = s.personState[i].needs;
  if (n.died != null) return;
  const day = Math.floor(s.clock.t);
  if (s.disaster.difficulty === 'cozy' && !taken) { n.hurt.push({ what: 'badly wounded in the bunker', sev: 80, trauma: true }); n.health = 5; return; }
  n.health = 0; n.died = day; n.cause = 'raid'; if (taken) n.taken = true;
};

/** What a crew carries out of the bunker when it gets in: a share of the food, fuel, medicine, water and the guns in the safe. */
function lootBunker(s: GameState, share: number): string[] {
  const out: string[] = [];
  for (const k of ['canned', 'staples', 'frozen', 'fresh', 'fuel', 'meds'] as const) {
    const t = Math.floor((s.stock[k] ?? 0) * share);
    if (t > 0) { s.stock[k] -= t; out.push(`${t} ${k}`); }
  }
  const jugs = Math.floor(Math.max(0, s.stock.water_jugs ?? 0) * share), tank = Math.max(0, s.utilities.storedL) * share;
  if (jugs > 0) s.stock.water_jugs -= jugs;
  if (tank > 1) s.utilities.storedL -= tank;
  if (jugs > 0 || tank > 1) out.push(`${gallonsText(jugs * JUG_L + tank)} of water`);
  const safe = s.armory.guns.filter(g => !g.carrier && g.where === 'safe' && s.structures.some(st => isFinished(st) && st.kind === 'bunker_comms'));
  const guns = Math.ceil(safe.length * share);
  for (let n = 0; n < guns; n++) { const k = s.armory.guns.indexOf(safe[n]); if (k >= 0) s.armory.guns.splice(k, 1); }
  if (guns > 0) out.push(pluralize(guns, 'gun'));
  return out;
}

export interface BunkerOutcome { title: string; text: string; tone: 'good' | 'mixed' | 'bad'; lines: string[]; result: BunkerResult; /** Raiders left at the foot of the stairs for the aftermath choices. */ left: { wounded: number; dead: number }; /** Bonus standing in the county after a crew was beaten (the caller adds it to `respect`). */ held: boolean }

/**
 * The crew found the entrance. Resolves it on the state: the door may hold; a shootout if the family is armed; otherwise the crew loots and judges.
 * Every change is written to `s` (people hurt, killed or taken, stores, rounds); the lines say it.
 */
export function resolveFound(s: GameState, e: Encounter, foundDay: number, days: number, forcedOut: boolean, r: () => number): BunkerOutcome {
  const ent = entranceOf(s) ?? { kind: 'bunker_hatch', id: '', concealment: 50, hardness: 35, width: 1, fallout: 0, blast: 0 } as Entrance;
  const where = entranceWord(ent.kind);
  const hs = hidersOf(s);
  const a = arms(s);
  const crew = e.size, kind = crewKindOf(e.kind), disp = dispositionOf(e.temper ?? 'desperate', kind);
  const lines: string[] = [];
  const res = (fight: BunkerResult['fight'], extra: Partial<BunkerResult> = {}): BunkerResult => ({ fight, days, foundDay, forcedOut, ...extra });
  const hostile = disp === 'hostile';
  if (forcedOut) lines.push('The water and the food ran out below. You had to come up, with the crew still on the place.');
  // a hard door may simply hold, when the family does not open it and the crew has no charge: not when the family had to come up
  if (!forcedOut && r() * 100 < ent.hardness * 100 / BUNKER_HIDE.FORCE && !(e.temper === 'savage' && r() < 0.3)) {
    lines.push(`${pluralize(crew, 'man', 'men')} found ${where}. They beat on it, pried at it, and went away. Nobody below said a word.`);
    lines.push(pickLine(r, hs.some(h => h.vet)));
    return { title: 'They found the door and could not open it', text: `They found ${where}. The steel held. After an hour they left.`, tone: 'mixed', lines, result: res('door_held'), left: { wounded: 0, dead: 0 }, held: false };
  }
  if (a.armed && !forcedOut) {
    const f = fightBunker({ men: crew, gunned: e.armed || e.kind !== 'horde', temper: e.temper ?? 'desperate', width: ent.width, hardness: ent.hardness, fighters: a.fighters, ammo: s.armory.ammo }, r);
    lines.push(`They came down ${where} one at a time. The family fired first. ${pluralize(f.rounds, 'round')} went out.`);
    const speaker = a.fighters.find(x => !x.vet) ?? a.fighters[0];
    if (speaker) lines.push(`${speaker.first}: ${pickLine(r, speaker.vet)}`);
    for (const [cal, n] of Object.entries(f.spent) as Array<[Caliber, number]>) s.armory.ammo[cal] = Math.max(0, (s.armory.ammo[cal] ?? 0) - n);
    for (const id of f.killed) { const i = s.people.findIndex(p => p.id === id); if (i >= 0) { killPerson(s, i, false); lines.push(`${s.people[i].first} was ${s.disaster.difficulty === 'cozy' ? 'badly wounded' : 'killed'}.`); } }
    for (const id of f.wounded) { const i = s.people.findIndex(p => p.id === id); if (i >= 0) { hurtMany(s, i, 25 + Math.floor(r() * 30), 'shot at the foot of the stairs'); lines.push(`${s.people[i].first} was wounded.`); } }
    const left = { wounded: f.raidersHurt, dead: f.raidersDead };
    if (f.result === 'repelled') {
      lines.push(`${f.raidersDead} of them dead and ${f.raidersHurt} hurt on the stairs. The rest went back up and out.`);
      return { title: 'They found the bunker, and it cost them', text: `They came down ${where} and the family held it. Word will go round.`, tone: f.killed.length || f.wounded.length ? 'mixed' : 'good', lines, result: res('shootout', { result: 'repelled' }), left, held: true };
    }
    if (f.result === 'stalemate') {
      lines.push(`They could not get past ${where} and, after a long afternoon, went back up. ${f.raidersDead} of them dead, ${f.raidersHurt} hurt.`);
      return { title: 'A standoff at the foot of the stairs', text: `Neither side gave way until they gave up and left.`, tone: 'mixed', lines, result: res('shootout', { result: 'stalemate' }), left, held: true };
    }
    // overrun: the family's guns are out; the rest below are judged
    lines.push('The last gun below went quiet. They came down.');
    const rest = hs.filter(h => !f.killed.includes(h.id));
    judge(s, e, rest, true, hostile, kind, crew, r, lines);
    lines.push(...lootLines(s, hostile));
    return { title: 'They got into the bunker', text: `The family fought at ${where} and was overrun.`, tone: 'bad', lines, result: res('shootout', { result: 'overrun' }), left, held: false };
  }
  // nobody armed (or driven up with nothing in their hands): the crew gets the door open and goes through whatever is below
  lines.push(`They got ${where} open. Nobody below had so much as a pistol.`);
  const speaker = hs.find(h => !h.vet && !h.kid) ?? hs[0];
  if (speaker) lines.push(`${speaker.first}: ${pickLine(r, speaker.vet)}`);
  judge(s, e, hs, false, hostile, kind, crew, r, lines);
  lines.push(...lootLines(s, hostile));
  return { title: 'They found the bunker', text: hostile ? 'They came down the stairs and nobody below could stop them.' : 'They came down and took what they wanted. They did not touch the children.', tone: 'bad', lines, result: res('loot'), left: { wounded: 0, dead: 0 }, held: false };
}

function lootLines(s: GameState, hostile: boolean): string[] {
  const took = lootBunker(s, hostile ? BUNKER_HIDE.LOOT.hostile : BUNKER_HIDE.LOOT.merciful);
  return took.length ? [`Taken from below: ${took.join(', ')}.`] : ['They found little below worth taking.'];
}

/** The crew's verdict on each person it finds below (the rules of sim/crewMercy.ts). */
function judge(s: GameState, e: Encounter, found: ReadonlyArray<Hider>, fought: boolean, hostile: boolean, kind: ReturnType<typeof crewKindOf>, crew: number, r: () => number, lines: string[]): void {
  const temper = e.temper ?? 'desperate';
  const cap = takeCap(temper, kind, crew);
  let taken = 0;
  const worker = (h: Hider) => !h.kid && h.age >= 16 && h.age <= 55;
  for (const h of found) {
    if (s.personState[h.i].needs.died != null) continue;
    const can = taken < cap && (h.kid ? temper === 'savage' : temper !== 'savage' && worker(h) && (hostile || kind === 'requisition'));
    const f: Found = { kid: h.kid, age: h.age, armed: fought && !h.kid, down: false, hiding: true, complies: true };
    let fate = hostile ? hostileVerdict(f, can, r, temper === 'savage') : mercifulVerdict(f, r);
    if (!hostile && fate === 'taken') fate = 'held';
    if (temper === 'savage' && fate === 'taken' && !h.kid) fate = 'killed';
    if (fate === 'taken' && !can) fate = 'held';
    if (fate === 'taken') { taken++; killPerson(s, h.i, true); lines.push(`${h.first} was taken.`); }
    else if (fate === 'killed') { killPerson(s, h.i, false); lines.push(`${h.first} was ${s.disaster.difficulty === 'cozy' ? 'badly wounded' : 'killed'}.`); }
    else if (fate === 'wounded') { hurtMany(s, h.i, 20 + Math.floor(r() * 25), 'beaten in the bunker'); lines.push(`${h.first} was hurt.`); }
    else if (fate === 'held') lines.push(`${h.first} was held at gunpoint on the floor.`);
    else if (h.kid) lines.push(`${h.first} was left alone.`);
  }
}
