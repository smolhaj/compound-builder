/**
 * The step library for the signature goal chains (docs/FELT_LAYER.md 5.5). Each primitive is one checkable thing about the place: `done` reads the
 * live state (never a click), `act` is a real handler the Build tab's `run` already knows (the same union the day card uses) or null, and the
 * words name the live clock. A kind's chain (goalChains.ts) picks three to five of these and may rewrite their words. Pure.
 */
import { buildOff, type SuggestionAct } from '../guidance';
import { isFinished } from '../construction';
import { tierOf } from '../hardening';
import { operational } from '../operational';
import { radioSet } from '../radio';
import { daysOfFood } from '../needs';
import { waterDaysStored } from '../water';
import { runFinished } from '../perimeter';
import { floodCandidates } from '../terrainFx';
import type { FirstHourGoal } from '../firstHour';
import type { GameState } from '../state';
import { spanText } from '../words';

export type Act = NonNullable<FirstHourGoal['act']>;
export type Words = string | ((s: GameState) => string);

export interface Prim {
  short: string; title: string;
  line(s: GameState): string; why: Words; done(s: GameState): boolean;
  act(s: GameState): Act | null;
  reward: { title: string; line: string };
  pace?(s: GameState): string | null;
}
export type PrimId =
  | 'breakers' | 'cage' | 'spares' | 'radio' | 'dark' | 'cellar' | 'shelter' | 'defended' | 'watch' | 'pact' | 'cash' | 'metals' | 'trade'
  | 'filters' | 'iodine' | 'sandbags' | 'highStore' | 'repairs' | 'water' | 'cistern' | 'food30' | 'food90' | 'fuel' | 'firewood' | 'meds'
  | 'bugout' | 'seed' | 'coldCrops' | 'firebreak' | 'tents';

const n = (s: GameState, m: string): number => Math.floor((s.stock as unknown as Record<string, number>)[m] ?? 0);
const fin = (s: GameState, kinds: (k: string) => boolean): boolean => s.structures.some(st => !st.unplaced && isFinished(st) && kinds(st.kind));
const rich = (s: GameState): boolean => s.money >= 2500;
const usd = (x: number) => '$' + Math.round(x).toLocaleString('en-US');
const shop = (label: string, tab: string): Act => ({ label, act: { type: 'shop', tab } });
const open = (label: string, right: Extract<SuggestionAct, { type: 'open' }>['right'], supplies?: 'stores' | 'farm'): Act => ({ label, act: { type: 'open', right, ...(supplies ? { supplies } : {}) } });
const stake = (s: GameState, kind: string, label: string): Act => { const off = buildOff(s, kind); return { label, act: { type: 'stake', kind }, ...(off ? { off: off[0].toUpperCase() + off.slice(1) } : {}) }; };

/** How far off the hit is, in words: the warning clock before it, the day count after. */
export function clockWords(s: GameState): string {
  const d = s.disaster, t = s.clock.t;
  if (t < d.hitAt) return `Impact is in ${spanText(Math.max(1, Math.ceil(d.hitAt - t)))}.`;
  return `It is day ${Math.max(0, Math.floor(t - d.hitAt))} since it hit.`;
}
const poorTail = (s: GameState, cheap: string): string | null => (rich(s) ? null : `Cash is ${usd(s.money)}: ${cheap}`);
const have = (x: number, want: number, noun: string): string => (x >= want ? `${x} ${noun}: enough` : `${x} of ${want} ${noun}`);

