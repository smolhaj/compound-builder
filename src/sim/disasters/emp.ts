import type { KindFx } from '../disasterFx';
import { mulberry32 } from '../rng';
import { daysSince, kfx, outcome, type Goal, type TechCard } from '../techFx';
import { empStrike, faradayShare } from '../nuclear';
import { EMP_VEHICLE_FRY, fleetOf, VEHICLES, runs } from '../vehicles';
import { radioSet } from '../radio';
import { disconnect } from '../flareFry';

/** High-altitude EMP, its own kind (WP1): no blast, no fallout, no winter. Chips die; 1970s trucks and boxed spares run. */
export interface EmpState { boxed: boolean; struck: boolean; quietUntil: number; fair: boolean }
export const empOf = (s: Parameters<typeof kfx>[0]): EmpState => kfx<EmpState>(s, 'emp', () => ({ boxed: false, struck: false, quietUntil: 0, fair: false }));

export const cards: TechCard[] = [
  {
    id: 'emp_box', kind: 'emp', title: 'Rumors of a launch', ttl: 3, fallback: 'ignore',
    text: () => 'Nobody can say when. The last day you can act is the day before, and you will not know it is that day. A radio, a spare inverter and a spare pump controller in a lidded metal can survive a pulse that kills everything wired in.',
    options: s => [
      { id: 'box', label: 'Box the spares and a radio in a galvanized can with a mesh liner', hint: 'About $150. Half of boxed electronics survive. A real Faraday room does better (70% to 100%).', cost: faradayShare(s) > 0 ? 0 : 150 },
      { id: 'unplug', label: 'Unplug the long runs and pull the breaker', hint: 'Free. Installed gear still dies; it only saves what is on a shelf, plugged in.' },
      { id: 'ignore', label: 'Do nothing', hint: 'Spares on a shelf are exposed like everything else.' },
    ],
    due: s => s.disaster.kind === 'emp' && s.clock.t < s.disaster.hitAt,
    answer: (s, o) => {
      if (o === 'box') { empOf(s).boxed = true; disconnect(s); return outcome('A can in the cellar', 'Radio, inverter and controller are in a lidded can wrapped in foil and mesh, and the long runs are unplugged.', 'good'); }
      if (o === 'unplug') { disconnect(s); return outcome('Unplugged', 'The breaker is off and the long runs are loose. It will help what is on the shelf only a little.', 'mixed'); }
      return outcome('You let it ride', 'You tell yourself it is a rumor.', 'bad');
    },
  },
  {
    id: 'emp_fair', kind: 'emp', title: 'A tube-set broadcast: a meeting at the grange', ttl: 4, fallback: 'stay',
    text: () => 'A single AM station on an old vacuum-tube transmitter, three counties away: "Stay in place. Delegates from each road to the grange, Saturday noon." It is a day on foot there and a day back.',
    options: s => [
      { id: 'go', label: 'Send two people on foot, or the old truck if it runs', hint: 'Likely 7 in 10 to come back with word, a trade partner and a barter contact; otherwise a night on the road in the cold.', locked: s.people.length < 3 ? 'too few hands to spare' : undefined },
      { id: 'stay', label: 'Stay home and listen', hint: 'Safe. You learn what the neighbors tell you.' },
    ],
    due: s => s.disaster.kind === 'emp' && daysSince(s) >= 5 && s.clock.t >= s.disaster.hitAt,
    answer: (s, o, r) => {
      if (o === 'stay') return outcome('You stay put', 'The neighbors bring the news instead, a day late and embellished.', 'mixed');
      const truck = fleetOf(s).some(v => !VEHICLES[v.kind].emp && runs(v) && v.fuel > 0);
      if (r() < (truck ? 0.9 : 0.7)) { for (const n of s.neighbors) if (n.status === 'home') n.disposition = Math.min(100, n.disposition + 6); return outcome('Word and a contact', 'The delegates agreed on a county watch and a barter day. Your neighbors respect you for going.', 'good'); }
      const ps = s.personState.find(p => p.needs.died == null);
      if (ps) ps.needs.hurt.push({ what: 'a night out in the cold', sev: 25 });
      return outcome('A night out', 'They never found the grange and slept in a culvert.', 'bad');
    },
  },
];

