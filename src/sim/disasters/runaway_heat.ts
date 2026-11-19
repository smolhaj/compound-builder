/**
 * Runaway heat (docs/design/climate_disasters.md section 1, owner-approved 2026-11-19). A slow collapse of the outdoors: the summer high climbs
 * for four game years (three or six on Hardcore or Cozy), the nights stop cooling, the grid fails on the hot afternoons and then for whole
 * summers, outdoor crops scorch and the middle of the day closes to work. Winters turn mild. Nothing comes back inside a run.
 *
 * The numbers live in climateCurve.ts (region tables, wet-bulb, work gate, grow factor) and slowClimate.ts (difficulty, the day's lift). This
 * module is the hooks: the lift reaches every night through housing.meanLow, outdoor work through heatWork.ts (engine), wells through
 * effects.wellYield, thirst through thirst.heatFactor; this file adds the grid's seasonal failure, crops, prices, people, the sky, the radio and the card.
 *
 * Per-kind state lives in `disaster.fx.runaway_heat` (JSON-safe, no save bump): `coolUntil` (the day a wet cool room is kept until), `ill`
 * (heat exhaustion cases so far), `told` (one-time lines already said).
 */
import type { FxCard, KindFx } from '../disasterFx';
import type { GameState } from '../state';
import { calendarOf, dayIndex } from '../state';
import { applyLevel, kindBag } from '../physical';
import { isFinished } from '../construction';
import { startCase } from '../medical';
import { bulletin, clamp01, shelf, warnFrac, type Line } from './kit';
import { climateTune, dayPeakF, heatPeakDeltaF, summerness, slowYears, HEAT_ILLNESS_INDOOR_F, HEAT_ILLNESS_P, HOUSE_SHADE_F, heatGrow, wetBulbNow } from '../slowClimate';
import { HEAT_PEAK_F, HEAT_RAMP_YEARS, NO_OUTDOOR_SLEEP_WB_F, outdoorWorkShare } from '../climateCurve';

export interface HeatState { coolUntil: number; ill: number; told: string[] }
export const heatOf = (s: GameState): HeatState => kindBag<HeatState>(s, 'runaway_heat', () => ({ coolUntil: -1, ill: 0, told: [] }));
const doyOf = (s: GameState): number => calendarOf(s.clock).doy;
/** Water a wet cool room takes (liters of stored water) and how many days it lasts. */
export const COOL_ROOM_L = 150, COOL_ROOM_DAYS = 3;

/** The grid's share on a hot day (design doc 1.1: afternoons at 0.1 to 0.4 from year 1, whole summers dark from year 3): 1 outside summer. */
export function heatGridK(years: number, doy: number): number {
  const ramp = clamp01((years - 0.5) / 2.5);
  return 1 - 0.9 * ramp * Math.pow(summerness(doy), 2);
}

/** Today's afternoon peak (F) and the wet-bulb at that peak. */
export function todaysHeat(s: GameState): { peakF: number; wetBulbF: number; workShare: number } {
  const peakF = dayPeakF(s, doyOf(s)), wb = wetBulbNow(s, peakF, peakF);
  return { peakF, wetBulbF: wb, workShare: outdoorWorkShare(wb) };
}

/** True when someone sleeps or shelters where the earth keeps them cool: a finished bunker or root cellar. */
const hasEarthRoom = (s: GameState): boolean => s.structures.some(st => isFinished(st) && (st.kind.startsWith('bunker_') || st.kind === 'root_cellar'));

/**
 * Heat illness chance per person a day (PROPOSED, doc 1.3: 3 to 6 percent) when the house is at 95 F or more and nothing cools it. The house
 * runs HOUSE_SHADE_F under the afternoon peak; grid power for a window unit, a wet cool room and an earth room each cut it.
 */
export function heatIllnessChance(s: GameState, kidOrElder: boolean): number {
  const peak = dayPeakF(s, doyOf(s));
  if (peak - HOUSE_SHADE_F < HEAT_ILLNESS_INDOOR_F) return 0;
  const over = clamp01((peak - HOUSE_SHADE_F - HEAT_ILLNESS_INDOOR_F) / 20);
  let p = HEAT_ILLNESS_P * (1 + over) * (kidOrElder ? 2 : 1) * climateTune(s.disaster.difficulty).amp;
  if (s.disaster.tracks.grid > 0.4 && s.utilities.grid) p *= 0.4;
  if (heatOf(s).coolUntil >= dayIndex(s.clock.t)) p *= 0.35;
  if (hasEarthRoom(s)) p *= 0.25;
  return Math.min(0.5, p);
}

