/**
 * Scavenging runs after the collapse (decided with the user: "all of these",
 * docs/DECISIONS.md). The family sends people to places in the abandoned
 * town, empty farms and the wrecks on the interstate. Pure and seeded.
 *
 *  Places    each with its own goods and its own depletion. Others pick a
 *            place over on their own clock (a half-life: the pharmacy goes in
 *            weeks, a farm out the back road lasts a year or more), and that
 *            clock slows as the years go by and fewer people are left to look.
 *            What the family takes comes out of the same stock.
 *  The trip  on foot (about 30 km a day there and back, a pack each) or by
 *            truck (the pickup's fuel, rescue.tripFuel; a bed full but loud).
 *            Who goes is away (task 'away') until they're back.
 *  The haul  they take the best of it first, by value for the weight, up to
 *            what they can carry. Gas goes stale: after about four months in
 *            the tanks part of it is varnish.
 *  Risks     other scavengers (the run's orders: keep clear, talk, or shoot
 *            first; a savage crew doesn't give you the choice), a crew that
 *            has claimed the place, feral dogs, falls and rusty nails
 *            (tetanus, a week or two later, with nobody left to give the
 *            shot), fallout on the ground after a nuclear war, and the sick
 *            and the dead after a plague. A fight is rescue.fightAtCamp: the
 *            same hit, armor and wound rules as every other fight.
 */
import { mulberry32, pick } from './rng';
import { log } from './economy';
import { contagion, infect } from './effects';
import { doseBetween } from './nuclear';
import { canGo, fightAtCamp, tripFuel } from './rescue';
import { applyCasualties, type RaiderTemper } from './battle';
import { raiderTemper } from './encounters';
import { MATERIALS } from './materials';
import { CALIBER, type Caliber } from './armory';
import { dayIndex, type GameState } from './state';
import type { SkillId } from './family';
import { bagOf, BAG_BASE, type BagGood } from './tradeGoods';
import { diffOf } from './difficulty';

// ─────────────────────────────────────────────────────────────────────────
// State
// ─────────────────────────────────────────────────────────────────────────

export type PlaceKind = 'hardware' | 'pharmacy' | 'gas' | 'school' | 'interstate' | 'farm';
/** What can be found: stock goods, ammo by caliber, trade goods (salt, coffee…) and books. */
export type LootKey = 'hardware' | 'pipe' | 'cable' | 'meds' | 'fuel' | 'seed' | 'canned' | 'staples' | 'hygiene' | `ammo:${Caliber}` | `bag:${BagGood}` | 'books';

export interface Place {
  id: string;
  kind: PlaceKind;
  name: string;
  /** Road distance from the place (km, one way). */
  km: number;
  /** What's left, and what was there when it hit (for "picked over"). */
  left: Partial<Record<LootKey, number>>;
  start: Partial<Record<LootKey, number>>;
  /** A neighbor's empty farm: whose. */
  neighbor?: string;
  /** Day the family last went, and the day it opened up for scavenging. */
  visited?: number;
  opened: number;
  /** A crew has claimed it (savage), until a day; `known`: the family has heard. */
  claim?: { crew: string; size: number; until: number; known: boolean };
}

export type Roe = 'avoid' | 'talk' | 'fight';
export interface Run {
  place: string;
  team: string[];
  mode: 'foot' | 'truck';
  roe: Roe;
  left: number;
  back: number;
}

export interface ScavengeState {
  places: Place[];
  run: Run | null;
  /** Rusty-nail wounds that may turn to tetanus: who, and the day it shows (if it does). */
  tetanus: Array<{ pid: string; day: number }>;
  /** Tallies for the report: runs, and what came home (dollars-equivalent, 2025). */
  runs: number;
  hauled: number;
  /** The last few runs (newest last). */
  history: Array<{ day: number; place: string; text: string }>;
}

export const newScavenge = (): ScavengeState => ({ places: [], run: null, tetanus: [], runs: 0, hauled: 0, history: [] });
export const scavengeOf = (s: GameState): ScavengeState => (s.scavenge ??= newScavenge());
/** Out on a run: off the place, off the line. */
export const onRun = (s: GameState, pid: string) => !!s.scavenge?.run?.team.includes(pid);

// ─────────────────────────────────────────────────────────────────────────
// Places and their goods
// ─────────────────────────────────────────────────────────────────────────

