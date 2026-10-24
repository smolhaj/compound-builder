/**
 * How a run ends, and the report card (GDS §1 and §4, decided with the
 * user: "Rescue, new equilibrium or wipe"; "Newspaper-style + specific
 * lines"). Stats are kept from the day it hits; the run ends when the
 * outside world comes back, when the place has fed itself for a year, or
 * when the family is gone. The card grades the run and calls out what
 * actually mattered: the cistern, the bunker, first aid, who was turned away.
 * Pure.
 */
import { isFinished } from './construction';
import { isHome } from './blueprints';
import { DISASTERS, TRACKS } from './disaster';
import type { GameState } from './state';

export interface RunStats {
  /** Days since the hit that were tallied. */
  days: number;
  hungryDays: number;
  dryDays: number;
  darkDays: number;
  kcalNeed: number;
  kcalGrown: number;
  wounds: number;
  maxDose: number;
  /** The peak headcount (arrivals count). */
  peak: number;
  /** Day the outside world was last back to normal (all tracks ≥ 0.9), or −1. */
  okSince: number;
  /** Consecutive days the place fed itself (grown ≥ need). */
  selfFed: number;
  /** The last year of food grown and needed (kcal; sums that fade over a year, so a winter of eating the harvest counts). */
  grownYear: number;
  needYear: number;
}

export const emptyStats = (): RunStats => ({ days: 0, hungryDays: 0, dryDays: 0, darkDays: 0, kcalNeed: 0, kcalGrown: 0, wounds: 0, maxDose: 0, peak: 0, okSince: -1, selfFed: 0, grownYear: 0, needYear: 0 });

/** The place feeds everyone: over the last year (and at least 13 months in) it grew 95 % of what was eaten. */
export const selfSufficient = (st: RunStats) => st.days >= 400 && st.grownYear >= 0.95 * st.needYear;

export type EndKind = 'recovered' | 'equilibrium' | 'wipe';
export interface Ending { kind: EndKind; day: number; continued: boolean }

const living = (s: GameState) => s.personState.filter(ps => ps.needs.died == null).length;

/** Once a day after the hit: tally, then see whether the run is over. */
export function tallyDay(s: GameState): Ending | null {
  const d = s.disaster;
  if (!d.kind || s.clock.t < d.hitAt || (s.ending && !s.ending.continued)) return null;
  const st = s.stats, day = Math.floor(s.clock.t - d.hitAt);
  if (day <= st.days - 1) return null;
  st.days = day + 1;
  const f = s.food;
  st.kcalNeed += f.needKcal; st.kcalGrown += f.producedKcal;
  if (f.ateKcal < f.needKcal * 0.9) st.hungryDays++;
  if (s.utilities.report.shortL > 0) st.dryDays++;
  const homes = s.structures.filter(x => isFinished(x) && isHome(x.kind));
  if (homes.length && !homes.some(h => s.utilities.lit.includes(h.id))) st.darkDays++;
  st.wounds = Math.max(st.wounds, s.personState.reduce((a, ps) => a + ps.needs.hurt.length, 0));
  st.maxDose = Math.max(st.maxDose, ...s.personState.map(ps => ps.needs.dose));
  st.peak = Math.max(st.peak, living(s));
  st.selfFed = f.producedKcal >= f.needKcal * 0.9 ? st.selfFed + 1 : 0;
  st.grownYear = st.grownYear * (1 - 1 / 365) + f.producedKcal;
  st.needYear = st.needYear * (1 - 1 / 365) + f.needKcal;
  const ok = TRACKS.every(k => d.tracks[k] >= 0.9);
  if (!ok) st.okSince = -1; else if (st.okSince < 0) st.okSince = day;
  if (s.ending) return null;          // playing on after the card
  // the run ends: everyone gone; the world back for a month (and at least three months in); a year and more feeding yourselves
  let kind: EndKind | null = null;
  if (living(s) === 0) kind = 'wipe';
  else if (ok && st.okSince >= 0 && day - st.okSince >= 30 && day >= 90) kind = 'recovered';
  else if (selfSufficient(st)) kind = 'equilibrium';
  if (!kind) return null;
  s.ending = { kind, day: Math.floor(s.clock.t), continued: false };
  return s.ending;
}

export interface ReportCard { masthead: string; date: string; headline: string; sub: string; grade: string; score: number; lines: string[]; facts: Array<[string, string]> }

