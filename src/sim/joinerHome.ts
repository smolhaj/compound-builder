/**
 * What a joiner brings and where they sleep (docs/DECISIONS.md: "joining members bring their own stuff, tools, money, pool resources
 * with the compound, and can also build the place where they're going to stay"). Extends sim/newcomers.ts (strangers at the gate,
 * the end of a month's trial) and sim/kin.ts (relatives); it adds no new loop. Pure and seeded; the engine's daily newcomers /
 * kin passes call `joinersDay`.
 *
 *  Their things   cash (pooled the day they come in), tools by trade and skills (sim/tools.ts), sometimes a vehicle (a pickup goes
 *                 to the fleet) or a rig, some food and supplies, a gun only if it is a hunting rifle, shotgun or handgun the state
 *                 lets anyone own (sim/armory.ts), a dog now and then. One short line on the card; the rest on "more".
 *  Where they     one choice on the card, each with its cost and its catch:
 *  stay             bed        a spare bed, the couch, a guest house with room (free, today)
 *                   rig        their own travel trailer or RV, on a gravel pad; the automatic utilities reach it within ~70 m
 *                              (AUTO_REACH); it is mobile, so it drives off with them if they go
 *                   modular    a factory-built home bought with their own money, delivered and set on piers (priced from
 *                              MATERIALS.modular_unit; permit through sim/paperwork.ts); fast to finish; tents till then
 *                   own_build  they build a small cabin with the family's help: staked at once, finished by the construction
 *                              pipeline (their hands and skills count); their cash pays for the materials
 *                   player_build  (relatives) wait in town while the family builds them a place; they move in when it is finished,
 *                              and come anyway if the heat comes first (sim/kin.ts)
 *                   tent       pitch a tent in the yard for now (a cold, wet night is a bad one)
 */
import { mulberry32, pick } from './rng';
import { dayIndex, type GameState, type OrderLine, type Structure } from './state';
import { SKILL_IDS, type Person, type SkillId } from './family';
import { FOODS, KCAL, needOf } from './needs';
import { BLUEPRINTS, HOME_BEDS, totalBill, totalHours } from './blueprints';
import { isFinished } from './construction';
import { MATERIALS, type MaterialId, type Stock } from './materials';
import { orderCost, orderProblem, placeOrder, prices } from './economy';
import { applyForPermit, needsPermit, permitFee } from './paperwork';
import { countyWorks } from './paperwork';
import { log } from './economy';
import { cachedPlan, SEPARATE_DWELLINGS, TENT_SEATS } from './housing';
import { givePlace, placeOptions } from './newcomers';
import { fleetOf, VEHICLES, type VehicleKind } from './vehicles';
import { syncParking } from './parking';
import { JOB_KITS, TOOLS, addTool, type ToolKind } from './tools';
import { GUN, GUNS, groupOf, stateBan } from './armory';
import { AUTO_REACH, NODE_R } from './utilities';
import { ownsAt } from './land';
import { CELL, KIT, footprint } from '../game/buildkit/kit';
import type { Encounter } from './encounters';
import type { Extras } from './newcomers';

// ─────────────────────────────────────────────────────────────────────────
// State
// ─────────────────────────────────────────────────────────────────────────

export type StayKind = 'bed' | 'rig' | 'modular' | 'own_build' | 'player_build' | 'tent';
export type RigKind = 'travel_trailer' | 'rv_camper';
export const RIG_NAME: Record<RigKind, string> = { travel_trailer: 'travel trailer', rv_camper: 'RV' };
export const isRig = (kind: string): kind is RigKind => kind === 'travel_trailer' || kind === 'rv_camper';

/** Joiners whose home is being built (or delivered) and who move in when it is finished. */
export interface JoinerStay { ids: string[]; kind: StayKind; structure?: string; day: number }
/** A rig whose owner asked to pick the pad themselves: the build menu offers it until it is parked. */
export interface WaitingRig { id: string; kind: RigKind; owners: string[]; day: number }
export interface JoinerState { stays: JoinerStay[]; waiting: WaitingRig[]; /** Relatives who are waiting for a place the family stakes (kin.waiting ids), by structure. */ rigsParked: number; day: number }
export const newJoiners = (): JoinerState => ({ stays: [], waiting: [], rigsParked: 0, day: -1 });
export const joinersOf = (s: GameState): JoinerState => (s.joiners ??= newJoiners());

const idx = (s: GameState, id: string) => s.people.findIndex(p => p.id === id);
const present = (s: GameState, i: number) => { const n = s.personState[i]?.needs; return !!n && n.died == null && !n.taken; };
const usd = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
const usdK = (n: number) => (n >= 10_000 ? `$${Math.round(n / 1000)}k` : n >= 1000 ? `$${(Math.round(n / 100) / 10).toString()}k` : usd(n));
const hashId = (id: string) => { let h = 2166136261; for (const c of id) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0; return h; };

// ─────────────────────────────────────────────────────────────────────────
// What they bring
// ─────────────────────────────────────────────────────────────────────────

