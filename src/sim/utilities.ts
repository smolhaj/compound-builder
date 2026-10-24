/**
 * Utilities: running water and electricity, only through real
 * infrastructure (docs/DECISIONS.md). Buildings that make or store water
 * and power (wells, cistern, water tower, solar array, battery shed,
 * generator, septic) are joined to houses by drawn pipe / cable runs; a
 * building on a network can then be plumbed or wired (a fitting job:
 * fixtures or a wiring kit plus labour, faster with a mechanic).
 *
 * Every day the networks are balanced: solar output by season and sky,
 * what the wired buildings draw, the battery's charge, generator fuel;
 * well and cistern water against what the family uses (more once
 * plumbed), rain into the cisterns. Batteries fade, pumps fail and need
 * repair. Shortages are logged. Pure (tested).
 */
import { SPRING_LPD } from './site';
import { toteStorage, waterPrice } from './water';
import { sound } from './improvements';
import { REGIONS } from './regions';
import { log } from './economy';
import { calendarOf, dayIndex, type GameState, type Structure } from './state';
import { isFinished } from './construction';
import { runFinished, type PerimeterRun } from './perimeter';
import { hasAll, type MaterialId, type Stock } from './materials';
import { wellYield } from './effects';

/** What utility buildings provide. */
export interface UtilityDef {
  /** Water: liters a day it can deliver; pressurised (piped) or carried. */
  water?: { lpd: number; pressure: boolean; needsPower?: number };
  /** Water storage (liters) and roof catchment it collects (m² of the connected roofs count). */
  store?: number;
  /** Power: solar kW (peak), generator kW, battery kWh. */
  solarKw?: number; genKw?: number; batteryKwh?: number;
  /** Makes pressure for the network from storage (gravity tower). */
  gravity?: boolean;
  /** Waste: septic (lets toilets flush). */
  septic?: boolean;
}

export const UTILITY: Record<string, UtilityDef> = {
  well_hand: { water: { lpd: 900, pressure: false } },
  well_drilled: { water: { lpd: 6000, pressure: true, needsPower: 1.2 } },
  cistern: { store: 10000 },
  water_tower: { store: 4000, gravity: true },
  solar_array: { solarKw: 4.8 },
  battery_shed: { batteryKwh: 20 },
  generator_shed: { genKw: 7 },
  septic: { septic: true },
};

/** Daily power draw (kWh) of a wired building by kind, and water use (L/person/day) carried vs plumbed. */
export const DRAW_KWH: Record<string, number> = { timber_cabin: 5, log_house: 8, farmhouse: 9, trailer: 6, barn: 1, workshop: 4, root_cellar: 0.2, chicken_coop: 0.3, outhouse: 0, garden: 0, field: 0, greenhouse: 1, orchard: 0 };
export const WATER_CARRIED = 25, WATER_PLUMBED = 130;
/** Fitting jobs: hours and materials (per building). */
export const FIT = {
  plumb: { hours: 40, materials: { pipe: 2, fixtures: 1 } as Partial<Stock> },
  wire: { hours: 30, materials: { cable: 3, hardware: 1 } as Partial<Stock> },
};
/** Generator fuel: liters per kWh (a small gas generator). */
export const FUEL_L_PER_KWH = 0.45;
/** Liters in one stock unit of fuel (a 20 L jerry can). */
export const FUEL_UNIT_L = 20;

/** County grid: price per kWh and the daily service charge (rural co-op, 2020s). */
export const GRID_USD_PER_KWH = 0.14, GRID_USD_PER_DAY = 0.9;
/**
 * Who gets power first when there isn't enough (lower first): pumps, the
 * root cellar (freezer), homes, then the coop and the workshop.
 */
export const LOAD_PRIORITY: Record<string, number> = { well_drilled: 0, root_cellar: 1, timber_cabin: 2, log_house: 2, farmhouse: 2, trailer: 2, barn: 4, chicken_coop: 3, greenhouse: 3, workshop: 4 };

export interface Fitting { building: string; kind: 'plumb' | 'wire'; done: number; hours: number; supplied: boolean; finishedAt: number | null }

