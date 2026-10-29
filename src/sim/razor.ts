/**
 * Razor wire on a wall or fence (docs/DECISIONS.md, "Motor court, bar fence and razor wire"): concertina coils on brackets along the top of a finished
 * run. The price table is `RAZOR` in perimeter.ts (per 6 m: wire and hardware, a few hours' work). It is hung straight from the stockpile
 * (no run to build), makes the run stop people a little more (`peopleBlock`), and is drawn as coils on the top. A run that is upgraded sheds it
 * (the wire is not carried over to the new wall). Pure (tested).
 */
import { hasAll, shortfall, waitingFor, type MaterialId, type Stock } from './materials';
import { log } from './economy';
import { PERIMETER, RAZOR, runFinished, wallLength, type PerimeterRun } from './perimeter';
import type { GameState } from './state';

/** The wire's bill for `len` world units of run (the price table, so the Defense tab can show it before it is hung). */
export function razorBill(len: number): Partial<Stock> {
  const out: Partial<Stock> = {};
  for (const [k, v] of Object.entries(RAZOR.MATERIALS) as Array<[MaterialId, number]>) out[k] = Math.max(1, Math.ceil(v * len - 1e-9));
  return out;
}
export const razorHours = (len: number): number => RAZOR.HOURS * len;

/** Why a run can't take razor wire now (null = it can). */
export function razorProblem(s: GameState, r: PerimeterRun): string | null {
  if (!RAZOR.HOSTS.includes(r.kind)) return PERIMETER[r.kind].blocks.people < RAZOR.MIN_BLOCK ? 'nothing to hang it on: it stops nobody' : 'this wall already carries its own wire (or is not a wall)';
  if (!runFinished(r)) return 'it is not finished yet';
  if (r.razor) return 'it already has razor wire';
  if (r.replaces) return 'this wall is an upgrade in progress';
  if (s.perimeter.some(x => x.hostId === r.id)) return 'a patrol walkway runs along the top: no room for wire';
  const bill = razorBill(wallLength(r));
  if (!hasAll(s.stock, bill)) return `waiting for ${waitingFor(shortfall(s.stock, bill) as Partial<Record<MaterialId, number>>)}`;
  return null;
}

/** Hang the wire along a finished run: takes the wire and hardware from the stockpile. Null on success, else why not. */
export function addRazor(s: GameState, runId: string): string | null {
  const r = s.perimeter.find(x => x.id === runId);
  if (!r) return 'no such wall';
  const why = razorProblem(s, r);
  if (why) return why;
  const len = wallLength(r);
  for (const [k, v] of Object.entries(razorBill(len)) as Array<[MaterialId, number]>) s.stock[k] -= v;
  r.razor = true;
  log(s, `The family hung razor wire along the top of the ${PERIMETER[r.kind].name.toLowerCase()} (${Math.round(len * 6)} m, about ${Math.round(razorHours(len))} h).`);
  return null;
}

/** Metres of finished razor wire on the place. */
export const razorMetres = (s: GameState): number => Math.round(s.perimeter.reduce((a, r) => a + (r.razor && runFinished(r) ? wallLength(r) * 6 : 0), 0));
