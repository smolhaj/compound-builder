/**
 * Dam failure and great flood (WP6; docs/scenarios/dam_flood.md). A local catastrophe in a working world: help comes. The compound's own
 * elevation over the creek decides every building's depth; depth x speed decides the state (structureDamage.floodLevel); a mold clock,
 * a fouled well and the muck-out race are the days after. Ordinary insurance excludes flood (a flood policy waits 30 days).
 */
import type { KindFx } from '../disasterFx';
import type { GameState, Structure } from '../state';
import { tension } from '../disaster';
import { isFinished } from '../construction';
import { RAISED_KINDS } from '../outposts';
import { hasBasement } from '../housingStyles';
import { isHome } from '../blueprints';
import { groundOf } from '../terrainState';
import { riseAboveCreek } from '../terrain';
import { floodCandidates } from '../terrainFx';
import { dropRoadBridge, roadBridgeOf } from '../roadFx';
import { addFood } from '../pantry';
import { startCase } from '../medical';
import { treated } from '../sanitation';
import { log } from '../economy';
import { applyLevel, hitUnfinished, kindBag, loseFood, physicalOf, reachable, retrofitsOf, setRepairLead } from '../physical';
import { floodLevel, type DamageLevel } from '../structureDamage';
import { arrivalMin, depthOver, flowOf, holdDays, roadOutDays, stageFt, variantFor, wellClearDay, type FloodVariant } from '../floodMath';

export interface FloodState { variant: FloodVariant; stage: number; miles: number; hold: number; roadOut: number; prepared: boolean; fouledAt: number; chlorinated: number | null; mucked: number | null; flooded: string[] }
const f = (s: GameState): FloodState => kindBag<FloodState>(s, 'dam_flood', () => {
  const r = (k: number) => ((Math.sin(s.seed * 5.77 + k * 63.1) * 43758.5453) % 1 + 1) % 1;
  const variant = variantFor(s.site.region, r(1)), miles = 2 + 10 * r(2);
  return { variant, stage: Math.round(stageFt(variant, miles, r(3)) * 10) / 10, miles: Math.round(miles * 10) / 10, hold: holdDays(variant, r(4)), roadOut: roadOutDays(variant, r(5)), prepared: false, fouledAt: -1, chlorinated: null, mucked: null, flooded: [] };
});
export const floodOf = f;
const since = (s: GameState) => s.clock.t - s.disaster.hitAt;
const name = (st: Structure) => st.kind.replace(/_/g, ' ');

/** Feet of water over a structure's floor for a stage (negative: dry). */
export function floodDepthFt(s: GameState, st: Pick<Structure, 'x' | 'z' | 'kind' | 'id'>, stage: number): number {
  const g = groundOf(s), raised = RAISED_KINDS.includes(st.kind) ? 3 : 0;
  if (!g || !g.creek || !s.site.creek) return floodCandidates(s, [st as Structure]).length ? Math.min(stage, 3) * 0.5 - raised : -1;
  const rise = riseAboveCreek(g, st.x, st.z);
  return rise === null ? -1 : depthOver(stage, rise, raised);
}

