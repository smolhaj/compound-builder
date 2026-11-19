/**
 * The dome plant as live game state: which units a dome has and how they stand (read from the open `plant` repair jobs in `GameState.raidDamage`),
 * what that does to the dome (`plantFx`), and the jobs a raid, a fire or a storm leaves (`damagePlant`). The pure model is plantUnits.ts; this file
 * only reads and writes the state. It imports `live.ts` for types only, so `live.ts` can read the effects without a cycle.
 */
import type { GameState } from '../state';
import { dayIndex } from '../state';
import { log } from '../economy';
import { hasAll } from '../materials';
import type { DomeRef, DomeState } from './live';
import { PLANT_SHORT, plantFx, plantUnits, repairSpec, rushUsd, type PlantCause, type PlantFx, type PlantKind, type PlantSpec, type PlantUnit } from './plantUnits';
import { plantLayout } from './plant';
import type { RaidDamage } from '../raidDamage';
import { isFinished } from '../construction';
import { TIER, cellsOfKind, shellFt, tierOfKind } from './tiers';
import { feederPartners, supplemented } from './links';

type Ref = Pick<DomeRef, 'st' | 'tier' | 'cells' | 'r'>;

export const specOf = (st: DomeState): PlantSpec => ({ filtering: st.filtering, loop: st.loop ?? 'none', spares: st.spares ?? [] });

/** The open plant jobs of a dome. */
export const plantJobs = (s: Pick<GameState, 'raidDamage'>, domeId: string): RaidDamage[] => (s.raidDamage ?? []).filter(j => j.kind === 'plant' && j.structure === domeId && j.done < j.hours);

/** The units of a dome with their state. */
export function unitsOf(s: GameState, d: Ref, st: DomeState): PlantUnit[] {
  return plantUnits(d.tier, specOf(st), plantJobs(s, d.st.id).filter(j => j.unit && j.cond).map(j => ({ unit: j.unit!, cond: j.cond!, at: j.at ?? 0 })));
}

/** What the plant as it stands lets the dome do. */
export const rawFxOf = (s: GameState, d: Ref, st: DomeState): PlantFx => plantFx(unitsOf(s, d, st), s.clock.t);

/** A partner dome's own plant shares (not supplemented: the feeder never chains), or null when it is not a finished dome. */
function partnerFx(s: GameState, id: string): PlantFx | null {
  const stc = s.structures.find(x => x.id === id), tier = stc ? tierOfKind(stc.kind) : null;
  if (!stc || !tier || !isFinished(stc)) return null;
  const cells = cellsOfKind(stc.kind) ?? TIER[tier].cells, state = s.domes?.[id] ?? (s.dome && (s.dome.id === id || !s.dome.id) ? s.dome : null);
  return state ? rawFxOf(s, { st: stc, tier, cells, r: shellFt(tier, cells) / 2 / 20 }, state) : null;
}

/**
 * What the plant as it stands lets the dome do, with the feeder of any open link to another dome (sim/dome/links.ts, PROPOSED): a partner's whole
 * plant lifts a weaker one's climate, scrubbing and water shares (N+1 across two domes). Never lower than the dome's own plant.
 */
export function fxOf(s: GameState, d: Ref, st: DomeState): PlantFx {
  const own = rawFxOf(s, d, st);
  if (!s.domeLinks?.length) return own;
  const others = feederPartners(s, d.st.id).map(id => partnerFx(s, id)).filter((x): x is PlantFx => !!x);
  if (!others.length) return own;
  return { ...own, climate: supplemented(own.climate, others.map(o => o.climate)), scrub: supplemented(own.scrub, others.map(o => o.scrub)), water: supplemented(own.water, others.map(o => o.water)) };
}

/** The job for one unit (open), if any. */
export const jobOf = (s: GameState, domeId: string, unitId: string): RaidDamage | undefined => plantJobs(s, domeId).find(j => j.unit === unitId);

/** Where a unit stands, in world coordinates. */
export function unitSpot(d: Ref, st: DomeState, unitId: string): { x: number; z: number } {
  const plant = plantLayout(d.tier, d.r, st.filtering, { loop: st.loop ?? 'none', spares: st.spares ?? [], rot: d.st.rot });
  const u = plant.units.find(q => q.id === unitId);
  return u ? { x: d.st.x + u.x, z: d.st.z + u.z } : { x: d.st.x, z: d.st.z };
}