/** Savings on hand by kind of stranger: [low, high] dollars (cash they carry or can reach; pooled the day they come in). */
const CASH: Record<string, [number, number]> = {
  nurse: [4000, 15000], mechanic: [3000, 12000], family: [2000, 9000], hiker: [400, 1500], veteran: [2000, 9000], teen: [0, 0], drifter: [150, 900],
  traveler: [1000, 6000], couple: [6000, 25000], brothers: [3000, 12000], lineman: [6000, 20000], friend: [3000, 14000],
};
/** The share of those who have a rig, and which kind, by kind of stranger. */
const RIG_ODDS: Record<string, number> = { kin: 0.12, family: 0.1, couple: 0.16, veteran: 0.08, drifter: 0.05, friend: 0.04, nurse: 0.03 };
/** The share who arrive with a good pickup (the mechanic already has his old one). */
const PICKUP_ODDS: Record<string, number> = { kin: 0.2, family: 0.18, couple: 0.22, brothers: 0.3, lineman: 0.3, friend: 0.08, veteran: 0.1 };
/** Who is likely to carry a gun (a hunting rifle, a shotgun or a pistol). */
const GUN_ODDS: Record<string, number> = { kin: 0.15, veteran: 0.45, brothers: 0.7, hiker: 0.25, family: 0.12, couple: 0.12, lineman: 0.2, mechanic: 0.15, friend: 0.1 };

/** Tools a person's trade and skills bring (sim/tools.ts JOB_KITS), a few of them. */
export function toolsFor(people: readonly Person[], r: () => number): ToolKind[] {
  const out = new Set<ToolKind>();
  const adults = people.filter(p => !p.kid);
  for (const p of adults) {
    for (const k of JOB_KITS[(p.job as { id?: string } | undefined)?.id ?? ''] ?? []) if (r() < 0.8) out.add(k);
    const sk = (id: SkillId) => p.skills[id] ?? 0;
    if (sk('builder') >= 6) { out.add('circular_saw'); out.add('hammer'); if (sk('builder') >= 8) out.add('cordless_drill'); }
    if (sk('mechanic') >= 6) { out.add('wrench_set'); if (r() < 0.5) out.add('file'); }
    if (sk('gardener') >= 6) { out.add('garden_fork'); if (r() < 0.5) out.add('hoe'); }
    if (sk('hunter') >= 6 && r() < 0.6) out.add('axe');
  }
  return [...out].filter(k => TOOLS[k] && !TOOLS[k].crude).slice(0, 5);
}

/** Add to a stranger's or relative's carry what the rest of the system does not already say: cash, trade tools, a vehicle or a rig, food, a gun. Seeded. */
export function rollKit(s: GameState, people: readonly Person[], r: () => number, arche: string, base: { brings?: Partial<Stock>; extras?: Extras } = {}): { brings: Partial<Stock>; extras: Extras } {
  const brings: Partial<Stock> = { ...(base.brings ?? {}) };
  const extras: Extras = { ...(base.extras ?? {}) };
  const adults = people.filter(p => !p.kid);
  if (!adults.length) return { brings, extras };
  const [lo, hi] = CASH[arche] ?? [1500, 8000];
  if (hi > 0 && extras.cash == null) {
    extras.cash = Math.round((lo + (hi - lo) * r() * r()) / 100) * 100;
    // now and then a couple who sold the house
    if ((arche === 'couple' || arche === 'family') && r() < 0.08) extras.cash += Math.round((50_000 + 90_000 * r()) / 1000) * 1000;
  }
  const tools = [...new Set([...(extras.tools ?? []), ...toolsFor(people, r)])];
  if (tools.length) extras.tools = tools;
  // a vehicle: only up to the fleet's own limit for the kind
  const fleet = fleetOf(s);
  const has = (k: VehicleKind) => fleet.filter(v => v.kind === k).length;
  const rigOdds = RIG_ODDS[arche] ?? 0;
  if (r() < rigOdds) {
    extras.rig = arche !== 'family' && r() < 0.4 ? 'rv_camper' : 'travel_trailer';
    // a travel trailer is pulled by a pickup
    if (extras.rig === 'travel_trailer' && !extras.vehicle && has('pickup') < VEHICLES.pickup.max) extras.vehicle = 'pickup';
  }
  if (!extras.vehicle && r() < (PICKUP_ODDS[arche] ?? 0) && has('pickup') < VEHICLES.pickup.max) extras.vehicle = 'pickup';
  if (extras.vehicle && has(extras.vehicle) >= VEHICLES[extras.vehicle].max) delete extras.vehicle;
  if (extras.dogs == null && r() < 0.05) extras.dogs = 1;
  // food and supplies
  if (!brings.canned && r() < 0.4) brings.canned = 1 + Math.floor(r() * 3);
  if (r() < 0.3) brings.staples = (brings.staples ?? 0) + 1;
  if (r() < 0.25) brings.hygiene = (brings.hygiene ?? 0) + 1;
  if (extras.vehicle && r() < 0.5) brings.fuel = (brings.fuel ?? 0) + 2;
  // a legal gun
  if (r() < (GUN_ODDS[arche] ?? 0.05)) {
    const ok = GUNS.filter(m => !m.nfa && !m.assault && !m.contraband && (groupOf(m) === 'hunting' || groupOf(m) === 'handgun') && !stateBan(s, m));
    if (ok.length) extras.guns = [pick(r, ok).id];
  }
  return { brings, extras };
}

