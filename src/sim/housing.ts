/**
 * Where everybody sleeps (docs/DECISIONS.md: "additional people need living
 * spaces and places to sleep... tents if the weather is OK, sleeping bags
 * inside, or on couches"). Pure; nothing here is stored. The plan is worked
 * out from the buildings, the stock and the night's weather each time it is
 * asked for, and the same people always land in the same places for the
 * same state (so the world can draw them there).
 *
 * Sleeping places, best first:
 *   bed     a bedroom bed in a finished home (`HOME_BEDS`). Two small kids
 *           share one; a couple shares a double.
 *   bunk    a bunk in a bunkroom or the buried container, or the medical cot.
 *   couch   the sofa in the living room.
 *   floor   a sleeping bag on the free floor of a home or a bunker room:
 *           roughly one bag per 2 m² beyond the furniture.
 *   tent    the camp wall tent (canvas, a stove, sleeps 4: always there) and
 *           the dome tents the family bought (3 each). Fine in mild dry
 *           weather, a misery in a storm, and below freezing it costs health
 *           unless the wall tent's stove is going.
 *   outbuilding  a sleeping bag on the floor of the shop, the garage, the barn:
 *           dry and out of the wind, but cold and noisy.
 *   nowhere the truck cab, the porch, a hay loft: a bad night every night.
 *
 * Who gets the good places: elders first, then little kids, then couples
 * (they take a double together), teenagers, then single adults. Each night's
 * sleep quality (0–1) moves the morale target, wears health when it is
 * really bad (freezing, soaked) and builds up `Needs.tired`.
 */
import { calendarOf, dayIndex, type GameState } from './state';
import { HOME_BEDS } from './blueprints';
import { isFinished } from './construction';

import { climate } from './effects';
import { mulberry32 } from './rng';
import type { Person } from './family';
import { regionFor } from './climate';

export type SpotKind = 'bed' | 'bunk' | 'couch' | 'floor' | 'tent' | 'outbuilding' | 'nowhere';
export const SPOT_ORDER: readonly SpotKind[] = ['bed', 'bunk', 'couch', 'floor', 'tent', 'outbuilding', 'nowhere'];
export const SPOT_NAME: Record<SpotKind, string> = { bed: 'a bed', bunk: 'a bunk', couch: 'the couch', floor: 'a sleeping bag on the floor', tent: 'a tent', outbuilding: 'a bag on the shop floor', nowhere: 'nowhere (the truck, the porch)' };

/** Dwellings with their own front door: relatives and elders sleep best in one (sim/kin.ts). */
export const SEPARATE_DWELLINGS: ReadonlySet<string> = new Set(['cottage', 'guest_house', 'moms_house']);
/** Who wants a place of their own: relatives who came to join, and the old. */
const wantsOwnPlace = (p: Pick<Person, 'rel' | 'elder'>) => !!p.rel || !!p.elder;
/** Morale target for a relative or an elder with a front door of their own (the porch, the kettle, their things). */
export const OWN_PLACE_MORALE = 3;

/** A dome tent sleeps 3 (a "4-person" tent holds 3 with gear); the camp wall tent sleeps 4. */
export const TENT_SEATS = 3, WALL_TENT_SEATS = 4;
/** Prices: a 4-person dome tent, a 20°F sleeping bag (stock goods `tent`, `sleeping_bag`). */
export const TENT_PRICE = 180, BAG_PRICE = 70;