/**
 * What each kind of place has the day it hits (a small-town hardware and
 * feed store, a pharmacy, a gas station with its underground tanks, the high
 * school, two jackknifed semis on the interstate, a farm).
 */
const STOCKED: Record<PlaceKind, Partial<Record<LootKey, number>>> = {
  hardware: { hardware: 30, pipe: 12, cable: 10, seed: 6, fuel: 2, 'bag:batteries': 40, 'bag:salt': 25, 'ammo:22lr': 1500, 'ammo:12ga': 200, 'ammo:3030': 60, books: 1 },
  pharmacy: { meds: 25, hygiene: 40, 'bag:batteries': 30, 'bag:coffee': 8, 'bag:tobacco': 30, books: 1 },
  gas: { fuel: 120, canned: 6, hygiene: 10, 'bag:coffee': 25, 'bag:tobacco': 60, 'bag:liquor': 30, 'bag:batteries': 20, 'bag:salt': 8 },
  school: { canned: 15, staples: 4, meds: 4, hygiene: 15, cable: 4, pipe: 3, 'bag:salt': 15, 'bag:coffee': 6, books: 6 },
  interstate: { fuel: 40, hardware: 15, canned: 20, staples: 6, hygiene: 20, meds: 3, 'bag:batteries': 15, 'bag:liquor': 10, 'ammo:9mm': 100, 'ammo:556': 120 },
  farm: { seed: 4, canned: 6, staples: 2, fuel: 6, hardware: 6, meds: 1, 'bag:salt': 5, 'bag:liquor': 3, 'ammo:12ga': 50, 'ammo:3030': 40, books: 1 },
};
/** Days for others to pick half of what's left, at the worst of it (the first months). */
export const HALF_LIFE: Record<PlaceKind, number> = { pharmacy: 30, gas: 45, hardware: 75, interstate: 90, school: 150, farm: 200 };
/** How often other people are there (chance of running into someone, the first months, lawless). */
export const TRAFFIC: Record<PlaceKind, number> = { pharmacy: 0.4, gas: 0.4, hardware: 0.3, interstate: 0.25, school: 0.2, farm: 0.12 };
/** Rough weights (kg per unit) for what a pack or a truck bed holds. */
const WEIGHT: Record<string, number> = { hardware: 8, pipe: 6, cable: 9, meds: 1, fuel: 17, seed: 10, canned: 9, staples: 25, hygiene: 3, books: 1, 'bag:salt': 1, 'bag:coffee': 0.5, 'bag:batteries': 0.1, 'bag:tobacco': 0.05, 'bag:liquor': 1.2 };
const weightOf = (k: LootKey) => WEIGHT[k] ?? (k === 'ammo:12ga' ? 0.04 : 0.02);
/** A pack each on foot; a pickup bed. */
export const PACK_KG = 25, TRUCK_KG = 600;
/** On foot, loaded, there and back: km a day. */
export const FOOT_KM_DAY = 30;

/** Dollar value (2025) of a unit of loot, for choosing what to carry and the tallies. */
export function lootValue(k: LootKey): number {
  if (k === 'books') return 30;
  if (k.startsWith('ammo:')) { const c = CALIBER[k.slice(5) as Caliber]; return c.price / c.box; }
  if (k.startsWith('bag:')) return BAG_BASE[k.slice(4) as BagGood].price;
  return MATERIALS[k as keyof typeof MATERIALS].price ?? 10;
}

export const PLACE_KIND_NAME: Record<PlaceKind, string> = { hardware: 'Hardware & feed', pharmacy: 'Pharmacy', gas: 'Gas station', school: 'School', interstate: 'Interstate wrecks', farm: 'Empty farm' };
const TOWN_NAMES = ['Coleman\'s Hardware & Feed', 'the Rexall on Main Street', 'the Sinclair station at the interchange', 'the high school'];
const CREWS = ['the Rattlesnake crew', 'Hollister\'s boys', 'the bunch in the white trucks', 'the Dry Fork crew', 'the men from the reservoir camp', 'Boyd\'s people'];

const daysSince = (s: GameState) => Math.max(0, s.clock.t - s.disaster.hitAt);
const hitDay = (s: GameState) => dayIndex(s.disaster.hitAt);

/** Scavenging is open once the stores have closed after the hit (and, after a nuclear war, the shelter weeks are over). */
export function scavengeOpen(s: GameState): boolean {
  const d = s.disaster;
  if (!d.kind || s.clock.t < d.hitAt) return false;
  if (d.kind === 'nuclear' && s.clock.t < d.hitAt + 14) return false;
  return d.tracks.stores < 0.5;
}

