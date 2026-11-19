/**
 * Ice age (docs/design/climate_disasters.md section 2, owner-approved 2026-11-19). A long dark cold: the sun dims, the growing season
 * collapses, snow stays on the ground and roofs, and heating is the only thing that matters. The cold ramps over three game years (4.5 on Cozy,
 * 2.4 on Hardcore) to a regional plateau, through the shared winter engine (winter.ts) with a `coldScale`, so nuclear and asteroid winters are
 * untouched. Variants: a dimmed sun (everywhere at once) and an ocean shutdown (the north freezes hardest, the south half as much).
 *
 * Homestead teeth (no new art): the cold reaches every night through `supplyMods.cold` (housing.meanLow, cold.ts, heating.ts); wood use doubles
 * at a 30 F anomaly (heating.demandNow via slowWoodK); batteries lose up to half their charge and untreated diesel gels (utilities.ts);
 * solar follows the dim sun (physicalSolar.ts); roofs carry snow against the same capacity table as ash (`ashfall.ROOF_CAP`), through a thin
 * adapter here. The full building and dome snow model (`snowLoad.ts`) is a later PR.
 *
 * State in `disaster.fx.ice_age` (JSON-safe, no save bump): the ground load at each roof's last shoveling, roofs lost, one-time lines told.
 */
import type { FxCard, KindFx } from '../disasterFx';
import type { GameState } from '../state';
import { calendarOf } from '../state';
import { kindBag, applyLevel, dice, physicalOf } from '../physical';
import { isFinished } from '../construction';
import { startCase } from '../medical';
import { ROOF_CAP, density, fallChance, roofRatio, roofVerdict, shovelHours } from '../ashfall';
import { bulletin, clamp01, shelf, warnFrac, type Line } from './kit';
import { COLD_RAMP_YEARS } from '../climateCurve';
import { ROOF_SNOW_SHARE, SNOW_IN_PER_PSF, iceColdF, iceGroundPsf, iceProgress, iceWinter, slowYears, winterness } from '../slowClimate';
import { REGIONS } from '../regions';

export interface IceState { base: Record<string, number>; roofs: number; told: string[]; strain: Record<string, number> }
export const iceOf = (s: GameState): IceState => kindBag<IceState>(s, 'ice_age', () => ({ base: {}, roofs: 0, told: [], strain: {} }));
const doyOf = (s: GameState): number => calendarOf(s.clock).doy;
const money = (n: number) => '$' + Math.round(n).toLocaleString('en-US');

/** Ground snow load now (psf). */
export const groundPsf = (s: GameState): number => iceGroundPsf(s, doyOf(s));

/** One roof's load against its capacity (the ash tables, through a thin adapter): snow psf on the roof now, the ratio and the verdict inputs. */
export function roofSnow(s: GameState, st: { id: string; kind: string }): { psf: number; ratio: number } | null {
  const cap = ROOF_CAP[st.kind];
  if (cap === undefined) return null;
  const I = iceOf(s), P = physicalOf(s);
  const psf = Math.max(0, groundPsf(s) - (I.base[st.id] ?? 0)) * ROOF_SNOW_SHARE;
  const braced = (P.retrofit[st.id] ?? []).includes('rafters');
  return { psf, ratio: roofRatio(psf / density(false), cap, false, braced) };
}

/** Shovel every roof that has snow worth shoveling: the family (slow, a fall risk) or a paid crew. Returns the message. */
export function shovelSnow(s: GameState, how: 'family' | 'crew'): string {
  const I = iceOf(s), ground = groundPsf(s), r = dice(s, 79);
  let hours = 0, n = 0;
  const todo: string[] = [];
  for (const st of s.structures.filter(isFinished)) {
    const rs = roofSnow(s, st);
    if (!rs || rs.psf < 8) continue;   // under about 6 inches of settled snow is not worth the ladder
    hours += shovelHours(st.kind, rs.psf / ROOF_SNOW_SHARE * SNOW_IN_PER_PSF); n++; todo.push(st.id);
  }
  if (!n) return 'There is nothing worth shoveling yet.';
  const clear = () => { for (const id of todo) I.base[id] = ground; };
  if (how === 'crew') {
    const usd = Math.round(hours * 60);
    if (s.money < usd) return `A crew would cost ${money(usd)} and there is not enough money.`;
    s.money -= usd; clear();
    return `A crew shoveled ${n} roofs: ${Math.round(hours)} person-hours, ${money(usd)}.`;
  }
  clear();
  const able = s.people.filter((p, i) => s.personState[i]?.needs.died == null && !p.kid && p.age < 70);
  if (able.length && r() < fallChance(hours / Math.max(1, able.length), true)) {
    const p = able[Math.floor(r() * able.length)];
    startCase(s, p.id, 'fracture', 35, { bone: 'arm' } as never, 'a fall off the icy roof while shoveling snow');
    return `The family shoveled ${n} roofs (${Math.round(hours)} person-hours) and ${p.first} fell off a ladder.`;
  }
  return `The family shoveled ${n} roofs: ${Math.round(hours)} person-hours.`;
}

