import type { KindFx } from '../disasterFx';
import { daysSince, outcome, offerCards, expireCards, type Goal, type TechCard } from '../techFx';
import { dayIndex } from '../state';
import { weatherOf } from '../weatherThreats';
import { radioSet } from '../radio';

/** Grid-down (WP2): the baseline blackout with five variants (ice storm, substation attack, cascade, cyber, and the new transformer shortage). */
const gone = (s: Parameters<TechCard['due']>[0]) => s.disaster.kind === 'grid_down' && s.clock.t >= s.disaster.hitAt;

export const cards: TechCard[] = [
  {
    id: 'gd_charging', kind: 'grid_down', title: 'A neighbor needs power for an oxygen concentrator', ttl: 3, fallback: 'refuse',
    text: () => 'A neighbor\'s husband is on an oxygen concentrator and their battery is nearly flat. It would take the generator, two cans of fuel and a lit window that the whole road will see.',
    options: s => [
      { id: 'power', label: 'Run the generator for them overnight', hint: 'Two cans of fuel. Goodwill with every neighbor, and a lit window and a noisy engine (raiders look).', locked: s.stock.fuel >= 2 ? undefined : 'needs 2 cans of fuel' },
      { id: 'tank', label: 'Lend a portable tank and two cans', hint: 'Nearly the same goodwill, quieter, but the tank is gone.', locked: s.stock.fuel >= 2 ? undefined : 'needs 2 cans of fuel' },
      { id: 'refuse', label: 'Tell them you cannot spare it', hint: 'Humanity and goodwill drop; word gets round.' },
    ],
    due: s => gone(s) && daysSince(s) >= 4 && s.neighbors.some(n => n.status === 'home'),
    answer: (s, o) => {
      const home = s.neighbors.filter(n => n.status === 'home');
      if (o === 'refuse') { for (const n of home) n.disposition = Math.max(-100, n.disposition - 6); s.gate.humanity = Math.max(0, s.gate.humanity - 4); return outcome('You send them home', 'You hear he did not make it through the week. The road does not forget.', 'bad'); }
      s.stock.fuel -= 2;
      for (const n of home) n.disposition = Math.min(100, n.disposition + (o === 'power' ? 10 : 8));
      s.gate.humanity = Math.min(100, s.gate.humanity + 4);
      return outcome('A night of power', o === 'power' ? 'The generator ran till dawn. Everyone on the road saw the light.' : 'The tank went down the road in a wheelbarrow.', 'good');
    },
  },
  {
    id: 'gd_county', kind: 'grid_down', title: 'The county plan: the fire hall as a hub', ttl: 4, fallback: 'stay',
    text: () => 'The co-op says two years for the transformers. The volunteer fire hall is organizing a hub: shared generator hours, a message board, a barter day. They ask you for a share of fuel and a few hands.',
    options: s => [
      { id: 'join', label: 'Send a can of fuel and a pair of hands', hint: 'Goodwill with the neighbors; a seat at the table when the barter day comes.', locked: s.stock.fuel >= 1 ? undefined : 'needs a can of fuel' },
      { id: 'host', label: 'Offer the compound as the hub', hint: 'Greater goodwill, strangers at the gate every barter day.' },
      { id: 'stay', label: 'Keep to yourselves', hint: 'Safe, and alone.' },
    ],
    due: s => gone(s) && s.disaster.variant === 'transformer_shortage' && daysSince(s) >= 5,
    answer: (s, o) => {
      const home = s.neighbors.filter(n => n.status === 'home');
      if (o === 'stay') return outcome('You stay out of it', 'The hub runs without you.', 'mixed');
      if (o === 'join') { s.stock.fuel -= 1; for (const n of home) n.disposition = Math.min(100, n.disposition + 6); return outcome('Your share', 'A can and two hands. They will remember.', 'good'); }
      for (const n of home) n.disposition = Math.min(100, n.disposition + 12);
      s.gate.humanity = Math.min(100, s.gate.humanity + 3);
      return outcome('The hub is yours', 'Barter day is Saturday, at your gate. Bring the dogs inside.', 'good');
    },
  },
];

