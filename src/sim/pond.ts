/**
 * The private pond: trout and crayfish (docs/DECISIONS.md "Self-sufficient interior"). Pure.
 *
 *  Dig         the `pond` kit piece (a 18 × 18 m basin, lined, with a spillway and a standpipe) also
 *              stores 300,000 L of water for the fields and the fire; a stocked pond is not drinking
 *              water without a filter. (`reservoir` is the same hole without fish: 400,000 L.)
 *  Stock       a bag of 100 trout fingerlings (8 g) or 50 crayfish breeders, bought in the Shop (Food
 *              & farm). Trout need cool water: the pond is stocked when it is under 19 C (spring and
 *              fall) and not at all where July runs past 90 F. A pond carries 450 trout (800 when an
 *              aerator runs on the compound's power) and 2,400 crayfish.
 *  Feed        trout eat 1.2 % of their weight a day in pellets (a 50 lb bag feeds about 12 fish
 *              hundred for a week). Unfed they hold their weight at best and grow at a third of the
 *              rate. Crayfish forage; they breed from April to July.
 *  Growth      trout gain by water temperature (about 3.2 g a day from 12 to 17 C, none above 22 or under
 *              3): a fingerling reaches the 350 g table size in about eight months of growing weather. The Livestock duty
 *              does the feeding and clears the screens (the pond chore); behind, they grow slower.
 *  Seasons     crayfish are trapped May to October (traps and nets: fishing gear). In a hot July,
 *              or under ice with no aerator, the oxygen drops and a die-off takes a share of them.
 *  Predators   herons, otters and raccoons; bears where they live and the line is open (the
 *              property line against animals, sim/wildlife.ts); with no law, poachers with a net
 *              unless the line is closed to people. A dog on the place and the fish fence help.
 *  Harvest     by hand, from the pond panel: trout at table size go to the freezer, else the smoker,
 *              else the table; crayfish the same.
 */
import { calendarOf, type GameState, type Structure } from './state';
import { REGIONS } from './regions';
import { log } from './economy';
import { mulberry32 } from './rng';
import { addFoodKcal } from './pantry';
import { finishedOf, pondOf, type PondState } from './farm';
import { attractants, predatorSpecies, proof } from './wildlife';
import { careYield } from './daily';

export const TROUT_FRY = 100, TROUT_FRY_G = 8, TABLE_G = 350, CRAY_BAG = 50;
export const TROUT_CAP = 450, TROUT_CAP_AERATED = 800, CRAY_CAP = 2400;
export const FEED_BAG_G = 22_680, FEED_RATE = 0.012;
/** kcal of a whole trout per gram (fillets are ≈ 1.4 kcal/g, a whole fish ≈ half edible), and of one crayfish's tail meat. */
export const TROUT_KCAL_G = 0.78, CRAY_KCAL = 12;
/** The most a day's work takes out of the pond. */
export const HARVEST_TROUT = 60, HARVEST_CRAY = 400;

/** Water temperature (C) by day of year, from the region's July high and January low. */
export function waterTempC(s: GameState, doy = calendarOf(s.clock).doy): number {
  const r = REGIONS[s.site.region], mid = (r.julyHighF + r.janLowF) / 2, amp = (r.julyHighF - r.janLowF) / 2;
  const airF = mid + amp * Math.cos(2 * Math.PI * (doy - 197) / 365);
  return Math.max(1, (airF - 32) / 1.8 * 0.6 + 3);
}

/** Trout live where July stays under 90 F (the water under 22 C). */
export const troutSuited = (s: GameState): boolean => REGIONS[s.site.region].julyHighF < 90;

/** Grams a trout gains a day at a water temperature (C): about 2.4 g between 12 and 17 C, none under 3 or over 22. */
export function troutGrowth(temp: number): number {
  if (temp <= 3 || temp >= 22) return 0;
  if (temp <= 12) return 3.2 * (temp - 3) / 9;
  if (temp <= 17) return 3.2;
  return 3.2 * (22 - temp) / 5;
}

