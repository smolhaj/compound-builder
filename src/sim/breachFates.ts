/**
 * What becomes of the defenders still on the ground when a crew has broken the line and the fight inside is over (pure, seeded). The sim used to
 * end a breach with a defender standing unhurt among seven raiders. Now every defender still in the breached ring gets an explicit fate,
 * by the crew's temper and kind:
 *
 *   killed    shot where they stood                  finished  a wounded man killed on the ground
 *   wounded   shot and left (a down man stays down)  taken     carried off: a child, or a working-age adult a hard crew can use
 *   held      disarmed and held at gunpoint, hands up; the crew takes what it came for and goes (this is the family's surrender)
 *   fled      got away: to the shelter, out the tunnel, over the back wall
 *
 *   savage       shoots or finishes, takes the children        hard       takes workers, hurts the rest, holds the others
 *   desperate    grabs and goes: holds some, the rest run      kind       militia, patrols and requisition teams hold and take, they do not execute
 */
import type { BreachFateKind } from './battleTypes';
import type { CrewKind, Temper } from './surrender';

export type Fate = BreachFateKind;
export interface BreachDefender { id: string; /** Hurt and on the ground. */ down: boolean; kid: boolean; age: number }
export interface BreachCrew { temper: Temper; kind?: CrewKind; men: number }

/** Shares of [killed, wounded, taken, held, fled] for a defender on his feet; taken falls to held where the defender is no use as a worker. */
function standingTable(temper: Temper, kind: CrewKind): [number, number, number, number, number] {
  if (kind === 'refugees') return [0.01, 0.04, 0, 0.55, 0.4];
  if (temper === 'savage') return [0.5, 0.2, 0, 0.1, 0.2];
  if (temper === 'hard') {
    if (kind === 'gang') return [0.08, 0.22, 0.25, 0.33, 0.12];
    if (kind === 'militia' || kind === 'patrol' || kind === 'requisition') return [0.03, 0.15, 0.15, 0.55, 0.12];
    return [0.05, 0.2, 0.2, 0.43, 0.12];
  }
  return [0.03, 0.08, 0, 0.54, 0.35];
}

/** The most this crew carries off in one night. */
export function takeCap(temper: Temper, kind: CrewKind | undefined, men: number): number {
  if (temper === 'savage') return 99;   // the children (adults are not taken)
  if (temper === 'hard') return Math.max(1, Math.min(2, Math.ceil(men / 4)));
  return kind === 'requisition' ? 1 : 0;
}

const isWorker = (d: BreachDefender) => !d.kid && d.age >= 16 && d.age <= 55;

/** The fate of each defender still on the ground. Order does not matter; the seeded stream does. */
export function breachFates(defs: readonly BreachDefender[], crew: BreachCrew, r: () => number): Array<{ id: string; fate: Fate }> {
  const kind = crew.kind ?? 'other', out: Array<{ id: string; fate: Fate }> = [];
  let taken = 0;
  const cap = takeCap(crew.temper, crew.kind, crew.men);
  const canTake = (d: BreachDefender) => taken < cap && (d.kid ? crew.temper !== 'desperate' : crew.temper !== 'savage' && isWorker(d));
  for (const d of defs) {
    const u = r();
    let fate: Fate;
    if (d.kid) {
      // children: a savage crew takes them (or kills them if they fight); a hard one takes some; a desperate one wants food, not children
      const [take, kill, hold] = crew.temper === 'savage' ? [0.6, 0.25, 0] : crew.temper === 'hard' ? [0.3, 0.02, 0.5] : [0, 0, 0.5];
      fate = u < take && canTake(d) ? 'taken' : u < take + kill ? 'killed' : u < take + kill + hold ? 'held' : 'fled';
      if (fate === 'taken') taken++;
    } else if (d.down) {
      const fin = crew.temper === 'savage' ? 0.6 : crew.temper === 'hard' ? 0.1 : 0.02;
      const tk = crew.temper === 'hard' ? 0.2 : 0;
      fate = u < fin ? 'finished' : u < fin + tk && canTake(d) ? 'taken' : 'wounded';
      if (fate === 'taken') taken++;
    } else {
      const [k, w, t, h] = standingTable(crew.temper, kind);
      fate = u < k ? 'killed' : u < k + w ? 'wounded' : u < k + w + t ? (canTake(d) ? 'taken' : 'held') : u < k + w + t + h ? 'held' : 'fled';
      if (fate === 'taken') taken++;
    }
    out.push({ id: d.id, fate });
  }
  return out;
}
