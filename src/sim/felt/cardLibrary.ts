/**
 * FL4: the generic decision-card library (docs/FELT_LAYER.md section 5.4). Every kind gets cards from here unless its own FeltSpec carries
 * `cards`, so the per-kind content packages never collide with this file. A card is built from a compact option definition: one place
 * says what it costs, what it does, and how likely the bad branch is, and both the display (cost chips, "about 7 in 10") and `apply`
 * read it. Money buys speed and safety; the poor pay in hours and risk; one option in most cards trades on neighbors or humanity.
 */
import type { GameState } from '../state';
import { feltDay } from './state';
import type { Cost, DecisionCard, DecisionOption, FeltKind } from './types';
import { adultsOf, applyFx, badChance, homeNeighbors, householdSize as N, r25, type Fx } from './cardFx';

type Fxs = Fx[] | ((s: GameState) => Fx[]);
const fxs = (f: Fxs | undefined, s: GameState): Fx[] => (!f ? [] : typeof f === 'function' ? f(s) : f);

interface OptDef {
  id: string; label: string; hint: string;
  cost?: (s: GameState) => Cost;
  /** Effects that always happen. */
  now?: Fxs;
  /** The chance the bad branch happens (before difficulty and crew), with its two lines and effects; `win` runs otherwise. */
  risk?: { p: number; good: string; bad: string; win?: Fxs; lose?: Fxs };
  /** The log line when it is chosen. */
  line: string;
  off?: (s: GameState) => string | null;
}

function opt(d: OptDef): DecisionOption {
  return {
    id: d.id, label: d.label, hint: () => d.hint, cost: s => d.cost?.(s) ?? {},
    ...(d.risk ? { odds: (s: GameState) => ({ p: 1 - badChance(s, d.risk!.p), good: d.risk!.good, bad: d.risk!.bad }) } : {}),
    ...(d.off ? { off: d.off } : {}),
    apply(s, r) {
      const out = [d.line];
      const note = (f: Fx) => { const l = applyFx(s, f, r); if (l) out.push(l); };
      for (const f of fxs(d.now, s)) note(f);
      if (d.risk) {
        const bad = r() < badChance(s, d.risk.p);
        out.push(bad ? d.risk.bad : d.risk.good);
        for (const f of fxs(bad ? d.risk.lose : d.risk.win, s)) note(f);
      }
      return out;
    },
  };
}

const noNeighbors = (s: GameState) => (homeNeighbors(s).length ? null : 'No neighbor is home to ask.');
const hurtOne = (what: string, sev: number): Fx => ({ k: 'hurt', what, sev });

export type Theme = 'blackout' | 'sickness' | 'shock' | 'order' | 'hunger' | 'fallout' | 'money' | 'unknown';
export const THEME: Record<FeltKind, Theme> = {
  grid_down: 'blackout', solar_flare: 'blackout', emp: 'blackout', cyberattack: 'blackout', satellite_loss: 'blackout',
  pandemic: 'sickness', bioweapon: 'sickness', livestock_plague: 'sickness',
  mega_quake: 'shock', dam_flood: 'shock', wildfire: 'shock', supervolcano: 'shock',
  lawless: 'order', civil_war: 'order', invasion: 'order', zombies: 'order', cult_takeover: 'order',
  drought: 'hunger', crop_blight: 'hunger', ash_winter: 'hunger', global_famine: 'hunger', water_war: 'hunger', asteroid: 'hunger',
  nuclear: 'fallout', reactor_meltdown: 'fallout',
  financial: 'money', oil_shock: 'money', mass_exodus: 'money',
  unknown: 'unknown',
};

