/**
 * Talking to a crew at the gate (raid depth, user decision 4: a NEW choice card, logged in docs/DECISIONS.md). Pure and seeded.
 *
 * Some crews at the gate can be talked to: they are hungry, or official, or only after something small. The raid prompt then shows
 * "Talk to them" with three terms, each a real trade-off, none free and none a sure thing:
 *
 *   neg_toll      pay a toll in supplies. Costs stores; works against most crews; a hard crew may take it and still come back, or draw.
 *   neg_aid       a meal and a night by the road, for hungry families and desperate men. Costs food, raises humanity; only for the desperate;
 *                 an armed trick under the coats is rare but possible, and a sickness abroad can come in with them.
 *   neg_redirect  send them up the road to the neighbors' places. Costs nothing in stores, but humanity and the neighbors' good will;
 *                 if they find out you lied, they come back angry.
 *
 * What decides it: the best talker in the household, the temper and kind of the crew, how hard the place looks (walls, armed fighters),
 * the dogs, the neighbors on the radio net, word that the place shoots back (`gate.respect`), the humanity track, and the difficulty
 * (`DIFFICULTY.talk`). A savage crew never talks; a crew that is not willing never shows the card. The odds are shown as words, honest to
 * the dice: a settled talk is capped at 90% and a failed one is either a refusal (a normal fight follows) or a trap (the crew is
 * through the gate before the fight starts).
 */
import { mulberry32 } from './rng';
import { diffOf } from './difficulty';
import type { Encounter, EncounterKind, Stance } from './encounters';
import type { Stock } from './materials';
import type { GameState } from './state';

export type TalkStance = 'neg_toll' | 'neg_aid' | 'neg_redirect';
export const TALK_STANCES: readonly TalkStance[] = ['neg_toll', 'neg_aid', 'neg_redirect'];
export const isTalk = (st: Stance): st is TalkStance => (TALK_STANCES as readonly string[]).includes(st);

/** Kinds that can be talked to at all (the dead, and a break-in in the house, cannot). */
const TALKS: ReadonlySet<EncounterKind> = new Set(['looters', 'gang', 'militia', 'patrol', 'requisition']);
/** How likely a crew of each kind is to be open to talk at all. */
const OPEN: Partial<Record<EncounterKind, number>> = { looters: 0.75, gang: 0.5, militia: 0.65, patrol: 0.6, requisition: 0.9 };
const OPEN_TEMPER = { desperate: 1, hard: 0.5, savage: 0 } as const;

/** The least and most a settled talk can be (nobody is sure of anything). */
export const P_MIN = 0.08, P_MAX = 0.9;

export interface TalkPlace { fortress: number; detection: number; armed: boolean; fighters: number }
export interface TermView {
  stance: TalkStance;
  name: string;
  /** What it does, one sentence. */
  blurb: string;
  /** What it costs, in words. */
  cost: string;
  /** The supplies it takes if it is tried. */
  stock: Partial<Stock>;
  /** The change to the humanity track if it works. */
  humanity: number;
  pSettle: number;
  pAmbush: number;
  /** In words: how likely it is to work and what the risk is. */
  odds: string;
  risk: string;
  /** Why it cannot be chosen right now (null: it can). */
  blocked: string | null;
}
export interface TalkOffer { open: boolean; terms: TermView[]; /** The line the card opens with. */ lead: string }

export const oddsWord = (p: number): string => (p < 0.2 ? 'a long shot' : p < 0.4 ? 'unlikely' : p < 0.6 ? 'about even' : p < 0.8 ? 'likely' : 'very likely');
export const riskWord = (p: number): string => (p < 0.04 ? 'little risk of a trap' : p < 0.12 ? 'some risk of a trap' : p < 0.25 ? 'a real risk of a trap' : 'a serious risk of a trap');

/** Whether the crew would talk at all: decided once from the seed, so the card does not flicker. */
export function willing(s: GameState, e: Pick<Encounter, 'kind' | 'day' | 'size' | 'temper' | 'id'>): boolean {
  if (!TALKS.has(e.kind)) return false;
  const p = (OPEN[e.kind] ?? 0) * OPEN_TEMPER[e.temper ?? 'desperate'];
  return mulberry32(s.seed * 47 + e.day * 13 + e.size * 7 + e.id.length)() < p;
}

const best = (s: GameState): number => Math.max(0, ...s.people.filter((x, i) => !x.kid && s.personState[i]?.needs.died == null).map(x => x.skills.negotiator));
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));

