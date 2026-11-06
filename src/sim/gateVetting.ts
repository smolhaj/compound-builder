/**
 * Per-ring gate vetting (docs/DECISIONS.md, "Raid depth"). A household that holds two or more rings has two gates a stranger passes: the outer
 * one (the wall round the yards) and the inner one (the line round the house). The player chooses where the guards look them over:
 *
 *  - none   as before: nobody is checked beyond the talk at the gate, and the secret shows within weeks (sim/newcomers.ts).
 *  - outer  checked at the outer gate; a bad one is turned back there, before they are inside anything.
 *  - inner  let into the outer ring and checked at the inner gate: a few days under watch show more, but a thief has had the outer ring's stores.
 *  - both   both looks, the chances multiply out, and the guards are tied up twice.
 *
 * What a look catches: a fever (the medic sees it), a thief or a scout for a crew (a good talker hears it). Each gate's look costs the guards
 * `VET.HOURS` and, that day, `VET.ATTENTION` points of the watch's detection (they are at the gate, not on the wall). With one ring there is no
 * inner gate: the choice does not apply. Pure (tested).
 */
import { dayIndex, type GameState } from './state';
import { ringsHolding } from './rings';
import { vetting } from './ringFallback';
import { REVEAL_STEAL } from './newcomers';
import type { Character } from './trial';
import type { Stock } from './materials';

export type VetPolicy = 'none' | 'outer' | 'inner' | 'both';
export const VET_POLICIES: readonly VetPolicy[] = ['none', 'outer', 'inner', 'both'];

export const VET = {
  /** Base chance one look catches the secret, by what it is. */
  BASE: { sick: 0.55, thief: 0.35, scout: 0.3 } as Partial<Record<Character, number>>,
  /** Per level of the best medic (sick) or negotiator (thief, scout) on the place. */
  SKILL: 0.04,
  /** The inner gate sees them after days under watch: its look is this much sharper. */
  INNER_K: 1.15,
  CAP: 0.9,
  /** Guard-hours a look takes, and the detection points it costs that day, per gate used. */
  HOURS: 2, ATTENTION: 4, ATTENTION_MAX: 12,
  /** A thief checked at the inner gate has had the outer ring: this share of what a revealed thief would take. */
  OUTER_LOSS: 0.25,
} as const;

/** The gates a policy looks at on this place (one ring: only the outer gate exists). */
export function gatesUsed(s: GameState, policy: VetPolicy): Array<'outer' | 'inner'> {
  if (policy === 'none') return [];
  const two = ringsHolding(s) >= 2;
  if (!two) return policy === 'inner' ? [] : ['outer'];
  return policy === 'both' ? ['outer', 'inner'] : [policy];
}

/** Does the household have an inner gate at all (the choice only shows then)? */
export const canChoose = (s: GameState): boolean => ringsHolding(s) >= 2;

const skillFor = (s: GameState, secret: Character): number => {
  const k = secret === 'sick' ? 'medic' : 'negotiator';
  return Math.max(0, ...s.people.filter((p, i) => !p.kid && s.personState[i]?.needs.died == null).map(p => p.skills[k]));
};

/** The chance one look at each gate catches this secret (0 for a secret a look cannot show). */
export function lookOdds(s: GameState, secret: Character): { outer: number; inner: number } {
  const base = VET.BASE[secret];
  if (base === undefined) return { outer: 0, inner: 0 };
  const o = Math.min(VET.CAP, base + VET.SKILL * skillFor(s, secret));
  return { outer: o, inner: Math.min(VET.CAP, o * VET.INNER_K) };
}

/** The chance a bad one is caught under a policy: every gate used gets its look. */
export function catchChance(s: GameState, policy: VetPolicy, secret: Character): number {
  const o = lookOdds(s, secret), gates = gatesUsed(s, policy);
  return 1 - gates.reduce((a, g) => a * (1 - o[g]), 1);
}

