/**
 * The peacetime news ticker and the seasonal "year in review". Data-driven:
 * a generic pool, a pool for each season and each region, and quiet "world
 * clues" (the price of diesel, a freighter held up, a grid alert somewhere
 * else) that say nothing about what is coming. A line is never repeated
 * while it is still on the ticker, and the pools together run to a few
 * hundred days of fresh news. Pure (tested).
 */
import type { RegionId } from './regions';

export type Season = 'spring' | 'summer' | 'fall' | 'winter';
export const seasonOf = (doy: number): Season => (doy >= 60 && doy < 152 ? 'spring' : doy >= 152 && doy < 244 ? 'summer' : doy >= 244 && doy < 335 ? 'fall' : 'winter');

export const GENERIC_NEWS: readonly string[] = [
  'County fair this weekend: pie contest, tractor pull.', 'School board approves the new bus route.', 'Road crews patching the county road for the next two weeks.',
  'High school football: the Miners win at home, 21–14.', 'Library book sale Saturday.', 'Fire danger "moderate"; burn permits still issued.',
  'The volunteer fire department holds its pancake breakfast Sunday.', 'Grange hall rented out for the Hendersons\' fortieth anniversary.', 'The feed store is open late Fridays now.',
  'County commissioners argue over the culvert on Miller Road again.', 'A new dentist has opened in town, Tuesdays and Thursdays.', 'Lost: a brown heeler, answers to Biscuit. Call the vet.',
  'The post office has new hours; the line is still long.', 'Church supper Wednesday: potluck, bring a dish.', 'Rural broadband survey in the mail: please answer.',
  'The sheriff reminds everyone to lock their trucks.', 'The co-op reports a quiet month on the lines.', 'Town council votes to repave Main Street next year.',
  'Farm bureau meeting moved to the fire hall.', 'A pickup rolled on Route 9; no one hurt.', 'Dairy prices down a little again.', 'The junior rodeo is Saturday at the arena.',
];

export const SEASON_NEWS: Record<Season, readonly string[]> = {
  spring: ['Frost expected again tonight; cover your tomatoes.', 'Calving season: the vet is booked solid.', 'The creek is running high with snowmelt.', 'Seed swap at the grange Saturday.', 'Mud season: the county road is posted for weight limits.', 'The first hay fields are being fertilized.', 'Spring cleanup day at the cemetery.', 'Gardeners are warned: the last frost date is a rumor.'],
  summer: ['Haying is in full swing; mind the slow tractors on the road.', 'Fire danger "high"; no burning until further notice.', 'The swimming hole at the bridge is open again.', 'Fourth of July parade lineup announced.', 'Thunderstorms this afternoon; hail possible.', 'Sweet corn at the stand by Friday.', 'Water use advisory in effect for the town.', 'The county fair queen was crowned Saturday.'],
  fall: ['Elk and deer season opens soon; tags on sale at the courthouse.', 'Apple picking at the orchard through the end of October.', 'Farmers are racing the first frost to finish the harvest.', 'School football under the lights Friday.', 'Leaf pickup begins in town next week.', 'Hunters are reminded to wear orange.', 'The first snow dusted the high ridges overnight.', 'Wood-cutting permits are going fast this year.'],
  winter: ['Snow plows are out; the county road is one lane.', 'Chains required over the pass tonight.', 'The warming center at the church is open nights.', 'Propane deliveries are running a week behind.', 'Sledding on the school hill after three.', 'Pipes froze across town last night; check yours.', 'Holiday bazaar at the grange Saturday.', 'The feed store reminds you to bring stock tanks a heater.'],
};