export interface Utilities {
  fittings: Fitting[];
  /** Battery state of charge (kWh) and capacity fade (0–1 of nameplate lost). */
  batteryKwh: number;
  batteryFade: number;
  /** Water in storage (liters). */
  storedL: number;
  /** Fuel burned toward the next can. */
  fuelL: number;
  /** Broken pumps (well ids) awaiting repair. */
  broken: string[];
  /** On the county grid (the account is open; whether it has power is the disaster clock's grid track). */
  grid: boolean;
  /** Electronics killed by an EMP (solar inverter, battery charger, generator, pump controller) until a spare goes in. */
  fried: string[];
  /** Yesterday the water came in buckets from the creek (the pump or the tank failed). */
  hauling?: boolean;
  /** …and the creek is a quarter mile off, on a neighbor's land (a long haul). */
  haulFar?: boolean;
  /** Buildings switched off at their breaker. */
  off: string[];
  /** Buildings that had power yesterday (lights on, fridge running). */
  lit: string[];
  /** Day index of the last balance, and the last day's report (HUD). */
  lastDay: number;
  report: UtilityReport;
}

export interface UtilityReport {
  solarKwh: number; drawKwh: number; genKwh: number; shortKwh: number; batteryPct: number;
  /** From the grid, and what it cost; loads cut for want of power (building ids). */
  gridKwh: number; billUsd: number; shed: string[];
  waterL: number; useL: number; shortL: number; storedL: number;
}

export function emptyUtilities(): Utilities {
  return { fittings: [], batteryKwh: 0, batteryFade: 0, storedL: 0, fuelL: 0, broken: [], fried: [], grid: false, off: [], lit: [], lastDay: -1, report: { solarKwh: 0, drawKwh: 0, genKwh: 0, shortKwh: 0, batteryPct: 0, gridKwh: 0, billUsd: 0, shed: [], waterL: 0, useL: 0, shortL: 0, storedL: 0 } };
}

// ─────────────────────────────────────────────────────────────────────────
// Networks
// ─────────────────────────────────────────────────────────────────────────

/** A building's footprint center and half-size (for "does this line reach it"). */
export interface Node { id: string; kind: string; x: number; z: number; r: number }

const segDist = (x: number, z: number, ax: number, az: number, bx: number, bz: number) => {
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)) : 0;
  return Math.hypot(x - (ax + dx * t), z - (az + dz * t));
};

/** Does a finished line touch a node (passes within its reach)? */
function touches(run: PerimeterRun, n: Node): boolean {
  for (let i = 1; i < run.pts.length; i++) if (segDist(n.x, n.z, run.pts[i - 1][0], run.pts[i - 1][1], run.pts[i][0], run.pts[i][1]) < n.r + 0.15) return true;
  return false;
}

/** Group nodes joined by finished lines of a kind (union–find). Returns node id → network id. */
export function networks(nodes: readonly Node[], lines: readonly PerimeterRun[]): Map<string, number> {
  const parent = new Map<string, string>();
  const find = (a: string): string => { let p = parent.get(a) ?? a; while (p !== (parent.get(p) ?? p)) p = parent.get(p) ?? p; parent.set(a, p); return p; };
  const join = (a: string, b: string) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb); };
  for (const l of lines) {
    if (!runFinished(l)) continue;
    const key = `line:${l.id}`;
    for (const n of nodes) if (touches(l, n)) join(key, n.id);
    // lines that cross or touch end to end join too
    for (const m of lines) if (m !== l && runFinished(m) && m.kind === l.kind && linesTouch(l, m)) join(key, `line:${m.id}`);
  }
  const ids = new Map<string, number>(), out = new Map<string, number>();
  for (const n of nodes) { const r = find(n.id); if (!ids.has(r)) ids.set(r, ids.size); out.set(n.id, ids.get(r)!); }
  return out;
}

function linesTouch(a: PerimeterRun, b: PerimeterRun): boolean {
  for (const [x, z] of [a.pts[0], a.pts[a.pts.length - 1]]) for (let i = 1; i < b.pts.length; i++) if (segDist(x, z, b.pts[i - 1][0], b.pts[i - 1][1], b.pts[i][0], b.pts[i][1]) < 0.2) return true;
  for (const [x, z] of [b.pts[0], b.pts[b.pts.length - 1]]) for (let i = 1; i < a.pts.length; i++) if (segDist(x, z, a.pts[i - 1][0], a.pts[i - 1][1], a.pts[i][0], a.pts[i][1]) < 0.2) return true;
  return false;
}

