/**
 * The cards of an order that has broken or been replaced (WP3): the toll at the bridge, the posse's tithe, the watch committee, an empty
 * house to salvage; deserters; the checkpoint, the requisition order, the draft notice; a fugitive, partisans, an informant, a lost
 * soldier, a punitive column. They are `ExtraEncounterKind`s (sim/disasterFx.ts): `makeOrderCard` builds the card,
 * `resolveOrderCard` answers a stance (null: the generic threat path fights it, after its `kind` is set to a base crew), and
 * `orderLabels` words the buttons with the odds and costs the sim itself will use.
 *
 * State is `disaster.fx[<kind>]` (an `OrderFx`). Money buys passes and bribes while the banks work; silver and goods after.
 * Hostile crews kill all but now and then take captives; merciful crews spare children (sim/crewMercy.ts, by the base kind and
 * temper this module hands to the fight); untrained civilians speak in short, broken lines.
 */
import { asKind, type ExtraEncounterKind } from './disasterFx';
import type { Encounter, Outcome, Stance } from './encounters';
import { postureOf } from './encounters';
import type { GameState } from './state';
import { dayIndex } from './state';
import type { Person } from './family';
import type { Stock } from './materials';
import { MATERIALS } from './materials';
import { METALS } from './finance';
import { mulberry32 } from './rng';
import { bluffOdds } from './parleyChoices';
import { diffOf } from './difficulty';
import { lifeOf, localsOf } from './neighborLife';
import { barterOf } from './barter';
import {
  CHECKPOINT, DRAFT, FACTION, SCARED_LINES, DESERTER_LINES, TIER_NAME, draftPrice, draftable, informantFraction, isInformant, otherFaction, papersOdds, requisitionShare,
  quotaOf, reprisal, searchChance, shortWeightCaught, WAR_INFORM_P, REQ, type Faction, type Front, type TierClock, type WarKind,
} from './occupation';
import { INVADERS, pickInvader, type InvaderDef } from './invaders';
import { TITHE, TOLL, SALVAGE, breakPosseOdds, salvageOwnersHiding, titheOf } from './lawlessMath';

// ── state ──────────────────────────────────────────────────────────────────────────────────────

export interface Draftee { pid: string; back: number | null; why: string }
export interface OrderFx {
  /** Front line (civil war, contested occupation), the occupation clock, the tier reached and the most it can reach. */
  front?: Front; clock?: TierClock; tier?: 1 | 2 | 3; maxTier?: 1 | 2 | 3;
  /** A pass in hand (days since the hit it runs to) and whether a post stands on the county road. */
  pass?: { until: number; kind: 'toll' | 'papers' | 'forged'; faction?: Faction };
  post?: boolean;
  /** The authorities have the family's name until this day. */
  marked?: number;
  lastReq?: number; lastTithe?: number; lastDraft?: number; lastInformant?: number; lastPact?: number; lastCheck?: number;
  standing?: Record<Faction, number>; collab?: Record<Faction, number>;
  flags?: Record<string, Faction | 'none'>;
  intel?: number; resistance?: number; reprisalDue?: number; hunted?: number;
  shelter?: { until: number; count: number; kind: 'fugitive' | 'soldier' | 'partisan' };
  drafted?: Draftee[];
  protectedUntil?: number; defiantUntil?: number; posseBrokenUntil?: number; titheK?: number;
  committee?: string[]; deal?: number;
  salvaged?: Array<{ found: number; who: string }>;
  sniperUntil?: number; sniperFrom?: number;
  radioSignal?: boolean; known?: boolean;
  /** The invasion's occupier (invaders.ts), chosen at the hit. */
  invader?: 'china' | 'russia' | 'axis';
  last?: Record<string, number>;
}

export const fxOf = (s: GameState): OrderFx => {
  const k = s.disaster.kind ?? 'lawless';
  const bag = (s.disaster.fx ??= {});
  return (bag[k] ??= {}) as OrderFx;
};
/** Days since the hit. */
export const since = (s: GameState): number => Math.floor(s.clock.t - s.disaster.hitAt);
/** The occupier of an invasion run (null in the civil war): its words, papers and money. */
export const invaderIn = (s: GameState): InvaderDef | null => (s.disaster.kind === 'invasion' ? INVADERS[(fxOf(s).invader ??= pickInvader(s.site.region, s.disaster.variant, s.seed))] : null);
const kindOf = (s: GameState): WarKind => (s.disaster.kind === 'invasion' ? 'invasion' : 'civil_war');
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
const adults = (s: GameState): Person[] => s.people.filter((p, i) => !p.kid && s.personState[i]?.needs.died == null);
const homeNeighbors = (s: GameState) => s.neighbors.filter(n => n.status === 'home' && n.members > 0);
const humanity = (s: GameState, d: number) => { s.gate.humanity = clamp(s.gate.humanity + d, 0, 100); };
const out = (title: string, text: string, tone: Outcome['tone'], lines: string[] = []): Outcome => ({ title, text, tone, lines });
const rngFor = (s: GameState, e: Encounter, salt: number) => mulberry32(s.seed * 4093 + (e.day + 1) * 31 + salt + e.id.length * 7);
const cap = (x: string) => x[0].toUpperCase() + x.slice(1);
const pickOf = <T,>(r: () => number, xs: readonly T[]): T => xs[Math.floor(r() * xs.length) % xs.length];
const goodsText = (w: Partial<Stock>): string => Object.entries(w).filter(([, n]) => (n ?? 0) > 0).map(([k, n]) => `${n} ${k}`).join(', ') || 'nothing';

/** Take what is there of a bill from the stores (share of each). Returns the lines. */
export function takeGoods(s: GameState, what: Partial<Stock>, share = 1): string[] {
  const done: string[] = [];
  for (const [k, n] of Object.entries(what) as Array<[keyof Stock, number]>) {
    const t = Math.min(s.stock[k], Math.ceil(n * share));
    if (t > 0) { s.stock[k] -= t; done.push(`${t} ${k}`); }
  }
  return done;
}

// ── paying ─────────────────────────────────────────────────────────────────────────────────────

