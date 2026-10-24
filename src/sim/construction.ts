/**
 * Construction: a placed structure is built stage by stage (GDS §2.2). A
 * stage starts once its materials are in the stockpile (they are taken
 * then); builders add person-hours at their work rate; when the stage's
 * hours are done the next one begins.
 */
import { BLUEPRINTS } from './blueprints';
import { hasAll, MATERIALS, shortfall, type MaterialId, type Stock } from './materials';
import { log } from './economy';
import type { GameState, Structure } from './state';

export function blueprintOf(st: Structure) {
  return BLUEPRINTS[st.kind];
}

export function isFinished(st: Structure): boolean {
  return st.stage >= blueprintOf(st).stages.length;
}

/** Plan a structure at a placed spot (mutates the draft). */
export function planStructure(s: GameState, kind: string, x: number, z: number, rot: number): Structure {
  const st: Structure = { id: `s${s.nextId++}`, kind, x, z, rot, stage: 0, done: 0, supplied: false, finishedAt: null };
  s.structures.push(st);
  log(s, `Staked out a ${kind.replace('_', ' ')}.`);
  return st;
}

/** Why work on this structure can't go on now (null = it can). */
export function blockedReason(s: GameState, st: Structure): string | null {
  if (isFinished(st)) return 'finished';
  if (st.supplied) return null;
  const need = blueprintOf(st).stages[st.stage].materials;
  if (hasAll(s.stock, need)) return null;
  const miss = shortfall(s.stock, need);
  return 'Waiting for ' + (Object.entries(miss) as Array<[MaterialId, number]>).map(([k, n]) => `${n} ${MATERIALS[k].name.toLowerCase()}`).join(', ');
}

/** Take the current stage's materials from the stockpile if they are there. */
function supply(s: GameState, st: Structure): boolean {
  if (st.supplied) return true;
  const need = blueprintOf(st).stages[st.stage].materials;
  if (!hasAll(s.stock, need)) return false;
  for (const [k, n] of Object.entries(need) as Array<[keyof Stock, number]>) s.stock[k] -= n;
  st.supplied = true;
  return true;
}

/**
 * Add `hours` of work at `rate` (person-hours × rate). Carries over into the
 * next stage while materials allow. Returns the person-hours actually used.
 */
export function addWork(s: GameState, st: Structure, personHours: number): number {
  let left = personHours;
  const bp = blueprintOf(st);
  while (left > 1e-9 && !isFinished(st)) {
    if (!supply(s, st)) break;
    const stage = bp.stages[st.stage];
    const need = stage.hours - st.done;
    const use = Math.min(need, left);
    st.done += use;
    left -= use;
    if (st.done >= stage.hours - 1e-9) {
      for (const [k, n] of Object.entries(stage.yields ?? {}) as Array<[keyof Stock, number]>) s.stock[k] += n;
      st.stage++;
      st.done = 0;
      st.supplied = false;
      if (isFinished(st)) {
        st.finishedAt = s.clock.t;
        log(s, `The ${st.kind.replace('_', ' ')} is finished!`);
      } else log(s, `${stage.name} done — on to: ${bp.stages[st.stage].name.toLowerCase()}.`);
    }
  }
  return personHours - left;
}

/** 0–1 overall progress by person-hours. */
export function progress(st: Structure): number {
  const bp = blueprintOf(st);
  const total = bp.stages.reduce((a, x) => a + x.hours, 0);
  let done = 0;
  for (let i = 0; i < Math.min(st.stage, bp.stages.length); i++) done += bp.stages[i].hours;
  if (!isFinished(st)) done += st.done;
  return done / total;
}