/** What a building has: its water and power networks' capabilities. */
export interface Service {
  /** Water: a pressurised source (or gravity tower) on its network. */
  water: boolean;
  /** Power: the county grid account, or a source (solar / generator / battery) on its network. */
  power: boolean;
  /** Septic on the water network (toilets can flush). */
  septic: boolean;
  plumbed: boolean;
  wired: boolean;
}

export interface Plant {
  /** Finished buildings as network nodes. */
  nodes: Node[];
  water: Map<string, number>;
  power: Map<string, number>;
}

/** Network membership for the current compound (half-size from footprints passed in). */
export function plant(s: GameState, halfSize: (kind: string) => number = k => NODE_R[k] ?? 0.4): Plant {
  const nodes = s.structures.filter(isFinished).map(st => ({ id: st.id, kind: st.kind, x: st.x, z: st.z, r: halfSize(st.kind) }));
  return {
    nodes,
    water: networks(nodes, s.perimeter.filter(r => r.kind === 'water_pipe')),
    power: networks(nodes, s.perimeter.filter(r => r.kind === 'power_cable')),
  };
}

function fitted(s: GameState, id: string, kind: Fitting['kind']): boolean {
  return s.utilities.fittings.some(f => f.building === id && f.kind === kind && f.finishedAt !== null);
}

export function serviceOf(s: GameState, p: Plant, id: string): Service {
  const net = (m: Map<string, number>, f: (k: string, id: string) => boolean) => { const n = m.get(id); return n !== undefined && p.nodes.some(o => m.get(o.id) === n && f(o.kind, o.id)); };
  const water = net(p.water, k => !!UTILITY[k]?.water?.pressure || !!UTILITY[k]?.gravity);
  const power = s.utilities.grid || net(p.power, k => !!(UTILITY[k]?.solarKw || UTILITY[k]?.genKw || UTILITY[k]?.batteryKwh));
  // a failed leach field (an old system that came with the land) doesn't count until it's fixed
  const septic = net(p.water, (k, sid) => !!UTILITY[k]?.septic && sound(s.structures.find(x => x.id === sid), 'septic'));
  return { water, power, septic, plumbed: water && fitted(s, id, 'plumb'), wired: power && fitted(s, id, 'wire') };
}

// ─────────────────────────────────────────────────────────────────────────
// Fitting jobs (plumb / wire a building)
// ─────────────────────────────────────────────────────────────────────────

/** Why a building can't be plumbed / wired now (null = it can be ordered). */
export function fitProblem(s: GameState, p: Plant, st: Structure, kind: Fitting['kind']): string | null {
  if (!isFinished(st)) return 'not built yet';
  if (s.utilities.fittings.some(f => f.building === st.id && f.kind === kind)) return kind === 'plumb' ? 'already plumbed' : 'already wired';
  // old, unsafe wiring or plumbing that came with the land: redo it first (Projects: the repair)
  if (!sound(st, kind === 'wire' ? 'wiring' : 'plumbing')) return kind === 'wire' ? 'the old wiring is unsafe: rewire the house first' : 'the old plumbing is shot: replumb it first';
  const sv = serviceOf(s, p, st.id);
  if (kind === 'plumb' && !sv.water) return 'no pressurised water reaches it (run a pipe from a drilled well or water tower)';
  if (kind === 'wire' && !sv.power) return 'no power reaches it (get on the county grid, or run a cable from the solar / battery / generator)';
  return null;
}

export function orderFit(s: GameState, building: string, kind: Fitting['kind']): Fitting {
  const f: Fitting = { building, kind, done: 0, hours: FIT[kind].hours, supplied: false, finishedAt: null };
  s.utilities.fittings.push(f);
  return f;
}

export function nextFit(s: GameState): Fitting | null {
  for (const f of s.utilities.fittings) if (f.finishedAt === null && (f.supplied || hasAll(s.stock, FIT[f.kind].materials))) return f;
  return null;
}