/** Make the places the first day they open (town, the interstate, the old Pruitt place), and add each neighbor's farm once it stands empty. */
export function ensurePlaces(s: GameState): Place[] {
  const S = scavengeOf(s);
  const day = dayIndex(s.clock.t);
  const town = Math.max(3, Math.round(s.site.miles * 1.609));
  if (!S.places.length) {
    const kinds: PlaceKind[] = ['hardware', 'pharmacy', 'gas', 'school'];
    kinds.forEach((k, i) => S.places.push(makePlace(`pl_${k}`, k, TOWN_NAMES[i], town + (k === 'gas' ? 1 : 0), day)));
    S.places.push(makePlace('pl_interstate', 'interstate', 'the jackknifed semis on the interstate', town + 9, day));
    S.places.push(makePlace('pl_pruitt', 'farm', 'the old Pruitt place, empty since the bank took it', 7, day));
  }
  for (const n of s.neighbors) {
    if (n.status !== 'left' && n.status !== 'gone') continue;
    if (S.places.some(p => p.neighbor === n.id)) continue;
    const p = makePlace(`pl_${n.id}`, 'farm', `the empty ${n.name.replace(/^the /, '').replace(/s$/, '')} place`, Math.max(1, n.km), day);
    p.neighbor = n.id;
    // whoever lived there took what they could carry, or someone got there first
    for (const k of Object.keys(p.left) as LootKey[]) { p.left[k] = Math.round(p.left[k]! * (n.kind === 'prepper' ? 1.6 : 1) * (n.status === 'left' ? 0.5 : 0.9)); p.start[k] = p.left[k]; }
    S.places.push(p);
  }
  return S.places;
}

function makePlace(id: string, kind: PlaceKind, name: string, km: number, day: number): Place {
  return { id, kind, name, km, left: { ...STOCKED[kind] }, start: { ...STOCKED[kind] }, opened: day };
}

/** 0 (untouched) … 1 (stripped): what's gone from the place, by value. */
export function pickedOver(p: Place): number {
  let a = 0, b = 0;
  for (const [k, n] of Object.entries(p.start) as Array<[LootKey, number]>) { const v = lootValue(k); b += n * v; a += (p.left[k] ?? 0) * v; }
  return b > 0 ? 1 - a / b : 1;
}

/** Others at it: the share of a place's goods that goes in a day, `since` days after the hit (fewer people left to look as the years pass). */
export function dailyLoss(kind: PlaceKind, since: number): number {
  const pressure = 0.25 + 0.75 * Math.exp(-since / 300);
  return 1 - Math.pow(0.5, pressure / HALF_LIFE[kind]);
}

/** Stale gas: the share of a can still good `since` days after the pumps stopped (about four months, then varnish). */
export function freshGas(since: number): number {
  if (since <= 120) return 1;
  return Math.max(0.25, 1 - 0.75 * (since - 120) / 600);
}

// ─────────────────────────────────────────────────────────────────────────
// Risk
// ─────────────────────────────────────────────────────────────────────────

/** How crowded the scavenging is: few the first weeks, the most in months 1–4, thinning after (people die, move on, settle). */
export function crowd(since: number): number {
  return Math.min(1, since / 20) * (0.35 + 0.65 * Math.exp(-since / 240));
}

export interface RiskParts { people: number; claim: number; dogs: number; hurt: number; fallout: number; sickness: number }

/** Chances on a run to a place (for the UI, and the roll). */
export function riskOf(s: GameState, p: Place, team = 2): RiskParts {
  const since = daysSince(s), law = s.disaster.tracks.law;
  const people = TRAFFIC[p.kind] * (1 - 0.8 * law) * crowd(since);
  const claim = p.claim ? 0.6 : 0;
  const dogs = (p.kind === 'interstate' ? 0.05 : 0.1) * Math.min(1, since / 60) * Math.max(0.3, Math.exp(-Math.max(0, since - 365) / 730));
  const hurt = 1 - Math.pow(1 - 0.1, team);
  const nuke = s.disaster.kind === 'nuclear' && since < 90;
  const fallout = nuke ? doseBetween(s.disaster.variant, since * 24, since * 24 + 10) * 0.6 : 0;
  const plague = s.disaster.kind === 'pandemic' || s.disaster.kind === 'bioweapon';
  const sickness = plague && (p.kind === 'pharmacy' || p.kind === 'school' || p.kind === 'interstate') ? Math.min(0.9, contagion(s).contact * 1.5) : 0;
  return { people, claim, dogs, hurt, fallout, sickness };
}

