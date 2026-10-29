/**
 * What comes with the land (GDS §10.1, decided with the user: some listings
 * come improved, raw land comes with nothing; "Both kinds" of house; "Off-grid
 * until you pay" for the power line; "Gravel drive at a $/ft quote").
 *
 * An improved listing has power in, a gravel drive, often a drilled well and
 * a septic system, and a house: an old farmhouse or a manufactured home that
 * needs work, or a newer cabin or log house in good shape, sometimes a barn.
 * Each old system (roof, wiring, plumbing, the septic field) has a condition;
 * poor ones need fixing (materials and hours, the family's or a crew's).
 * Raw land has nothing: the co-op quotes a line extension by the foot from
 * the nearest pole, and until there's a drive the trucks drop at the road and
 * the family carries everything in.
 *
 * 2025 figures: rural co-op line extensions run $15–50 a foot overhead plus
 * a transformer and meter (~$3,500) and take 1–3 months; a 12 ft gravel
 * drive with a culvert at the road runs $15–30 a foot. Pure.
 */
import { log } from './economy';
import { isFinished } from './construction';
import type { Stock } from './materials';
import { hasAll, shortfall, waitingFor, type MaterialId } from './materials';
import type { GameState, Structure } from './state';

export type HouseKind = 'farmhouse' | 'trailer' | 'timber_cabin' | 'log_house';
export type Condition = 'good' | 'fair' | 'poor';
export type FixPart = 'roof' | 'wiring' | 'plumbing' | 'septic' | 'glass';

export interface Improvements {
  house: { kind: HouseKind; built: number; roof: Condition; wiring: Condition; plumbing: Condition } | null;
  barn: { built: number; roof: Condition } | null;
  /** A drilled well with a pump (its depth is the site's groundwater depth). */
  well: { pump: Condition } | null;
  septic: { field: Condition } | null;
  /** Power in to the house; else the feet of line to the nearest pole. */
  power: boolean;
  poleFt: number;
  /** A gravel drive in from the county road; else its length. */
  drive: boolean;
  driveFt: number;
}

export { RAW, CLASSIC_IMPROVEMENTS } from './site';

export const HOUSE_NAME: Record<HouseKind, string> = { farmhouse: 'Old farmhouse', trailer: 'Manufactured home', timber_cabin: 'Cabin', log_house: 'Log house' };

/** What each improvement adds to the asking price ($, 2025 rural resale). */
export function improvementValue(i: Improvements, gwDepth: number): number {
  const k: Record<Condition, number> = { good: 1, fair: 0.75, poor: 0.5 };
  let v = 0;
  if (i.house) {
    const base: Record<HouseKind, number> = { farmhouse: 210_000, trailer: 75_000, timber_cabin: 130_000, log_house: 260_000 };
    const c = (k[i.house.roof] + k[i.house.wiring] + k[i.house.plumbing]) / 3;
    v += base[i.house.kind] * c;
  }
  if (i.barn) v += 40_000 * k[i.barn.roof];
  if (i.well) v += 16_000 + Math.max(0, gwDepth - 60) * 150 - (i.well.pump === 'poor' ? 2_000 : 0);
  if (i.septic) v += 13_000 * k[i.septic.field];
  if (i.power) v += 9_000;
  if (i.drive) v += 4_000;
  return Math.round(v / 500) * 500;
}

// ── Utilities to the place ──

export const POLE_PER_FT = 28;
export const TRANSFORMER = 3_500;
export const DRIVE_PER_FT = 20;
export const CULVERT = 1_200;

export const powerQuote = (i: Improvements) => ({ usd: Math.round((i.poleFt * POLE_PER_FT + TRANSFORMER) / 100) * 100, days: 35 + Math.round(i.poleFt / 150) });
export const driveQuote = (i: Improvements) => ({ usd: Math.round((i.driveFt * DRIVE_PER_FT + CULVERT) / 100) * 100, days: 5 + Math.round(i.driveFt / 300) });

/** Jobs the co-op or a contractor has on the books (due at game time). */
export interface SiteJobs { power: number | null; drive: number | null }

export function hookupProblem(s: GameState, what: 'power' | 'drive'): string | null {
  const imp = s.site.improvements;
  if (what === 'power' ? imp.power : imp.drive) return 'already in';
  if (s.siteJobs[what] !== null) return 'on the books';
  const t = s.disaster.tracks;
  if (t.banks < 0.5 || t.law < 0.5 || (what === 'power' && t.grid < 0.5)) return 'nobody is taking jobs now';
  const q = what === 'power' ? powerQuote(imp) : driveQuote(imp);
  if (s.money < q.usd) return 'not enough money';
  return null;
}

