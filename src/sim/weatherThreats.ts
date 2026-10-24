/**
 * Severe weather (decided with the user: "weather threats"). Rare, seeded
 * storms by region and season, a few notable ones a year at most. Pure.
 *
 *  Blizzard    cold regions, Dec–mid-March: snowed in 2–4 days. No
 *              deliveries, nobody gets to the day job, a rick of firewood
 *              extra a day, and a roof that already needs work may cave.
 *  Tornado / derecho  Plains and Upper Midwest, April–July: a watch the day
 *              before, then it hits one structure (back to its roof stage).
 *              With a root cellar, bunker or safe room nobody is hurt.
 *  Hail        Plains and the high country in summer: the garden and the
 *              field are stripped (replant) and half the fresh food is lost.
 *  Heat wave   July–August, 3–5 days: more water used; the elderly lose
 *              health in a house with no power for fans.
 *  Flood       a creek through the place, in the spring melt: a flood watch
 *              a day ahead, then a low structure (cellar, garden, field,
 *              outhouse, hand well) is damaged.
 *  Lightning fire  dry country in a dry summer: a red-flag warning, then a
 *              damage roll on an outbuilding unless the timber round the
 *              place has been cleared (20+ trees felled).
 */
import { calendarOf, dayIndex, type GameState, type Structure } from './state';
import { REGIONS, type RegionId } from './regions';
import { blueprintOf, isFinished } from './construction';
import { insuranceClaim } from './paperwork';
import { mulberry32, pick } from './rng';

export type WeatherKind = 'blizzard' | 'tornado' | 'derecho' | 'hail' | 'heat_wave' | 'flood' | 'lightning_fire';

export interface WeatherEvent { kind: WeatherKind; /** Day it hits. */ at: number; /** Last day it lasts. */ until: number }

export interface WeatherState {
  /** The storm on now, or warned of (at in the future). */
  active: WeatherEvent | null;
  /** Day the last storm ended (−999 none yet). */
  last: number;
  /** The last hail: year and day of year (it takes that season's crop, not the beds). */
  hail?: { year: number; doy: number };
}

/** Days of quiet after a storm before another can come. */
export const GAP_DAYS = 45;
/** Elderly: from this age the heat takes health without power for fans. */
export const ELDER_AGE = 65;

const PLAINS: readonly RegionId[] = ['plains', 'upper_midwest'];
const LOW = ['root_cellar', 'garden', 'field', 'outhouse', 'well_hand'];
const label = (k: string) => k.replace(/_/g, ' ');

export const weatherOf = (s: GameState): WeatherState => (s.weather ??= { active: null, last: -999 });

/** Snowed in today (no deliveries, no day job). */
export function snowedIn(s: GameState, day = dayIndex(s.clock.t)): boolean {
  const a = s.weather?.active;
  return !!a && a.kind === 'blizzard' && day >= a.at && day <= a.until;
}

/** Chance a day of each storm here, today. */
export function odds(s: GameState, doy: number): Partial<Record<WeatherKind, number>> {
  const R = REGIONS[s.site.region];
  const o: Partial<Record<WeatherKind, number>> = {};
  if (R.cold >= 0.8 && (doy >= 335 || doy <= 75)) o.blizzard = 0.01 * R.cold;
  if (PLAINS.includes(s.site.region) && doy >= 100 && doy <= 210) { const p = s.site.region === 'plains' ? 0.003 : 0.002; o.tornado = p * 0.6; o.derecho = p * 0.4; }
  if (doy >= 140 && doy <= 240) o.hail = PLAINS.includes(s.site.region) ? 0.006 : s.site.region === 'mountain_west' ? 0.003 : 0.001;
  if (doy >= 180 && doy <= 240) o.heat_wave = s.site.region === 'desert' || s.site.region === 'plains' ? 0.008 : R.cold <= 0.7 ? 0.005 : 0.003;
  if (s.site.creek && doy >= 60 && doy <= 170) o.flood = 0.0015 * Math.min(2, R.rainMm / 700);
  if (doy >= 180 && doy <= 260 && (R.rainMm < 600 || (R.odds.wildfire ?? 1) >= 1.5)) o.lightning_fire = 0.003 * (R.odds.wildfire ?? 1);
  return o;
}

/** Warning a day ahead (watches and forecasts); hail and blizzards come with a same-day warning. */
const AHEAD: Record<WeatherKind, number> = { blizzard: 1, tornado: 1, derecho: 1, hail: 0, heat_wave: 1, flood: 1, lightning_fire: 0 };
const LASTS: Record<WeatherKind, [number, number]> = { blizzard: [2, 4], tornado: [0, 0], derecho: [0, 0], hail: [0, 0], heat_wave: [3, 5], flood: [1, 2], lightning_fire: [1, 1] };
const WARN: Record<WeatherKind, string> = {
  blizzard: 'Blizzard warning for the county: heavy snow and drifting starting tomorrow.',
  tornado: 'Tornado watch for the county tomorrow afternoon.',
  derecho: 'Severe storm watch tomorrow: a line of damaging winds coming across the state.',
  hail: 'Severe thunderstorm warning: large hail possible this afternoon.',
  heat_wave: 'Excessive heat warning starting tomorrow: highs over 100°F for days.',
  flood: 'Flood watch: the creek is running high and more rain is coming.',
  lightning_fire: 'Red flag warning: dry lightning tonight, and a fire was spotted on the ridge.',
};

function sheltered(s: GameState): boolean {
  return s.stock.safe_room > 0 || s.structures.some(st => isFinished(st) && (st.kind === 'root_cellar' || st.kind.startsWith('bunker_')));
}

