/**
 * First-time-player guidance (docs/DECISIONS.md, "UX pass"): which Build
 * items are usable right now and why not, what the next sensible one is,
 * what the bunker needs, what the plans still lack, and how the Perimeter
 * list groups by price. Pure (tested); the HUD only draws it.
 */
import { sanitationLine, worstWell } from './sanitation';
import { BUNKER_ENTRANCES } from './bunkerEntrances';
import { KIT } from '../game/buildkit/kit';
import { homeBeds, isHome } from './blueprints';
import { daysOfFood } from './needs';
import { enclosure } from './enclosure';
import { hardenCost } from './hardening';
import { blueprintOf, isFinished, planProblem } from './construction';
import { countyWorks, needsPermit, permitFee, reviewDays } from './paperwork';
import { onOrder, orderCost, prices } from './economy';
import { firewoodOutlook } from './heating';
import { UTILITY } from './utilities';
import { fmtKw } from './powerReport';
import { anyBearing } from './orchard';
import { needsHookup, storageTip } from './hookups';
import { MATERIAL_IDS, MATERIALS, type MaterialId } from './materials';
import { PERIMETER, PERIMETER_ORDER, UPGRADE_NEXT, fenceLive, runBill, runFinished, wallLength, type PerimeterKind, type Pt } from './perimeter';
import { MAX_TOWERS, ringStatus } from './fortress';
import { canHostWalkway } from './walkway';
import { roadGateStatus } from './roadGate';
import type { GameState, OrderLine } from './state';
import { SEPARATE_DWELLINGS, housingShortfall } from './housing';
import { joinNames } from './kin';
import { hasMaples, woodsTaps } from './maple';
import { seedWarning } from './crops';
import { CARETAKER, CARETAKER_KINDS, caretakerProblem, marketFactor, saleBlock, saleQuote, SETTLE_DAYS, type CaretakerKind } from './weekender';
import { CREW_DAY_USD, crewIdea, nextLongStay, nextStageOrder, weekendBudget, weekendsFor } from './weekendPlan';
import { dayIndex } from './state';
import { tension } from './disaster';
import { faithOf, moodSummary, resting } from './mind';
import { COURSES, COURSE_MODE_NAME, bestMode, courseIdea, skillsGoalSteps, type CourseId, type CourseMode } from './courses';
import { eveningGaps, restockNeeds } from './evenings';
import { medReport } from './medical';
import { pharmacyOpen } from './body';
import { gatheringProblem, type GatheringKind } from './gatherings';
import { terrainCards, terrainOff } from './terrainFx';
import { gradeBucket, roadDifficulty, winterRoadLine } from './slope';
import { terraceSite, terraceText } from './terrace';
import { restackPallets, slumped, wallOf } from './retaining';

const usd = (n: number) => '$' + Math.round(n).toLocaleString('en-US');

// ── what the plans still need ──

/** Materials the plans still lack: every unbuilt stage, run and hardening job, less the stockpile and what is on order. */
export function plansNeed(s: GameState): Partial<Record<MaterialId, number>> {
  const need: Partial<Record<MaterialId, number>> = {};
  const add = (bill: Partial<Record<MaterialId, number>>) => { for (const [k, n] of Object.entries(bill) as Array<[MaterialId, number]>) need[k] = (need[k] ?? 0) + n; };
  for (const st of s.structures) {
    if (isFinished(st)) continue;
    blueprintOf(st).stages.forEach((sg, i) => {
      if (i < st.stage || (i === st.stage && st.supplied)) return;
      add(sg.materials);
    });
  }
  for (const r of s.perimeter) if (!runFinished(r) && !r.supplied) add(runBill(r.kind, wallLength(r)));
  for (const j of s.hardenJobs) {
    const st = s.structures.find(x => x.id === j.building);
    if (j.finishedAt !== null || j.supplied || !st) continue;
    add(hardenCost(st.kind, j.upgrade, j.tier).materials);
  }
  const pending = onOrder(s);
  const out: Partial<Record<MaterialId, number>> = {};
  for (const k of MATERIAL_IDS) {
    const n = Math.ceil((need[k] ?? 0) - s.stock[k] - (pending[k] ?? 0) - 1e-6);
    if (n > 0) out[k] = n;
  }
  return out;
}

/** The buyable part of `plansNeed` as order lines (own logs and spoil are not for sale). */
export function plansNeedLines(s: GameState): OrderLine[] {
  const need = plansNeed(s);
  return MATERIAL_IDS.filter(k => (need[k] ?? 0) > 0 && MATERIALS[k].price !== null).map(k => ({ material: k, qty: need[k]! }));
}

export const plansNeedCost = (s: GameState, factor = 1): number => orderCost(plansNeedLines(s), factor);

// ── the bunker ──

export { BUNKER_ENTRANCES } from './bunkerEntrances';
const bunkerKinds = (s: GameState) => s.structures.filter(st => st.kind.startsWith('bunker_'));

export interface BunkerCheck { id: string; label: string; done: boolean; /** Staked out and being built, but not finished (so not done yet). */ building: boolean; /** What to build for it. */ kind: string; detail: string }

/** What the bunker needs right now, in the order to do it: the way down, beds for everyone, air, food, a medic's corner. */
export function bunkerChecklist(s: GameState): BunkerCheck[] {
  // a step counts only when the room is built (finished), not when it is only staked out
  const staked = bunkerKinds(s), rooms = staked.filter(isFinished);
  const has = (...kinds: string[]) => rooms.some(r => kinds.includes(r.kind));
  const going = (...kinds: string[]) => !has(...kinds) && staked.some(r => kinds.includes(r.kind));
  const beds = rooms.reduce((a, r) => a + (KIT[r.kind]?.shelters ?? 0), 0);
  const bedsStaked = staked.reduce((a, r) => a + (KIT[r.kind]?.shelters ?? 0), 0);
  const people = Math.max(1, s.people.length);
  const note = (b: boolean, d: string) => (b ? `staked out, still being built: ${d}` : d);
  return [
    { id: 'entrance', label: 'A way down', done: has(...BUNKER_ENTRANCES), building: going(...BUNKER_ENTRANCES), kind: 'bunker_hatch', detail: note(going(...BUNKER_ENTRANCES), 'a hatch, a stairwell, or a hatch in the house floor; every room grows from it') },
    { id: 'beds', label: `Beds for ${people}`, done: beds >= people, building: beds < people && bedsStaked > beds, kind: people <= 4 ? 'bunker_container' : 'bunker_dorm', detail: `${beds} of ${people} places built${bedsStaked > beds ? `, ${bedsStaked - beds} more staked out` : ''}` },
    { id: 'air', label: 'Clean air and power', done: has('bunker_plant'), building: going('bunker_plant'), kind: 'bunker_plant', detail: note(going('bunker_plant'), 'the plant room: NBC filter, batteries, a 2,000 L water tank') },
    { id: 'food', label: 'Food and water put by', done: has('bunker_stores', 'bunker_galley'), building: going('bunker_stores', 'bunker_galley'), kind: 'bunker_stores', detail: note(going('bunker_stores', 'bunker_galley'), 'a storeroom (or a galley)') },
    { id: 'medical', label: 'A medic\'s corner', done: has('bunker_medical'), building: going('bunker_medical'), kind: 'bunker_medical', detail: note(going('bunker_medical'), 'a medical bay, for wounds in a long stay') },
  ];
}