/** What a finished building offers to sleep in. Free floor m² is what is left after the furniture, the stove, the stores. */
interface Spec { bunks?: number; couches?: number; floorM2?: number; /** Base sleep quality of the floor. */ floorQ?: number; outbuilding?: boolean }
const HOMES: Record<string, Spec> = {
  timber_cabin: { couches: 1, floorM2: 8 },
  log_house: { couches: 2, floorM2: 18 },
  // the housing styles: a lodge's great room, basement rec room and loft take a lot of sleeping bags
  lodge: { couches: 4, floorM2: 60 },
  lodge_plinth: { couches: 4, floorM2: 60 },
  lodge_solar: { couches: 4, floorM2: 60 },
  stone_house: { couches: 2, floorM2: 22 },
  timber_frame: { couches: 2, floorM2: 24 },
  container_house: { couches: 1, floorM2: 8 },
  adobe_house: { couches: 2, floorM2: 14 },
  farmhouse: { couches: 2, floorM2: 16 },
  trailer: { couches: 1, floorM2: 8 },
  cottage: { couches: 1, floorM2: 5 },
  // the stilted house's two rooms, and the ring of six cabins (a bunk each side of each: twelve)
  stilted_house: { couches: 1, floorM2: 6 },
  cabin_village: { bunks: 12, floorM2: 12 },
  guest_house: { couches: 1, floorM2: 3 },
  moms_house: { couches: 1, floorM2: 8 },
  bunker_dorm: { bunks: 8, floorM2: 6, floorQ: 0.5 },
  bunker_container: { bunks: 4, floorM2: 0 },
  bunker_medical: { bunks: 1, floorM2: 0 },
  bunker_galley: { floorM2: 8, floorQ: 0.5 },
  bunker_stores: { floorM2: 6, floorQ: 0.45 },
  bunker_comms: { floorM2: 4, floorQ: 0.5 },
  workshop: { floorM2: 20, floorQ: 0.5, outbuilding: true },
  metal_garage: { floorM2: 20, floorQ: 0.45, outbuilding: true },
  gate_garage: { floorM2: 20, floorQ: 0.45, outbuilding: true },
  garage_solar: { floorM2: 20, floorQ: 0.45, outbuilding: true },
  barn: { floorM2: 20, floorQ: 0.4, outbuilding: true },
};
/** Square metres of free floor a sleeping bag takes (bag, elbow room, the way to the door). */
export const M2_PER_BAG = 2;

// ── The night ──────────────────────────────────────────────────────────────

export interface Night { lowF: number; stormy: boolean; rainy: boolean; snowy: boolean; hot: boolean }

const STORMY = new Set(['blizzard', 'ice_storm', 'flood', 'hurricane_remnants', 'flash_flood', 'windstorm', 'tornado', 'derecho', 'hail']);

/** The mean overnight low (°F) for a day of the year here: January's low at mid-January, a summer low 26° under July's high. */
export function meanLow(s: GameState, doy: number): number {
  const R = regionFor(s.site), a = R.janLowF, b = R.julyHighF - 26;
  return (a + b) / 2 - (b - a) / 2 * Math.cos(2 * Math.PI * (doy - 15) / 365) - climate(s).cold * 40;
}

/** Tonight's weather. `calm` leaves out the day-to-day noise and any storm (the season's usual night: used to decide who goes where). */
export function nightOf(s: GameState, day = dayIndex(s.clock.t), calm = false): Night {
  const R = regionFor(s.site);
  const doy = ((s.clock.startDoy - 1 + day) % 365) + 1;
  const base = meanLow(s, doy);
  if (calm) return { lowF: base, stormy: false, rainy: false, snowy: false, hot: false };
  const r = mulberry32(s.seed * 313 + day * 7 + 11);
  const w = s.weather?.active;
  const live = !!w && day >= w.at && day <= w.until;
  const stormy = live && STORMY.has(w!.kind);
  const lowF = base + (r() * 2 - 1) * 8 - (live && (w!.kind === 'blizzard' || w!.kind === 'ice_storm') ? 15 : 0);
  const wet = r();
  const cold = lowF <= 34;
  return {
    lowF, stormy,
    rainy: !cold && wet < Math.min(0.35, R.rainMm / 3200),
    snowy: cold && wet < Math.min(0.3, R.snowCm / 500),
    hot: (live && w!.kind === 'heat_wave') || lowF >= 76,
  };
}

/** Is the stove going? (There is firewood in the shed.) */
export const heatOn = (s: GameState): boolean => s.stock.firewood >= 0.5;

// ── Capacity ───────────────────────────────────────────────────────────────

export interface Capacity {
  beds: number; bunks: number; couches: number;
  /** Bags that fit on the floor of homes and bunker rooms; of the shop / garage / barn. */
  floorBags: number; outbuildingBags: number;
  /** Dome tents owned, and the wall tent (always); seats in all of them. */
  tents: number; tentSeats: number;
  /** Sleeping bags owned. */
  bags: number;
  /** Beds + bunks + couches + floor bags: everybody this roof can hold. */
  underRoof: number;
}

const finished = (s: GameState) => s.structures.filter(st => isFinished(st) && !st.unplaced);