/** The hit-day card that belongs to the kind of trouble (one per theme). */
function signature(kind: FeltKind): Omit<DecisionCard, 'id'> {
  const base = { phase: 'hit' as const, when: (s: GameState) => feltDay(s) >= 0 && feltDay(s) <= 5 };
  switch (THEME[kind]) {
    case 'blackout': return { ...base, title: () => 'Protect what still works', text: () => 'Chargers, radios and the inverter are the difference between a dark house and a working one, and whatever did this can reach them again.', fallback: 'rest',
      options: [
        opt({ id: 'buy', label: 'Buy shielded cases and spares', hint: 'A metal-lined box, spare chargers and a stack of batteries. Nearly sure to work.', cost: () => ({ money: 450 }), now: [{ k: 'stock', id: 'batteries', n: 6 }, { k: 'stock', id: 'radios', n: 1 }], risk: { p: 0.08, good: 'The spares are boxed and tested.', bad: 'The box leaks: two batteries were already dead.', lose: [{ k: 'stock', id: 'batteries', n: -2 }] }, line: 'You boxed the electronics.' }),
        opt({ id: 'wrap', label: 'Wrap them yourselves', hint: 'Foil, ammo cans and a long afternoon. Cheap, but you cannot test it.', cost: () => ({ hours: 6 }), risk: { p: 0.35, good: 'Most of it came through the test.', bad: 'Some of it was still plugged in.', win: [{ k: 'stock', id: 'batteries', n: 3 }], lose: [{ k: 'stock', id: 'batteries', n: -3 }] }, line: 'You spent the afternoon wrapping spares.' }),
        opt({ id: 'rest', label: 'Put the time into water and food', hint: 'Skip the electronics. Fill the jugs and sort the pantry.', now: s => [{ k: 'stock', id: 'water_jugs', n: 2 }, { k: 'stock', id: 'canned', n: N(s) }], risk: { p: 0.45, good: 'Nothing else broke.', bad: 'An unplugged radio is dead.', lose: [{ k: 'stock', id: 'batteries', n: -2 }] }, line: 'You put the day into water and food.' }),
      ] };
    case 'sickness': return { ...base, title: () => 'Keep the sickness out', text: () => 'Everyone is asking how far the gate should open. Whatever you decide, the household lives with it for weeks.', fallback: 'seal',
      options: [
        opt({ id: 'buy', label: 'Buy masks, tests and a clinic visit', hint: 'Money buys information and supplies. It also buys you a nurse\'s advice.', cost: s => ({ money: r25(200 + N(s) * 120) }), now: [{ k: 'stock', id: 'meds', n: 2 }, { k: 'stock', id: 'ors', n: 2 }], risk: { p: 0.1, good: 'The tests are clean.', bad: 'A test missed it: someone has a fever.', lose: [{ k: 'fever' }] }, line: 'You stocked up on tests and masks.' }),
        opt({ id: 'seal', label: 'Seal the gate: no one in, no one out', hint: 'Safest, hard on the neighbors and on morale. They will remember who shut the gate.', cost: () => ({ hours: 8, humanity: 2, standing: 4 }), now: [{ k: 'raidDelay', days: 4 }, { k: 'morale', n: -2 }], risk: { p: 0.12, good: 'Nobody came down with it.', bad: 'It got in anyway.', lose: [{ k: 'fever' }] }, line: 'You sealed the gate.' }),
        opt({ id: 'open', label: 'Carry on, wash up and watch', hint: 'Life stays normal and neighbors keep coming by. A cough in the house is likely.', now: [{ k: 'morale', n: 3 }, { k: 'standing', n: 2 }], risk: { p: 0.45, good: 'Everyone stayed well.', bad: 'Someone caught it.', lose: [{ k: 'fever' }] }, line: 'You kept the gate open and kept watch.' }),
      ] };
    case 'shock': return { ...base, title: () => 'The place after the shock', text: () => 'Something moved, burned or washed away. Roofs, walls and stores need a hard look before dark.', fallback: 'camp',
      options: [
        opt({ id: 'crew', label: 'Hire a crew to shore up and tarp', hint: 'Quick and mostly safe. A contractor with a truck will take cash.', cost: s => ({ money: r25(600 + N(s) * 100) }), now: [{ k: 'stock', id: 'lumber', n: 2 }, { k: 'stock', id: 'roofing', n: 1 }, { k: 'morale', n: 3 }], risk: { p: 0.1, good: 'The crew finished before dark.', bad: 'A ladder slipped on the last roof.', lose: [hurtOne('a sprained ankle', 15)] }, line: 'A hired crew tarped and braced the place.' }),
        opt({ id: 'diy', label: 'Shore up and patch it yourselves', hint: 'Free in cash, heavy on hours, and a bad place to be careless.', cost: () => ({ hours: 10 }), now: [{ k: 'stock', id: 'hardware', n: 1 }], risk: { p: 0.35, good: 'It holds.', bad: 'A beam shifted.', win: [{ k: 'stock', id: 'lumber', n: 1 }], lose: [hurtOne('a crushed hand', 25)] }, line: 'You braced the place by hand.' }),
        opt({ id: 'camp', label: 'Sleep outside until it is checked', hint: 'Nobody is under a bad roof tonight. Everyone is cold and short-tempered.', now: [{ k: 'morale', n: -4 }], risk: { p: 0.25, good: 'A dry, quiet night.', bad: 'A cold night.', lose: [hurtOne('a chest cold', 10)] }, line: 'You slept outside.' }),
      ] };
    case 'order': return { ...base, title: () => 'Who holds the road', text: () => 'There is nobody to call. Whoever controls the road to your gate decides who gets to you first.', fallback: 'neighbors',
      options: [
        opt({ id: 'hire', label: 'Hire armed men for two weeks', hint: 'Cash for visible force. The word gets round.', cost: s => ({ money: r25(900 + N(s) * 100) }), now: [{ k: 'raidDelay', days: 10 }, { k: 'respect', n: 0.15 }], risk: { p: 0.12, good: 'They held the road.', bad: 'They walked off after a week.', lose: [{ k: 'raidDelay', days: -4 }] }, line: 'You hired men for the road.' }),
        opt({ id: 'barricade', label: 'Barricade the drive and stand watch', hint: 'Lumber and long nights. Tired people make mistakes.', cost: () => ({ hours: 14, stock: { lumber: 2 } }), now: [{ k: 'raidDelay', days: 5 }, { k: 'respect', n: 0.1 }], risk: { p: 0.3, good: 'The watch held.', bad: 'A tired guard took a fall.', lose: [hurtOne('a fall on the watch', 20)] }, line: 'You barricaded the drive.' }),
        opt({ id: 'neighbors', label: 'Raise a joint roadblock with the neighbors', hint: 'Shared work, shared risk. It works only if they show up.', cost: () => ({ hours: 6 }), off: noNeighbors, now: [{ k: 'raidDelay', days: 6 }, { k: 'respect', n: 0.1 }, { k: 'standing', n: 6 }], risk: { p: 0.3, good: 'The block holds.', bad: 'It fell apart over who stands where.', lose: [{ k: 'standing', n: -9 }] }, line: 'You raised a roadblock with the neighbors.' }),
      ] };
    case 'hunger': return { ...base, title: () => 'The numbers on the shelf', text: () => 'Count the cans. The stores will not be what they were, and everyone nearby is counting too.', fallback: 'pool',
      options: [
        opt({ id: 'buy', label: 'Buy what is left, at the inflated price', hint: 'Paying twice list buys a pantry shelf now.', cost: s => ({ money: r25(N(s) * 300) }), now: s => [{ k: 'stock', id: 'staples', n: N(s) * 6 }, { k: 'stock', id: 'canned', n: N(s) * 3 }], risk: { p: 0.1, good: 'It all keeps.', bad: 'A case had gone off.', lose: [{ k: 'stock', id: 'canned', n: -2 }] }, line: 'You bought what was left.' }),
        opt({ id: 'forage', label: 'Forage, trap and trade labor', hint: 'Leaves cash alone, takes days and shoe leather.', cost: () => ({ hours: 10 }), risk: { p: 0.35, good: 'You came home with food.', bad: 'Little found, and a bad fall.', win: s => [{ k: 'stock', id: 'canned', n: N(s) * 4 }], lose: [hurtOne('a bad fall', 15)] }, line: 'You spent days foraging.' }),
        opt({ id: 'pool', label: 'Pool with the neighbors: a shared kitchen', hint: 'You put in some cans. Everyone eats better, and they owe you.', cost: s => ({ stock: { canned: N(s) * 2 } }), off: noNeighbors, now: [{ k: 'standing', n: 6 }, { k: 'humanity', n: 2 }, { k: 'morale', n: 5 }], line: 'You started a shared kitchen.' }),
      ] };
    case 'fallout': return { ...base, title: () => 'How long to stay sealed', text: () => 'The air outside is not the air you remember. Every trip out costs something you cannot see.', fallback: 'sealed',
      options: [
        opt({ id: 'buy', label: 'Buy potassium iodide and a meter, then go out carefully', hint: 'Knowing where it is bad is half of staying safe.', cost: s => ({ money: r25(250 + N(s) * 80) }), now: s => [{ k: 'stock', id: 'potassium_iodide', n: N(s) }, { k: 'stock', id: 'geiger_counter', n: 1 }], line: 'You bought pills and a meter.' }),
        opt({ id: 'sealed', label: 'Stay sealed for two full weeks', hint: 'Eats the pantry and tempers, but nobody is exposed.', cost: s => ({ stock: { canned: N(s) * 2 } }), now: [{ k: 'morale', n: -6 }, { k: 'raidDelay', days: 6 }], line: 'You stayed sealed in.' }),
        opt({ id: 'dash', label: 'Make short dashes outside for water and wood', hint: 'Fast and cheap. Each dash is a dose.', cost: () => ({ hours: 6 }), now: [{ k: 'stock', id: 'water_jugs', n: 2 }, { k: 'stock', id: 'firewood', n: 2 }], risk: { p: 0.4, good: 'You kept clear of the hot spots.', bad: 'You walked through the worst of it.', lose: [{ k: 'dose', n: 0.2 }] }, line: 'You made quick runs outside.' }),
      ] };
    case 'money': return { ...base, title: () => 'Cash is losing its meaning', text: () => 'Prices change by the hour. Whatever you decide to do with your money, decide before noon.', fallback: 'hold',
      options: [
        opt({ id: 'convert', label: 'Turn cash into food and fuel now', hint: 'You will have less money and more to live on.', cost: s => ({ money: r25(N(s) * 400) }), now: s => [{ k: 'stock', id: 'canned', n: N(s) * 5 }, { k: 'stock', id: 'fuel', n: 2 }], line: 'You spent cash on food and fuel.' }),
        opt({ id: 'barter', label: 'Offer labor and skills for goods', hint: 'A week of work for staples. People remember who pays and who cheats.', cost: () => ({ hours: 10 }), now: s => [{ k: 'stock', id: 'staples', n: N(s) * 3 }], risk: { p: 0.25, good: 'A fair deal.', bad: 'They shorted you.', lose: [{ k: 'standing', n: -3 }] }, line: 'You traded labor for goods.' }),
        opt({ id: 'hold', label: 'Hold the cash and metals', hint: 'Costs nothing today. If the money dies, so does some of yours.', now: [{ k: 'morale', n: 2 }], risk: { p: 0.5, good: 'Your money kept its value.', bad: 'The money lost a chunk of its worth.', lose: s => [{ k: 'money', n: -Math.round(s.money * 0.15) }] }, line: 'You held onto your cash.' }),
      ] };
    case 'unknown': return { ...base, title: () => 'The empty houses', text: () => 'Neighbors are gone, doors open, trucks still in the drive. Nobody can tell you where they went.', fallback: 'lock',
      options: [
        opt({ id: 'search', label: 'Search the empty houses', hint: 'Food and fuel are sitting there. So is whatever took them.', cost: () => ({ hours: 6, humanity: 2 }), now: s => [{ k: 'stock', id: 'canned', n: N(s) * 2 }, { k: 'stock', id: 'meds', n: 1 }, { k: 'stock', id: 'fuel', n: 1 }], risk: { p: 0.3, good: 'Nothing was wrong inside.', bad: 'Something was wrong in the second house.', lose: [{ k: 'morale', n: -5 }, hurtOne('a bad scare', 10)] }, line: 'You searched the empty houses.' }),
        opt({ id: 'lock', label: 'Lock up and leave them alone', hint: 'Safe, quiet and a little ashamed.', now: [{ k: 'raidDelay', days: 2 }, { k: 'morale', n: -2 }], line: 'You left the houses alone.' }),
        opt({ id: 'call', label: 'Drive out to the county for help', hint: 'It costs a tank of fuel and may find nobody at all.', cost: () => ({ stock: { fuel: 1 } }), now: [{ k: 'humanity', n: 3 }], risk: { p: 0.5, good: 'Someone took a report.', bad: 'Nobody answered.', win: [{ k: 'standing', n: 3 }], lose: [{ k: 'morale', n: -3 }] }, line: 'You drove out looking for help.' }),
      ] };
  }
}

