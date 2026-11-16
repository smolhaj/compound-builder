/**
 * The ash-fall kinds (`ash_winter`, `supervolcano`) share one engine: an ash target rolled per place (ashfall.ts), a daily roof-load clock
 * that replaces the old single day-4 roll, services softened by how much ash reached the compound, the winter engine (winter.ts) on the
 * growing season, and the chores: shoveling, panels, vehicle filters, coughs. Per-kind state lives in `disaster.fx[kind]`.
 */
import type { KindFx, FxCtx } from '../disasterFx';
import type { GameState } from '../state';
import { TRACKS, tension, type Track } from '../disaster';
import { isFinished } from '../construction';
import { startCase } from '../medical';
import { hasSafeRoom } from '../houseHardening';
import { applyLevel, physicalOf, dice } from '../physical';
import { CLASS_SEVERITY, FALL_DAYS, WET_SHARE, ROOF_CAP, ashClass, ashGrow, depthAt, fallChance, fallToday, forecast, roofRatio, roofVerdict, shovelHours } from '../ashfall';
import { ashOf, ashDepth, type AshOpts } from '../ashState';
import { coldIndex, winterAt, type WinterState } from '../winter';
import { DIFFICULTY } from '../difficulty';

const since = (s: GameState) => s.clock.t - s.disaster.hitAt;

/** Ash on the ground now (inches), and the day's fall. */
export const winterOf = (s: GameState, o: AshOpts): WinterState => winterAt(since(s) - 30, o.severity, s.site.region);

const legacy = (d: number) => { const k = d < 365 ? 1 : d < 730 ? 1 - (d - 365) / 365 : 0; return { grow: 1 - 0.75 * k, cold: 0.4 * k }; };
const money = (n: number) => '$' + Math.round(n).toLocaleString('en-US');

/** Who is the fall bearing down on now: 0..1 intensity for the look and the exposure rolls. */
const intensity = (s: GameState, o: AshOpts): number => { const a = ashOf(s, o.key, o.scale); const d = since(s); return d < 0 || d > FALL_DAYS ? 0 : Math.min(1, fallToday(a.target, d) / 1.5); };

export function shovelRoofs(s: GameState, o: AshOpts, how: 'family' | 'crew'): string {
  const a = ashOf(s, o.key, o.scale), depth = ashDepth(s, o), r = dice(s, 77);
  let hours = 0, n = 0;
  for (const st of s.structures.filter(isFinished)) {
    if (!(st.kind in ROOF_CAP)) continue;
    const inches = depth - (a.base[st.id] ?? 0);
    if (inches < 0.5) continue;
    hours += shovelHours(st.kind, inches); a.base[st.id] = depth; n++;
  }
  a.panels = depth;
  if (!n) return 'There is nothing worth shoveling yet.';
  if (how === 'crew') {
    const usd = Math.round(hours * 60 * (since(s) < 7 ? 2 : 1));
    if (s.money < usd) { return `A crew would cost ${money(usd)} and there is not enough money.`; }
    s.money -= usd;
    return `A crew shoveled ${n} roofs and wiped the panels: ${Math.round(hours)} person-hours, ${money(usd)}.`;
  }
  const living = s.people.filter((_, i) => s.personState[i]?.needs.died == null && !s.people[i].kid && s.people[i].age < 70);
  if (living.length && r() < fallChance(hours / Math.max(1, living.length), true)) {
    const p = living[Math.floor(r() * living.length)];
    startCase(s, p.id, 'fracture', 35, { bone: 'arm' } as never, `a fall off the roof while shoveling ash`);
    return `The family shoveled ${n} roofs (${Math.round(hours)} person-hours) and ${p.first} fell off a ladder.`;
  }
  return `The family shoveled ${n} roofs and wiped the panels: ${Math.round(hours)} person-hours.`;
}