/** Is an aerator running (the pond is wired and had power yesterday)? */
export const aerated = (s: GameState, st: Structure): boolean => s.utilities.lit.includes(st.id);
export const troutCap = (s: GameState, st: Structure): number => (aerated(s, st) ? TROUT_CAP_AERATED : TROUT_CAP);

/** Oxygen in the water, 0–1: warm water and a full pond hold less; an aerator adds a lot; ice with no aerator takes some. */
export function oxygenOf(s: GameState, st: Structure, p: PondState, temp = waterTempC(s)): number {
  const load = Math.min(1.5, p.trout / troutCap(s, st) * 0.7 + p.crayfish / CRAY_CAP * 0.3);
  const aer = aerated(s, st);
  return Math.max(0, Math.min(1, 0.62 + (aer ? 0.33 : 0) - 0.28 * Math.max(0, (temp - 15) / 9) - 0.2 * Math.max(0, load - 0.5) - (temp < 3 && !aer ? 0.12 : 0)));
}

const idHash = (id: string): number => { let h = 0; for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0; return Math.abs(h); };
export const putUp = (s: GameState, kcal: number): string => {
  const freezer = s.structures.some(st => st.kind === 'root_cellar' && st.finishedAt !== null && s.utilities.lit.includes(st.id));
  if (freezer) { addFoodKcal(s, 'game_meat', kcal); return 'in the freezer'; }
  if ((s.stock.smoker ?? 0) >= 1 && kcal > 8000) { addFoodKcal(s, 'smoked_meat', kcal * 0.8); return 'smoked'; }
  s.stock.fresh += kcal / 2000;
  return 'on the table (it will not keep without a freezer or a smoker)';
};

