/**
 * Stealth give-aways and what keeping quiet costs (docs/DECISIONS.md "Stealth"). Builds on sim/blackout.ts (light), sim/opsec.ts (the
 * exposure sum), sim/gatherings.ts (party noise). Pure and tested.
 *
 * New give-aways, all after the hit and after dark (a chimney or a barking dog means little in peacetime):
 *   chimney  the stove's plume against the sky, from the cold of the night and the burn mode (stealthState `SMOKE_K`)
 *   noise    animals (stock) and dogs barking at night, plus a party's noise through the walls; the generator's sound is the existing one
 *   heat     the thermal signature (stove, generator, heated glasshouse): shown, but nothing modelled yet sees it, so it adds no exposure
 * Every option only LOWERS these against the plain default, and costs the family something else: a cold house (dusk burn), more wood
 * (smokeless), slower night work (quiet hours), a trainer's fee (quiet dogs), a dark house (lights out). Stealth never raises exposure, so
 * it never makes a raid easier than the lot without it (property test, sim/stealth.test.ts).
 */
import { hourOf, type GameState } from './state';
import { demandNow } from './heating';
import { isNightHour, genRunning, type LightLine } from './blackout';
import { burnMode, dogsQuiet, quietHours, SMOKE_K, soundK, stealthOf, DOG_TRAINER, type BurnMode } from './stealthState';
import { dogCount } from './pets';
import { noiseNow } from './gatherings';
import { log } from './economy';

const afterHit = (s: GameState): boolean => !!s.disaster.kind && s.clock.t >= s.disaster.hitAt;
const night = (s: GameState): boolean => isNightHour(hourOf(s.clock.t));
const head = (s: GameState, k: string): number => Math.floor((s.stock as unknown as Record<string, number>)[k] ?? 0);

/** Every number here is tunable. */
export const STEALTH = {
  /** Chimney points at full heating demand, and the floor in a cool night; the cap. */
  CHIMNEY_MAX: 4, CHIMNEY_BASE: 1.2, CHIMNEY_DEMAND: 2.2,
  /** Animals: points a head at night, the cap; dogs: points a dog, the cap; a quiet dog keeps this share. */
  ANIMAL: 0.1, ANIMAL_CAP: 2, DOG: 0.6, DOG_CAP: 1.8, DOG_QUIET: 0.25,
  /** The stove is going, in the nightly sense: a mild night needs no fire. */
  FIRE_DEMAND: 0.15,
  /** Dusk-only: morale target points lost at full cold, and the frostbite exposure added (cold.ts). */
  CHILL_MORALE: 6, CHILL_FROST: 0.3,
  /** Quiet hours: night work rate. */
  QUIET_WORK: 0.5,
} as const;

/** Is the stove going tonight (cold enough, wood in hand, after the hit)? */
export const stoveGoing = (s: GameState): boolean => afterHit(s) && demandNow(s) > STEALTH.FIRE_DEMAND && s.heat.burned < 1;

/** The chimney's plume at night, in exposure points. */
export function chimneyPoints(s: GameState): number {
  if (!night(s) || !stoveGoing(s)) return 0;
  const d = demandNow(s);
  return Math.min(STEALTH.CHIMNEY_MAX, STEALTH.CHIMNEY_BASE + STEALTH.CHIMNEY_DEMAND * d) * SMOKE_K[burnMode(s)];
}

/** Animals and dogs at night, in exposure points. */
export function nightNoise(s: GameState): { animals: number; dogs: number } {
  if (!afterHit(s) || !night(s)) return { animals: 0, dogs: 0 };
  const heads = ['goat', 'cow', 'pig', 'steer', 'rabbit', 'sheep', 'chicken', 'hens'].reduce((a, k) => a + head(s, k), 0);
  const q = quietHours(s) ? 0.3 : 1;
  return {
    animals: Math.min(STEALTH.ANIMAL_CAP, heads * STEALTH.ANIMAL) * q,
    dogs: Math.min(STEALTH.DOG_CAP, dogCount(s) * STEALTH.DOG) * (dogsQuiet(s) ? STEALTH.DOG_QUIET : 1),
  };
}
export const nightNoiseTotal = (s: GameState): number => { const n = nightNoise(s); return n.animals + n.dogs; };
/** What a party's noise reaches the road as: through the walls, and under quiet hours. */
export const partyNoise = (s: GameState): number => Math.min(15, noiseNow(s) * soundK(s));

/** The thermal signature in points (information only: nothing that raids sees heat yet). */
export function heatPoints(s: GameState): number {
  if (!afterHit(s)) return 0;
  const stove = night(s) && stoveGoing(s) ? Math.min(3, demandNow(s) * 2) * (burnMode(s) === 'dusk' ? 0.3 : 1) : 0;
  const gen = genRunning(s) ? 2 : 0;
  const glass = Math.min(3, s.structures.filter(st => st.kind === 'greenhouse_heated' && st.finishedAt !== null && s.utilities.lit.includes(st.id)).length * 1.5);
  return stove + gen + glass;
}