/** Days of food a party brings for itself. */
export function foodDays(brings: Partial<Stock> | undefined, people: readonly Pick<Person, 'kid' | 'age'>[]): number {
  const kcal = FOODS.reduce((a, f) => a + (brings?.[f] ?? 0) * KCAL[f], 0);
  const need = people.reduce((a, p) => a + needOf(p), 0);
  return need > 0 ? kcal / need : 0;
}
const foodWords = (d: number) => (d >= 10 ? `${Math.round(d / 7)} weeks of food` : `${Math.max(1, Math.round(d))} days of food`);

const VEH_WORD: Partial<Record<string, string>> = { pickup: 'a pickup', old_pickup: 'an old pickup', suv: 'an SUV' };

/** The pieces of what a party brings, in the order the card lists them: [short, long]. */
export function kitItems(brings: Partial<Stock> | undefined, extras: Extras | undefined, people: readonly Pick<Person, 'kid' | 'age'>[]): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  if (extras?.cash) out.push([usdK(extras.cash), `${usd(extras.cash)} in savings, pooled with the family's the day they come in`]);
  const tools = extras?.tools ?? [];
  if (tools.length >= 3) out.push(['a tool kit', `tools: ${tools.map(t => TOOLS[t].name.toLowerCase()).join(', ')}`]);
  else for (const t of tools) out.push([`a ${TOOLS[t].name.toLowerCase()}`, `a ${TOOLS[t].name.toLowerCase()}`]);
  if (extras?.vehicle) out.push([VEH_WORD[extras.vehicle] ?? 'a vehicle', `${VEH_WORD[extras.vehicle] ?? 'a vehicle'} (joins the fleet${extras.vehicle === 'old_pickup' ? '; not much gas in it' : ''})`]);
  if (extras?.rig) out.push([`their ${RIG_NAME[extras.rig]}`, `their own ${RIG_NAME[extras.rig]}, a place to sleep that can drive away`]);
  const fd = foodDays(brings, people);
  if (fd >= 1) out.push([foodWords(fd), `${foodWords(fd)} for themselves (cans, staples)`]);
  const other = (Object.entries(brings ?? {}) as Array<[keyof Stock, number]>).filter(([k, n]) => n > 0 && !(FOODS as string[]).includes(k as string) && k !== 'tent');
  const sup = other.filter(([k]) => ['meds', 'fuel', 'hygiene', 'hardware', 'vehicle_parts', 'lids', 'feed', 'seed', 'seed_heirloom'].includes(k as string));
  if (sup.length) out.push(['supplies', `supplies: ${sup.map(([k, n]) => `${n} ${MATERIALS[k as MaterialId]?.name.toLowerCase() ?? k}`).join(', ')}`]);
  const live = other.filter(([k]) => ['goat', 'sheep', 'rabbit'].includes(k as string));
  if (live.length) out.push([live.map(([k, n]) => `${n} ${k}`).join(' and '), `livestock: ${live.map(([k, n]) => `${n} ${k}`).join(', ')}`]);
  if ((brings?.tent ?? 0) > 0) out.push(['a tent', 'a tent']);
  if (extras?.guns?.length) out.push([extras.guns.length === 1 ? 'a gun' : `${extras.guns.length} guns`, `${extras.guns.map(g => GUN[g]?.name ?? g).join(', ')} (legal to own; not on any shop's books)`]);
  if (extras?.dogs) out.push([extras.dogs === 1 ? 'a dog' : `${extras.dogs} dogs`, extras.dogs === 1 ? 'a dog' : `${extras.dogs} dogs`]);
  return out;
}

/** "$22k, a tool kit, a pickup, 3 weeks of food" (at most five pieces; the rest is on "more"). */
export function kitLine(brings: Partial<Stock> | undefined, extras: Extras | undefined, people: readonly Pick<Person, 'kid' | 'age'>[]): string {
  const it = kitItems(brings, extras, people).map(x => x[0]);
  if (!it.length) return 'what is on their backs';
  return it.length > 5 ? `${it.slice(0, 5).join(', ')} and more` : it.join(', ');
}
/** The same in full, one line each. */
export const kitDetail = (brings: Partial<Stock> | undefined, extras: Extras | undefined, people: readonly Pick<Person, 'kid' | 'age'>[]): string[] => kitItems(brings, extras, people).map(x => x[1]);