/** One word for the panel. */
export function riskWord(r: RiskParts): 'low' | 'some' | 'high' | 'deadly' {
  const any = 1 - (1 - r.people) * (1 - r.claim) * (1 - r.dogs);
  if (r.claim > 0 || r.fallout > 0.5) return 'deadly';
  if (any > 0.3 || r.sickness > 0.3 || r.fallout > 0.1) return 'high';
  return any > 0.12 ? 'some' : 'low';
}

// ─────────────────────────────────────────────────────────────────────────
// Sending people
// ─────────────────────────────────────────────────────────────────────────

/** Days out (there, a day of searching, back). */
export function runDays(p: Place, mode: Run['mode']): number {
  return mode === 'truck' ? (p.km > 120 ? 2 : 1) : Math.max(1, Math.ceil(2 * p.km / FOOT_KM_DAY)) + (p.km > 4 ? 1 : 0);
}

export function runProblem(s: GameState, placeId: string, team: string[], mode: Run['mode']): string | null {
  if (!scavengeOpen(s)) return s.disaster.kind && s.clock.t >= s.disaster.hitAt && s.disaster.tracks.stores >= 0.5 ? 'the stores are open: no need' : 'the stores are still open: nothing to scavenge yet';
  const S = scavengeOf(s);
  if (S.run) return 'a run is already out';
  if (s.rescue?.raid) return 'the rescue is out';
  const p = S.places.find(x => x.id === placeId);
  if (!p) return 'no such place';
  if (!team.length) return 'pick who goes';
  if (team.length > 4) return 'four at most';
  if (team.some(id => { const q = s.people.find(x => x.id === id); return !q || !canGo(s, q) || q.age < 16; })) return 'someone picked can\'t go';
  if (mode === 'truck') {
    if (team.length > 3) return 'the truck takes three';
    const f = tripFuel(s, p.km);
    if (!f.truck) return 'no running truck';
    if (f.have < f.liters) return `not enough fuel: ${f.liters} L there and back`;
  }
  return null;
}

/** Send them. */
export function startRun(s: GameState, placeId: string, team: string[], mode: Run['mode'], roe: Roe = 'talk'): string | null {
  const why = runProblem(s, placeId, team, mode);
  if (why) return why;
  const S = scavengeOf(s);
  const p = S.places.find(x => x.id === placeId)!;
  const day = dayIndex(s.clock.t);
  if (mode === 'truck') {
    const { truck, liters } = tripFuel(s, p.km);
    const fromTank = Math.min(truck!.fuel, liters);
    truck!.fuel -= fromTank;
    s.stock.fuel = Math.max(0, s.stock.fuel - (liters - fromTank) / 20);
    truck!.mileage += 2 * p.km / 1.609; truck!.condition = Math.max(0, truck!.condition - 0.01);
  }
  S.run = { place: p.id, team: [...team], mode, roe, left: day, back: day + runDays(p, mode) };
  for (const id of team) { const ps = s.personState.find(x => x.id === id); if (ps) { ps.task = 'away'; ps.target = null; } }
  const names = team.map(id => s.people.find(x => x.id === id)?.first).filter(Boolean).join(', ');
  log(s, `${names} set out for ${p.name}${mode === 'truck' ? ' in the truck' : ' on foot'}. Back in ${S.run.back - day} day${S.run.back - day > 1 ? 's' : ''}, if it goes right.`);
  return null;
}

// ─────────────────────────────────────────────────────────────────────────
// The day they come back
// ─────────────────────────────────────────────────────────────────────────

const SKILL_FOR: Partial<Record<LootKey, SkillId>> = { meds: 'medic', hardware: 'mechanic', pipe: 'mechanic', cable: 'mechanic', fuel: 'mechanic', seed: 'gardener' };
const BOOKS: Array<[string, SkillId]> = [['Where There Is No Doctor', 'medic'], ['the Ball Blue Book of canning', 'gardener'], ['a Chilton manual for a Ford F-150', 'mechanic'], ['the ARRL Handbook', 'radio'], ['an old Foxfire book', 'builder'], ['the Army field manual on first aid', 'medic'], ['Gardening When It Counts', 'gardener'], ['a Boy Scout handbook', 'hunter']];

