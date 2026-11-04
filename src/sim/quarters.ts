/**
 * Assigned quarters (docs/DECISIONS.md, "Assigned quarters"): every household
 * (a family, a couple, a party that joined together) is assigned to a home, a
 * building with beds. The game assigns by bed count, ages and need; the player
 * can move a household to another building (it is stored as each member's
 * `home`, the same field sim/newcomers.ts `givePlace` uses) and mark a few
 * buildings with a role: a sick bay and a guards' quarters.
 *
 * Pure, and no runtime import of housing.ts (housing.ts calls in here). The
 * three real effects share ONE table, `Q`:
 *   1. morale and privacy: sharing a room or a roof with another household,
 *      and sleeping more people than beds, cost a little morale and sleep;
 *   2. illness: a shared sleeping space spreads it faster, a separate building
 *      slower; a sick bay holds the sick apart (sim/medical.ts spread);
 *   3. watch: guards housed by the gate or in a tower are up faster in a raid,
 *      and anybody housed far from the house is slower to their post
 *      (sim/battle.ts). A delay depends only on where people sleep, never on
 *      the defenses, so a stronger lot is still never an easier raid.
 */
import type { GameState } from './state';
import type { Person } from './family';

export type QuartersRole = 'sickbay' | 'guards';
export const ROLE_NAME: Record<QuartersRole, string> = { sickbay: 'Sick bay', guards: 'Guards’ quarters' };
export const ROLE_HINT: Record<QuartersRole, string> = {
  sickbay: 'The sick are housed here when the family keeps them apart; illness spreads from here slowly.',
  guards: 'The people who live here are the watch. Near the gate or in a tower they are up faster in a raid.',
};

export interface QuartersState {
  /** Structure id → its role (at most one sick bay and one guards’ quarters). */
  roles: Record<string, QuartersRole>;
}
export const newQuarters = (): QuartersState => ({ roles: {} });
export function quartersOf(s: GameState): QuartersState { s.quarters ??= newQuarters(); return s.quarters; }
/** The building with this role, if one is set. */
export const roleHome = (s: GameState, role: QuartersRole): string | null => Object.entries(s.quarters?.roles ?? {}).find(([, r]) => r === role)?.[0] ?? null;

/** Every first-pass number in one place (small on purpose; flagged in docs/DECISIONS.md). */
export const Q = {
  /** Morale target: bunk / couch / floor shared with another household; a bed under a roof another household shares. */
  shareRoom: -1, shareRoof: -0.5,
  /** Morale target lost per unit over a building's beds (people ÷ beds − 1, ×this), capped. */
  crowd: 2, crowdCap: 1.5,
  /** Morale target total never worse than this; sleep (hours of tiredness) per point of morale lost, capped. */
  moraleCap: 3, tiredPerPoint: 0.5, tiredCap: 1.5,
  /** Illness: chance multipliers by who the two people are to each other. */
  contactSharedRoom: 1.25, contactOtherBuilding: 0.7,
  /** Quarantine in a sick bay building (the medical bay's own figure in medical.ts). */
  sickbayIso: 0.15,
  /** Raid: seconds. Guards by the gate (or up a tower), guards elsewhere at night; beyond `farM` metres from the house, per metre, capped. */
  guardGate: -1.2, guardElse: -0.5, gateM: 30, farM: 18, farPerM: 0.12, farCap: 2.5,
};

/** Bed space a person takes (babies and small kids share). Same as housing.ts. */
export const bedSpace = (p: Pick<Person, 'age'>): number => (p.age <= 2 ? 0.25 : p.age <= 7 ? 0.5 : 1);
const isElder = (p: Person) => !!p.elder || p.age >= 65;
const wantsOwnPlace = (p: Pick<Person, 'rel' | 'elder'>) => !!p.rel || !!p.elder;

// ── Households ─────────────────────────────────────────────────────────────

export interface Household {
  /** The first member's id (stable while he or she lives here). */
  id: string;
  members: Person[];
  /** "The Archers". */
  name: string;
}

/**
 * Who lives together: partners and their children; a relative who came with
 * their own partner is a household of their own; a party that joined together
 * is one (same origin kind, place and day). Children with no parent on record
 * stay with the founding family.
 */