/** The cash a party carries (relatives: their savings, while the banks work). */
export function purseOf(e: Pick<Encounter, 'extras' | 'kin'>): number {
  return (e.extras?.cash ?? 0) + (e.kin?.savings ?? 0);
}

/** Put what they carry into the family's: cash, tools, a pickup into the fleet, a legal gun. Returns the log lines. */
export function pool(s: GameState, extras: Extras | undefined, r: () => number): string[] {
  const lines: string[] = [];
  if (!extras) return lines;
  if (extras.cash) { s.money += extras.cash; lines.push(`${usd(extras.cash)} goes into the family account.`); }
  if (extras.vehicle && extras.vehicle !== 'old_pickup') {
    const vs = fleetOf(s), def = VEHICLES[extras.vehicle];
    if (vs.filter(v => v.kind === extras.vehicle).length < def.max) {
      const mile = 80_000 + Math.floor(r() * 90_000);
      vs.push({ id: `v${Math.max(0, ...vs.map(v => Number(v.id.slice(1)) || 0)) + 1}`, kind: extras.vehicle, mileage: mile, condition: 0.45 + 0.35 * r(), fuel: 20 + Math.floor(r() * 30), oilAt: mile - 1500, serviceAt: mile - 1800 });
      syncParking(s);
      lines.push(`Their ${def.name.toLowerCase()} goes in the yard with the others.`);
    }
  }
  for (const m of extras.guns ?? []) {
    const model = GUN[m];
    if (!model || model.nfa || model.contraband || stateBan(s, model)) continue;   // the law decides, not the card
    s.armory.guns.push({ id: `g${s.nextId++}`, model: m, condition: 0.6 + 0.35 * r(), fired: 0, where: s.stock.gun_safe >= 1 ? 'safe' : 'house', carrier: null });
    s.armory.ammo[model.cal] = (s.armory.ammo[model.cal] ?? 0) + (model.cal === '22lr' ? 100 : 20 + Math.floor(r() * 20));
    lines.push(`${model.name}, with a little ammunition: theirs, and legal. It is not on any shop's books.`);
  }
  return lines;
}

// ─────────────────────────────────────────────────────────────────────────
// Where they sleep: the options
// ─────────────────────────────────────────────────────────────────────────

export interface StayOption {
  kind: StayKind;
  /** Short name for the radio row. */
  label: string;
  /** One line: cost, time, consequence. */
  line: string;
  /** The longer answer (tooltip). */
  tip: string;
  /** Why it cannot be chosen (null: it can). */
  off: string | null;
}

/** The smallest home the family can build that sleeps `n`. */
export function ownBuildKind(n: number): string | null {
  return (['guest_house', 'cottage', 'timber_cabin', 'log_house'] as const).find(k => HOME_BEDS[k] >= n) ?? null;
}
const KIND_NAME: Record<string, string> = { guest_house: 'guest house', cottage: 'cottage', timber_cabin: 'timber cabin', log_house: 'log house', moms_house: 'Mom’s house', modular_home: 'modular home', travel_trailer: 'travel trailer', rv_camper: 'RV' };
const kindName = (k: string) => KIND_NAME[k] ?? k.replace(/_/g, ' ');

const purchasable = (kind: string): OrderLine[] => (Object.entries(totalBill(BLUEPRINTS[kind])) as Array<[MaterialId, number]>).filter(([m]) => MATERIALS[m].price !== null).map(([material, qty]) => ({ material, qty }));

/** What a modular home costs delivered and set: the unit and the pad materials from the price table, the county's fee. */
export function modularQuote(s: GameState): { lines: OrderLine[]; cost: number; permit: number; total: number; days: number } {
  const lines = purchasable('modular_home');
  const cost = orderCost(lines, prices(s));
  const permit = needsPermit('modular_home') && s.paper.permits && countyWorks(s) ? permitFee(s, 'modular_home') : 0;
  const hours = totalHours(BLUEPRINTS.modular_home);
  return { lines, cost, permit, total: cost + permit, days: Math.round(hours / 6 / 3) + 8 };
}

/** The same for a cabin the family builds. */
export function ownBuildQuote(s: GameState, kind: string, workers: number): { lines: OrderLine[]; cost: number; hours: number; days: number; permit: number } {
  const lines = purchasable(kind);
  const hours = totalHours(BLUEPRINTS[kind]);
  const permit = needsPermit(kind) && s.paper.permits && countyWorks(s) ? permitFee(s, kind) : 0;
  return { lines, cost: orderCost(lines, prices(s)), hours, days: Math.ceil(hours / (Math.max(1, workers) * 6.5)), permit };
}

const adultsOf = (people: readonly Person[]) => people.filter(p => !p.kid);
/** How many hands the build would have: the family's working adults plus the joiners'. */
function handsFor(s: GameState, people: readonly Person[]): number {
  const mine = s.people.filter((p, i) => present(s, i) && !p.kid && !(p.elder && p.age >= 75)).length;
  return mine + adultsOf(people).filter(p => !(p.elder && p.age >= 75)).length;
}