export interface RunResult { title: string; text: string; tone: 'good' | 'mixed' | 'bad'; lines: string[]; haul: Partial<Record<LootKey, number>>; value: number }

/** Choose what to carry: the best value for the weight first, up to `kg`. Pure. */
export function chooseHaul(found: Partial<Record<LootKey, number>>, kg: number): Partial<Record<LootKey, number>> {
  const out: Partial<Record<LootKey, number>> = {};
  const keys = (Object.keys(found) as LootKey[]).filter(k => (found[k] ?? 0) > 0).sort((a, b) => lootValue(b) / weightOf(b) - lootValue(a) / weightOf(a));
  let room = kg;
  for (const k of keys) {
    const w = weightOf(k);
    const n = Math.min(found[k]!, Math.floor(room / w));
    if (n <= 0) continue;
    out[k] = n; room -= n * w;
  }
  return out;
}

function hurtOne(s: GameState, pid: string, what: string, sev: number, trauma = false): void {
  const ps = s.personState.find(x => x.id === pid);
  if (!ps || ps.needs.died != null) return;
  sev = Math.round(sev * diffOf(s.disaster).wound);
  ps.needs.hurt.push({ what, sev, ...(trauma ? { trauma: true } : {}) });
  ps.needs.health = Math.max(s.disaster.difficulty === 'cozy' ? 5 : 1, ps.needs.health - sev * 0.4);
}

/** Bring it home: into the stockpile, the ammo cans, the trade-goods bag; books get read. */
function unload(s: GameState, haul: Partial<Record<LootKey, number>>, r: () => number, lines: string[]): void {
  for (const [k, n] of Object.entries(haul) as Array<[LootKey, number]>) {
    if (!n) continue;
    if (k.startsWith('ammo:')) { const c = k.slice(5) as Caliber; s.armory.ammo[c] = (s.armory.ammo[c] ?? 0) + n; continue; }
    if (k.startsWith('bag:')) { const b = bagOf(s); const g = k.slice(4) as BagGood; b[g] = (b[g] ?? 0) + n; continue; }
    if (k === 'books') {
      for (let i = 0; i < n; i++) {
        const [title, skill] = pick(r, BOOKS);
        const adults = s.people.filter((p, j) => !p.kid && s.personState[j]?.needs.died == null);
        const reader = adults.sort((a, b) => a.skills[skill] - b.skills[skill])[0];
        if (reader && reader.skills[skill] < 6) { reader.skills[skill] += 1; lines.push(`${title}: ${reader.first} read it cover to cover (${skill} ${reader.skills[skill]}).`); }
        else lines.push(`${title}, for the shelf.`);
      }
      continue;
    }
    (s.stock as Record<string, number>)[k] = ((s.stock as Record<string, number>)[k] ?? 0) + n;
  }
}

const label = (k: LootKey, n: number) => k.startsWith('ammo:') ? `${n} rounds of ${CALIBER[k.slice(5) as Caliber].name}` : k.startsWith('bag:') ? `${n} ${BAG_BASE[k.slice(4) as BagGood].unit}` : k === 'books' ? `${n} book${n > 1 ? 's' : ''}` : `${n} ${MATERIALS[k as keyof typeof MATERIALS].name.toLowerCase()}`;
export const haulText = (h: Partial<Record<LootKey, number>>) => (Object.entries(h) as Array<[LootKey, number]>).filter(([, n]) => n > 0).map(([k, n]) => label(k, n)).join(', ');