/** What the buildings and the stock offer tonight. */
export function capacity(s: GameState): Capacity {
  let beds = 0, bunks = 0, couches = 0, floorBags = 0, outbuildingBags = 0;
  for (const st of finished(s)) {
    const sp = HOMES[st.kind];
    if (!sp) continue;
    beds += HOME_BEDS[st.kind] ?? 0;
    bunks += sp.bunks ?? 0;
    couches += sp.couches ?? 0;
    const bags = Math.floor((sp.floorM2 ?? 0) / M2_PER_BAG);
    if (sp.outbuilding) outbuildingBags += bags; else floorBags += bags;
  }
  const tents = Math.floor(s.stock.tent ?? 0);
  return { beds, bunks, couches, floorBags, outbuildingBags, tents, tentSeats: WALL_TENT_SEATS + tents * TENT_SEATS, bags: Math.floor(s.stock.sleeping_bag ?? 0), underRoof: beds + bunks + couches + floorBags };
}

// ── Who sleeps where ───────────────────────────────────────────────────────

export interface Spot {
  kind: SpotKind;
  /** Structure id for a roof, `tent:wall` / `tent:N` for a tent, null for nowhere. */
  where: string | null;
  /** Which bed / couch / bag / tent seat (0-based, in order of the building's list). */
  slot: number;
}

export interface Sleeper {
  /** Index in `GameState.people`, or −1 for a guest being considered. */
  index: number;
  id: string;
  spot: Spot;
  /** Sleep quality 0–1 tonight. */
  quality: number;
  /** 0–1: a room of your own vs the living room or a bunkroom of eight. */
  privacy: number;
  /** Added to the morale target. */
  morale: number;
  /** Health lost tonight (cold, wet). */
  harm: number;
  /** Hours of tiredness added tonight. */
  tired: number;
  hasBag: boolean;
  note: string;
  /** A relative or an elder in a dwelling of their own (a guest house, a cottage, Mom's house). */
  own?: boolean;
}

/** Everybody on the place who sleeps here (the living, not the taken; `guests` are people being considered). */
function sleepers(s: GameState, guests: readonly Person[]): Array<{ index: number; p: Person }> {
  const out: Array<{ index: number; p: Person }> = [];
  s.people.forEach((p, i) => { const n = s.personState[i]?.needs; if (n && n.died == null && !n.taken) out.push({ index: i, p }); });
  guests.forEach(p => out.push({ index: -1, p }));
  return out;
}

const isElder = (p: Person) => !!p.elder || p.age >= 65;
/** Bed space a person takes: babies and small kids share. */
const space = (p: Person) => (p.age <= 2 ? 0.25 : p.age <= 7 ? 0.5 : 1);

/** The order people are given the good places: elders, little kids, couples, teens, everyone else. */
function priority(list: Array<{ index: number; p: Person }>): Array<Array<{ index: number; p: Person }>> {
  const taken = new Set<string>();
  const groups: Array<Array<{ index: number; p: Person }>> = [];
  const byId = new Map(list.map(x => [x.p.id, x] as const));
  for (const x of list) if (isElder(x.p)) { taken.add(x.p.id); groups.push([x]); }
  for (const x of list) if (!taken.has(x.p.id) && x.p.kid && x.p.age <= 12) { taken.add(x.p.id); groups.push([x]); }
  for (const x of list) {
    if (taken.has(x.p.id) || x.p.kid) continue;
    const m = x.p.partner ? byId.get(x.p.partner) : undefined;
    if (m && !taken.has(m.p.id) && !m.p.kid) { taken.add(x.p.id); taken.add(m.p.id); groups.push([x, m]); }
  }
  for (const x of list) if (!taken.has(x.p.id) && x.p.kid) { taken.add(x.p.id); groups.push([x]); }
  for (const x of list) if (!taken.has(x.p.id)) { taken.add(x.p.id); groups.push([x]); }
  return groups;
}

interface Pool { kind: SpotKind; where: string; /** Seats left. */ left: number; used: number; quality?: number; outbuilding?: boolean }

