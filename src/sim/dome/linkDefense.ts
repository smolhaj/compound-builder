/**
 * Tunnelers against a dome link (docs/DOME_LINKS.md; owner addition 2026-11-19): a learned crew must not simply win against a shallow tunnel.
 *
 *  reach      `tunnelReach` (links.ts): a tunnel deeper than the crew can dig is never found; a shallow one is.
 *  detection  the same four counters as any dig (ground sensors, dogs, a watch, a tower: `detectChances` in tunnelers.ts). Found, the player gets an alert
 *             card with the dig position and the time left until the breach, and a radio line.
 *  answer     send the defenders out to hold position at the breach, send them out to fall back to the airlock, collapse the tunnel on the crew (costs the
 *             link), seal the airlock and let them come, or ignore it. The fight is the battle sim's tunneling scene; the card shows the odds.
 *  outcomes   driven off, a standoff, a partial breach (an airlock forced or a section collapsed) or defenders lost (`classify`).
 * Everything new here is PROPOSED (the DECISIONS row of 2026-11-19). Pure but for the state it edits (tested in linkDefense.test.ts).
 */
import { applyBattle, planBattle, type RaiderTemper } from '../battle';
import { recordBattle } from '../rescue';
import { type Encounter, type Outcome, type Stance } from '../encounters';
import { AIRLOCK_DOOR, AIRLOCK_CYCLE_S } from './siege';
import { FT_PER_UNIT, domesOf } from './standing';
import { sideOfDome } from './crossing';
import { LINK, collapseLink, takeDown, tunnelReach, linksOf, linkOpen, type DomeLink } from './links';
import { ambushParty, ambushShape, chosenParty, insideEncounter, newDigs, type Dig } from '../tunnelers';
import { dayIndex, type GameState } from '../state';
import { pluralize } from '../words';
import { towersBuilt } from '../towers';
import { onDuty } from '../guards';

export type CounterOrder = 'hold' | 'fall';
export type CounterOutcome = 'driven_off' | 'standoff' | 'partial_breach' | 'defenders_lost';

/** The link a dig is going for, or null. */
export const linkOfDig = (s: GameState, d: Pick<Dig, 'run' | 'link'>): DomeLink | null => {
  const id = d.link ?? (d.run.startsWith('link:') ? d.run.slice(5) : null);
  return id ? linksOf(s).find(l => l.id === id) ?? null : null;
};

/** A point along a link's open stretch (between the two doors), `u` (0-1) of the way. */
export function pointAlong(l: DomeLink, u: number): [number, number] {
  const [a, b] = l.ends;
  return [a.x + (b.x - a.x) * u, a.z + (b.z - a.z) * u];
}

/** Links a crew could dig into: open tunnels whose depth a crew with this much learning reaches. */
export const diggable = (s: GameState, adapt: number): DomeLink[] => linksOf(s).filter(l => l.kind === 'tunnel' && linkOpen(s, l) && tunnelReach(l.depthFt ?? 0, adapt) > 0);

/** Where the crew is, in words: how far down the tunnel from the nearer dome's sleeve, and the compass side of that dome. */
export function spotWords(s: GameState, l: DomeLink, at: [number, number]): string {
  const ends = l.ends.map(e => ({ e, d: Math.hypot(at[0] - e.x, at[1] - e.z) })).sort((x, y) => x.d - y.d), near = ends[0];
  const ft = Math.round(near.d * FT_PER_UNIT / 10) * 10, dome = near.e.type === 'dome' ? domesOf(s).find(x => x.id === near.e.id) : null;
  return dome ? `${ft.toLocaleString('en-US')} ft out along the tunnel from the ${sideOfDome(dome, near.e.x, near.e.z)} airlock sleeve` : `${ft.toLocaleString('en-US')} ft along the tunnel from its near end`;
}

// ── what the defenders have: a plain, monotone readout ──

export interface CounterInputs {
  /** Crew size and days of warning left. */
  size: number; lead: number;
  /** The defenders who go, guards on duty, towers in reach, rounds of ammunition, cover at the breach (0-1), working ground sensors. */
  party: number; guards: number; towers: number; ammo: number; cover: number; sensors: number;
}

/**
 * The defenders' edge over the crew, 0 (none) to 1 (overwhelming). Every input only helps (property test): more defenders, guards, towers, ammunition,
 * cover, sensors or warning never lowers it; a bigger crew never raises it. A readout and the card's word; the fight itself is the battle sim's.
 */