/** What each term takes from the stores for a crew of this size. */
export function termStock(e: Pick<Encounter, 'wants' | 'size'>, t: TalkStance): Partial<Stock> {
  if (t === 'neg_toll') {
    const out: Partial<Stock> = {};
    for (const [k, n] of Object.entries(e.wants ?? {}) as Array<[keyof Stock, number]>) out[k] = Math.max(1, Math.ceil(n * 0.4));
    return out;
  }
  if (t === 'neg_aid') return { canned: Math.max(2, Math.ceil(e.size * 0.6)) };
  return {};
}

const BASE: Record<TalkStance, number> = { neg_toll: 0.46, neg_aid: 0.52, neg_redirect: 0.36 };
const KIND_MOD: Partial<Record<EncounterKind, Record<TalkStance, number>>> = {
  looters: { neg_toll: 0.05, neg_aid: 0.05, neg_redirect: 0.05 },
  gang: { neg_toll: -0.1, neg_aid: -0.1, neg_redirect: -0.05 },
  militia: { neg_toll: -0.05, neg_aid: -0.15, neg_redirect: 0.1 },
  patrol: { neg_toll: -0.05, neg_aid: -0.2, neg_redirect: -0.1 },
  requisition: { neg_toll: 0.12, neg_aid: -0.1, neg_redirect: 0.0 },
};

/** The chance a term settles it. */
export function settleChance(s: GameState, e: Pick<Encounter, 'kind' | 'temper' | 'armed' | 'size'>, t: TalkStance, p: TalkPlace): number {
  let x = BASE[t] + (KIND_MOD[e.kind]?.[t] ?? 0);
  x += clamp(best(s) * 0.035, 0, 0.3);
  x -= e.temper === 'savage' ? 0.6 : e.temper === 'hard' ? 0.2 : 0;
  if (t !== 'neg_aid') x += (p.fortress / 100) * 0.08 + (p.armed && p.fighters >= 2 ? 0.04 : 0) - (e.armed ? 0.04 : 0);
  if ((s.dogs ?? []).some(d => d.health > 20)) x += 0.03;
  x += (s.gate.respect ?? 0) * 0.1;
  if (s.neighbors.some(n => n.radio && n.status === 'home' && n.disposition > 30)) x += 0.04;
  const h = s.gate.humanity;
  x += t === 'neg_aid' ? clamp((h - 50) / 500, -0.1, 0.1) : t === 'neg_redirect' ? -clamp((h - 50) / 800, -0.06, 0.06) : 0;
  return clamp(x * diffOf(s.disaster).talk, P_MIN, P_MAX);
}

/** The chance a failed talk is a trap (the crew is through the gate before the fight): the rest of the failures are plain refusals. */
export function ambushChance(s: GameState, e: Pick<Encounter, 'kind' | 'temper'>, t: TalkStance, pSettle: number): number {
  const share = (e.temper === 'savage' ? 0.8 : e.temper === 'hard' ? 0.45 : 0.12) + (t === 'neg_redirect' ? 0.15 : t === 'neg_aid' ? -0.05 : 0) + (e.kind === 'gang' ? 0.08 : 0);
  const hard = diffOf(s.disaster).talk < 1 ? 1.3 : 1;
  return clamp((1 - pSettle) * clamp(share * hard, 0.03, 0.85), 0, 0.8);
}

const NAME: Record<TalkStance, [string, string]> = {
  neg_toll: ['Pay a toll', 'Hand over a share of what they came for, at the gate, and let them go.'],
  neg_aid: ['A meal and the road', 'Feed them at the fence and point them on. For people who are hungry more than they are mean.'],
  neg_redirect: ['Send them up the road', 'Tell them the neighbors have more, and where. It costs you nothing but your conscience and the neighbors\' trust.'],
};
export const TALK_TEXT: Record<TalkStance, [string, string]> = NAME;

function costWords(st: Partial<Stock>, hum: number, nb: boolean): string {
  const parts = Object.entries(st).map(([k, n]) => `${n} ${k}`);
  if (hum) parts.push(`humanity ${hum > 0 ? '+' : ''}${hum}`);
  if (nb) parts.push('the neighbors\' good will');
  return parts.length ? parts.join(', ') : 'nothing';
}