export type PayHow = 'bank' | 'cash' | 'silver' | 'goods';
export const PAY_WORD: Record<PayHow, string> = { bank: 'from the bank', cash: 'in cash from the safe', silver: 'in silver', goods: 'in canned food' };
const silverHoldings = (s: GameState) => (s.fin?.holdings ?? []).filter(h => METALS[h.kind].metal === 'silver' && h.where !== 'bank' && h.units > 0);
export const silverOz = (s: GameState): number => silverHoldings(s).reduce((a, h) => a + METALS[h.kind].oz * h.units, 0);
/** How a sum of dollars would be paid today (money while the banks work, then cash, silver, goods), or null. */
export function payHow(s: GameState, usd: number): PayHow | null {
  if (s.disaster.tracks.banks >= 0.5 && s.money >= usd) return 'bank';
  if ((s.fin?.cash ?? 0) >= usd) return 'cash';
  if (s.fin && silverOz(s) * s.fin.spot.silver >= usd) return 'silver';
  if (s.stock.canned * (MATERIALS.canned.price ?? 38) >= usd) return 'goods';
  return null;
}
export function payUsd(s: GameState, usd: number): PayHow | null {
  const how = payHow(s, usd);
  if (how === 'bank') s.money -= usd;
  else if (how === 'cash') s.fin.cash -= usd;
  else if (how === 'silver') {
    let ozLeft = usd / s.fin.spot.silver;
    for (const h of silverHoldings(s)) { if (ozLeft <= 1e-9) break; const per = METALS[h.kind].oz, n = Math.min(h.units, Math.ceil(ozLeft / per - 1e-9)); h.units -= n; ozLeft -= n * per; }
    s.fin.holdings = s.fin.holdings.filter(h => h.units > 0);
  } else if (how === 'goods') s.stock.canned -= Math.ceil(usd / (MATERIALS.canned.price ?? 38));
  return how;
}
const usd = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
const payLine = (s: GameState, amount: number) => { const h = payHow(s, amount); return h ? `${usd(amount)} ${PAY_WORD[h]}` : `${usd(amount)} (you cannot cover it)`; };

// ── odds the cards and the resolutions share ───────────────────────────────────────────────────

const inTen = (x: number) => (x < 0.05 ? 'almost never' : x > 0.95 ? 'almost always' : `about ${Math.round(x * 10)} in 10`);
const bestTalker = (s: GameState) => Math.max(0, ...adults(s).map(p => p.skills.negotiator));
export const hasPass = (s: GameState): boolean => { const f = fxOf(s), p = f.pass; return !!p && p.until >= since(s) && (!p.faction || !f.front || p.faction === f.front.holder); };
const conceal = (s: GameState): number => { const p = postureOf(s); return p.bunker ? 0.6 : p.safeRoom ? 0.35 : 0.1; };
/** Neighbors flying the holder's enemy's flag (civil war): they may inform. */
export function hostileNeighbors(s: GameState): number {
  const f = fxOf(s); if (!f.flags || !f.front) return 0;
  return homeNeighbors(s).filter(n => f.flags![n.id] === otherFaction(f.front!.holder)).length;
}
/** Is an informant talking about this household now? (war: p 0.15 per hostile neighbor, capped; occupation: the fixed informants among the neighbors). */
export function informantActive(s: GameState): boolean {
  const f = fxOf(s);
  if (s.disaster.kind === 'invasion') return homeNeighbors(s).some(n => isInformant(s.seed, n.id, informantFraction(f.tier ?? 1, false)));
  return hostileNeighbors(s) > 0 && mulberry32(s.seed * 337 + since(s) * 13 + 1)() < Math.min(0.6, WAR_INFORM_P * hostileNeighbors(s));
}
const papersOddsNow = (s: GameState): number => papersOdds({ pass: hasPass(s), homeCounty: true, tier: fxOf(s).tier ?? 1, informantsK: informantActive(s) ? 1 : 0 });

/** The forged-paper price and the odds it holds. */
const forgedPrice = (s: GameState) => (s.disaster.kind === 'invasion' ? CHECKPOINT.FORGED_USD : CHECKPOINT.FORGED_USD_WAR);

// ── building a card ────────────────────────────────────────────────────────────────────────────

/** Hand the card to the generic threat path, as the crew a fight would be against (merciful soldiers or hard men: sim/crewMercy.ts reads the kind and temper). */
function fight(s: GameState, e: Encounter, temper: Encounter['temper'] = 'hard'): null {
  const inv = s.disaster.kind === 'invasion', k = e.kind as string;
  const to = k === 'quota' ? (inv ? 'patrol' : 'requisition') : ['partisan', 'informant', 'lost_soldier', 'fugitive', 'salvage'].includes(k) ? 'looters' : inv ? 'patrol' : 'militia';
  e.kind = to as never;
  e.temper = e.temper ?? temper;
  if (!e.stances.includes('defend')) e.stances = [...e.stances, 'defend'];
  return null;
}

const base = (_s: GameState, kind: ExtraEncounterKind, id: string, day: number, over: Partial<Encounter>): Encounter =>
  ({ id, kind: asKind(kind), day, title: '', dossier: [], size: 1, armed: false, strength: 0, stances: [], ...over });