export function counterEdge(i: CounterInputs): number {
  const warn = Math.min(8, Math.max(0, i.lead)), ammoK = Math.min(1, i.ammo / Math.max(1, (i.party + i.guards) * 30));
  const def = i.party * (1 + 0.5 * ammoK) + i.guards * 0.8 + i.towers * 1.5 + 2 * Math.max(0, Math.min(1, i.cover)) + Math.min(3, i.sensors) * 0.4 + warn * 0.35;
  const off = Math.max(1, i.size) * 1.6;
  return def / (def + off);
}
export const edgeWord = (e: number): string => e >= 0.7 ? 'a strong edge' : e >= 0.5 ? 'an even fight leaning our way' : e >= 0.35 ? 'an even fight' : 'a weak hand';

/** The inputs from the place: who would go, who is on watch, the towers by the dome, the rounds in the armory, the sensors. */
export function counterInputs(s: GameState, d: Pick<Dig, 'size'>, lead: number, link: DomeLink): CounterInputs {
  const domes = link.ends.map(e => domesOf(s).find(x => x.id === e.id)).filter(Boolean) as ReturnType<typeof domesOf>;
  const towers = towersBuilt(s).filter(t => domes.some(dm => Math.hypot(t.st.x - dm.x, t.st.z - dm.z) <= dm.r + t.def.post.reach)).length;
  const ammo = Object.values(s.armory.ammo ?? {}).reduce((a, n) => a + (n ?? 0), 0);
  return { size: d.size, lead, party: ambushParty(s).length, guards: onDuty(s).length, towers, ammo, cover: 0.5, sensors: Math.floor(s.stock.ground_sensor ?? 0) };
}

// ── the fight ──

/** How the crew and the surprise look under each order: holding the breach point catches them climbing out (the warning is the surprise); falling back to the airlock fights them one door at a time. */
export function orderShape(order: CounterOrder, size: number, lead: number): { surprise: number; crew: number } {
  if (order === 'hold') return ambushShape(size, lead);
  return { surprise: 1, crew: Math.max(1, Math.round(size * 0.7)) };
}

/**
 * Four outcomes from the battle sim's result and the defenders' losses. Falling back trades a harder crew fight for a forced door: where holding the point
 * is overrun the defenders are lost, falling back is overrun at the airlock instead (a partial breach).
 */
export function classify(result: 'repelled' | 'fled' | 'breached' | 'overrun', party: number, lost: number, order: CounterOrder): CounterOutcome {
  const heavy = lost >= Math.max(2, Math.ceil(party / 2));
  if (result === 'overrun') return order === 'fall' && !heavy ? 'partial_breach' : 'defenders_lost';
  if (heavy) return 'defenders_lost';
  if (result === 'breached') return 'partial_breach';
  return lost > Math.floor(party / 4) ? 'standoff' : 'driven_off';
}

const homeLost = (b: ReturnType<typeof planBattle>): number => b.events.filter(x => (x.kind === 'death' || x.kind === 'taken') && x.unit.startsWith('h_')).length;

const CACHE = new Map<string, Record<CounterOutcome, number>>();
/** Odds of each outcome for the card, from the battle sim with sixteen other seeds. Cached on the place and the order. */
export function counterOdds(s: GameState, d: Pick<Dig, 'size' | 'temper'>, lead: number, order: CounterOrder, tries = 12): Record<CounterOutcome, number> {
  const party = chosenParty(s).length, key = `${s.seed}|${s.clock.ticks}|${d.size}|${lead}|${d.temper}|${order}|${party}|${s.armory.guns.length}`;
  const hit = CACHE.get(key);
  if (hit) return hit;
  const out: Record<CounterOutcome, number> = { driven_off: 0, standoff: 0, partial_breach: 0, defenders_lost: 0 };
  const { surprise, crew } = orderShape(order, d.size, lead);
  for (let i = 0; i < tries; i++) {
    const b = planBattle(s, crew, 5_003 + i * 91_009, { armed: true, organized: true, temper: d.temper as RaiderTemper, kind: 'tunnelers', ambush: surprise });
    out[classify(b.result, party, homeLost(b), order)] += 1 / tries;
  }
  if (CACHE.size > 48) CACHE.clear();
  CACHE.set(key, out);
  return out;
}

