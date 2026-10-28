/**
 * Forestry: the family fells its own timber (docs/DECISIONS.md). Trees are
 * marked; in work hours someone fells the tree, bucks it to length and skids
 * the logs to the yard. Conifers (ponderosa / Douglas fir) give saw logs for
 * a log cabin; aspen a log; cottonwood only firewood. Tops and limbs go to
 * firewood. Pure (tested).
 */
import { log } from './economy';
import { payUpkeep, wearTools, workSpeed } from './tools';
import { stackGreen } from './upkeep';
import type { FellJob, GameState } from './state';

export interface TreeRef { id: number; x: number; z: number; kind: FellJob['kind']; scale: number }

/** Skidding pace: hours per world unit (≈ 6 m) dragging logs to the yard, plus loading. */
const HAUL_H_PER_UNIT = 0.04;
const HAUL_BASE_H = 0.5;

/** Person-hours for a stage of a job. */
export function stageHours(j: FellJob): number {
  const size = Math.max(0.5, j.scale);
  switch (j.stage) {
    case 'marked': return 1.2 * size;            // notch, back cut, fell
    case 'felled': return 2.4 * size;            // limb, buck to length
    case 'bucked': return j.haulHours;
  }
}

/** Logs and firewood (ricks) a tree yields. */
export function yieldOf(kind: FellJob['kind'], scale: number): { logs: number; firewood: number } {
  if (kind === 'conifer') return { logs: Math.max(2, Math.round(2 + (scale - 0.75) * 4)), firewood: 1 };
  if (kind === 'oval') return { logs: 1, firewood: 1 };
  return { logs: 0, firewood: 2 };
}

export function isMarked(s: GameState, treeId: number): boolean {
  return s.forestry.jobs.some(j => j.treeId === treeId);
}

/** Mark a tree for felling (`haulDist` = distance to the yard). Returns the job, or null if marked / cleared. */
export function markTree(s: GameState, t: TreeRef, haulDist: number): FellJob | null {
  if (isMarked(s, t.id) || s.forestry.cleared.includes(t.id)) return null;
  const j: FellJob = { id: `f${s.nextId++}`, treeId: t.id, x: t.x, z: t.z, kind: t.kind, scale: t.scale, stage: 'marked', done: 0, haulHours: HAUL_BASE_H + haulDist * HAUL_H_PER_UNIT };
  s.forestry.jobs.push(j);
  return j;
}

/** Unmark a tree not yet cut. */
export function unmarkTree(s: GameState, treeId: number): boolean {
  const i = s.forestry.jobs.findIndex(j => j.treeId === treeId && j.stage === 'marked' && j.done === 0);
  if (i < 0) return false;
  s.forestry.jobs.splice(i, 1);
  return true;
}

/** The job to work next: finish what is on the ground first, then the oldest mark. */
export function nextFellJob(s: GameState): FellJob | null {
  let best: FellJob | null = null;
  for (const j of s.forestry.jobs) if (j.stage !== 'marked' || j.done > 0) return j; else best ??= j;
  return best;
}

/** Add person-hours to a job; advances stages, and on hauling credits the yield. */
export function addFellWork(s: GameState, j: FellJob, hours: number): void {
  // the family's axe or chainsaw (sim/tools.ts): required for the felling, faster with a saw, wears with the hours
  hours = payUpkeep(s, hours);
  const task = { kind: 'fell', stage: j.stage } as const, m = workSpeed(s, task);
  if (m <= 0) return;
  wearTools(s, task, hours);
  j.done += hours * m;
  while (s.forestry.jobs.includes(j) && j.done >= stageHours(j)) {
    j.done -= stageHours(j);
    if (j.stage === 'marked') j.stage = 'felled';
    else if (j.stage === 'felled') j.stage = 'bucked';
    else {
      const y = yieldOf(j.kind, j.scale);
      s.stock.logs += y.logs;
      stackGreen(s, y.firewood);
      s.forestry.jobs.splice(s.forestry.jobs.indexOf(j), 1);
      s.forestry.cleared.push(j.treeId);
      const name = j.kind === 'conifer' ? 'pine' : j.kind === 'oval' ? 'aspen' : 'cottonwood';
      log(s, `Felled a ${name}: ${y.logs ? `${y.logs} log${y.logs > 1 ? 's' : ''} and ` : ''}${y.firewood} rick${y.firewood > 1 ? 's' : ''} of green firewood (it burns well once it's seasoned, in about nine months).`);
    }
  }
}