/** Work on a fitting; a mechanic's skill speeds it (rate = 0.5 + 0.1 × mechanic skill). */
export function addFitWork(s: GameState, f: Fitting, hours: number, mechanic: number): void {
  if (f.finishedAt !== null) return;
  if (!f.supplied) {
    if (!hasAll(s.stock, FIT[f.kind].materials)) return;
    for (const [k, n] of Object.entries(FIT[f.kind].materials) as Array<[keyof Stock, number]>) s.stock[k] -= n;
    f.supplied = true;
  }
  f.done += hours * (0.5 + 0.1 * mechanic);
  if (f.done >= f.hours) {
    f.finishedAt = s.clock.t;
    const st = s.structures.find(x => x.id === f.building);
    log(s, `The ${st?.kind.replace('_', ' ') ?? 'building'} is ${f.kind === 'plumb' ? 'plumbed: water on tap' : 'wired: lights on'}.`);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Daily balance
// ─────────────────────────────────────────────────────────────────────────

/** Peak sun hours a day (Mountain West, 2,000 m): about 2.5 in December to 6.5 in June. */
export function sunHours(doy: number): number {
  return 4.5 + 2 * Math.cos(2 * Math.PI * (doy - 172) / 365);
}

/** Half-size (world units) a line must reach to touch a building, and its roof area (m²) for rain catchment, by kind. */
export const NODE_R: Record<string, number> = { timber_cabin: 0.5, log_house: 0.75, farmhouse: 0.75, trailer: 0.6, barn: 1.0, workshop: 0.75, root_cellar: 0.4, chicken_coop: 0.4, garden: 0.7, field: 2.2, greenhouse: 0.6, orchard: 1.3, outhouse: 0.2, well_hand: 0.25, well_drilled: 0.3, cistern: 0.3, water_tower: 0.35, solar_array: 0.6, battery_shed: 0.3, generator_shed: 0.3, septic: 0.4 };
export const ROOF_M2: Record<string, number> = { timber_cabin: 70, log_house: 160, farmhouse: 140, trailer: 90, barn: 220, workshop: 120, chicken_coop: 6, greenhouse: 26, outhouse: 2, battery_shed: 8, generator_shed: 8, well_drilled: 6, well_hand: 3 };

/** Rain and snowmelt (mm a day, averaged by month): wet spring, dry late summer. */
export function rainMm(doy: number): number {
  return 1.1 + 0.6 * Math.sin(2 * Math.PI * (doy - 60) / 365);
}

/** Balance one day. `rnd` is the day's random (pump failures). */
export function balanceDay(s: GameState, p: Plant, rnd: number, roofM2: (kind: string) => number = k => ROOF_M2[k] ?? 0): void {
  const u = s.utilities, doy = calendarOf(s.clock).doy;
  const townOpen = s.disaster.tracks.deliveries > 0.5 && s.disaster.tracks.banks > 0.5;
  u.hauling = false;
  u.haulFar = false;
  const fin = s.structures.filter(isFinished);
  const kinds = new Map(fin.map(st => [st.id, st.kind]));
  // ── power: each network's own sources (solar → battery → grid → generator), loads served by priority ──
  const gridUp = u.grid && s.disaster.tracks.grid > 0.5;
  let solar = 0, draw = 0, gen = 0, short = 0, capKwh = 0, gridKwh = 0;
  const lit = new Set<string>(), shed: string[] = [];
  const loadOf = (o: Node) => u.off.includes(o.id) ? 0
    : UTILITY[o.kind]?.water?.needsPower ? (u.broken.includes(o.id) || u.fried.includes(o.id) ? 0 : UTILITY[o.kind]!.water!.needsPower!)
    : fitted(s, o.id, 'wire') ? DRAW_KWH[o.kind] ?? 0 : 0;
  const isSource = (o: Node) => !!(UTILITY[o.kind]?.solarKw || UTILITY[o.kind]?.genKw || UTILITY[o.kind]?.batteryKwh);
  const live = (o: Node) => !u.fried.includes(o.id);
  const groups = new Map<number | string, Node[]>();
  for (const o of p.nodes) {
    const n = p.power.get(o.id);
    const sourced = n !== undefined && p.nodes.some(x => p.power.get(x.id) === n && isSource(x));
    const key = sourced ? n! : `solo:${o.id}`;
    let l = groups.get(key); if (!l) groups.set(key, l = []); l.push(o);
  }
  for (const [key, members] of groups) {
    // a building on no network of its own: the grid or nothing (dark, no shortage to report)
    if (typeof key === 'string' && !gridUp) continue;
    const loads = members.filter(o => loadOf(o) > 0).sort((a, b) => (LOAD_PRIORITY[a.kind] ?? 2) - (LOAD_PRIORITY[b.kind] ?? 2));
    const d = loads.reduce((a, o) => a + loadOf(o), 0);
    const cap = members.filter(live).reduce((a, o) => a + (UTILITY[o.kind]?.batteryKwh ?? 0), 0) * (1 - u.batteryFade);
    const genKw = members.filter(live).reduce((a, o) => a + (UTILITY[o.kind]?.genKw ?? 0), 0);
    // grid-tied solar shuts off in a blackout unless a battery (hybrid inverter) is on the network
    const solarOk = gridUp || cap > 0 || !u.grid;
    const sol = solarOk ? members.filter(live).reduce((a, o) => a + (UTILITY[o.kind]?.solarKw ?? 0), 0) * sunHours(doy) * 0.8 : 0;
    draw += d; solar += sol; capKwh += cap;
    let have = sol;
    // battery: bank the surplus, cover the shortfall
    if (cap > 0) {
      if (have > d) { u.batteryKwh = Math.min(cap, u.batteryKwh + (have - d) * 0.92); have = d; }
      else { const take = Math.min(d - have, u.batteryKwh); u.batteryKwh -= take; have += take; }
    }
    // the county grid, while it's up
    if (have < d && gridUp) { gridKwh += d - have; have = d; }
    // the generator for the rest, while there's fuel
    if (have < d - 0.05 && genKw > 0) {
      const need = Math.min(d - have, genKw * 8);
      const fuel = s.stock.fuel * FUEL_UNIT_L - u.fuelL;
      const run = Math.min(need * FUEL_L_PER_KWH, Math.max(0, fuel));
      u.fuelL += run;
      while (u.fuelL >= FUEL_UNIT_L) { u.fuelL -= FUEL_UNIT_L; s.stock.fuel--; }
      const made = run / FUEL_L_PER_KWH;
      gen += made; have += made;
      if (fuel <= 0.01) log(s, 'The generator is out of fuel.');
    }
    // serve the loads in order of priority; the rest go without
    for (const o of loads) {
      if (have + 0.05 >= loadOf(o)) { have -= loadOf(o); lit.add(o.id); }
      else shed.push(o.id);
    }
    short += loads.filter(o => shed.includes(o.id)).reduce((a, o) => a + loadOf(o), 0);
  }
  if (short > 0.5) log(s, `Power ran short by ${short.toFixed(1)} kWh: lamps tonight.`);
  u.lit = [...lit];
  const bill = u.grid && gridUp ? gridKwh * GRID_USD_PER_KWH + GRID_USD_PER_DAY : 0;
  s.money -= bill;
  // batteries fade ~2.5 % a year with use
  if (capKwh > 0) u.batteryFade = Math.min(0.4, u.batteryFade + 0.025 / 365);

  // ── water: well delivery (powered pumps need power), rain into storage, use ──
  let supply = 0, store = 0;
  for (const st of fin) {
    const def = UTILITY[st.kind];
    if (!def) continue;
    if (def.water) {
      const powered = !def.water.needsPower || lit.has(st.id);
      if (!u.broken.includes(st.id) && powered) supply += def.water.lpd * wellYield(s, st.kind);
      // pumps wear out: ~1 failure in 2 years of use
      if (def.water.needsPower && !u.broken.includes(st.id) && rnd < 1 / 700) { u.broken.push(st.id); log(s, townOpen ? 'The well pump has failed. The well company is coming out ($850).' : 'The well pump has failed: a mechanic and a hardware kit to fix it.'); }
      // while the town works, the well company comes out and fixes it (playtest: an unrepaired pump in peacetime killed families)
      else if (u.broken.includes(st.id) && townOpen && rnd < 0.5) { u.broken = u.broken.filter(x => x !== st.id); s.money -= 850; log(s, 'The well company replaced the pump: $850.'); }
    }
    if (def.store) store += def.store;
  }
  store += toteStorage(s);
  // a spring on the place runs year round (less in a drought), carried in buckets unless pumped
  if (s.site.spring) supply += SPRING_LPD * (s.disaster.kind === 'drought' && s.clock.t >= s.disaster.hitAt ? 0.4 : 1);
  // roofs on the water network with a cistern catch rain (gutters)
  let roof = 0;
  for (const st of fin) if (p.water.has(st.id) && p.nodes.some(o => p.water.get(o.id) === p.water.get(st.id) && UTILITY[o.kind]?.store)) roof += roofM2(kinds.get(st.id)!);
  const rainL = roof * rainMm(doy) * REGIONS[s.site.region].rainMm / 400 * 0.8;
  const people = s.people.length;
  const homePlumbed = fin.some(st => fitted(s, st.id, 'plumb') && (DRAW_KWH[st.kind] ?? 0) >= 5);
  const use = people * (homePlumbed ? WATER_PLUMBED : WATER_CARRIED) + (fin.some(st => st.kind === 'garden') && doy > 120 && doy < 270 ? (s.stock.greywater >= 1 && homePlumbed ? 200 : 400) : 0) + (fin.some(st => st.kind === 'chicken_coop') ? 10 : 0);
  u.storedL = Math.min(store, u.storedL + rainL);
  let left = supply - use, shortL = 0;
  if (left < 0) { const take = Math.min(-left, u.storedL); u.storedL -= take; left += take; }
  else u.storedL = Math.min(store, u.storedL + left);
  // no supply at all: water is hauled from the creek (that's the default before any well)
  // in a drought the creek stops running: nothing to haul from either
  const creekDry = s.disaster.kind === 'drought' && s.clock.t >= s.disaster.hitAt;
  if (left < 0 && (supply + store > 0 || creekDry)) {
    // while the town works, what's short is bought (bottled water, the county water truck) instead of going without
    if (townOpen) { const cost = Math.round(-left * waterPrice(s)); s.money -= cost; if (cost > 30) log(s, `Bought ${Math.round(-left)} L of water in town ($${cost}).`); }
    // the pump's dead or the tank's dry: back to buckets from the creek (playtest: families died of thirst beside a running creek)
    else if (!creekDry) { u.hauling = true; if (!s.site.creek) u.haulFar = true; }
    else { shortL = -left; log(s, `Water ran short by ${Math.round(shortL)} L.`); }
  }
  u.report = { solarKwh: solar, drawKwh: draw, genKwh: gen, shortKwh: short, batteryPct: capKwh > 0 ? u.batteryKwh / capKwh : 0, gridKwh, billUsd: bill, shed, waterL: supply + rainL, useL: use, shortL, storedL: u.storedL };
  u.lastDay = dayIndex(s.clock.t);
}

/** Storage on the place (cisterns, the tower, totes), liters. */
export function storageCapacity(s: GameState): number {
  return s.structures.filter(isFinished).reduce((a, st) => a + (UTILITY[st.kind]?.store ?? 0), 0) + toteStorage(s);
}

/** Repair a broken pump (hardware kit; a mechanic does it in an hour or two). */
export function repairPump(s: GameState, id: string): boolean {
  if (!s.utilities.broken.includes(id) || s.stock.hardware < 1) return false;
  s.stock.hardware--;
  s.utilities.broken = s.utilities.broken.filter(x => x !== id);
  log(s, 'Pump repaired.');
  return true;
}

/** The spare an EMP-fried building needs (inverter, generator, pump). */
export const SPARE_FOR: Record<string, MaterialId> = { solar_array: 'inverter', battery_shed: 'inverter', generator_shed: 'generator', well_drilled: 'pump' };

/** Put a spare into what the EMP fried (the spare and a hardware kit). */
export function replaceFried(s: GameState, id: string): string | null {
  const st = s.structures.find(x => x.id === id);
  if (!st || !s.utilities.fried.includes(id)) return 'nothing to fix';
  const spare = SPARE_FOR[st.kind];
  if (!spare || s.stock[spare] < 1) return `needs a spare ${spare ?? 'part'}`;
  if (s.stock.hardware < 1) return 'needs a hardware kit';
  s.stock[spare]--; s.stock.hardware--;
  s.utilities.fried = s.utilities.fried.filter(x => x !== id);
  log(s, `New ${spare} in: the ${st.kind.replace('_', ' ')} runs again.`);
  return null;
}