/** The first thing the bunker still lacks (null = it has everything on the list). */
export const bunkerNext = (s: GameState): BunkerCheck | null => bunkerChecklist(s).find(c => !c.done) ?? null;

// ── the Build list: greyed or ready, and the next step ──

export interface BuildAdvice {
  /** A short reason it cannot be staked yet (null = it can). */
  off: string | null;
  /** The one to do next in its group. */
  next: boolean;
  /** A line under the name (a hint, a permit, what is missing), or null. */
  note: string | null;
}

const hasKind = (s: GameState, ...kinds: string[]) => s.structures.some(st => kinds.includes(st.kind));
const hasPower = (s: GameState) => !!s.site.improvements?.power || hasKind(s, 'solar_array', 'garage_solar', 'lodge_solar', 'generator_shed', 'battery_shed');

/** What to order for people who are strained: wearing-thin restocks first, then the evenings' missing goods (a strained child wants toys and picture books). At most three lines. */
export function moodOrderLines(s: GameState, mood: ReturnType<typeof moodSummary>): OrderLine[] {
  const lines: OrderLine[] = [];
  const addLine = (material: MaterialId) => { if (!lines.some(l => l.material === material) && lines.length < 3) lines.push({ material, qty: 1 }); };
  restockNeeds(s).forEach(addLine);
  const kidStrain = mood.struggling.some(x => x.p.kid);
  for (const g of eveningGaps(s)) {
    if (g === 'games') addLine(g);
    else if ((g === 'instrument' || g === 'novels') && mood.struggling.length >= 2) addLine(g);
    else if ((g === 'toys' || g === 'picture_books') && kidStrain) addLine(g);
  }
  return lines;
}

/** One thing worth doing now, from what the place lacks. A suggestion, never a requirement: nothing is locked behind it. */
export type SuggestionAct =
  | { type: 'stake'; kind: string }
  | { type: 'order'; lines: OrderLine[] }
  | { type: 'markTrees'; n: number }
  | { type: 'select'; id: string }
  | { type: 'tool'; tool: string }
  | { type: 'caretaker'; kind: CaretakerKind }
  | { type: 'belt'; on: boolean }
  | { type: 'crew'; id: string }
  | { type: 'open'; right: 'family' | 'supplies' | 'utilities' | 'land' | 'defense' | 'outside' | 'chronicle'; supplies?: 'stores' | 'farm' }
  | { type: 'moveIn' }
  | { type: 'restDay' }
  | { type: 'quarantine'; on: boolean }
  | { type: 'rx' }
  | { type: 'gather'; kind: GatheringKind }
  /** Show the terrain overlay in this mode (the land's suggestions: sim/terrainFx.ts). */
  | { type: 'terrain'; mode: 'high' | 'lanes' | 'water' }
  | { type: 'enroll'; course: CourseId; pid: string; mode: CourseMode; teacher?: string }
  | { type: 'drills'; perWeek: 1 | 2 | 3 }
  /** Lay a tunnel-bridge across the gorge the land invites (the player confirms). */
  | { type: 'span'; a: Pt; b: Pt; /** The kind to lay (default: the tunnel-bridge). */ kind?: 'tunnel_bridge' | 'rock_tunnel' }
  /** Lay a drainage channel along the contour above a building cut into a slope (the player confirms). */
  | { type: 'drain'; a: Pt; b: Pt }
  /** Stake terraced garden beds down a slope, each on its own walled terrace (sim/terrace.ts; the player confirms). */
  | { type: 'terraces'; tiers: Pt[] };
export interface Suggestion {
  id: string;
  /** The kit piece to stake ('' when the suggestion is something else). */
  kind: string;
  why: string;
  urgency: number;
  /** Headline when it is not a kit piece. */
  title?: string;
  /** One-click buttons. When absent, a kit suggestion has "Stake it". */
  acts?: Array<{ label: string; act: SuggestionAct }>;
}

/**
 * What is most pressing right now (at most three), read from the state of the
 * place: no roof, someone without a bed, no water, no food in the pantry or
 * growing, no toilet, no power. There is no fixed route; once something is
 * staked or built it stops being suggested.
 */