/** The pools of places, best first. */
function pools(s: GameState): Pool[] {
  const out: Pool[] = [];
  const add = (kind: SpotKind, where: string, n: number, extra: Partial<Pool> = {}) => { if (n > 0) out.push({ kind, where, left: n, used: 0, ...extra }); };
  const fin = finished(s);
  for (const st of fin) add('bed', st.id, HOME_BEDS[st.kind] ?? 0);
  for (const st of fin) add('bunk', st.id, HOMES[st.kind]?.bunks ?? 0);
  for (const st of fin) add('couch', st.id, HOMES[st.kind]?.couches ?? 0);
  for (const st of fin) { const sp = HOMES[st.kind]; if (sp && !sp.outbuilding) add('floor', st.id, Math.floor((sp.floorM2 ?? 0) / M2_PER_BAG), { quality: sp.floorQ }); }
  const tents: Pool[] = [];
  const wall: Pool = { kind: 'tent', where: 'tent:wall', left: WALL_TENT_SEATS, used: 0 };
  tents.push(wall);
  for (let i = 0; i < Math.floor(s.stock.tent ?? 0); i++) tents.push({ kind: 'tent', where: `tent:${i}`, left: TENT_SEATS, used: 0 });
  const shop: Pool[] = [];
  for (const st of fin) { const sp = HOMES[st.kind]; if (sp?.outbuilding) shop.push({ kind: 'outbuilding', where: st.id, left: Math.floor((sp.floorM2 ?? 0) / M2_PER_BAG), used: 0, quality: sp.floorQ, outbuilding: true }); }
  // in a mild season a tent is a better night than a cold concrete floor; in a hard one the shop is better
  const mild = meanLow(s, calendarOf(s.clock).doy) >= 45;
  out.push(...(mild ? [...tents, ...shop] : [...shop, ...tents]));
  return out;
}

/** The base quality of a place before the weather and the bedding. */
const BASE: Record<SpotKind, number> = { bed: 1, bunk: 0.82, couch: 0.72, floor: 0.6, tent: 0.78, outbuilding: 0.5, nowhere: 0.22 };
const PRIVACY: Record<SpotKind, number> = { bed: 1, bunk: 0.5, couch: 0.3, floor: 0.35, tent: 0.75, outbuilding: 0.45, nowhere: 0.25 };
/** Degrees F a place keeps above the night's low (a house unheated, a canvas tent barely at all). */
const SHELTER: Record<SpotKind, number> = { bed: 22, bunk: 20, couch: 22, floor: 22, tent: 3, outbuilding: 12, nowhere: 5 };

/** How good one night is in one place for one person. Pure. */
export function sleepQuality(kind: SpotKind, p: Pick<Person, 'age' | 'elder' | 'kid'>, night: Night, o: { bag: boolean; stove: boolean; wall?: boolean; floorQ?: number }): { quality: number; harm: number; note: string } {
  let q = o.floorQ ?? BASE[kind];
  if (kind === 'tent' && o.wall) q += 0.03;
  const bedding = kind === 'bed' || kind === 'bunk' || kind === 'couch' || o.bag;
  // how cold it feels from inside: the shelter, the stove, the bag
  const heated = o.stove && (kind === 'tent' ? !!o.wall : kind !== 'nowhere' && kind !== 'outbuilding');
  const eff = night.lowF + SHELTER[kind] + (heated ? (kind === 'tent' ? 30 : 38) : 0) + (bedding ? 10 : 0);
  const cold = Math.max(0, Math.min(0.65, (55 - eff) / 45 * 0.6));
  q -= cold;
  let harm = eff < 20 ? Math.min(1.2, (20 - eff) / 20) : 0;
  const fragile = isElder(p as Person) || p.age <= 5;
  if (fragile) harm *= 1.5;
  const open = kind === 'tent' || kind === 'nowhere';
  if (night.stormy) q -= kind === 'tent' ? (o.wall ? 0.15 : 0.3) : kind === 'nowhere' ? 0.2 : kind === 'outbuilding' ? 0.05 : 0;
  else if (night.rainy) q -= kind === 'tent' ? (o.wall ? 0.05 : 0.1) : kind === 'nowhere' ? 0.1 : 0;
  else if (night.snowy && kind === 'tent') q -= 0.05;
  if (night.hot && open) q -= 0.12;
  if (!bedding) q -= 0.12;
  if (isElder(p as Person) && (kind === 'floor' || kind === 'tent' || kind === 'outbuilding' || kind === 'nowhere')) q -= 0.1;
  else if (isElder(p as Person) && kind === 'couch') q -= 0.03;
  q = Math.max(0.05, Math.min(1, q));
  const note = night.stormy && open ? 'a storm over the tent' : night.rainy && open ? 'rain' : eff < 20 ? 'bitter cold' : cold > 0.2 ? 'cold' : night.hot && open ? 'stifling' : q >= 0.7 ? 'a good night' : q >= 0.5 ? 'a rough night' : 'barely sleeping';
  return { quality: q, harm, note };
}