export function makeOrderCard(s: GameState, kind: ExtraEncounterKind, r: () => number, id: string, day: number): Encounter | null {
  const f = fxOf(s), d = since(s), hold = f.front?.holder;
  switch (kind) {
    case 'tollkeeper': {
      const size = 4 + Math.floor(r() * 3);
      return base(s, kind, id, day, {
        title: 'The men at the bridge', size, armed: true, strength: size * 10, temper: 'hard', wants: TOLL.GOODS,
        dossier: [`${size} men who hold the bridge on the county road send one up the drive. Nobody is collecting for the county.`, `The toll is ${goodsText(TOLL.GOODS)} for ${TOLL.DAYS} days of crossing. "Or a hundred and fifty dollars in silver, if you have it. Paper's no good since Tuesday."`, pickOf(r, ['"Toll at mile 41, two gallons or a rifle," somebody said on the CB.', 'They are not soldiers. They are neighbors with deer rifles and a long list of reasons.'])],
        stances: ['flag_pay', 'flag_pass', 'flag_bluff', 'back_roads', 'flag_shoot', 'defend'],
      });
    }
    case 'posse': {
      const goods = titheOf(s.stock), size = 6 + Math.floor(r() * 5);
      return base(s, kind, id, day, {
        title: 'The posse\'s collector', size, armed: true, strength: size * 11, temper: 'hard', wants: goods as Partial<Stock>,
        dossier: [`A deputy who is not a deputy any more and ${size - 1} others, in two trucks. "Protection," he says, and means it both ways.`, `The tithe is a tenth of the stores (${goodsText(goods as Partial<Stock>)}) every ${TITHE.EVERY} days. Pay and the other crews are told to leave you alone; refuse and they are told you are open.`],
        stances: ['pay', 'parley', 'refuse', 'defend'],
      });
    }
    case 'watch_pact': {
      const members = homeNeighbors(s).filter(n => n.disposition >= 0).slice(0, 4);
      return base(s, kind, id, day, {
        title: 'The Maple Road committee', size: members.reduce((a, n) => a + n.members, 0), neighbor: members[0]?.id,
        dossier: ['Four households meeting in a barn with the lights off. They want a roster for the night watch, three shots for the signal, and one more place on the road.', members.length ? `${members.map(n => cap(n.name)).join(', ')} are in. They want the family to be.` : 'They are few. They are asking anyway.', 'A pact is autonomy traded for company: you stand a watch, they ride over when there is shooting. And a committee can strike its own deal with whoever runs the town.'],
        stances: ['take_in', 'turn_away', 'ignore'],
      });
    }
    case 'salvage': {
      const hiding = salvageOwnersHiding(r());
      const house = pickOf(r, ['the Doran place', 'the empty farmhouse past the gravel pit', 'the Whitlock cabin', 'the old Pruitt house']);
      return base(s, kind, id, day, {
        title: `${cap(house)}, with the door open`, size: 0, brings: { ...SALVAGE.LOOT }, neighbor: undefined, arche: hiding ? 'hiding' : 'dead',
        dossier: [`${cap(house)} stands open on the county road. Cans on the shelves, a half tank in the truck, a note nobody answered.`, 'You cannot see from the road whether anyone is still in there. The owners may be dead. They may be in the cellar, listening.'],
        stances: ['take_in', 'parley', 'turn_away'],
      });
    }
    case 'deserters': {
      const size = 4 + Math.floor(r() * 5);
      return base(s, kind, id, day, {
        title: 'Deserters off the line', size, armed: true, strength: size * 11, temper: r() < 0.7 ? 'hard' : 'desperate', wants: { canned: 6, fuel: 3, meds: 1 },
        dossier: [`${size} men in mismatched uniforms, rifles low. Some of them are boys of seventeen. One is crying and does not seem to know it.`, `"${pickOf(r, DESERTER_LINES)}"`, 'They have no orders and no one to answer to. A band like this takes hostages if cornered, and kills if it has to.'],
        stances: ['hide', 'parley', 'trade', 'defend'],
      });
    }
    case 'checkpoint_stop': {
      const war = kindOf(s) === 'civil_war', tier = f.tier ?? 1, who = war ? FACTION[hold ?? 'alliance'].short : 'the Occupying Force', iv = invaderIn(s);
      const toll = war ? { canned: 2, fuel: 1 } : { canned: 2 };
      return base(s, kind, id, day, {
        title: war ? `${who} post on the county road` : iv!.checkpointTitle, size: 6, armed: true, strength: 66, temper: 'hard', wants: toll,
        dossier: war ? [`A truck across the road at the bridge and ${who} soldiers behind sandbags. A corporal walks up the drive with a clipboard. Papers, a toll, or the back roads.`, `The toll is 5% of what you carry (${goodsText(toll)} for a month's crossing). "${pickOf(r, SCARED_LINES.slice(0, 1))}" says the woman ahead of you in the line.`]
          : [`${cap(iv!.post)}. ${cap(TIER_NAME[tier as 1 | 2 | 3])} are the order of the day. ${pickOf(r, iv!.habits)}`, `"${pickOf(r, iv!.voice)}" A ${iv!.passDoc} lasts ${CHECKPOINT.PASS_DAYS} days and costs a morning in the line.`],
        stances: ['flag_pass', 'flag_pay', 'flag_bluff', 'pay', 'confront', 'back_roads', 'flag_shoot'],
      });
    }
    case 'quota': {
      const war = kindOf(s) === 'civil_war', tier = f.tier ?? 1, share = requisitionShare(kindOf(s), tier, s.disaster.difficulty ?? 'standard', r());
      const goods = quotaOf(s.stock, share) as Partial<Stock>;
      return base(s, kind, id, day, {
        title: war ? 'A requisition order' : invaderIn(s)!.quotaTitle, size: 6, armed: true, strength: 72, temper: 'hard', wants: goods,
        dossier: [war ? `A lieutenant of ${FACTION[hold ?? 'alliance'].name} and four soldiers with a truck. "Receipts are written. They are good when we win."` : `${invaderIn(s)!.quotaIntro} "${invaderIn(s)!.voice[0]}"`, `The order: ${goodsText(goods)} (${Math.round(share * 100)}% of what is in sight).`, `The next one comes in ${REQ.CADENCE} days${(s.disaster.difficulty ?? 'standard') === 'hardcore' ? ' (half that on Hardcore)' : ''}.`],
        stances: ['pay', 'flag_bluff', 'hide', 'flag_pay', 'defend'],
      });
    }
    case 'draft_notice': {
      const labor = kindOf(s) === 'invasion';
      const cands = s.people.filter((p, i) => s.personState[i]?.needs.died == null && draftable({ age: p.age, kid: p.kid, male: p.body === 'm' }, { kind: kindOf(s), difficulty: s.disaster.difficulty ?? 'standard', fate: s.disaster.fate ?? 'partial', day: d }));
      if (!cands.length || adults(s).length < 2) return null;
      const who = pickOf(r, cands), elder = s.people.find((p, i) => p.elder && s.personState[i]?.needs.died == null);
      return base(s, kind, id, day, {
        title: labor ? `A labor order for ${who.first}` : `A draft notice for ${who.first}`, size: 4, armed: true, strength: 52, temper: 'hard', people: [who],
        dossier: [labor ? `${cap(invaderIn(s)!.laborWord)} needs one adult from every household for ${DRAFT.LABOR_DAYS} days. The notice has ${who.first} ${who.last}'s name, typed, with the ${invaderIn(s)!.authority.replace(/^the /, '')} seal.` : `A recruiter at the gate. He knew ${who.first}'s name before he asked. The notice says report in three days.`, labor ? '"One per household. An elder may go in his place." A truck waits at the road.' : 'He is not unkind about it. He has a quota too.', ...(elder && labor ? [`${elder.first}, the family's elder, could go instead.`] : [])],
        stances: ['pay', 'hide', 'flag_pay', ...(labor && elder ? ['take_in' as Stance] : []), 'defend'],
      });
    }
    case 'fugitive': {
      const size = 2 + Math.floor(r() * 3), war = kindOf(s) === 'civil_war';
      return base(s, kind, id, day, {
        title: war ? 'A family from the other side' : 'A hunted family', size, armed: false, strength: 0, brings: { canned: 1 },
        dossier: [`"${pickOf(r, SCARED_LINES)}"`, war ? `They fled ${FACTION[otherFaction(hold ?? 'alliance')].short} country with what fit in a car. Anyone who shelters them is on a list if it comes out.` : `The patrol is two roads over. They have no ${invaderIn(s)?.idDocPlural ?? 'papers'} and a child with a fever.`, 'Hiding them costs food, medicine and nerve for a month.'],
        stances: ['take_in', 'turn_away', 'confront'],
      });
    }
    case 'partisan': {
      const size = 4 + Math.floor(r() * 3);
      return base(s, kind, id, day, {
        title: 'Four of the Free Valley Committee', size, armed: true, strength: size * 9, temper: 'desperate', wants: { canned: 3, meds: 1 },
        dossier: ['They knew the word ("the blue goat sleeps at noon"). They want a cellar for the night, food, and any gun you can spare.', 'Shelter them and the committee remembers: intel, a name to trust. The patrol remembers too, and reprisal risk grows five points a week.'],
        stances: ['take_in', 'trade', 'turn_away', 'defend'],
      });
    }
    case 'informant': {
      const n = homeNeighbors(s).find(x => isInformant(s.seed, x.id, informantFraction(f.tier ?? 1, true))) ?? homeNeighbors(s)[0];
      if (!n) return null;
      return base(s, kind, id, day, {
        title: `${cap(n.name)} come to the fence`, size: n.members, neighbor: n.id,
        dossier: [invaderIn(s)?.informantAsk ?? `They are asking, friendly enough, about your radio, how much you have put by, and who has been visiting. "Just so we know. Everybody is being asked."`, 'You know what happens to people the patrol asks about. You do not know who is being paid to ask.'],
        stances: ['pay', 'flag_bluff', 'refuse'],
      });
    }
    case 'lost_soldier': {
      return base(s, kind, id, day, {
        title: 'A lone soldier at the gate', size: 1, armed: true, strength: 8, temper: 'desperate',
        dossier: invaderIn(s) ? [...invaderIn(s)!.lostSoldier] : ['A boy in a conscript\'s coat, rifle slung muzzle-down, a long way from wherever he is from. "Water, please. Just water."', 'If a patrol finds him here, you will answer for it. If he is found dead on your road, you will answer for that too.'],
        stances: ['trade', 'take_in', 'turn_away', 'defend'],
      });
    }
    case 'reprisal': {
      const size = 20 + Math.floor(r() * 21);
      f.reprisalDue = undefined;
      return base(s, kind, id, day, {
        title: 'The punitive column', size, armed: true, strength: size * 12, temper: 'savage', wants: { canned: 10, fuel: 6, meds: 2 },
        dossier: [`${size} soldiers, three trucks, jerry cans in the back. They are not here for a quota.`, (invaderIn(s)?.reprisalLine ?? 'Somebody ambushed a patrol within three miles.') + ' This is the answer, and it falls on whoever is nearest.'],
        stances: ['hide', 'parley', 'defend'],
      });
    }
    default: return null;
  }
}