/** What the lie of the land asks for (sim/slope.ts, sim/retaining.ts): a retaining wall for a pad cut into a slope, the stone to restack one that came down, a plow before the snow. */
export function landSuggestions(s: GameState): Suggestion[] {
  const out: Suggestion[] = [];
  // the lie of the land (sim/slope.ts): a pad cut into a slope wants a retaining wall; a steep or high road wants a plow before the snow
  { const bucket = (st: { grade?: number }) => (st.grade ? gradeBucket(st.grade) : 0);
    const cut = s.structures.find(st => !isFinished(st) && bucket(st) >= 2 && st.stage <= 1);
    if (cut) {
      const extra = 2 * bucket(cut) ** 2, name = cut.kind.replace(/_/g, ' '), pending = onOrder(s), wall = wallOf(s, cut);
      const short = Math.max(0, Math.ceil(extra - Math.max(0, s.stock.fieldstone - 0) - (pending.fieldstone ?? 0)));
      const lines: OrderLine[] = short > 0 ? [{ material: 'fieldstone', qty: short }] : [];
      out.push({ id: 'retaining', kind: '', title: 'This slope needs a retaining wall', urgency: 58,
        why: `the ${name} is staked on a ${Math.round((cut.grade ?? 0) * 100)} % slope: the pad is cut into the hill and held by a dry-stack wall${wall ? ` (up to ${Math.round(wall.heightM * 10) / 10} m high and ${Math.round(wall.lenM)} m long, with ${wall.stairs ? 'a stair' : 'no stair'} set in it${wall.tall ? '; a wall that tall wants a drainage channel above it' : ''})` : ''}, about ${extra} pallets of fieldstone more than level ground${short > 0 ? '' : ' (you have them)'}. The wall goes up with the foundation and is paid for by those pallets`,
        acts: [...(lines.length ? [{ label: `Order ${short} pallet${short > 1 ? 's' : ''} of fieldstone (${usd(orderCost(lines, prices(s)))})`, act: { type: 'order' as const, lines } }] : []), { label: 'Show me', act: { type: 'select', id: cut.id } }] });
    }
    // a retaining wall that let go (sim/retaining.ts): the stone to put it back
    const down = slumped(s)[0];
    if (down) {
      const need = restackPallets(down.w), have = s.stock.fieldstone, pending = onOrder(s), short = Math.max(0, Math.ceil(need - have - (pending.fieldstone ?? 0)));
      const lines: OrderLine[] = short > 0 ? [{ material: 'fieldstone', qty: short }] : [];
      out.push({ id: 'wall_down', kind: '', title: 'A retaining wall came down', urgency: 61,
        why: `the wall behind the ${down.st.kind.replace(/_/g, ' ')} let go: ${need} pallet${need > 1 ? 's' : ''} of fieldstone to restack it${short > 0 ? '' : ' (you have them: the family does it in a few days)'}. A drainage channel above a tall wall stops it happening again`,
        acts: [...(lines.length ? [{ label: `Order ${short} pallet${short > 1 ? 's' : ''} of fieldstone (${usd(orderCost(lines, prices(s)))})`, act: { type: 'order' as const, lines } }] : []), { label: 'Show me', act: { type: 'select', id: down.st.id } }] });
    }
    const doy = ((s.clock.startDoy + Math.floor(s.clock.t) - 1) % 365 + 365) % 365 + 1;
    if (s.stock.plow < 1 && roadDifficulty(s.site, s.seed) >= 1 && doy >= 230 && doy <= 345) {
      const lines: OrderLine[] = [{ material: 'plow', qty: 1 }];
      out.push({ id: 'plow', kind: '', title: 'The road closes in snow: buy a plow', urgency: 56,
        why: `${winterRoadLine(s) ?? 'the way in is steep and high'} A plow blade on the truck keeps the road open and the deliveries coming`,
        acts: [{ label: `Order a plow blade (${usd(orderCost(lines, prices(s)))})`, act: { type: 'order', lines } }] });
    } }
  return out;
}

/** A slope near the home that suits terraced garden beds, each on its own walled terrace (sim/terrace.ts): a card to confirm, never staked unasked. */
export function terraceSuggestion(s: GameState): Suggestion | null {
  const tp = terraceSite(s);
  if (!tp) return null;
  return { id: 'terraces', kind: '', title: 'A slope that suits terraced garden beds', urgency: 22, why: terraceText(tp),
    acts: [{ label: `Stake ${tp.tiers.length} terraced beds (~${usd(tp.usd)} of fieldstone for the walls)`, act: { type: 'terraces', tiers: tp.tiers.map(t => [t.x, t.z] as Pt) } }, { label: 'Show me on the map', act: { type: 'terrain', mode: 'high' } }] };
}