/** A finished guest house, cottage or Mom's house with room for the whole party (they get a door of their own). */
export function dwellingFor(s: GameState, n: number): { id: string; name: string } | null {
  for (const o of placeOptions(s, n)) {
    const st = s.structures.find(x => x.id === o.id);
    if (st && SEPARATE_DWELLINGS.has(st.kind)) return { id: st.id, name: kindName(st.kind) };
  }
  return null;
}

/** The options on the join card for this party, best first. */
export function stayOptions(s: GameState, e: Pick<Encounter, 'people' | 'extras' | 'brings' | 'kind' | 'kin'>): StayOption[] {
  const people = e.people ?? [];
  const n = people.length;
  if (!n) return [];
  const out: StayOption[] = [];
  const plan = cachedPlan(s);
  const purse = purseOf(e);
  const banks = s.disaster.tracks.banks >= 0.5;
  const kin = e.kind === 'kin';
  const cash = kin ? (banks ? purse : 0) : purse;

  // 1. a spare bed
  const free = plan.bedsFree;
  const dw = dwellingFor(s, n);
  out.push({ kind: 'bed', label: dw ? `The ${dw.name}` : 'A spare bed', off: null,
    line: dw ? `Free, today · a door of their own, ${free} bed${free === 1 ? '' : 's'} free in all` : free >= n ? `Free, today · ${free} bed${free === 1 ? '' : 's'} free` : `Free, today · only ${free} bed${free === 1 ? '' : 's'} free: the rest on couches and the floor`,
    tip: `They sleep wherever the housing plan finds room: beds first, then couches, floor bags, tents. A guest house or cottage with beds left is used first for relatives and elders. ${free >= n ? 'There is room.' : 'Crowding wears on sleep and morale.'}` });

  // 2. their own rig
  if (e.extras?.rig) {
    const rig = e.extras.rig, beds = HOME_BEDS[rig];
    out.push({ kind: 'rig', label: `Their ${RIG_NAME[rig]}`, off: null,
      line: `Free, today · parked on a pad${beds < n ? `, sleeps ${beds} (the rest in tents)` : ''}; hooks up within ~70 m; drives off with them`,
      tip: `Their ${RIG_NAME[rig]} sleeps ${beds}. It is parked on a gravel pad near the house (or where you put it, from the build menu), joins the water and power lines on its own if they are within about 70 m, and leaves with its owners if they go. ${beds < n ? `${n - beds} would sleep in tents.` : 'It frees a bed in the house.'} No permit: it is a vehicle, not a building.` });
  }

  // 3. a modular home they buy
  {
    const q = modularQuote(s), p = orderProblem(s, q.lines);
    const short = q.total - cash;
    out.push({ kind: 'modular', label: 'A modular home they buy', off: kin && !banks ? 'the banks are closed: no dealer will deliver' : p === 'no_deliveries' ? 'nobody is delivering now' : short > 0 ? `needs ${usd(q.total)}; they have ${usd(cash)}` : null,
      line: `${usd(q.total)} from their money · about ${q.days} days · tents till it is set`,
      tip: `A factory-built one-bedroom home (14 × 32 ft, sleeps 3): the unit ${usd(MATERIALS.modular_unit.price ?? 0)} delivered and set, plus the pad and piers${q.permit ? `, plus the county permit ${usd(q.permit)}` : ''}. Their savings pay for it; the family does the pad and hookups. The crane day is the only wait. Until it is set they sleep in tents.` });
  }

  // 4. they build their own
  {
    const k = ownBuildKind(n);
    if (!k) out.push({ kind: 'own_build', label: 'They build their own', off: 'too many for one small cabin', line: '', tip: '' });
    else {
      const q = ownBuildQuote(s, k, handsFor(s, people)), builder = Math.max(0, ...adultsOf(people).map(p => p.skills.builder));
      out.push({ kind: 'own_build', label: `They build a ${kindName(k)}`, off: null,
        line: `${usd(q.cost + q.permit)} of materials${cash >= q.cost ? ', paid from their money' : cash > 0 ? `, ${usd(cash)} from theirs` : ', from your stores'} · about ${Math.max(1, Math.round(q.days / 7))} weeks · tents till then`,
        tip: `A ${kindName(k)} (sleeps ${HOME_BEDS[k]}): ${Math.round(q.hours)} person-hours through the usual stages, with everyone pitching in. Their own hands count${builder >= 5 ? ` (the best builder of them is at ${builder})` : ''}. Their savings buy the materials where they can; the stockpile covers the rest. Until it is finished they sleep in tents.` });
    }
  }

  // 5. built by the family first (relatives only)
  if (kin) {
    const waitDays = s.disaster.phase === 'warning' ? 75 : 150;
    out.push({ kind: 'player_build', label: 'You build them a place first', off: null,
      line: `Your materials and crew · they wait up to ${waitDays} days in town · they come anyway if it hits first`,
      tip: `Stake a guest house, a cottage or Mom’s house (Build → Home & work) and the family builds it from the stockpile. They are tagged as waiting for it, move in the day it is finished, and give up and make other plans if it takes too long. If the heat comes first, they come anyway and take whatever room there is.` });
  }

  // 6. a tent
  {
    const f = Math.round(plan.night.lowF);
    out.push({ kind: 'tent', label: 'A tent for now', off: null,
      line: `Free, today · ${Math.ceil(n / TENT_SEATS)} tent${n > TENT_SEATS ? 's' : ''} in the yard · ${f >= 50 ? 'fine this time of year' : f >= 32 ? 'cold nights' : 'too cold: do not'}`,
      tip: `They pitch a tent in the yard (lows around ${f}°F tonight). It is free and does not use a bed; storms and cold nights are hard on it, and a stove-heated wall tent is better than a camping tent.` });
  }
  return out;
}