/** Morale target change, and tiredness, from a night's quality and privacy. */
function effects(q: number, privacy: number, p: Pick<Person, 'age' | 'kid'>): { morale: number; tired: number } {
  const morale = -25 * Math.max(0, 0.8 - q) - (p.age <= 7 ? 0 : 3 * (1 - privacy) * (p.kid ? 0.5 : 1));
  return { morale: Math.max(-22, morale), tired: q < 0.5 ? (0.5 - q) * 12 : 0 };
}

export interface HousingPlan {
  sleepers: Sleeper[];
  cap: Capacity;
  night: Night;
  stove: boolean;
  /** People by kind of place. */
  counts: Record<SpotKind, number>;
  /** People not in a bed or a bunk. */
  noBed: number;
  /** People not under a roof (tent, shop floor, nowhere). */
  outside: number;
  /** Beds + bunks nobody has yet. */
  bedsFree: number;
}

/** Work out who sleeps where tonight. `guests` are people being considered (the gate card). */
export function housingPlan(s: GameState, guests: readonly Person[] = []): HousingPlan {
  const list = sleepers(s, guests);
  const pl = pools(s);
  const cap = capacity(s);
  const night = nightOf(s);
  const stove = heatOn(s);
  const nowhere: Pool = { kind: 'nowhere', where: '', left: Infinity, used: 0 };
  const place = new Map<string, Spot>();
  /** Space a person takes in a pool: small kids share beds and couches. */
  const cost = (p: Person, k: SpotKind) => (k === 'bed' || k === 'couch' ? space(p) : 1);
  const give = (p: Person, pool: Pool) => { place.set(p.id, { kind: pool.kind, where: pool.where || null, slot: Math.floor(pool.used + 1e-9) }); pool.used += cost(p, pool.kind); pool.left -= cost(p, pool.kind); };
  const all = [...pl, nowhere];
  // relatives and elders go to a separate dwelling's beds first, when there is one (a guest house, a cottage, Mom's house)
  const kindOf = new Map(s.structures.map(st => [st.id, st.kind] as const));
  const ownBeds = all.filter(q => q.kind === 'bed' && SEPARATE_DWELLINGS.has(kindOf.get(q.where) ?? ''));
  const choices = (p: Person): Pool[] => (wantsOwnPlace(p) && ownBeds.length ? [...ownBeds, ...all] : all);
  // someone the family gave a home to (sim/newcomers.ts givePlace) has a bed there first
  for (const x of list) {
    if (!x.p.home) continue;
    const pool = all.find(q => q.kind === 'bed' && q.where === x.p.home && q.left + 1e-9 >= cost(x.p, 'bed'));
    if (pool) give(x.p, pool);
  }

  for (const whole of priority(list)) {
    const group = whole.filter(x => !place.has(x.p.id));
    if (!group.length) continue;
    // a couple takes the same place if one has room for both
    if (group.length > 1) {
      const pool = choices(group[0].p).find(q => q.left + 1e-9 >= group.reduce((a, x) => a + cost(x.p, q.kind), 0));
      if (pool) { for (const x of group) give(x.p, pool); continue; }
    }
    for (const x of group) give(x.p, choices(x.p).find(q => q.left + 1e-9 >= cost(x.p, q.kind))!);
  }

  // bags go to the coldest places first
  let bags = cap.bags;
  const needBag = (k: SpotKind) => k === 'floor' || k === 'tent' || k === 'outbuilding' || k === 'nowhere';
  const hasBag = new Map<string, boolean>();
  for (const k of ['tent', 'outbuilding', 'nowhere', 'floor'] as const) for (const x of list) if (place.get(x.p.id)!.kind === k) { const b = bags > 0; if (b) bags--; hasBag.set(x.p.id, b); }

  const out: Sleeper[] = [];
  const counts = Object.fromEntries(SPOT_ORDER.map(k => [k, 0])) as Record<SpotKind, number>;
  for (const x of list) {
    const spot = place.get(x.p.id)!;
    counts[spot.kind]++;
    const poolOf = pl.find(p => p.where === spot.where && p.kind === spot.kind);
    const bag = needBag(spot.kind) ? hasBag.get(x.p.id) ?? false : true;
    const sq = sleepQuality(spot.kind, x.p, night, { bag, stove, wall: spot.where === 'tent:wall', floorQ: poolOf?.quality });
    // a tent shared by 3–4 is no one's own room
    const crowd = spot.kind === 'tent' && spot.where ? Math.max(0, (pl.find(p => p.where === spot.where)?.used ?? 1) - 2) * 0.15 : 0;
    const privacy = Math.max(0, PRIVACY[spot.kind] - crowd);
    const fx = effects(sq.quality, privacy, x.p);
    const own = spot.kind === 'bed' && ((wantsOwnPlace(x.p) && SEPARATE_DWELLINGS.has(kindOf.get(spot.where ?? '') ?? '')) || (!!x.p.home && spot.where === x.p.home));
    out.push({ index: x.index, id: x.p.id, spot, quality: sq.quality, privacy, morale: fx.morale + (own ? OWN_PLACE_MORALE : 0), harm: sq.harm, tired: fx.tired, hasBag: bag, note: own ? 'a front door of their own' : sq.note, own });
  }
  const noBed = counts.couch + counts.floor + counts.tent + counts.outbuilding + counts.nowhere;
  const used = counts.bed + counts.bunk;
  return { sleepers: out, cap, night, stove, counts, noBed, outside: counts.tent + counts.outbuilding + counts.nowhere, bedsFree: Math.max(0, cap.beds + cap.bunks - used) };
}