export const fx: KindFx = {
  legacy: {},
  onWarning(s) {
    const F = f(s);
    return [`The county warns of seepage at the dam upstream. If the siren sounds the wave reaches the valley in about ${arrivalMin(F.miles, s.site.region === 'hill_country')} minutes: move the stock, the vehicles and the papers to the bench now.`];
  },
  onHit(s) {
    const F = f(s), out: string[] = [], r = (k: number) => ((Math.sin(s.seed * 9.3 + k * 17.1) * 43758.5453) % 1 + 1) % 1;
    setRepairLead(s, F.variant === 'levee_flood' ? 0.7 : 0.5, 'flood');
    out.push(F.variant === 'levee_flood' ? `The river is ${Math.round(F.stage)} feet over flood stage and will stand for about ${F.hold} days.` : `The wave came down the valley: about ${Math.round(F.stage)} feet at the creek, brown and full of trees.`);
    if (F.variant !== 'levee_flood' && roadBridgeOf(s) && r(3) < 0.75) { if (!dropRoadBridge(s)) out.push(`The bridge on the way in is gone. The county says the road will be out about ${F.roadOut} days.`); }
    const P = physicalOf(s);
    const low = floodCandidates(s, s.structures.filter(isFinished)).length > 0;
    if (low) {
      const cellar = loseFood(s, F.prepared ? 0.1 : 0.3, ['staples', 'frozen']);
      if (cellar > 0.5) out.push('The cellar and the low shelves went under: what was stored there is spoiled. Garden produce touched by the water must be thrown out.');
    }
    if (low && !P.wellCap) { F.fouledAt = Math.floor(s.clock.t); out.push('Floodwater is over the wellhead. Do not drink from the well until it has been shock-chlorinated and tested.'); }
    for (const n of s.neighbors.filter(x => x.status === 'home')) if (r(20 + n.km) < 0.3 * (F.variant === 'levee_flood' ? 1 : 1.3)) { n.disposition = Math.min(100, n.disposition + 3); out.push(`${n.name[0].toUpperCase() + n.name.slice(1)} lost the house in the bottoms and are asking to stay on the bench.`); break; }
    return out;
  },
  structureDamage(s, ctx) {
    const F = f(s), out: string[] = [], P = physicalOf(s);
    if (ctx.day === 0 && ctx.once('flood_main')) {
      const minor: string[] = [];
      for (const st of reachable(s)) {
        const d = floodDepthFt(s, st, F.stage);
        if (d <= -2) continue;
        const cellar = st.kind === 'root_cellar' || st.kind.startsWith('bunker_') || hasBasement(st.kind);
        const level = floodLevel(d, flowOf(F.variant, d), { anchored: retrofitsOf(s, st.id).includes('anchor'), cellar }) as DamageLevel;
        if (!level) continue;
        F.flooded.push(st.id);
        if (!isFinished(st)) { const l = hitUnfinished(st, level); if (l) out.push(l); continue; }
        const line = applyLevel(s, st, level, 'flood', `The water reached ${d.toFixed(1)} feet over the floor.`);
        const rec = P.damage[st.id]; if (rec) rec.moldAt = s.clock.t + 2;
        if (level === 1) minor.push(name(st)); else if (line) out.push(line);
      }
      if (minor.length) out.push(`Mud and a wet floor in ${minor.length > 3 ? `${minor.length} buildings` : minor.join(', ')}: tear out the bottom two feet and dry them out inside 48 hours.`);
      // the family: on the bench nothing; in a ruined house, a chance of being swept
      const home = s.structures.find(x => isHome(x.kind) && (x.finishedAt !== null || P.damage[x.id]));
      const lv = home ? P.damage[home.id]?.level ?? 0 : 0;
      const p = (lv === 3 ? 0.3 : lv === 2 ? 0.08 : lv === 1 ? 0.02 : 0) * (F.prepared ? 0.4 : 1);
      for (let i = 0; i < s.people.length; i++) if (s.personState[i]?.needs.died == null && ctx.r() < p) { startCase(s, s.people[i].id, 'wound', 38, {}, 'hurt and chilled by the water'); out.push(`${s.people[i].first} was caught by the water and pulled out cold and hurt.`); }
    }
    // the mold clock
    for (const [id, rec] of Object.entries(P.damage)) {
      if (rec.hazard !== 'flood' || rec.moldAt === undefined || rec.dried) continue;
      const st = s.structures.find(x => x.id === id), hours = (s.clock.t - (rec.moldAt - 2)) * 24;
      if (!st) continue;
      if (hours >= 240 && rec.level === 2 && ctx.once(`mold_lost_${id}`)) { const l = applyLevel(s, st, 3, 'flood', 'Ten days wet: the walls are black with mold and past saving.'); if (l) { out.push(l); rec.dried = true; } }
      else if (hours >= 48 && rec.level === 1 && ctx.once(`mold_${id}`)) { const l = applyLevel(s, st, 2, 'flood', 'Not dried out in time, the walls molded.'); if (l) out.push(l); }
    }
    return out;
  },
  daily(s, ctx) {
    const F = f(s), d = ctx.day, out: string[] = [];
    if (F.fouledAt >= 0 && s.clock.t < wellClearDay(F.fouledAt, F.chlorinated) && !treated(s)) {
      for (let i = 0; i < s.people.length; i++) if (s.personState[i]?.needs.died == null && ctx.r() < 0.03 && startCase(s, s.people[i].id, 'dysentery', 32, { src: 'water' })) out.push(`${s.people[i].first} is sick: the well water was not safe.`);
    }
    if (F.mucked !== null && d >= 1 && d <= 21) for (let i = 0; i < s.people.length; i++) if (s.personState[i]?.needs.died == null && ctx.r() < 0.004 && startCase(s, s.people[i].id, 'infection', 28, {}, 'an infected cut from the muck-out')) out.push(`${s.people[i].first} has an infected cut from the mud.`);
    if (d >= 2 && d <= 5 && ctx.once('flood_drop')) { addFood(s, 'rice_bag', 6); addFood(s, 'canned_veg', 12); out.push('A Guard truck left water, rice and canned food at the end of the county road.'); }
    if (d >= 21 && d <= 56 && ctx.once('flood_fema') && !physicalOf(s).riders.flood && Object.values(physicalOf(s).damage).some(x => x.hazard === 'flood' && x.level >= 2)) {
      const usd = Math.round((5000 + 25000 * ctx.r()) / 100) * 100; s.money += usd; out.push(`FEMA approved $${usd.toLocaleString('en-US')} for the damaged home.`);
    }
    if (d === F.hold && F.variant === 'levee_flood' && ctx.once('flood_recede')) out.push('The river has dropped back into its banks and left a foot of silt on the low ground.');
    return out;
  },
  priceMods(s) { const d = since(s); return d < 0 ? 1 + 0.08 * tension(s.disaster, s.clock.t) : 1 + 0.3 * Math.max(0, 1 - d / 56); },
  npcMods(s) { return 1 + 0.8 * Math.max(0, 1 - since(s) / 60); },
  supplyMods(s) { return since(s) > 300 && f(s).flooded.length ? { grow: 1.1 } : {}; },
  encounterWeights(s, { scale }) { if (since(s) < 0) return; scale('neighbor_help', 2); scale('stranded', 2); scale('looters', 0.6); scale('gang', 0.2); },
  medical(s) { const d = since(s); return d >= 0 && d <= 28 ? { contact: 0.02, spread: 0.02 } : null; },
  radioBulletins(s, ctx) {
    const F = f(s), d = Math.floor(since(s)), lines: Array<[string, 0 | 1 | 2 | 3]> = [];
    if (d <= 3) lines.push(['Red Cross shelter at the high school: 140 people. Boil-water advisory for the valley.', 2], ['Highway 31 is closed at the creek.', 2]);
    if (d <= F.roadOut) lines.push([`The county says the valley road may be out ${Math.max(7, F.roadOut - d)} more days. A temporary ford is planned.`, 1]);
    if (d <= 14) lines.push(['Guard and county crews are in the valley: mud-out help is coming, but crews are booked for days.', 1], ['Beware of door-to-door roofing and mold-remediation crews with no license.', 1]);
    if (d >= 1 && d <= 10) lines.push(['A rumor says a second dam upstream is cracking. County engineers say it is not.', 1]);
    return lines.length ? (([text, tone]) => ({ text, tone }))(lines[Math.floor(ctx.r() * lines.length)]) : null;
  },
  look(s, look) { const d = since(s); return { cloud: Math.max(look.cloud, s.clock.t >= s.disaster.hitAt - 2 && d < 8 ? 0.8 : 0), fog: Math.max(look.fog, d >= 0 && d < 5 ? 0.15 : 0) }; },
  oasisWeight(s) { return 0.2 * (1 - s.disaster.tracks.deliveries); },
};

