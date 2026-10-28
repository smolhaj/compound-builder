/**
 * Construction: a placed structure is built stage by stage (GDS §2.2). A
 * stage starts once its materials are in the stockpile (they are taken
 * then); builders add person-hours at their work rate; when the stage's
 * hours are done the next one begins.
 */
import { drillExtra, siteProblem } from './site';
import { permitHold } from './paperwork';
import { BLUEPRINTS, totalBill } from './blueprints';
import { hasAll, shortfall, waitingFor, type Stock } from './materials';
import { log } from './economy';
import type { GameState, Structure } from './state';

export function blueprintOf(st: Structure) {
  return BLUEPRINTS[st.kind];
}

export function isFinished(st: Structure): boolean {
  return st.stage >= blueprintOf(st).stages.length;
}

/** Share of the old tier's materials that comes back when its upgrade is finished (same as the walls: sim/perimeter.ts SALVAGE). */
export const STRUCTURE_SALVAGE = 0.5;

/** An upgrade is done: the old tier goes, and half its materials come back to the stockpile. */
function completeUpgrade(s: GameState, st: Structure): void {
  const old = s.structures.find(x => x.id === st.replaces);
  st.replaces = undefined;
  if (!old) return;
  for (const [k, n] of Object.entries(totalBill(blueprintOf(old))) as Array<[keyof Stock, number]>) s.stock[k] += Math.floor(n * STRUCTURE_SALVAGE);
  s.structures = s.structures.filter(x => x.id !== old.id);
  log(s, `The old ${old.kind.replace(/_/g, ' ')} comes down; half its materials are back in the stockpile.`);
}

/** Plan a structure at a placed spot (mutates the draft). */
/** Why this piece can't be planned here (null = it can). */
export function planProblem(s: GameState, kind: string): string | null {
  return siteProblem(s.site, kind);
}

export function planStructure(s: GameState, kind: string, x: number, z: number, rot: number): Structure {
  const st: Structure = { id: `s${s.nextId++}`, kind, x, z, rot, stage: 0, done: 0, supplied: false, finishedAt: null };
  s.structures.push(st);
  log(s, `Staked out a ${kind.replace('_', ' ')}.`);
  return st;
}

/** Why work on this structure can't go on now (null = it can). */
export function blockedReason(s: GameState, st: Structure): string | null {
  if (isFinished(st)) return 'finished';
  const hold = permitHold(s, st);
  if (hold) return hold;
  if (st.supplied) return null;
  const need = blueprintOf(st).stages[st.stage].materials;
  if (hasAll(s.stock, need)) return null;
  const miss = shortfall(s.stock, need);
  return waitingFor(miss);
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
      // a deep well: the driller bills the meters past the usual bore
      if (st.kind === 'well_drilled' && stage.id === 'foundation' && drillExtra(s.site) > 0) {
        s.money -= drillExtra(s.site);
        log(s, `The driller went to ${s.site.gwDepth} m for water: $${drillExtra(s.site).toLocaleString('en-US')} more for the extra footage.`);
      }
      st.stage++;
      st.done = 0;
      st.supplied = false;
      if (isFinished(st)) {
        st.finishedAt = s.clock.t;
        log(s, `The ${st.kind.replace('_', ' ')} is finished!`);
        if (st.replaces) completeUpgrade(s, st);
      } else log(s, `${stage.name} done — on to: ${bp.stages[st.stage].name.toLowerCase()}.`);
    }
  }
  return personHours - left;
}

/**
 * Knock a finished (or part-built) structure back to `stage`: that stage and
 * the ones after it are worked again, but what the later stages put in (the
 * pump, the doors and windows, the fittings) is salvaged into the stockpile,
 * so the rebuild uses it again instead of needing it bought new. Playtest
 * round 3: a storm took a well's pump-house roof, and the rebuilt well then
 * waited for a new pump nobody could buy after the collapse.
 */
export function knockBack(s: GameState, st: Structure, stage: number): void {
  const stages = blueprintOf(st).stages, from = Math.min(st.stage, stages.length);
  for (let i = stage + 1; i < from; i++) for (const [k, n] of Object.entries(stages[i].materials) as Array<[keyof Stock, number]>) s.stock[k] += n;
  // the current stage's own materials, if they were already taken in
  if (st.stage > stage && st.stage < stages.length && st.supplied) for (const [k, n] of Object.entries(stages[st.stage].materials) as Array<[keyof Stock, number]>) s.stock[k] += n;
  st.stage = stage; st.done = 0; st.supplied = false; st.finishedAt = null;
}

/**
 * A structure burned (a wildfire front, raiders' torch). Most go back to
 * nothing. A well doesn't: the bore and its steel casing (or the stoned shaft)
 * are in the ground and come through, and so does a submersible pump down the
 * hole or a cast-iron hand pump; the pump house, the roof and the pressure tank
 * and controls burn. Round 4: a wildfire burned a drilled well back to stage 0,
 * which meant drilling it again, which nobody can buy after the collapse.
 * A septic system is underground and isn't touched. Returns false if nothing burned.
 */
export function burnStructure(s: GameState, st: Structure): boolean {
  const stages = blueprintOf(st).stages;
  if (st.kind === 'septic') return false;
  if (st.kind === 'well_drilled' || st.kind === 'well_hand') {
    const keep = stages.findIndex(x => x.id === (st.kind === 'well_drilled' ? 'frame' : 'roof'));
    if (st.stage <= keep) return false;
    const hw = s.stock.hardware;
    knockBack(s, st, keep);
    // the pump comes out of the hole (or off the cast-iron stand) fine; what was in the pump house didn't make it
    // (a hand well keeps its roof stage to redo, and gets the hand pump back from knockBack)
    if (st.kind === 'well_drilled') { s.stock.hardware = hw; s.stock.roofing = Math.max(0, s.stock.roofing - (stages[3]?.materials.roofing ?? 0)); }
    return true;
  }
  st.stage = 0; st.done = 0; st.supplied = false; st.finishedAt = null;
  return true;
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