// ── the buttons, with odds and costs ───────────────────────────────────────────────────────────

const L = (name: string, blurb: string): [string, string] => [name, blurb];

export function orderLabels(s: GameState, e: Encounter): Partial<Record<Stance, [string, string]>> | null {
  const f = fxOf(s), talk = bestTalker(s), p = postureOf(s), diff = diffOf(s.disaster);
  const bluff = bluffOdds({ negotiator: talk, fortress: p.fortress, fighters: p.fighters, armed: p.armed, kind: 'militia', temper: e.temper ?? 'hard', talk: diff.talk });
  const fightK = L('Fight', 'Shoot it out. The odds above are the battle sim itself; a fight at the road marks you for the next ones.');
  switch (e.kind as string) {
    case 'tollkeeper': return {
      flag_pay: L('Pay the toll', `${goodsText(TOLL.GOODS)} buys ${TOLL.DAYS} days of crossing. Nobody is hurt; word gets round that this place pays.`),
      flag_pass: L(`Slip the envelope (${usd(TOLL.ENVELOPE_USD)})`, payHow(s, TOLL.ENVELOPE_USD) && s.disaster.tracks.banks >= 0.5 ? `A thick envelope buys a free pass for ${TOLL.DAYS} days while the banks work. Cost: ${payLine(s, TOLL.ENVELOPE_USD)}.` : 'Paper buys nothing now: the banks are shut. Only goods and silver move.'),
      flag_bluff: L('Bluff: we are many', `Works ${inTen(bluff)}. If he calls it, they come back angrier.`),
      back_roads: L('Take the back roads', `No toll. Every run and delivery loses ${TOLL.BACK_ROAD_EXTRA_DAYS} day and risks a worse stop.`),
      flag_shoot: L('Shoot the envoy', 'It costs humanity and the bridge crew will come for you. A few run.'),
      defend: fightK,
    };
    case 'posse': {
      const t = Math.round(TITHE.SHARE * 100), pactN = fxOf(s).committee?.length ?? 0;
      return {
        pay: L('Accept the tithe', `${goodsText(e.wants ?? {})} now, about ${t}% of the stores each ${TITHE.EVERY} days. Other crews are told to leave you alone (raids halved). Humanity ${TITHE.HUMANITY}: you are funding them.`),
        parley: L('Haggle', `A good talker can cut it by half. Works ${inTen(clamp(0.25 + talk * 0.06, 0.1, 0.8))}; if it fails they ask for more.`),
        refuse: L('Refuse', 'Raids come 1.5x as often for a month: you are marked open. Nobody shoots today.'),
        defend: L('Fight', `You may break them: ${inTen(breakPosseOdds(pactN, p.fighters, p.fortress))} with ${pactN ? 'the watch pact behind you' : 'no pact'}. If it fails it is a shooting war at your wall.`),
      };
    }
    case 'watch_pact': return {
      take_in: L('Join the pact', 'The willing households join. You stand a watch each week (two labor days owed); they ride over when there is shooting. A committee can sell you out to the posse.'),
      turn_away: L('Decline', 'They remember. Every household that asked takes a little less trouble on your behalf.'),
      ignore: L('Sleep on it', 'They ask again later, if they are still there.'),
    };
    case 'salvage': return {
      take_in: L('Strip the house', 'Cans, fuel, a med kit. If the owners are dead it costs nothing. If they are hiding, and you are found out later, humanity ' + SALVAGE.HUMANITY + '.'),
      parley: L('Knock and call out first', 'Takes an hour. If anyone is in there they come out, and you can share or move on.'),
      turn_away: L('Leave it', 'Nothing gained, nothing owed.'),
    };
    case 'checkpoint_stop': {
      const pa = papersOddsNow(s), war = s.disaster.kind === 'civil_war', fp = forgedPrice(s);
      return {
        flag_pass: L(invaderIn(s)?.showPapers ?? 'Show your papers', `They pass you ${inTen(pa)}. A stamp is good for ${CHECKPOINT.PASS_DAYS} days. Turned back: the post has your name.`),
        flag_pay: L('Pay the toll', `${goodsText(e.wants ?? {})}: a month of crossing, no questions. Cost is the same whoever holds the road.`),
        flag_bluff: L('A forged paper (your own)', `Works ${inTen(war ? 0.5 : CHECKPOINT.SELF_FORGED_OK)}. Caught: a fine, a mark and a worse day.`),
        pay: L(`Buy good papers (${usd(fp)})`, `${payHow(s, fp) ? `Costs ${payLine(s, fp)}.` : 'You cannot cover it.'} They hold ${inTen(CHECKPOINT.FORGED_OK)}; a bad one is a mark and a loss.`),
        confront: L('Give them a name', `Humanity -${war ? 15 : 20}. A pass for 60 days and the post leaves you alone; the neighbor you name does not come back.`),
        back_roads: L('Turn round: the back roads', `No papers, no toll. Runs and deliveries lose a day, and the post may stop you later.`),
        flag_shoot: L('Shoot the post', 'Reprisal on the road and the valley: neighbors may be taken. A fight you probably lose.'),
        defend: fightK,
      };
    }
    case 'quota': {
      const known = informantActive(s), find = searchChance(known, conceal(s)), caught = shortWeightCaught(known, f.tier ?? 1);
      const bribe = s.disaster.kind === 'invasion' ? 1000 : 500;
      return {
        pay: L('Comply in full', `Hand over ${goodsText(e.wants ?? {})} for a receipt. ${s.disaster.kind === 'civil_war' ? 'The receipt is good only if they win; whoever loses will remember.' : 'The receipt is in ' + (invaderIn(s)?.currency ?? 'occupation money') + ', worth less each week.'}`),
        flag_bluff: L('Short-weight it (60%)', `Hand over 60% of it. They catch it ${inTen(caught)}: then they take the rest and a quarter more, and the name is marked.`),
        hide: L('Hide it', `Bury it before they come. They find a cache ${inTen(find)} (${known ? 'someone is talking' : 'nobody is talking'}${conceal(s) > 0.3 ? '; the cellar helps' : ''}). Found: they take 1.5x and you are marked.`),
        flag_pay: L(`${invaderIn(s)?.id === 'china' ? 'Pay the administrative fee' : invaderIn(s)?.id === 'russia' ? 'Pay the commandant\'s clerk' : invaderIn(s)?.id === 'axis' ? 'Pay the liaison office' : 'Buy an exemption'} (${usd(bribe)})`, payHow(s, bribe) ? `${invaderIn(s)?.bribeBlurb ?? 'A colonel\'s price'}: ${payLine(s, bribe)} (nothing taken this time).` : `The price is ${usd(bribe)}. You cannot cover it.`),
        defend: fightK,
      };
    }
    case 'draft_notice': {
      const labor = s.disaster.kind === 'invasion', pr = draftPrice(kindOf(s), since(s), 0.5), who = e.people?.[0];
      const found = 1 - Math.pow(1 - DRAFT.HIDE_FOUND * (1 - 0.5 * conceal(s)), 3);
      return {
        pay: L(labor ? `Send ${who?.first ?? 'them'} to the detail` : `Let ${who?.first ?? 'him'} report`, labor ? `Gone ${DRAFT.LABOR_DAYS} days; the family is safe and the committee is not told. Back after.` : 'He goes to the line. Safe for the family, standing with whoever holds the road; he may come home on leave around day 60, or never.'),
        hide: L(`Hide ${who?.first ?? 'him'}`, `They search three times: found ${inTen(found)}. Found: he goes anyway, and the family pays a fine and is marked.`),
        flag_pay: L('Pay the way out', `${pr.silver} oz of silver or ${usd(pr.usd)}${labor ? ` (${invaderIn(s)?.laborPrice ?? 'an officer'})` : ''}. ${payHow(s, pr.usd) ? `You would pay ${payLine(s, pr.usd)}.` : 'You cannot cover it.'}`),
        take_in: L('Send the elder instead', 'The elder goes in his place. The detail takes it, and the elder does not come back the same.'),
        defend: fightK,
      };
    }
    case 'fugitive': return {
      take_in: L('Shelter them', `Humanity +8. They eat 4 cans and a med kit and stay a month; if it comes out the family is on the list (${inTen(informantActive(s) ? 0.35 : 0.1)}).`),
      turn_away: L('Send them on', 'Humanity -6. You do not look at the child as they go.'),
      confront: L('Report them at the post', 'Humanity -15. A pass for 30 days. You will remember what you did.'),
    };
    case 'partisan': return {
      take_in: L('Shelter them', `A night in the cellar and a meal: intel and a name to trust. Reprisal risk grows (now ${Math.round((f.resistance ?? 0))}).`),
      trade: L('Give food and no bed', 'A bag of cans and a med kit, quietly. Risk grows less.'),
      turn_away: L('Send them on', 'They go. The committee remembers who would not help.'),
      defend: L('Turn the guns on them', 'Humanity -10, and the shots will be heard. Do not.'),
    };
    case 'informant': return {
      pay: L('Tell him what he asks', 'Safe today. Now they know the radio, the stores and who comes by.'),
      flag_bluff: L('Lie smoothly', `Works ${inTen(clamp(0.3 + talk * 0.06, 0.1, 0.8))}. If he does not believe you he is still reporting, and now he is suspicious.`),
      refuse: L('Tell him it is none of his business', 'He remembers. Disposition drops and he is paid for it.'),
    };
    case 'lost_soldier': return {
      trade: L('Give him water and food', 'Humanity +4. He goes on. If a patrol sees him leaving the place, they will ask why.'),
      take_in: L('Hide him', 'Humanity +8 and a reprisal risk every week he stays (a conscript is a deserter now).'),
      turn_away: L('Send him on', 'Nothing gained, nothing owed.'),
      defend: L('Shoot him', 'Humanity -15. One less man on the road; the patrol will count him missing.'),
    };
    default: return null;
  }
}

