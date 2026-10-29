/**
 * Simulation step: advance the game clock and run the systems on a fixed
 * quarter-hour sub-step (deterministic regardless of frame rate or speed).
 * Systems mutate a draft; `step` returns a fresh state object.
 */
import { wildlifeDay, wildlifeNight } from './wildlife';
import { LIFESTYLE } from './site';
import { crewStep } from './crews';
import { addWork, canGoOn, isFinished } from './construction';
import { addCarryWork, deliverOrders } from './economy';
import { addFixWork, nextFix, siteJobsDay } from './improvements';
import { paperworkDay } from './paperwork';
import { addFellWork, nextFellJob } from './forestry';
import { burnFirewood, demandNow } from './heating';
import { upkeepDay } from './upkeep';
import { snowedIn, weatherDay } from './weatherThreats';
import { fogLog } from './fogFx';
import { shelfDay } from './shelf';
import { bodyDay } from './body';
import { peopleDay } from './people';
import { medicalDay } from './medical';
import { levelFor, practice } from './skills';
import { financeDay } from './finance';
import { armoryDay } from './armory';
import { petsDay } from './pets';
import { toolsDay } from './tools';
import { greenhouseDay, orchardDay } from './greenhouse';
import { pondDay } from './pond';
import { cropsDay } from './crops';
import { beesDay } from './bees';
import { mapleDay } from './maple';
import { cellarDay, crowdDay } from './storage';
import { vehiclesDay } from './vehicles';
import { kinDay } from './kin';
import { newcomersDay } from './newcomers';
import { radioDay } from './radio';
import { waterDay } from './water';
import { addRunWork, nextRun } from './perimeter';
import { pickWork } from './priority';
import { addFitWork, balanceDay, nextFit, plant } from './utilities';
import { addHardenWork, nextHardenJob } from './hardening';
import { updateDisaster } from './disaster';
import { isSeasonStart, seasonReviewLine } from './newsPool';
import { reviewFacts } from './yearReview';
import { liveDay, workFactor } from './needs';
import { gateDay, neighborGossip } from './encounters';
import { digDay } from './tunnelers';
import { winterDay } from './adaptive';
import { mutualAidDay } from './barter';
import { arrivalCheck, hasCutscene, scheduleArrival } from './siege';
import { scavengeDay } from './scavenge';
import { marketDay } from './market';
import { neighborLifeDay } from './neighborLife';
import { minesDay } from './battle';
import { legalDay } from './breakins';
import { prisonersDay } from './aftermath';
import { isAway, rescueDay } from './rescue';
import { falloutDay, isNuclear, SHELTER_DAYS, strike } from './nuclear';
import { tallyDay } from './report';
import { lineageDay } from './lineage';
import { erasDay } from './eras';
import { landMarketDay } from './land';
import { effectsDay } from './effects';
import { mulberry32 } from './rng';
import { log } from './economy';
import { calendarOf, dayIndex } from './state';
import { buildRate } from './family';
import { taskFor } from './schedule';
import { nightWork } from './blackout';
import { choresDay, choresStep, dailyTick, DUTY, DUTY_TASK, restFactor, tire, dutyWork, choreRate } from './daily';
import { gatheringStep, gatheringsDay } from './gatherings';
import { awayRates, caretakerWork, heatShare, presenceStep, weekenderDay, workDay, livingShare } from './weekender';
import type { GameState, Structure } from './state';

/** Household running costs a day in peacetime (rural Mountain West, 2020s): the truck, insurance, phone and property tax for the household, plus groceries a head ($160 for a family of four). Stops once the stores and banks are gone. */
export const LIVING_BASE = 100, GROCERIES_PER_HEAD = 15;
export const LIVING_PER_DAY = LIVING_BASE + 4 * GROCERIES_PER_HEAD;
export const livingPerDay = (s: GameState) => LIVING_BASE + GROCERIES_PER_HEAD * s.personState.filter(ps => ps.needs.died == null).length;

/** Sub-step in days (15 game minutes). */
export const SUBSTEP = 0.25 / 24;

/** Structure the family works on next: the oldest one that can go on. */
export function nextBuildTarget(s: GameState): Structure | null {
  for (const st of s.structures) if (canGoOn(s, st)) return st;
  return null;
}