export function householdsOf(people: readonly Person[]): Household[] {
  const parent = new Map<string, string>();
  const find = (a: string): string => { let r = a; while (parent.get(r) !== r) r = parent.get(r)!; parent.set(a, r); return r; };
  const union = (a: string, b: string) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(rb, ra); };
  for (const p of people) parent.set(p.id, p.id);
  const byId = new Map(people.map(p => [p.id, p] as const));
  const party = new Map<string, string>();
  for (const p of people) {
    if (p.partner && byId.has(p.partner)) union(p.id, p.partner);
    if (p.kid) for (const q of p.parents ?? []) if (byId.has(q)) { union(p.id, q); break; }
    if (p.origin) {
      const k = `${p.origin.kind}|${p.origin.from ?? ''}|${p.origin.since}`;
      const first = party.get(k);
      if (first) union(first, p.id); else party.set(k, p.id);
    }
  }
  const founder = people.find(p => !p.kid && !p.rel && !p.origin);
  if (founder) for (const p of people) if (p.kid && !p.rel && !p.origin && !(p.parents ?? []).some(q => byId.has(q)) && !p.partner) union(founder.id, p.id);
  const groups = new Map<string, Person[]>();
  for (const p of people) { const r = find(p.id); (groups.get(r) ?? groups.set(r, []).get(r)!).push(p); }
  return [...groups.values()].map(m => ({ id: m[0].id, members: m, name: `The ${m.find(x => !x.kid)?.last ?? m[0].last}s` }));
}

// ── Auto-assign ────────────────────────────────────────────────────────────

export interface Home { id: string; kind: string; beds: number }

/** How badly a household needs a good place: elders, then little kids, then the rest. */
const need = (h: Household): number => h.members.reduce((a, p) => a + (isElder(p) ? 3 : p.age <= 7 ? 2 : p.kid ? 1 : 0), 0);

/**
 * A home for each household that does not already have one chosen. Households
 * go in order of need (elders, little kids, then larger first); each takes the
 * first home, in building order, with room for the WHOLE household (relatives
 * and elders try the separate dwellings first). Someone whose `home` is set (the
 * player moved them, or the family gave them a place) is left as chosen, and
 * their bed space is counted. A household no single home holds is left to
 * housing.ts, which spreads it over the beds there are. Returns person id →
 * structure id for the people it placed.
 */
export function autoHomes(people: readonly Person[], homes: readonly Home[], separate: ReadonlySet<string>): Map<string, string> {
  const out = new Map<string, string>();
  const left = new Map(homes.map(h => [h.id, h.beds] as const));
  for (const p of people) if (p.home && left.has(p.home)) left.set(p.home, left.get(p.home)! - bedSpace(p));
  const hh = householdsOf(people).sort((a, b) => need(b) - need(a) || b.members.length - a.members.length);
  for (const h of hh) {
    const todo = h.members.filter(p => !(p.home && left.has(p.home)));
    if (!todo.length) continue;
    const space = todo.reduce((a, p) => a + bedSpace(p), 0);
    const own = todo.every(wantsOwnPlace);
    const order = own ? [...homes.filter(x => separate.has(x.kind)), ...homes.filter(x => !separate.has(x.kind))] : homes;
    const pick = order.find(x => left.get(x.id)! + 1e-9 >= space);
    if (!pick) continue;
    left.set(pick.id, left.get(pick.id)! - space);
    for (const p of todo) out.set(p.id, pick.id);
  }
  return out;
}

/**
 * Where the sick sleep when the family keeps them apart: the sick bay building
 * if there is one with a bed free (the contagious, in order). Person id → structure id.
 */
export function sickbayHomes(sickIds: readonly string[], sickbay: Home | null, taken: number): Map<string, string> {
  const out = new Map<string, string>();
  if (!sickbay) return out;
  let room = sickbay.beds - taken;
  for (const id of sickIds) if (room >= 1) { out.set(id, sickbay.id); room--; }
  return out;
}

// ── Morale and sleep ───────────────────────────────────────────────────────

/** Where one person sleeps tonight, as far as quarters are concerned. */
export interface Place { id: string; where: string | null; kind: string }
const ROOF_SHARED = new Set(['bunk', 'couch', 'floor']);

export interface QuartersFx { morale: number; tired: number; note: string }

/**
 * The cost of crowding, per person: only under a roof (a bed, bunk, couch or
 * floor in a building); tents and the shop have their own rules in housing.ts.
 * Children under 8 are not bothered. `beds` is the building's bed count.
 */