/** 0-1: how cold the house is by morning on dusk-only burning (0 on any other mode or a mild night). */
export function chill(s: GameState): number {
  if (burnMode(s) !== 'dusk' || !afterHit(s)) return 0;
  const d = demandNow(s);
  return d < 0.3 ? 0 : Math.min(1, d);
}
/** Morale target points lost to a cold house (everyone, a flat shift). */
export const chillMorale = (s: GameState): number => chill(s) > 0 ? -STEALTH.CHILL_MORALE * chill(s) : 0;
/** Added to the frostbite exposure (sim/cold.ts) while the woodpile is not even empty. */
export const chillFrost = (s: GameState): number => STEALTH.CHILL_FROST * chill(s);
/** Night work rate under quiet hours (1 = unaffected); sim/blackout.ts `nightWork` multiplies it in. */
export const quietWork = (s: GameState, hour: number): number => (quietHours(s) && (hour >= 21 || hour < 5) ? STEALTH.QUIET_WORK : 1);

export type GiveAwayId = 'light' | 'smoke' | 'noise' | 'heat';
export interface GiveAway { id: GiveAwayId; label: string; points: number; /** Does it count toward how visible the place is? */ counts: boolean; note: string }

/** Each give-away as one number, from the existing light lines and the new sources. `cook` is the existing smoke term (cooking, the smoker). */
export function giveAways(s: GameState, lines: readonly LightLine[], cook: number): GiveAway[] {
  const light = lines.filter(l => l.id !== 'generator').reduce((a, l) => a + l.points, 0);
  const gen = lines.find(l => l.id === 'generator')?.points ?? 0;
  const ch = chimneyPoints(s), nn = nightNoise(s), party = partyNoise(s);
  const heat = heatPoints(s);
  const mode = burnMode(s);
  return [
    { id: 'light', label: 'Light', points: light, counts: true, note: light < 1 ? 'dark' : 'windows, floodlights, fire pit, glasshouse' },
    { id: 'smoke', label: 'Smoke', points: cook + ch, counts: true, note: ch > 0 ? `chimney (${mode === 'normal' ? 'a plume' : mode === 'smokeless' ? 'a haze' : 'dusk burn'}) and cooking` : cook > 0 ? 'cooking and the smoker' : 'none' },
    { id: 'noise', label: 'Noise', points: gen + party + nn.animals + nn.dogs, counts: true, note: [gen > 0 ? 'generator' : '', party > 0.5 ? 'a party' : '', nn.animals > 0 ? 'stock' : '', nn.dogs > 0 ? 'dogs' : ''].filter(Boolean).join(', ') || 'quiet' },
    { id: 'heat', label: 'Heat', points: heat, counts: false, note: 'thermal signature (stove, generator, glasshouse): nothing sees it yet, so it adds no exposure' },
  ];
}

/** What the family gives up for the stealth it has chosen, as lines for the readout (empty: nothing). */
export function stealthCosts(s: GameState): string[] {
  const out: string[] = [];
  const m: BurnMode = burnMode(s);
  if (m === 'smokeless') out.push('Smokeless burn: about 15 % more firewood.');
  if (m === 'dusk') out.push(chill(s) > 0 ? `Dusk-only stove: a cold house by morning (morale ${Math.round(chillMorale(s))}, some frostbite risk for children and the old); about 20 % less wood.` : 'Dusk-only stove: about 20 % less wood (the nights are mild, so no chill yet).');
  if (quietHours(s)) out.push(`Quiet hours: night work at ${Math.round(STEALTH.QUIET_WORK * 100)} % between 21:00 and 05:00.`);
  const dark = stealthOf(s).full || s.opsec?.blackout;
  if (dark) out.push('Lights out: dark rooms without blackout curtains (slower night work, a worse mood).');
  return out;
}

/** Why the dogs cannot be trained quiet now (null: they can). */
export function quietDogsProblem(s: GameState): string | null {
  const dogs = dogCount(s), paid = stealthOf(s).dogsPaid ?? 0;
  if (!dogs) return 'no dogs to train';
  const due = Math.max(0, dogs - paid) * DOG_TRAINER;
  return s.money < due ? `the trainer wants $${due}` : null;
}
/** Train the dogs quiet (a one-time fee per dog not yet trained) or let them bark again (free). Returns why not, or null. */
export function setDogsQuiet(s: GameState, on: boolean): string | null {
  const st = ((s.opsec ??= { quietDeliveries: false, blackout: false, auto: 'off' }) as { stealth?: import('./stealthState').Stealth }).stealth ??= {};
  if (!on) { st.dogsQuiet = false; return null; }
  const why = quietDogsProblem(s);
  if (why) return why;
  const dogs = dogCount(s), paid = st.dogsPaid ?? 0, due = Math.max(0, dogs - paid) * DOG_TRAINER;
  if (due) { s.money -= due; st.dogsPaid = dogs; log(s, `The trainer worked with the dogs: $${due}. They alert without barking now.`); }
  st.dogsQuiet = true;
  return null;
}
/** Set one stealth option. */
export function setStealth(s: GameState, k: 'full' | 'quiet', on: boolean): void;
export function setStealth(s: GameState, k: 'burn', v: BurnMode): void;
export function setStealth(s: GameState, k: 'full' | 'quiet' | 'burn', v: boolean | BurnMode): void {
  const st = ((s.opsec ??= { quietDeliveries: false, blackout: false, auto: 'off' }) as { stealth?: import('./stealthState').Stealth }).stealth ??= {};
  if (k === 'burn') st.burn = v as BurnMode; else st[k] = !!v;
}
