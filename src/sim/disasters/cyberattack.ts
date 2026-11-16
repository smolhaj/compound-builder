import type { KindFx } from '../disasterFx';
import { mulberry32 } from '../rng';
import { daysSince, outcome, type Goal, type TechCard } from '../techFx';
import { cyberOf, cyberPrice, cyberRestore, cyberStrike, flicker, hear, nextRumor, RUMOR_PLAN, wellSafe } from '../cyberMath';
import { radioSet } from '../radio';
import { isFinished } from '../construction';

export const cards: TechCard[] = [
  {
    id: 'cy_firmware', kind: 'cyberattack', title: '"Firmware update failed"', ttl: 4, fallback: 'leave',
    text: () => 'The smart well controller shows a failed update and the app will not log in. Pharmacies and gas stations in three states are on cash. If this is the start of it, a controller you can only reach over the network is a controller that can be bricked.',
    options: s => [
      { id: 'override', label: 'Fit a manual override on the well controller', hint: '$180 of switches and a relay. The pump runs on a plain switch if the controller bricks.', cost: 180, locked: s.structures.some(st => st.kind === 'well_drilled' && isFinished(st)) ? undefined : 'no drilled well' },
      { id: 'spare', label: 'Buy a spare controller and keep it offline in a drawer', hint: '$600. Counts as a manual path; you can swap it in at once.', cost: 600 },
      { id: 'leave', label: 'Leave it', hint: 'The controller bricks 55% of the time (Cozy 35%, Hardcore 70%).' },
    ],
    due: s => s.disaster.kind === 'cyberattack' && s.clock.t < s.disaster.hitAt && s.structures.some(st => st.kind === 'well_drilled' && isFinished(st)),
    answer: (s, o) => {
      if (o === 'override') { cyberOf(s).override = true; return outcome('A plain switch on the pump', 'The relay is wired. If the controller dies, the pump still runs on a switch.', 'good'); }
      if (o === 'spare') { s.stock.pump += 1; return outcome('A spare in the drawer', 'Kept off the network and off the grid.', 'good'); }
      return outcome('You leave it', 'Whatever happens, happens to the controller.', 'bad');
    },
  },
  {
    id: 'cy_cash', kind: 'cyberattack', title: 'Cards are dead: the farm store takes cash', ttl: 2, fallback: 'hold',
    text: s => `The register shows "cash only". The shelves are full, for now. You have $${Math.floor(s.fin?.cash ?? 0).toLocaleString('en-US')} in small bills in the safe. In about a week the cash window closes and the shelves empty.`,
    options: s => [
      { id: 'spend', label: 'Spend $1,000 of the safe\'s cash: staples and fuel', hint: '5 bags of staples and 12 cans of fuel at the panic prices. Cash is the only money that works today.', locked: (s.fin?.cash ?? 0) >= 1000 ? undefined : 'needs $1,000 in cash in the safe' },
      { id: 'hold', label: 'Hold the cash', hint: 'It still buys a little after the window, at much worse prices.' },
    ],
    due: s => s.disaster.kind === 'cyberattack' && s.clock.t >= s.disaster.hitAt,
    answer: (s, o) => {
      if (o !== 'spend') return outcome('You keep the bills', 'Maybe the banks come back.', 'mixed');
      s.fin.cash -= 1000; s.stock.staples += 5; s.stock.fuel += 12;
      return outcome('A full cart', 'Five bags of staples and twelve cans of fuel, paid in twenties.', 'good');
    },
  },
  {
    id: 'cy_fair', kind: 'cyberattack', title: 'A distribution point at the fairgrounds', ttl: 3, fallback: 'stay',
    text: s => `${RUMOR_PLAN[0].text} Nobody can say who put it out.${radioSet(s) === 'ham' ? ' Your ham set can check it against another net.' : ''}`,
    options: s => [
      { id: 'verify', label: 'Check it on the ham net first', hint: 'Takes an hour of the operator, then you know.', locked: radioSet(s) === 'ham' ? undefined : 'needs a powered ham set and someone who knows radio' },
      { id: 'go', label: 'Drive out at dawn', hint: 'If it is real: food and fuel. If not: a can of fuel gone and 4 in 10 an ambush.' },
      { id: 'stay', label: 'Stay home', hint: 'Safe. You miss a real one.' },
    ],
    due: s => s.disaster.kind === 'cyberattack' && daysSince(s) >= 3 && s.clock.t >= s.disaster.hitAt,
    answer: (s, o, r) => {
      const h = hear(s, RUMOR_PLAN[0]);
      if (o === 'stay') return outcome('You stay', 'You hear the next day that it was ' + (h.truth ? 'real: the line went round the fairground.' : 'a trap.'), h.truth ? 'mixed' : 'good');
      if (o === 'verify') {
        h.status = h.truth ? 'confirmed' : 'false';
        return h.truth ? outcome('Confirmed', 'The county net says the fairgrounds are real. You drive out and fill a cart.', 'good', ['Confirmed on the net.', 'You come back with two cases of canned food.']) : outcome('False', 'Three stations on the net say there is nothing at the fairgrounds. A forged alert.', 'good');
      }
      s.stock.fuel = Math.max(0, s.stock.fuel - 1);
      if (h.truth) { s.stock.canned += 2; h.status = 'confirmed'; return outcome('It was real', 'A line of cars and a county truck handing out water and food.', 'good'); }
      h.status = 'false';
      if (r() < 0.4) { const ps = s.personState.find(p => p.needs.died == null); if (ps) ps.needs.hurt.push({ what: 'an ambush on the county road', sev: 30 }); return outcome('An ambush', 'Two men and a pickup across the road. You drove away, but someone was hurt.', 'bad'); }
      return outcome('Nothing there', 'An empty lot and a can of fuel gone.', 'bad');
    },
  },
];