export function crowdingFx(places: readonly Place[], people: readonly Person[], beds: ReadonlyMap<string, number>): Map<string, QuartersFx> {
  const hh = householdsOf(people), hOf = new Map<string, string>();
  for (const h of hh) for (const m of h.members) hOf.set(m.id, h.id);
  const pById = new Map(people.map(p => [p.id, p] as const));
  const byWhere = new Map<string, Place[]>();
  for (const pl of places) if (pl.where && ['bed', 'bunk', 'couch', 'floor'].includes(pl.kind)) (byWhere.get(pl.where) ?? byWhere.set(pl.where, []).get(pl.where)!).push(pl);
  const out = new Map<string, QuartersFx>();
  for (const [where, here] of byWhere) {
    const houses = new Set(here.map(x => hOf.get(x.id)));
    const cap = Math.max(1, beds.get(where) ?? 1);
    const over = Math.max(0, here.length / cap - 1);
    for (const pl of here) {
      const p = pById.get(pl.id);
      if (!p || p.age <= 7) continue;
      let m = 0, why = '';
      if (houses.size > 1) { m += ROOF_SHARED.has(pl.kind) ? Q.shareRoom : Q.shareRoof; why = ROOF_SHARED.has(pl.kind) ? 'sharing a room with another household' : 'sharing the house with another household'; }
      if (over > 0) { m -= Math.min(Q.crowdCap, over * Q.crowd); why = why ? `${why}, crowded` : 'crowded'; }
      m = Math.max(-Q.moraleCap, m);
      if (m < -1e-9) out.set(pl.id, { morale: m, tired: Math.min(Q.tiredCap, -m * Q.tiredPerPoint), note: why });
    }
  }
  return out;
}

// ── Illness ────────────────────────────────────────────────────────────────

/** Chance multiplier for an illness passing from a sick person `a` to `b` (1 = as before quarters existed). */
export function contactFactor(a: Place | undefined, b: Place | undefined): number {
  if (!a || !b || !a.where || !b.where) return 1;
  if (a.where !== b.where) return Q.contactOtherBuilding;
  return ROOF_SHARED.has(a.kind) || ROOF_SHARED.has(b.kind) ? Q.contactSharedRoom : 1;
}

// ── Raids ──────────────────────────────────────────────────────────────────

export interface Pt { x: number; z: number }
export const dist2 = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.z - b.z);

/** The point `d` metres along a polyline. */
export function pointAlong(pts: ReadonlyArray<readonly [number, number]>, d: number): Pt | null {
  if (pts.length === 0) return null;
  let left = d;
  for (let i = 1; i < pts.length; i++) {
    const len = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    if (left <= len || i === pts.length - 1) { const t = len > 0 ? Math.max(0, Math.min(1, left / len)) : 0; return { x: pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t, z: pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t }; }
    left -= len;
  }
  return { x: pts[0][0], z: pts[0][1] };
}

/** Where the gate is: the first real gate on the longest run of the property line. Null with no gate. */
export function gatePoint(s: GameState): Pt | null {
  const runs = s.perimeter.filter(r => r.finishedAt !== null && r.gates.some(g => !g.sally)).sort((a, b) => b.pts.length - a.pts.length);
  const run = runs[0];
  if (!run) return null;
  return pointAlong(run.pts, run.gates.find(g => !g.sally)!.at);
}

/**
 * Seconds to add to someone's readiness when a raid comes: negative for guards
 * quartered by the gate or up a tower (more so at night, when everyone else is
 * asleep), positive for anyone housed far from the house. `house` is the
 * centre the defense is built round. Zero for everybody sleeping in the house.
 */
export function raidDelta(o: { at: Pt | null; role: QuartersRole | null; tower: boolean; house: Pt; gate: Pt | null; night: boolean }): number {
  if (!o.at) return 0;
  let d = 0, byGate = o.tower;
  if (o.role === 'guards' || o.tower) {
    byGate = o.tower || (!!o.gate && dist2(o.at, o.gate) <= Q.gateM);
    d += byGate ? Q.guardGate : o.night ? Q.guardElse : 0;
  }
  // the watch lives where its post is: no penalty for being by the gate
  const far = Math.max(0, dist2(o.at, o.house) - Q.farM);
  if (!byGate) d += Math.min(Q.farCap, far * Q.farPerM);
  return d;
}