export function suggestions(s: GameState): Suggestion[] {
  const people = s.people.length;
  const homes = s.structures.filter(st => isHome(st.kind));
  const beds = homeBeds(s);
  const out: Suggestion[] = [];
  const add = (id: string, kind: string, why: string, urgency: number) => { if (!buildOff(s, kind)) out.push({ id, kind, why, urgency }); };
  if (homes.length === 0) add('roof', 'timber_cabin', 'no roof over the family yet', 100);
  else if (beds < people && homes.every(h => structDone(h))) add('beds', 'cottage', `${people - beds} of ${people} have no bed`, 80);
  // relatives waiting on a place of their own (sim/kin.ts): a guest house for one or two, Mom's house for more
  const wait = s.kin?.waiting ?? [];
  if (wait.length && !s.structures.some(st => SEPARATE_DWELLINGS.has(st.kind) && !isFinished(st))) {
    const n = wait.reduce((a, w) => a + w.people.length, 0);
    add('kin_home', n > 2 ? 'moms_house' : 'guest_house', `${joinNames(wait.flatMap(w => w.people.map(p => p.first)))} ${n === 1 ? 'is' : 'are'} waiting for a place of their own`, 85);
  }
  if (!hasKind(s, 'well_hand', 'well_drilled', 'cistern', 'water_tower')) add('water', s.site.gwDepth > 9 ? 'well_drilled' : 'well_hand', s.site.gwDepth > 9 ? `no water on the place (it is ${s.site.gwDepth} m down: drill)` : 'no water on the place', 90);
  // a home that lost its roof (chimney fire, storm, looters): re-roof it before anything else, the family should not winter in tents
  { const bare = homes.find(h => h.roofLost && !isFinished(h));
    if (bare) {
      const need = blueprintOf(bare).stages[bare.stage]?.materials ?? {}, pending = onOrder(s);
      const lines: OrderLine[] = (Object.entries(need) as Array<[MaterialId, number]>)
        .map(([material, n]) => ({ material, qty: Math.ceil(n - (bare.supplied ? n : s.stock[material]) - (pending[material] ?? 0) - 1e-6) }))
        .filter(l => l.qty > 0 && MATERIALS[l.material].price !== null);
      const name = bare.kind.replace(/_/g, ' ');
      out.push({ id: 'reroof', kind: '', title: 'Re-roof your home', urgency: 97,
        why: lines.length ? `the ${name} lost its roof and the family cannot live in it; the roof needs ${lines.map(l => `${l.qty} ${MATERIALS[l.material].name.toLowerCase()}`).join(' and ')} more` : `the ${name} lost its roof; the crew is on it, and it is the first thing to finish`,
        acts: [...(lines.length ? [{ label: `Order the roof materials (${usd(orderCost(lines, prices(s)))})`, act: { type: 'order' as const, lines } }] : []), { label: 'Show me', act: { type: 'select', id: bare.id } }] });
    } }
  const growing = hasKind(s, 'garden', 'field', 'greenhouse', 'orchard');
  if (!growing) add('food', 'garden', daysOfFood(s) < 90 ? 'little food put by and nothing growing' : 'nothing growing yet', daysOfFood(s) < 90 ? 70 : 45);
  if (!hasKind(s, 'outhouse', 'septic')) add('toilet', 'outhouse', 'nowhere to go', 50);
  { const ww = worstWell(s);   // a privy or a manure yard too near a well (sim/sanitation.ts)
    if (ww) out.push({ id: 'well_close', kind: '', title: 'Your well is too close to the privy', urgency: ww.risk >= 0.8 ? 38 : 30,   // a slow hazard: below the cards that need doing now (plow 56, caretaker 44-66)
      why: `${sanitationLine(ww)}. Move the ${ww.source!.kind.replace(/_/g, ' ')} (or drill a cased well, or keep a filter and fuel to boil)`,
      acts: [{ label: 'Show me', act: { type: 'select', id: ww.source!.id } }] }); }
  if (!hasPower(s)) add('power', 'solar_array', 'no power for the pump, lights and the freezer', 40);
  if (growing && !hasKind(s, 'root_cellar')) add('cellar', 'root_cellar', 'nowhere cool to keep what you grow', 30);
  if (hasMaples(s) && woodsTaps(s) >= 60 && hasKind(s, 'timber_cabin', 'log_house', 'farmhouse', 'lodge', 'lodge_solar', 'stone_house', 'timber_frame') && !hasKind(s, 'sugar_shack')) add('sugar', 'sugar_shack', `the woods have maples for ${woodsTaps(s)} taps: late-winter syrup`, 14);
  if (hasKind(s, 'field') && hasKind(s, 'root_cellar') && !hasKind(s, 'wood_oven')) add('oven', 'wood_oven', 'the wheat and flour want an oven: bread and roasts without heating the house', 18);

  // fields with no seed to sow: a weedy forty percent is what they get (sim/crops.ts)
  { const sw = seedWarning(s);
    if (sw) {
      const n = Math.max(1, sw.fields), hybrid: OrderLine[] = [{ material: 'seed', qty: n }], heirloom: OrderLine[] = [{ material: 'seed_heirloom', qty: n }];
      out.push({ id: 'seed', kind: '', title: sw.tone === 'bad' && /came up/.test(sw.text) ? 'Fields came up weedy' : 'Seed for the fields', urgency: sw.tone === 'bad' ? 83 : 67, why: sw.text,
        acts: [{ label: `Order ${n} hybrid (${usd(orderCost(hybrid, prices(s)))})`, act: { type: 'order', lines: hybrid } }, { label: `${n} heirloom (${usd(orderCost(heirloom, prices(s)))})`, act: { type: 'order', lines: heirloom } }, { label: 'Open the Farm tab', act: { type: 'open', right: 'supplies', supplies: 'farm' } }] });
    } }

  out.push(...landSuggestions(s));

  // the woodpile: out in the cold, or too thin for the next two months
  { const w = firewoodOutlook(s);
    if (w.short >= 1 && (w.coldNow || w.have < 2 || w.short >= 4)) {
      const n = Math.max(2, Math.min(10, Math.ceil(w.short)));
      const cost = orderCost([{ material: 'firewood', qty: n }], prices(s));
      const lines: OrderLine[] = [{ material: 'firewood', qty: n }];
      out.push({ id: 'firewood', kind: '', title: 'Firewood', urgency: w.coldNow && w.have < 1 ? 85 : 55,
        why: w.have < 1 ? (w.coldNow ? 'out of firewood on a cold night' : 'no firewood put by for the cold months') : `${Math.floor(w.have)} rick${Math.floor(w.have) === 1 ? '' : 's'} put by, about ${Math.ceil(w.need)} needed for the next two months`,
        acts: [{ label: `Order ${n} rick${n > 1 ? 's' : ''} ($${Math.round(cost).toLocaleString('en-US')})`, act: { type: 'order', lines } }, { label: 'Mark 10 trees', act: { type: 'markTrees', n: 10 } }] });
    } }

  // finished is not working: wire it, plumb it, join it to the line
  { const todo = needsHookup(s);
    if (todo.length) {
      const first = todo[0], name = first.name.replace(/_/g, ' ');
      out.push({ id: 'hookup', kind: '', title: `Finish the ${name}`, urgency: first.kind === 'wire' || first.kind === 'plumb' ? 75 : 62,
        why: `${first.text.toLowerCase()}${todo.length > 1 ? `; ${todo.length - 1} more building${todo.length > 2 ? 's' : ''} are not working yet either` : ''}`,
        acts: [{ label: 'Show me', act: { type: 'select', id: first.id } }, ...(first.tool ? [{ label: 'Draw the line', act: { type: 'tool' as const, tool: first.tool } }] : [])] });
    } }
  { const tip = storageTip(s);
    if (tip && !buildOff(s, tip.kind)) add('storage', tip.kind, tip.why, 58); }
  // the weekender (sim/weekender.ts): who looks after the place on weekdays, and when to move in
  const wk = s.weekend;
  if (wk?.mode === 'split') {
    const animals = ['goat', 'pig', 'steer', 'sheep', 'rabbit'].some(a => ((s.stock as unknown as Record<string, number>)[a] ?? 0) >= 1) || hasKind(s, 'chicken_coop');
    const crops = hasKind(s, 'garden', 'field', 'greenhouse', 'greenhouse_heated', 'orchard', 'orchard_grove', 'pond');
    if (!wk.caretaker && (animals || crops || s.structures.some(isFinished))) {
      const acts = CARETAKER_KINDS.filter(k => !caretakerProblem(s, k)).map(k => ({ label: `${CARETAKER[k].name} (${usd(CARETAKER[k].perMonth)}/mo)`, act: { type: 'caretaker' as const, kind: k } }));
      out.push({ id: 'caretaker', kind: '', title: 'A caretaker for the weekdays', urgency: animals || crops ? 66 : 44,
        why: animals ? 'the animals go unfed five days a week, and an empty place is six times as likely to be broken into' : crops ? 'the garden and the greenhouse go untended all week, and an empty place is six times as likely to be broken into' : 'an empty place is six times as likely to be broken into as one with people in it',
        ...(acts.length ? { acts } : {}) });
    }
    out.push(...weekenderPlan(s));
    const warned = s.disaster.kind && s.disaster.phase === 'warning';
    if (warned) {
      const q = saleQuote(s), blocked = saleBlock(s);
      out.push({ id: 'move_in', kind: '', title: 'Move in now?', urgency: 96,
        why: `the warning signs are out and the family still lives in town${q && !blocked ? `; the house would sell for about ${usd(q.net)} after the mortgage, at ${Math.round(marketFactor(s) * 100)} % of its worth and falling` : blocked ? `; the house cannot be sold now (${blocked})` : ''}`,
        acts: [{ label: 'Decide now', act: { type: 'moveIn' } }] });
    } else if (s.disaster.kind && tension(s.disaster, s.clock.t) > 0 && wk.asked === 0) {
      out.push({ id: 'move_in', kind: '', title: 'Think about moving in', urgency: 50, why: 'the longer they wait the less the town house is worth, and the harder it is to get out', acts: [{ label: 'See the numbers', act: { type: 'moveIn' } }] });
    }
  }
  // medical: an illness going round (keep the sick apart?), what the sick are missing, medicines running low
  { const med = medReport(s);
    if (med.epidemic && !med.epidemic.asked && med.epidemic.cases >= 1) {
      out.push({ id: 'epidemic', kind: '', title: med.epidemic.kind === 'flu' ? 'The flu is going round' : 'Dysentery in the house', urgency: 79,
        why: `${med.epidemic.cases} sick so far. Keeping the sick apart${med.bay ? ' in the medical bay' : ' in a spare room'} slows it a lot, at the cost of the one who nurses them and a lonely few days`,
        acts: [{ label: 'Keep the sick apart', act: { type: 'quarantine', on: true } }, { label: 'Carry on as we are', act: { type: 'quarantine', on: false } }] });
    }
    if (med.needs.length) {
      const lines: OrderLine[] = [];
      if (med.needs.some(x => x.includes('antibiotics')) && s.disaster.tracks.stores >= 0.5) lines.push({ material: 'antibiotics', qty: 2 });
      if (med.needs.some(x => x.includes('splint'))) lines.push({ material: 'splints', qty: 1 });
      if (med.needs.some(x => x.includes('rehydration'))) lines.push({ material: 'ors', qty: 1 });
      if (med.needs.some(x => x.includes('dressings'))) lines.push({ material: 'meds', qty: 1 });
      out.push({ id: 'sick', kind: '', title: 'The sick need care', urgency: 74, why: med.needs.slice(0, 2).join('; '),
        ...(lines.length && s.disaster.tracks.deliveries >= 0.25 ? { acts: [{ label: `Order ${lines.map(l => MATERIALS[l.material].name.toLowerCase()).join(', ')} (${usd(orderCost(lines, prices(s)))})`, act: { type: 'order' as const, lines } }] } : {}) });
    }
    const low = s.people.filter((p, i) => p.conditions?.length && s.personState[i]?.needs.died == null && (s.body.rx[p.id] ?? 30) < 21);
    if (low.length && pharmacyOpen(s)) out.push({ id: 'rx', kind: '', title: 'Medicine running low', urgency: 56, why: `${joinNames(low.map(p => p.first))} ${low.length === 1 ? 'has' : 'have'} under three weeks of medicine and the pharmacy is still open`, acts: [{ label: 'Fill prescriptions 90 days ahead', act: { type: 'rx' } }] });
  }
  // people: someone who is not coping, or badly strained (sim/mind.ts). Rest, company and the evenings' goods are the answers.
  { const mood = moodSummary(s);
    if (mood.struggling.length) {
      const top = mood.struggling[0], ps = s.mind?.psyche[top.p.id];
      const names = joinNames(mood.struggling.slice(0, 3).map(x => x.p.first));
      const acts: NonNullable<Suggestion['acts']> = [];
      if (!resting(s)) acts.push({ label: 'Take a rest day', act: { type: 'restDay' } });
      if (!gatheringProblem(s, 'campfire')) acts.push({ label: 'Campfire tonight', act: { type: 'gather', kind: 'campfire' } });
      if (!gatheringProblem(s, 'service') && s.people.some((p, i) => s.personState[i]?.needs.died == null && faithOf(s, p))) acts.push({ label: 'Hold a service', act: { type: 'gather', kind: 'service' } });
      const lines = moodOrderLines(s, mood);
      if (lines.length && s.disaster.tracks.stores >= 0.5) acts.push({ label: `Order ${lines.map(l => MATERIALS[l.material].name.toLowerCase()).join(' and ')} (${usd(orderCost(lines, prices(s)))})`, act: { type: 'order', lines } });
      out.push({ id: 'mood', kind: '', title: mood.breaking ? `${names}: not coping` : `${names}: under strain`, urgency: mood.breaking ? 77 : 48,
        why: `${top.why}${ps?.weighs?.length ? `; mostly ${ps.weighs.slice(0, 2).map(w => w[0]).join(' and ')}` : ''}. Rest, company and an evening off help more than pushing on`,
        ...(acts.length ? { acts } : {}) });
    } }
  // the land: a ridge that suits a keep, a gorge that is a choke, a bench for a reservoir (sim/terrainFx.ts): a card to look at, never a requirement
  for (const c of terrainCards(s)) out.push({ id: c.id, kind: '', title: c.title, urgency: c.urgency, why: c.why, acts: [{ label: 'Show me on the map', act: { type: 'terrain', mode: c.mode } }, ...(c.span ? [{ label: `Plan a tunnel-bridge across it (~${usd(costPer100m('tunnel_bridge') * c.span.lengthM / 100)})`, act: { type: 'span' as const, a: c.span.a, b: c.span.b } }] : []), ...(c.bore ? [{ label: `Plan a rock tunnel (${c.bore.lengthM} m, ~${usd(costPer100m('rock_tunnel') * c.bore.lengthM / 100)})`, act: { type: 'span' as const, kind: 'rock_tunnel' as const, a: c.bore.a, b: c.bore.b } }] : []), ...(c.drain ? [{ label: `Plan a drainage channel (~${usd(costPer100m('drain_channel') * Math.hypot(c.drain.b[0] - c.drain.a[0], c.drain.b[1] - c.drain.a[1]) * 6 / 100)})`, act: { type: 'drain' as const, a: c.drain.a, b: c.drain.b } }] : [])] });
  { const t = terraceSuggestion(s); if (t) out.push(t); }   // a slope that suits terraced beds: offered, never staked unasked
  { const c = courseSuggestion(s); if (c) out.push(c); }
  { const d = drillsSuggestion(s); if (d) out.push(d); }
  return out.sort((x, y) => y.urgency - x.urgency).slice(0, 3);
}