/** Run the trip: who they meet, what happens, what they bring back. Mutates the state; returns the card. */
export function resolveRun(s: GameState, run: Run): RunResult {
  const S = scavengeOf(s);
  const p = S.places.find(x => x.id === run.place)!;
  const day = dayIndex(s.clock.t);
  const since = daysSince(s);
  const r = mulberry32(s.seed * 5167 + run.left * 97 + p.id.length * 13 + run.team.length);
  const lines: string[] = [];
  const names = run.team.map(id => s.people.find(x => x.id === id)?.first).filter(Boolean) as string[];
  const who = names.join(', ');
  const negotiator = Math.max(0, ...run.team.map(id => s.people.find(x => x.id === id)?.skills.negotiator ?? 0));
  const hunter = Math.max(0, ...run.team.map(id => s.people.find(x => x.id === id)?.skills.hunter ?? 0));
  const risk = riskOf(s, p, run.team.length);
  let search = 1;        // share of a full day's searching they got
  let haulShare = 1;     // share of the haul that came home
  let tone: RunResult['tone'] = 'good', title = `Back from ${p.name}`;
  let fought = false;

  const fight = (size: number, temper: RaiderTemper, seed: number): 'won' | 'lost' => {
    fought = true;
    const f = fightAtCamp(s, run.team, { camp: size, temper, status: 'traded' }, seed);
    lines.push(...applyCasualties(s, f.battle));
    let rounds = 0;
    for (const [cal, n] of Object.entries(f.spent) as Array<[Caliber, number]>) { s.armory.ammo[cal] = Math.max(0, (s.armory.ammo[cal] ?? 0) - n); rounds += n; }
    if (rounds) lines.push(`${rounds} rounds fired.`);
    return f.result === 'wiped' || f.result === 'routed' ? 'won' : 'lost';
  };

  // a crew that has claimed the place
  if (p.claim && r() < risk.claim) {
    const c = p.claim;
    if (run.roe === 'avoid' && r() < 0.4 + 0.05 * hunter) {
      search = 0; tone = 'mixed'; title = `${cap(c.crew)} hold ${p.name}`;
      lines.push(`Lookouts on the roof, a truck across the road. ${who} watched from the trees for an hour and came home empty.`);
      c.known = true;
    } else {
      lines.push(`${cap(c.crew)} were dug in at ${p.name}. Somebody up on the roof saw them first.`);
      const res = fight(Math.min(c.size, 8), 'savage', s.seed * 211 + day);
      c.known = true;
      if (res === 'won') { lines.push(`${cap(c.crew)} broke. What they'd piled up is the family's now.`); p.claim = undefined; search = 0.6; for (const k of Object.keys(p.left) as LootKey[]) p.left[k] = Math.round((p.left[k] ?? 0) * 1.3); tone = 'mixed'; title = 'A fight for it'; }
      else { search = 0; haulShare = 0; tone = 'bad'; title = 'Driven off'; lines.push('They ran for it with what they had on their backs.'); }
    }
  } else if (r() < risk.people) {
    // other scavengers
    const temper = raiderTemper(s, 'looters', r);
    const size = 2 + Math.floor(r() * 4);
    const them = `${size} ${temper === 'desperate' ? 'people, thin and filthy' : temper === 'hard' ? 'men with rifles' : 'men who didn\'t look like they wanted to talk'}`;
    lines.push(`Somebody else was at ${p.name}: ${them}.`);
    if (temper === 'savage' && !(run.roe === 'avoid' && r() < 0.5 + 0.05 * hunter)) {
      lines.push('They opened up without a word.');
      const res = fight(size, 'savage', s.seed * 223 + day);
      if (res === 'lost') { search = 0.2; haulShare = 0.3; tone = 'bad'; title = 'Ambushed'; } else { search = 0.7; tone = 'mixed'; title = 'Shot their way out'; }
    } else if (run.roe === 'avoid') {
      search = 0.4; tone = 'mixed';
      lines.push(`${who} backed off and waited them out. Not much time left to look.`);
    } else if (run.roe === 'fight') {
      lines.push(`${who} didn't wait to find out what they wanted.`);
      if (temper === 'desperate') s.gate.humanity = Math.max(0, s.gate.humanity - 4);
      const res = fight(size, temper, s.seed * 227 + day);
      if (res === 'won') { search = 0.8; tone = 'mixed'; title = 'A fight for it'; s.stock.canned += Math.floor(r() * 3); }
      else { search = 0.2; haulShare = 0.4; tone = 'bad'; title = 'Driven off'; }
    } else {
      const calm = temper === 'desperate' || r() < 0.45 + 0.07 * negotiator;
      if (calm) {
        search = 0.6; tone = 'mixed';
        lines.push(pick(r, [
          '"We\'ll take the back, you take the front. Nobody needs to get shot today."',
          '"You from out on the bench? Heard the Gatlin crew is working the river road. Watch yourselves."',
          '"There\'s nothing in the pharmacy. Don\'t bother. We looked."',
          '"Got a smoke? No? Didn\'t think so."',
        ]));
        if (temper === 'desperate' && s.stock.canned >= 1 && r() < 0.5) { s.stock.canned -= 1; s.gate.humanity = Math.min(100, s.gate.humanity + 2); lines.push(`${names[0]} gave them a case of canned food from the truck. One of the kids cried.`); }
      } else {
        lines.push('Words, then shouting, then somebody raised a rifle.');
        const res = fight(size, temper, s.seed * 229 + day);
        if (res === 'won') { search = 0.7; tone = 'mixed'; title = 'It went bad'; } else { search = 0.2; haulShare = 0.4; tone = 'bad'; title = 'Driven off'; }
      }
    }
  }
  // feral dogs
  if (search > 0 && r() < risk.dogs) {
    const armedTeam = s.armory.guns.some(g => run.team.includes(g.carrier ?? '')) || s.armory.guns.length > 0;
    const bit = pick(r, run.team);
    const q = s.people.find(x => x.id === bit);
    if (armedTeam && r() < 0.7) { lines.push(`A pack of dogs came out from under ${p.kind === 'farm' ? 'the porch' : 'a loading dock'}, eight or ten of them. A couple of shots and they scattered.`); if (s.armory.ammo['12ga']) s.armory.ammo['12ga'] = Math.max(0, s.armory.ammo['12ga'] - 2); }
    else if (q) { hurtOne(s, bit, 'dog bites on the leg', 20 + Math.floor(r() * 15), true); lines.push(`Dogs, a whole pack gone wild. They got ${q.first} by the leg before they were beaten off.`); tone = tone === 'good' ? 'mixed' : tone; }
  }
  // falls, nails, glass
  if (search > 0) for (const id of run.team) {
    const q = s.people.find(x => x.id === id), ps = s.personState.find(x => x.id === id);
    if (!q || !ps || ps.needs.died != null) continue;
    const u = r();
    if (u < 0.03) { hurtOne(s, id, p.kind === 'school' ? 'a broken wrist (fell through the gym roof)' : 'a bad fall (a rotten floor gave way)', 30 + Math.floor(r() * 15)); lines.push(`${q.first} went through a rotten floor. Something's broken.`); }
    else if (u < 0.07) {
      hurtOne(s, id, 'a rusty nail through the boot', 10);
      lines.push(`${q.first} stepped on a nail in the dark, straight through the boot.`);
      // no booster shots now: a puncture with dirt in it can turn to tetanus a week or two later
      const cleaned = s.stock.meds >= 0.2;
      if (cleaned) s.stock.meds -= 0.2;
      if (r() < (cleaned ? 0.06 : 0.15)) S.tetanus.push({ pid: id, day: day + 4 + Math.floor(r() * 11) });
    } else if (u < 0.1) { hurtOne(s, id, 'a deep cut on broken glass', 18, true); lines.push(`${q.first} cut a hand open on a broken window.`); }
  }
  // fallout on the ground, the sick and the dead
  if (risk.fallout > 0) {
    for (const id of run.team) { const ps = s.personState.find(x => x.id === id); if (ps) ps.needs.dose += risk.fallout; }
    lines.push(`Gray dust on everything in town. The dosimeter says ${risk.fallout >= 0.1 ? `${risk.fallout.toFixed(2)} Sv` : `${Math.round(risk.fallout * 1000)} mSv`} each.`);
  }
  if (risk.sickness > 0 && r() < risk.sickness) { const l = infect(s, r, `caught it at ${p.name}`); if (l) { lines.push('Bodies in the rooms. Nobody had come for them.'); lines.push(l); } }
  // the search
  const team = run.team.filter(id => s.personState.find(x => x.id === id)?.needs.died == null).length;
  let value = 0;
  let haul: Partial<Record<LootKey, number>> = {};
  if (search > 0 && team > 0) {
    const found: Partial<Record<LootKey, number>> = {};
    for (const [k, n] of Object.entries(p.left) as Array<[LootKey, number]>) {
      if (!n) continue;
      const sk = SKILL_FOR[k];
      const best = sk ? Math.max(0, ...run.team.map(id => s.people.find(x => x.id === id)?.skills[sk] ?? 0)) : 0;
      const f = 1 - Math.exp(-0.18 * team * search * (1 + 0.08 * best));
      found[k] = Math.floor(n * f + r());
    }
    haul = chooseHaul(found, run.mode === 'truck' ? TRUCK_KG : PACK_KG * team);
    for (const [k, n] of Object.entries(haul) as Array<[LootKey, number]>) p.left[k] = Math.max(0, (p.left[k] ?? 0) - n);
    if (haulShare < 1) for (const k of Object.keys(haul) as LootKey[]) haul[k] = Math.floor(haul[k]! * haulShare);
    // stale gas
    if (haul.fuel) {
      const good = Math.round(haul.fuel * freshGas(since));
      if (good < haul.fuel) lines.push(`${haul.fuel - good} of the ${haul.fuel} cans had gone to varnish; they dumped them.`);
      haul.fuel = good;
    }
    unload(s, haul, r, lines);
    value = Object.entries(haul).reduce((a, [k, n]) => a + lootValue(k as LootKey) * (n ?? 0), 0);
  }
  p.visited = day;
  S.runs++; S.hauled += value;
  const got = haulText(haul);
  const dead = run.team.filter(id => s.personState.find(x => x.id === id)?.needs.died != null).map(id => s.people.find(x => x.id === id)?.first);
  if (dead.length) { tone = 'bad'; title = `${dead.join(' and ')} didn't come back`; }
  const left = pickedOver(p);
  const text = got ? `${who} brought back ${got}.` : search > 0 ? `${who} came back with nothing worth the walk.${left > 0.85 ? ' The place is stripped.' : ''}` : `${who} came back with nothing.`;
  if (!fought && !got && tone === 'good') tone = 'mixed';
  S.history.push({ day, place: p.name, text: got ? `brought back ${got}` : 'nothing' });
  if (S.history.length > 12) S.history.splice(0, S.history.length - 12);
  return { title, text, tone, lines: lines.filter(Boolean), haul, value };
}

