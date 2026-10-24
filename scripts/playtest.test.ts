/**
 * Scripted playtest (v1): a sim-only agent plays whole runs with different
 * build strategies against the disasters, and writes a report of how each
 * went (ending, grade, survivors, hunger, what broke) plus anything that
 * looks like a bug (NaN, negative stock, a stuck run). Slow: only with
 *   PLAYTEST=1 npx vitest run scripts/playtest.test.ts
 * Report: playtest-report.md (repo root).
 */
import { describe, expect, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { newGame, type GameState } from '../src/sim/state';
import { step } from '../src/sim/engine';
import { placeOrder, orderProblem } from '../src/sim/economy';
import { planStructure, planProblem, isFinished } from '../src/sim/construction';
import { CLASSIC, listings, type Site } from '../src/sim/site';
import { BLUEPRINTS, isHome } from '../src/sim/blueprints';
import { fixBill, fixBlocked, orderHookup, pendingFixes, placeImprovements } from '../src/sim/improvements';
import { hireCrew, hoursLeft } from '../src/sim/crews';
import { planRun } from '../src/sim/perimeter';
import { orderFit, fitProblem, plant } from '../src/sim/utilities';
import { orderHardenAll } from '../src/sim/hardening';
import { resolve, type Stance } from '../src/sim/encounters';
import { reportCard } from '../src/sim/report';
import { daysOfFood } from '../src/sim/needs';
import { MATERIAL_IDS, MATERIALS, type MaterialId } from '../src/sim/materials';
import type { DisasterKind } from '../src/sim/disaster';

type Strategy = 'idle' | 'homestead' | 'prepper' | 'fortress';

/** What a strategy builds, in order (x, z in the 67-unit parcel). */
const PLANS: Record<Strategy, Array<[string, number, number]>> = {
  idle: [],
  homestead: [['timber_cabin', 30, 30], ['outhouse', 36, 26], ['well_hand', 26, 34], ['garden', 22, 28], ['field', 10, 12], ['field', 17, 12], ['field', 24, 12], ['chicken_coop', 24, 22], ['root_cellar', 34, 36], ['cistern', 28, 38]],
  prepper: [['timber_cabin', 30, 30], ['outhouse', 36, 26], ['well_drilled', 26, 34], ['garden', 22, 28], ['field', 10, 12], ['field', 17, 12], ['field', 24, 12], ['field', 10, 19], ['chicken_coop', 24, 22], ['root_cellar', 34, 36], ['cistern', 28, 38], ['solar_array', 40, 30], ['battery_shed', 40, 34], ['generator_shed', 42, 36],
    ['bunker_hatch', 20, 40], ['bunker_corridor', 20.75, 40], ['bunker_dorm', 21.75, 40.25], ['bunker_stores', 21.75, 41.25], ['bunker_plant', 22.75, 40.25], ['bunker_medical', 22.75, 41.25], ['bunker_comms', 20.5, 41]],
  fortress: [['timber_cabin', 30, 30], ['well_hand', 26, 34], ['workshop', 38, 28], ['garden', 22, 28]],
};
/** Days of food left per head if `size` more join (what the gate card shows). */
const roomFor = (s: GameState, size: number) => { const here = s.personState.filter(p => p.needs.died == null).length; return daysOfFood(s) * here / (here + size); };
const STANCE: Record<Strategy, (kinds: Stance[], kind: string, s: GameState, size: number) => Stance> = {
  idle: k => k.includes('turn_away') ? 'turn_away' : k.includes('hide') ? 'hide' : k[0],
  homestead: (k, kind, s, n) => kind === 'arrival' ? (s.food.fromStores || roomFor(s, n) > 240 ? 'take_in' : 'trade') : k.includes('parley') ? 'parley' : k[0],
  prepper: (k, kind, s, n) => kind === 'arrival' ? (s.food.fromStores || roomFor(s, n) > 365 ? 'trial' : 'turn_away') : k.includes('hide') ? 'hide' : k[0],
  fortress: (k, kind) => kind === 'arrival' ? 'turn_away' : k.includes('defend') ? 'defend' : k[0],
};

/** Order what the plans still need (like the HUD's button), and a pantry for when the stores close. */
function orderNeeds(s: GameState, strat: Strategy): void {
  const need: Partial<Record<MaterialId, number>> = {};
  for (const st of s.structures) {
    if (isFinished(st)) continue;
    BLUEPRINTS[st.kind].stages.forEach((sg, i) => {
      if (i < st.stage || (i === st.stage && st.supplied)) return;
      for (const [k, n] of Object.entries(sg.materials) as Array<[MaterialId, number]>) need[k] = (need[k] ?? 0) + n;
    });
  }
  const pending: Partial<Record<MaterialId, number>> = {};
  for (const o of s.orders) if (o.status === 'ordered') for (const l of o.lines) pending[l.material] = (pending[l.material] ?? 0) + l.qty;
  const lines = MATERIAL_IDS.map(m => ({ material: m, qty: Math.max(0, Math.ceil((need[m] ?? 0) - s.stock[m] - (pending[m] ?? 0))) })).filter(l => l.qty > 0 && MATERIALS[l.material].price !== null);
  // food: a prepper keeps a year put by, a homesteader three months
  const months = strat === 'prepper' ? 12 : strat === 'homestead' ? 3 : 0;
  const kcalYear = (2 * 2400 + 2 * 1700) * 30 * months;
  const haveKcal = s.stock.staples * 80000 + s.stock.canned * 6000 + (pending.staples ?? 0) * 80000;
  if (haveKcal < kcalYear) lines.push({ material: 'staples', qty: Math.ceil((kcalYear - haveKcal) / 80000) });
  const jars = strat === 'prepper' ? 400 : strat === 'homestead' ? 200 : 0;
  if (s.stock.lids + (pending.lids ?? 0) < jars / 2) lines.push({ material: 'lids', qty: jars });
  if (strat === 'prepper' && s.stock.meds + (pending.meds ?? 0) < 4) lines.push({ material: 'meds', qty: 2 });
  if (strat === 'prepper' && s.stock.fuel + (pending.fuel ?? 0) < 20) lines.push({ material: 'fuel', qty: 10 });
  if (strat === 'prepper' && s.stock.inverter + (pending.inverter ?? 0) < 1) lines.push({ material: 'inverter', qty: 1 });
  if (lines.length && !orderProblem(s, lines)) placeOrder(s, lines);
}

interface RunResult { site: string; strat: Strategy; kind: DisasterKind; variant: string; ending: string; grade: string; alive: string; hungry: number; days: number; moneyAtHit: number; builtAtHit: number; bugs: string[]; lines: string[] }

function play(strat: Strategy, kind: DisasterKind, seed: number, peace: 'short' | 'medium', site: Site = CLASSIC): RunResult {
  let s = newGame(seed, 105, 2027, { site: site === CLASSIC ? undefined : site, mode: 'scenario', peace, kind, dayJobs: true, grid: true });
  // the plans are drawn on the 40; squeeze them into the place actually bought
  const h = s.site.home, M = (x: number, z: number): [number, number] => [h.x0 + x / 67 * (h.x1 - h.x0), h.z0 + z / 67 * (h.z1 - h.z0)];
  let C = M(30, 30);
  const bugs: string[] = [];
  // what came with the land: laid in beside the plans' cabin spot (the world would pick these)
  const spots: Record<string, { x: number; z: number; rot: number }> = {};
  s.structures.filter(x => x.unplaced).forEach((st, i) => { const [x, z] = M(44 + (i % 2) * 8, 44 + Math.floor(i / 2) * 8); spots[st.id] = { x, z, rot: 0 }; });
  placeImprovements(s, spots);
  const pre = s.structures.find(x => x.pre && isHome(x.kind));
  if (pre) C = [pre.x, pre.z];
  const has = (k: string) => s.structures.some(x => x.kind === k || (k === 'timber_cabin' && isHome(x.kind)) || (k === 'well_hand' && x.kind === 'well_drilled'));
  // raw land: the line and the drive first thing
  for (const what of ['drive', 'power'] as const) orderHookup(s, what);
  let planned = 0, moneyAtHit = 0, builtAtHit = 0, hitSeen = false;
  const maxDays = s.disaster.hitAt + 730;
  for (let day = 0; day < maxDays; day++) {
    // build: one new plan when there's money for it (keep a reserve)
    const plans = PLANS[strat];
    while (planned < plans.length && ['timber_cabin', 'well_hand', 'well_drilled', 'septic'].includes(plans[planned][0]) && has(plans[planned][0])) planned++;
    if (planned < plans.length && s.money > 25000 && s.structures.filter(x => !isFinished(x)).length < 2) {
      const [k0, x0, z0] = plans[planned++];
      // too deep to dig by hand: drill it
      const k = planProblem(s, k0) && k0 === 'well_hand' ? 'well_drilled' : k0;
      const [x, z] = M(x0, z0);
      const st = planStructure(s, k, x, z, 0);
      // money to spare: hire it out
      if ((strat === 'prepper' || strat === 'fortress') && s.money > 150_000 && hoursLeft(st) > 300) hireCrew(s, st.id);
      if (k === 'solar_array' || k === 'battery_shed' || k === 'generator_shed') { const r = planRun(s, 'power_cable', [[x, z], C]); void r; }
      if (k === 'well_drilled' || k === 'cistern') planRun(s, 'water_pipe', [[x, z], C]);
    }
    if (strat === 'fortress' && day === 120) planRun(s, 'log_palisade', [M(15, 15), M(50, 15), M(50, 50), M(15, 50), M(15, 15)]);
    if (strat === 'prepper' && day === 600) for (const id of ['fallout', 'faraday', 'nbc'] as const) orderHardenAll(s, id, 1);
    if (day % 3 === 0 && s.clock.t < s.disaster.hitAt) orderNeeds(s, strat);
    // wire and plumb the house once it can be; order what its repairs need
    const cabin = s.structures.find(x => isHome(x.kind) && isFinished(x));
    if (cabin && day % 5 === 0) for (const f of pendingFixes(cabin)) if (fixBlocked(s, f) && !orderProblem(s, Object.entries(fixBill(f)).map(([material, qty]) => ({ material: material as MaterialId, qty: qty as number })))) { placeOrder(s, Object.entries(fixBill(f)).map(([material, qty]) => ({ material: material as MaterialId, qty: qty as number }))); break; }
    if (cabin && day % 10 === 0) { const p = plant(s); for (const k of ['wire', 'plumb'] as const) if (!fitProblem(s, p, cabin, k)) orderFit(s, cabin.id, k); }
    s = step(s, 1);
    if (process.env.TRACE && strat === process.env.TRACE && kind === process.env.KIND && day % 15 === 0 && s.clock.t >= s.disaster.hitAt) {
      const k = (f: string) => Math.round((s.stock as Record<string, number>)[f] * ({ fresh: 2000, frozen: 10000, canned: 6000, staples: 80000 } as Record<string, number>)[f] / 1000);
      console.log(`d${Math.floor(s.clock.t - s.disaster.hitAt)} ppl ${s.personState.filter(p => p.needs.died == null).length} need ${Math.round(s.food.needKcal)} grown ${Math.round(s.food.producedKcal)} fresh ${k('fresh')}k can ${k('canned')}k stap ${k('staples')}k jars ${Math.round(s.stock.lids)} fields ${s.structures.filter(x => x.kind === 'field' && isFinished(x)).length} grow ${s.stats.grownYear | 0}/${s.stats.needYear | 0}`);
    }
    if (!hitSeen && s.clock.t >= s.disaster.hitAt) { hitSeen = true; moneyAtHit = Math.round(s.money); builtAtHit = s.structures.filter(isFinished).length; }
    // answer the gate
    let guard = 0;
    while (s.gate.pending && guard++ < 5) { const e = s.gate.pending; resolve(s, STANCE[strat](e.stances, e.kind, s, e.size)); s.gate.card = null; }
    if (s.gate.pending) bugs.push(`gate stuck on day ${day}`);
    // sanity
    if (!Number.isFinite(s.money)) bugs.push(`money is ${s.money} on day ${day}`);
    for (const m of MATERIAL_IDS) if (s.stock[m] < -1e-6 || !Number.isFinite(s.stock[m])) bugs.push(`stock ${m} = ${s.stock[m]} on day ${day}`);
    for (const ps of s.personState) if (!Number.isFinite(ps.needs.health) || !Number.isFinite(ps.needs.dose)) bugs.push(`needs NaN on day ${day}`);
    if (bugs.length > 5) break;
    if (s.ending) break;
  }
  const r = reportCard(s);
  const alive = s.personState.filter(ps => ps.needs.died == null).length;
  return { site: `${s.site.acres} ac ${s.site.creek ? 'creek' : s.site.spring ? 'spring' : 'dry'} ${s.site.gwDepth} m ${s.site.improvements.house ? s.site.improvements.house.kind + ' ' : 'raw '}$${Math.round(s.site.price / 1000)}k`, strat, kind, variant: s.disaster.variant, ending: s.ending?.kind ?? 'still going (2 yrs)', grade: r.grade, alive: `${alive}/${s.personState.length}`, hungry: s.stats.hungryDays, days: s.stats.days, moneyAtHit, builtAtHit, bugs: [...new Set(bugs)].slice(0, 5), lines: r.lines };
}

describe.skipIf(!process.env.PLAYTEST)('playtest', () => {
  it('plays the strategies against the disasters', () => {
    const kinds: DisasterKind[] = ['grid_down', 'nuclear', 'drought', 'pandemic', 'wildfire', 'ash_winter', 'financial', 'solar_flare', 'zombies'];
    const strats: Strategy[] = ['idle', 'homestead', 'prepper', 'fortress'];
    const results: RunResult[] = [];
    let seed = 11;
    for (const kind of kinds) for (const strat of strats) { const site = listings(seed)[seed % 4]; results.push(play(strat, kind, seed++, 'medium', site)); }
    const md = ['# Playtest report (scripted)', '', '| Site | Disaster | Strategy | Variant | Ending | Grade | Alive | Hungry days | Days | $ at hit | Built at hit | Bugs |', '|---|---|---|---|---|---|---|---|---|---|---|---|',
      ...results.map(r => `| ${r.site} | ${r.kind} | ${r.strat} | ${r.variant} | ${r.ending} | ${r.grade} | ${r.alive} | ${r.hungry} | ${r.days} | ${r.moneyAtHit.toLocaleString('en-US')} | ${r.builtAtHit} | ${r.bugs.join('; ')} |`),
      '', '## Report card lines', '', ...results.map(r => `- **${r.kind} / ${r.strat}:** ${r.lines.join(' ')}`)];
    writeFileSync('playtest-report.md', md.join('\n'));
    expect(results.flatMap(r => r.bugs)).toEqual([]);
  }, 1_800_000);
});