let memo: { key: string; plan: HousingPlan } | null = null;
/** The plan, reused while nothing it depends on has changed (the world asks every frame). */
export function cachedPlan(s: GameState): HousingPlan {
  const fin = finished(s).length;
  const key = `${s.seed}|${s.clock.startDoy}|${dayIndex(s.clock.t)}|${s.site.region}|${s.people.length}|${s.personState.map(p => (p.needs.died != null || p.needs.taken ? 1 : 0)).join('')}|${s.structures.length}|${fin}|${s.people.map(p => p.home ?? '').join(',')}|${s.stock.tent}|${s.stock.sleeping_bag}|${heatOn(s) ? 1 : 0}|${s.weather?.active?.kind ?? ''}`;
  if (memo?.key === key) return memo.plan;
  const plan = housingPlan(s);
  memo = { key, plan };
  return plan;
}

/** Where a person sleeps tonight (the world draws them there; the daily-life schedule decides when). */
export function sleepSpotFor(s: GameState, person: number | string): (Spot & { quality: number; privacy: number }) | null {
  const plan = cachedPlan(s);
  const sl = plan.sleepers.find(x => (typeof person === 'number' ? x.index === person : x.id === person));
  return sl ? { ...sl.spot, quality: sl.quality, privacy: sl.privacy } : null;
}

/** Dome tents that stand in the yard tonight (the world pitches this many). */
export function tentsPitched(s: GameState): number {
  const plan = cachedPlan(s);
  const used = new Set(plan.sleepers.filter(x => x.spot.kind === 'tent' && x.spot.where && x.spot.where !== 'tent:wall').map(x => x.spot.where));
  return used.size;
}

// ── The morale / health hook (needs.ts liveDay) ────────────────────────────

/** Tonight's effect on each person by index in `s.people` (absent = no effect). */
export function sleepEffects(s: GameState): Map<number, { morale: number; harm: number; tired: number }> {
  const out = new Map<number, { morale: number; harm: number; tired: number }>();
  for (const sl of housingPlan(s).sleepers) if (sl.index >= 0) out.set(sl.index, { morale: sl.morale, harm: sl.harm, tired: sl.tired });
  return out;
}

// ── Shortfall and what to do about it ──────────────────────────────────────

export interface Shortfall { noBed: number; outside: number; nowhere: number; bedsFree: number; people: number }

