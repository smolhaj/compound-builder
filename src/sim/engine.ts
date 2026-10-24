/**
 * Simulation step: advance the game clock and run the systems on a fixed
 * quarter-hour sub-step (deterministic regardless of frame rate or speed).
 * Systems mutate a draft; `step` returns a fresh state object.
 */
import { addWork, blockedReason, isFinished } from './construction';
import { deliverOrders } from './economy';
import { addFellWork, nextFellJob } from './forestry';
import { burnFirewood } from './heating';
import { addRunWork, nextRun } from './perimeter';
import { addFitWork, balanceDay, nextFit, plant } from './utilities';
import { addHardenWork, nextHardenJob } from './hardening';
import { updateDisaster } from './disaster';
import { liveDay, workFactor } from './needs';
import { log } from './economy';
import { dayIndex } from './state';
import { buildRate } from './family';
import { routineAt, taskFor } from './schedule';
import { hourOf, type GameState, type Structure } from './state';

/** Household running costs a day in peacetime: groceries, the truck, insurance, phone, property tax (rural Mountain West, 2020s). Stops once the stores and banks are gone. */
export const LIVING_PER_DAY = 160;

/** Sub-step in days (15 game minutes). */
export const SUBSTEP = 0.25 / 24;

/** Structure the family works on next: the oldest one that can go on. */
export function nextBuildTarget(s: GameState): Structure | null {
  for (const st of s.structures) if (!isFinished(st) && blockedReason(s, st) === null) return st;
  return null;
}

function subStep(s: GameState): void {
  deliverOrders(s);
  const h = hourOf(s.clock.t);
  const target = nextBuildTarget(s);
  const run = target ? null : nextRun(s);
  const fit = target || run ? null : nextFit(s);
  const harden = target || run || fit ? null : nextHardenJob(s);
  const job = nextFellJob(s);
  // with both building and felling to do, the family splits: every other person to the woods
  const weekday = dayIndex(s.clock.t) % 7 < 5;
  s.people.forEach((p, i) => {
    const ps = s.personState.find(x => x.id === p.id)!;
    if (ps.needs.died != null) { ps.task = 'gone'; ps.target = null; return; }
    const rate = buildRate(p) * workFactor(ps.needs);
    const slot = routineAt(p, h);
    // the day job: weekdays in town during work hours, paid by the hour
    if (slot === 'work' && weekday && ps.employed && p.job) {
      ps.task = 'job'; ps.target = null;
      s.money += p.job.wage / 8 * SUBSTEP * 24;
      return;
    }
    const task = taskFor(slot, target !== null || run !== null || fit !== null || harden !== null, job !== null, i % 2 === 1);
    ps.task = task;
    ps.target = task === 'build' ? (target?.id ?? run?.id ?? fit?.building ?? harden?.building ?? null) : task === 'forestry' && job ? job.id : null;
    if (task === 'build' && target) addWork(s, target, SUBSTEP * 24 * rate);
    else if (task === 'build' && run) addRunWork(s, run, SUBSTEP * 24 * rate);
    else if (task === 'build' && fit) addFitWork(s, fit, SUBSTEP * 24, p.skills.mechanic);
    else if (task === 'build' && harden) addHardenWork(s, harden, SUBSTEP * 24 * rate);
    else if (task === 'forestry' && job) addFellWork(s, job, SUBSTEP * 24 * rate);
  });
  if (s.disaster.tracks.banks > 0.5 && s.disaster.tracks.stores > 0.5) s.money -= LIVING_PER_DAY * SUBSTEP;
  burnFirewood(s, SUBSTEP);
  // the collapse clock, once a day: warning signs, the hit, the outside world's services
  if (dayIndex(s.clock.t) !== s.disaster.day) {
    const before = s.disaster.phase;
    for (const line of updateDisaster(s.disaster, s.clock.t, s.seed)) log(s, line);
    if (before !== 'impact' && s.disaster.phase === 'impact') {
      for (const ps of s.personState) if (ps.employed) {
        ps.employed = false;
        const p = s.people.find(x => x.id === ps.id);
        if (p?.job) log(s, `${p.first}'s job is gone: nobody is going to work now.`);
      }
    }
  }
  // once a day (at midnight): balance water and power
  const day = dayIndex(s.clock.t);
  if (day !== s.utilities.lastDay && h < 0.3) {
    const x = Math.sin(day * 78.233 + s.seed) * 43758.5453;
    balanceDay(s, plant(s), x - Math.floor(x));
    const y = Math.sin(day * 12.9898 + s.seed * 3.1) * 43758.5453;
    s.food = liveDay(s, y - Math.floor(y));
  }
}

/** Advance `days` of game time. Returns a new state (the input is not mutated). */
export function step(state: GameState, days: number): GameState {
  if (days <= 0) return state;
  const s: GameState = structuredClone(state);
  // whole sub-steps on an integer counter, so chopping time up differently gives the same result
  const end = s.clock.t + days;
  const target = Math.floor(end / SUBSTEP + 1e-6);
  while (s.clock.ticks < target) {
    s.clock.ticks++;
    s.clock.t = s.clock.ticks * SUBSTEP;
    subStep(s);
  }
  s.clock.t = end;
  return s;
}