export function orderHookup(s: GameState, what: 'power' | 'drive'): string | null {
  const why = hookupProblem(s, what);
  if (why) return why;
  const q = what === 'power' ? powerQuote(s.site.improvements) : driveQuote(s.site.improvements);
  s.money -= q.usd;
  s.siteJobs[what] = s.clock.t + q.days;
  log(s, what === 'power'
    ? `Paid the co-op $${q.usd.toLocaleString('en-US')} for ${s.site.improvements.poleFt.toLocaleString('en-US')} ft of line: power in about ${Math.round(q.days / 7)} weeks.`
    : `Hired a contractor to put in ${s.site.improvements.driveFt.toLocaleString('en-US')} ft of gravel drive ($${q.usd.toLocaleString('en-US')}), about ${q.days} days.`);
  return null;
}

/** Once a day: finished hookups come in (or stall when the outside world fails). */
export function siteJobsDay(s: GameState): void {
  const t = s.disaster.tracks;
  for (const what of ['power', 'drive'] as const) {
    const due = s.siteJobs[what];
    if (due === null) continue;
    if (t.banks < 0.5 || t.law < 0.5) { s.siteJobs[what] = null; log(s, what === 'power' ? 'The co-op crew never came: the line extension is off.' : 'The drive contractor never came back.'); continue; }
    if (s.clock.t < due) continue;
    s.siteJobs[what] = null;
    if (what === 'power') { s.site.improvements.power = true; s.utilities.grid = true; log(s, 'The co-op set the last pole and the meter: the place has power.'); }
    else { s.site.improvements.drive = true; log(s, 'The gravel drive is in: trucks can come right up to the yard.'); }
  }
}

/** Without a drive: what the family must carry in from the road (person-hours per unit delivered). */
export const CARRY_H: Partial<Record<MaterialId, number>> = { lumber: 1.5, fieldstone: 2, concrete: 0, roofing: 1, hardware: 0.3, tank: 2, septic_tank: 0, container: 0, staples: 0.3, canned: 0.05, firewood: 0.5 };

// ── Repairs on what came with the land ──

export interface Fix { part: FixPart; cond: 'fair' | 'poor'; done: number; hours: number; supplied: boolean }

const FIX: Record<FixPart, Record<'fair' | 'poor', { name: string; hours: number; materials: Partial<Stock> }>> = {
  roof: { fair: { name: 'Patch the roof', hours: 30, materials: { roofing: 3, hardware: 1 } }, poor: { name: 'Strip and re-roof', hours: 160, materials: { roofing: 14, lumber: 3, hardware: 1 } } },
  wiring: { fair: { name: 'Replace the old panel', hours: 24, materials: { cable: 1, hardware: 1 } }, poor: { name: 'Rewire the house', hours: 120, materials: { cable: 5, hardware: 2 } } },
  plumbing: { fair: { name: 'Fix the leaks, new water heater', hours: 20, materials: { pipe: 1, hardware: 1 } }, poor: { name: 'Replumb (PEX) and new fixtures', hours: 90, materials: { pipe: 5, fixtures: 1 } } },
  septic: { fair: { name: 'Pump the tank', hours: 4, materials: { excavator: 1 } }, poor: { name: 'New leach field', hours: 60, materials: { excavator: 2, pipe: 3, concrete: 2 } } },
  // a greenhouse after hail or an ice storm: a few cracked panes, or the glazing stripped from a bay
  glass: { fair: { name: 'Replace the cracked panes', hours: 12, materials: { hardware: 1 } }, poor: { name: 'Reglaze the broken bays', hours: 48, materials: { hardware: 3, lumber: 1 } } },
};
/** Crack a greenhouse's glass (hail, ice): a repair job on the structure, like the old house's. Returns false when it is already cracked. */
export function crackGlass(st: Structure, cond: 'fair' | 'poor'): boolean {
  if ((st.fixes ?? []).some(f => f.part === 'glass' && f.done < f.hours)) return false;
  (st.fixes ??= []).push({ part: 'glass', cond, done: 0, hours: FIX.glass[cond].hours, supplied: false });
  return true;
}
/** How much of its glass is whole: 1 sound, 0.7 a few panes cracked, 0.4 bays broken (output and heat follow). */
export function glassSound(st: Structure): number {
  const f = (st.fixes ?? []).find(x => x.part === 'glass' && x.done < x.hours);
  return !f ? 1 : f.cond === 'poor' ? 0.4 : 0.7;
}
export const fixDef = (f: Fix) => FIX[f.part][f.cond];
export const fixBill = (f: Fix) => FIX[f.part][f.cond].materials;

/** The repairs a structure that came with the land still needs. */
export const pendingFixes = (st: Structure) => (st.fixes ?? []).filter(f => f.done < f.hours);
/** Is this part sound enough to use (not poor and unfixed)? */
export function sound(st: Structure | undefined, part: FixPart): boolean {
  return !st || !(st.fixes ?? []).some(f => f.part === part && f.cond === 'poor' && f.done < f.hours);
}

export function fixBlocked(s: GameState, f: Fix): string | null {
  if (f.supplied) return null;
  const need = fixBill(f);
  if (hasAll(s.stock, need)) return null;
  const miss = shortfall(s.stock, need);
  return waitingFor(miss);
}

