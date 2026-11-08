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
 * Who is merciful is `dispositionOf` (sim/crewMercy.ts, save v87): HOSTILE crews (savage, gangs, hordes, hard looters) kill nearly everyone they find
 * and sometimes keep a captive; MERCIFUL crews (refugees, desperate, hard militia / patrols / requisition) always spare a child, usually spare an
 * unarmed adult who complies, and never spare a man who is still armed (he is disarmed and held, hurt, or killed).
 */
import type { BreachFateKind } from './battleTypes';
import type { CrewKind, Temper } from './surrender';
import { dispositionOf, hostileVerdict, mercifulVerdict, type Found } from './crewMercy';

export type Fate = BreachFateKind;
export interface BreachDefender {
  id: string;
  /** Hurt and on the ground. */
  down: boolean;
  kid: boolean;
  age: number;
  /** Still holding a weapon and in the fight (default: an adult on his feet). */
  armed?: boolean;
}
export interface BreachCrew { temper: Temper; kind?: CrewKind; men: number }

/** The most this crew carries off in one night. */
export function takeCap(temper: Temper, kind: CrewKind | undefined, men: number): number {
  if (temper === 'savage') return 99;   // the children (adults are not taken)
  if (temper === 'hard') return Math.max(1, Math.min(2, Math.ceil(men / 4)));
  return kind === 'requisition' ? 1 : 0;
}

const isWorker = (d: BreachDefender) => !d.kid && d.age >= 16 && d.age <= 55;
/** Share of the standing adults who get away (to the shelter, out the tunnel, over the back wall) before the crew reaches them. */
const FLEE: Record<Temper, number> = { desperate: 0.3, hard: 0.12, savage: 0.2 };

/** The fate of each defender still on the ground. Order does not matter; the seeded stream does. */
export function breachFates(defs: readonly BreachDefender[], crew: BreachCrew, r: () => number): Array<{ id: string; fate: Fate }> {
  const kind = crew.kind ?? 'other', out: Array<{ id: string; fate: Fate }> = [];
  const disp = dispositionOf(crew.temper, kind);
  let taken = 0;
  const cap = takeCap(crew.temper, crew.kind, crew.men);
  // a savage crew takes the children and no adult; a hard one a worker or a child; a merciful one nobody (a requisition team a worker)
  const canTake = (d: BreachDefender) => taken < cap && (d.kid ? crew.temper === 'savage' : crew.temper !== 'savage' && isWorker(d) && (disp === 'hostile' || kind === 'requisition'));
  for (const d of defs) {
    let fate: Fate;
    const found: Found = { kid: d.kid, age: d.age, armed: d.armed ?? (!d.kid && !d.down), down: d.down, complies: true };
    if (!d.kid && !d.down && r() < FLEE[crew.temper] * (disp === 'merciful' ? 1 : 0.7)) fate = 'fled';
    else if (disp === 'merciful') {
      const v = mercifulVerdict(found, r);
      fate = v === 'taken' ? 'held' : v;
      // a hard crew that is merciful still finishes a man who fought them to the end now and then
      if (fate === 'wounded' && found.armed && crew.temper === 'hard' && r() < 0.15) fate = 'killed';
      if (crew.temper === 'desperate' && fate === 'killed' && r() < (kind === 'refugees' ? 0.97 : 0.8)) fate = 'wounded';   // hungry men who came for food, not blood
    } else {
      const v = hostileVerdict(found, canTake(d), r, crew.temper === 'savage');
      fate = v === 'killed' && d.down ? 'finished' : v;
      if (crew.temper === 'savage' && fate === 'taken' && !d.kid) fate = 'killed';
    }
    if (fate === 'taken') { if (canTake(d)) taken++; else fate = 'held'; }
    out.push({ id: d.id, fate });
  }
  return out;
}