/** The card: whether they will talk, and the terms with their price and honest odds. */
export function talkOffer(s: GameState, e: Encounter, p: TalkPlace): TalkOffer {
  if (!willing(s, e)) return { open: false, terms: [], lead: '' };
  const terms: TermView[] = [];
  for (const t of TALK_STANCES) {
    if (t === 'neg_aid' && (e.temper !== 'desperate' && e.temper !== undefined)) continue;
    if (t === 'neg_aid' && (e.kind === 'patrol' || e.kind === 'requisition')) continue;
    const stock = termStock(e, t);
    const hum = t === 'neg_aid' ? 4 : t === 'neg_redirect' ? -8 : 0;
    const homes = s.neighbors.filter(n => n.status === 'home');
    const missing = Object.entries(stock).filter(([k, n]) => (s.stock[k as keyof Stock] ?? 0) < (n as number));
    const blocked = missing.length ? 'You do not have enough to offer.' : t === 'neg_redirect' && !homes.length ? 'There is no one left up the road to send them to.' : null;
    const pS = settleChance(s, e, t, p), pA = ambushChance(s, e, t, pS);
    terms.push({ stance: t, name: NAME[t][0], blurb: NAME[t][1], cost: costWords(stock, hum, t === 'neg_redirect'), stock, humanity: hum, pSettle: pS, pAmbush: pA, odds: oddsWord(pS), risk: riskWord(pA), blocked });
  }
  return { open: terms.length > 0, terms, lead: e.kind === 'requisition' || e.kind === 'patrol' ? 'The man in front has a clipboard, and he is not waving it at you.' : e.temper === 'desperate' ? 'One of them has stepped out in front with his hands open.' : 'One of them has stepped forward and is watching your windows. He does not have his hands open.' };
}

export type TalkResult = 'settled' | 'refused' | 'ambush';
export interface TalkOutcome { result: TalkResult; title: string; text: string; tone: 'good' | 'mixed' | 'bad'; lines: string[]; humanity: number; neighborHit: boolean; cameBack: boolean }

/**
 * Roll the talk and say what happened. Pure: does not touch the game. The caller applies the stock, humanity and neighbors from the outcome
 * (`stock` is what was handed over, nothing on a plain refusal or a redirect).
 */
export function talkRoll(s: GameState, e: Encounter, t: TalkStance, p: TalkPlace, r: () => number): TalkOutcome & { stock: Partial<Stock> } {
  const pS = settleChance(s, e, t, p), pA = ambushChance(s, e, t, pS);
  const u = r();
  const stock = termStock(e, t);
  if (u < pS) {
    const hum = t === 'neg_aid' ? 4 : t === 'neg_redirect' ? -8 : 0;
    const cameBack = t === 'neg_toll' && e.temper === 'hard' && r() < 0.5;
    const title = t === 'neg_toll' ? 'The toll was paid' : t === 'neg_aid' ? 'A meal and the road' : 'They went up the road';
    const text = t === 'neg_toll' ? 'They counted it, nodded, and went back to the truck. Nobody fired a shot.'
      : t === 'neg_aid' ? 'They ate at the fence, in turns, without much talk. By morning the road was empty.'
      : 'They turned and walked up the county road toward the next gate. Nobody at supper said anything about it.';
    const lines = [t === 'neg_toll' ? `Handed over: ${costWords(stock, 0, false)}.` : t === 'neg_aid' ? `Fed them: ${costWords(stock, 0, false)}.` : 'The neighbors will not thank you if they find out.'];
    if (cameBack) lines.push('Word gets around that this place pays. Expect them, or others, sooner than you would like.');
    return { result: 'settled', title, text, tone: t === 'neg_redirect' ? 'mixed' : 'good', lines, humanity: hum, neighborHit: t === 'neg_redirect', cameBack, stock };
  }
  if (u < pS + pA) {
    const taken = t === 'neg_toll' || t === 'neg_aid' ? stock : {};
    return { result: 'ambush', title: 'It was a trap', text: 'They took what was offered and drew anyway. The gate is open and they are coming through.', tone: 'bad', lines: ['They were never going to leave on those terms.'], humanity: 0, neighborHit: false, cameBack: false, stock: taken };
  }
  return { result: 'refused', title: 'Talks broke down', text: t === 'neg_redirect' ? 'They did not believe a word of it.' : 'They laughed at the offer. Whatever they came for, it was more than that.', tone: 'mixed', lines: ['Talks broke down.'], humanity: 0, neighborHit: false, cameBack: false, stock: {} };
}