// ── answering a stance ─────────────────────────────────────────────────────────────────────────

function markFamily(s: GameState, days = 60): void { const f = fxOf(s); f.marked = Math.max(f.marked ?? 0, since(s) + days); }
function grantPass(s: GameState, kind: 'toll' | 'papers' | 'forged', days: number): void {
  const f = fxOf(s); f.pass = { until: since(s) + days, kind, ...(s.disaster.kind === 'civil_war' && f.front ? { faction: f.front.holder } : {}) };
  if (s.disaster.kind === 'civil_war' && f.front) { const st = (f.standing ??= { compact: 50, alliance: 50 }), c = (f.collab ??= { compact: 0, alliance: 0 }); const h = f.front.holder; st[h] = clamp(st[h] + 5, 0, 100); st[otherFaction(h)] = clamp(st[otherFaction(h)] - 2.5, 0, 100); c[h]++; }
}
/** Take someone off the place (a draft, a labor detail): they are "away" until `back`. */
export function sendAway(s: GameState, pid: string, back: number | null, why: string): void {
  const ps = s.personState.find(x => x.id === pid);
  if (!ps || ps.needs.died != null) return;
  ps.needs.died = Math.floor(s.clock.t); ps.needs.left = true;
  (fxOf(s).drafted ??= []).push({ pid, back, why });
}
/** Bring home whoever's detail is over (called daily). */
export function bringBack(s: GameState): string[] {
  const f = fxOf(s), d = since(s), lines: string[] = [];
  for (const rec of [...(f.drafted ?? [])]) {
    if (rec.back === null || rec.back > d) continue;
    const i = s.people.findIndex(p => p.id === rec.pid), ps = s.personState[i];
    f.drafted = f.drafted!.filter(x => x !== rec);
    if (!ps || !ps.needs.left) continue;
    ps.needs.died = null; ps.needs.left = undefined; ps.needs.health = Math.max(40, ps.needs.health - 10);
    lines.push(`${s.people[i].first} came home from the ${rec.why}, thinner and quieter.`);
  }
  return lines;
}