/** One line for the Family panel: what the arrangement costs or gains. Empty when it is all ordinary. */
export function summaryLine(fx: ReadonlyMap<string, QuartersFx>): string {
  if (fx.size === 0) return '';
  const worst = [...fx.values()].reduce((a, b) => (b.morale < a.morale ? b : a));
  return `${fx.size} ${fx.size === 1 ? 'person is' : 'people are'} short of privacy (${worst.note}): about ${worst.morale.toFixed(1)} morale and less sleep.`;
}

// ── The hook housing.ts calls ──────────────────────────────────────────────

/** Is this person down with something that spreads (flu, dysentery)? */
export const contagious = (s: GameState, id: string): boolean => !!s.personState.find(x => x.id === id)?.needs.hurt.some(h => h.med?.kind === 'flu' || h.med?.kind === 'dysentery');

/**
 * Person id → the building they are quartered in tonight: the sick go to the
 * sick bay building while the family keeps the sick apart (and it has a bed);
 * everyone else follows their own `home` (chosen) or the auto-assignment.
 * `beds` are the bed pools of finished homes, in building order.
 */
export function quarterHomes(s: GameState, people: readonly Person[], beds: ReadonlyArray<{ where: string; beds: number; kind: string }>, separate: ReadonlySet<string>): Map<string, string> {
  const homes: Home[] = beds.map(b => ({ id: b.where, kind: b.kind, beds: b.beds }));
  // a joiner's own rig (sim/joinerHome.ts) is its owners' home, set when they park it: the auto-assignment never puts another household in it
  const shared = homes.filter(h => !s.structures.find(x => x.id === h.id)?.rig);
  const out = autoHomes(people, shared, separate);
  for (const p of people) if (p.home && homes.some(h => h.id === p.home)) out.set(p.id, p.home);
  const bay = roleHome(s, 'sickbay'), E = s.medical?.epidemic;
  if (bay && E?.quarantine) {
    const home = homes.find(h => h.id === bay) ?? null;
    const sick = people.filter(p => contagious(s, p.id)).map(p => p.id);
    const taken = people.filter(p => out.get(p.id) === bay && !sick.includes(p.id)).reduce((a, p) => a + bedSpace(p), 0);
    for (const [id, w] of sickbayHomes(sick, home, taken)) out.set(id, w);
  }
  return out;
}

/** A short key for housing.ts's plan cache: what the quarters depend on beyond the people and buildings. */
export function quartersKey(s: GameState): string {
  const r = s.quarters?.roles;
  const sick = s.medical?.epidemic?.quarantine ? s.people.filter(p => contagious(s, p.id)).map(p => p.id).join('.') : '';
  return `${r ? Object.entries(r).map(([k, v]) => k + v).join(',') : ''}|${sick}`;
}

// ── Player actions ─────────────────────────────────────────────────────────

const present = (s: GameState, id: string) => { const n = s.personState.find(x => x.id === id)?.needs; return !!n && n.died == null && !n.taken; };
export const livingPeople = (s: GameState): Person[] => s.people.filter(p => present(s, p.id));

/** Move a household to a building (each member's `home`), or back to the game's own choice with `null`. Returns why not, or null. */
export function moveHousehold(s: GameState, householdId: string, structureId: string | null, homeBeds: Record<string, number>): string | null {
  const h = householdsOf(livingPeople(s)).find(x => x.id === householdId);
  if (!h) return 'no such household';
  if (structureId === null) { for (const p of h.members) delete p.home; return null; }
  const st = s.structures.find(x => x.id === structureId);
  if (!st || st.finishedAt === null || !(homeBeds[st.kind] > 0)) return 'that is not a home';
  for (const p of h.members) p.home = structureId;
  return null;
}

/** Mark a building as the sick bay or the guards' quarters (null clears it). One building per role. */
export function setRole(s: GameState, structureId: string, role: QuartersRole | null): void {
  const q = quartersOf(s);
  for (const [k, v] of Object.entries(q.roles)) if (k === structureId || v === role) delete q.roles[k];
  if (role) q.roles[structureId] = role;
}

/** Who sleeps in a building tonight, by household name (the Spotlight / building line). */
export function residentsOfStructure(people: readonly Person[], places: readonly Place[], structureId: string): string[] {
  const inside = new Set(places.filter(x => x.where === structureId).map(x => x.id));
  return householdsOf(people).map(h => ({ h, n: h.members.filter(m => inside.has(m.id)) })).filter(x => x.n.length).map(x => `${x.h.name} (${x.n.map(m => m.first).join(', ')})`);
}