function subStep(s: GameState): void {
  deliverOrders(s);
  // animals walking past the motion lights at night (sim/wildlife.ts)
  for (const line of wildlifeNight(s)) log(s, line);
  // a raid rolled this morning reaches the gate at its hour of the night or day
  { const arrived = arrivalCheck(s); if (arrived) log(s, `${arrived.title}.`); }
  const h = (s.clock.ticks * 0.25 + 6) % 24;   // exact: the tick count is an integer (hourOf(t) can land a hair under the hour)
  const { target, run } = pickWork(s, { building: () => nextBuildTarget(s), line: () => nextRun(s) });
  const fit = target || run ? null : nextFit(s);
  const harden = target || run || fit ? null : nextHardenJob(s);
  const fix = target || run || fit || harden ? null : nextFix(s);
  // deliveries at the road come in before anything else gets built
  const carry = s.roadside?.length > 0;
  const job = nextFellJob(s);
  // with both building and felling to do, the family splits: every other person to the woods
  // the weekender (sim/weekender.ts): the family drives up Friday night and back Sunday afternoon; relatives and anyone taken in stay
  const wk = s.weekend, split = wk?.mode === 'split';
  if (split) for (const line of presenceStep(s)) log(s, line);
  const weekday = split ? workDay(s.clock.startDoy, dayIndex(s.clock.t)) : dayIndex(s.clock.t) % 7 < 5;
  const canBuild = carry || target !== null || run !== null || fit !== null || harden !== null || fix !== null;
  // daily life (sim/daily.ts): the roster, refilled each day on Auto (and when the threat changes, checked hourly)
  // (fatigue and chores are counted once a game hour; building work every sub-step)
  const tk = dailyTick(s, { build: canBuild, fell: job !== null }), rates = tk.rates, hrs = SUBSTEP * 24, hourly = s.clock.ticks % 4 === 0;
  const party = gatheringStep(s);
  s.people.forEach((p, i) => {
    const ps = s.personState.find(x => x.id === p.id)!;
    if (ps.needs.died != null) { ps.task = 'gone'; ps.target = null; return; }
    // gone after a taken child: off the place until they're back
    if (isAway(s, p.id)) { ps.task = 'away'; ps.target = null; return; }
    // in town: at the town house, at the job (paid by the hour), or on the road home
    if (split && !wk!.here && wk!.travelers.includes(p.id)) {
      const atWork = !!ps.employed && !!p.job && !p.kid && weekday && h >= 7 && h < 16 && !wk!.stranded && !snowedIn(s);
      ps.task = atWork ? 'job' : 'town'; ps.target = null;
      if (hourly) tire(ps, 'leisure', h, 1);
      if (atWork) s.money += p.job!.wage / 8 * SUBSTEP * 24;
      return;
    }
    const duty = tk.duties[i];
    // between the hour marks nothing changes for someone already on a plain duty (building and felling are worked every sub-step)
    if (!hourly && !party && duty !== 'build' && duty !== 'wood' && ps.task === DUTY_TASK[duty]) return;
    // the first two weeks after the strikes: everyone in the shelter
    if (isNuclear(s) && s.clock.t < s.disaster.hitAt + SHELTER_DAYS) { ps.task = duty === 'sleep' ? 'sleep' : 'shelter'; ps.target = null; if (hourly) tire(ps, duty === 'sleep' ? 'sleep' : 'leisure', h, 1); return; }
    // a gathering: everyone not on watch comes (the little ones until nine)
    if (party && duty !== 'watch' && (duty !== 'sleep' || (h >= 17 && h < (p.kid && p.age < 12 ? 21 : 23)))) { ps.task = 'party'; ps.target = null; if (hourly) tire(ps, 'leisure', h, 1); return; }
    // the day job: weekdays in town during work hours, paid by the hour
    if (DUTY[duty].work && duty !== 'watch' && h >= 7 && h < 16 && weekday && ps.employed && p.job && !snowedIn(s)) {
      ps.task = 'job'; ps.target = null; if (hourly) tire(ps, 'kitchen', h, 1);
      s.money += p.job.wage / 8 * SUBSTEP * 24;
      return;
    }
    if (hourly) tire(ps, duty, h, 1);
    if (duty === 'build' || (duty === 'wood' && job !== null && (rates.woodpile <= 0 || i % 2 === 0))) {
      const rate = buildRate(p) * workFactor(ps.needs) * restFactor(ps) * nightWork(s, h);
      const task = duty === 'wood' ? 'forestry' : taskFor('work', canBuild, job !== null, i % 2 === 1);
      ps.task = task;
      ps.target = task === 'build' && !carry ? (target?.id ?? run?.id ?? fit?.building ?? harden?.building ?? fix?.st.id ?? null) : task === 'forestry' && job ? job.id : null;
      // the hours are practice: building and felling are carpentry, wiring is electrical work, pipes and pumps mechanics (sim/skills.ts)
      // (once an hour: a whole hour's worth at the hour mark)
      if (hourly) {
        if (task === 'build' && fit) {
          const wire = fit.kind === 'wire', skill = wire ? 'electrical' : 'mechanic';
          practice(s, p.id, skill, 1);
          if (wire) practice(s, p.id, 'mechanic', 0.3);
        } else practice(s, p.id, 'builder', task === 'forestry' ? 0.6 : task === 'build' && carry ? 0.2 : 1);
      }
      if (task === 'build' && carry) addCarryWork(s, hrs * rate);
      else if (task === 'build' && target) addWork(s, target, hrs * rate, true);
      else if (task === 'build' && run) addRunWork(s, run, hrs * rate);
      else if (task === 'build' && fit) addFitWork(s, fit, hrs, fit.kind === 'wire' ? Math.max(p.skills.mechanic, levelFor(s, p, 'electrical')) : p.skills.mechanic);
      else if (task === 'build' && harden) addHardenWork(s, harden, hrs * rate);
      else if (task === 'build' && fix) addFixWork(s, fix.st, fix.f, hrs * rate);
      else if (task === 'forestry' && job) addFellWork(s, job, hrs * rate);
      return;
    }
    ps.task = DUTY_TASK[duty];
    ps.target = null;
    if (hourly) dutyWork(s, p, ps, duty, choreRate(p) * workFactor(ps.needs) * restFactor(ps) * nightWork(s, h), h);
  });
  if (hourly) choresStep(s, 1 / 24, split ? awayRates(s, rates) : rates);
  if (split && hourly && h === 10) caretakerWork(s, rates);
  // (broke: the bills stop at nothing; food stamps and the food bank keep the table going)
  if (s.disaster.tracks.banks > 0.5 && s.disaster.tracks.stores > 0.5 && s.money > 0) s.money -= livingPerDay(s) * livingShare(s) * SUBSTEP;
  // investment income comes in while the banks work
  if (s.disaster.tracks.banks > 0.5) s.money += (s.startFunds ? s.startFunds.passive : LIFESTYLE[s.lifestyle].passive) / 365 * SUBSTEP;
  crewStep(s, SUBSTEP);
  burnFirewood(s, SUBSTEP * (split ? heatShare(s) : 1));
  // the collapse clock, once a day: warning signs, the hit, the outside world's services
  if (dayIndex(s.clock.t) !== s.disaster.day) {
    const before = s.disaster.phase;
    for (const line of updateDisaster(s.disaster, s.clock.t, s.seed, { region: s.site.region, doy: calendarOf(s.clock).doy })) log(s, line);
    // two homes: the town house's bills, the caretaker, an empty place's troubles, the move-in card, the hit while away
    for (const line of weekenderDay(s, before)) log(s, line);
    // the start of a season: a line of "years in review" in the log
    { const sea = isSeasonStart(calendarOf(s.clock).doy); if (sea) log(s, seasonReviewLine(reviewFacts(s, sea))); }
    if (s.disaster.phase === 'warning') {
      const gossip = neighborGossip(s, mulberry32(s.seed * 17 + dayIndex(s.clock.t)));
      if (gossip) { s.disaster.news.push({ t: s.clock.t, text: gossip, tone: 1 }); log(s, gossip); }
    }
    landMarketDay(s, dayIndex(s.clock.t));
    siteJobsDay(s);
    for (const line of paperworkDay(s)) log(s, line);
    for (const line of shelfDay(s)) log(s, line);
    for (const line of financeDay(s)) log(s, line);
    for (const line of armoryDay(s)) log(s, line);
    for (const line of petsDay(s)) log(s, line);
    for (const line of toolsDay(s)) log(s, line);
    for (const line of vehiclesDay(s)) log(s, line);
    for (const line of radioDay(s)) log(s, line);
    // (the stove is going unless the woodpile is bare: burnFirewood leaves `burned` at 1 then)
    for (const line of upkeepDay(s, demandNow(s), s.heat.burned < 1)) log(s, line);
    for (const line of mutualAidDay(s)) log(s, line);
    // the world round the place: the neighbors' lives, the market, scavenging runs coming home
    for (const line of neighborLifeDay(s)) log(s, line);
    for (const line of marketDay(s)) log(s, line);
    for (const line of scavengeDay(s)) log(s, line);
    for (const line of minesDay(s)) log(s, line);
    for (const line of legalDay(s)) log(s, line);
    prisonersDay(s);   // (it logs its own lines)
    for (const line of weatherDay(s)) log(s, line);
    for (const line of fogLog(s)) log(s, line);   // valley fog and cloud: this morning, and the forecast for the next (sim/fog.ts)
    for (const line of winterDay(s, dayIndex(s.clock.t))) log(s, line);   // (Hardcore) the first hard winter
    for (const line of digDay(s)) log(s, line);
    for (const line of wildlifeDay(s, s.structures.some(st => st.kind === 'root_cellar' && isFinished(st) && s.utilities.lit.includes(st.id)))) log(s, line);
    // the self-sufficient interior: greenhouse heat, orchard pruning and pests, the pond's fish (sim/greenhouse.ts, sim/pond.ts)
    for (const line of greenhouseDay(s)) log(s, line);
    for (const line of orchardDay(s, s.daily?.chores.levels.orchard ?? 0)) log(s, line);
    for (const line of pondDay(s)) log(s, line);
    // the fields and the soil: sowing, the seed store, the season's close; the cellar bins and the crowded shelves (sim/crops.ts, sim/storage.ts)
    for (const line of cropsDay(s)) log(s, line);
    for (const line of beesDay(s)) log(s, line);
    for (const line of mapleDay(s)) log(s, line);
    for (const line of cellarDay(s)) log(s, line);
    for (const line of crowdDay(s)) log(s, line);
    const e = gateDay(s);
    for (const line of kinDay(s)) log(s, line);
    for (const line of newcomersDay(s)) log(s, line);   // neighbors and strangers who joined; neighbors asking for shelter (after the gate: a card waits its turn)
    // a raid has an hour of arrival (a gang at 2:15 AM); it waits for it and the game runs on until then
    if (e && !(hasCutscene(e) && scheduleArrival(s, e))) log(s, `${e.title}.`);
    rescueDay(s);   // the taken: their fate, leads, word from the crew, a rescue out (logs its own lines)
    if (before !== 'impact' && s.disaster.phase === 'impact' && s.disaster.kind === 'nuclear') for (const line of strike(s)) log(s, line);
    for (const line of falloutDay(s)) log(s, line);
    for (const line of effectsDay(s)) log(s, line);
    for (const line of choresDay(s, mulberry32(s.seed * 6151 + dayIndex(s.clock.t) * 3))) log(s, line);
    for (const line of gatheringsDay(s)) log(s, line);
    if (before !== 'impact' && s.disaster.phase === 'impact') {
      for (const ps of s.personState) if (ps.employed) {
        ps.employed = false; ps.laidOff = true;
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
    for (const line of waterDay(s)) log(s, line);
    s.food = liveDay(s, y - Math.floor(y));
    for (const line of bodyDay(s)) log(s, line);
    for (const line of medicalDay(s)) log(s, line);
    for (const line of peopleDay(s)) log(s, line);
    const end = tallyDay(s);
    if (end) log(s, end.kind === 'wipe' ? 'The last of the family is gone.' : end.kind === 'recovered' ? 'The outside world is coming back.' : end.kind === 'new_normal' ? 'The outside world has come back as far as it will.' : 'A full year the place has fed itself.');
    for (const line of lineageDay(s)) log(s, line);
    for (const line of erasDay(s)) log(s, line);
  }
}

/** Advance `days` of game time. Returns a new state (the input is not mutated). */
export function step(state: GameState, days: number): GameState {
  if (days <= 0) return state;
  // whole sub-steps on an integer counter, so chopping time up differently gives the same result
  const end = state.clock.t + days;
  const target = Math.floor(end / SUBSTEP + 1e-6);
  // the common frame (a render frame is far shorter than a sub-step): no sub-step runs, only the clock moves, so
  // share the rest of the state instead of deep-copying all of it sixty times a second
  if (state.clock.ticks >= target) return { ...state, clock: { ...state.clock, t: end } };
  const s: GameState = structuredClone(state);
  while (s.clock.ticks < target) {
    s.clock.ticks++;
    s.clock.t = s.clock.ticks * SUBSTEP;
    subStep(s);
    // a raid has reached the gate: stop on the very quarter-hour (the cutscene reads the hour off the clock)
    if (hasCutscene(s.gate.pending) && !hasCutscene(state.gate.pending)) return s;
  }
  s.clock.t = end;
  return s;
}