const MAX_PLANT_JOBS = 8;

/** The short consequence for the line the family reads. */
export function stepWord(kind: PlantKind, cond: 'damaged' | 'down'): string {
  const half = cond === 'damaged';
  switch (kind) {
    case 'chiller': return half ? 'half the cooling is gone.' : 'the dome will drift toward the weather outside.';
    case 'air': return half ? 'the air clock runs down faster.' : 'sealed, the air is on the clock.';
    case 'substation': return half ? 'the plant runs derated.' : 'the dome is on its batteries and will go dark.';
    case 'water': return half ? 'less water is reused.' : 'the rain and graywater loop has stopped.';
    case 'battery': return half ? 'half the ride-through is gone.' : 'a power cut will now go dark at once.';
    case 'vents': return half ? 'half the roof vents will not open.' : 'the roof vents will not open.';
  }
}

/**
 * Damage one unit: a job to repair it (parts, work, a wait for the special order), and the line for the log. A unit already down stays down; a damaged
 * one can be made worse. Returns the line (null when nothing changed).
 */
export function damagePlant(s: GameState, d: Ref, st: DomeState, unitId: string, cond: 'damaged' | 'down', cause: PlantCause): string | null {
  const u = unitsOf(s, d, st).find(x => x.id === unitId);
  if (!u) return null;
  const open = jobOf(s, d.st.id, unitId);
  if (open && (open.cond === 'down' || open.cond === cond)) return null;
  if (!open && plantJobs(s, d.st.id).length >= MAX_PLANT_JOBS) return null;
  const spec = repairSpec(d.tier, d.cells, u.kind, cond), day = dayIndex(s.clock.t), at = unitSpot(d, st, unitId);
  const what = `the ${u.spare ? PLANT_SHORT[u.kind] + ' (spare)' : PLANT_SHORT[u.kind]}`;
  if (open) {
    Object.assign(open, { cond, hours: spec.hours, done: 0, supplied: Object.keys(spec.bill).length === 0, bill: spec.bill, readyDay: day + spec.leadDays, at: s.clock.t, cause });
  } else {
    (s.raidDamage ??= []).push({ id: `d${s.nextId++}`, kind: 'plant', x: at.x, z: at.z, day, hours: spec.hours, done: 0, supplied: Object.keys(spec.bill).length === 0, bill: spec.bill, readyDay: day + spec.leadDays, structure: d.st.id, unit: unitId, cond, cause, at: s.clock.t, what });
  }
  const verb = cause === 'raid' ? (cond === 'down' ? 'wrecked' : 'damaged') : cause === 'fire' ? (cond === 'down' ? 'burned out' : 'scorched') : (cond === 'down' ? 'knocked out' : 'damaged');
  const line = `${what[0].toUpperCase()}${what.slice(1)} was ${verb}${cause === 'storm' ? ' by the storm' : cause === 'fire' ? ' by fire' : ''}: ${stepWord(u.kind, cond)}`;
  log(s, line);
  return line;
}

/** What a rush by a contractor costs for one open job (null: no such job). */
export function rushQuote(d: Ref, st: DomeState, job: RaidDamage): number | null {
  const u = job.unit ? plantUnits(d.tier, specOf(st)).find(x => x.id === job.unit) : null;
  return u && job.cond ? rushUsd(repairSpec(d.tier, d.cells, u.kind, job.cond)) : null;
}

/** Pay a contractor to finish a job now (parts and crew at a premium). Returns why not, or null. */
export function rushPlant(s: GameState, d: Ref, st: DomeState, jobId: string): string | null {
  const job = plantJobs(s, d.st.id).find(j => j.id === jobId);
  if (!job) return 'no such repair';
  const q = rushQuote(d, st, job);
  if (q === null) return 'no such repair';
  if (s.money < q) return `needs $${q.toLocaleString('en-US')}`;
  s.money -= q; job.done = job.hours; job.supplied = true;
  log(s, `A contractor's crew finished the repair of ${job.what ?? 'the plant unit'}: it is running again.`);
  return null;
}

/** Can the family itself work this job now (the parts are in the stockpile and the wait is over)? */
export const jobReady = (s: GameState, j: RaidDamage): boolean => (j.readyDay === undefined || dayIndex(s.clock.t) >= j.readyDay) && (j.supplied || hasAll(s.stock, j.bill));
