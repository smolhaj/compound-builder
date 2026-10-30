/**
 * Where the road comes in (docs/DECISIONS.md, "Roads follow the land"): the entrance on the property line used to be seeded, whatever the
 * family would have chosen. Now the game suggests and the family confirms. `entranceOptions` plans the road from a handful of places
 * along the east line and reads each with the one set of numbers the rest of the game reads (the quote, the winter closure, the
 * response time, the raid choke), so the card can show the trade before anything is poured:
 *
 *  - cost and days: the plan's quote (sim/roadPlan.ts);
 *  - grade and hairpins: the steepest stretch and how many bends;
 *  - snow: days a winter the road is shut, with and without a plow blade (sim/slope.ts `closureFor`, sim/roadFx.ts `winterOf`);
 *  - response: the multiplier on deputy, ambulance and fire (sim/roadFx.ts `responseOf`);
 *  - raids: the single-file stretches a crew's trucks stop at and the extra approach it gives the watch (sim/roadFx.ts `chokesOf`, `startOf`).
 *
 * The suggestion is the cheapest road that stays open in snow: fewest shut days first, then the lowest bill, then the shortest.
 * The choice is `site.entrance` (z on the line); it can be made until the drive is ordered, and not after (the road is poured). Pure (tested).
 */
import { log } from './economy';
import type { GameState } from './state';
import type { Site } from './site';
import type { RoadPlan } from './roadPlan';
import { chokesOf, responseOf, startOf, winterOf } from './roadFx';
import { entranceRange, habitualEntrance, roadPlanFor } from './roadState';
import { pinSeed } from './lotSeed';
import { closureFor, difficultyWith, shutDaysPerWinter, traction } from './slope';

export interface EntranceOption {
  /** Where on the line (z). */
  z: number;
  /** Where the planner actually put the gate. */
  gateZ: number;
  habitual: boolean;
  /** Is this the entrance in use now. */
  current: boolean;
  usd: number; days: number;
  lengthM: number; maxGradePct: number; hairpins: number;
  /** Days a winter the road is shut with the truck as it is now, without and with a plow blade. */
  shutPerWinter: number; shutWithBlade: number;
  /** Multiplier on deputy / ambulance / fire (1 = a plain road). */
  response: number;
  /** Single-file stretches (a crew's trucks bunch and dismount there) and the extra distance the watch sees them (m). */
  chokes: string[]; approachM: number;
  /** Words for the row: what to say about it. */
  notes: string[];
  plan: RoadPlan;
}

export interface EntranceChoice { options: EntranceOption[]; suggested: number; habitual: number; locked: string | null }

const KIND_WORD: Record<string, string> = { bridge1: 'a one-lane bridge', bridge: 'a bridge', tunnel: 'a rock bore', ford: 'a ford', low_water: 'a low-water crossing', hairpins: 'a chain of hairpins' };

/** Why the entrance can no longer be chosen (null: it can). */
export function entranceProblem(s: Pick<GameState, 'site' | 'siteJobs'>): string | null {
  if (s.site.improvements.drive) return 'the drive is in: the road is poured';
  if (s.siteJobs.drive !== null) return 'the drive is on the books: the contractor has the survey';
  return null;
}

type Probe = Pick<Site, 'region' | 'home' | 'lot' | 'creek' | 'timber' | 'listed' | 'entrance' | 'improvements'>;

/** How many places along the line are tried. */
export const ENTRANCE_TRIES = 5;

/**
 * The road from each of a handful of places along the property line (plus the habitual entrance), read as the card needs it.
 * `gameStock` is the plow and truck this game has; for a listing (no game) pass a plain pickup without a blade.
 */