export const goals: Goal[] = [
  { id: 'cy_well', text: 'Have a manual path to water (override, spare controller or hand pump)', by: 0, done: s => wellSafe(s) || !s.structures.some(st => st.kind === 'well_drilled' && isFinished(st)) },
  { id: 'cy_cash', text: 'Spend the small bills on staples and fuel inside the cash window', by: 3, done: s => s.stock.staples >= 3 && s.stock.fuel >= 6 },
  { id: 'cy_ham', text: 'Check a rumor on the ham net before acting on it', by: 5, done: s => (s.radio?.heard ?? []).some(h => h.status === 'confirmed' || h.status === 'false') },
  { id: 'cy_water', text: 'Be ready to boil water: the plant dosing is uncertain for a week or two', by: 3, done: s => s.stock.water_filter >= 1 || s.utilities.storedL > 500 },
  { id: 'cy_week', text: 'Reach day 7 with fuel for a month', by: 7, done: s => s.stock.fuel >= 6 },
];

export const fx: KindFx = {
  legacy: { economy: 'finance.ts: the market crash (20%)' },
  onWarning: () => ['A ransomware attack shut a county hospital. A pipeline operator reports "an incident". Cards fail at the farm store: cash only.'],
  onHit: s => cyberStrike(s, mulberry32(s.seed * 3571 + 7)),
  daily: (s, ctx) => cyberRestore(s, ctx.day),
  priceMods: s => (s.clock.t < s.disaster.hitAt ? (s.clock.t >= s.disaster.warnAt && s.disaster.hitAt - s.clock.t < 7 ? 1.05 : 1) : cyberPrice(daysSince(s))),
  serviceMods: s => {
    const d = daysSince(s), f = flicker(s.seed % 97, d);
    return d < 30 ? { grid: f, phone: f, banks: f } : {};
  },
  encounterWeights: (s, mix) => { const d = daysSince(s); if (d < 30) mix.scale('refugees', 0.5); if (d < 14) mix.scale('break_in', 1.5); },
  oasisWeight: s => (daysSince(s) < 60 ? 0.1 : 0),
  radioBulletins: (s, ctx) => {
    const p = nextRumor(s, ctx.day);
    if (p) { hear(s, p); cyberOf(s).announced.push(p.id); return { text: p.text, tone: p.kind === 'checkpoint' ? 3 : 2 }; }
    if (ctx.day <= 1) return { text: 'multiple outages; officials say the cause is under investigation. Banks advise customers to use cash.', tone: 2 };
    if (ctx.day >= 10 && ctx.day < 13) return { text: 'the government attributes the attack to a foreign state; no retaliation announced.', tone: 1 };
    return null;
  },
};