/** The next repair the family can work on (oldest first). */
export function nextFix(s: GameState): { st: Structure; f: Fix } | null {
  for (const st of s.structures) if (isFinished(st)) for (const f of pendingFixes(st)) if (!fixBlocked(s, f)) return { st, f };
  return null;
}

/** Work on a repair; returns the hours used. Finishing a wiring / plumbing job fits the house. */
export function addFixWork(s: GameState, st: Structure, f: Fix, hours: number): number {
  if (f.done >= f.hours) return 0;
  if (!f.supplied) {
    if (fixBlocked(s, f)) return 0;
    for (const [k, n] of Object.entries(fixBill(f)) as Array<[MaterialId, number]>) s.stock[k] -= n;
    f.supplied = true;
  }
  const use = Math.min(hours, f.hours - f.done);
  f.done += use;
  if (f.done >= f.hours - 1e-9) {
    f.done = f.hours;
    log(s, `${fixDef(f).name}: done.`);
    if (f.part === 'wiring' || f.part === 'plumbing') {
      const kind = f.part === 'wiring' ? 'wire' : 'plumb';
      if (!s.utilities.fittings.some(x => x.building === st.id && x.kind === kind)) s.utilities.fittings.push({ building: st.id, kind, done: 1, hours: 1, supplied: true, finishedAt: s.clock.t });
    }
  }
  return use;
}

/** Repair hours left on a structure. */
export const fixHoursLeft = (st: Structure) => pendingFixes(st).reduce((a, f) => a + f.hours - f.done, 0);

/** Heat loss from a bad roof on the house (the stove burns more). */
export function roofLoss(s: GameState): number {
  const house = s.structures.find(x => x.pre && ['farmhouse', 'trailer'].includes(x.kind));
  if (!house) return 1;
  const roof = pendingFixes(house).find(f => f.part === 'roof');
  return roof ? (roof.cond === 'poor' ? 1.35 : 1.1) : 1;
}

/**
 * The structures that come with the land, not yet placed: the world finds
 * them spots by the camp (placeImprovements), then they're laid in finished.
 */
export function improvementStructures(s: GameState): Structure[] {
  const i = s.site.improvements, out: Structure[] = [];
  const add = (kind: string, fixes: Fix[] = []) => out.push({ id: `s${s.nextId++}`, kind, x: 0, z: 0, rot: 0, stage: 5, done: 0, supplied: true, finishedAt: 0, pre: true, unplaced: true, ...(fixes.length ? { fixes } : {}) });
  const fixesOf = (parts: Array<[FixPart, Condition]>): Fix[] => parts.filter(([, c]) => c !== 'good').map(([part, cond]) => ({ part, cond: cond as 'fair' | 'poor', done: 0, hours: FIX[part][cond as 'fair' | 'poor'].hours, supplied: false }));
  if (i.house) add(i.house.kind, fixesOf([['roof', i.house.roof], ['wiring', i.house.wiring], ['plumbing', i.house.plumbing]]));
  if (i.barn) add('barn', fixesOf([['roof', i.barn.roof]]));
  if (i.well) add('well_drilled');
  if (i.septic) add('septic', fixesOf([['septic', i.septic.field]]));
  return out;
}

/**
 * Lay in what came with the land at the spots the world picked: the house is
 * piped to the well and the septic and wired (where those systems are sound),
 * and a worn-out well pump starts broken.
 */
export function placeImprovements(s: GameState, spots: Record<string, { x: number; z: number; rot: number }>): void {
  for (const st of s.structures) {
    const p = spots[st.id];
    if (!st.unplaced || !p) continue;
    st.x = p.x; st.z = p.z; st.rot = p.rot;
    delete st.unplaced;
  }
  const house = s.structures.find(x => x.pre && ['farmhouse', 'trailer', 'timber_cabin', 'log_house'].includes(x.kind) && !x.unplaced);
  const well = s.structures.find(x => x.pre && x.kind === 'well_drilled' && !x.unplaced);
  const septic = s.structures.find(x => x.pre && x.kind === 'septic' && !x.unplaced);
  if (!house) return;
  const done = (kind: 'water_pipe' | 'power_cable', a: Structure) => s.perimeter.push({ id: `p${s.nextId++}`, kind, pts: [[a.x, a.z], [house.x, house.z]], gates: [], done: 1, hours: 1, supplied: true, finishedAt: 0 });
  if (well) { done('water_pipe', well); done('power_cable', well); }
  if (septic) done('water_pipe', septic);
  const fit = (kind: 'wire' | 'plumb') => s.utilities.fittings.push({ building: house.id, kind, done: 1, hours: 1, supplied: true, finishedAt: 0 });
  if (s.site.improvements.power && sound(house, 'wiring')) fit('wire');
  if (well && sound(house, 'plumbing')) fit('plumb');
  if (well && s.site.improvements.well?.pump === 'poor') s.utilities.broken.push(well.id);
}
