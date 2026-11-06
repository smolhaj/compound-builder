/**
 * "The day it happened": the one-card front page shown when the collapse hits (the clock is paused until the player
 * continues). Pure: the headline is the disaster's own hit line, the rest is read from the state at the hit.
 */
import { DISASTERS, TRACKS, TRACK_NAME, tracksAt, type DisasterKind } from './disaster';
import { daysOfFood } from './needs';
import { calendarOf, type GameState } from './state';

export interface DayCard {
  masthead: string;
  date: string;
  headline: string;
  sub: string;
  /** What is known: the first days, from the track curves. */
  lines: string[];
  /** Where you stand: from the household, the pantry and the people. */
  stand: string[];
  /** One sentence on what the sky and the days will be like. */
  look: string;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTH_START = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];

/** What the days after look like, by disaster (the sky matches sim/collapseLook.ts). */
export const LOOK_LINE: Partial<Record<DisasterKind, string>> = {
  ash_winter: 'Expect a gray sky, ash falling for days and a dim sun for a year or more. The growing season is cut to a quarter.',
  wildfire: 'Expect an orange sky and falling ash for days, and smoke for weeks. Keep the ground around the buildings clear.',
  grid_down: 'Expect dark nights: no light from town, no hum from the road. Your own lamps will show for miles.',
  cyberattack: 'Expect dark nights and dead screens: no power, no cards, no phones. Cash and radio, if anyone has them.',
  solar_flare: 'Expect red and green light in the sky for a few nights, and then a dark, quiet grid.',
  nuclear: 'Expect a sickly haze, gray dust and a long cold. Stay in until the dose drops.',
  drought: 'Expect a dusty, rainless sky and falling wells. Water is the whole game now.',
  pandemic: 'Expect empty roads and a quiet county. Keep your own sick away from the rest.',
  financial: 'Expect closed banks, bare shelves and a county that goes quiet.',
};

export function dayCard(s: GameState): DayCard | null {
  const d = s.disaster, def = d.kind ? DISASTERS[d.kind] : undefined;
  if (!d.kind || !def) return null;
  const cal = calendarOf(s.clock, d.hitAt);
  let m = 11;
  while (m > 0 && cal.doy <= MONTH_START[m]) m--;
  const cause = def.variants.find(v => v.id === d.variant)?.name ?? def.name;
  const headline = def.hit[0].replace('{cause}', cause);
  // what falls in the first three days
  const t3 = tracksAt(d, d.hitAt + 3);
  const gone = TRACKS.filter(k => t3[k] < 0.5).map(k => TRACK_NAME[k].toLowerCase());
  const lines = gone.length ? [`Within three days: ${gone.slice(0, 5).join(', ')}${gone.length > 5 ? ' and more' : ''} are gone or going.`] : ['The services are straining but still running.'];
  const back = Math.min(...Object.values(d.back).map(Number), Infinity);
  lines.push(Number.isFinite(back) ? `Nobody says when it comes back. The earliest hope is about ${back < 14 ? 'a couple of weeks' : back < 60 ? `${Math.round(back / 7)} weeks` : `${Math.round(back / 30)} months`}.` : 'Nobody says when it comes back, or if.');
  const alive = s.personState.filter(p => p.needs.died == null).length;
  const food = daysOfFood(s);
  const stand = [
    `${alive} ${alive === 1 ? 'person' : 'people'} on the place, ${Number.isFinite(food) ? `${Math.floor(food)} ${Math.floor(food) === 1 ? 'day' : 'days'} of food on the shelves` : 'no mouths to feed'}.`,
    s.utilities.lit.length > 0 ? 'Some of your own power is running.' : 'No power of your own is running.',
  ];
  return {
    masthead: 'THE VALLEY LEDGER', date: `${MONTHS[m]} ${cal.doy - MONTH_START[m]}, ${cal.year}`, headline,
    sub: cause.charAt(0).toUpperCase() + cause.slice(1) + '.', lines, stand, look: LOOK_LINE[d.kind] ?? 'Nothing will be the same for a while.',
  };
}