/** What a policy does to the detection of the watch on the day it is used: nothing for 'none'. */
export function vetAttention(s: Pick<GameState, 'gate' | 'clock'>): number {
  const b = s.gate.vetBusy;
  return b && b.day === dayIndex(s.clock.t) ? Math.min(VET.ATTENTION_MAX, b.n * VET.ATTENTION) : 0;
}

/** The one line for the gate card: the choice made, what it catches and what it costs. Null with one ring. */
export function vetLine(s: GameState, policy: VetPolicy = s.gate.vet ?? 'none'): string | null {
  if (!canChoose(s)) return null;
  if (policy === 'none') return 'Vetting: nobody is checked at the gates.';
  const gates = gatesUsed(s, policy);
  return `Vetting at the ${gates.join(' and ')} gate: a fever is caught about ${Math.round(catchChance(s, policy, 'sick') * 10)} in 10, a thief or scout about ${Math.round(catchChance(s, policy, 'thief') * 10)}.`;
}

/** The detail under the line (tooltip): the cost and the difference between the gates. */
export function vetDetail(s: GameState): string[] {
  const g = s.gate.vet ?? 'none';
  return [
    `Each gate that looks them over ties up the guards ${VET.HOURS} hours and costs ${VET.ATTENTION} points of the watch's detection that day (at most ${VET.ATTENTION_MAX}).`,
    'Outer gate: a bad one is turned back before they are inside anything. Inner gate: days under watch show more, but a thief has had the outer ring\'s supplies.',
    ...(g === 'none' ? [] : ['A fever caught is nursed outside the wall; a thief or scout caught is sent on (a scout\'s crew is then expected).']),
  ];
}

export interface VetResult {
  /** Where they were caught, or null (not caught, or no vetting). */
  caught: 'outer' | 'inner' | null;
  /** The lines for the card. */
  lines: string[];
  /** Guard-hours spent. */
  hours: number;
}

/**
 * Run the looks on an arrival the player has decided to take in. Mutates: the day's guard attention, the thief's loss from the outer ring, a scout's warning.
 * `r` is injectable. A caught arrival is not admitted by the caller.
 */
export function vetArrival(s: GameState, secret: Character | undefined, r: () => number, policy: VetPolicy = s.gate.vet ?? 'none'): VetResult {
  const gates = gatesUsed(s, policy);
  if (!gates.length) return { caught: null, lines: [], hours: 0 };
  const day = dayIndex(s.clock.t);
  let used = 0;
  const out: VetResult = { caught: null, lines: [], hours: 0 };
  const odds = secret ? lookOdds(s, secret) : { outer: 0, inner: 0 };
  for (const gate of gates) {
    used++;
    out.hours += VET.HOURS;
    if (secret && odds[gate] > 0 && r() < odds[gate]) { out.caught = gate; break; }
  }
  const b = s.gate.vetBusy;
  s.gate.vetBusy = { day, n: (b && b.day === day ? b.n : 0) + used };
  if (out.caught && secret) {
    const at = out.caught === 'outer' ? 'outer gate' : 'inner gate';
    out.lines.push(secret === 'sick' ? `The guards at the ${at} saw the fever and kept them outside.`
      : secret === 'thief' ? `At the ${at} the guards found a hand that did not stay in its pockets, and sent them on.`
      : `At the ${at} the guards heard too many questions about the posts, and sent them on.`);
    if (secret === 'scout') s.gate.forewarned = true;
    if (secret === 'thief' && out.caught === 'inner') {
      const reach = vetting(s).reach, lost: string[] = [];
      for (const [k, sh] of REVEAL_STEAL as Array<[keyof Stock, number]>) { const t = Math.floor((s.stock[k] ?? 0) * sh * reach * VET.OUTER_LOSS); if (t > 0) { s.stock[k] -= t; lost.push(`${t} ${k}`); } }
      if (lost.length) out.lines.push(`They had a night in the outer ring first: ${lost.join(', ')} went missing.`);
    }
  }
  return out;
}