export function entranceOptions(site: Probe, gameSeed: number, ctx: { plow?: boolean; traction?: number } = {}): EntranceChoice {
  const seed = pinSeed(site, gameSeed), [lo, hi] = entranceRange(site), habitual = habitualEntrance(site, seed);
  const zs: number[] = [];
  for (let i = 0; i < ENTRANCE_TRIES; i++) zs.push(lo + (hi - lo) * (0.1 + 0.8 * i / (ENTRANCE_TRIES - 1)));
  // the habitual entrance is one of the choices (and the one the road has now unless the family chose another)
  if (!zs.some(z => Math.abs(z - habitual) < 3)) zs.push(habitual); else zs[zs.reduce((b, z, i) => Math.abs(z - habitual) < Math.abs(zs[b] - habitual) ? i : b, 0)] = habitual;
  zs.sort((a, b) => a - b);
  const trac = ctx.traction ?? 0.6, plow = !!ctx.plow;
  const out: EntranceOption[] = [];
  for (const z of zs) {
    const plan = roadPlanFor({ ...site, entrance: z }, seed);
    // two tries that land on one gate are one choice
    if (out.some(o => Math.abs(o.gateZ - plan.gate.z) < 1.2)) continue;
    const road = winterOf(plan), d = difficultyWith(site, road);
    const each = closureFor(d, trac, plow), eachWith = closureFor(d, trac, true), eachWithout = closureFor(d, trac, false);
    const chokes = chokesOf(plan).map(c => KIND_WORD[c.kind] ?? c.kind);
    const response = responseOf(plan), approachM = Math.round(startOf(plan) * 6);
    const shutNow = shutDaysPerWinter(site, each), shutWith = shutDaysPerWinter(site, eachWith), shutWithout = shutDaysPerWinter(site, eachWithout);
    const notes: string[] = [];
    notes.push(`${plan.lengthM >= 1000 ? (plan.lengthM / 1000).toFixed(1) + ' km' : plan.lengthM + ' m'}, steepest ${Math.round(plan.maxGradePct)} %${plan.hairpins.length ? `, ${plan.hairpins.length} hairpin${plan.hairpins.length === 1 ? '' : 's'}` : ''}`);
    notes.push(shutWithout === 0 ? 'open all winter' : `shut about ${shutWithout} day${shutWithout === 1 ? '' : 's'} a winter${shutWith < shutWithout ? ` (${shutWith} with a plow blade)` : ''}`);
    notes.push(response > 1.05 ? `help takes ${Math.round((response - 1) * 100)} % longer to arrive` : 'help arrives in the usual time');
    notes.push(chokes.length ? `a crew's trucks stop at ${chokes.join(' and ')}: the watch sees them ${approachM} m longer` : 'no choke: a crew drives straight up');
    out.push({ z, gateZ: plan.gate.z, habitual: Math.abs(z - habitual) < 1e-6, current: false, usd: plan.usd, days: plan.days, lengthM: plan.lengthM, maxGradePct: Math.round(plan.maxGradePct * 10) / 10, hairpins: plan.hairpins.length, shutPerWinter: shutNow, shutWithBlade: shutWith, response, chokes, approachM, notes, plan });
  }
  const now = site.entrance != null ? site.entrance : habitual;
  let cur = 0; out.forEach((o, i) => { if (Math.abs(o.z - now) < Math.abs(out[cur].z - now)) cur = i; });
  out[cur].current = true;
  // the suggestion: fewest shut days (with the blade the family has), then the lowest bill, then the shortest road
  let best = 0;
  out.forEach((o, i) => { const b = out[best]; if (o.shutPerWinter < b.shutPerWinter || (o.shutPerWinter === b.shutPerWinter && (o.usd < b.usd || (o.usd === b.usd && o.lengthM < b.lengthM)))) best = i; });
  return { options: out, suggested: best, habitual, locked: null };
}

/** The card's choice for this game (locked once the drive is ordered). */
export function entranceChoiceFor(s: GameState): EntranceChoice {
  const c = entranceOptions(s.site, s.seed, { plow: s.stock.plow >= 1, traction: traction(s) });
  return { ...c, locked: entranceProblem(s) };
}

/** Confirm the entrance at `z`. Null on success, else why not. */
export function setEntrance(s: GameState, z: number): string | null {
  if (s.site.lot?.kind === 'island') return 'the way in starts at the causeway: there is no choice';
  const why = entranceProblem(s);
  if (why) return why;
  const [lo, hi] = entranceRange(s.site);
  if (!(z >= lo && z <= hi)) return 'that is not on your frontage';
  s.site.entrance = Math.round(z * 10) / 10;
  log(s, `The family marked the entrance on the county road side at ${Math.round(s.site.entrance * 6)} m along the line: that is where the drive will come in.`);
  return null;
}
