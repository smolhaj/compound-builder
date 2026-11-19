/**
 * The kind-specific radio lines (FL3 fix): every kind speaks in its own words, so a week of listening sounds like THIS disaster. Each kind has
 * about a dozen lines across the five voices (official notice, ham chatter, trade talk, rumor, fence-line gossip), most of them true and a few
 * false, every one tied to a checkable `Claim` (claims.ts): a true line is only said while its claim holds, a false line only while it does
 * not, and a scout settles it (sim/rumors.ts). Compact on purpose: a row is [id, channel, truth, tone, first day, last day, claim, text].
 * Claim shorthand: `active` (this disaster is on), `out:T` / `up:T` / `lt:T:pct` (a service), `days:N`, `relief`, `city`, `creek`, `lifted`,
 * `req`, `ash:N` (inches), `sick:N` (percent), `noorder`, `price:N`, `away`. Text: `{d}` is the day since the hit, `{p}` the store's price level.
 */
import { prices } from '../economy';
import type { GameState } from '../state';
import { awayCount, sickPercent, type Claim } from './claims';
import { dayN, genLine, type GenLine } from './lineKit';
import type { FeltKind, RadioChannel } from './types';

type Row = [id: string, ch: RadioChannel, truth: 'true' | 'false', tone: 0 | 1 | 2 | 3, from: number, to: number, claim: string, text: string];

const level10 = (x: number): number => Math.floor(x * 10 + 1e-9) / 10;

/** Turn a claim shorthand into the claim for today. */
function claimFor(spec: string, kind: FeltKind, s: GameState): Claim {
  const [h, a, b] = spec.split(':');
  switch (h) {
    case 'out': return { id: 'svc_out', a };
    case 'up': return { id: 'svc_up', a };
    case 'lt': return { id: 'track_lt', a, n: Number(b) };
    case 'days': return { id: 'days_ge', n: Number(a) };
    case 'relief': return { id: 'relief_here' };
    case 'city': return { id: 'city_open' };
    case 'creek': return { id: 'creek_unsafe' };
    case 'lifted': return { id: 'alert_lifted' };
    case 'req': return { id: 'requisition' };
    case 'ash': return { id: 'ash_ge', n: Number(a) };
    case 'sick': return { id: 'sick_ge', n: Number(a) };
    case 'noorder': return { id: 'ordering', a: 'closed' };
    case 'price': return { id: 'price_ge', n: Number(a) };
    case 'away': return { id: 'neighbors_away', n: Math.max(1, awayCount(s)) };
    default: return { id: 'kind_active', a: kind };
  }
}

const fill = (t: string, s: GameState): string => t.replace('{d}', String(dayN(s))).replace('{p}', level10(prices(s)).toFixed(1)).replace('{sick}', String(Math.max(1, Math.round(sickPercent(s)))));

/** The days a line can be said on (the day since the hit, whole), and the extra gate its claim spec implies for a true line. */
function rowLine(kind: FeltKind, r: Row): GenLine {
  const [id, channel, truth, tone, from, to, spec, text] = r;
  return genLine(kind, { id: `k_${id}`, channel, truth, tone, claim: s => claimFor(spec, kind, s), when: s => dayN(s) >= from && dayN(s) <= to, text: s => fill(text, s) });
}