/** How many people lack a bed, are out in the weather, or have nowhere at all. (The UX hints call this.) */
export function housingShortfall(s: GameState): Shortfall {
  const p = cachedPlan(s);
  return { noBed: p.noBed, outside: p.outside, nowhere: p.counts.nowhere, bedsFree: p.bedsFree, people: p.sleepers.length };
}

export interface Fix {
  /** `build` a kit piece, or `buy` a shop good. */
  action: 'build' | 'buy';
  item: string;
  qty: number;
  cost: number;
  /** People it gets a bed (or a roof). */
  helps: number;
  text: string;
}

const HOME_NAME: Record<string, string> = { guest_house: 'a guest house', cottage: 'a cottage', moms_house: 'Mom\u2019s house', timber_cabin: 'a timber cabin', log_house: 'a log house', lodge: 'a lodge', lodge_plinth: 'a lodge', lodge_solar: 'a lodge', stone_house: 'a stone house', timber_frame: 'a timber-frame house', container_house: 'a container house', adobe_house: 'an adobe house' };
/** Candidate homes to build, cheapest per bed first. (Kit pieces in the Build list.) */
const BUILDABLE_HOMES = ['guest_house', 'cottage', 'moms_house', 'timber_cabin', 'log_house'] as const;

/** Ways to fix a shortage, best first; empty when everyone has a bed. `homeCost` gives the price of a kit piece (the UI's own figure). */
export function housingFixes(s: GameState, homeCost: (kind: string) => number): Fix[] {
  const plan = cachedPlan(s);
  const out: Fix[] = [];
  if (plan.noBed <= 0) return out;
  const fixes = (kind: string) => HOME_BEDS[kind] ?? 0;
  // a home that gets everybody a bed, or the one that gets the most
  const cands = BUILDABLE_HOMES.map(k => ({ k, beds: fixes(k), cost: homeCost(k) }));
  const enough = cands.filter(c => c.beds >= plan.noBed).sort((a, b) => a.cost - b.cost)[0];
  const best = enough ?? [...cands].sort((a, b) => b.beds - a.beds)[0];
  out.push({ action: 'build', item: best.k, qty: 1, cost: best.cost, helps: Math.min(plan.noBed, best.beds), text: `build ${HOME_NAME[best.k]} (~$${Math.round(best.cost).toLocaleString('en-US')}, ${best.beds} beds)` });
  if (plan.outside > 0) {
    const have = plan.cap.tents * TENT_SEATS + WALL_TENT_SEATS;
    const seated = plan.sleepers.filter(x => x.spot.kind === 'tent').length;
    const want = Math.max(0, plan.outside - Math.max(0, have - seated));
    if (want > 0) { const n = Math.ceil(want / TENT_SEATS); out.push({ action: 'buy', item: 'tent', qty: n, cost: n * TENT_PRICE, helps: want, text: `buy ${n} ${n === 1 ? 'tent' : 'tents'} ($${(n * TENT_PRICE).toLocaleString('en-US')})` }); }
  }
  const noBag = plan.sleepers.filter(x => !x.hasBag).length;
  if (noBag > 0) out.push({ action: 'buy', item: 'sleeping_bag', qty: noBag, cost: noBag * BAG_PRICE, helps: noBag, text: `buy ${noBag} sleeping ${noBag === 1 ? 'bag' : 'bags'} ($${(noBag * BAG_PRICE).toLocaleString('en-US')})` });
  return out;
}

/** The kit piece that fixes the biggest shortfall, or null. (The Build list highlights it.) */
export function bestFix(s: GameState, homeCost: (kind: string) => number = () => 0): Fix | null {
  const f = housingFixes(s, homeCost).find(x => x.action === 'build');
  return f ?? null;
}

/** One sentence for the Housing panel: "3 people without a bed: build a cottage (~$X), buy 2 tents ($Y)". */
export function recommendation(s: GameState, homeCost: (kind: string) => number): string | null {
  const plan = cachedPlan(s);
  if (plan.noBed <= 0) return null;
  const fx = housingFixes(s, homeCost);
  return `${plan.noBed} ${plan.noBed === 1 ? 'person' : 'people'} without a bed: ${fx.map(f => f.text).join(', or ')}.`;
}

/** "beds 4 · 6 people · 2 without" for the Build list's Home header. */
export function housingSummary(s: GameState): string {
  const p = cachedPlan(s);
  return `beds ${p.cap.beds + p.cap.bunks} · ${p.sleepers.length} people${p.noBed > 0 ? ` · ${p.noBed} without` : ''}`;
}