export function resolveOrderCard(s: GameState, e: Encounter, stance: Stance): Outcome | null {
  const f = fxOf(s), r = rngFor(s, e, stance.length), d = since(s), g = s.gate, kind = e.kind as unknown as ExtraEncounterKind;
  const p = postureOf(s), talk = bestTalker(s);
  switch (kind) {
    case 'tollkeeper': {
      if (stance === 'flag_pay') {
        const paid = takeGoods(s, TOLL.GOODS); grantPass(s, 'toll', TOLL.DAYS); f.post = true; g.respect = Math.max(0, (g.respect ?? 0) - 0.1);
        return out('The toll is paid', `The man took ${paid.join(', ') || 'what little there was'}, wrote a number on a card and walked back down the drive. You may cross for ${TOLL.DAYS} days.`, 'mixed', [`Paid: ${paid.join(', ') || 'nothing in stock'}`]);
      }
      if (stance === 'flag_pass') {
        if (s.disaster.tracks.banks < 0.5 || !payHow(s, TOLL.ENVELOPE_USD)) return out('Paper is no good', 'He looked at the envelope as if it were a dead animal. "Not since Tuesday." The pass costs the goods after all, or nothing at all.', 'bad', []);
        const how = payUsd(s, TOLL.ENVELOPE_USD); grantPass(s, 'toll', TOLL.DAYS); f.post = true;
        return out('A free pass', `The envelope vanished. He wrote the pass in pencil. You may cross for ${TOLL.DAYS} days, ${how === 'bank' ? 'while the banks still cash a check' : 'and nobody asked where the money came from'}.`, 'good', [`Paid ${usd(TOLL.ENVELOPE_USD)} ${PAY_WORD[how!]}`]);
      }
      if (stance === 'back_roads') { f.post = true; f.lastCheck = d; return out('The back roads', 'You tell him you will go round. He shrugs. Every trip out will be a day longer and a gamble.', 'mixed', []); }
      return fight(s, e);
    }
    case 'posse': {
      const goods = titheOf(s.stock);
      if (stance === 'pay' || stance === 'parley') {
        let k = 1, line = '';
        if (stance === 'parley') { if (r() < clamp(0.25 + talk * 0.06, 0.1, 0.8)) { k = 0.5; line = 'You talked him down to half.'; } else { k = 1.5; line = 'He did not like the haggling. It is half again as much.'; } }
        const bill = Object.fromEntries(Object.entries(goods).map(([key, n]) => [key, Math.ceil(n * k)])) as Partial<Stock>;
        const paid = takeGoods(s, bill); f.lastTithe = d; f.protectedUntil = d + TITHE.EVERY; f.defiantUntil = undefined; humanity(s, TITHE.HUMANITY); g.respect = Math.max(0, (g.respect ?? 0) - 0.1);
        return out('The tithe is paid', `The collector counted it twice and wrote "paid" on a card taped to your gatepost. Other crews will see it. ${line}`, 'mixed', [`Paid: ${paid.join(', ') || 'nothing in stock'}`, 'Raids from other crews are halved for a month.']);
      }
      if (stance === 'refuse') { f.lastTithe = d; f.defiantUntil = d + TITHE.EVERY; return out('You turned him away', 'He did not argue. He wrote something on his hand and went. By tomorrow every crew in the county will know the place is open.', 'bad', ['Raids come 1.5x as often for a month.']); }
      if (stance === 'defend') {
        const pact = f.committee?.length ?? 0, odds = breakPosseOdds(pact, p.fighters, p.fortress);
        if (pact > 0 && r() < odds) { f.posseBrokenUntil = d + 60; f.lastTithe = d; g.respect = Math.min(1, (g.respect ?? 0) + 0.3); for (const n of homeNeighbors(s)) if (f.committee!.includes(n.id)) n.disposition = Math.min(100, n.disposition + 8); return out('The posse broke', 'The collector went for his gun and four rifles on the ridge answered. The watch pact had been waiting for exactly this. The trucks left; the county will talk about it for a year.', 'good', ['The posse leaves you alone for two months.']); }
        return fight(s, e);
      }
      return fight(s, e);
    }
    case 'watch_pact': {
      f.lastPact = d;
      if (stance === 'take_in') {
        const members = homeNeighbors(s).filter(n => n.disposition >= -10).slice(0, 4);
        const L2 = localsOf(s);
        for (const n of members) { if (!L2.pact.includes(n.id)) L2.pact.push(n.id); n.disposition = Math.min(100, n.disposition + 6); lifeOf(s, n).history.push({ day: dayIndex(s.clock.t), text: 'Joined the watch committee with the family.', known: true, how: 'seen' }); }
        f.committee = members.map(n => n.id); barterOf(s).laborOwed += 2;
        return out('The pact is made', `${members.map(n => cap(n.name)).join(', ') || 'The neighbors'} shook on it. Three shots is the signal. You owe the committee two days of watch.`, 'good', ['The watch pact stands: they ride over when there is shooting.']);
      }
      if (stance === 'turn_away') { for (const n of homeNeighbors(s).slice(0, 4)) n.disposition = Math.max(-100, n.disposition - 4); return out('You said no', 'They nodded as if they had expected it, and went to the next place on the road.', 'mixed', []); }
      f.lastPact = d - 18;
      return out('Sleep on it', 'They said they would ask again.', 'mixed', []);
    }
    case 'salvage': {
      const hiding = e.arche === 'hiding';
      if (stance === 'take_in') {
        const loot = takeLoot(s, e.brings ?? {}); const lines = [`Took: ${loot}`];
        if (hiding) { (f.salvaged ??= []).push({ found: d + SALVAGE.FOUND_DAYS[0] + Math.floor(r() * (SALVAGE.FOUND_DAYS[1] - SALVAGE.FOUND_DAYS[0])), who: e.title.replace(/, with the door open$/, '') }); }
        return out('The house is stripped', `You were in and out in forty minutes. ${hiding ? 'The cellar door was shut. You did not try it.' : 'Nobody was there to mind.'}`, 'mixed', lines);
      }
      if (stance === 'parley') {
        if (hiding) { humanity(s, 3); for (const n of homeNeighbors(s).slice(0, 2)) n.disposition = Math.min(100, n.disposition + 4); return out('They came out', 'A woman and two children from the cellar, gray in the daylight. You shared a can of peaches on the porch and left them what was theirs. They will remember it.', 'good', ['Humanity +3']); }
        const loot = takeLoot(s, e.brings ?? {}, 0.5);
        return out('Nobody answered', 'The house had been empty a long time. You took what was plainly left for anyone.', 'mixed', [`Took: ${loot}`]);
      }
      return out('You left it', 'You drove on. Somebody will not.', 'mixed', []);
    }
    case 'deserters': return null;
    case 'checkpoint_stop': return resolveCheckpoint(s, e, stance, r);
    case 'quota': return resolveQuota(s, e, stance, r);
    case 'draft_notice': return resolveDraft(s, e, stance, r);
    case 'fugitive': {
      if (stance === 'take_in') { const paid = takeGoods(s, { canned: 4, meds: 1 }); humanity(s, 8); f.shelter = { until: d + 30, count: e.size, kind: 'fugitive' }; return out('They are in the cellar', `You put ${e.size} of them down the cellar stairs and moved the shelves. "${pickOf(r, SCARED_LINES.slice(2, 3))}" The woman held your hand with both of hers.`, 'good', [`Spent: ${paid.join(', ')}`, 'Humanity +8. If it comes out the family is on a list.']); }
      if (stance === 'confront') { humanity(s, -15); grantPass(s, 'papers', 30); markFamily(s, 0); return out('You gave them up', invaderIn(s) ? `The clerk at ${invaderIn(s)!.informantPost} wrote it down and thanked you. You have a stamp that says you are loyal. You will not look at it often.` : 'The corporal wrote it down and thanked you. You have a stamp that says you are loyal. You will not look at it often.', 'bad', ['Humanity -15', 'A pass for 30 days.']); }
      humanity(s, -6); return out('The gate stays shut', 'They walked on. Nobody at supper said anything about the child.', 'bad', ['Humanity -6']);
    }
    case 'partisan': {
      if (stance === 'take_in') { const paid = takeGoods(s, { canned: 3, meds: 1 }); f.intel = (f.intel ?? 0) + 1; f.resistance = (f.resistance ?? 0) + 10; f.shelter = { until: d + 7, count: e.size, kind: 'partisan' }; return out('A night in the cellar', 'They did not give names. At dawn one left a map with the patrol routes marked in pencil, and went out through the trees. The committee knows your door.', 'good', [`Spent: ${paid.join(', ')}`, `Intel +1; reprisal risk ${Math.round(f.resistance)}.`]); }
      if (stance === 'trade') { const paid = takeGoods(s, { canned: 4, meds: 1 }); f.resistance = (f.resistance ?? 0) + 3; return out('Food and no bed', 'A feed sack of cans left at the culvert. They did not say thank you, which is how you know.', 'mixed', [`Spent: ${paid.join(', ')}`]); }
      if (stance === 'turn_away') return out('They went on', 'They were gone before the porch light came on. The committee will remember who would not help.', 'mixed', []);
      humanity(s, -10); return fight(s, e, 'desperate');
    }
    case 'informant': {
      const n = s.neighbors.find(x => x.id === e.neighbor);
      if (stance === 'pay') { f.last = { ...(f.last ?? {}), told: d }; markFamily(s, 90); humanity(s, -2); return out('You told him', `"${cap(n?.name ?? 'He')} wrote it all down." Now they know the radio, the stores and who comes by.`, 'bad', ['The authorities have a fresh account of the place: searches are likelier for a while.']); }
      if (stance === 'flag_bluff') {
        if (r() < clamp(0.3 + talk * 0.06, 0.1, 0.8)) return out('He believed you', 'A radio that does not work, a pantry nearly empty and no visitors but the preacher. He nodded slowly and wrote it down.', 'good', []);
        markFamily(s, 45); return out('He did not believe you', 'He kept smiling the whole time. That is what you will remember.', 'bad', ['You are marked for a while.']);
      }
      if (n) n.disposition = Math.max(-100, n.disposition - 10); markFamily(s, 45);
      return out('It is none of his business', 'He did not argue. He will be paid either way.', 'mixed', ['Disposition -10.']);
    }
    case 'lost_soldier': {
      if (stance === 'trade') { takeGoods(s, { canned: 1 }); humanity(s, 4); f.resistance = (f.resistance ?? 0) + 2; return out('Water and a can of beans', 'He drank until he gagged. "Thank you, ma\'am. Sir." He went off through the corn, running when he thought you could not see.', 'good', ['Humanity +4']); }
      if (stance === 'take_in') { humanity(s, 8); f.shelter = { until: d + 14, count: 1, kind: 'soldier' }; f.resistance = (f.resistance ?? 0) + 5; return out('In the hayloft', 'You put him in the loft with a blanket. He slept eleven hours. He will not say where he is from.', 'good', ['Humanity +8; reprisal risk while he stays.']); }
      if (stance === 'turn_away') return out('You sent him on', 'He looked at the road and then at you, and went.', 'mixed', []);
      humanity(s, -15); markFamily(s, 30); return out('One shot', 'It did not take long. The patrol will find him by tomorrow, and count him.', 'bad', ['Humanity -15']);
    }
    case 'reprisal': return null;
    default: return null;
  }
}