/** What is chosen when nobody has picked: their own rig if there is one and the beds are short, else a bed. */
export function defaultStay(s: GameState, e: Pick<Encounter, 'people' | 'extras' | 'brings' | 'kind' | 'kin' | 'stay'>): StayKind {
  const opts = stayOptions(s, e);
  if (e.stay && opts.some(o => o.kind === e.stay && !o.off)) return e.stay;
  const n = e.people?.length ?? 0;
  if (e.extras?.rig && cachedPlan(s).bedsFree < n + 1) return 'rig';
  return 'bed';
}

// ─────────────────────────────────────────────────────────────────────────
// Finding a spot (the world re-checks it against the terrain once: `spotted`)
// ─────────────────────────────────────────────────────────────────────────

const rects = (s: GameState) => s.structures.filter(st => !st.unplaced && KIT[st.kind] && KIT[st.kind].level !== 'underground').map(st => footprint(KIT[st.kind], st.x, st.z, st.rot));
const hits = (a: { x0: number; z0: number; x1: number; z1: number }, b: { x0: number; z0: number; x1: number; z1: number }, m: number) => a.x0 < b.x1 + m && a.x1 > b.x0 - m && a.z0 < b.z1 + m && a.z1 > b.z0 - m;

/** The centre of the place: the finished homes, else anything standing, else the origin. */
export function anchorOf(s: GameState): { x: number; z: number } {
  const homes = s.structures.filter(st => !st.unplaced && isFinished(st) && HOME_BEDS[st.kind] > 0);
  const list = homes.length ? homes : s.structures.filter(st => !st.unplaced);
  if (!list.length) return { x: 0, z: 0 };
  return { x: list.reduce((a, st) => a + st.x, 0) / list.length, z: list.reduce((a, st) => a + st.z, 0) / list.length };
}

/** A pad for `kind` near the house and within reach of the lines (pure; ring search around the place). */
export function autoSpot(s: GameState, kind: string): { x: number; z: number; rot: number } | null {
  const def = KIT[kind];
  if (!def) return null;
  const c = anchorOf(s), taken = rects(s);
  const nodes = s.structures.filter(st => !st.unplaced && isFinished(st));
  let best: { x: number; z: number; rot: number } | null = null, bestScore = Infinity;
  for (let r = 2.5; r <= 14; r += 0.5) {
    for (let a = 0; a < 20; a++) {
      const th = a / 20 * Math.PI * 2 + r * 0.37;
      const x = Math.round((c.x + Math.cos(th) * r) / CELL) * CELL, z = Math.round((c.z + Math.sin(th) * r) / CELL) * CELL;
      for (const rot of [0, 1]) {
        const fp = footprint(def, x, z, rot);
        if (taken.some(t => hits(fp, t, 0.5))) continue;
        if (!ownsAt(s, fp.x0, fp.z0) || !ownsAt(s, fp.x1, fp.z1) || !ownsAt(s, x, z)) continue;
        // near the lines: the closest finished home or well is what it hooks up to
        const near = Math.min(Infinity, ...nodes.map(n => Math.hypot(n.x - x, n.z - z) - (NODE_R[n.kind] ?? 0.4)));
        const score = r + (near > AUTO_REACH ? 20 : 0);
        if (score < bestScore) { bestScore = score; best = { x, z, rot }; }
      }
    }
    if (best && bestScore < r) break;
  }
  return best;
}

// ─────────────────────────────────────────────────────────────────────────
// Settling in
// ─────────────────────────────────────────────────────────────────────────

/** Mark a structure as made for these people, at a spot the sim picked (the world re-checks it once). */
function stakeFor(s: GameState, kind: string, ids: string[], stay: StayKind): Structure | null {
  const spot = autoSpot(s, kind);
  if (!spot) return null;
  const st: Structure = { id: `s${s.nextId++}`, kind, x: spot.x, z: spot.z, rot: spot.rot, stage: 0, done: 0, supplied: false, finishedAt: null };
  st.joiner = { ids, kind: stay, spotted: false };
  s.structures.push(st);
  log(s, `Staked out a ${kindName(kind)} for ${ids.map(i => s.people.find(p => p.id === i)?.first ?? '').filter(Boolean).join(' and ')}.`);
  applyForPermit(s, st);
  joinersOf(s).stays.push({ ids, kind: stay, structure: st.id, day: dayIndex(s.clock.t) });
  return st;
}