const ROWS: Record<FeltKind, Row[]> = {
  grid_down: [
    ['o1', 'official', 'true', 1, 0, 40, 'active', 'Utility dispatch: the transmission grid is down across the region, day {d}. Crews are working outward from the big plants. No time estimate.'],
    ['o2', 'official', 'true', 2, 0, 12, 'out:grid', 'County: the substations are dark. Never run a generator indoors or in the garage. Hospitals are on backup fuel.'],
    ['o3', 'official', 'true', 1, 5, 80, 'days:5', 'Utility: restoration goes by priority: hospitals, water plants, then neighborhoods. Rural feeders come last.'],
    ['h1', 'ham', 'true', 1, 0, 60, 'active', 'Ham net: all four regions report the same: no grid, no word on a date. Day {d}.'],
    ['t1', 'trade', 'true', 1, 0, 60, 'active', 'Trader on the net: generator gas is the new money. A day of runtime goes for a day\'s wage.'],
    ['r1', 'rumor', 'true', 1, 0, 60, 'active', 'Dark. Whole way to the coast. Not one light on the ridge.'],
    ['r2', 'rumor', 'false', 1, 0, 60, 'lifted', 'Lights back Friday. The whole grid. A lineman said so. Heard it twice.'],
    ['r3', 'rumor', 'false', 1, 0, 60, 'relief', 'A utility truck. Transformers on it. Coming up the county road tomorrow.'],
    ['l1', 'local', 'true', 1, 0, 60, 'active', 'Whole county dark. Fridges thawing. Folks cooking everything they have.'],
    ['l2', 'local', 'false', 1, 0, 60, 'up:grid', 'Co-op has power again, they say. Go look. Somebody always says that.'],
  ],
  financial: [
    ['o1', 'official', 'true', 1, 0, 40, 'active', 'Treasury and the Fed: the banking holiday continues, day {d}. Accounts are frozen while institutions are examined. Cash is still legal tender.'],
    ['o2', 'official', 'true', 2, 0, 12, 'out:banks', 'County: the branch is shut. Cards and checks are declined. The sheriff asks you to stay out of the lobby.'],
    ['o3', 'official', 'true', 1, 5, 80, 'days:5', 'State: withdrawals will reopen in limits per account, for those with ID. No date yet.'],
    ['h1', 'ham', 'true', 1, 0, 60, 'active', 'Ham net: card networks are down in six states. Stores that take cash only are open, for now.'],
    ['t1', 'trade', 'true', 1, 0, 60, 'price:1.3', 'Feed store on the net: prices are {p} times normal and cash only. Silver and tools are taken in trade.'],
    ['r1', 'rumor', 'true', 1, 0, 60, 'active', 'Banks shut. Cards dead. Everybody wants cash. Nobody has any.'],
    ['r2', 'rumor', 'false', 1, 0, 60, 'up:banks', 'Bank reopens Monday. All accounts whole. The teller told my cousin.'],
    ['r3', 'rumor', 'false', 1, 0, 60, 'city', 'City branch is paying cash. No limit. Folks walking in with bags.'],
    ['l1', 'local', 'true', 1, 0, 60, 'active', 'Gas station takes cash only now. Man ahead counted out dimes. Line down the road.'],
    ['l2', 'local', 'false', 1, 0, 60, 'relief', 'Checks from the state. A truck with the money. Tuesday, they say.'],
  ],
  lawless: [
    ['o1', 'official', 'true', 2, 0, 40, 'active', 'Sheriff\'s office: calls are answered when a deputy is free, which is rare. Lock your gate, keep a watch at night, day {d}.'],
    ['o2', 'official', 'true', 2, 0, 12, 'lt:law:40', 'County: the jail has been emptied for lack of staff. Neighbors are asked to organize a watch.'],
    ['o3', 'official', 'true', 1, 6, 90, 'days:6', 'The sheriff says the militia checkpoints at the bridge are not county authority. Do not hand over food or guns.'],
    ['h1', 'ham', 'true', 2, 0, 60, 'active', 'Ham net: a convoy was stopped and stripped on the state road. Travel in daylight only, and in numbers.'],
    ['t1', 'trade', 'true', 1, 0, 60, 'active', 'Trader: I\'ll come to your gate, not your door. Bring what you want to swap and keep your hands where I can see them.'],
    ['r1', 'rumor', 'true', 2, 0, 60, 'active', 'Fires out toward the highway. Somebody\'s barn. Nobody came.'],
    ['r2', 'rumor', 'false', 1, 0, 60, 'relief', 'Guard is coming. To take the county back. Next week. Deputy said.'],
    ['r3', 'rumor', 'false', 2, 0, 60, 'req', 'Posse is taking food. At the crossroads. For the town, they say. Don\'t go by.'],
    ['l1', 'local', 'true', 2, 0, 60, 'active', 'Called 911. Nothing. Nothing at all. Shotgun\'s by the door now.'],
    ['l2', 'local', 'false', 1, 0, 60, 'up:law', 'Sheriff\'s back on duty. Patrolling again. I haven\'t seen a car.'],
  ],
  drought: [
    ['o1', 'official', 'true', 1, 0, 40, 'active', 'State water board: the county is in extreme drought, day {d}. Outdoor watering is banned and well permits are on hold.'],
    ['o2', 'official', 'true', 1, 0, 14, 'active', 'County extension: no rain in the forecast for two weeks. Cut the herd now if hay is short.'],
    ['o3', 'official', 'true', 1, 6, 90, 'days:6', 'Irrigation district: junior water rights are shut off. Senior rights get a third of their share this month.'],
    ['h1', 'ham', 'true', 1, 0, 60, 'active', 'Ham net: wells are going dry along the valley. Folks are hauling water from the town park in stock tanks.'],
    ['t1', 'trade', 'true', 1, 0, 60, 'price:1.3', 'Feed store: hay is up to {p} times last year, if you can find any. Water by the barrel, ask at the counter.'],
    ['r1', 'rumor', 'true', 1, 0, 60, 'active', 'Creek is dry. Dry! Stones are hot. Wells too, down the road.'],
    ['r2', 'rumor', 'false', 1, 0, 60, 'lifted', 'Rain Saturday. A real storm. Fills the reservoir by Monday. Heard it twice.'],
    ['r3', 'rumor', 'false', 1, 0, 60, 'relief', 'State water tankers. Coming up the county road. Tuesday, for sure.'],
    ['l1', 'local', 'true', 1, 0, 60, 'active', 'Hendersons are hauling water now. Pond is cracked mud. Cattle look thin.'],
    ['l2', 'local', 'false', 1, 0, 60, 'creek', 'Creek\'s low from poison, they say. Somebody dumped something. Don\'t drink it.'],
  ],
  pandemic: [
    ['o1', 'official', 'true', 2, 0, 40, 'active', 'Health department: the outbreak is in the county, day {d}. Stay home when sick, keep the sick apart, wash your hands.'],
    ['o2', 'official', 'true', 2, 0, 14, 'active', 'The clinic is seeing only the severe. If you are short of breath, call ahead and wait at your gate.'],
    ['o3', 'official', 'true', 2, 4, 90, 'sick:2', 'County health: about {sick} in 100 residents are sick this week. Schools and churches stay closed.'],
    ['h1', 'ham', 'true', 2, 0, 60, 'active', 'Ham net: hospitals are over capacity in the cities. Nurses are working double shifts without masks.'],
    ['t1', 'trade', 'true', 1, 0, 60, 'active', 'Trader: I have masks, fever medicine and soap, at a price. No visits inside the house, I\'ll leave it at the gate.'],
    ['r1', 'rumor', 'true', 2, 0, 60, 'active', 'Coughing at the church supper. Whole families down. Stay back.'],
    ['r2', 'rumor', 'false', 1, 0, 60, 'lifted', 'Vaccine is here. Clinic starts shots Friday. Everyone at the gym.'],
    ['r3', 'rumor', 'false', 1, 0, 60, 'city', 'City hospital has beds again. Folks driving in with the sick. Maybe.'],
    ['l1', 'local', 'true', 2, 0, 60, 'active', 'Andersons all got sick at once. Left a note on the gate. Don\'t come in.'],
    ['l2', 'local', 'false', 1, 0, 60, 'creek', 'It\'s in the creek water. That\'s how it spreads. Boil everything. Heard it twice.'],
  ],
  nuclear: [
    ['o1', 'official', 'true', 3, 0, 40, 'active', 'Emergency alert: nuclear detonations have occurred. Stay inside, away from windows, for at least 48 hours. Day {d}.'],
    ['o2', 'official', 'true', 2, 0, 14, 'active', 'Civil defense: fallout is heaviest in the first two days and fades fast. Do not drink open water or eat garden produce for now.'],
    ['o3', 'official', 'true', 1, 6, 90, 'days:6', 'Civil defense: fallout levels are falling. Short trips outdoors are safer after the first week. Wash well, change clothes at the door.'],
    ['h1', 'ham', 'true', 2, 0, 60, 'active', 'Ham net: two cities are gone. Fallout plume is moving east. Counts at our station dropping day by day.'],
    ['t1', 'trade', 'true', 1, 0, 60, 'active', 'Trader: iodine tablets and filter masks are worth their weight. I\'ll swap for fuel or canned goods.'],
    ['r1', 'rumor', 'true', 3, 0, 60, 'creek', 'Creek, bad. Water, bad downstream. Don\'t drink it. Don\'t.'],
    ['r2', 'rumor', 'false', 1, 0, 60, 'lifted', 'They lifted the shelter order. Everybody\'s out and about. Heard it on the radio.'],
    ['r3', 'rumor', 'false', 1, 0, 60, 'relief', 'Army trucks. Iodine and clean water. At the school. Tuesday.'],
    ['l1', 'local', 'true', 3, 0, 60, 'active', 'Flash on the horizon. Then the sound. Nothing since. We\'re in the cellar.'],
    ['l2', 'local', 'false', 1, 0, 60, 'city', 'City\'s a smoking hole. South side\'s fine, they say. Taking people. Folks are walking in.'],
  ],
  solar_flare: [
    ['o1', 'official', 'true', 1, 0, 40, 'active', 'Space weather center: a severe geomagnetic storm hit the grid. Transformers are damaged across the continent. Day {d}.'],
    ['o2', 'official', 'true', 2, 0, 14, 'out:grid', 'Utility: large transformers are burned out and there are few spares. Expect weeks without power, then months for rural lines.'],
    ['o3', 'official', 'true', 1, 5, 90, 'days:5', 'Utility: replacement transformers are built to order and take months. Cities get them first.'],
    ['h1', 'ham', 'true', 1, 0, 60, 'active', 'Ham net: the sky lit green and red from Texas to Maine. HF is full of static and fades in and out.'],
    ['t1', 'trade', 'true', 1, 0, 60, 'active', 'Trader: anything with a battery or a hand crank is gold. Candles by the dozen, swap for what you have.'],
    ['r1', 'rumor', 'true', 1, 0, 60, 'active', 'Sky was green and red. All night. Then every light went out.'],
    ['r2', 'rumor', 'false', 1, 0, 60, 'lifted', 'Power\'s back Friday. A utility man said so. Transformers mostly fine.'],
    ['r3', 'rumor', 'false', 1, 0, 60, 'relief', 'Utility trucks. Spare transformers. Rolling up the interstate. Tomorrow.'],
    ['l1', 'local', 'true', 1, 0, 60, 'active', 'Cars still run, mostly. Not a light in the county. Phones are bricks.'],
    ['l2', 'local', 'false', 1, 0, 60, 'up:grid', 'Co-op has its lights on. So they say. I walked by. Dark.'],
  ],
  wildfire: [
    ['o1', 'official', 'true', 2, 0, 40, 'active', 'Fire command: the complex fire is out of control and still growing, day {d}. Evacuation orders stand for all zones east of the ridge.'],
    ['o2', 'official', 'true', 2, 0, 14, 'active', 'Forest service: air quality is hazardous. Stay indoors, seal windows, wet the roof if embers fall.'],
    ['o3', 'official', 'true', 1, 5, 80, 'days:5', 'Fire command: containment is in the single digits. Crews are protecting towns first, ranches second.'],
    ['h1', 'ham', 'true', 2, 0, 60, 'active', 'Ham net: spot fires jumped the highway at the pass. The fire is making its own wind.'],
    ['t1', 'trade', 'true', 1, 0, 60, 'active', 'Trader: respirators, goggles and hose are sold out in town. I have a few, wet-cloth masks are free with a purchase.'],
    ['r1', 'rumor', 'true', 2, 0, 60, 'active', 'Smoke. Can\'t see the ridge. Orange, just orange. Ash like snow.'],
    ['r2', 'rumor', 'false', 1, 0, 60, 'lifted', 'They\'ve got it contained. Evacuation lifts Friday. The chief said so.'],
    ['r3', 'rumor', 'false', 1, 0, 60, 'relief', 'Air tankers. A whole fleet. From Idaho. Tomorrow morning.'],
    ['l1', 'local', 'true', 2, 0, 60, 'active', 'Yoders\' hay barn went up last night. Saw it from here. Cattle got out.'],
    ['l2', 'local', 'false', 1, 0, 60, 'city', 'Town shelter has cots and hot food. Just drive down. Folks are going.'],
  ],
  ash_winter: [
    ['o1', 'official', 'true', 2, 0, 40, 'active', 'Geological survey: the eruption sent ash across the continent. Expect falling ash for weeks and a cold summer. Day {d}.'],
    ['o2', 'official', 'true', 2, 0, 14, 'active', 'Emergency management: keep roofs clear, ash is heavy when wet. Wear a dust mask outdoors, keep filters changed in engines.'],
    ['o3', 'official', 'true', 1, 5, 90, 'days:5', 'Extension service: little will grow this season. Plan to live off stored food, and protect seed.'],
    ['h1', 'ham', 'true', 1, 0, 60, 'active', 'Ham net: ash is falling from Denver to Chicago. Planes grounded, solar panels coated, daylight like dusk.'],
    ['t1', 'trade', 'true', 1, 0, 60, 'price:1.3', 'Feed store: dust masks and air filters gone, grain at {p} times. Shovels moving fast.'],
    ['r1', 'rumor', 'true', 2, 0, 60, 'active', 'Sun is gone. Gray. Cold. Still falling. An inch a night.'],
    ['r2', 'rumor', 'false', 1, 0, 60, 'lifted', 'Ash stops by Sunday. Sun comes back. A scientist said so. Heard it twice.'],
    ['r3', 'rumor', 'false', 1, 0, 60, 'relief', 'State is trucking grain and fuel. Up the main road. Next week.'],
    ['l1', 'local', 'true', 1, 0, 60, 'active', 'Shoveled the roof twice this week. Porch rail\'s buried. Hens won\'t go out.'],
    ['l2', 'local', 'false', 1, 0, 60, 'city', 'City has an ash shelter. Hot meals. People walking in from town.'],
  ],
  cyberattack: [
    ['o1', 'official', 'true', 1, 0, 40, 'active', 'Federal cyber agency: systems for banks, utilities and carriers were attacked, day {d}. Do not connect unknown devices. Restoration is manual.'],
    ['o2', 'official', 'true', 2, 0, 14, 'active', 'County: card readers, ATMs and pump payment are down. The power company reads its customers\' dials by hand where it can.'],
    ['o3', 'official', 'true', 1, 5, 90, 'days:5', 'Utility: control systems are being rebuilt from clean backups. Expect rolling outages for weeks.'],
    ['h1', 'ham', 'true', 1, 0, 60, 'active', 'Ham net: phone and net are down in a dozen states. Radio is the only thing carrying traffic. Keep it short.'],
    ['t1', 'trade', 'true', 1, 0, 60, 'active', 'Trader: cash and barter only. Nobody is taking plastic, and my scale and register won\'t boot.'],
    ['r1', 'rumor', 'true', 1, 0, 60, 'active', 'Screens dead. Cards dead. Nobody knows why. Pumps wouldn\'t work.'],
    ['r2', 'rumor', 'false', 1, 0, 60, 'up:banks', 'Banks are back Monday. The whole network. All balances safe. Heard it twice.'],
    ['r3', 'rumor', 'false', 1, 0, 60, 'relief', 'Federal crew. With a fix. At the county seat. Tuesday.'],
    ['l1', 'local', 'true', 1, 0, 60, 'active', 'Grocery wrote prices on cardboard. Cash only. Line out the door.'],
    ['l2', 'local', 'false', 1, 0, 60, 'up:phone', 'Cell tower\'s back on, my cousin says. Mine says no service. Always does.'],
  ],
  zombies: [
    ['o1', 'official', 'true', 3, 0, 40, 'active', 'Emergency broadcast: infected persons are violent and do not respond to commands. Stay in your home, lock your doors. Day {d}.'],
    ['o2', 'official', 'true', 2, 0, 14, 'active', 'Sheriff: do not go to town. Do not approach anyone who is staggering or unresponsive. Shoot only if you must, and do not shout.'],
    ['o3', 'official', 'true', 2, 5, 90, 'days:5', 'Guard command: safe zones are full. Stay where you are, keep quiet, keep lights low, and keep the gate shut.'],
    ['h1', 'ham', 'true', 2, 0, 60, 'active', 'Ham net: they follow noise and light. A station in the next state went silent mid-sentence. Keep your antenna low.'],
    ['t1', 'trade', 'true', 1, 0, 60, 'active', 'Trader: I\'m leaving ammo and chain at the end of the lane, you leave the swap and go. Don\'t come close.'],
    ['r1', 'rumor', 'true', 3, 0, 60, 'active', 'They\'re... don\'t go to town. Don\'t. Saw them in the road. Dusk.'],
    ['r2', 'rumor', 'false', 1, 0, 60, 'relief', 'Guard cleared the county seat. A convoy takes survivors out. Thursday.'],
    ['r3', 'rumor', 'false', 1, 0, 60, 'lifted', 'There\'s a cure. A shot. Free at the high school. Monday.'],
    ['l1', 'local', 'true', 3, 0, 60, 'active', 'Dogs barked all night. Then stopped. Sound carries. I put out every light.'],
    ['l2', 'local', 'false', 1, 0, 60, 'city', 'City\'s walled off. Open to anyone who gets there. Folks are heading down the road.'],
  ],
  invasion: [
    ['o1', 'official', 'true', 3, 0, 40, 'active', 'Joint command: foreign forces have landed. Civilians are asked to shelter in place and not interfere with troop movements. Day {d}.'],
    ['o2', 'official', 'true', 2, 0, 14, 'active', 'Occupation authority: checkpoints are in effect. Carry identification. A curfew runs from dusk to dawn.'],
    ['o3', 'official', 'true', 2, 5, 90, 'days:5', 'Occupation authority: requisition notices will be posted. Grain, fuel and vehicles may be taken against a receipt.'],
    ['h1', 'ham', 'true', 2, 0, 60, 'active', 'Ham net: a column of trucks went through the junction last night, no lights. They are jamming the lower bands.'],
    ['t1', 'trade', 'true', 1, 0, 60, 'active', 'Trader: I swap behind the church after curfew. Their money is worthless to me, bring goods.'],
    ['r1', 'rumor', 'true', 3, 0, 60, 'active', 'Soldiers. Not ours. Trucks all night. County road.'],
    ['r2', 'rumor', 'false', 1, 0, 60, 'relief', 'Our army\'s counterattacking. At the river. They\'re falling back. Next week.'],
    ['r3', 'rumor', 'false', 1, 0, 60, 'lifted', 'Ceasefire. Signed today. Occupation ends by the weekend. Heard it twice.'],
    ['l1', 'local', 'true', 2, 0, 60, 'active', 'They stopped the Lindqvists at the bridge. Went through the truck. Took the fuel.'],
    ['l2', 'local', 'false', 1, 0, 60, 'req', 'Taking everyone\'s guns. House by house. With lists. Tomorrow, they say.'],
  ],
  civil_war: [
    ['o1', 'official', 'true', 3, 0, 40, 'active', 'Provisional command: the county is contested. Obey checkpoint orders. Travel on the county road only with a pass. Day {d}.'],
    ['o2', 'official', 'true', 2, 0, 14, 'active', 'Command: requisition notices will follow. Grain and fuel are taken against a receipt. Refusing a lawful requisition is treason.'],
    ['o3', 'official', 'true', 2, 5, 90, 'days:5', 'Command: the draft for able men from 18 to 45 begins when the front firms up. Volunteers get rations.'],
    ['h1', 'ham', 'true', 2, 0, 60, 'active', 'Ham net: the front is moving again. Artillery near the north pass. Neither side has the road for long.'],
    ['t1', 'trade', 'true', 1, 0, 60, 'active', 'Trader: I take either side\'s scrip at half face. Better, take goods. Passes cost extra this week.'],
    ['r1', 'rumor', 'true', 3, 0, 60, 'active', 'Shooting. Past the ridge. Both sides. Stay off the north road.'],
    ['r2', 'rumor', 'false', 1, 0, 60, 'lifted', 'Truce. Signed in the capital. Shooting stops Sunday. Heard it twice.'],
    ['r3', 'rumor', 'false', 1, 0, 60, 'relief', 'Relief train. Crosses the front Wednesday. Our county gets a share.'],
    ['l1', 'local', 'true', 2, 0, 60, 'active', 'Post on the county road now. Two boys, new uniforms. Looked in the truck bed. Waved us on.'],
    ['l2', 'local', 'false', 1, 0, 60, 'up:law', 'Sheriff\'s back. Running things for both sides. Haven\'t seen him.'],
  ],
  bioweapon: [
    ['o1', 'official', 'true', 3, 0, 40, 'active', 'Public health emergency: a deliberate release, an engineered pathogen. Stay home, avoid all contact, day {d}. Do not travel.'],
    ['o2', 'official', 'true', 3, 0, 14, 'active', 'Quarantine order: movement between counties is banned. Checkpoints turn back any traffic. Seal windows and doors against outside air.'],
    ['o3', 'official', 'true', 2, 4, 90, 'sick:4', 'County health: at least {sick} in 100 are sick this week, and the fatality rate is high. Do not bring the sick to the clinic.'],
    ['h1', 'ham', 'true', 2, 0, 60, 'active', 'Ham net: the city is quarantined and silent. National Guard on the bridges. Station after station going off the air.'],
    ['t1', 'trade', 'true', 1, 0, 60, 'active', 'Trader: gloves, bleach and respirator filters, nothing else. I wear a mask at the gate and you do too.'],
    ['r1', 'rumor', 'true', 3, 0, 60, 'active', 'Birds dead on the lawn. Don\'t touch. People down in two days.'],
    ['r2', 'rumor', 'false', 1, 0, 60, 'lifted', 'Antidote. Shots start Friday at the fairgrounds. Free for the county.'],
    ['r3', 'rumor', 'false', 1, 0, 60, 'relief', 'Medical convoy. Masks and medicine. Tuesday at the high school.'],
    ['l1', 'local', 'true', 3, 0, 60, 'active', 'Kowalskis hung a sheet on the fence. SICK. KEEP BACK. We left bread at the lane.'],
    ['l2', 'local', 'false', 1, 0, 60, 'city', 'Quarantine\'s lifted. City is open. Folks are heading in.'],
  ],
  asteroid: [
    ['o1', 'official', 'true', 3, 0, 40, 'active', 'Space agency: the impact threw dust and debris into the upper air, day {d}. Expect darkness, falling temperatures and failed crops this year.'],
    ['o2', 'official', 'true', 2, 0, 14, 'active', 'Emergency management: aftershocks and air blast damage are widespread. Stay out of damaged buildings. Watch for fires from falling debris.'],
    ['o3', 'official', 'true', 1, 5, 90, 'days:5', 'Extension service: sunlight is cut sharply. Greenhouses, lamps and stored seed matter more than field crops this season.'],
    ['h1', 'ham', 'true', 2, 0, 60, 'active', 'Ham net: the coastal cities are gone. Tsunami warnings from the Gulf to Maine. The sky here is dark at noon.'],
    ['t1', 'trade', 'true', 1, 0, 60, 'active', 'Trader: window glass, plastic sheeting and lamp oil are what I\'m buying. I\'ll pay in canned meat.'],
    ['r1', 'rumor', 'true', 3, 0, 60, 'active', 'Boom. Then dark. Windows, gone. Sky\'s gray since.'],
    ['r2', 'rumor', 'false', 1, 0, 60, 'lifted', 'Dust clears next week. Sun comes back. A professor said so.'],
    ['r3', 'rumor', 'false', 1, 0, 60, 'relief', 'Army convoy. Food and plastic sheeting. Thursday. At the fairgrounds.'],
    ['l1', 'local', 'true', 2, 0, 60, 'active', 'Every west window blew in. Glass in the beds. The dog hid two days.'],
    ['l2', 'local', 'false', 1, 0, 60, 'city', 'City\'s untouched. Taking people. Folks are walking in. Hundreds of miles.'],
  ],
  unknown: [
    ['o1', 'official', 'true', 2, 0, 40, 'active', 'Emergency broadcast: authorities are aware of widespread disappearances and are investigating. Remain calm. Stay home. Day {d}.'],
    ['o2', 'official', 'true', 2, 0, 14, 'active', 'State: the cause is not known. Do not enter abandoned homes. If a family member is missing, report it, then wait.'],
    ['o3', 'official', 'true', 1, 5, 90, 'days:5', 'Federal agency: no explanation yet. We ask people to share what they have seen, and to stay in groups of three or more.'],
    ['h1', 'ham', 'true', 2, 0, 60, 'active', 'Ham net: whole towns say half the people are just gone. Cars running at the curb with the doors open.'],
    ['t1', 'trade', 'true', 1, 0, 60, 'active', 'Trader: the stores are open with nobody in them. I\'m taking what I need and leaving a note and what it\'s worth.'],
    ['r1', 'rumor', 'true', 2, 0, 60, 'active', 'Nobody knows. Nobody. Stay home. The Foxes are gone. Truck\'s still in the drive.'],
    ['r2', 'rumor', 'false', 1, 0, 60, 'lifted', 'They\'re coming back. All of them. Friday at dawn. A woman on the net said.'],
    ['r3', 'rumor', 'false', 1, 0, 60, 'relief', 'Government team has the answer. Coming to the county seat. Tuesday.'],
    ['l1', 'local', 'true', 2, 0, 60, 'active', 'Went by the place down the road. Supper on the table. Still warm. No one there.'],
    ['l2', 'local', 'false', 1, 0, 60, 'away', 'Folks down the road. Gone too, they say. Walk over and see.'],
  ],
  emp: [
    ['o1', 'official', 'true', 2, 0, 40, 'active', 'A tube-set AM station three counties away: "Emergency broadcast. High-altitude pulse. Electronics and vehicles built after 1980 are burned. Stay in place." Day {d}.'],
    ['o2', 'official', 'true', 2, 0, 14, 'active', 'Tube-set broadcast: do not try to start a car or turn on a radio that was plugged in. Boxed and unplugged gear may survive.'],
    ['o3', 'official', 'true', 1, 5, 90, 'days:5', 'Tube-set broadcast: delegates from every road to the grange at noon Saturday. It is a day on foot there and a day back.'],
    ['h1', 'ham', 'true', 2, 0, 60, 'active', 'Ham net: a handful of boxed and shielded rigs still working. HF is almost empty. No grid, no phones, no cars, anywhere.'],
    ['t1', 'trade', 'true', 1, 0, 60, 'active', 'Trader by wagon: anything with a tube or a wire coil is worth gold. Old trucks with points and a carburetor will still run.'],
    ['r1', 'rumor', 'true', 2, 0, 60, 'active', 'Truck won\'t start. Nothing starts. Even the old tractor.'],
    ['r2', 'rumor', 'false', 1, 0, 60, 'lifted', 'Power\'s back Friday. Whole county. A part from the base. Heard it twice.'],
    ['r3', 'rumor', 'false', 1, 0, 60, 'relief', 'Army trucks. With working radios. Coming up the county road. Tomorrow.'],
    ['l1', 'local', 'true', 2, 0, 60, 'active', 'Not a car on the road. Not a plane in the sky. Even the clocks stopped.'],
    ['l2', 'local', 'false', 1, 0, 60, 'up:grid', 'Co-op has lights on again. Someone says. I went by on foot. Nothing.'],
    ['l3', 'local', 'true', 2, 0, 60, 'active', 'Old Mr. Pruitt kept his radio in a metal can. Still works. Says stay put.'],
    ['l4', 'local', 'true', 1, 0, 60, 'days:3', 'Walkers on the county road. From town. Every car stalled. Same story from all.'],
    ['l5', 'local', 'false', 1, 0, 60, 'relief', 'Somebody heard an engine. An army one. Down by the creek. Coming to help.'],
  ],
  mega_quake: [
    ['o1', 'official', 'true', 3, 0, 40, 'active', 'Geological survey: a magnitude 8 quake with aftershocks to follow, day {d}. Stay out of damaged buildings. Expect more shaking.'],
    ['o2', 'official', 'true', 2, 0, 14, 'active', 'County: bridges are down on the state road and gas lines are broken. Do not light matches near a gas smell. Shut the main valve.'],
    ['o3', 'official', 'true', 1, 5, 90, 'days:5', 'Emergency management: damaged roads are being cleared in order: hospital, water plant, highway. Backroads last.'],
    ['h1', 'ham', 'true', 2, 0, 60, 'active', 'Ham net: the interstate bridge dropped into the river. Fires burning downtown. Aftershocks every few hours.'],
    ['t1', 'trade', 'true', 1, 0, 60, 'active', 'Trader: tarps, lumber and nails are all I\'m taking. I\'ll trade water and canned goods.'],
    ['r1', 'rumor', 'true', 3, 0, 60, 'active', 'Ground, moving. Roads, gone. Chimney, down. Crack across the Millers\' place.'],
    ['r2', 'rumor', 'false', 1, 0, 60, 'lifted', 'Big one\'s over. No more aftershocks. Scientists say. Sleep inside tonight.'],
    ['r3', 'rumor', 'false', 1, 0, 60, 'relief', 'Engineers. Bridge up by Thursday. Trucks will cross.'],
    ['l1', 'local', 'true', 2, 0, 60, 'active', 'Slept in the yard. Three nights now. Barn leans. Well\'s muddy.'],
    ['l2', 'local', 'false', 1, 0, 60, 'city', 'City shelter. Hot food and doctors. Everyone\'s heading in.'],
  ],
  crop_blight: [
    ['o1', 'official', 'true', 2, 0, 40, 'active', 'Agriculture department: a blight is spreading through the county, day {d}. Do not move grain, seed or soil between farms.'],
    ['o2', 'official', 'true', 2, 0, 14, 'active', 'Extension: burn or bury infected plants and clean your tools and boots. Keep seed from healthy plants only.'],
    ['o3', 'official', 'true', 1, 5, 90, 'days:5', 'Extension: resistant seed is limited. Do not plant the same crop in the same field next season.'],
    ['h1', 'ham', 'true', 1, 0, 60, 'active', 'Ham net: the same blight is reported across four states. The elevators are rejecting loads.'],
    ['t1', 'trade', 'true', 1, 0, 60, 'price:1.3', 'Feed store: grain is at {p} times normal and no seed to sell. Clean tools and boots before you come in.'],
    ['r1', 'rumor', 'true', 2, 0, 60, 'active', 'Fields black. All of it. Overnight. Wheat looks scorched.'],
    ['r2', 'rumor', 'false', 1, 0, 60, 'lifted', 'Blight dies with the first frost. Plant again by Friday. Heard it twice.'],
    ['r3', 'rumor', 'false', 1, 0, 60, 'relief', 'State truck. Resistant seed. At the grange. Tuesday, free.'],
    ['l1', 'local', 'true', 2, 0, 60, 'active', 'Old Schmidt burned his bottom field. All of it. Smoke all afternoon.'],
    ['l2', 'local', 'false', 1, 0, 60, 'creek', 'Somebody poisoned the creek. That\'s the blight. Don\'t water from it.'],
  ],
  dam_flood: [
    ['o1', 'official', 'true', 3, 0, 40, 'active', 'National Weather Service: a major dam has failed upriver, day {d}. Flood warning for all low ground. Get to high ground now.'],
    ['o2', 'official', 'true', 2, 0, 14, 'active', 'County: roads and bridges along the river are under water. Do not drive through floodwater, it takes cars and people.'],
    ['o3', 'official', 'true', 1, 5, 90, 'days:5', 'Health department: flood water is contaminated. Boil or disinfect all drinking water. Watch for mold and snakes in the mud.'],
    ['h1', 'ham', 'true', 2, 0, 60, 'active', 'Ham net: the crest is moving downstream. Two towns under water already. Rescue boats are working rooftops.'],
    ['t1', 'trade', 'true', 1, 0, 60, 'active', 'Trader: boats, pumps and hip waders at any price. I\'ll swap dry feed and clean water for hands to help.'],
    ['r1', 'rumor', 'true', 3, 0, 60, 'active', 'Water. Up the road. Fast. Get up high. Bottom field\'s a lake.'],
    ['r2', 'rumor', 'false', 1, 0, 60, 'lifted', 'Water\'s falling already. Bridge reopens Thursday. Dry by Saturday.'],
    ['r3', 'rumor', 'false', 1, 0, 60, 'relief', 'Engineers. Pump crew. Generators and sandbags. Tomorrow.'],
    ['l1', 'local', 'true', 2, 0, 60, 'active', 'Lindbergs\' lower field is gone. Mud line to the porch rail. They\'re at the church.'],
    ['l2', 'local', 'false', 1, 0, 60, 'creek', 'Flood water\'s clean. Drink it after a boil. Somebody said.'],
  ],
  supervolcano: [
    ['o1', 'official', 'true', 3, 0, 40, 'active', 'Geological survey: the caldera eruption is the largest in recorded history, day {d}. Heavy ash will fall across the plains.'],
    ['o2', 'official', 'true', 2, 0, 14, 'active', 'Emergency management: ash is abrasive and will choke engines and collapse roofs. Keep roofs swept. Wear a mask.'],
    ['o3', 'official', 'true', 1, 5, 90, 'days:5', 'Extension: a volcanic winter is expected. Little will grow for a year or more. Ration seed and stored food.'],
    ['h1', 'ham', 'true', 2, 0, 60, 'active', 'Ham net: ash is eight inches deep a thousand miles downwind, and it\'s dark by two in the afternoon.'],
    ['t1', 'trade', 'true', 1, 0, 60, 'price:1.3', 'Trader: filters and masks at {p} times and rising. Shovels and tarps go fast.'],
    ['r1', 'rumor', 'true', 3, 0, 60, 'active', 'Ash. Falling. Everywhere. Can\'t breathe. Cattle are choking.'],
    ['r2', 'rumor', 'false', 1, 0, 60, 'lifted', 'Eruption\'s over. Ash stops by Sunday. Sun comes back. Heard it twice.'],
    ['r3', 'rumor', 'false', 1, 0, 60, 'relief', 'Army. Food and masks. Coming up from the south. Tuesday.'],
    ['l1', 'local', 'true', 2, 0, 60, 'active', 'Shoveled the roof twice today. Gray snow. Eight inches on the barn.'],
    ['l2', 'local', 'false', 1, 0, 60, 'city', 'City has shelters. Clear air. People are leaving for it.'],
  ],
  livestock_plague: [
    ['o1', 'official', 'true', 2, 0, 40, 'active', 'State veterinarian: a stock disease is in the county, day {d}. A movement ban is on all animals, feed and manure. Report sick animals at once.'],
    ['o2', 'official', 'true', 2, 0, 14, 'active', 'Agriculture department: infected herds are being culled and buried. Indemnity is paid when funds allow. Quarantine flags mark affected farms.'],
    ['o3', 'official', 'true', 1, 5, 90, 'days:5', 'State veterinarian: clean boots and a footbath at every gate. Keep wild birds and visitors away from stock.'],
    ['h1', 'ham', 'true', 1, 0, 60, 'active', 'Ham net: sale barns are shut in five counties. Trucks are being turned away at the line.'],
    ['t1', 'trade', 'true', 1, 0, 60, 'price:1.3', 'Feed store: meat and eggs are at {p} times normal. Disinfectant and lime are almost gone.'],
    ['r1', 'rumor', 'true', 2, 0, 60, 'active', 'Cattle down. Burning them. Smell, awful. Vets wear suits.'],
    ['r2', 'rumor', 'false', 1, 0, 60, 'lifted', 'Quarantine lifts Friday. Movement ban over. The state vet said.'],
    ['r3', 'rumor', 'false', 1, 0, 60, 'relief', 'State pays full price. For every animal culled. Checks Tuesday.'],
    ['l1', 'local', 'true', 2, 0, 60, 'active', 'Kleins\' whole flock went in two days. Yellow flag on the gate. Stay clear.'],
    ['l2', 'local', 'false', 1, 0, 60, 'creek', 'Creek carries it. Don\'t water the stock from it. Folks say.'],
  ],
  satellite_loss: [
    ['o1', 'official', 'true', 1, 0, 40, 'active', 'Air traffic control: GPS and satellite links have failed. Flights are grounded. Day {d}. Use paper maps and landmarks.'],
    ['o2', 'official', 'true', 1, 0, 14, 'active', 'County: card readers, truck routing and some cell calls are down. Ground-based radio and landlines still work.'],
    ['o3', 'official', 'true', 1, 5, 90, 'days:5', 'Federal agency: the satellites are damaged beyond quick repair. Plan for months of reduced communications.'],
    ['h1', 'ham', 'true', 1, 0, 60, 'active', 'Ham net: no GPS time, so no sync. Ground stations are working. The shortwave bands are the only long link left.'],
    ['t1', 'trade', 'true', 1, 0, 60, 'active', 'Trader: paper maps and compasses are all I want. I\'ll swap diesel and canned goods for a county atlas.'],
    ['r1', 'rumor', 'true', 1, 0, 60, 'active', 'Phone says wrong time. No signal. Nothing. Tractor\'s just a wheel again.'],
    ['r2', 'rumor', 'false', 1, 0, 60, 'lifted', 'Satellites back Friday. Fixed from the ground. Everything works again.'],
    ['r3', 'rumor', 'false', 1, 0, 60, 'relief', 'Replacement fleet. Launching next week. Free service for the county.'],
    ['l1', 'local', 'true', 1, 0, 60, 'active', 'Trucks aren\'t running. Dispatchers can\'t route them. Shelves are thinner.'],
    ['l2', 'local', 'false', 1, 0, 60, 'up:phone', 'Cell service is back, my cousin says. I tried. One bar, then nothing.'],
  ],
  oil_shock: [
    ['o1', 'official', 'true', 2, 0, 40, 'active', 'Energy department: imports have stopped, day {d}. Fuel is rationed: 10 gallons per vehicle per week. Odd and even plate days.'],
    ['o2', 'official', 'true', 2, 0, 14, 'out:fuel', 'County: the pumps are dry. Deliveries go to hospitals, fire and sheriff first. Do not hoard fuel in containers.'],
    ['o3', 'official', 'true', 1, 5, 90, 'days:5', 'Energy department: reserves cover about two months at current rates. Trucking and farm fuel are priority users.'],
    ['h1', 'ham', 'true', 1, 0, 60, 'active', 'Ham net: lines of cars at every pump from here to the coast. Diesel is gone first. Truckers are parked.'],
    ['t1', 'trade', 'true', 1, 0, 60, 'price:1.3', 'Trader: gas is a dollar a cup, if I have any. Horses and bicycles are worth more than trucks this month.'],
    ['r1', 'rumor', 'true', 2, 0, 60, 'active', 'Pumps empty. Miles of cars. Fights at the station.'],
    ['r2', 'rumor', 'false', 1, 0, 60, 'lifted', 'Tankers dock tomorrow. Pumps full by Friday. Prices back down.'],
    ['r3', 'rumor', 'false', 1, 0, 60, 'relief', 'State fuel for farms. A tanker. Up the county road. Tuesday.'],
    ['l1', 'local', 'true', 2, 0, 60, 'active', 'Station put a chain across the lot. Sold out. Walked home with an empty can.'],
    ['l2', 'local', 'false', 1, 0, 60, 'up:fuel', 'Pumps in town have gas again. Pete says. Go quick.'],
  ],
  reactor_meltdown: [
    ['o1', 'official', 'true', 3, 0, 40, 'active', 'Nuclear Regulatory Commission: a reactor accident released radioactive material. Shelter in place and keep windows shut. Day {d}.'],
    ['o2', 'official', 'true', 2, 0, 14, 'active', 'State: take potassium iodide if told to. Keep animals under cover and off pasture. Do not drink milk from grazing cows.'],
    ['o3', 'official', 'true', 1, 5, 90, 'days:5', 'Exclusion zone: a 10-mile zone is closed to everyone. Outside it, wash produce and skin, and stay off bare dirt when it rains.'],
    ['h1', 'ham', 'true', 2, 0, 60, 'active', 'Ham net: the plume is drifting northeast. Counters at 40 miles read ten times background.'],
    ['t1', 'trade', 'true', 1, 0, 60, 'active', 'Trader: potassium iodide and plastic sheeting only. I\'ll trade water, canned goods and clean hay.'],
    ['r1', 'rumor', 'true', 3, 0, 60, 'creek', 'Said stay in. Smell that? Stay in. Creek\'s bad downstream.'],
    ['r2', 'rumor', 'false', 1, 0, 60, 'lifted', 'Accident\'s contained. Everybody can go outside by Friday. Heard it twice.'],
    ['r3', 'rumor', 'false', 1, 0, 60, 'relief', 'State trucks. Clean water and iodine. At the grange. Tuesday.'],
    ['l1', 'local', 'true', 2, 0, 60, 'active', 'Sirens went off. Then the radio. Windows taped. Cows in the barn.'],
    ['l2', 'local', 'false', 1, 0, 60, 'city', 'City\'s fine. Clean air. Open shelters. Folks are driving in.'],
  ],
  global_famine: [
    ['o1', 'official', 'true', 2, 0, 40, 'active', 'Agriculture department: harvests have failed worldwide, day {d}. Grain exports are banned. Rationing by household size begins at county depots.'],
    ['o2', 'official', 'true', 2, 0, 14, 'lt:stores:60', 'County: the grocery gets one delivery a week. Limit two loaves, one bag of rice per household.'],
    ['o3', 'official', 'true', 1, 5, 90, 'days:5', 'State: seed stock is to be saved, not eaten. The county will buy seed at a fair price from anyone who has it.'],
    ['h1', 'ham', 'true', 1, 0, 60, 'active', 'Ham net: ships are not coming in. Food riots in three big cities. The ports are guarded by soldiers.'],
    ['t1', 'trade', 'true', 1, 0, 60, 'price:1.3', 'Trader: flour is {p} times what it was. Salt, rice and beans are what I\'ll take, nothing else.'],
    ['r1', 'rumor', 'true', 2, 0, 60, 'active', 'Ships not coming. Bread, gone. Shelves, bare. Loaf went for twenty dollars.'],
    ['r2', 'rumor', 'false', 1, 0, 60, 'lifted', 'Harvest\'s better than feared. Prices drop next week. Heard it twice.'],
    ['r3', 'rumor', 'false', 1, 0, 60, 'relief', 'State is trucking grain. Every county. Ours gets a load Thursday.'],
    ['l1', 'local', 'true', 2, 0, 60, 'active', 'Church pantry ran out Tuesday. Turned folks away. Some cried.'],
    ['l2', 'local', 'false', 1, 0, 60, 'up:stores', 'Grocery has a full truck coming. Bread and rice. Line up Friday.'],
  ],
  water_war: [
    ['o1', 'official', 'true', 2, 0, 40, 'active', 'State water board: the compact is suspended, day {d}. Headgates on the creek are under watch. Do not take more than your decree.'],
    ['o2', 'official', 'true', 2, 0, 14, 'active', 'County: tanker trucks are escorted by deputies. Ditch riders will check your gate. Do not cut fences or divert flow.'],
    ['o3', 'official', 'true', 1, 5, 90, 'days:5', 'Water board: junior rights are shut off. Boil water from the creek: sickness is reported downstream.'],
    ['h1', 'ham', 'true', 2, 0, 60, 'active', 'Ham net: two counties are trading shots over a canal. Tanker trucks have armed riders now.'],
    ['t1', 'trade', 'true', 1, 0, 60, 'price:1.3', 'Trader: water by the barrel at {p} times last month, bring your own. I won\'t say where it\'s from.'],
    ['r1', 'rumor', 'true', 2, 0, 60, 'active', 'Ditch gates. Guns on the ditch. Don\'t go. Two men in the creek.'],
    ['r2', 'rumor', 'false', 1, 0, 60, 'lifted', 'Water compact is back. Creek runs full by Friday. Everyone gets their share.'],
    ['r3', 'rumor', 'false', 1, 0, 60, 'relief', 'State tankers. Free to every farm on the creek. Tuesday.'],
    ['l1', 'local', 'true', 2, 0, 60, 'active', 'Somebody cut the Millers\' headgate chain. Night. They sat up with a shotgun.'],
    ['l2', 'local', 'false', 1, 0, 60, 'req', 'Water board\'s taking the wells. House by house. Tomorrow, they said.'],
  ],
  cult_takeover: [
    ['o1', 'official', 'true', 2, 0, 40, 'active', 'The Order\'s bulletin: the valley is under the Covenant, day {d}. A Common Store opens at the church. A tithe is due every thirty days.'],
    ['o2', 'official', 'true', 2, 0, 14, 'active', 'County council, voting with the Order: the sheriff\'s deputies will assist the shepherds. Attend the Gathering Sunday. Bring your ledger.'],
    ['o3', 'official', 'true', 1, 5, 90, 'days:5', 'The Order: families who give a tenth are provided for. Those who withhold will be visited by the shepherds.'],
    ['h1', 'ham', 'true', 2, 0, 60, 'active', 'Ham net: the valley church is calling itself the Order. Roadblocks on the county line, men in white armbands.'],
    ['t1', 'trade', 'true', 1, 0, 60, 'active', 'Trader: the Common Store takes goods, but the Order sets the price. I\'ll swap at the crossroads, off the books.'],
    ['r1', 'rumor', 'true', 2, 0, 60, 'active', 'They came to the door. Singing. Don\'t answer. They\'ll come back with a ledger.'],
    ['r2', 'rumor', 'false', 1, 0, 60, 'lifted', 'Order\'s breaking up. Prophet fled in the night. Valley\'s free by the weekend.'],
    ['r3', 'rumor', 'false', 1, 0, 60, 'relief', 'State police. Coming for the shepherds. Tuesday. With a warrant.'],
    ['l1', 'local', 'true', 2, 0, 60, 'active', 'Hansens hung the Covenant flag. Gave away the truck. Say they\'re happy.'],
    ['l2', 'local', 'false', 1, 0, 60, 'up:law', 'Sheriff\'s his own man again. Quit the Order. I haven\'t seen him.'],
  ],
  mass_exodus: [
    ['o1', 'official', 'true', 2, 0, 40, 'active', 'Evacuation command: the coastal and southern counties are evacuating inland, day {d}. Expect heavy traffic and checkpoints on the main roads.'],
    ['o2', 'official', 'true', 2, 0, 14, 'active', 'County: reception centers are full. Hold a place for refugee families at the school gym. Do not block the county road.'],
    ['o3', 'official', 'true', 1, 5, 90, 'days:5', 'State: displaced families may be assigned to host homes. Hosts will be paid when funds allow.'],
    ['h1', 'ham', 'true', 1, 0, 60, 'active', 'Ham net: the interstate is parked in both directions for sixty miles. Walkers on the shoulder.'],
    ['t1', 'trade', 'true', 1, 0, 60, 'price:1.3', 'Trader: food and water are {p} times normal where the columns pass. Gas is gone, but I\'ll swap for tires.'],
    ['r1', 'rumor', 'true', 2, 0, 60, 'active', 'Cars. Bumper to bumper. Everyone leaving. Column of walkers past the gate.'],
    ['r2', 'rumor', 'false', 1, 0, 60, 'lifted', 'Evacuation\'s over. Everybody can go home. Starts Friday, they say.'],
    ['r3', 'rumor', 'false', 1, 0, 60, 'city', 'City takes everyone in. Free housing. Rations. Road\'s open.'],
    ['l1', 'local', 'true', 2, 0, 60, 'active', 'Family from the coast camped in our pasture. Four kids. Walked from the highway.'],
    ['l2', 'local', 'false', 1, 0, 60, 'relief', 'Guard is opening a camp. At the fairgrounds. Hot meals. Tomorrow.'],
  ],
  runaway_heat: [
    ['o1', 'official', 'true', 2, 0, 400, 'active', 'National Weather Service: the heat emergency continues, day {d}. Stay out of the sun from late morning until after dark, and check on the old and the small.'],
    ['o2', 'official', 'true', 2, 0, 1500, 'active', 'The utility: afternoon power is rationed. Do not run ovens or dryers before sundown. Cooling centers close when the power does.'],
    ['o3', 'official', 'true', 1, 5, 1500, 'days:5', 'County: wells are dropping. Lawn watering is banned and farm wells will be metered. Report a dry well to the district.'],
    ['h1', 'ham', 'true', 1, 0, 1500, 'active', 'Ham net: the whole middle of the country is over a hundred and ten and the nights are not cooling. People are heading north, day {d}.'],
    ['t1', 'trade', 'true', 1, 0, 1500, 'price:1.3', 'Trader: ice, fans and shade cloth go for {p} times what they did. Water barrels are the best trade I have.'],
    ['r1', 'rumor', 'true', 1, 0, 1500, 'active', 'Hundred and fifteen at the school. Tar soft on the road. Don\'t go out at noon.'],
    ['r2', 'rumor', 'false', 1, 0, 1500, 'lifted', 'Cool front Friday. Back to normal by the weekend. Heard it on the radio.'],
    ['r3', 'rumor', 'false', 1, 0, 1500, 'relief', 'Power company has a fix. Afternoon power back on Monday, they said.'],
    ['l1', 'local', 'true', 1, 0, 1500, 'active', 'Sleeping on the porch. House is too hot. Kids can\'t sleep. Nobody can.'],
    ['l2', 'local', 'false', 1, 0, 1500, 'up:grid', 'Co-op power is back all day. Go look. Somebody always says that.'],
  ],
  ice_age: [
    ['o1', 'official', 'true', 2, 0, 400, 'active', 'National Weather Service: the cold emergency continues, day {d}. Do not use a stove or a generator indoors. Check roofs for snow load.'],
    ['o2', 'official', 'true', 2, 0, 1500, 'active', 'County: roads are plowed once a day at best. Keep a month of food, water and firewood in the house. Roof collapses are rising.'],
    ['o3', 'official', 'true', 1, 5, 1500, 'days:5', 'State: diesel and propane are limited to heating and farm use. Treated winter fuel is on allocation at the co-op.'],
    ['h1', 'ham', 'true', 1, 0, 1500, 'active', 'Ham net: snow on the ground in six southern states. The whole northern tier is frozen in. Day {d}, no end date.'],
    ['t1', 'trade', 'true', 1, 0, 1500, 'price:1.3', 'Trader: firewood is {p} times normal and I am not selling it for cash. Seed grain and stove pipe are what I want.'],
    ['r1', 'rumor', 'true', 1, 0, 1500, 'active', 'Sun\'s a smudge. Snow\'s been there since the fall. Don\'t count on a spring.'],
    ['r2', 'rumor', 'false', 1, 0, 1500, 'lifted', 'Thaw coming. Two weeks, tops. The weather man said.'],
    ['r3', 'rumor', 'false', 1, 0, 1500, 'relief', 'Fuel convoy on the interstate. Fifty tankers. Free diesel at the county line.'],
    ['l1', 'local', 'true', 1, 0, 1500, 'active', 'Barn roof went at the Petersons. Six head of cattle. Snow too deep to dig out.'],
    ['l2', 'local', 'false', 1, 0, 1500, 'up:grid', 'Co-op power is back. All day, they say. Go look.'],
  ],
};

/** The kind's own lines, as radio lines (the claim and the text are checkable and state-driven). */
export function kindLines(kind: FeltKind): GenLine[] {
  return ROWS[kind].map(r => rowLine(kind, r));
}
export type { Row };
export const KIND_ROWS = ROWS;