function takeLoot(s: GameState, loot: Partial<Stock>, share = 1): string {
  const got: string[] = [];
  for (const [k, n] of Object.entries(loot) as Array<[keyof Stock, number]>) { const t = Math.max(1, Math.round(n * share)); s.stock[k] += t; got.push(`${t} ${k}`); }
  return got.join(', ');
}

function resolveCheckpoint(s: GameState, e: Encounter, stance: Stance, r: () => number): Outcome | null {
  const f = fxOf(s), war = s.disaster.kind === 'civil_war', d = since(s);
  f.post = true;
  if (stance === 'flag_pass') {
    const ok = r() < papersOddsNow(s);
    if (ok) { grantPass(s, 'papers', CHECKPOINT.PASS_DAYS); return out('Papers stamped', war ? 'The corporal turned the pages twice and stamped them. "Move along."' : invaderIn(s)!.stamped, 'good', [`A pass for ${CHECKPOINT.PASS_DAYS} days.`]); }
    markFamily(s, 30); return out('Turned back', invaderIn(s)?.refused ?? 'No stamp. A soldier wrote your name in a book. "Come back with proper papers."', 'bad', ['You are marked for a month.']);
  }
  if (stance === 'flag_pay') { const paid = takeGoods(s, e.wants ?? {}); grantPass(s, 'toll', CHECKPOINT.PASS_DAYS); return out('The toll is paid', 'He pocketed it without looking at it. "That is a month." Nobody asked a question.', 'mixed', [`Paid: ${paid.join(', ') || 'nothing in stock'}`]); }
  if (stance === 'flag_bluff') {
    if (r() < (war ? 0.5 : CHECKPOINT.SELF_FORGED_OK)) { grantPass(s, 'forged', CHECKPOINT.PASS_DAYS); return out('The paper held', 'He held it up to the floodlight and handed it back. Your hands did not shake until the car.', 'good', ['A pass for 30 days (forged).']); }
    markFamily(s, 90); const paid = takeGoods(s, { canned: 3 }); return out('The paper did not hold', 'The lieutenant read it out loud, slowly, then tore it in half. A fine, and a name in the book.', 'bad', [`Fine: ${paid.join(', ')}`, 'Marked for three months.']);
  }
  if (stance === 'pay') {
    const price = forgedPrice(s);
    if (!payHow(s, price)) return out('You could not cover it', 'The man with the stamp and the ink would not take promises.', 'mixed', []);
    const how = payUsd(s, price);
    if (r() < CHECKPOINT.FORGED_OK) { grantPass(s, 'forged', CHECKPOINT.PASS_DAYS); return out('Good papers', 'The stamp was real, or close enough. They passed you without a second look.', 'good', [`Paid ${usd(price)} ${PAY_WORD[how!]}`]); }
    markFamily(s, 90); return out('Bad papers', 'They were forgeries and the post knew them at a glance. The money is gone and so is your quiet.', 'bad', [`Paid ${usd(price)} ${PAY_WORD[how!]}`, 'Marked for three months.']);
  }
  if (stance === 'confront') {
    const n = homeNeighbors(s).sort((a, b) => a.disposition - b.disposition)[0];
    humanity(s, war ? -15 : -20); grantPass(s, 'papers', 60);
    if (n) { n.status = 'gone'; n.disposition = -100; }
    return out('You gave them a name', `${n ? cap(n.name) : 'Someone'} were taken from their farm that night. ${n ? 'Their truck is still in the drive.' : ''} You have a stamp that is good for sixty days.`, 'bad', [`Humanity -${war ? 15 : 20}`]);
  }
  if (stance === 'back_roads') { f.lastCheck = d; return out('The back roads', 'You turned round. The truck behind you honked once and gave up.', 'mixed', ['Every run and delivery loses a day while there is no pass.']); }
  if (stance === 'flag_shoot') {
    f.hunted = d + 60; markFamily(s, 120);
    const rep = reprisal(1, f.tier ?? 1, () => 0);   // a shot at a post is always in reach of the valley
    if (rep.hostages > 0) { f.reprisalDue = d + 3; }
    fight(s, e); return null;
  }
  return fight(s, e);
}