/** A course worth taking (sim/courses.ts): a skill the place lacks that an evening class would give, with a one-click start when a way is open. Never required. */
export function courseSuggestion(s: GameState): Suggestion | null {
  const idea = courseIdea(s);
  if (!idea) return null;
  const def = COURSES[idea.course], p = s.people.find(x => x.id === idea.pid)!, mode = bestMode(s, idea.course, idea.pid);
  const acts: NonNullable<Suggestion['acts']> = [];
  if (mode) acts.push({ label: `${p.first} takes it ${COURSE_MODE_NAME[mode.mode]}${mode.mode === 'online' ? ` ($${def.online})` : ''}`, act: { type: 'enroll', course: idea.course, pid: p.id, mode: mode.mode, ...(mode.teacher ? { teacher: mode.teacher } : {}) } });
  else if (s.stock[def.book] < 1 && s.disaster.tracks.deliveries >= 0.25) {
    const lines: OrderLine[] = [{ material: def.book, qty: 1 }];
    acts.push({ label: `Order the book set (${usd(orderCost(lines, prices(s)))})`, act: { type: 'order', lines } });
  }
  return { id: 'course', kind: '', title: `A course: ${def.name.toLowerCase()}`, urgency: 36, why: `${idea.why}; ${p.first} could take the ${def.hours}-hour course in the evenings (it ends with a certificate)`, ...(acts.length ? { acts } : {}) };
}