const cap = (x: string) => x[0].toUpperCase() + x.slice(1);

// ─────────────────────────────────────────────────────────────────────────
// Once a day
// ─────────────────────────────────────────────────────────────────────────

/** Once a day: others pick the places over, crews claim and leave places, tetanus shows, and the run comes home. */
export function scavengeDay(s: GameState): string[] {
  const out: string[] = [];
  if (!s.disaster.kind || s.clock.t < s.disaster.hitAt) return out;
  const S = scavengeOf(s);
  const day = dayIndex(s.clock.t);
  const since = daysSince(s);
  if (scavengeOpen(s) || S.places.length) ensurePlaces(s);
  const r = mulberry32(s.seed * 3917 + day * 41);
  for (const p of S.places) {
    const loss = dailyLoss(p.kind, Math.max(0, day - hitDay(s)));
    for (const k of Object.keys(p.left) as LootKey[]) p.left[k] = (p.left[k] ?? 0) * (1 - loss);
    if (p.claim && day >= p.claim.until) { p.claim = undefined; }
    if (!p.claim && p.kind !== 'farm' && s.disaster.tracks.law < 0.3 && since > 45 && r() < 0.003) {
      p.claim = { crew: pick(r, CREWS), size: 6 + Math.floor(r() * 7), until: day + 90 + Math.floor(r() * 150), known: r() < 0.4 };
      if (p.claim.known) out.push(`Word is ${p.claim.crew} have taken over ${p.name}. They shoot anyone who comes near.`);
    }
  }
  // round down what's left so the panel doesn't show 0.3 of a can
  for (const p of S.places) for (const k of Object.keys(p.left) as LootKey[]) if ((p.left[k] ?? 0) < 0.5) p.left[k] = 0;
  // tetanus a week or two after the nail
  for (const t of S.tetanus.filter(x => x.day <= day)) {
    const q = s.people.find(x => x.id === t.pid), ps = s.personState.find(x => x.id === t.pid);
    if (q && ps && ps.needs.died == null) { ps.needs.hurt.push({ what: 'tetanus: lockjaw and spasms', sev: 75 }); ps.needs.health = Math.max(1, ps.needs.health - 15); out.push(`${q.first}'s jaw has locked. The muscles in the back arch and won't let go. It's tetanus, from that nail.`); }
  }
  S.tetanus = S.tetanus.filter(x => x.day > day);
  // home
  const run = S.run;
  if (run && day >= run.back) {
    const res = resolveRun(s, run);
    S.run = null;
    for (const id of run.team) { const ps = s.personState.find(x => x.id === id); if (ps && ps.needs.died == null) { ps.task = 'idle'; ps.target = null; } }
    out.push(`${res.title}. ${res.text}`);
    for (const l of res.lines) out.push(l);
    // a card when something happened worth stopping for
    if (res.tone === 'bad' || res.lines.some(l => /wounded|killed|broken|tetanus|Dogs/.test(l))) s.gate.card ??= { title: res.title, text: res.text, tone: res.tone, lines: res.lines };
  }
  return out;
}