export function makeAshFx(o: AshOpts): KindFx {
  const A = (s: GameState) => ashOf(s, o.key, o.scale);
  return {
    legacy: o.legacy ? { economy: 'finance.ts: the market crash (35%)', atmosphere: 'collapseLook: ash, dim sun, cold' } : { economy: 'finance.ts: the market crash' },
    onWarning(s) {
      const a = A(s), lo = Math.max(0.1, forecast(a.target, 7, s.seed)), hi = lo * 1.8;
      return [`USGS ash forecast for the valley: ${lo < 1 ? 'under an inch' : `${Math.round(lo)} to ${Math.round(hi)} inches`} if the wind holds. It will narrow as the days go.`];
    },
    onHit(s) {
      const a = A(s), cls = ashClass(a.target), out: string[] = [];
      out.push(`The ash arrives: ${cls === 'light' ? 'a gray dusting at first' : cls === 'moderate' ? 'an inch or two a day at the worst' : 'inches a day, heavy and wet in the rain'}. Seal the house, cover the well and the tanks, pull the vehicles under cover.`);
      const r = dice(s, 5), leaveP = cls === 'near' ? 0.6 : cls === 'heavy' ? 0.4 : cls === 'moderate' ? 0.15 : 0.03;
      for (const n of s.neighbors) if (n.status === 'home' && r() < leaveP) { n.status = 'left'; a.left++; }
      if (a.left) out.push(`${a.left} neighbor household${a.left > 1 ? 's' : ''} loaded up and headed south before the roads closed.`);
      return out;
    },
    structureDamage(s, ctx: FxCtx) {
      const a = A(s), d = since(s), out: string[] = [];
      if (d > FALL_DAYS + 40) return out;
      const depth = depthAt(a.target, d), wet = ctx.r() < (WET_SHARE[s.site.region] ?? 0.25) * (d < 14 ? 1.3 : 1);
      const P = physicalOf(s);
      for (const st of s.structures) {
        if (!isFinished(st) || !(st.kind in ROOF_CAP)) continue;
        const inches = depth - (a.base[st.id] ?? 0);
        const ratio = roofRatio(inches, ROOF_CAP[st.kind], wet, (P.retrofit[st.id] ?? []).includes('rafters'));
        const v = roofVerdict(ratio, ctx.r());
        if (v === 'strain' || v === 'risk') { if (ctx.once(`ash_strain_${st.id}_${Math.floor(d / 4)}`)) out.push(`The ${st.kind.replace(/_/g, ' ')} roof is creaking under ${inches.toFixed(1)} inches of ${wet ? 'wet ' : ''}ash${v === 'risk' ? ': it is at its limit' : ''}. Shovel it.`); }
        else if (v === 'collapse') {
          const level = ['barn', 'sheep_barn', 'workshop', 'greenhouse', 'greenhouse_heated', 'polytunnel', 'high_tunnel'].includes(st.kind) && ratio >= 1.5 ? 3 : 2;
          const line = applyLevel(s, st, level, 'ash_load', `The roof gave way under ${inches.toFixed(1)} inches of ${wet ? 'wet ' : ''}ash.`);
          if (line) { out.push(line); a.roofs++; }
        }
      }
      return out;
    },
    daily(s, ctx) {
      const a = A(s), d = since(s), out: string[] = [], I = intensity(s, o);
      if (I > 0.2) {
        const protectedK = (s.stock.filter_set ?? 0) >= 1 || hasSafeRoom(s) ? 0.25 : 1;
        for (let i = 0; i < s.people.length; i++) {
          const p = s.people[i];
          if (s.personState[i]?.needs.died != null) continue;
          if (ctx.r() < 0.03 * I * (p.kid || p.age >= 65 ? 2 : 1) * protectedK * DIFFICULTY[s.disaster.difficulty].price) startCase(s, p.id, 'flu', 22, { src: 'house' }, 'an ash cough that has settled in the chest');
        }
        if ((s.stock.vehicle_parts ?? 0) > 0) s.stock.vehicle_parts = Math.max(0, s.stock.vehicle_parts - 0.12 * I);
        else if (!a.chokeTold && ctx.once(`${o.key}_choke`)) { a.chokeTold = true; out.push('The engines are choking on ash and there are no spare filters: the truck and the generator will not run long.'); }
      }
      if (d === 14 && ctx.once(`${o.key}_drain`)) out.push('Ash washed into the drains has set like cement. Do not wash it down the pipes.');
      return out;
    },
    priceMods(s) {
      if (s.clock.t < s.disaster.hitAt) return 1 + 0.35 * tension(s.disaster, s.clock.t);
      const d = since(s), base = d < 60 ? 1.4 : Math.max(1.1, 1.4 - 0.3 * (d - 60) / 305);
      return Math.max(base, 1 + 1.2 * winterOf(s, o).foodStress);
    },
    serviceMods(s) {
      const sev = CLASS_SEVERITY[ashClass(A(s).target)], out: Partial<Record<Track, number>> = {};
      if (sev >= 1) return out;
      for (const t of TRACKS) { const lv = s.disaster.tracks[t]; if (lv > 0.001 && lv < 1) out[t] = (1 - (1 - lv) * sev) / lv; }
      return out;
    },
    supplyMods(s) {
      const d = since(s), w = winterOf(s, o), depth = depthAt(A(s).target, d);
      const total = ashGrow(depth, d) * w.grow, lg = o.legacy ? legacy(d) : { grow: 1, cold: 0 };
      return { grow: total / lg.grow, cold: coldIndex(w.coldF) - lg.cold };
    },
    npcMods(s) { return 1 + 0.4 * intensity(s, o) + 0.6 * winterOf(s, o).foodStress; },
    encounterWeights(s, { scale }) {
      const d = since(s), I = intensity(s, o), st = winterOf(s, o).foodStress;
      if (d >= 0 && d < 7) scale('refugees', 1.8);
      if (I > 0.5) { scale('arrival', 0.5); scale('looters', 0.6); }
      else if (d >= 7) scale('looters', 1.2 + 0.6 * st);
      if (st > 0.2) { scale('refugees', 1 + 0.5 * st); scale('stranded', 1 + st); }
    },
    medical(s) { const st = winterOf(s, o).foodStress; return { contact: 0.04 * st, spread: 0.02 * st + 0.01 * intensity(s, o) }; },
    radioBulletins(s, ctx) {
      const a = A(s), d = since(s), w = winterOf(s, o);
      if (d >= 0 && d < FALL_DAYS && ctx.r() < 0.7) {
        const f = forecast(a.target, Math.max(1, 7 - d), s.seed), left = Math.max(0.1, f - depthAt(a.target, d));
        const lines = [`USGS: ${left < 1 ? 'under an inch' : `${Math.max(1, Math.round(left * 0.7))} to ${Math.round(left * 1.3) + 1} more inches`} of ash expected in the valley through the week.`, 'Do not wash ash down the drains. Keep animals off ash-covered pasture.', 'Wet ash is twice as heavy as dry: shovel the roofs, but not in the rain if you can help it.', 'Southbound interstate traffic is moving at five miles an hour.'];
        return { text: lines[Math.floor(ctx.r() * lines.length)], tone: 2 };
      }
      if (d >= 60 && ctx.r() < 0.5) {
        const lines = [`USDA: the winter wheat crop is ${Math.round(Math.max(5, 100 * w.grow))}% of normal.`, `NOAA: temperatures run ${Math.round(-w.coldF)} degrees below normal across the northern tier.`, 'Seed potatoes are limited to ten pounds a household at the co-op.', 'The state asks households to keep thermostats at 55.'];
        return { text: lines[Math.floor(ctx.r() * lines.length)], tone: w.foodStress > 0.5 ? 2 : 1 };
      }
      return null;
    },
    look(s, look) {
      const I = intensity(s, o), cover = Math.min(1, ashDepth(s, o) / 6) * Math.max(0, 1 - since(s) / 730), w = winterOf(s, o);   // (the ash on the ground weathers into the soil over two years)
      return { ashCover: Math.max(look.ashCover, cover * 0.9), dim: Math.min(look.dim, 1 - 0.55 * I) * w.sunDim, haze: Math.max(look.haze, 0.5 * I) };
    },
    oasisWeight(s) { return 0.2 * (1 - Math.min(s.disaster.tracks.stores, s.disaster.tracks.deliveries)); },
  };
}

