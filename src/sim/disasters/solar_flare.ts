import type { KindFx } from '../disasterFx';
import { mulberry32 } from '../rng';
import { daysSince, outcome, wealthOf, type Goal, type TechCard } from '../techFx';
import { flareGridFactor, flareOf, flareStrike, gicOf, disconnect } from '../flareFry';
import { faradayShare } from '../nuclear';
import { repairPlan } from '../structureDamage';

/** The two decisions of a solar storm: the drill before it, and the pole transformer after (money buys the repair faster). */
export const cards: TechCard[] = [
  {
    id: 'flare_drill', kind: 'solar_flare', title: 'The sky is going red', ttl: 2, fallback: 'ignore',
    text: () => 'The storm watch is on every channel. A flare cooks long wires, not engines. Open the main breaker and unplug the long runs, and the damage a third as likely.',
    options: s => [
      { id: 'disconnect', label: 'Pull the main breaker and unplug the long runs', hint: 'Free. Connected gear rolls a third of the chance (inverter 45% to 15%).' },
      { id: 'box', label: 'Box the spares and radios in a metal can, then disconnect', hint: 'About $120 of mesh and a galvanized can. Spares and radios get a tier-1 room\'s 2%.', cost: faradayShare(s) > 0 ? 0 : 120 },
      { id: 'ignore', label: 'Carry on as usual', hint: 'Every connected piece rolls its full chance.' },
    ],
    due: s => s.disaster.kind === 'solar_flare' && s.clock.t < s.disaster.hitAt && s.disaster.variant !== 'near_miss',
    answer: (s, o) => {
      const f = flareOf(s);
      if (o === 'ignore') return outcome('You let it ride', 'The breaker stays closed. Whatever the sky does, the wires will carry it in.', 'bad');
      disconnect(s);
      if (o === 'box') { f.box = true; return outcome('Disconnected and boxed', 'The breaker is open, the inverter unplugged, and the spares and radios are in a lidded can wrapped in foil and mesh.', 'good'); }
      return outcome('Disconnected', 'The main breaker is open and the long runs are unplugged. The house is quiet and the sky is red.', 'good');
    },
  },
  {
    id: 'flare_pole', kind: 'solar_flare', title: 'The pole transformer is cooked', ttl: 6, fallback: 'wait',
    text: s => { const f = flareOf(s); return `The can on the pole at the road split open. Even when the county grid comes back, your line stays dead until it is replaced: about ${Math.max(1, f.poleFixDay - daysSince(s))} more days on the co-op's list, rural last.`; },
    options: s => [
      { id: 'hire', label: 'Pay a contractor to set a salvaged unit', hint: '$4,500. About 4 days; 7 in 10 it goes smoothly, otherwise ten more days of waiting for the part.', cost: 4500 },
      { id: 'wait', label: 'Wait on the co-op\'s list', hint: 'Free. Whatever date they gave.' },
      { id: 'diy', label: 'Rig a bypass yourselves with the neighbors\' help', hint: `Free in cash, and ${repairPlan(0.6, 7500, 0, 0).days} days by hand unless you have money to speed it (${Math.round(wealthOf(s) * 100)}% of the way).` },
    ],
    due: s => s.disaster.kind === 'solar_flare' && flareOf(s).poleDead && daysSince(s) >= 2 && daysSince(s) < flareOf(s).poleFixDay,
    answer: (s, o, r) => {
      const f = flareOf(s), d = daysSince(s);
      if (o === 'hire') { const ok = r() < 0.7; f.poleFixDay = Math.min(f.poleFixDay, d + (ok ? 4 : 14)); return ok ? outcome('A new can on the pole', 'The contractor set a salvaged unit in four days.', 'good') : outcome('The part never came', 'The salvaged unit was the wrong size. Ten more days.', 'bad'); }
      if (o === 'diy') { const p = repairPlan(0.6, 7500, wealthOf(s), s.crews?.length ?? 0); f.poleFixDay = Math.min(f.poleFixDay, d + p.days); return outcome('A bypass by hand', `It took ${p.days} days of splicing and cursing.`, 'mixed'); }
      return outcome('You wait', 'The list is long and the rural lines are last.', 'mixed');
    },
  },
];

/** The first-week goal chain (data for the felt layer). */
export const goals: Goal[] = [
  { id: 'flare_disconnect', text: 'Open the main breaker and unplug the long runs before the sky burns', by: 0, done: s => flareOf(s).disconnected },
  { id: 'flare_spares', text: 'Keep a spare inverter and a radio safe (a Faraday room or a boxed can)', by: 0, done: s => faradayShare(s) > 0 || !!flareOf(s).box },
  { id: 'flare_fuel', text: 'Fill the fuel cans and the water jugs', by: 1, done: s => s.stock.fuel >= 4 },
  { id: 'flare_radio', text: 'Still have a working radio after the hit', by: 2, done: s => s.stock.sw_radio + s.stock.ham_rig >= 1 },
  { id: 'flare_power', text: 'Have the lights on by day 7 (your own plant, or the pole replaced)', by: 7, done: s => s.disaster.tracks.grid > 0.5 || s.utilities.fried.length === 0 },
];

const LINES: Array<[number, string, 0 | 1 | 2 | 3]> = [
  [0, 'power companies report cascading trips across the Northeast and Great Lakes.', 3],
  [2, 'shortwave bands are recovering; GPS accuracy is degraded.', 1],
  [4, 'a second wave of transformer trips took the grid down again in three states.', 2],
  [9, 'the utility says damaged transformers will be shipped; no dates.', 2],
  [30, 'the state asks everyone to conserve what little the co-op can send.', 1],
  [180, 'a factory in Pennsylvania delivered its first replacement unit.', 0],
];

export const fx: KindFx = {
  legacy: { economy: 'finance.ts: the market crash (30%)' },
  onWarning: s => s.disaster.variant === 'near_miss' ? ['The sky is green and red to the south. Compasses wander. That is all.'] : ['A G-class storm watch is up. Aurora is forecast as far south as Texas.'],
  onHit: s => flareStrike(s, mulberry32(s.seed * 3571 + 1)),
  daily: (s, ctx) => {
    const out: string[] = [];
    const f = flareOf(s);
    if (f.dipAt && ctx.day === f.dipAt) out.push('A damaged county transformer tripped: the grid dipped again, for days this time.');
    return out;
  },
  priceMods: s => (s.disaster.variant === 'near_miss' || s.clock.t < s.disaster.hitAt ? 1 : 1 + 0.4 * Math.min(1, daysSince(s) / 30)),
  serviceMods: s => (s.disaster.variant === 'near_miss' ? {} : { grid: flareGridFactor(s, daysSince(s)) * (gicOf(s) > 1.2 && daysSince(s) < 30 ? 0.9 : 1) }),
  encounterWeights: (s, mix) => { if (daysSince(s) < 28) for (const k of ['gang', 'looters', 'horde'] as const) mix.scale(k, 0.4); },
  radioBulletins: (_s, ctx) => {
    const l = [...LINES].reverse().find(x => ctx.day >= x[0] && ctx.day < x[0] + 3);
    return l ? { text: l[1], tone: l[2] } : null;
  },
};