export const PRIMS: Record<PrimId, Prim> = {
  breakers: {
    short: 'Breakers', title: 'Shut off the lines', line: s => (s.utilities.off.length ? `${s.utilities.off.length} buildings off at the breaker` : 'Every breaker is still on'),
    why: 'Long lines are antennas: a surge or a rupture runs down them and into the house. Throw the breakers and the gas and water valves before it does.',
    done: s => s.utilities.off.length >= 1, act: () => open('Open Utilities and switch buildings off', 'utilities'),
    reward: { title: 'Lines are cold', line: 'Nothing is plugged into the county now: a surge or a broken main has nowhere to go.' },
  },
  cage: {
    short: 'Faraday box', title: 'Build a Faraday box for the spares', line: s => (fin(s, k => k.startsWith('bunker_') || k === 'workshop') ? 'A room is built; it has no cage yet' : 'No cage anywhere'),
    why: 'A grounded metal box shields what is inside from the pulse and the surge. Electronics left on the bench are the ones that burn.',
    done: s => s.structures.some(st => isFinished(st) && tierOf(st, 'faraday') >= 1),
    act: s => { const room = s.structures.find(st => isFinished(st) && st.kind.startsWith('bunker_')); return room ? open('Open Defense and order the cage fitting', 'defense') : (rich(s) ? shop('Buy Faraday mesh', 'bunker') : open('Open Defense (a cage can be fitted to any bunker room)', 'defense')); },
    pace: s => poorTail(s, 'a mesh cage is the cheap tier; an ammo can lined with foil is only a stopgap.'),
    reward: { title: 'The box is shut', line: 'The cage will carry what is in it through a pulse: the next electronics are safe.' },
  },
  spares: {
    short: 'Spares', title: 'Put the spares in the box', line: s => `${n(s, 'inverter') + n(s, 'battery') + n(s, 'radios') + n(s, 'sw_radio') + n(s, 'ham_rig')} spare electronics on hand`,
    why: 'An inverter, a charger and a radio in the box are worth more than a month of food once the grid and the shops are gone.',
    done: s => s.structures.some(st => isFinished(st) && tierOf(st, 'faraday') >= 1) && n(s, 'inverter') + n(s, 'battery') + n(s, 'radios') + n(s, 'sw_radio') + n(s, 'ham_rig') >= 1,
    act: s => (rich(s) ? shop('Buy a spare inverter and a radio', 'power') : open('Check the stores for spares', 'supplies', 'stores')),
    pace: s => poorTail(s, 'one cheap handheld radio and the charger you already own are the spares that matter.'),
    reward: { title: 'Spares are safe', line: 'An inverter and a radio sit in the cage and will survive.' },
  },
  radio: {
    short: 'Radio', title: 'Get a radio that works', line: s => (radioSet(s) === 'none' ? 'No radio on the place' : radioSet(s) === 'ham' ? 'The ham rig is on the air' : 'A shortwave set is on the shelf'),
    why: 'When the phones and the news stop, the radio is the only way to hear what is true and to tell anyone you are alive.',
    done: s => radioSet(s) !== 'none', act: s => shop(rich(s) ? 'Buy a shortwave set' : 'Buy the cheapest shortwave set', 'defense'),
    reward: { title: 'You can hear', line: 'The set picks up the net: news, notices and rumor you can check.' },
  },
  dark: {
    short: 'Lights out', title: 'Go dark and quiet', line: s => (s.opsec?.blackout ? 'Lights are blacked out after dark' : 'The place shows light at night'),
    why: 'A lit window is the first thing anyone sees from the road. Curtains and a lights-out rule cost nothing and cut what the road sees.',
    done: s => !!s.opsec?.blackout, act: () => open('Open Defense and turn on lights-out', 'defense'),
    reward: { title: 'The place goes dark', line: 'At night the compound shows no light to the road.' },
  },
  cellar: {
    short: 'Cellar', title: 'Dig in: a cellar or bunker', line: s => (fin(s, k => k === 'root_cellar' || k.startsWith('bunker_')) ? 'A cellar is dug' : 'Nothing below ground'),
    why: 'Earth is the best wall and the best blanket: a cellar stays cool, keeps stores and is the place to sit out what comes overhead.',
    done: s => fin(s, k => k === 'root_cellar' || k.startsWith('bunker_')), act: s => stake(s, 'root_cellar', 'Stake a root cellar'),
    pace: s => poorTail(s, 'a root cellar is mostly the family\'s own digging.'),
    reward: { title: 'Dug in', line: 'There is a cool, dark place underground for stores and shelter.' },
  },
  shelter: {
    short: 'Shelter', title: 'Get inside a hardened room', line: s => (s.structures.some(st => isFinished(st) && (st.kind.startsWith('bunker_') || tierOf(st, 'fallout') >= 1)) ? 'A hardened room stands' : 'No hardened room yet'),
    why: 'Mass and earth are what stop the fallout and the blast. Thick walls and a door that seals are the whole plan.',
    done: s => s.structures.some(st => isFinished(st) && (st.kind.startsWith('bunker_') || tierOf(st, 'fallout') >= 1)),
    act: s => (s.structures.some(st => isFinished(st) && st.kind.startsWith('bunker_')) ? open('Open Defense and harden a room', 'defense') : stake(s, 'root_cellar', 'Stake a cellar to harden')),
    pace: s => poorTail(s, 'a dug cellar under a foot of earth is the cheapest shelter there is.'),
    reward: { title: 'There is somewhere to go', line: 'A room with mass around it: the family can shelter without leaving the place.' },
  },
  defended: {
    short: 'Defended', title: 'Hold the line', line: s => (operational(s).find(o => o.id === 'defense')?.line ?? 'Not defended'),
    why: 'A place that looks hard is passed over. A fence, a gate and a lookout turn a bad night into a quiet one.',
    done: s => operational(s).find(o => o.id === 'defense')?.done ?? false, act: () => open('Open Defense and see what is missing', 'defense'),
    reward: { title: 'The line holds', line: 'The Defense tab reads as guarded: the place is no longer the easiest on the road.' },
  },
  watch: {
    short: 'Watch', title: 'Set the watch rota', line: s => (s.security?.watch ? 'A neighborhood watch is founded' : s.guards.staff.length ? `${s.guards.staff.length} guards on the payroll` : 'No one is on watch'),
    why: 'Nights are when people come. A rota means someone is awake and no one is worn out by the fourth night.',
    done: s => !!s.security?.watch || s.guards.staff.length > 0, act: () => open('Open the neighborhood and set a watch', 'outside'),
    reward: { title: 'Someone is awake', line: 'There is a watch on the place every night.' },
  },
  pact: {
    short: 'Pact', title: 'Make a pact with the neighbors', line: s => (s.locals?.pact.length ? `${s.locals.pact.length} households in your pact` : 'No pact yet'),
    why: 'Neighbors who will come when there is shooting, and expect you in turn, are worth more than another fence.',
    done: s => (s.locals?.pact.length ?? 0) >= 1, act: () => open('Open the neighborhood and talk to a neighbor', 'outside'),
    reward: { title: 'You are not alone', line: 'A neighbor will answer when you call, and you will answer theirs.' },
  },
  cash: {
    short: 'Cash', title: 'Hold cash on hand', line: s => `${usd(s.fin.cash)} in the safe`,
    why: 'Cards and accounts stop when the lines do. Small bills and coin are what the crossroads market still takes.',
    done: s => s.fin.cash >= 500, act: () => shop('Open Money and take cash out', 'money'),
    reward: { title: 'Money you can hold', line: 'At least $500 in the safe: it buys things when the bank does not answer.' },
  },
  metals: {
    short: 'Metals', title: 'Put some savings in gold or silver', line: s => (s.fin.holdings.length ? `${s.fin.holdings.length} lots of metal held` : 'No metal held'),
    why: 'Paper can be frozen or inflated away. A few ounces hold value through either and can be hidden.',
    done: s => s.fin.holdings.length >= 1, act: () => shop('Open Gold and silver', 'metals'),
    reward: { title: 'Savings that keep', line: 'Part of the money now sits in something that does not depend on a bank.' },
  },
  trade: {
    short: 'Trade goods', title: 'Lay in goods to trade', line: s => `${n(s, 'fuel')} fuel, ${n(s, 'meds')} medicine, ${n(s, 'hygiene')} soap`,
    why: 'When money is worth little, fuel, medicine and soap are what neighbors will swap for the things you lack.',
    done: s => n(s, 'fuel') >= 2 && n(s, 'meds') >= 1 && n(s, 'hygiene') >= 1, act: () => shop('Buy fuel, medicine and soap', 'household'),
    reward: { title: 'A shelf to trade from', line: 'Fuel, medicine and soap set aside: real things to barter with.' },
  },
  filters: {
    short: 'Filters', title: 'Stock respirators and filters', line: s => `${n(s, 'filter_set') + n(s, 'nbc_filter')} filter sets, ${n(s, 'water_filter')} water filters`,
    why: 'Fine dust and smoke fill lungs and clog engines, wells and filters. Spare filters decide how long you can work outdoors.',
    done: s => n(s, 'filter_set') + n(s, 'nbc_filter') + n(s, 'water_filter') >= 1, act: () => shop('Buy filters', 'bunker'),
    reward: { title: 'Air and water you can clean', line: 'Spare filters on the shelf: the family can breathe and drink through the worst of it.' },
  },
  iodine: {
    short: 'Dose kit', title: 'Get a Geiger counter and iodine tablets', line: s => `${n(s, 'geiger_counter')} counters, ${n(s, 'potassium_iodide')} iodine packs`,
    why: 'You cannot see fallout. The counter tells you when it is safe to go out, and the tablets protect the thyroid in the first days.',
    done: s => n(s, 'geiger_counter') >= 1 && n(s, 'potassium_iodide') >= 1, act: () => shop('Buy a counter and iodine', 'household'),
    reward: { title: 'You can measure it', line: 'A counter and iodine on hand: you will know the dose and have the one cheap protection there is.' },
  },
  sandbags: {
    short: 'Sandbags', title: 'Fill sandbags and lay in tarps', line: s => have(n(s, 'sandbags'), 20, 'sandbags'),
    why: 'A wall of bags turns water, ash and bullets, and tarps cover what a roof cannot. They are cheap now and impossible later.',
    done: s => n(s, 'sandbags') >= 20, act: () => shop('Buy sandbags', 'defense'),
    reward: { title: 'Something to build a barrier from', line: 'Twenty bags in the yard: a low wall at the door or the well is an hour\'s work.' },
  },
  highStore: {
    short: 'Stores uphill', title: 'Move the stores above the flood line', line: s => {
      const safe = s.structures.filter(st => !st.unplaced && isFinished(st) && ['root_cellar', 'barn', 'workshop', 'metal_garage'].includes(st.kind));
      const low = floodCandidates(s, safe).length;
      return safe.length === 0 ? 'No storage building at all' : low > 0 ? `${low} of ${safe.length} storage buildings sit in the flood bottom` : 'Every store is on high ground';
    },
    why: 'Water takes the creek bottom first and takes everything stored there. A shed on the bench above it is the difference between a bad week and starting over.',
    done: s => {
      const store = s.structures.filter(st => !st.unplaced && isFinished(st) && ['root_cellar', 'barn', 'workshop', 'metal_garage', 'bunker_pantry'].includes(st.kind));
      return store.length > 0 && floodCandidates(s, store).length < store.length;
    },
    act: s => (s.structures.some(st => isFinished(st) && st.kind === 'workshop') ? { label: 'Show the high ground', act: { type: 'terrain', mode: 'high' } } : stake(s, 'workshop', 'Stake a storage shed (then pick high ground)')),
    pace: s => poorTail(s, 'a plain shed on the bench is cheaper than the stores it saves.'),
    reward: { title: 'The stores are above the water', line: 'At least one storage building is out of the creek bottom: the stores stay dry.' },
  },
  repairs: {
    short: 'Shore up', title: 'Check the structures and shore up what is weak', line: s => {
      const open = s.structures.filter(st => !st.unplaced && isFinished(st) && (st.fixes ?? []).some(f => f.done < f.hours)).length;
      return !s.structures.some(st => !st.unplaced && isFinished(st)) ? 'No finished building to check yet' : open ? `${open} ${open === 1 ? 'building has' : 'buildings have'} repairs open` : 'No repairs open on any building';
    },
    why: 'Old roofs, wiring and walls are what fail when the ground moves or the wind comes. Fix the worst one before it matters.',
    done: s => s.structures.some(st => !st.unplaced && isFinished(st)) && s.structures.filter(st => !st.unplaced && isFinished(st)).every(st => (st.fixes ?? []).every(f => f.done >= f.hours)),
    act: s => { const st = s.structures.find(x => !x.unplaced && isFinished(x) && (x.fixes ?? []).some(f => f.done < f.hours)); return st ? { label: `Look at the ${st.kind.replace(/_/g, ' ')}'s repairs`, act: { type: 'select', id: st.id } } : open('Open the land and check the buildings', 'land'); },
    reward: { title: 'Everything is sound', line: 'Every finished building has its repairs done: the place will take a hit better.' },
  },
  water: {
    short: 'Water', title: 'Store a week of water', line: s => `${Math.floor(waterDaysStored(s))} days of water in storage (want 7)`,
    why: s => `A person needs about 10 liters a day with washing. Pumps need power, and the county main is the first thing to fail. ${clockWords(s)}`,
    done: s => waterDaysStored(s) >= 7,
    act: s => (fin(s, k => ['well_hand', 'well_drilled', 'cistern', 'water_tower'].includes(k)) || rich(s) ? shop('Buy water jugs and a tote', 'water') : stake(s, 'well_hand', 'Stake a hand-dug well')),
    pace: s => poorTail(s, 'a hand-dug well is the family\'s own work; jugs from the creek count in the meantime.'),
    reward: { title: 'A week of water', line: 'Seven days of drinking and washing water are in the tanks: no one goes thirsty while you sort the rest.' },
  },
  cistern: {
    short: 'Cistern', title: 'Build a cistern', line: s => (fin(s, k => k === 'cistern' || k === 'water_tower') ? 'A cistern stands' : 'No cistern'),
    why: 'A cistern fills from the roof and the pump and holds what the creek and the well cannot give in a bad year.',
    done: s => fin(s, k => k === 'cistern' || k === 'water_tower'), act: s => stake(s, 'cistern', 'Stake a cistern'),
    reward: { title: 'Water in the bank', line: 'A cistern is built and filling: a dry spell has to last longer to hurt.' },
  },
  food30: {
    short: 'Food', title: 'Stock a month of food', line: s => (Number.isFinite(daysOfFood(s)) ? `${Math.floor(daysOfFood(s))} days of food (want 30)` : 'Nobody to feed'),
    why: s => `Prices climb and deliveries stop. A full month on the shelf is time to find the next one. ${clockWords(s)}`,
    done: s => daysOfFood(s) >= 30, act: s => (rich(s) ? shop('Buy staples and canned food', 'food') : open('Check the stores and the garden', 'supplies', 'stores')),
    pace: s => poorTail(s, 'rice, beans and flour are the cheapest calories; the garden covers the rest.'),
    reward: { title: 'A month on the shelf', line: 'Thirty days of food are in the house: the family eats while the world sorts itself out.' },
  },
  food90: {
    short: 'Big pantry', title: 'Stock three months of food', line: s => (Number.isFinite(daysOfFood(s)) ? `${Math.floor(daysOfFood(s))} days of food (want 90)` : 'Nobody to feed'),
    why: s => `A season of food is a season you are not at the gate or on the road. ${clockWords(s)}`,
    done: s => daysOfFood(s) >= 90, act: s => (rich(s) ? shop('Buy staples and canned food', 'food') : open('Check the stores and the garden', 'supplies', 'stores')),
    pace: s => poorTail(s, 'start with the staples; the garden and the freezer carry the rest.'),
    reward: { title: 'A season of food', line: 'Ninety days of food are in the house: a hard winter will not empty it.' },
  },
  fuel: {
    short: 'Fuel', title: 'Fill the fuel cans', line: s => have(n(s, 'fuel'), 4, 'cans of fuel'),
    why: s => `Fuel runs the generator, the truck and the saw, and there is none to buy later. ${clockWords(s)}`,
    done: s => n(s, 'fuel') >= 4, act: () => shop('Buy fuel', 'fuel'),
    reward: { title: 'Fuel in the shed', line: 'Four cans set by with stabilizer: the generator and the truck can run when it counts.' },
  },
  firewood: {
    short: 'Firewood', title: 'Stack firewood', line: s => have(n(s, 'firewood'), 8, 'cords'),
    why: 'Cold kills slowly and in the same weeks as everything else. Dry wood stacked now is heat all winter.',
    done: s => n(s, 'firewood') >= 8, act: s => (rich(s) ? shop('Buy firewood', 'fuel') : { label: 'Mark trees to fell for firewood', act: { type: 'markTrees', n: 6 } }),
    reward: { title: 'A winter of heat', line: 'Eight cords are stacked: the house stays warm even if everything else fails.' },
  },
  meds: {
    short: 'Medicine', title: 'Stock medicine and a first-aid kit', line: s => have(n(s, 'meds'), 2, 'medicine kits'),
    why: 'Clinics close and pharmacies empty first. A kit and a month of what each person takes is the cheapest insurance there is.',
    done: s => n(s, 'meds') >= 2, act: () => shop('Buy medicine and first-aid supplies', 'household'),
    reward: { title: 'A medicine shelf', line: 'Two kits on the shelf: cuts, fevers and infections can be treated at home.' },
  },
  bugout: {
    short: 'Go-bag', title: 'Pack the go-bags and fuel the truck', line: s => (n(s, 'bugout_bag') + n(s, 'bugout_cache') >= 1 ? 'A go-bag is packed' : 'No go-bag'),
    why: s => `If the road out has to be taken, it has to be taken in minutes with water, food and papers already in the bag. ${clockWords(s)}`,
    done: s => n(s, 'bugout_bag') + n(s, 'bugout_cache') >= 1, act: () => shop('Buy go-bags', 'defense'),
    reward: { title: 'Ready to go', line: 'A packed bag by the door: if the family has to leave, it leaves with what it needs.' },
  },
  seed: {
    short: 'Seed', title: 'Save seed', line: s => have(n(s, 'seed'), 5, 'seed packs'),
    why: 'Next year\'s crop is this year\'s seed. Hybrids do not breed true, so keep heirloom stock back.',
    done: s => n(s, 'seed') >= 5, act: () => shop('Buy heirloom seed', 'food'),
    reward: { title: 'Next year is planted', line: 'Seed is set aside for the next planting: the garden can restart after a bad year.' },
  },
  coldCrops: {
    short: 'Cold crops', title: 'Grow under cover', line: s => (fin(s, k => ['greenhouse', 'greenhouse_heated', 'high_tunnel', 'polytunnel'].includes(k)) ? 'A greenhouse or tunnel is up' : 'Everything grows in the open'),
    why: 'When the sun dims or the season shortens, a tunnel or greenhouse is the only place a crop still ripens.',
    done: s => fin(s, k => ['greenhouse', 'greenhouse_heated', 'high_tunnel', 'polytunnel'].includes(k)),
    act: s => stake(s, rich(s) ? 'greenhouse' : 'polytunnel', rich(s) ? 'Stake a greenhouse' : 'Stake a polytunnel'),
    pace: s => poorTail(s, 'a plastic polytunnel is the cheap cover.'),
    reward: { title: 'Growing under cover', line: 'A greenhouse or tunnel stands: crops can ripen in a short season.' },
  },
  firebreak: {
    short: 'Firebreak', title: 'Cut a firebreak', line: s => (s.perimeter.some(r => runFinished(r) && (r.kind === 'ditch' || r.kind === 'earth_berm')) ? 'A ditch or berm runs round the place' : 'Nothing bare between the woods and the house'),
    why: 'Fire runs on fuel. A bare ditch or berm round the buildings gives crews and hoses something to stand behind.',
    done: s => s.perimeter.some(r => runFinished(r) && (r.kind === 'ditch' || r.kind === 'earth_berm')), act: () => ({ label: 'Dig a ditch', act: { type: 'tool', tool: 'fence:ditch' } }),
    reward: { title: 'A bare line round the place', line: 'A finished ditch or berm: a fire coming through the grass has something to stop it.' },
  },
  tents: {
    short: 'Room for guests', title: 'Make room for the people coming', line: s => have(n(s, 'tent'), 2, 'tents'),
    why: 'People on the road will come to the places that still have a light on. A few tents and a clear rule beat a crowd in the yard.',
    done: s => n(s, 'tent') >= 2, act: () => shop('Buy tents and sleeping bags', 'household'),
    reward: { title: 'Room for strangers', line: 'Two tents ready: you can take a few people in on your own terms.' },
  },
};