const LINES: Line[] = [
  [0, 20, 'the weather service says this is no heat wave: the pattern has not broken in a month.', 2],
  [10, 400, 'the utility asks everyone to keep the house shut and the lights off from noon to nine.', 2],
  [60, 700, 'crops outdoors are scorching; the extension office says plant in October and harvest in March.', 1],
  [200, 900, 'wells are dropping across the county; the water district has banned lawn watering for good.', 2],
  [300, 1500, 'a wet-bulb warning is posted: no outdoor work from ten in the morning until after dark.', 3],
  [400, 3000, 'the power company has cut service on summer afternoons; it comes back after sundown.', 2],
  [600, 3000, 'trains north are full; a second wave of families is leaving for Canada and the high country.', 2],
  [900, 3000, 'the last summer feed-store in the county shut; livestock are being sold for what they bring.', 2],
];

export const fx: KindFx = {
  legacy: { medical: 'daily: heat exhaustion cases (startCase), cooling cuts them' },
  onWarning(s) {
    const t = todaysHeat(s);
    return [`The weather service reports a record heat dome: ${Math.round(t.peakF)} degrees today, with a wet-bulb reading of ${Math.round(t.wetBulbF)}. Buy shade cloth, fans and water, and look at where the cool places on your land are.`];
  },
  onHit(s) {
    const out: string[] = [];
    out.push('The heat is not breaking. Plan the day around it: hard work at dawn and after dark, shade and water at midday, and a cool place for the old and the small.');
    // neighbors begin to talk of leaving north
    if (s.neighbors.some(n => n.status === 'home')) out.push('Neighbors up the road are talking about selling and heading north.');
    return out;
  },
  daily(s, ctx) {
    const H = heatOf(s), out: string[] = [], yrs = slowYears(s);
    // heat illness (PROPOSED teeth): the house too hot and nothing cooling it
    for (let i = 0; i < s.people.length; i++) {
      const p = s.people[i];
      if (s.personState[i]?.needs.died != null) continue;
      if (ctx.r() < heatIllnessChance(s, p.kid || p.age >= 65) && startCase(s, p.id, 'flu', 24, { src: 'house' }, 'heat exhaustion')) { H.ill++; out.push(`${p.first} has heat exhaustion: the house was too hot to sleep in.`); }
    }
    // neighbors leave for the north, a little more each year
    if (yrs > 0.5 && ctx.r() < 0.01 * Math.min(3, yrs)) {
      const home = s.neighbors.filter(n => n.status === 'home');
      if (home.length) { const n = home[Math.floor(ctx.r() * home.length)]; n.status = 'left'; out.push(`${n.name.charAt(0).toUpperCase()}${n.name.slice(1)} loaded up the truck and left for the north.`); }
    }
    // one-time markers of the years
    const mark = (key: string, text: string, yr: number) => { if (yrs >= yr && !H.told.includes(key) && ctx.once(`heat_${key}`)) { H.told.push(key); out.push(text); } };
    mark('y1', 'A year of it. The summer afternoons now run about ten degrees hotter than they used to, and the nights barely cool.', 1);
    mark('y2', 'Two years in. Outdoor crops fail some years, wells are dropping, and the grid is out on the hot afternoons.', 2);
    mark('y3', 'The middle of the day is closed. Work is done at dawn and after dark; the hens have stopped laying in the summer.', 3);
    return out;
  },
  structureDamage(s, ctx) {
    // film, glass and thin plastic cook: a glasshouse or a tunnel with no cooling splits its covering on the hottest days (PROPOSED, doc 1.2)
    const out: string[] = [], peak = dayPeakF(s, doyOf(s));
    if (peak < 105) return out;
    const p = 0.012 * clamp01((peak - 105) / 20);
    for (const st of s.structures) {
      if (!isFinished(st) || !['greenhouse', 'greenhouse_heated', 'polytunnel', 'high_tunnel'].includes(st.kind)) continue;
      if (ctx.r() < p) { const line = applyLevel(s, st, 1, 'wind', 'The covering cooked and split in the heat.'); if (line) out.push(line); }
    }
    return out;
  },
  priceMods(s) {
    if (s.clock.t < s.disaster.hitAt) return 1 + 0.25 * warnFrac(s);
    const yrs = Math.max(0, slowYears(s));
    return 1.25 + 0.2 * Math.min(HEAT_RAMP_YEARS, yrs) + 0.6 * (1 - shelf(s));
  },
  serviceMods(s) {
    if (s.clock.t < s.disaster.hitAt) return {};
    return { grid: heatGridK(slowYears(s), doyOf(s)) };
  },
  supplyMods(s) {
    return { grow: heatGrow(s, doyOf(s)) };   // (the heat's lift to the nights goes through housing.meanLow, not here)
  },
  encounterWeights(s, { scale }) {
    const y = clamp01(slowYears(s) / HEAT_RAMP_YEARS);
    scale('refugees', 1 + 0.8 * y); scale('stranded', 1 + 0.6 * y); scale('looters', 1 + 0.3 * y);
  },
  npcMods(s) { return 1 + 0.5 * clamp01(slowYears(s) / HEAT_RAMP_YEARS) * (0.5 + 0.5 * summerness(doyOf(s))); },
  radioBulletins(s, ctx) {
    const t = todaysHeat(s);
    if (ctx.r() < 0.35) {
      const lines = [`NWS: today's high is ${Math.round(t.peakF)} degrees with a wet-bulb of ${Math.round(t.wetBulbF)}${t.wetBulbF >= NO_OUTDOOR_SLEEP_WB_F ? '. Do not sleep outdoors tonight' : ''}.`, `Outdoor work: about ${Math.round(100 * t.workShare)} percent of a normal day is safe in the open at the hottest hour.`];
      return { text: lines[Math.floor(ctx.r() * lines.length)], tone: t.workShare < 0.4 ? 3 : 2 };
    }
    return bulletin(LINES, ctx);
  },
  look(s, look) {
    // (the washed, hot sky is the profile row in collapseLook; this adds the haze the day's heat deserves)
    const k = clamp01(heatPeakDeltaF(s) / Math.max(1, HEAT_PEAK_F[s.site.region][2] - HEAT_PEAK_F[s.site.region][0]));
    return { haze: Math.max(look.haze, 0.35 + 0.5 * k), sat: look.sat * (1 - 0.1 * k), contrast: look.contrast - 0.04 * k };
  },
  oasisWeight(s) { return 0.35 * clamp01(slowYears(s) / HEAT_RAMP_YEARS) * (1 - Math.min(s.disaster.tracks.grid, s.disaster.tracks.stores)); },
  cards(s): FxCard[] {
    if (s.clock.t < s.disaster.hitAt) return [];
    const t = todaysHeat(s), H = heatOf(s), today = dayIndex(s.clock.t);
    if (t.peakF - HOUSE_SHADE_F < HEAT_ILLNESS_INDOOR_F || H.coolUntil >= today) return [];
    const have = s.utilities.storedL >= COOL_ROOM_L;
    return [{
      id: 'heat_cool_room', title: `${Math.round(t.peakF)} degrees today: the house is too hot to sleep in`,
      why: `Wet-bulb ${Math.round(t.wetBulbF)}. About ${Math.round(100 * t.workShare)} percent of a work hour is safe outdoors at the peak. Hang wet sheets in one shaded room and keep everyone in it through the afternoon: it cuts heat illness about two thirds for ${COOL_ROOM_DAYS} days and uses ${Math.round(COOL_ROOM_L / 3.785)} gallons of stored water.${have ? '' : ' There is not enough stored water.'}`,
      urgency: 55, tone: t.workShare < 0.3 ? 'alarm' : undefined,
      acts: [{ label: 'Set up a wet cool room', choice: 'heat:cool' }],
    }];
  },
  choose(s, c) {
    if (c !== 'heat:cool') return null;
    if (s.utilities.storedL < COOL_ROOM_L) return 'There is not enough stored water to wet the sheets.';
    s.utilities.storedL -= COOL_ROOM_L;
    heatOf(s).coolUntil = dayIndex(s.clock.t) + COOL_ROOM_DAYS;
    return `The family hung wet sheets in the shaded room and kept the afternoon there: ${Math.round(COOL_ROOM_L / 3.785)} gallons of water, good for ${COOL_ROOM_DAYS} days.`;
  },
};