/** A rig arrives finished on a pad. `st.rig` says whose it is. */
export function parkRig(s: GameState, kind: RigKind, owners: string[], spot?: { x: number; z: number; rot: number }): Structure | null {
  const sp = spot ?? autoSpot(s, kind);
  if (!sp) return null;
  const bp = BLUEPRINTS[kind];
  const st: Structure = { id: `s${s.nextId++}`, kind, x: sp.x, z: sp.z, rot: sp.rot, stage: bp.stages.length, done: 0, supplied: true, finishedAt: s.clock.t };
  st.rig = { owners, kind, since: dayIndex(s.clock.t) };
  if (!spot) st.joiner = { ids: owners, kind: 'rig', spotted: false };
  s.structures.push(st);
  joinersOf(s).rigsParked++;
  moveInto(s, st, owners);
  return st;
}

/** Give the sleepers a bed in this home (as many as it holds, adults first). */
export function moveInto(s: GameState, st: Structure, ids: string[]): string[] {
  const beds = HOME_BEDS[st.kind] ?? 0;
  const taken = s.people.filter((p, i) => p.home === st.id && present(s, i)).length;
  const who = ids.map(id => s.people[idx(s, id)]).filter((p): p is Person => !!p).sort((a, b) => Number(a.kid) - Number(b.kid));
  const moved: string[] = [];
  for (const p of who) { if (taken + moved.length >= beds) break; p.home = st.id; moved.push(p.first); }
  return moved;
}

/**
 * Carry out the choice for people who just joined (they are already in s.people): the rig is parked, the modular home ordered and staked,
 * the cabin staked, the tent pitched. Returns lines for the card. `purse` is the cash that came with them (already pooled).
 */
export function settleStay(s: GameState, people: readonly Person[], stay: StayKind, e: Pick<Encounter, 'extras' | 'kin' | 'kind' | 'placeRig'>, purse: number): string[] {
  const lines: string[] = [];
  const ids = people.map(p => p.id);
  const day = dayIndex(s.clock.t);
  const J = joinersOf(s);
  const tents = (n: number) => { const t = Math.ceil(n / TENT_SEATS); s.stock.tent += t; return t; };
  if (stay === 'rig' && e.extras?.rig) {
    const kind = e.extras.rig;
    if (e.placeRig) {
      J.waiting.push({ id: `w${s.nextId++}`, kind, owners: ids, day });
      lines.push(`Their ${RIG_NAME[kind]} waits at the gate for a pad: place it from Build → Home & work. Meanwhile they sleep in tents.`);
      tents(people.length);
      return lines;
    }
    const st = parkRig(s, kind, ids);
    if (st) {
      const over = people.length - HOME_BEDS[kind];
      lines.push(`Their ${RIG_NAME[kind]} backs onto a pad by the house${over > 0 ? `; ${over} sleep${over === 1 ? 's' : ''} in a tent` : ''}.`);
      if (over > 0) tents(over);
    } else { lines.push(`There is no room for their ${RIG_NAME[kind]} on your land; they sleep in tents.`); tents(people.length); }
    return lines;
  }
  if (stay === 'modular') {
    const q = modularQuote(s);
    const st = s.money >= q.total && !orderProblem(s, q.lines) ? stakeFor(s, 'modular_home', ids, 'modular') : null;
    if (st) {
      placeOrder(s, q.lines);
      // the permit fee was charged by the family's account when it was staked: it is theirs to pay
      lines.push(`They buy a modular home with their own money (${usd(q.total)}) and the dealer sets a delivery date. About ${q.days} days; tents till then.`);
    } else lines.push('They could not manage a modular home after all; they stay in tents for now.');
    tents(people.length);
    return lines;
  }
  if (stay === 'own_build') {
    const k = ownBuildKind(people.length);
    const st = k ? stakeFor(s, k, ids, 'own_build') : null;
    if (st && k) {
      const bill = purchasable(k);
      // their cash buys the materials where the shop will have it
      if (purse > 0 && !orderProblem(s, bill) && orderCost(bill, prices(s)) <= purse + 0.5 * s.money) {
        placeOrder(s, bill);
        lines.push(`They stake a ${kindName(k)} and order the materials with their own money.`);
      } else lines.push(`They stake a ${kindName(k)}; the stockpile covers the materials.`);
      lines.push('Everyone pitches in; tents till it is finished.');
    } else lines.push('There is no room to build for them just yet; they stay in tents.');
    tents(people.length);
    return lines;
  }
  if (stay === 'bed') {
    const dw = dwellingFor(s, people.length);
    if (dw && e.kind !== 'kin') { givePlace(s, people[0].id, dw.id); }
    return lines;
  }
  if (stay === 'tent') { const t = tents(people.length); lines.push(`${t === 1 ? 'A tent goes' : `${t} tents go`} up in the yard.`); return lines; }
  void e;
  return lines;
}