export const goals: Goal[] = [
  { id: 'emp_box', text: 'Get the spare inverter, pump controller and a radio into a metal box or a Faraday room', by: 0, done: s => empOf(s).boxed || faradayShare(s) > 0 },
  { id: 'emp_truck', text: 'Keep one vehicle that runs (a 1970s truck or tractor)', by: 1, done: s => fleetOf(s).some(v => runs(v)) },
  { id: 'emp_power', text: 'Reinstall a spare inverter: lights back on within a day', by: 3, done: s => s.utilities.fried.length === 0 },
  { id: 'emp_water', text: 'Water without a powered pump (hand pump or gravity)', by: 3, done: s => s.stock.hand_pump >= 1 || s.structures.some(st => st.kind === 'well_hand') },
  { id: 'emp_radio', text: 'Hear the tube-set broadcast on a boxed radio', by: 5, done: s => radioSet(s) !== 'none' },
];

const LINES: Array<[number, string, 0 | 1 | 2 | 3]> = [
  [0, 'a single AM station on a vacuum-tube transmitter: "This is an emergency broadcast. Stay in place. Do not drive."', 3],
  [3, 'the entire lower 48 is down; this is Salt Lake. Anyone with a rig, report.', 3],
  [10, 'the grange asks every road to send a delegate Saturday.', 2],
  [30, 'a mechanic two counties over is rewinding motors for eggs and salt.', 1],
];

export const fx: KindFx = {
  onWarning: () => ['Officials warn of a possible high-altitude test. Preppers on the air: "buy a trash can and some aluminum foil."'],
  onHit: s => {
    const e = empOf(s);
    if (e.struck) return [];
    e.struck = true;
    const floor = e.boxed ? 0.5 : 0;
    const out = empStrike(s, { vehicleFry: EMP_VEHICLE_FRY[s.disaster.difficulty ?? 'standard'], floor, extra: ['sw_radio', 'ham_rig'] });
    const r = mulberry32(s.seed * 4441 + 31);
    e.quietUntil = 7 + Math.floor(r() * 8);
    out.push('A light that was not the sun, and then nothing. No fallout, no winter: the world is intact and silent. The roads are full of dead cars.');
    return out;
  },
  daily: (s, ctx) => {
    const out: string[] = [];
    const e = empOf(s);
    if (ctx.day === e.quietUntil) out.push('The first walkers reach the road: looters on foot are about.');
    if (ctx.day === 3) out.push('The roads are jammed with dead cars. People are walking home from town.');
    return out;
  },
  priceMods: s => (s.clock.t < s.disaster.hitAt ? 1 + (s.clock.t >= s.disaster.warnAt && s.disaster.hitAt - s.clock.t < 3 ? 0.1 : 0) : 1.5),
  serviceMods: s => ({ stores: daysSince(s) < 10 ? 0.6 : 1, law: daysSince(s) > 7 ? 0.7 : 1 }),
  encounterWeights: (s, mix) => {
    const d = daysSince(s), quiet = empOf(s).quietUntil;
    if (d < quiet) for (const k of ['gang', 'looters', 'horde', 'militia', 'break_in'] as const) mix.scale(k, 0);
    if (d >= 5) mix.scale('refugees', 2);
  },
  npcMods: () => 1.3,
  radioBulletins: (s, ctx) => {
    if (radioSet(s) === 'none') return null;
    const l = [...LINES].reverse().find(x => ctx.day >= x[0] && ctx.day < x[0] + 4);
    return l ? { text: l[1], tone: l[2] } : null;
  },
};