// ── actions (decision cards call these) ──────────────────────────────────────────────────────────────────────────────

/** Muck out the flooded buildings: dry them inside 48 hours. By hand (cheap, cuts and infections) or with a crew (dear, and they may be booked). */
export function muckOut(s: GameState, how: 'family' | 'crew'): string {
  const P = physicalOf(s), F = f(s), recs = Object.entries(P.damage).filter(([, r]) => r.hazard === 'flood' && !r.dried);
  if (!recs.length) return 'Nothing is waiting to be mucked out.';
  const usd = how === 'crew' ? 1200 * recs.length : 60 * recs.length;
  if (s.money < usd) return `That costs $${usd.toLocaleString('en-US')} and there is not enough money.`;
  s.money -= usd; for (const [, r] of recs) r.dried = true;
  if (how === 'family') F.mucked = Math.floor(s.clock.t);
  return how === 'crew' ? `A crew gutted ${recs.length} flooded building${recs.length > 1 ? 's' : ''} ($${usd.toLocaleString('en-US')}).` : `The family tore out wet drywall and flooring in ${recs.length} building${recs.length > 1 ? 's' : ''}: long days in the mud. Wear boots and gloves, and watch for cuts.`;
}
/** Shock-chlorinate the well: bleach, a day, then a test. */
export function chlorinateWell(s: GameState): string {
  const F = f(s);
  if (F.fouledAt < 0 || s.clock.t >= wellClearDay(F.fouledAt, F.chlorinated)) return 'The well is not fouled.';
  if (s.money < 40) return 'Bleach costs $40 and there is not enough money.';
  s.money -= 40; F.chlorinated = Math.floor(s.clock.t);
  log(s, 'Shock-chlorinated the well. Run it for a day, then test it before anyone drinks.');
  return 'Shock-chlorinated the well: safe after a day and a test.';
}