/** A rig placed by hand from the build menu: the first waiting rig is claimed and arrives finished. Returns true if it was one of theirs. */
export function claimWaitingRig(s: GameState, st: Structure): boolean {
  const J = joinersOf(s);
  if (!isRig(st.kind)) return false;
  const w = J.waiting.find(x => x.kind === st.kind) ?? J.waiting[0];
  if (!w) return false;
  J.waiting = J.waiting.filter(x => x !== w);
  st.kind = w.kind;
  st.stage = BLUEPRINTS[w.kind].stages.length; st.done = 0; st.supplied = true; st.finishedAt = s.clock.t;
  st.rig = { owners: w.owners, kind: w.kind, since: dayIndex(s.clock.t) };
  J.rigsParked++;
  const moved = moveInto(s, st, w.owners);
  log(s, `The ${RIG_NAME[w.kind]} is parked on the pad you chose${moved.length ? `: ${moved.join(' and ')} move in` : ''}.`);
  return true;
}

/** A home staked by hand while relatives wait for a place: it is theirs. Returns true if it was claimed. */
export function claimForWaiting(s: GameState, st: Structure, waiting: Array<{ ids: string[]; build?: string }>): boolean {
  if (!(HOME_BEDS[st.kind] > 0) || isRig(st.kind) || st.pre) return false;
  const w = waiting.find(x => !x.build);
  if (!w) return false;
  w.build = st.id;
  st.joiner = { ids: w.ids, kind: 'player_build', spotted: true };
  log(s, `The ${kindName(st.kind)} you staked is for the ones who are waiting.`);
  return true;
}

/** The owners of a rig move out: the rig leaves with them. */
export function rigLeaves(s: GameState, id: string): string | null {
  const st = s.structures.find(x => x.rig && x.rig.owners.includes(id));
  if (!st || !st.rig) return null;
  const stays = st.rig.owners.some(o => { const i = idx(s, o); return o !== id && i >= 0 && present(s, i); });
  if (stays) return null;
  s.structures = s.structures.filter(x => x !== st);
  for (const p of s.people) if (p.home === st.id) delete p.home;
  const J = joinersOf(s);
  J.stays = J.stays.filter(x => x.structure !== st.id);
  const msg = `The ${RIG_NAME[st.rig.kind]} pulls out of the yard.`;
  log(s, msg);
  return msg;
}

/** Once a day: whoever's home was built (or delivered) for them moves in when it is finished. Returns log lines. */
export function joinersDay(s: GameState): string[] {
  const J = joinersOf(s), day = dayIndex(s.clock.t);
  if (J.day === day) return [];
  J.day = day;
  const out: string[] = [];
  for (const st of [...J.stays]) {
    const home = st.structure ? s.structures.find(x => x.id === st.structure) : undefined;
    const living = st.ids.filter(id => { const i = idx(s, id); return i >= 0 && present(s, i); });
    if (!home) { J.stays = J.stays.filter(x => x !== st); continue; }    // taken down, burned, or the world dropped it
    if (!living.length) { J.stays = J.stays.filter(x => x !== st); continue; }
    if (st.kind === 'player_build' || !isFinished(home)) continue;
    const moved = moveInto(s, home, living);
    J.stays = J.stays.filter(x => x !== st);
    if (moved.length) out.push(`${moved.join(' and ')} move into the ${kindName(home.kind)}${st.kind === 'own_build' ? ' they built' : st.kind === 'modular' ? ' they bought' : ''}: a door of their own.`);
    // the tent they used comes down
    s.stock.tent = Math.max(0, s.stock.tent - Math.ceil(living.length / TENT_SEATS));
  }
  return out;
}

/** The stays still waiting on a building, for the Family tab: "Ruth and Tom: a cottage, 40 % done". */
export function pendingStays(s: GameState): Array<{ names: string; kind: StayKind; what: string; pct: number }> {
  const J = joinersOf(s);
  const out: Array<{ names: string; kind: StayKind; what: string; pct: number }> = [];
  for (const st of J.stays) {
    const home = st.structure ? s.structures.find(x => x.id === st.structure) : undefined;
    if (!home) continue;
    const bp = BLUEPRINTS[home.kind];
    const total = bp.stages.reduce((a, x) => a + x.hours, 0);
    const done = bp.stages.slice(0, home.stage).reduce((a, x) => a + x.hours, 0) + home.done;
    out.push({ names: st.ids.map(i => s.people.find(p => p.id === i)?.first ?? '').filter(Boolean).join(' and '), kind: st.kind, what: kindName(home.kind), pct: Math.round(Math.min(1, done / total) * 100) });
  }
  return out;
}

/** The skills seed for a deterministic roll when none is passed (kept for tests). */
export const kitSeed = (s: GameState, id: string, day: number) => mulberry32(s.seed * 7919 + day * 31 + hashId(id));
void SKILL_IDS; void addTool;