export const REGION_NEWS: Record<RegionId, readonly string[]> = {
  mountain_west: ['Elk herds are moving down early this year.', 'The ski hill sold more season passes than last year.', 'Wolf sightings reported near the north forest road.', 'Irrigation ditches turn on Monday.', 'Forest Service closes a trailhead for a bear.', 'Ranchers meet about grazing leases.'],
  appalachia: ['Ramps are up early in the hollows.', 'The bluegrass festival adds a second night.', 'Black bears are raiding bird feeders again in the county.', 'Coal truck traffic slows the valley road.', 'Creek flooding closed a low-water bridge.', 'The mountain road department is clearing slides.'],
  desert: ['A haboob dust wall rolled through the valley Tuesday.', 'Monsoon storms flooded two washes.', 'The well drillers have a three-month waiting list.', 'Javelina are in the orchards again.', 'Triple-digit heat advisory through Thursday.', 'The dry lake road is closed after the storm.'],
  north_woods: ['The ice on the lake is thick enough for trucks.', 'Loons are back on the lake.', 'Black flies are terrible this year.', 'Moose on the highway: slow down after dark.', 'The logging road is open again after thaw.', 'Wild rice harvest opens Saturday.'],
  plains: ['Wheat harvest is two weeks early.', 'A tornado watch is posted until ten tonight.', 'The grain elevator is paying a little more for corn.', 'Center pivots are running day and night.', 'A dust devil took a roof off a shed near the county line.', 'Hail wiped out a field east of town.'],
  pnw: ['Another atmospheric river is lined up for the weekend.', 'Salmon are running early in the river.', 'Slides closed the coast highway again.', 'Mushroom pickers are out in the burn scar.', 'Fog keeps the ferry docked this morning.', 'The timber mill is hiring seasonal crews.'],
  new_england: ['Sugaring season: the sap is running early.', 'Town meeting votes down the new plow truck.', 'Stone walls are being rebuilt along the old pasture road.', 'Leaf peepers have filled the inn again.', 'Nor\'easter on the way: stock up on firewood.', 'The covered bridge is closed for repairs.'],
  ozarks: ['The spring-fed creek is clear and cold.', 'Chiggers are bad this year; wear boots.', 'Floaters filled the river on the weekend.', 'A cave tour company opens for the season.', 'Ice storm took down lines along the ridge road.', 'The pecan crop looks thin.'],
  hill_country: ['Bluebonnets are out along the ranch road.', 'Cedar fever has the whole county sneezing.', 'A flash flood closed the low-water crossing.', 'Peaches are early at the roadside stands.', 'Wild hogs tore up another hayfield.', 'The deer lease sign-up is open.'],
  rust_belt: ['The old plant shut a second shift again.', 'Soybean prices ticked up at the elevator.', 'The high school marching band wins at state.', 'Lake-effect snow is closing roads east of town.', 'A new warehouse is hiring on the county line.', 'The river rose over the boat ramp.'],
  upper_midwest: ['The lake effect snow is on the way.', 'Sweet corn and brats at the church fish fry.', 'The dairy co-op voted on its new milk price.', 'Ice fishing shanties are out on the bay.', 'Cranberry harvest begins next week.', 'A derecho knocked out power to the north end.'],
};

/** Quiet world clues: ordinary news from elsewhere, a little unsettled, never about what is coming. */
export const WORLD_NEWS: readonly string[] = [
  'Diesel up eleven cents at the co-op pumps.', 'Shipping delays at a coastal port ripple into the feed store orders.', 'A grid operator in another state asked customers to cut back this evening.',
  'Egg prices bounce around again; the grocery limits two cartons.', 'A heat wave overseas pushes up wheat prices.', 'Two banks in the city raised their minimum balances.',
  'The county asked for volunteers for the emergency preparedness day.', 'Ham radio club reports a good night for long-distance contacts.', 'Fertilizer prices are the talk at the feed store.',
  'A cyberattack on a hospital chain two states over delayed surgeries.', 'The farm bill stalls in Washington; again.', 'Fuel trucks were late this week; the station posted a limit.',
  'A solar storm watch has radio operators on alert tonight.', 'Truckers\' strike talk in the news; nothing yet.', 'Insurers are pulling out of more rural counties.',
  'The airline cancelled flights out of the regional field for the week.', 'A water main break in a nearby city has them boiling water.', 'Some stores in the city are rationing baby formula again.',
  'The paper says the national debt passed another milestone.', 'A neighboring county had a day-long blackout from a transformer fire.',
];