/** Knock a structure back to its roof stage (or its last stage), with an insurance claim. */
function damage(s: GameState, st: Structure, share: number, what: string, out: string[]): void {
  const stages = blueprintOf(st).stages;
  const roof = stages.findIndex(x => x.id === 'roof');
  st.stage = roof >= 0 ? roof : stages.length - 1;
  st.done = 0; st.supplied = false; st.finishedAt = null;
  out.push(`${what} The ${label(st.kind)} has to be ${roof >= 0 ? 're-roofed' : 'redone'}.`);
  const paid = insuranceClaim(s, st, share);
  if (paid) out.push(paid);
}

function news(s: GameState, text: string, tone: 0 | 1 | 2 | 3): void {
  const n = s.disaster.news;
  n.push({ t: s.clock.t, text, tone });
  if (n.length > 40) n.splice(0, n.length - 40);
}

/** The storm's first day. */
function hit(s: GameState, e: WeatherEvent, r: () => number, out: string[]): void {
  const fin = s.structures.filter(isFinished);
  if (e.kind === 'blizzard') {
    out.push('Blizzard: the roads are drifted shut and we are snowed in.');
    for (const st of fin) if ((st.fixes ?? []).some(f => f.part === 'roof' && f.done < f.hours) && r() < 0.5) { damage(s, st, 0.3, 'The snow load was too much for the old roof.', out); break; }
  } else if (e.kind === 'tornado' || e.kind === 'derecho') {
    const targets = fin.filter(st => !st.kind.startsWith('bunker_') && st.kind !== 'root_cellar');
    if (targets.length) damage(s, pick(r, targets), 0.4, e.kind === 'tornado' ? 'A tornado came through!' : 'A derecho tore through: 90 mph straight-line winds.', out);
    else out.push(e.kind === 'tornado' ? 'A tornado passed a half mile off.' : 'A derecho blew through and flattened the timber.');
    const safe = sheltered(s);
    for (const p of s.people) {
      const n = s.personState.find(x => x.id === p.id)?.needs;
      if (!n || n.died != null || r() > 0.08) continue;
      if (safe) { out.push(`${p.first} was in the cellar when it hit and came out fine.`); continue; }
      n.hurt.push({ what: 'hurt by flying debris in the storm', sev: 30 });
      out.push(`${p.first} was hurt by flying debris.`);
    }
  } else if (e.kind === 'hail') {
    // the crop standing in the beds is shredded; the beds are still there and get replanted from the seed put by
    const beds = fin.filter(st => st.kind === 'garden' || st.kind === 'field');
    const c = calendarOf(s.clock);
    weatherOf(s).hail = { year: c.year, doy: c.doy };
    const lost = Math.floor(s.stock.fresh / 2);
    s.stock.fresh -= lost;
    out.push(beds.length ? `Hail stripped the ${[...new Set(beds.map(b => label(b.kind)))].join(' and ')}. Replanting; this year's crop will be short.` : 'Hail the size of golf balls; nothing planted to lose.');
  } else if (e.kind === 'heat_wave') {
    out.push('The heat wave is here.');
  } else if (e.kind === 'flood') {
    const low = fin.filter(st => LOW.includes(st.kind));
    if (low.length) damage(s, pick(r, low), 0.5, 'The creek came over its banks.', out);
    else out.push('The creek came over its banks, but nothing of ours was in the bottom.');
  } else if (e.kind === 'lightning_fire') {
    const cleared = s.forestry.cleared.length >= 20;
    const out_ = fin.filter(st => !st.kind.startsWith('bunker_') && st.kind !== 'garden' && st.kind !== 'field');
    if (!cleared && out_.length && r() < 0.35 * Math.min(1.5, s.site.timber)) damage(s, pick(r, out_), 0.6, 'The fire came through the timber to the buildings.', out);
    else out.push(cleared ? 'The fire burned up the ridge and lay down at the cleared ground round the place.' : 'The fire burned along the ridge and passed us by.');
  }
}

/** Once a day: maybe a warning, a storm hitting, the days it lasts. */
export function weatherDay(s: GameState): string[] {
  const out: string[] = [];
  const w = weatherOf(s);
  const day = dayIndex(s.clock.t);
  const r = mulberry32(s.seed * 4099 + day * 13 + 7);
  const a = w.active;
  if (a) {
    if (day === a.at) hit(s, a, r, out);
    if (day >= a.at && day <= a.until) {
      if (a.kind === 'blizzard') {
        if (s.stock.firewood >= 1) s.stock.firewood--;
        for (const o of s.orders) if (o.status === 'ordered' && o.dueAt < s.clock.t + 1) o.dueAt += 1;
      } else if (a.kind === 'heat_wave') {
        s.utilities.storedL = Math.max(0, s.utilities.storedL - 40 * s.people.length);
        const powered = s.structures.some(st => s.utilities.lit.includes(st.id));
        if (!powered) for (const p of s.people) {
          const n = s.personState.find(x => x.id === p.id)?.needs;
          if (n && n.died == null && p.age >= ELDER_AGE) { n.health = Math.max(1, n.health - 4); out.push(`${p.first} is suffering in the heat with no fan.`); }
        }
      }
    }
    if (day >= a.until) { w.active = null; w.last = day; }
    return out;
  }
  if (day - w.last < GAP_DAYS) return out;
  const { doy } = calendarOf(s.clock);
  for (const [kind, p] of Object.entries(odds(s, doy)) as Array<[WeatherKind, number]>) {
    if (r() >= p) continue;
    const at = day + AHEAD[kind];
    const [lo, hi] = LASTS[kind];
    w.active = { kind, at, until: at + lo + Math.floor(r() * (hi - lo + 1)) };
    news(s, WARN[kind], kind === 'heat_wave' || kind === 'hail' ? 1 : 2);
    out.push(WARN[kind]);
    if (at === day) hit(s, w.active, r, out);
    break;
  }
  return out;
}
