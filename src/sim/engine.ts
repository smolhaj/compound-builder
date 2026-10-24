/**
 * Simulation step: advance the game clock and run the systems on a fixed
 * quarter-hour sub-step (deterministic regardless of frame rate or speed).
 * Systems mutate a draft; `step` returns a fresh state object.
 */
import { LIFESTYLE } from './site';
import { crewStep } from './crews';
import { addWork, blockedReason, isFinished } from './construction';
import { addCarryWork, deliverOrders } from './economy';
import { addFixWork, nextFix, siteJobsDay } from './improvements';
import { paperworkDay } from './paperwork';
import { addFellWork, nextFellJob } from './forestry';
import { burnFirewood, demandNow } from './heating';
import { upkeepDay } from './upkeep';
import { shelfDay } from './shelf';
import { bodyDay } from './body';
import { addRunWork, nextRun } from './perimeter';
import { addFitWork, balanceDay, nextFit, plant } from './utilities';
import { addHardenWork, nextHardenJob } from './hardening';
import { updateDisaster } from './disaster';
import { liveDay, workFactor } from './needs';
import { gateDay, neighborGossip } from './encounters';
import { falloutDay, isNuclear, SHELTER_DAYS, strike } from './nuclear';
import { tallyDay } from './report';
import { landMarketDay } from './land';
import { effectsDay } from './effects';
import { mulberry32 } from './rng';
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
  const fix = target || run || fit || harden ? null : nextFix(s);
  // deliveries at the road come in before anything else gets built
  const carry = s.roadside?.length > 0;
  const job = nextFellJob(s);
  // with both building and felling to do, the family splits: every other person to the woods
  const weekday = dayIndex(s.clock.t) % 7 < 5;
  s.people.forEach((p, i) => {
    const ps = s.personState.find(x => x.id === p.id)!;
    if (ps.needs.died != null) { ps.task = 'gone'; ps.target = null; return; }
    // the first two weeks after the strikes: everyone in the shelter
    if (isNuclear(s) && s.clock.t < s.disaster.hitAt + SHELTER_DAYS) { ps.task = routineAt(p, h) === 'sleep' ? 'sleep' : 'shelter'; ps.target = null; return; }
    const rate = buildRate(p) * workFactor(ps.needs);
    const slot = routineAt(p, h);
    // the day job: weekdays in town during work hours, paid by the hour
    if (slot === 'work' && weekday && ps.employed && p.job) {
      ps.task = 'job'; ps.target = null;
      s.money += p.job.wage / 8 * SUBSTEP * 24;
      return;
    }
    const task = taskFor(slot, carry || target !== null || run !== null || fit !== null || harden !== null || fix !== null, job !== null, i % 2 === 1);
    ps.task = task;
    ps.target = task === 'build' && !carry ? (target?.id ?? run?.id ?? fit?.building ?? harden?.building ?? fix?.st.id ?? null) : task === 'forestry' && job ? job.id : null;
    if (task === 'build' && carry) addCarryWork(s, SUBSTEP * 24 * rate);
    else if (task === 'build' && target) addWork(s, target, SUBSTEP * 24 * rate);
    else if (task === 'build' && run) addRunWork(s, run, SUBSTEP * 24 * rate);
    else if (task === 'build' && fit) addFitWork(s, fit, SUBSTEP * 24, p.skills.mechanic);
    else if (task === 'build' && harden) addHardenWork(s, harden, SUBSTEP * 24 * rate);
    else if (task === 'build' && fix) addFixWork(s, fix.st, fix.f, SUBSTEP * 24 * rate);
    else if (task === 'forestry' && job) addFellWork(s, job, SUBSTEP * 24 * rate);
  });
  if (s.disaster.tracks.banks > 0.5 && s.disaster.tracks.stores > 0.5) s.money -= LIVING_PER_DAY * SUBSTEP;
  // investment income comes in while the banks work
  if (s.disaster.tracks.banks > 0.5) s.money += LIFESTYLE[s.lifestyle].passive / 365 * SUBSTEP;
  crewStep(s, SUBSTEP);
  burnFirewood(s, SUBSTEP);
  // the collapse clock, once a day: warning signs, the hit, the outside world's services
  if (dayIndex(s.clock.t) !== s.disaster.day) {
    const before = s.disaster.phase;
    for (const line of updateDisaster(s.disaster, s.clock.t, s.seed)) log(s, line);
    if (s.disaster.phase === 'warning') {
      const gossip = neighborGossip(s, mulberry32(s.seed * 17 + dayIndex(s.clock.t)));
      if (gossip) { s.disaster.news.push({ t: s.clock.t, text: gossip, tone: 1 }); log(s, gossip); }
    }
    landMarketDay(s, dayIndex(s.clock.t));
    siteJobsDay(s);
    for (const line of paperworkDay(s)) log(s, line);
    for (const line of shelfDay(s)) log(s, line);
    for (const line of upkeepDay(s, demandNow(s), s.heat.warned !== dayIndex(s.clock.t) - 1 && s.heat.warned !== dayIndex(s.clock.t))) log(s, line);
    const e = gateDay(s);
    if (e) log(s, `${e.title}.`);
    if (before !== 'impact' && s.disaster.phase === 'impact' && s.disaster.kind === 'nuclear') for (const line of strike(s)) log(s, line);
    for (const line of falloutDay(s)) log(s, line);
    for (const line of effectsDay(s)) log(s, line);
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
    for (const line of bodyDay(s)) log(s, line);
    const end = tallyDay(s);
    if (end) log(s, end.kind === 'wipe' ? 'The last of the family is gone.' : end.kind === 'recovered' ? 'The outside world is coming back.' : end.kind === 'new_normal' ? 'The outside world has come back as far as it will.' : 'A full year the place has fed itself.');
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