const LINES: Line[] = [
  [0, 30, 'the county has called the plow trucks out for the third week running; it has not stopped snowing.', 2],
  [20, 400, 'the grain elevator is closed to farmers: nothing will be planted before June, if June comes.', 2],
  [60, 700, 'rivers froze over in the fall and have not opened since; ice fishing is the only fishing left.', 1],
  [120, 1000, 'diesel is thickening in the tanks at the co-op; the trucks will not run below ten degrees without treated fuel.', 2],
  [200, 1500, 'the state asks every household to keep a month of firewood ahead; roof collapses are up sharply.', 3],
  [300, 3000, 'southbound highways are packed; the Guard is turning away cars at the state line without fuel for the return.', 2],
  [500, 3000, 'the sun has been behind the haze for two summers; the weather service has stopped promising a spring.', 2],
];

export const fx: KindFx = {
  onWarning(s) {
    return [`A cold, wet year with a dim sun: the weather service reports frost in ${warnFrac(s) > 0.5 ? 'late summer' : 'June'} and a low of ${Math.round(nightF(s))} degrees tonight. Stock firewood, seed and treated fuel now.`];
  },
  onHit(s) {
    const out = ['The cold does not let go and the snow stays. Get the woodpile up, the roofs shoveled and the stove going, and fuel treated against the cold.'];
    if (s.neighbors.some(n => n.status === 'home')) out.push('Some neighbors are talking about going south before the roads close.');
    return out;
  },
  daily(s, ctx) {
    const I = iceOf(s), out: string[] = [], yrs = slowYears(s);
    // neighbors leave for the south, the northern tier first
    const north = clamp01(1 - (REGIONS[s.site.region].julyHighF - 77) / 20);
    if (yrs > 0.3 && ctx.r() < 0.012 * Math.min(3, yrs) * (0.5 + north)) {
      const home = s.neighbors.filter(n => n.status === 'home');
      if (home.length) { const n = home[Math.floor(ctx.r() * home.length)]; n.status = 'left'; out.push(`${n.name.charAt(0).toUpperCase()}${n.name.slice(1)} loaded up and headed south before the roads closed.`); }
    }
    const cold = iceColdF(s);
    if (cold > 14 && (s.stock.stabilizer ?? 0) < 1 && ctx.once('ice_gel')) out.push('Diesel is gelling in the cold. Untreated fuel will clog the generator: put fuel stabilizer in the tank and keep the can warm.');
    const mark = (key: string, text: string, yr: number) => { if (yrs >= yr && !I.told.includes(key) && ctx.once(`ice_${key}`)) { I.told.push(key); out.push(text); } };
    mark('y1', 'A year of it. Summer frosts took the garden, and the harvest was a fraction of a normal year.', 1);
    mark('y2', 'Two years in. The rivers are frozen and nothing outdoors grows in the north; heating is the work of the day.', 2);
    mark('y3', 'The long dark. The snow pack does not melt in summer, and the stove is never out.', 3);
    return out;
  },
  structureDamage(s, ctx) {
    const I = iceOf(s), out: string[] = [];
    if (iceProgress(s) < 0.08) return out;
    for (const st of s.structures) {
      if (!isFinished(st)) continue;
      const rs = roofSnow(s, st);
      if (!rs) continue;
      const v = roofVerdict(rs.ratio, ctx.r());
      if (v === 'strain' || v === 'risk') {
        if (ctx.once(`snow_strain_${st.id}_${Math.floor(ctx.day / 7)}`)) out.push(`The ${st.kind.replace(/_/g, ' ')} roof is creaking under about ${Math.round(rs.psf / ROOF_SNOW_SHARE * SNOW_IN_PER_PSF)} inches of snow${v === 'risk' ? ': it is at its limit' : ''}. Shovel it.`);
      } else if (v === 'collapse') {
        const level = ['barn', 'sheep_barn', 'workshop', 'greenhouse', 'greenhouse_heated', 'polytunnel', 'high_tunnel'].includes(st.kind) && rs.ratio >= 1.5 ? 3 : 2;
        const line = applyLevel(s, st, level, 'ash_load', 'The roof gave way under the weight of the snow.');
        if (line) { out.push(line); I.roofs++; }
      }
    }
    return out;
  },
  priceMods(s) {
    if (s.clock.t < s.disaster.hitAt) return 1 + 0.3 * warnFrac(s);
    return Math.max(1.3, 1 + 1.2 * iceWinter(s).foodStress) + 0.5 * (1 - shelf(s));
  },
  serviceMods(s) {
    // snow on the lines and the roads: the grid and the trucks lose a little more in the cold months
    if (s.clock.t < s.disaster.hitAt) return {};
    const w = winterness(doyOf(s)) * clamp01(iceProgress(s) * 1.5);
    return { grid: 1 - 0.25 * w, deliveries: 1 - 0.3 * w };
  },
  supplyMods(s) {
    const w = iceWinter(s);
    // the winter engine's grow, and the cold in `climate().cold` units (each unit is 40 F of a lower night: the anomaly itself, up to 44 F)
    return { grow: w.grow, cold: Math.min(1.1, Math.max(0, -w.coldF) / 40) };
  },
  encounterWeights(s, { scale }) {
    const y = clamp01(slowYears(s) / COLD_RAMP_YEARS), st = iceWinter(s).foodStress;
    scale('refugees', 1 + 1.2 * y); scale('stranded', 1 + 1.5 * y); scale('looters', 1 + 0.6 * st); scale('kin', 1 + y);
  },
  npcMods(s) { return 1 + 0.6 * iceWinter(s).foodStress + 0.3 * winterness(doyOf(s)) * clamp01(iceProgress(s)); },
  medical(s) { const c = clamp01(iceColdF(s) / 30); return c > 0 ? { contact: 0.02 * c, spread: 0.015 * c } : null; },
  radioBulletins(s, ctx) {
    if (ctx.r() < 0.3) {
      const w = iceWinter(s), g = groundPsf(s);
      const lines = [`NOAA: temperatures run ${Math.round(-w.coldF)} degrees below normal across the northern tier.`, `USDA: the outdoor growing season is about ${Math.round(100 * w.grow)} percent of normal this year.`, `The weather service puts the snow load on the ground at ${Math.round(g)} pounds per square foot; roofs built for 40 are at risk.`];
      return { text: lines[Math.floor(ctx.r() * lines.length)], tone: w.foodStress > 0.5 ? 3 : 2 };
    }
    return bulletin(LINES, ctx);
  },
  look(s, look) {
    const g = groundPsf(s), pack = clamp01(g / 60);
    // the snow rides the ash path: a white cover on roofs and ground (collapseLook ashCover / ashColor), the dim sun is the profile row
    return pack > look.ashCover ? { ashCover: pack, ashColor: [0.92, 0.94, 0.98] } : {};
  },
  oasisWeight(s) { return 0.35 * clamp01(iceProgress(s)) * (1 - Math.min(s.disaster.tracks.grid, s.disaster.tracks.stores)); },
  cards(s): FxCard[] {
    if (s.clock.t < s.disaster.hitAt) return [];
    let worst = 0, n = 0;
    for (const st of s.structures.filter(isFinished)) { const rs = roofSnow(s, st); if (!rs) continue; if (rs.psf >= 8) n++; worst = Math.max(worst, rs.ratio); }
    if (!n || worst < 0.5) return [];
    const g = Math.round(groundPsf(s));
    return [{
      id: 'ice_roofs', title: `${g} pounds of snow on the ground: the roofs are loading up`,
      why: `The worst roof is at ${Math.round(100 * worst)} percent of what it was built to carry (barns, greenhouses and tunnels first). Shoveling takes about 3 person-hours an inch per 1,000 square feet and a fall off a ladder is a real risk; a paid crew costs about $60 an hour.`,
      urgency: worst >= 1 ? 90 : 60, tone: worst >= 0.8 ? 'alarm' : undefined,
      acts: [{ label: 'Shovel the roofs ourselves', choice: 'ice:shovel' }, { label: 'Hire a crew to shovel', choice: 'ice:crew' }],
    }];
  },
  choose(s, c) {
    if (c === 'ice:shovel') return shovelSnow(s, 'family');
    if (c === 'ice:crew') return shovelSnow(s, 'crew');
    return null;
  },
};

/** Tonight's low (F), for the warning line. */
function nightF(s: GameState): number {
  const R = REGIONS[s.site.region], k = winterness(doyOf(s));
  return R.julyHighF - 26 + (R.janLowF - (R.julyHighF - 26)) * k - 10 * iceProgress(s);
}