/** Drills for the defense: the household has guns and has never run a drill. */
export function drillsSuggestion(s: GameState): Suggestion | null {
  const D = s.courses?.drills;
  const armed = s.armory.guns.length > 0, danger = s.disaster.phase === 'warning' || s.disaster.phase === 'impact' || s.disaster.phase === 'survival';
  if (!armed || !danger || (D && (D.perWeek > 0 || D.last != null || Object.keys(D.ready).length > 0))) return null;
  return { id: 'drills', kind: '', title: 'Run drills', urgency: 38, why: 'the family has guns and has never practiced together; a weekly hour at the range steadies the aim and cuts the seconds frozen at the alarm (it spends about 15 rounds a person)',
    acts: [{ label: 'Drill weekly', act: { type: 'drills', perWeek: 1 } }, { label: 'Twice a week', act: { type: 'drills', perWeek: 2 } }] };
}

/**
 * The weekender's first weeks and every week after (docs/DECISIONS.md, "Weekender cash pacing"): money is the limit before hours are,
 * so these cards say what to order first (a stage at a time, not the whole list), how to use the long stays, when a crew is worth
 * hiring for the weekdays, and when to tighten the belt in town.
 */
export function weekenderPlan(s: GameState): Suggestion[] {
  const w = s.weekend;
  const out: Suggestion[] = [];
  if (!w || w.mode !== 'split' || s.disaster.phase === 'impact' || s.disaster.phase === 'survival') return out;
  const day = dayIndex(s.clock.t);
  const budget = weekendBudget(s);
  const stay = nextLongStay(s.clock.startDoy, s.clock.startYear, day);
  const soon = stay && stay.startDay - day <= 12 ? stay : null;
  // 1. what to order: one stage (two in the free first week and before a long stay), so the account keeps a month's bills
  const home = s.structures.find(st => isHome(st.kind));
  const ahead = day < SETTLE_DAYS + 3 || soon ? 2 : 1;
  const next = nextStageOrder(s, ahead);
  if (next) {
    const names = next.stages.map(x => x.name.toLowerCase()).join(', then ');
    const weekends = weekendsFor(s, next.hours);
    const first = day < SETTLE_DAYS + 3 ? ' The first week is yours to build in: the whole family is on the place until the second Friday.' : '';
    const can = s.money >= next.cost;
    const blocking = !!home && !isFinished(home) && next.id === home.id;   // the house is the one waiting on materials
    out.push({ id: 'wk_order', kind: '', title: `Order the ${next.name}: ${names}`, urgency: blocking || !home ? 88 : 62,
      why: `${next.hours} h of work${weekends ? `, about ${weekends} weekend${weekends === 1 ? '' : 's'} at your pace` : ''}, and it needs ${usd(next.cost)} of materials${can ? '' : ` (you have ${usd(s.money)}: a stage at a time is all the account allows)`}. Ordering a stage ahead of the weekend keeps every hour on the place for building, and keeps the rest of the cash for the next stage.${first}`,
      acts: [{ label: `Order it (${usd(next.cost)})`, act: { type: 'order', lines: next.lines } }, { label: 'Show me', act: { type: 'select', id: next.id } }] });
  }
  // 2. the long stays are the weekender's best building days
  if (soon) {
    out.push({ id: 'wk_stay', kind: '', title: `${soon.name}: ${soon.days} days on the place`, urgency: 58,
      why: `from ${soon.label} (${soon.startDay - day <= 0 ? 'now' : `in ${soon.startDay - day} days`}). That is more building than three ordinary weekends: have the next stage on site before then (an order takes a few days to arrive), and keep the chores light so the hours go to the walls.`,
      ...(next ? { acts: [{ label: `Order the next stage (${usd(next.cost)})`, act: { type: 'order' as const, lines: next.lines } }] } : {}) });
  }
  // 3. a crew works the weekdays while the family is at its jobs
  const crew = crewIdea(s);
  if (crew && s.money >= Math.min(crew.usd, 4 * CREW_DAY_USD) + 6000) {
    const nm = crew.st.kind.replace(/_/g, ' ');
    out.push({ id: 'wk_crew', kind: '', title: `Hire a crew for the weekdays: the ${nm}`, urgency: 60,
      why: `${Math.round(crew.hours)} h left, about ${usd(crew.usd)} and ${crew.weeks} week${crew.weeks === 1 ? '' : 's'} of a crew of four (${usd(CREW_DAY_USD)} a day, billed only for the hours they work). They build Monday to Friday while you are at the jobs, so the weekend crew's hours are doubled. They go home when the money does.`,
      acts: [{ label: `Hire the crew (about ${usd(crew.usd)})`, act: { type: 'crew', id: crew.st.id } }, { label: 'Show me', act: { type: 'select', id: crew.st.id } }] });
  }
  // 4. the belt: when the account barely moves
  if (budget && !budget.belt && budget.beltSaves > 600 && budget.net < 4000 && s.money < 200_000) {
    out.push({ id: 'wk_belt', kind: '', title: 'Tighten the belt in town', urgency: 64,
      why: `the jobs bring in about ${usd(budget.wages)} a month and the groceries, the bills and ${budget.rented ? 'the rent' : 'the town house'}${budget.caretaker ? ' and the caretaker' : ''} take ${usd(budget.living + budget.town + budget.caretaker)}: the account moves ${budget.net >= 0 ? 'only ' : 'down '}${usd(Math.abs(budget.net))} a month. Cutting the town upkeep and the weekday extras saves about ${usd(budget.beltSaves)} a month, at some cost to the family's mood on weekdays. It is a dial you can turn back (Family tab, Two homes).`,
      acts: [{ label: `Tighten the belt (saves ~${usd(budget.beltSaves)}/mo)`, act: { type: 'belt', on: true } }] });
  }
  return out;
}