export const goals: Goal[] = [
  { id: 'gd_water', text: 'Have a way to water without grid power (hand pump, solar pump, gravity)', by: 1, done: s => s.stock.hand_pump >= 1 || s.structures.some(st => st.kind === 'well_hand') || s.utilities.storedL > 500 },
  { id: 'gd_freezer', text: 'Eat or can the freezer food before it spoils', by: 3, done: s => (s.stock.frozen ?? 0) < 1 },
  { id: 'gd_fuel', text: 'Fuel in drums or cans for the generator and the truck', by: 3, done: s => s.stock.fuel >= 4 },
  { id: 'gd_radio', text: 'Hear the county on a crank radio or ham set', by: 3, done: s => radioSet(s) !== 'none' },
  { id: 'gd_neighbor', text: 'Meet the neighbors before week 2', by: 7, done: s => s.neighbors.some(n => n.status === 'home' && n.disposition > 20) },
];

const LINES: Array<[number, string, 0 | 1 | 2 | 3]> = [
  [0, 'the utility says crews are assessing damage.', 1],
  [3, 'the utility says restoration estimates are being revised.', 2],
  [14, 'the governor orders hospitals to get generator fuel first.', 1],
  [60, 'the National Guard is escorting a fuel convoy to the county seat.', 1],
  [120, 'the co-op says the transformers are on a manufacturing queue: 18 months at best.', 2],
];

export const fx: KindFx = {
  legacy: { media: 'report.ts: the solar grid-tie line' },
  onWarning: s => ['"Conserve power 4 to 9 p.m." The lights dimmed twice at supper.', ...offerCards(s, cards)],
  onHit: s => {
    const out: string[] = [];
    const v = s.disaster.variant;
    if (v === 'ice_storm') {
      const day = dayIndex(s.clock.t);
      weatherOf(s).active = { kind: 'ice_storm', at: day, until: day + 4 };
      out.push('Ice is coming down on every line: poles are going over, and the roads are glass.');
    } else if (v === 'substation') out.push('A coordinated attack on the substations: the sheriff says guards are posted, and copper thieves are working the dark lines.');
    else if (v === 'transformer_shortage') out.push('The utility says the transformers are cooked, not tripped. Crews can rebuild lines in weeks; transformers take years.');
    else out.push('The line to the road went dead. Yours did not, if you built your own plant.');
    return out;
  },
  daily: (s, ctx) => [...expireCards(s, cards, ctx.r), ...offerCards(s, cards)],
  priceMods: s => (s.clock.t < s.disaster.hitAt ? (s.clock.t < s.disaster.warnAt ? 1 : 1 + 0.08 * Math.max(0, Math.min(1, 1 - (s.disaster.hitAt - s.clock.t) / 30))) : 1 + 0.2 * Math.max(0, 1 - daysSince(s) / 14)),
  encounterWeights: (s, mix) => {
    const d = daysSince(s);
    if (s.disaster.tracks.law < 0.5) mix.scale('looters', 1.3);
    if (d >= 14) mix.scale('break_in', 2.5);
    if (s.disaster.variant === 'substation') mix.scale('looters', 1.5);
  },
  npcMods: s => (s.disaster.variant === 'transformer_shortage' ? 1.2 : 1),
  oasisWeight: s => (s.utilities.lit.length ? 0.12 : 0),
  radioBulletins: (s, ctx) => {
    const l = [...LINES].reverse().find(x => ctx.day >= x[0] && ctx.day < x[0] + 3 && (x[0] !== 120 || s.disaster.variant === 'transformer_shortage'));
    return l ? { text: l[1], tone: l[2] } : null;
  },
};
