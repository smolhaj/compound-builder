/**
 * How a raid begins (coordinator decision 1). Pure and seeded; `planOpener` is rolled once when the raid is made (sim/encounters.ts `gateDay`) and
 * saved on the encounter, so the card, the cutscene and the fight all read the same opener.
 *
 *   scouts          two men go ahead of the crew. If the watch spots them the family is warned (earlier alarm, defenders ready sooner) and the scouts
 *                   fall back; if not, the crew knows how the place lies and comes at its weakest wall or its gate, not the near side.
 *   demand          a man under a white flag asks for a toll before a shot is fired. The card offers: pay what they ask (certain), talk it down
 *                   (the existing gate talk: sim/negotiation.ts), or refuse (the fight).
 *   worker_ambush   the crew takes the family's people at work outside the wall first: the ones who see them coming run in; the others are hurt,
 *                   or taken by a hostile crew. The gunfire is the alarm.
 *   diversion       a few of the crew make a noise and shoot from one side while the rest come at another; the defenders who ran to the noise have
 *                   to run back. The decoys withdraw after about half a minute.
 */
import type { CrewKind } from './surrender';
import type { Difficulty } from './difficulty';

export type OpenerKind = 'scouts' | 'demand' | 'worker_ambush' | 'diversion';
export interface Opener {
  kind: OpenerKind;
  /** Diversion: the share of the crew that makes the noise, and the seconds before the main body shows and the decoys give up. */
  decoy?: { share: number; delay: number; until: number };
}

/** The weights by crew kind: [scouts, demand, worker_ambush, diversion]. A crew with nothing to plan (refugees, a horde, tunnelers) never has an opener. */
const WEIGHTS: Record<CrewKind, [number, number, number, number]> = {
  gang: [0.22, 0.08, 0.14, 0.14], militia: [0.14, 0.34, 0.04, 0.06], patrol: [0.12, 0.3, 0.02, 0.04], requisition: [0.1, 0.5, 0.02, 0.02],
  looters: [0.06, 0.1, 0.12, 0.03], other: [0.05, 0.05, 0.05, 0.02], refugees: [0, 0, 0, 0], horde: [0, 0, 0, 0], tunnelers: [0, 0, 0, 0],
};
const KINDS: OpenerKind[] = ['scouts', 'demand', 'worker_ambush', 'diversion'];
/** Hardcore plans more; Cozy less. */
export const OPENER_DIFF: Record<Difficulty, number> = { cozy: 0.6, standard: 1, hardcore: 1.5 };

/** Roll the opener for a raid (null: it begins the plain way). `armed: false` crews (clubs, the dead) never plan. */
export function planOpener(c: { kind: CrewKind; temper: 'desperate' | 'hard' | 'savage'; size: number; armed: boolean; difficulty: Difficulty }, r: () => number): Opener | null {
  if (!c.armed || c.size < 3) return null;
  const w = WEIGHTS[c.kind] ?? WEIGHTS.other, k = OPENER_DIFF[c.difficulty] ?? 1;
  // a savage crew does not wave a flag; a desperate one does not plan a diversion
  const adj = w.map((x, i) => x * (i === 1 && c.temper === 'savage' ? 0 : i === 3 && c.temper === 'desperate' ? 0.3 : 1) * (i === 1 ? 1 : k));
  const total = adj.reduce((a, b) => a + b, 0);
  let u = r();
  if (u >= Math.min(0.9, total)) return null;
  u = r() * total;
  for (let i = 0; i < adj.length; i++) { u -= adj[i]; if (u <= 0) return { kind: KINDS[i], ...(KINDS[i] === 'diversion' ? { decoy: { share: 0.3, delay: 14 + Math.floor(r() * 8), until: 30 } } : {}) }; }
  return null;
}

/** The chance the watch spots two scouts before they spot the place: the detection number the fight uses (0-100), less in the dark. */
export function scoutSpotted(detection: number, night: boolean): number {
  return Math.max(0.05, Math.min(0.95, detection / 100 * 0.95 + 0.05 - (night ? 0.12 : 0)));
}

/** What a person doing outdoor work is doing (the tasks that put them outside the wall). */
export const OUTDOOR_TASKS: ReadonlySet<string> = new Set(['build', 'forestry', 'garden', 'fields', 'livestock', 'wood', 'water', 'hunt', 'repairs']);

export type AmbushFate = 'ran' | 'hurt' | 'taken' | 'killed';
/**
 * The crew takes the people at work outside first. Each one is warned (a dog, the watch, a clear view: `detection`) or not; the ones who are
 * not are hurt, and a hostile crew keeps one (a worker) or finishes one. At most three people are ever caught.
 */
export function workerAmbush(workers: ReadonlyArray<{ id: string; kid: boolean; age: number }>, c: { detection: number; hostile: boolean; night: boolean }, r: () => number): Array<{ id: string; fate: AmbushFate }> {
  const out: Array<{ id: string; fate: AmbushFate }> = [];
  let taken = 0;
  for (const w of workers.slice(0, 3)) {
    if (r() < Math.min(0.85, 0.1 + c.detection / 100 * 0.8 - (c.night ? 0.1 : 0))) { out.push({ id: w.id, fate: 'ran' }); continue; }
    const u = r(), adult = !w.kid && w.age >= 16 && w.age <= 55;
    if (c.hostile && adult && taken < 1 && u < 0.3) { taken++; out.push({ id: w.id, fate: 'taken' }); }
    else if (c.hostile && u < 0.5) out.push({ id: w.id, fate: 'killed' });
    else out.push({ id: w.id, fate: 'hurt' });
  }
  return out;
}

/** The direction the crew comes at when its scouts were not seen: the weakest of the candidate approaches (lower score = weaker). */
export function weakestApproach(scores: ReadonlyArray<{ ang: number; score: number }>): number | null {
  if (!scores.length) return null;
  return [...scores].sort((a, b) => a.score - b.score)[0].ang;
}