function resolveQuota(s: GameState, e: Encounter, stance: Stance, r: () => number): Outcome | null {
  const f = fxOf(s), war = s.disaster.kind === 'civil_war', d = since(s);
  f.lastReq = d;
  const goods = e.wants ?? {}, known = informantActive(s), tier = f.tier ?? 1;
  const holder = f.front?.holder;
  if (stance === 'pay') {
    const paid = takeGoods(s, goods);
    if (war && holder) { const st = (f.standing ??= { compact: 50, alliance: 50 }); st[holder] = clamp(st[holder] + 3, 0, 100); (f.collab ??= { compact: 0, alliance: 0 })[holder]++; }
    else humanity(s, -1);
    return out('Quota paid', `The officer counted every sack and wrote a receipt. ${war ? 'It is worth what the side that wrote it is worth.' : invaderIn(s)!.receipt}`, 'mixed', [`Paid: ${paid.join(', ') || 'nothing'}`]);
  }
  if (stance === 'flag_bluff') {
    if (r() < shortWeightCaught(known, tier)) { const all = takeGoods(s, goods, 1.25); markFamily(s, 60); return out('The count was short', 'The quartermaster weighed a sack in his hand and set it down. They took the rest and a quarter more, and a soldier wrote the name in a book.', 'bad', [`Taken: ${all.join(', ')}`, 'Marked for two months.']); }
    const paid = takeGoods(s, goods, REQ.SHORT_WEIGHT); return out('Short-weighted, and nobody noticed', 'The count was close enough. Forty percent stayed in the cellar.', 'good', [`Paid: ${paid.join(', ')}`]);
  }
  if (stance === 'hide') {
    if (r() < searchChance(known, conceal(s))) { const all = takeGoods(s, goods, 1.5); markFamily(s, 90); return out('They found the cache', `${known ? 'Somebody had told them where to look. ' : ''}A soldier with a steel rod went down the row of barrels and stopped at the third. They took the quota and half again.`, 'bad', [`Taken: ${all.join(', ')}`, 'Marked for three months.']); }
    return out('They found nothing', 'They looked in the barn and the cellar and under the porch, and left with an empty truck. They will be back.', 'good', ['Nothing taken this time.']);
  }
  if (stance === 'flag_pay') {
    const price = s.disaster.kind === 'invasion' ? 1000 : 500;
    if (!payHow(s, price)) return out('Not enough', `The lieutenant named his price: ${usd(price)}. You could not cover it, and he took the quota.`, 'bad', [`Taken: ${takeGoods(s, goods).join(', ')}`]);
    const how = payUsd(s, price); return out('An exemption', invaderIn(s)?.exemptionNote ?? 'The envelope went in the glove box. He signed a paper with a flourish. The truck turned round empty.', 'mixed', [`Paid ${usd(price)} ${PAY_WORD[how!]}`, 'Nothing taken this time.']);
  }
  return fight(s, e);
}

function resolveDraft(s: GameState, e: Encounter, stance: Stance, r: () => number): Outcome | null {
  const f = fxOf(s), labor = s.disaster.kind === 'invasion', d = since(s), who = e.people?.[0];
  f.lastDraft = d;
  if (!who) return out('Nothing came of it', 'The notice was for someone who is not here.', 'mixed', []);
  const holder = f.front?.holder, retOff = labor ? DRAFT.LABOR_DAYS : (r() < 0.5 ? DRAFT.LEAVE_DAY + Math.floor(r() * 21) : null);
  if (stance === 'pay') {
    sendAway(s, who.id, retOff === null ? null : d + retOff, labor ? 'work detail' : 'line');
    if (holder) { const st = (f.standing ??= { compact: 50, alliance: 50 }); st[holder] = clamp(st[holder] + 8, 0, 100); (f.collab ??= { compact: 0, alliance: 0 })[holder]++; }
    return out(`${who.first} goes`, `${who.first} packed a bag and did not say much. ${labor ? `The truck brought no word for ${DRAFT.LABOR_DAYS} days.` : retOff === null ? 'There was no word of leave.' : `They said leave comes around day ${DRAFT.LEAVE_DAY}.`}`, 'mixed', []);
  }
  if (stance === 'hide') {
    const per = DRAFT.HIDE_FOUND * (1 - 0.5 * conceal(s));
    if (r() < 1 - Math.pow(1 - per, 3)) { sendAway(s, who.id, retOff === null ? null : d + retOff, labor ? 'work detail' : 'line'); const fine = takeGoods(s, { canned: 4 }); markFamily(s, 120); return out(`${who.first} was found`, 'They searched the cellar, the loft and the root cellar on the third pass. He went with them in his socks.', 'bad', [`Fine: ${fine.join(', ')}`, 'Marked for four months.']); }
    return out(`${who.first} stayed hidden`, 'Three searches, three times the soldiers looked at the same shelf. He did not breathe. They will be back.', 'good', []);
  }
  if (stance === 'flag_pay') {
    const pr = draftPrice(kindOf(s), d, r());
    if (!payHow(s, pr.usd)) { sendAway(s, who.id, retOff === null ? null : d + retOff, labor ? 'work detail' : 'line'); return out('No money', `The recruiter named a figure: ${usd(pr.usd)} or ${pr.silver} oz of silver. You could not cover it.`, 'bad', [`${who.first} goes.`]); }
    const how = payUsd(s, pr.usd); return out('A way out', 'He took the envelope and crossed the name off with a pencil. "Next time, it is double."', 'mixed', [`Paid ${usd(pr.usd)} ${PAY_WORD[how!]}`]);
  }
  if (stance === 'take_in') {
    const el = s.people.find((p, i) => p.elder && s.personState[i]?.needs.died == null);
    if (el) { sendAway(s, el.id, d + DRAFT.LABOR_DAYS, 'work detail'); const ps = s.personState.find(x => x.id === el.id); if (ps) ps.needs.health = Math.max(20, ps.needs.health - 25); return out(`${el.first} went instead`, 'They took the elder without a word. "They need bodies, not backs."', 'mixed', []); }
  }
  return fight(s, e);
}

export { makeOrderCard as makeCard, resolveOrderCard as resolveCard, orderLabels as labelsFor };