/** Chance the crew forces a sealed link airlock when they reach it: the door's own odds against a satchel, by the dome's tier (never rises up the tiers). */
export function forceChance(s: GameState, l: DomeLink, at: [number, number], size: number): number {
  const near = l.ends.filter(e => e.type === 'dome').sort((a, b) => Math.hypot(at[0] - a.x, at[1] - a.z) - Math.hypot(at[0] - b.x, at[1] - b.z))[0];
  const dome = near ? domesOf(s).find(x => x.id === near.id) : null;
  if (!dome) return 0.6;
  return Math.min(0.95, AIRLOCK_DOOR[dome.tier].blast * (size >= 4 ? 1 : 0.6));
}

// ── the cards ──

/** The alert when a dig toward a link is found: where the crew is, how long to the breach, and a radio line. */
export function linkWarning(s: GameState, d: Dig, l: DomeLink, day: number): Encounter {
  const left = Math.max(0, d.days - (day - d.startDay)), hours = left <= 0 ? 6 : left * 24;
  const where = spotWords(s, l, d.at), by = d.by ?? 'watch';
  const how: Record<string, string> = { sensors: 'ground sensors', dogs: 'the dogs', watch: 'whoever has the watch', tower: 'the tower' };
  const party = ambushParty(s);
  const stances: Stance[] = [];
  if (party.length) stances.push('counter_hold', 'counter_fall');
  stances.push('collapse', 'seal', 'ignore');
  return {
    id: `e${s.nextId++}`, kind: 'tunnelers', day, title: `Radio: a crew is digging toward the ${l.kind === 'tunnel' ? 'tunnel' : 'link'} between the domes`,
    dossier: [`Radio check from ${how[by]}: digging, about ${d.size} of them, ${where}. They are working down to the lining, ${l.depthFt ?? 0} ft under the ground: they have found it.`,
      `${left <= 1 ? 'They are almost through' : `About ${pluralize(left, 'day')}, ${hours.toLocaleString('en-US')} hours, to the breach`}. Once in, they can force the airlock sleeve at either dome.`,
      'A tunnel deeper than a crew can dig is never found; this one is not that deep.'],
    size: d.size, armed: true, strength: 0, temper: d.temper, stances,
    dig: { phase: 'warning', id: d.id, lead: left, by, link: l.id },
  };
}

const card = (title: string, text: string, tone: Outcome['tone'], lines: string[]): Outcome => ({ title, text, tone, lines });

/** What each outcome does and says. Returns the card; edits the state (the link, respect, the dig). */
export function applyCounterOutcome(s: GameState, l: DomeLink, kind: CounterOutcome, lines: string[], order: CounterOrder): Outcome {
  const g = s.gate, day = dayIndex(s.clock.t);
  if (kind === 'driven_off') {
    g.respect = Math.min(1, (g.respect ?? 0) + 0.25); g.next = Math.max(g.next, day + 20);
    return card('The crew was driven off', order === 'hold' ? 'The first heads came up out of the hole into rifles. The rest turned back down the lining and ran for the spoil pile.' : 'They came down the tunnel into a held door and could not get through it. They ran before the second charge was set.', 'good', lines);
  }
  if (kind === 'standoff') {
    l.wear = Math.min(1, l.wear + 0.25); g.respect = Math.min(1, (g.respect ?? 0) + 0.1);
    takeDown(s, l, 'charge', 'A standoff in the tunnel: neither side could move the other. The lining took the worst of it and the link is shut until it is repaired.');
    return card('A standoff in the tunnel', 'Nobody could move anybody. The crew stopped digging and pulled back to the hole; our people held the airlock. The tunnel is shut until it is repaired.', 'mixed', lines);
  }
  if (kind === 'partial_breach') {
    takeDown(s, l, 'charge', 'The crew forced a link airlock and the defenders brought a section of the tunnel down behind them. The link is lost until it is cleared.');
    return card('They got a door, and we lost the tunnel', 'An airlock was forced and a section came down on its own side before they could use it. The dome stands, the link does not. A contractor can clear it.', 'bad', lines);
  }
  takeDown(s, l, 'charge');
  return card('We lost people in the tunnel', 'The defenders could not hold. The crew is through, the airlock is forced and the tunnel is wrecked behind them.', 'bad', lines);
}

/**
 * The warning card's answer for a dig toward a link (called from `resolveDigWarning`). `r` is the day's roll. Never mutates when the dig is gone.
 */