/** Once a day: feed, growth, breeding, die-offs, predators and poachers. Returns log lines. */
export function pondDay(s: GameState): string[] {
  const out: string[] = [];
  const day = Math.floor(s.clock.t), { doy } = calendarOf(s.clock);
  const temp = waterTempC(s, doy);
  for (const st of finishedOf(s, 'pond')) {
    const p = pondOf(s, st.id);
    if (p.trout + p.crayfish <= 0) continue;
    const r = mulberry32(s.seed * 3169 + day * 23 + idHash(st.id));
    // feed: pellets for the trout, while the water is warm enough for them to eat
    const biomass = p.trout * p.troutG;
    const want = temp > 5 ? biomass * FEED_RATE / FEED_BAG_G : 0;
    if (want > 1e-6) {
      const give = Math.min(want, Math.max(0, s.stock.fish_feed ?? 0));
      s.stock.fish_feed = Math.max(0, (s.stock.fish_feed ?? 0) - give);
      p.fed = give / want;
      if (p.fed < 0.5 && p.trout > 50 && day % 15 === 0) out.push('The trout are hungry: the pellets have run out.');
    } else p.fed = 1;
    // water
    const ox = oxygenOf(s, st, p, temp);
    p.oxygen = ox;
    const care = careYield(s, 'pond');
    // growth: the feed and the water set the rate; a hungry or breathless fish just holds on
    if (p.trout > 0) {
      const g = troutGrowth(temp) * (0.3 + 0.7 * p.fed) * (0.5 + 0.5 * ox) * care;
      p.troutG += g;
      if (p.fed < 0.2 && temp > 5) p.troutG = Math.max(TROUT_FRY_G, p.troutG * 0.997);
    }
    // crayfish: a spring hatch up to what the pond holds
    if (p.crayfish > 0 && doy >= 100 && doy <= 215 && temp > 12) p.crayfish = Math.min(CRAY_CAP, p.crayfish + p.crayfish * 0.012 * Math.max(0, 1 - p.crayfish / CRAY_CAP) * (0.5 + 0.5 * ox));
    // a hot spell and a stratified pond: the trout stress
    if (temp > 22 && p.trout > 0) { const lose = Math.ceil(p.trout * (aerated(s, st) ? 0.004 : 0.02)); p.trout -= lose; p.lost += lose; }
    // a die-off: gasping fish, a share lost
    if (ox < 0.35 && p.trout + p.crayfish > 0 && r() < 0.3) {
      const t = Math.floor(p.trout * (0.2 + 0.3 * r())), c = Math.floor(p.crayfish * (0.1 + 0.2 * r()));
      p.trout -= t; p.crayfish -= c; p.lost += t; p.dieOffAt = day;
      out.push(temp < 3 ? `Under the ice with no aerator the pond ran short of oxygen: ${t} trout dead.` : `The pond ran short of oxygen in the heat: ${t} trout and ${c} crayfish dead. An aerator would have saved them.`);
    }
    // predators: herons, otters and raccoons; bears where the line is open
    const kept = proof(s, 'predators').closed, dog = attractants(s).dog > 0;
    if (p.trout > 4 && r() < 0.012 * 0.4 * (kept ? 0.3 : 1) * (dog ? 0.7 : 1)) {
      const lose = Math.max(1, Math.ceil(p.trout * (0.02 + 0.04 * r())));
      p.trout -= lose; p.lost += lose;
      out.push(`A heron and an otter have been at the pond: ${lose} trout gone.`);
    }
    if (!kept && p.trout > 20 && predatorSpecies(s).includes('bear') && r() < 0.002) {
      const lose = Math.ceil(p.trout * 0.12);
      p.trout -= lose; p.lost += lose;
      out.push(`A bear waded into the pond at dawn and ate ${lose} trout. It will be back.`);
    }
    // poachers: with no law, a net, and a pond nobody has closed off
    const lawless = s.disaster.tracks.law < 0.5 && !!s.disaster.kind && s.clock.t >= s.disaster.hitAt;
    if (lawless && p.trout > 20 && !proof(s, 'people').closed && r() < 0.004 * (dog ? 0.6 : 1) && day - p.poachedAt > 5) {
      const table = p.troutG >= TABLE_G ? 0.2 + 0.15 * r() : 0.05;
      const lose = Math.ceil(p.trout * table);
      p.trout -= lose; p.lost += lose; p.poachedAt = day;
      out.push(`Someone has been at the pond with a net: footprints in the mud, ${lose} trout gone. A closed fence would have kept them out.`);
    }
    p.trout = Math.max(0, p.trout); p.crayfish = Math.max(0, Math.floor(p.crayfish));
    if (p.trout === 0) p.troutG = 0;
    p.health = Math.max(0.05, Math.min(1, 0.45 * p.fed + 0.55 * ox));
  }
  return out;
}

/** Why a species cannot go into the pond now (null = it can). */
export function stockProblem(s: GameState, id: string, species: 'trout' | 'crayfish'): string | null {
  const st = finishedOf(s, 'pond').find(x => x.id === id);
  if (!st) return 'the pond is not finished';
  const p = pondOf(s, id), temp = waterTempC(s);
  if (species === 'trout') {
    if (!troutSuited(s)) return 'too warm here for trout in July: crayfish do better';
    if (temp > 19) return `the water is ${Math.round(temp)} C: stock trout in spring or fall, under 19 C`;
    if (s.stock.trout_fry < 1) return 'no fingerlings: buy a bag in the Shop (Food & farm)';
    if (p.trout + TROUT_FRY > troutCap(s, st)) return `the pond holds ${troutCap(s, st)} trout${aerated(s, st) ? '' : ' (800 with an aerator on power)'}`;
    return null;
  }
  if (temp < 8) return 'the water is too cold: stock crayfish in spring';
  if (s.stock.crayfish_stock < 1) return 'no breeders: buy a pack in the Shop (Food & farm)';
  if (p.crayfish + CRAY_BAG > CRAY_CAP) return `the pond holds ${CRAY_CAP} crayfish`;
  return null;
}