/** Cards every kind shares: the first night, a neighbor at the door, the watch, hunger, heat, illness, the pact, planting, a stranger, year two. */
function shared(): Array<Omit<DecisionCard, 'id'>> {
  const d = feltDay;
  const sick = (s: GameState) => adultsOf(s).concat(s.personState.map((ps, i) => ({ ps, p: s.people[i] })).filter(x => x.p?.kid && x.ps.needs.died == null)).some(x => x.ps.needs.hurt.length > 0 || x.ps.needs.health < 80);
  return [
    { phase: 'hit', when: s => d(s) >= 1 && d(s) <= 6, title: () => 'The first night', fallback: 'hold',
      text: () => 'The stores are mobbed, the road is strange and the children are asking what happens now.',
      options: [
        opt({ id: 'buy', label: 'Buy up what is left in town', hint: 'Cash gets you to the front of a bad line.', cost: s => ({ money: r25(100 + N(s) * 300) }), now: s => [{ k: 'stock', id: 'canned', n: N(s) * 4 }, { k: 'stock', id: 'staples', n: N(s) * 3 }, { k: 'stock', id: 'fuel', n: 1 }], risk: { p: 0.1, good: 'You were in and out.', bad: 'The line turned ugly.', lose: [{ k: 'morale', n: -3 }] }, line: 'You bought what you could in town.' }),
        opt({ id: 'scavenge', label: 'Send someone scavenging nearby', hint: 'Slower and riskier, no cash needed.', cost: () => ({ hours: 8 }), now: [{ k: 'stock', id: 'meds', n: 1 }], risk: { p: 0.3, good: 'A good haul.', bad: 'A bad fall on the way.', win: s => [{ k: 'stock', id: 'canned', n: N(s) * 3 }], lose: [hurtOne('a bad fall', 20)] }, line: 'You sent a scavenger out.' }),
        opt({ id: 'hold', label: 'Stay put and eat from the pantry', hint: 'Quiet and free. You sleep, and you are not ahead.', now: [{ k: 'raidDelay', days: 2 }, { k: 'morale', n: 2 }], risk: { p: 0.15, good: 'A quiet night.', bad: 'Noise on the road at night.', lose: [{ k: 'morale', n: -3 }] }, line: 'You stayed home.' }),
      ] },
    { phase: 'hit', when: s => d(s) >= 3 && d(s) <= 7 && homeNeighbors(s).length > 0, title: () => 'A neighbor at the fence', fallback: 'barter',
      text: s => { const n = homeNeighbors(s).sort((a, b) => a.km - b.km)[0]; return `${n ? n.name[0].toUpperCase() + n.name.slice(1) : 'A neighbor'} come to the fence. They are low on food and do not want to ask.`; },
      options: [
        opt({ id: 'share', label: 'Share some of your stores', hint: 'They will not forget it.', cost: () => ({ stock: { canned: 4 } }), now: [{ k: 'standing', n: 8 }, { k: 'humanity', n: 3 }], line: 'You shared food over the fence.' }),
        opt({ id: 'barter', label: 'Trade fairly: wood for what you can spare', hint: 'An honest trade, if they hold up their end.', cost: () => ({ hours: 3 }), risk: { p: 0.4, good: 'A fair trade.', bad: 'They shorted you and you let it go.', win: [{ k: 'stock', id: 'firewood', n: 3 }, { k: 'standing', n: 2 }], lose: [{ k: 'standing', n: -3 }] }, line: 'You traded across the fence.' }),
        opt({ id: 'refuse', label: 'Tell them you have nothing to spare', hint: 'Your stores stay full. You do not feel good about it.', cost: () => ({ humanity: 3, standing: 6 }), now: [{ k: 'respect', n: 0.05 }, { k: 'raidDelay', days: 2 }], line: 'You sent them away.' }),
      ] },
    { phase: 'hit', when: s => d(s) >= 5 && d(s) <= 7, title: () => 'Who keeps watch', fallback: 'dark',
      text: () => 'Nobody has slept well. Somebody has to be awake at the gate.',
      options: [
        opt({ id: 'patrol', label: 'Pay for a night patrol', hint: 'Cash keeps you asleep.', cost: () => ({ money: 500 }), now: [{ k: 'raidDelay', days: 8 }, { k: 'respect', n: 0.1 }], risk: { p: 0.08, good: 'The patrol was reliable.', bad: 'The patrol skipped a night.', lose: [{ k: 'raidDelay', days: -2 }] }, line: 'You hired a patrol.' }),
        opt({ id: 'shifts', label: 'Take shifts yourselves', hint: 'Long nights, short tempers.', cost: () => ({ hours: 16 }), now: [{ k: 'raidDelay', days: 5 }], risk: { p: 0.3, good: 'Nothing slipped by.', bad: 'A guard nodded off and took a fall.', lose: [hurtOne('a fall on the watch', 15)] }, line: 'You took the night in shifts.' }),
        opt({ id: 'dark', label: 'Lights out, no smoke, keep quiet', hint: 'Nothing for anyone to see. Nothing for you to see either.', now: [{ k: 'blackout' }, { k: 'raidDelay', days: 3 }], risk: { p: 0.3, good: 'Nobody came by.', bad: 'Not knowing was worse than watching.', lose: [{ k: 'morale', n: -4 }] }, line: 'You went dark at night.' }),
      ] },
    { phase: 'month', when: s => d(s) >= 8, title: () => 'The pantry is thinning', fallback: 'hunt',
      text: () => 'You are eating from the back of the shelf. A month in, nobody pretends it is temporary.',
      options: [
        opt({ id: 'buy', label: 'Pay black-market prices', hint: 'Dear, but it arrives.', cost: s => ({ money: r25(N(s) * 450) }), now: s => [{ k: 'stock', id: 'staples', n: N(s) * 6 }], risk: { p: 0.1, good: 'It was good grain.', bad: 'Part of it was bad.', lose: [{ k: 'stock', id: 'canned', n: -2 }] }, line: 'You paid black-market prices for food.' }),
        opt({ id: 'hunt', label: 'Hunt, fish and forage', hint: 'It costs days and only partly works.', cost: () => ({ hours: 14 }), risk: { p: 0.35, good: 'A hard week with something to show for it.', bad: 'A week of nothing and a hurt back.', win: s => [{ k: 'stock', id: 'canned', n: N(s) * 4 }], lose: [hurtOne('a wrenched back', 15)] }, line: 'You hunted and foraged.' }),
        opt({ id: 'share', label: 'Cook together with the neighbors', hint: 'One big pot instead of five small ones.', cost: s => ({ stock: { canned: N(s) * 2 } }), off: noNeighbors, now: [{ k: 'standing', n: 6 }, { k: 'humanity', n: 2 }, { k: 'morale', n: 5 }], line: 'You cooked with the neighbors.' }),
      ] },
    { phase: 'month', when: s => d(s) >= 12 && sick(s), title: () => 'Someone is hurt or ill', fallback: 'rest',
      text: () => 'The clinic is overrun or gone. Somebody in the house is not getting better.',
      options: [
        opt({ id: 'nurse', label: 'Pay for a clinic visit or a nurse', hint: 'A real exam. It costs.', cost: s => ({ money: r25(500 + N(s) * 50) }), now: [{ k: 'health', n: 25, who: 'one' }], risk: { p: 0.1, good: 'It is under control.', bad: 'The nurse could not do much.', lose: [{ k: 'health', n: -5, who: 'one' }] }, line: 'You paid for a nurse.' }),
        opt({ id: 'home', label: 'Treat them at home', hint: 'Use your own medicine and a few hours.', cost: () => ({ stock: { meds: 1 }, hours: 4 }), now: [{ k: 'health', n: 15, who: 'one' }], risk: { p: 0.35, good: 'It is going the right way.', bad: 'A complication.', lose: [{ k: 'health', n: -10, who: 'one' }] }, line: 'You treated them at home.' }),
        opt({ id: 'rest', label: 'Rest and wait it out', hint: 'Nothing used. Some people do not recover alone.', now: [{ k: 'health', n: 6, who: 'one' }], risk: { p: 0.4, good: 'Rest was enough.', bad: 'It got worse.', lose: [{ k: 'health', n: -16, who: 'one' }] }, line: 'You waited it out.' }),
      ] },
    { phase: 'month', when: s => d(s) >= 16, title: () => 'Heat and light for the cold months', fallback: 'huddle',
      text: () => 'The woodpile looks smaller than it did, and nobody can say when the lights come back.',
      options: [
        opt({ id: 'buy', label: 'Buy fuel and wood', hint: 'A delivered load, no sweat.', cost: s => ({ money: r25(200 + N(s) * 150) }), now: [{ k: 'stock', id: 'firewood', n: 6 }, { k: 'stock', id: 'fuel', n: 2 }], line: 'You bought fuel and wood.' }),
        opt({ id: 'cut', label: 'Cut and split your own', hint: 'A cord of wood is a week of work, and an axe is not forgiving.', cost: () => ({ hours: 16 }), now: [{ k: 'stock', id: 'firewood', n: 8 }], risk: { p: 0.3, good: 'The woodpile is up.', bad: 'The axe slipped.', lose: [hurtOne('a gashed leg', 20)] }, line: 'You cut and split wood.' }),
        opt({ id: 'huddle', label: 'Heat one room and crowd in', hint: 'Saves wood and costs patience.', now: [{ k: 'stock', id: 'firewood', n: 3 }, { k: 'morale', n: -4 }], risk: { p: 0.42, good: 'Everyone stayed warm enough.', bad: 'A chest cold went round.', lose: [hurtOne('a chest cold', 10)] }, line: 'You heated one room.' }),
      ] },
    { phase: 'season', when: s => d(s) >= 36 && homeNeighbors(s).length > 0, title: () => 'A watch among neighbors', fallback: 'alone',
      text: () => 'The county is on its own now. The neighbors want to know who is in and who is out.',
      options: [
        opt({ id: 'join', label: 'Join the neighbors\' watch', hint: 'Your hours, their trust.', cost: () => ({ hours: 12 }), now: [{ k: 'standing', n: 8 }, { k: 'respect', n: 0.12 }, { k: 'raidDelay', days: 10 }], risk: { p: 0.2, good: 'It works.', bad: 'Hard feelings over the schedule.', lose: [{ k: 'standing', n: -4 }] }, line: 'You joined the watch.' }),
        opt({ id: 'lead', label: 'Organize and equip it yourselves', hint: 'You buy the radios, flashlights and the first month of coffee.', cost: () => ({ money: 700 }), now: [{ k: 'standing', n: 14 }, { k: 'humanity', n: 2 }, { k: 'respect', n: 0.2 }, { k: 'raidDelay', days: 14 }], risk: { p: 0.1, good: 'The watch runs well.', bad: 'Somebody took a radio and left.', lose: [{ k: 'stock', id: 'radios', n: -1 }] }, line: 'You organized the watch.' }),
        opt({ id: 'alone', label: 'Keep your distance', hint: 'Your own schedule. Their opinion of you.', cost: () => ({ standing: 4 }), risk: { p: 0.3, good: 'Nothing came of it.', bad: 'They stopped warning you.', lose: [{ k: 'raidDelay', days: -5 }] }, line: 'You stayed out of it.' }),
      ] },
    { phase: 'season', when: s => d(s) >= 40, title: () => 'Planting season', fallback: 'save',
      text: () => 'If you do not plant, you do not eat next winter.',
      options: [
        opt({ id: 'buy', label: 'Buy seed and rent a tiller', hint: 'Sure seed, sure start.', cost: s => ({ money: r25(150 + N(s) * 120) }), now: s => [{ k: 'stock', id: 'seed', n: N(s) * 2 }], line: 'You bought seed.' }),
        opt({ id: 'save', label: 'Plant what you saved', hint: 'Old seed and your own hours.', cost: () => ({ hours: 14 }), now: s => [{ k: 'stock', id: 'seed', n: N(s) }], risk: { p: 0.35, good: 'Most of it came up.', bad: 'Poor germination.', lose: s => [{ k: 'stock', id: 'seed', n: -Math.ceil(N(s) / 2) }] }, line: 'You planted your saved seed.' }),
        opt({ id: 'swap', label: 'Swap with a seed-saving neighbor', hint: 'Cans for seed, and a friend.', cost: () => ({ stock: { canned: 3 } }), off: noNeighbors, now: s => [{ k: 'stock', id: 'seed', n: N(s) * 2 }, { k: 'standing', n: 4 }], line: 'You swapped for seed.' }),
      ] },
    { phase: 'season', when: s => d(s) >= 50, title: () => 'A hurt stranger on the road', fallback: 'feed',
      text: () => 'A man sits by the ditch with a bad leg. He says he is walking to his sister\'s. He might be telling the truth.',
      options: [
        opt({ id: 'take', label: 'Bring him in', hint: 'A bed and a bandage. Hard to say who he really is.', cost: () => ({ stock: { meds: 1 }, hours: 3 }), now: [{ k: 'humanity', n: 8 }], risk: { p: 0.2, good: 'He is who he said.', bad: 'He was scouting.', lose: [{ k: 'raidDelay', days: -5 }, { k: 'stock', id: 'canned', n: -2 }] }, line: 'You brought him in.' }),
        opt({ id: 'feed', label: 'Leave food and water at the gate', hint: 'Help without opening up.', cost: () => ({ stock: { canned: 2 } }), now: [{ k: 'humanity', n: 3 }], line: 'You left food at the gate.' }),
        opt({ id: 'pass', label: 'Drive on', hint: 'You are done for the day, and so is he.', cost: () => ({ humanity: 5 }), now: [{ k: 'raidDelay', days: 1 }], line: 'You drove on.' }),
      ] },
    { phase: 'year', when: s => d(s) >= 121, title: () => 'Another winter coming', fallback: 'improvise',
      text: () => 'You are a year in, give or take. Everybody is worn.',
      options: [
        opt({ id: 'invest', label: 'Spend on repairs and comforts', hint: 'Cash buys morale.', cost: s => ({ money: r25(N(s) * 400) }), now: [{ k: 'morale', n: 10 }, { k: 'stock', id: 'hardware', n: 2 }], line: 'You spent on repairs and comforts.' }),
        opt({ id: 'improvise', label: 'Make do with what you have', hint: 'Mend it with your hands.', cost: () => ({ hours: 12 }), now: [{ k: 'morale', n: 3 }, { k: 'stock', id: 'hardware', n: 1 }], risk: { p: 0.3, good: 'It all holds together.', bad: 'A sloppy repair.', lose: [hurtOne('a mashed thumb', 10)] }, line: 'You made do.' }),
        opt({ id: 'supper', label: 'Throw a harvest supper for the district', hint: 'Shared food, shared hope.', cost: s => ({ stock: { canned: N(s) * 2 } }), off: noNeighbors, now: [{ k: 'standing', n: 8 }, { k: 'humanity', n: 4 }, { k: 'morale', n: 6 }], line: 'You threw a supper.' }),
      ] },
  ];
}

const cache = new Map<string, DecisionCard[]>();
/** The generic cards for a kind: its theme's signature card first (it has priority), then the shared ones, ids prefixed with the kind. */
export function genericCards(kind: FeltKind): DecisionCard[] {
  let c = cache.get(kind);
  if (!c) {
    const sig = { ...signature(kind), id: `${kind}:${THEME[kind]}` } as DecisionCard;
    c = [sig, ...shared().map(x => ({ ...x, id: `${kind}:${x.title({} as GameState).toLowerCase().replace(/[^a-z]+/g, '_')}` }) as DecisionCard)];
    cache.set(kind, c);
  }
  return c;
}
