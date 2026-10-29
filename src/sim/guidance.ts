/**
 * First-time-player guidance (docs/DECISIONS.md, "UX pass"): which Build
 * items are usable right now and why not, what the next sensible one is,
 * what the bunker needs, what the plans still lack, and how the Perimeter
 * list groups by price. Pure (tested); the HUD only draws it.
 */
import { KIT } from '../game/buildkit/kit';
import { BLUEPRINTS, homeBeds, isHome } from './blueprints';
import { daysOfFood } from './needs';
import { enclosure } from './enclosure';
import { hardenCost } from './hardening';
import { isFinished, planProblem } from './construction';
import { countyWorks, needsPermit, permitFee, reviewDays } from './paperwork';
import { onOrder, orderCost, prices } from './economy';
import { firewoodOutlook } from './heating';
import { UTILITY } from './utilities';
import { fmtKw } from './powerReport';
import { ORCHARD_KINDS, orchardBearing } from './greenhouse';
import { needsHookup, storageTip } from './hookups';
import { MATERIAL_IDS, MATERIALS, type MaterialId } from './materials';
import { PERIMETER, PERIMETER_ORDER, UPGRADE_NEXT, fenceLive, runBill, runFinished, wallLength, type PerimeterKind, type Pt } from './perimeter';
import { MAX_TOWERS, ringStatus } from './fortress';
import { canHostWalkway } from './walkway';
import { roadGateStatus } from './roadGate';
import type { GameState, OrderLine } from './state';
import { SEPARATE_DWELLINGS, housingShortfall } from './housing';
import { joinNames } from './kin';
import { CARETAKER, CARETAKER_KINDS, caretakerProblem, marketFactor, saleBlock, saleQuote, type CaretakerKind } from './weekender';
import { tension } from './disaster';

const usd = (n: number) => '$' + Math.round(n).toLocaleString('en-US');

// ── what the plans still need ──

/** Materials the plans still lack: every unbuilt stage, run and hardening job, less the stockpile and what is on order. */
export function plansNeed(s: GameState): Partial<Record<MaterialId, number>> {
  const need: Partial<Record<MaterialId, number>> = {};
  const add = (bill: Partial<Record<MaterialId, number>>) => { for (const [k, n] of Object.entries(bill) as Array<[MaterialId, number]>) need[k] = (need[k] ?? 0) + n; };
  for (const st of s.structures) {
    if (isFinished(st)) continue;
    BLUEPRINTS[st.kind].stages.forEach((sg, i) => {
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

export const BUNKER_ENTRANCES: readonly string[] = ['bunker_hatch', 'bunker_stairs'];
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
    { id: 'entrance', label: 'A way down', done: has(...BUNKER_ENTRANCES), building: going(...BUNKER_ENTRANCES), kind: 'bunker_hatch', detail: note(going(...BUNKER_ENTRANCES), 'a hatch or a stairwell; every room grows from it') },
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
const hasPower = (s: GameState) => !!s.site.improvements?.power || hasKind(s, 'solar_array', 'garage_solar', 'generator_shed', 'battery_shed');

/** One thing worth doing now, from what the place lacks. A suggestion, never a requirement: nothing is locked behind it. */
export type SuggestionAct =
  | { type: 'stake'; kind: string }
  | { type: 'order'; lines: OrderLine[] }
  | { type: 'markTrees'; n: number }
  | { type: 'select'; id: string }
  | { type: 'tool'; tool: string }
  | { type: 'caretaker'; kind: CaretakerKind }
  | { type: 'moveIn' };
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
  const growing = hasKind(s, 'garden', 'field', 'greenhouse', 'orchard');
  if (!growing) add('food', 'garden', daysOfFood(s) < 90 ? 'little food put by and nothing growing' : 'nothing growing yet', daysOfFood(s) < 90 ? 70 : 45);
  if (!hasKind(s, 'outhouse', 'septic')) add('toilet', 'outhouse', 'nowhere to go', 50);
  if (!hasPower(s)) add('power', 'solar_array', 'no power for the pump, lights and the freezer', 40);
  if (growing && !hasKind(s, 'root_cellar')) add('cellar', 'root_cellar', 'nowhere cool to keep what you grow', 30);

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
  return out.sort((x, y) => y.urgency - x.urgency).slice(0, 3);
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
  const bearing = fin.some(st => ORCHARD_KINDS.includes(st.kind) && orchardBearing((s.clock.t - (st.finishedAt ?? s.clock.t)) / 365) > 0);
  const stocked = Object.values(s.farm?.ponds ?? {}).some(p => p.trout + p.crayfish > 0);
  return { id: 'self', title: 'Feed and power the compound', steps: [
    { label: '20 kW of solar', done: kw >= 20, detail: kw > 0 ? `${fmtKw(kw)} of 20 kW built` : 'a solar farm of 50 panels' },
    { label: 'Battery storage', done: kwh >= 40, detail: kwh > 0 ? `${Math.round(kwh)} kWh of 40 built` : 'a battery container beside the array' },
    { label: 'A heated greenhouse', done: has('greenhouse_heated'), detail: 'fresh greens all winter' },
    { label: 'An orchard bearing fruit', done: bearing, detail: has('orchard', 'orchard_grove') ? 'planted: fruit from the fourth year' : 'fruit trees take years' },
    { label: 'A stocked pond', done: stocked, detail: has('pond') ? 'dug: add trout or crayfish' : 'trout and crayfish' },
    { label: 'Barn and sheep barn', done: has('barn') && has('sheep_barn'), detail: 'a roof for the stock in winter' },
    { label: 'Workshop and equipment yard', done: has('workshop') && has('equipment_yard'), detail: 'tools last longer; a yard for the tractor' },
  ] };
}

/** Why a kit piece cannot be staked now (null = it can): the site, the bunker's entrance, the permit fee. */
export function buildOff(s: GameState, kind: string): string | null {
  const site = planProblem(s, kind);
  if (site) return site;
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