const structDone = (st: GameState['structures'][number]): boolean => isFinished(st);

export interface Goal { id: string; title: string; steps: Array<{ label: string; done: boolean; detail: string }> }

/** The two endgame goals, always shown, never required: a closed and hardened compound, and a bunker underneath. */
export function longTerm(s: GameState, drive?: readonly Pt[]): Goal[] {
  const line = enclosure(s, s.clock.t);
  const lineRuns = s.perimeter.filter(r => runFinished(r) && line.onLine.has(r.id));
  const best = lineRuns.reduce<PerimeterKind | null>((a, r) => (!a || PERIMETER[r.kind].blocks.people > PERIMETER[a].blocks.people ? r.kind : a), null);
  const closed = line.openShare === 0 && line.creekOpen === 0;
  const rg = roadGateStatus(s, drive), ring = ringStatus(s), solid = s.perimeter.some(r => canHostWalkway(r.kind));
  const towers = s.structures.filter(st => (st.kind === 'rise_lookout' || st.kind.startsWith('watchtower')) && isFinished(st)).length;
  const enclose: Goal = { id: 'enclose', title: 'Enclose the compound', steps: [
    { label: 'Wall the property line', done: closed, detail: closed ? 'the line is closed all round' : line.openShare >= 1 ? 'nothing on the line yet' : `${Math.round(line.openShare * 100)}% of the line is open${line.creekOpen ? ' and the creek is unbarred' : ''}` },
    { label: 'Gate at the road', done: rg.crossing > 0 && rg.missing === 0, detail: rg.crossing === 0 ? 'a gate goes where the driveway meets the wall (laid in with Wall my property or Fortify my ring, or free in a wall you draw)' : rg.missing === 0 ? (rg.garage ? 'the drive runs in through the gate garage' : 'a gate where the driveway comes through the wall') : `${rg.missing} wall${rg.missing > 1 ? 's' : ''} across the driveway with no gate (Defense tab: cut one)` },
    { label: 'Upgrade the walls', done: !!best && PERIMETER[best].blocks.people >= 0.7, detail: best ? `${PERIMETER[best].name.toLowerCase()} now${UPGRADE_NEXT[best] ? `, next: ${PERIMETER[UPGRADE_NEXT[best]!].name.toLowerCase()}` : ', the top of the chain'}` : 'a hard wall stops people far better than wire' },
    { label: 'Watch towers', done: towers > 0, detail: towers ? `${towers} standing${towers < MAX_TOWERS ? `, up to ${MAX_TOWERS} on the corners and mid-spans` : ''}` : `a place to see them coming from: up to ${MAX_TOWERS} on the ring (Fortify my ring)` },
    { label: 'Wall-top walkway', done: ring.walkway, detail: ring.walkway ? 'guards walk the top of the wall' : solid ? 'a deck on the wall: guards see farther and fight from above (Defense tab)' : 'needs a container, steel or concrete wall under it' },
    { label: 'Gate garage', done: ring.garage, detail: ring.garage ? 'part of the closed line; the vehicles park inside it' : 'a garage built into the wall at the gate (Fortify my ring, or the Build menu)' },
  ] };
  const bunker: Goal = { id: 'bunker', title: 'A bunker underneath', steps: bunkerChecklist(s).map(c => ({ label: c.label, done: c.done, detail: c.detail })) };
  const goals = [enclose, bunker];
  if (s.weekend?.mode === 'split') goals.unshift(movingIn(s));
  // room for the family: only once there are relatives (or elders) to make room for
  const rel = s.people.some(p => p.rel || p.elder) || (s.kin?.away.length ?? 0) > 0 || (s.kin?.waiting.length ?? 0) > 0;
  if (rel) {
    const sf = housingShortfall(s);
    const own = s.structures.filter(st => SEPARATE_DWELLINGS.has(st.kind) && isFinished(st)).length;
    goals.push({ id: 'family', title: 'Room for the family', steps: [
      { label: 'A bed for everyone', done: sf.noBed === 0, detail: sf.noBed === 0 ? 'nobody on a couch or in a tent' : `${sf.noBed} without a bed` },
      { label: 'A place of their own for the old', done: own > 0, detail: own ? `${own} separate ${own === 1 ? 'dwelling' : 'dwellings'}` : 'a guest house, a cottage or Mom\u2019s house: elders and relatives sleep and live better with a front door of their own' },
    ] });
  }
  goals.push({ id: 'skills', title: 'Skills the place needs', steps: skillsGoalSteps(s) });
  goals.push(selfSufficient(s));
  return goals;
}

/** The weekender's goal (shown while the family splits its week): be ready to live here, and decide about the town house. */
export function movingIn(s: GameState): Goal {
  const w = s.weekend!;
  const homes = s.structures.filter(st => isHome(st.kind) && isFinished(st)).length;
  return { id: 'moving', title: 'Move in full time', steps: [
    { label: 'A caretaker for the weekdays', done: !!w.caretaker, detail: w.caretaker ? CARETAKER[w.caretaker.kind].name.toLowerCase() : 'the animals, the garden and the doors, five days a week' },
    { label: 'A finished home with a bed for everyone', done: homes > 0 && homeBeds(s) >= s.people.length, detail: homes ? `${homeBeds(s)} of ${s.people.length} beds` : 'a roof you can live under all week' },
    { label: 'Food put by for 90 days', done: daysOfFood(s) >= 90, detail: `${Math.round(Math.min(daysOfFood(s), 999))} days put by` },
    { label: 'Water and power that run themselves', done: hasKind(s, 'well_drilled', 'well_hand', 'cistern', 'water_tower') && hasPower(s), detail: 'the pump and the freezers keep running while you are away' },
    { label: 'Decide about the town house', done: w.town.status === 'sold', detail: w.town.status === 'sold' ? 'sold' : `worth ${usd(w.town.value * marketFactor(s))} now, with ${usd(w.town.mortgage)} owed; it sells for less every week the signs grow` },
  ] };
}