/** All peacetime lines that fit this season and region. */
export function peacePool(season: Season, region: RegionId): string[] {
  return [...GENERIC_NEWS, ...SEASON_NEWS[season], ...(REGION_NEWS[region] ?? []), ...WORLD_NEWS];
}

/**
 * A line for today that is not on the ticker already. `r` is the day's
 * random; the regional, seasonal and world lines are weighted up a little
 * so a long peace reads like a year of weather rather than six repeats.
 */
export function pickPeaceNews(r: () => number, season: Season, region: RegionId, recent: readonly string[]): string {
  const recentSet = new Set(recent);
  const pool = peacePool(season, region).filter(x => !recentSet.has(x));
  const list = pool.length ? pool : peacePool(season, region);
  // seasonal and regional lines count double
  const weighted = [...list, ...list.filter(x => SEASON_NEWS[season].includes(x) || (REGION_NEWS[region] ?? []).includes(x))];
  return weighted[Math.floor(r() * weighted.length)];
}

export interface ReviewFacts {
  season: Season;
  year: number;
  /** Years the family has been on the place (0 = the first). */
  years: number;
  buildings: number;
  people: number;
  dogs: number;
  daysOfFood: number;
  openShare: number;
  firewood: number;
  money: number;
  deaths: number;
}

const usd = (n: number) => '$' + Math.round(Math.abs(n)).toLocaleString('en-US');
const days = (d: number) => (Number.isFinite(d) ? (d >= 365 ? `${(d / 365).toFixed(1)} years` : `${Math.round(d)} days`) : 'plenty');

/**
 * One line for the log at the start of each season: where the place stands,
 * the facts that matter most that season (the garden in spring, the stores in
 * fall, the woodpile in winter). Different words each season; no number is a raw float.
 */
export function seasonReviewLine(f: ReviewFacts): string {
  const head = `${f.season[0].toUpperCase()}${f.season.slice(1)} ${f.year}`;
  const home = `${f.buildings} building${f.buildings === 1 ? '' : 's'} standing, ${f.people} at the table${f.dogs ? `, ${f.dogs} dog${f.dogs === 1 ? '' : 's'}` : ''}`;
  const wall = f.openShare <= 0 ? 'the line is closed' : f.openShare >= 0.99 ? 'no wall yet' : `the wall is ${Math.round((1 - f.openShare) * 100)}% closed`;
  switch (f.season) {
    case 'spring': return `${head}, in review: ${home}; food for ${days(f.daysOfFood)}; ${wall}. Time to plant.`;
    case 'summer': return `${head}, in review: ${home}; ${wall}; ${usd(f.money)} in the bank. The long days are for building.`;
    case 'fall': return `${head}, in review: ${f.years < 1 ? 'the first harvest' : `year ${f.years + 1} on the place`}; food put by for ${days(f.daysOfFood)}; ${f.firewood >= 1 ? `${Math.floor(f.firewood)} ricks of firewood` : 'no firewood yet'}; ${wall}.`;
    case 'winter': return `${head}, in review: ${home}; ${f.firewood >= 1 ? `${Math.floor(f.firewood)} ricks of firewood left` : 'the woodpile is bare'}; food for ${days(f.daysOfFood)}.${f.deaths ? ` ${f.deaths} lost on the place so far.` : ''}`;
  }
}

/** First day of a season (day of year). */
export const SEASON_START: Record<Season, number> = { spring: 60, summer: 152, fall: 244, winter: 335 };
export const isSeasonStart = (doy: number): Season | null => (Object.entries(SEASON_START).find(([, d]) => d === doy)?.[0] as Season | undefined) ?? null;