export function resolveLinkDig(s: GameState, e: Encounter, stance: Stance, r: () => number): Outcome {
  const g = s.gate, ds = (s.digs ??= newDigs()), day = dayIndex(s.clock.t);
  const d = ds.active && ds.active.id === e.dig?.id ? ds.active : null, l = d ? linkOfDig(s, d) : null;
  if (!d || !l) return card('They gave up', 'By the time you look, the hole is empty and the dig is abandoned.', 'good', []);
  if (stance === 'counter_hold' || stance === 'counter_fall') {
    const order: CounterOrder = stance === 'counter_hold' ? 'hold' : 'fall', party = chosenParty(s);
    const { surprise, crew } = orderShape(order, d.size, e.dig?.lead ?? 0);
    const b = planBattle(s, crew, s.seed * 131 + day * 7 + 9, { armed: true, organized: true, temper: d.temper, kind: 'tunnelers', ambush: surprise });
    g.battle = b;
    const lines = applyBattle(s, b);
    recordBattle(s, b, crew, d.temper);
    ds.ambushed++; ds.active = null;
    ds.party = { ids: party, day: day + 1 }; ds.partyPick = undefined;
    lines.unshift(`${pluralize(party.length, 'defender')} went out to the dig site and ${order === 'hold' ? 'held the breach point' : 'fell back to the airlock'}. The house was thin that night.`);
    const out = classify(b.result, party.length, homeLost(b), order);
    return applyCounterOutcome(s, l, out, lines, order);
  }
  if (stance === 'collapse') {
    ds.active = null; g.respect = Math.min(1, (g.respect ?? 0) + 0.15);
    collapseLink(s, l.id, 'collapse');
    return card('The tunnel comes down on them', 'The shoring comes out and the roof drops onto the dig. A few of them get out the far end; some will not be coming back. It sits badly with the family, and the link is gone until a contractor clears it.', 'mixed', [`Some of the ${d.size} will not be coming back.`]);
  }
  if (stance === 'seal') {
    ds.active = null;
    const forced = r() < forceChance(s, l, d.at, d.size);
    l.revealed = true;
    if (!forced) {
      takeDown(s, l, 'charge', 'The crew came through the lining and found both link airlocks bolted. They fouled the tunnel and left. It is shut until it is cleaned out.');
      g.respect = Math.min(1, (g.respect ?? 0) + 0.1);
      return card('The doors held', 'The crew had the tunnel and nothing else. The sleeves were bolted and they could not force a door before they ran out of nerve. The link is shut until it is cleaned out and repaired.', 'mixed', []);
    }
    takeDown(s, l, 'charge');
    s.gate.pending = linkBreakIn(s, d, l, day);
    return card('They forced the airlock', 'Sealed doors slowed them, not stopped them. They are coming up out of the sleeve.', 'bad', ['The link airlock was forced; the tunnel is wrecked behind them.']);
  }
  d.ignored = true;
  return card('You let them dig', 'There is nothing to be done tonight. They will be into the tunnel in a few days, and through the airlock after that.', 'mixed', []);
}

/** The crew that comes up through a forced link airlock inside the dome (the existing inside card, with the tunnel's words). */
export function linkBreakIn(s: GameState, d: Dig, l: DomeLink, day: number): Encounter {
  const e = insideEncounter(s, d, day, d.detectedDay !== null);
  const cycle = [...l.ends].map(x => (x.type === 'dome' ? domesOf(s).find(y => y.id === x.id) : null)).find(Boolean);
  return { ...e, title: 'They have forced the airlock from the tunnel', dossier: [`${e.size} of them are through the tunnel and out of the link airlock${cycle ? `, after ${AIRLOCK_CYCLE_S[cycle.tier]} seconds of cycling the interlock they should not have had` : ''}.`, 'The dome is sealed no longer at that door.'], dig: { phase: 'inside', id: d.id, lead: 0, link: l.id } };
}

/** The day a dig toward a link reaches it: the crew is in the tunnel. Ignored or unnoticed, they force the sleeve (`forceChance`); a held door ends it. Returns the line. */
export function linkSurfaces(s: GameState, d: Dig, l: DomeLink, day: number, r: () => number): string {
  l.revealed = true;
  if (r() < forceChance(s, l, d.at, d.size)) {
    takeDown(s, l, 'charge');
    s.gate.pending = linkBreakIn(s, d, l, day);
    return s.gate.pending.title;
  }
  takeDown(s, l, 'charge', 'A crew broke into the tunnel and tried both link airlocks. The doors held, but the lining is wrecked.');
  return 'A crew broke into the tunnel and could not get through the airlock';
}

export { LINK };