/** The third goal, always shown, never required: feed and power the compound from its own land (the self-sufficient interior). */
export function selfSufficient(s: GameState): Goal {
  const fin = s.structures.filter(isFinished);
  const kw = fin.reduce((a, st) => a + (UTILITY[st.kind]?.solarKw ?? 0), 0), kwh = fin.reduce((a, st) => a + (UTILITY[st.kind]?.batteryKwh ?? 0), 0);
  const has = (...k: string[]) => fin.some(st => k.includes(st.kind));
  const bearing = anyBearing(s);
  const stocked = Object.values(s.farm?.ponds ?? {}).some(p => p.trout + p.crayfish > 0);
  return { id: 'self', title: 'Feed and power the compound', steps: [
    { label: '20 kW of solar', done: kw >= 20, detail: kw > 0 ? `${fmtKw(kw)} of 20 kW built` : 'a solar farm of 50 panels' },
    { label: 'Battery storage', done: kwh >= 40, detail: kwh > 0 ? `${Math.round(kwh)} kWh of 40 built` : 'a battery container beside the array' },
    { label: 'A heated greenhouse', done: has('greenhouse_heated'), detail: 'fresh greens all winter' },
    { label: 'An orchard bearing fruit', done: bearing, detail: has('orchard', 'orchard_grove') ? 'planted: the plums first, from the third year' : 'fruit trees take years' },
    { label: 'A stocked pond', done: stocked, detail: has('pond') ? 'dug: add trout or crayfish' : 'trout and crayfish' },
    { label: 'Barn and sheep barn', done: has('barn') && has('sheep_barn'), detail: 'a roof for the stock in winter' },
    { label: 'Workshop and equipment yard', done: has('workshop') && has('equipment_yard'), detail: 'tools last longer; a yard for the tractor' },
  ] };
}

/** Why a kit piece cannot be staked now (null = it can): the site, the bunker's entrance, the permit fee. */
export function buildOff(s: GameState, kind: string): string | null {
  const site = planProblem(s, kind);
  if (site) return site;
  if (kind === 'sugar_shack' && !hasMaples(s)) return 'no sugar maples in the woods here: the sap will not run';
  if (kind.startsWith('bunker_') && !BUNKER_ENTRANCES.includes(kind) && !bunkerKinds(s).some(st => BUNKER_ENTRANCES.includes(st.kind))) return 'needs a hatch or stairwell first: the way down';
  if (needsPermit(kind) && s.paper.permits && countyWorks(s) && s.money < permitFee(s, kind)) return `needs a ${usd(permitFee(s, kind))} county permit: you have ${usd(s.money)}`;
  return null;
}

export function buildAdvice(s: GameState, kind: string): BuildAdvice {
  const off = buildOff(s, kind);
  const sug = suggestions(s).find(x => x.kind === kind);
  const next = !off && !!sug;
  let note: string | null = null;
  if (next) note = `suggested: ${sug!.why}`;
  else if (!off && needsPermit(kind) && s.paper.permits && countyWorks(s)) note = `county permit ${usd(permitFee(s, kind))}, about ${reviewDays(s, kind)} days`;
  return { off, next, note };
}

/** Wall kinds that cannot be laid now, and why (null = fine). Soft hints (power, years) go in `perimeterNote`. */
export function perimeterOff(s: GameState, kind: PerimeterKind): string | null {
  if (kind === 'creek_bars' && !s.site.creek) return 'no creek runs through this land';
  { const t = terrainOff(s, kind); if (t) return t; }
  if (kind === 'escape_tunnel' && !bunkerKinds(s).length) return 'needs a bunker room first: the tunnel starts at its wall';
  return null;
}

export function perimeterNote(s: GameState, kind: PerimeterKind): string | null {
  if (kind === 'escape_tunnel') return 'opens only from inside';
  if (kind === 'electric_steel' && !fenceLive(s)) return 'needs power running, or it is only a steel wall';
  if (PERIMETER[kind].growYears) return `takes ${PERIMETER[kind].growYears} years to grow into a wall`;
  const up = UPGRADE_NEXT[kind];
  const deck = canHostWalkway(kind) ? ' · takes a patrol walkway on top' : '';
  return up ? `upgrades to ${PERIMETER[up].name.toLowerCase()}${deck}` : deck ? deck.slice(3) : null;
}

// ── the Perimeter list by price ──

export interface PerimeterTier { id: string; title: string; hint: string; kinds: PerimeterKind[] }
const WALL_KINDS: readonly PerimeterKind[] = PERIMETER_ORDER.filter(k => k !== 'creek_bars');

/** Dollars per 100 m of a kind (the buyable materials; your own labor and logs cost nothing here). */
export function costPer100m(kind: PerimeterKind): number {
  const len = 100 / 6, bill = runBill(kind, len);
  return orderCost(Object.entries(bill).map(([material, qty]) => ({ material: material as MaterialId, qty: qty as number })).filter(l => MATERIALS[l.material].price !== null));
}

/** The Perimeter list in price tiers, cheapest first, with the upgrade chain hinted on each. */
export function perimeterTiers(): PerimeterTier[] {
  const cost = new Map(WALL_KINDS.map(k => [k, costPer100m(k)] as const));
  const cuts = [1000, 5000, 20000];
  const bucket = (k: PerimeterKind) => cuts.filter(c => cost.get(k)! >= c).length;
  const meta = [
    { id: 'cheap', title: 'Cheap in cash', hint: 'under $1,000 per 100 m: hedges and your own labor' },
    { id: 'fence', title: 'Fences', hint: '$1,000 to $5,000 per 100 m: they turn people round' },
    { id: 'hard', title: 'Hard walls', hint: '$5,000 to $20,000 per 100 m: hard to climb or cut' },
    { id: 'premium', title: 'Premium', hint: 'over $20,000 per 100 m' },
  ];
  const tiers: PerimeterTier[] = meta.map((m, i) => ({ ...m, kinds: WALL_KINDS.filter(k => bucket(k) === i).sort((a, b) => cost.get(a)! - cost.get(b)!) }));
  const bars: PerimeterTier = { id: 'creek', title: 'Creek', hint: 'bars where the creek crosses your line', kinds: ['creek_bars'] };
  return [...tiers.filter(t => t.kinds.length), bars];
}

/** The upgrade chain a kind sits in, from its first link: split rail → barbed wire → ... */
export function upgradeChain(kind: PerimeterKind): PerimeterKind[] {
  let start = kind;
  for (let guard = 0; guard < 20; guard++) {
    const prev = (Object.keys(UPGRADE_NEXT) as PerimeterKind[]).find(k => UPGRADE_NEXT[k] === start);
    if (!prev) break;
    start = prev;
  }
  const out: PerimeterKind[] = [start];
  for (let guard = 0; guard < 20; guard++) { const n = UPGRADE_NEXT[out[out.length - 1]]; if (!n) break; out.push(n); }
  return out;
}