/** The report card: a grade and the lines that tell what this build did. */
export function reportCard(s: GameState): ReportCard {
  const d = s.disaster, st = s.stats, g = s.gate;
  const fin = s.structures.filter(isFinished);
  const has = (k: string) => fin.some(x => x.kind === k);
  const alive = living(s), total = s.personState.length;
  const lost = s.people.filter((_, i) => s.personState[i]?.needs.died != null);
  const def = d.kind ? DISASTERS[d.kind] : undefined;
  const name = def?.name ?? 'The collapse';
  const end = s.ending?.kind ?? 'recovered';
  const days = st.days;
  // the grade: who lived, how they lived, who they were at the end
  const survival = total ? alive / total : 0;
  const fed = st.days ? 1 - st.hungryDays / st.days : 1;
  const score = Math.round(100 * (0.5 * survival + 0.2 * fed + 0.15 * (g.humanity / 100) + 0.15 * (g.raidsHeld + g.raidsLost ? g.raidsHeld / (g.raidsHeld + g.raidsLost) : 1)));
  const grade = end === 'wipe' ? 'F' : score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 65 ? 'C' : score >= 50 ? 'D' : 'F';
  const family = s.people[0]?.last ?? 'The family';
  const headline = end === 'wipe' ? `No one left at the ${family} place`
    : end === 'recovered' ? `${family} family came through ${name.toLowerCase()}`
    : `${family} homestead feeds itself a year on`;
  const sub = end === 'wipe' ? `${days} days after it hit, the last of them was gone.`
    : end === 'recovered' ? `${days} days after it hit, the lights are back on in the valley. ${alive} of ${total} made it.`
    : `A year without a store. ${alive} people live off what the place grows.`;
  const lines: string[] = [];
  // water
  const water = has('well_drilled') || has('well_hand') || has('cistern') || has('water_tower');
  if (st.dryDays === 0 && water) lines.push(has('cistern') ? 'Your cistern kept the water coming every day.' : 'The well never went dry.');
  else if (!water) lines.push('No well, no cistern: water came by the bucket from the creek.');
  else if (st.dryDays > 7) lines.push(`${st.dryDays} days without enough water.`);
  // power
  const solar = has('solar_array'), battery = has('battery_shed');
  if (d.kind === 'grid_down' || d.kind === 'nuclear') {
    if (solar && !battery && s.utilities.grid) lines.push('The solar was grid-tied: when the grid died, so did the panels.');
    else if (st.darkDays === 0 && solar && battery) lines.push('The batteries kept the lights and the freezer on.');
    else if (st.darkDays > 30) lines.push(`${st.darkDays} nights by lamplight.`);
  }
  // shelter and fallout
  if (d.kind === 'nuclear') {
    if (st.maxDose < 0.1) lines.push('The shelter held: nobody took more than a chest X-ray\'s worth of fallout in a year of them.');
    else if (st.maxDose > 1) lines.push(`Radiation sickness: the worst dose was ${st.maxDose.toFixed(1)} Sv.`);
    if (s.utilities.fried.length) lines.push('The EMP fried the electronics and there were no spares to put in.');
  }
  // food
  const grown = st.kcalNeed ? st.kcalGrown / st.kcalNeed : 0;
  if (st.hungryDays === 0) lines.push('Nobody went hungry.');
  else lines.push(`${st.hungryDays} hungry days.`);
  if (grown > 0.05) {
    const src = [has('field') && 'the fields', has('garden') && 'the garden', has('chicken_coop') && 'the hens'].filter(Boolean) as string[];
    const what = src.length ? src.slice(0, -1).join(', ') + (src.length > 1 ? ' and ' : '') + src[src.length - 1] : 'what the place grew';
    lines.push(`${what[0].toUpperCase() + what.slice(1)} covered ${Math.round(grown * 100)} % of what everyone ate.`);
  }
  // people
  const medic = Math.max(0, ...s.people.filter((_, i) => s.personState[i]?.needs.died == null).map(p => p.skills.medic));
  if (st.wounds > 0 && medic < 3 && !has('bunker_medical')) lines.push('No one knew first aid.');
  else if (st.wounds > 0 && (medic >= 5 || has('bunker_medical'))) lines.push('Every wound was dressed and healed.');
  for (const p of lost) lines.push(`${p.first} ${p.last} did not make it.`);
  if (g.tookIn) lines.push(`You took in ${g.tookIn} ${g.tookIn === 1 ? 'person' : 'people'}.`);
  if (g.turnedAway) lines.push(`You turned away ${g.turnedAway}.`);
  if (g.raidsHeld) lines.push(`The line held ${g.raidsHeld} ${g.raidsHeld === 1 ? 'time' : 'times'}${g.raidsLost ? `, and broke ${g.raidsLost}` : ''}.`);
  else if (g.raidsLost) lines.push(`They got in ${g.raidsLost} ${g.raidsLost === 1 ? 'time' : 'times'}.`);
  if (s.perimeter.some(r => r.kind === 'escape_tunnel' && r.finishedAt !== null)) lines.push('The tunnel was never needed.');
  const allies = s.neighbors.filter(n => n.disposition > 50 && n.status === 'home');
  if (allies.length) lines.push(`${allies.map(n => n.name[0].toUpperCase() + n.name.slice(1)).join(' and ')} stood with you.`);
  return {
    masthead: 'The Valley Courier', date: `Day ${days} after ${name.toLowerCase()}`,
    headline, sub, grade, score, lines,
    facts: [['Survived', `${alive} of ${total}`], ['Humanity', `${Math.round(g.humanity)}`], ['Days of it', `${days}`], ['Hungry days', `${st.hungryDays}`]],
  };
}