// ── Arrivals ───────────────────────────────────────────────────────────────

export interface ArrivalOutlook {
  /** Where the guests would sleep, by kind. */
  guests: Record<SpotKind, number>;
  /** People already here who would lose their place to the newcomers' priority (elders, kids). */
  displaced: number;
  /** The guests' count and the household's total after them. */
  lines: string[];
  /** Morale target change for the worst-off (guest or family). */
  worst: number;
  /** Beds that would be free before they come. */
  bedsFree: number;
  /** Relatives and elders among them who would have a dwelling of their own. */
  own: number;
}

/** What taking these people in would mean for sleeping: the gate card's lines. */
export function arrivalOutlook(s: GameState, guests: readonly Person[]): ArrivalOutlook {
  const before = housingPlan(s), after = housingPlan(s, guests);
  const ids = new Set(guests.map(g => g.id));
  const mine = after.sleepers.filter(x => ids.has(x.id));
  const kinds = Object.fromEntries(SPOT_ORDER.map(k => [k, 0])) as Record<SpotKind, number>;
  for (const g of mine) kinds[g.spot.kind]++;
  const n = guests.length;
  const lines: string[] = [];
  const bedsFree = before.bedsFree;
  lines.push(`Beds: ${bedsFree} free of ${before.cap.beds + before.cap.bunks}.${before.cap.couches > 0 ? ` Couches ${before.cap.couches}.` : ''} Floor room for ${before.cap.floorBags} bags. Tents ${before.cap.tents} (+ the wall tent).`);
  const roof = kinds.bed + kinds.bunk + kinds.couch + kinds.floor;
  const parts = SPOT_ORDER.filter(k => kinds[k] > 0).map(k => `${kinds[k]} ${k === 'bed' ? (kinds[k] === 1 ? 'in a bed' : 'in beds') : k === 'bunk' ? 'in bunks' : k === 'couch' ? 'on the couch' : k === 'floor' ? 'on the floor in bags' : k === 'tent' ? (kinds[k] === 1 ? 'in a tent' : 'in tents') : k === 'outbuilding' ? 'on the shop floor' : 'with nowhere to sleep'}`);
  lines.push(`${n === 1 ? 'They' : 'They'} would sleep: ${parts.join(', ')}.`);
  if (kinds.nowhere > 0) lines.push(`There is not room for all of them: ${kinds.nowhere} would sleep in the truck or on the porch.`);
  if (kinds.tent + kinds.outbuilding > 0) lines.push(tentNote(after.night, after.stove, kinds.tent + kinds.outbuilding));
  else if (kinds.nowhere === 0 && roof === n) lines.push('Everybody under a roof.');
  const displaced = after.sleepers.filter(x => !ids.has(x.id) && before.sleepers.find(b => b.id === x.id && SPOT_ORDER.indexOf(b.spot.kind) < SPOT_ORDER.indexOf(x.spot.kind))).length;
  if (displaced > 0) lines.push(`${displaced} of yours would give up a better place for them.`);
  const worst = Math.min(0, ...after.sleepers.map(x => x.morale));
  const own = mine.filter(x => x.own).length;
  const wantsOwn = guests.filter(wantsOwnPlace).length;
  if (own > 0) lines.push(`${own === 1 ? 'One' : own} would have a place of their own (a guest house or cottage): they will be happier there.`);
  else if (wantsOwn > 0) lines.push('A guest house, a cottage or Mom\u2019s house would keep them happier than a spare bed in the main house.');
  return { guests: kinds, displaced, lines, worst, bedsFree, own };
}

/** What a tent night is like at this time of year. */
function tentNote(night: Night, stove: boolean, n: number): string {
  const f = Math.round(night.lowF);
  if (night.lowF >= 50) return `${n === 1 ? 'The tent is' : 'Tents are'} fine this time of year (lows around ${f}°F).`;
  if (night.lowF >= 32) return `Tents are cold right now (lows around ${f}°F): they need sleeping bags.`;
  return stove ? `Below freezing (lows around ${f}°F): only the wall tent's stove keeps a tent livable.` : `Below freezing (lows around ${f}°F) and no firewood: a night in a tent costs health.`;
}