/** Put a bag of fingerlings or breeders in. */
export function stockPond(s: GameState, id: string, species: 'trout' | 'crayfish'): string | null {
  const why = stockProblem(s, id, species);
  if (why) return why;
  const p = pondOf(s, id);
  if (species === 'trout') {
    s.stock.trout_fry--;
    p.troutG = (p.troutG * p.trout + TROUT_FRY_G * TROUT_FRY) / (p.trout + TROUT_FRY);
    p.trout += TROUT_FRY;
    log(s, `Stocked ${TROUT_FRY} trout fingerlings. They reach table size in about eight months of growing weather with feed and cool water.`);
  } else {
    s.stock.crayfish_stock--;
    p.crayfish += CRAY_BAG;
    log(s, `Put ${CRAY_BAG} crayfish breeders in the pond: they breed from April.`);
  }
  return null;
}

/** Why the family cannot take fish out now (null = they can). */
export function harvestProblem(s: GameState, id: string, species: 'trout' | 'crayfish'): string | null {
  const st = finishedOf(s, 'pond').find(x => x.id === id);
  if (!st) return 'the pond is not finished';
  const p = pondOf(s, id), { doy } = calendarOf(s.clock);
  if ((s.stock.fishing_gear ?? 0) < 1) return 'needs fishing gear (a net and pots): buy it in the Shop';
  if (species === 'trout') {
    if (p.trout < 1) return 'no trout in the pond';
    if (p.troutG < TABLE_G) return `not table size yet: they average ${Math.round(p.troutG)} g and need ${TABLE_G} g`;
    return null;
  }
  if (p.crayfish < 60) return 'too few crayfish to take any: let them breed';
  if (doy < 120 || doy > 300) return 'crayfish are trapped May to October; they are in their burrows now';
  return null;
}

/** A day's harvest of table-size trout or trapped crayfish. */
export function harvestPond(s: GameState, id: string, species: 'trout' | 'crayfish'): string | null {
  const why = harvestProblem(s, id, species);
  if (why) return why;
  const p = pondOf(s, id), day = Math.floor(s.clock.t);
  let kcal: number, what: string;
  if (species === 'trout') {
    const n = Math.min(HARVEST_TROUT, p.trout);
    p.trout -= n; kcal = n * p.troutG * TROUT_KCAL_G; what = `${n} trout`;
    if (p.trout === 0) p.troutG = 0;
  } else {
    const n = Math.min(HARVEST_CRAY, Math.floor(p.crayfish * 0.4));
    p.crayfish -= n; kcal = n * CRAY_KCAL; what = `${n} crayfish`;
  }
  p.harvestAt = day;
  const where = putUp(s, kcal);
  log(s, `Took ${what} from the pond: ${Math.round(kcal).toLocaleString('en-US')} kcal ${where}.`);
  return null;
}

export interface PondReport {
  trout: number; troutG: number; table: boolean; crayfish: number;
  tempC: number; oxygen: number; fed: number; health: number;
  aerated: boolean; cap: number; feedDays: number; kept: boolean; lost: number;
  notes: string[];
}

/** Everything the pond panel shows for one pond. */
export function pondReport(s: GameState, st: Structure): PondReport {
  const p = pondOf(s, st.id), temp = waterTempC(s);
  const daily = p.trout * p.troutG * FEED_RATE / FEED_BAG_G;
  const notes: string[] = [];
  if (!troutSuited(s)) notes.push('July is too hot here for trout: crayfish only.');
  if (p.trout > 0 && p.troutG < TABLE_G) notes.push(`Trout average ${Math.round(p.troutG)} g; table size is ${TABLE_G} g.`);
  if (daily > 0 && (s.stock.fish_feed ?? 0) < daily * 5) notes.push('Feed is nearly out.');
  if (!aerated(s, st) && p.trout > 200) notes.push('An aerator (wire the pond for power) lifts the cap and keeps them alive in a heat wave.');
  return {
    trout: p.trout, troutG: p.troutG, table: p.troutG >= TABLE_G, crayfish: Math.floor(p.crayfish),
    tempC: temp, oxygen: p.oxygen, fed: p.fed, health: p.health,
    aerated: aerated(s, st), cap: troutCap(s, st), feedDays: daily > 0 ? (s.stock.fish_feed ?? 0) / daily : Infinity,
    kept: proof(s, 'predators').closed, lost: p.lost, notes,
  };
}
