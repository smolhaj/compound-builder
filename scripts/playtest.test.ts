/**
 * Scripted playtest (v1): a sim-only agent plays whole runs with different
 * build strategies against the disasters, and writes a report of how each
 * went (ending, grade, survivors, hunger, what broke) plus anything that
 * looks like a bug (NaN, negative stock, a stuck run). Slow: only with
 *   PLAYTEST=1 npx vitest run scripts/playtest.test.ts
 * Report: playtest-report.md (repo root).
 */
import { describe, expect, it } from 'vitest';
import { appendFileSync, writeFileSync } from 'node:fs';
import { newGame, type GameState } from '../src/sim/state';
import { step } from '../src/sim/engine';
import { placeOrder, orderProblem, payWith } from '../src/sim/economy';
import { planStructure, planProblem, isFinished } from '../src/sim/construction';
import { CLASSIC, listings, type Site } from '../src/sim/site';
import { BLUEPRINTS, isHome } from '../src/sim/blueprints';
import { fixBill, fixBlocked, orderHookup, pendingFixes, placeImprovements } from '../src/sim/improvements';
import { hireCrew, hoursLeft } from '../src/sim/crews';
import { applyForPermit } from '../src/sim/paperwork';
import { sweepChimney } from '../src/sim/upkeep';
import { stockUpRx } from '../src/sim/body';
import { buyAmmo, buyGun, takeClass, type Caliber } from '../src/sim/armory';
import { buyLicense } from '../src/sim/wildfood';
import { isRadiationHurt } from '../src/sim/radiation';
import { isColdHurt } from '../src/sim/cold';
import { HAND_PUMP_MAX_M } from '../src/sim/water';
import { markTree } from '../src/sim/forestry';
import { askRansom, canPay, openCaptives } from '../src/sim/rescue';
import { calendarOf } from '../src/sim/state';
import { planRun } from '../src/sim/perimeter';
import { orderFit, fitProblem, plant, repairPump, replaceFried } from '../src/sim/utilities';
import { orderHardenAll } from '../src/sim/hardening';
import { defenseOf, postureOf, resolve, type Stance } from '../src/sim/encounters';
import { resolveAftermath, type AftermathChoice } from '../src/sim/aftermath';
import type { PlannedBattle } from '../src/sim/battle';
const AFTER: Record<string, AftermathChoice> = { idle: 'leave', homestead: 'treat_release', prepper: 'hold', fortress: 'leave' };
import { reportCard } from '../src/sim/report';
import { bestShelter } from '../src/sim/nuclear';
import { daysOfFood, FIELD_KCAL, fieldHarvest, KCAL, needOf } from '../src/sim/needs';
import { SOIL_YIELD } from '../src/sim/site';
import { REGION_IDS, REGIONS, seasons, type RegionId } from '../src/sim/regions';
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
/** Their strength well over the place's defense (what the gate card shows). */
const outgunned = (s: GameState) => (s.gate.pending?.strength ?? 0) > defenseOf(postureOf(s)) * 1.2;
/** A fight the place should win easily: their strength well under its defense. */
const outclassed = (s: GameState) => (s.gate.pending?.strength ?? Infinity) < defenseOf(postureOf(s)) * 0.6;
const livingCount = (s: GameState) => s.personState.filter(p => p.needs.died == null).length;
/** Days of food left per head if `size` more join (what the gate card shows). */
const roomFor = (s: GameState, size: number) => { const here = livingCount(s); return daysOfFood(s) * here / (here + size); };
/** A quarter-acre field in an ordinary year, on this soil, with the family's best gardener (needs.ts fieldHarvest, without the weather). */
const perFieldBook = (s: GameState) => FIELD_KCAL * (0.6 + 0.08 * Math.max(0, ...s.people.filter((_, i) => s.personState[i].needs.died == null).map(p => p.skills.gardener))) * SOIL_YIELD[s.site.soil];
/** What a field actually made the last few harvests (the bot learns from its own fields: the short northern seasons, hail, drought). */
let observed: number[] = [], season = 0;
const perField = (s: GameState) => observed.length ? observed.reduce((a, x) => a + x, 0) / observed.length : perFieldBook(s);
function watchHarvest(s: GameState): void {
  const today = fieldHarvest(s), fields = s.structures.filter(x => x.kind === 'field' && isFinished(x)).length;
  if (today > 0) season += today;
  else if (season > 0) { if (fields) observed = [...observed, season / fields].slice(-3); season = 0; }
}
/** A year of what the place grows in an ordinary year (fields, garden, hens; rough). */
const yearGrown = (s: GameState) => { const fin = s.structures.filter(isFinished); return fin.filter(x => x.kind === 'field').length * perField(s) + fin.filter(x => x.kind === 'garden').length * 250_000 + fin.filter(x => x.kind === 'chicken_coop').length * 180_000; };
/** A year of eating for everyone here plus `size` adults. */
const yearNeed = (s: GameState, size: number) => (s.people.reduce((a, p, i) => a + (s.personState[i].needs.died == null ? needOf(p) : 0), 0) + size * 2400) * 365;
/** Days until the next field harvest is in (the end of the region's harvest window). */
const toHarvest = (s: GameState) => { const doy = calendarOf(s.clock).doy, [, h1] = seasons(REGIONS[s.site.region]).harvest; return (h1 - doy + 365) % 365; };
/**
 * Would the food cover `size` more (`margin` 1.2 = 20 % over): what's put by
 * has to last everyone to the next harvest, and the harvest the fields have
 * been making has to feed them after that.
 */
const foodCovers = (s: GameState, size: number, margin: number) => {
  const stored = (['fresh', 'frozen', 'canned', 'staples'] as const).reduce((a, f) => a + s.stock[f] * KCAL[f], 0);
  const year = yearNeed(s, size), day = year / 365;
  // (an earlier try let a big pantry stand in for the harvest: the long game's families then ate the pantry down with the people taken in and starved)
  return stored >= day * toHarvest(s) * margin && yearGrown(s) >= year * margin;
};
const STANCE: Record<Strategy, (kinds: Stance[], kind: string, s: GameState, size: number) => Stance> = {
  idle: k => k.includes('turn_away') ? 'turn_away' : k.includes('hide') ? 'hide' : k[0],
  // a sensible family: talk first, and if they're clearly outgunned, hide rather than fight
  // (v2: only take people in when the stores and the year's harvest cover them too; before, anyone was taken in while the shops were open)
  homestead: (k, kind, s, n) => kind === 'arrival' ? (foodCovers(s, n, 1.1) && roomFor(s, n) > 120 ? 'take_in' : 'trade') : outgunned(s) && k.includes('hide') ? 'hide' : k.includes('parley') ? 'parley' : k[0],
  // a prepper hides when outgunned (or it's the dead), stands and fights only when the place clearly outclasses them
  prepper: (k, kind, s, n) => kind === 'arrival' ? (foodCovers(s, n, 1.25) && roomFor(s, n) > 240 ? 'trial' : 'turn_away')
    : process.env.PREPPER_FIGHTS && kind !== 'horde' && !outgunned(s) && outclassed(s) && k.includes('defend') ? 'defend' : k.includes('hide') ? 'hide' : k[0],
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
  // food: a prepper keeps a year put by, the fortress a siege year too (v2: it had none), a homesteader three months
  const months = strat === 'prepper' ? 12 : strat === 'fortress' ? 12 : strat === 'homestead' ? 3 : 0;
  const kcalYear = s.people.reduce((a, p, i) => a + (s.personState[i].needs.died == null ? (p.kid ? 1700 : 2400) : 0), 0) * 30 * months;
  const haveKcal = s.stock.staples * 80000 + s.stock.canned * 6000 + (pending.staples ?? 0) * 80000;
  if (haveKcal < kcalYear) lines.push({ material: 'staples', qty: Math.ceil((kcalYear - haveKcal) / 80000) });
  const jars = strat === 'prepper' ? 400 : strat === 'homestead' || strat === 'fortress' ? 200 : 0;
  if (s.stock.lids + (pending.lids ?? 0) < jars / 2) lines.push({ material: 'lids', qty: jars });
  // a winter's firewood (about 4 cords) in by fall
  if (strat !== 'idle' && s.stock.firewood + (pending.firewood ?? 0) < 12) lines.push({ material: 'firewood', qty: 12 });
  // soap and paper for when the stores close: a year (prepper) or three months (homestead) a head
  const heads = s.people.length, hyg = strat === 'prepper' ? 12 * heads : strat === 'homestead' ? 3 * heads : 0;
  if (s.stock.hygiene + (pending.hygiene ?? 0) < hyg / 2) lines.push({ material: 'hygiene', qty: hyg });
  // traps in the stores, stabilizer in the gas
  if (strat !== 'idle' && s.stock.traps + (pending.traps ?? 0) < 1) lines.push({ material: 'traps', qty: 3 });
  if (strat === 'prepper' && s.stock.stabilizer + (pending.stabilizer ?? 0) < Math.ceil((s.stock.fuel + (pending.fuel ?? 0)) / 10)) lines.push({ material: 'stabilizer', qty: 2 });
  if (strat === 'prepper' && s.stock.meds + (pending.meds ?? 0) < 4) lines.push({ material: 'meds', qty: 2 });
  if (strat === 'prepper' && s.stock.fuel + (pending.fuel ?? 0) < 20) lines.push({ material: 'fuel', qty: 10 });
  if (strat === 'prepper' && s.stock.inverter + (pending.inverter ?? 0) < 1) lines.push({ material: 'inverter', qty: 1 });
  // (v2) a spare well pump on the shelf, and hardware kits to fix pumps and fit spares with, once nobody comes out to do it
  if ((strat === 'prepper' || strat === 'homestead') && s.structures.some(x => x.kind === 'well_drilled') && s.stock.pump + (pending.pump ?? 0) < 1) lines.push({ material: 'pump', qty: 1 });
  // (survival realism) a hand pump down the drilled well for when the power's out; iodide and cold-weather bags for the prepper, bags for the homestead
  if ((strat === 'prepper' || strat === 'homestead') && s.structures.some(x => x.kind === 'well_drilled') && s.site.gwDepth <= HAND_PUMP_MAX_M && s.stock.hand_pump + (pending.hand_pump ?? 0) < 1) lines.push({ material: 'hand_pump', qty: 1 });
  if (strat === 'prepper' && s.stock.potassium_iodide + (pending.potassium_iodide ?? 0) < heads) lines.push({ material: 'potassium_iodide', qty: heads });
  if ((strat === 'prepper' || strat === 'homestead') && s.stock.sleeping_bags + (pending.sleeping_bags ?? 0) < heads) lines.push({ material: 'sleeping_bags', qty: heads - Math.floor(s.stock.sleeping_bags + (pending.sleeping_bags ?? 0)) });
  // seed and fence for the fields still to come, after the shops close (v2): enough for a field per head and a few to spare
  if (PLANS[strat].some(p => p[0] === 'field')) {
    const extra = FIELD_SPARE[strat] + Math.max(0, fieldsWanted(s) - s.structures.filter(x => x.kind === 'field').length);
    const keep: Partial<Record<MaterialId, number>> = { seed: extra, lumber: 4 * extra, wire: 2 * extra, hardware: extra + 3 };
    for (const [m, n] of Object.entries(keep) as Array<[MaterialId, number]>) {
      const have = s.stock[m] + (pending[m] ?? 0) + (lines.find(l => l.material === m)?.qty ?? 0) - (need[m] ?? 0);
      if (have < n) lines.push({ material: m, qty: Math.ceil(n - have) });
    }
  }
  if (lines.length && !orderProblem(s, lines)) placeOrder(s, lines);
}

/** Fields put by for after the collapse, beyond what today's mouths need (arrivals, lost crops). */
const FIELD_SPARE: Record<Strategy, number> = { idle: 0, homestead: 3, prepper: 6, fortress: 0 };
/** Fields to keep for the mouths here: a year of eating over an ordinary year's field (less the garden and the hens), at least one per 1.5 mouths, 16 at most. */
function fieldsWanted(s: GameState): number {
  const fin = s.structures.filter(isFinished);
  const rest = fin.filter(x => x.kind === 'garden').length * 250_000 + fin.filter(x => x.kind === 'chicken_coop').length * 180_000;
  return Math.min(16, Math.max(Math.ceil(livingCount(s) / 1.5), Math.ceil((yearNeed(s, 0) - rest) / perField(s))));
}
/** Seed and fence lumber not yet spoken for by fields still waiting for their stage. */
function fieldStock(s: GameState): boolean {
  const open = s.structures.filter(x => x.kind === 'field' && !isFinished(x));
  const seedOwed = open.filter(x => x.stage < 2 || (x.stage === 2 && !x.supplied)).length;
  const fenceOwed = open.filter(x => x.stage < 3 || (x.stage === 3 && !x.supplied)).length;
  return s.stock.seed - seedOwed >= 1 && s.stock.lumber - 4 * fenceOwed >= 4 && s.stock.wire - 2 * fenceOwed >= 2 && s.stock.hardware - fenceOwed >= 1;
}
/** Where the next field goes: the first free plot on the strips along the parcel's north and south edges (plan coordinates). */
function fieldSpot(s: GameState, M: (x: number, z: number) => [number, number]): [number, number] | null {
  const plots: Array<[number, number]> = [];
  for (const z of [5, 60, 12, 19]) for (let x = 5; x <= 61; x += 7) plots.push([x, z]);
  for (const [px, pz] of plots) {
    const [x, z] = M(px, pz), [x1] = M(px + 6, pz);
    const r = Math.abs(x1 - x);
    if (!s.structures.some(st => Math.hypot(st.x - x, st.z - z) < r)) return [x, z];
  }
  return null;
}

interface RunResult { causes: string; often: Array<[string, number]>; minMoney: number; site: string; strat: Strategy; kind: DisasterKind; variant: string; ending: string; grade: string; alive: string; hungry: number; days: number; moneyAtHit: number; builtAtHit: number; bugs: string[]; lines: string[]; fights: string[]; prisoners: number }

function play(strat: Strategy, kind: DisasterKind, seed: number, peace: 'short' | 'medium', site: Site = CLASSIC, years = 0): RunResult & { s: GameState } {
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
  if (strat === 'prepper' || strat === 'homestead') s.shelf.rotate = true;
  // raw land: the line and the drive first thing
  for (const what of ['drive', 'power'] as const) orderHookup(s, what);
  const fights: string[] = [];
  let planned = 0, moneyAtHit = 0, builtAtHit = 0, hitSeen = false, lastLog = -Infinity, minMoney = s.money, lastMoney = s.money;
  const seen = new Map<string, number>();
  observed = []; season = 0;
  // how each one was lost (read off their state the day it happened)
  const causes = new Map<string, number>(), mourned = new Set<string>();
  const tallyDeaths = (fought: boolean) => s.personState.forEach((ps, i) => {
    const n = ps.needs, p = s.people[i];
    if (n.died == null || mourned.has(ps.id)) return;
    mourned.add(ps.id);
    const why = n.taken ? 'taken' : fought ? 'killed in a fight' : n.hunger > 5000 ? 'hunger' : n.hurt.some(h => h.trauma) ? 'wounds' : (n.dry ?? 0) >= 5 ? 'thirst' : n.hurt.some(h => isRadiationHurt(h.what)) ? 'radiation' : n.hurt.some(h => isColdHurt(h.what)) || (n.chill ?? 0) >= 10 ? 'cold' : n.hurt.some(h => h.what === 'fever') ? 'sickness' : (p?.age ?? 0) >= 65 ? 'old age' : 'other';
    causes.set(why, (causes.get(why) ?? 0) + 1);
  });
  const maxDays = years ? years * 365 : s.disaster.hitAt + 730;
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
      applyForPermit(s, st);
      // money to spare: hire it out
      if ((strat === 'prepper' || strat === 'fortress') && s.money > 150_000 && hoursLeft(st) > 300) hireCrew(s, st.id);
      if (k === 'solar_array' || k === 'battery_shed' || k === 'generator_shed') { const r = planRun(s, 'power_cable', [[x, z], C]); void r; }
      if (k === 'well_drilled' || k === 'cistern') planRun(s, 'water_pipe', [[x, z], C]);
    }
    // fields for the mouths here (v2: before and after the collapse, from the seed and fence put by; before, no field was ever added once it hit)
    if (strat !== 'idle' && day % 10 === 0 && s.structures.some(x => x.kind === 'field')) {
      const fields = s.structures.filter(x => x.kind === 'field'), open = fields.filter(x => !isFinished(x)).length;
      const busy = s.structures.filter(x => !isFinished(x)).length;
      const spot = fields.length < fieldsWanted(s) && open < 2 && busy < 4 && fieldStock(s) ? fieldSpot(s, M) : null;
      if (spot) applyForPermit(s, planStructure(s, 'field', spot[0], spot[1], 0));
    }
    // firewood for next winter once the yard can't sell it: mark a few trees in the woodlot (the world's trees stand in as numbered ones)
    if (strat !== 'idle' && day % 10 === 0 && s.disaster.tracks.stores < 0.5 && s.stock.firewood + s.upkeep.green.reduce((a, g) => a + g.ricks, 0) < 15 && s.forestry.jobs.length < 3) {
      for (let k = 0; k < 3; k++) { const id = 1_000_000 + s.nextId; const [x, z] = M(4 + (id % 9) * 7, 64); markTree(s, { id, x, z, kind: 'broad', scale: 1 }, 20); }
    }
    if (strat === 'fortress' && day === 120) planRun(s, 'log_palisade', [M(15, 15), M(50, 15), M(50, 50), M(15, 50), M(15, 15)]);
    if (strat === 'prepper' && day === 600) for (const id of ['fallout', 'faraday', 'nbc'] as const) orderHardenAll(s, id, 1);
    // (v2: and after the hit too, for as long as the trucks still deliver)
    if (day % 3 === 0 && (s.clock.t < s.disaster.hitAt || payWith(s))) orderNeeds(s, strat);
    // (v2) someone taken: send word that the family will pay, whenever there's a lead to carry it
    if (strat !== 'idle' && day % 10 === 0) for (const c of openCaptives(s)) askRansom(s, c.pid);
    // (v2) a dead pump gets a hardware kit, an EMP-fried one its spare, as the HUD's buttons would
    if (strat !== 'idle') {
      for (const id of [...s.utilities.broken]) repairPump(s, id);
      for (const id of [...s.utilities.fried]) replaceFried(s, id);
    }
    // the prescriptions, three months ahead, once the news turns
    if (strat !== 'idle' && s.disaster.phase === 'warning' && day % 30 === 0) stockUpRx(s);
    // the armory, bought early (a deer rifle and a .22; more for the preppers and the fortress)
    if (day === 10 && strat !== 'idle') {
      const kit: Record<string, string[]> = { homestead: ['marlin_336', 'ruger_1022'], prepper: ['rem_700', 'sw_mp15', 'sw_mp15', 'mossberg_500', 'glock_19', 'ruger_1022'], fortress: ['sw_mp15', 'sw_mp15', 'ruger_mini14', 'mossberg_500', 'rem_700'] };
      for (const m of kit[strat] ?? []) buyGun(s, m);
      const ammo: Partial<Record<Caliber, number>> = strat === 'homestead' ? { '3030': 6, '22lr': 2 } : strat === 'prepper' ? { '308': 15, '556': 50, '12ga': 12, '9mm': 20, '22lr': 4 } : { '556': 75, '12ga': 12, '308': 10 };
      for (const [c, n] of Object.entries(ammo) as Array<[Caliber, number]>) buyAmmo(s, c, n);
      if (strat !== 'homestead') for (const p of s.people.filter(x => !x.kid)) takeClass(s, p.id);
      placeOrder(s, [{ material: 'gun_safe', qty: 1 }, { material: 'gun_cleaning', qty: 2 }]);
      const gear: Partial<Record<MaterialId, number>> = strat === 'prepper' ? { driveway_alarm: 1, cameras: 1, dog: 1, ifak: 6, radios: 2, plate_carrier: 2, nvg: 1, water_filter: 2, water_jugs: 30, ibc_tote: 4, fishing_gear: 1, snares: 2, smoker: 1 }
        : strat === 'fortress' ? { water_filter: 1, water_jugs: 20, sandbags: 3, steel_door: 2, window_bars: 1, driveway_alarm: 1, dog: 2, plate_carrier: 4, ifak: 6, radios: 2 } : { driveway_alarm: 1, ifak: 2, water_filter: 1, water_jugs: 10, fishing_gear: 1, snares: 1 };
      placeOrder(s, (Object.entries(gear) as Array<[MaterialId, number]>).map(([material, qty]) => ({ material, qty })));
    }
    // the year's tags and licenses
    if (strat !== 'idle' && calendarOf(s.clock).doy === 240) for (const l of ['deer', 'elk', 'fishing', 'small'] as const) buyLicense(s, l);
    // sweep the chimney each fall
    if (strat !== 'idle' && calendarOf(s.clock).doy === 260) sweepChimney(s);
    // wire and plumb the house once it can be; order what its repairs need
    const cabin = s.structures.find(x => isHome(x.kind) && isFinished(x));
    if (cabin && day % 5 === 0) for (const f of pendingFixes(cabin)) if (fixBlocked(s, f) && !orderProblem(s, Object.entries(fixBill(f)).map(([material, qty]) => ({ material: material as MaterialId, qty: qty as number })))) { placeOrder(s, Object.entries(fixBill(f)).map(([material, qty]) => ({ material: material as MaterialId, qty: qty as number }))); break; }
    if (cabin && day % 10 === 0) { const p = plant(s); for (const k of ['wire', 'plumb'] as const) if (!fitProblem(s, p, cabin, k)) orderFit(s, cabin.id, k); }
    s = step(s, 1);
    // the day's log, with the numbers taken out, tallied: what keeps happening
    for (const l of s.log) if (l.t > lastLog) { const k = l.text.replace(/[\d,.$]+/g, '#'); seen.set(k, (seen.get(k) ?? 0) + 1); }
    lastLog = s.log.length ? s.log[s.log.length - 1].t : lastLog;
    minMoney = Math.min(minMoney, s.money);
    watchHarvest(s);
    tallyDeaths(false);
    // (checked after the day's tally; a death at the gate is tallied the next midnight)
    if (livingCount(s) === 0 && !s.ending) bugs.push(`everyone is gone but the run goes on (day ${day}, ${s.disaster.phase})`);
    if (s.money - lastMoney > 100_000) bugs.push(`money jumped $${Math.round(s.money - lastMoney).toLocaleString('en-US')} on day ${day}`);
    lastMoney = s.money;
    if (process.env.YEARLY && years && day % Number(process.env.YEARLY_EVERY ?? 91) === 0 && (!process.env.SEED || seed === Number(process.env.SEED))) {
      const liv = s.personState.filter(p => p.needs.died == null);
      appendFileSync(process.env.YEARLY!, `${seed} y${(day / 365).toFixed(2)} era ${s.lineage.era} ${s.disaster.kind} ph ${s.disaster.phase} hit ${Math.round(s.disaster.hitAt)} ppl ${liv.length} hp ${Math.round(Math.min(...liv.map(p => p.needs.health)))} hunger ${Math.round(Math.max(...liv.map(p => p.needs.hunger)))} days food ${Math.round(daysOfFood(s))} grown ${Math.round(s.food.producedKcal)} need ${Math.round(s.food.needKcal)} $${Math.round(s.money)} stores ${s.disaster.tracks.stores.toFixed(2)} deliv ${s.disaster.tracks.deliveries.toFixed(2)} med ${s.disaster.tracks.medical.toFixed(2)} grid ${s.disaster.tracks.grid.toFixed(2)} fields ${s.structures.filter(x => x.kind === 'field' && isFinished(x)).length} water ${Math.round(s.utilities.report.waterL)}/${Math.round(s.utilities.report.useL)} short ${Math.round(s.utilities.report.shortL)} stored ${Math.round(s.utilities.storedL)} banks ${s.disaster.tracks.banks.toFixed(2)} wells ${s.structures.filter(x => x.kind.startsWith('well')).map(x => `${x.kind}:${x.stage}${s.utilities.broken.includes(x.id) ? 'B' : ''}${s.utilities.fried.includes(x.id) ? 'F' : ''}${s.utilities.lit.includes(x.id) ? 'L' : ''}`).join(',')} hw ${Math.round(s.stock.hardware)} dose ${Math.max(0, ...liv.map(p => p.needs.dose)).toFixed(2)} haul ${s.utilities.hauling ? 1 : 0} shelter ${Math.round(bestShelter(s)[0])} creek ${s.site.creek ? 1 : 0} spring ${s.site.spring ? 1 : 0} end ${s.ending?.kind ?? ''}\n`);
    }
    if (process.env.TRACE && strat === process.env.TRACE && kind === process.env.KIND && day % 15 === 0 && s.clock.t >= s.disaster.hitAt) {
      const k = (f: string) => Math.round((s.stock as Record<string, number>)[f] * ({ fresh: 2000, frozen: 10000, canned: 6000, staples: 80000 } as Record<string, number>)[f] / 1000);
      console.log(`d${Math.floor(s.clock.t - s.disaster.hitAt)} ppl ${s.personState.filter(p => p.needs.died == null).length} need ${Math.round(s.food.needKcal)} grown ${Math.round(s.food.producedKcal)} fresh ${k('fresh')}k can ${k('canned')}k stap ${k('staples')}k jars ${Math.round(s.stock.lids)} fields ${s.structures.filter(x => x.kind === 'field' && isFinished(x)).length} grow ${s.stats.grownYear | 0}/${s.stats.needYear | 0}`);
    }
    if (!hitSeen && s.clock.t >= s.disaster.hitAt) { hitSeen = true; moneyAtHit = Math.round(s.money); builtAtHit = s.structures.filter(isFinished).length; }
    // answer the gate
    let guard = 0;
    while (s.gate.pending && guard++ < 5) {
      // (v2: compare with the battle on file before this answer: the day's step clones the state, so the last fight used to be counted again at every later gate)
      const e = s.gate.pending, before = s.gate.battle, def = Math.round(defenseOf(postureOf(s)));
      // word from a crew holding one of ours: pay it if it can be paid, talk it down if six in ten can, else no deal (the idle family never pays)
      const ransom = e.kind === 'ransom' && e.ransom ? (strat === 'idle' ? 'refuse' : canPay(s, e.ransom) ? 'pay' : canPay(s, e.ransom, 0.6) ? 'parley' : 'refuse') : null;
      resolve(s, ransom ?? STANCE[strat](e.stances, e.kind, s, e.size)); s.gate.card = null;
      const b = s.gate.battle as (PlannedBattle | undefined);
      if (b && b !== before) { if (process.env.GATES) console.log(`gate ${strat} ${kind} d${Math.floor(s.clock.t - s.disaster.hitAt)} ${e.kind} ${e.temper ?? ''} n${e.size} str ${e.strength} vs def ${def}: ${b.result} people ${livingCount(s)}`); fights.push(`${b.result}${b.events.some(x => x.kind === 'death' && x.unit.startsWith('h_')) ? ' (lost people)' : ''}`); }
      // after the shooting: what each kind of family does with the wounded raiders
      if (s.gate.aftermath) resolveAftermath(s, AFTER[strat]);
    }
    tallyDeaths(true);
    if (s.gate.pending) bugs.push(`gate stuck on day ${day}`);
    // sanity
    if (!Number.isFinite(s.money)) bugs.push(`money is ${s.money} on day ${day}`);
    for (const m of MATERIAL_IDS) if (s.stock[m] < -1e-6 || !Number.isFinite(s.stock[m])) bugs.push(`stock ${m} = ${s.stock[m]} on day ${day}`);
    for (const ps of s.personState) if (!Number.isFinite(ps.needs.health) || !Number.isFinite(ps.needs.dose)) bugs.push(`needs NaN on day ${day}`);
    if (bugs.length > 5) break;
    // the long game: play on through the eras until the line ends
    if (s.ending && years && s.ending.kind !== 'wipe') s.ending.continued = true;
    else if (s.ending) break;
  }
  const r = reportCard(s);
  const alive = s.personState.filter(ps => ps.needs.died == null).length;
  const often = [...seen].filter(([, n]) => n >= 40).sort((a, b) => b[1] - a[1]).slice(0, 6);
  return { causes: [...causes].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${n} ${k}`).join(', '), often, minMoney: Math.round(minMoney), site: `${s.site.acres} ac ${s.site.creek ? 'creek' : s.site.spring ? 'spring' : 'dry'} ${s.site.gwDepth} m ${s.site.improvements.house ? s.site.improvements.house.kind + ' ' : 'raw '}$${Math.round(s.site.price / 1000)}k`, strat, kind, variant: s.disaster.variant, ending: s.ending?.kind ?? 'still going (2 yrs)', grade: r.grade, alive: `${alive}/${s.personState.length}`, hungry: s.stats.hungryDays, days: s.stats.days, moneyAtHit, builtAtHit, bugs: [...new Set(bugs)].slice(0, 5), lines: r.lines, fights, prisoners: s.gate.prisoners?.length ?? 0, s };
}

describe.skipIf(process.env.PLAYTEST !== 'long')('the long game', () => {
  it('plays on through the eras for 40 years', () => {
    const rows: string[] = ['# Long-game playtest (scripted, 40 years)', '', '| Seed | Region | Strategy | Eras | Living | Lost to | Ended | Born here | Generations | Dynasty | Milestones | Bugs |', '|---|---|---|---|---|---|---|---|---|---|---|---|'];
    const notes: string[] = [];
    const bugs: string[] = [];
    let seed = 41;
    // (round 3: every region, a homestead and a prepper in each, then the idle and fortress baselines)
    const runs: Array<[Strategy, RegionId]> = [...REGION_IDS.flatMap(g => [['homestead', g], ['prepper', g]] as Array<[Strategy, RegionId]>), ['idle', 'mountain_west'], ['fortress', 'mountain_west']];
    for (const [strat, region] of runs) {
      const kind = (['grid_down', 'pandemic', 'financial', 'drought', 'wildfire', 'cyberattack'] as DisasterKind[])[seed % 6];
      const r = play(strat, kind, seed, 'short', listings(seed, region)[seed % 4], 40);
      const s = r.s, L = s.lineage;
      const living = s.people.filter((_, i) => s.personState[i].needs.died == null);
      rows.push(`| ${seed} | ${region} | ${strat} | ${L.eras.map(e => `${e.name} ${e.grade} (${e.fate})`).join(', ') || '-'}${s.ending?.kind === 'wipe' ? ' · wiped' : ''} | ${living.length}/${s.people.length} | ${r.causes || '-'} | ${s.ending?.kind === 'wipe' ? `${calendarOf(s.clock).year} (${s.disaster.phase})` : '-'} | ${s.people.filter(p => p.bornHere).length} | ${new Set(living.filter(p => p.kin).map(p => p.gen)).size} | ${Math.round(L.points)} | ${L.milestones.length} | ${r.bugs.join('; ')} |`);
      notes.push(`## Seed ${seed} (${strat}, ${region})`, '', ...L.chronicle.map(e => `- ${e.year}: ${e.text}`), '');
      bugs.push(...r.bugs);
      if (s.people.length !== s.personState.length) bugs.push('people / personState out of step');
      seed++;
    }
    writeFileSync('playtest-long.md', [...rows, '', ...notes].join('\n'));
    expect(bugs).toEqual([]);
  }, 3_600_000);
});

describe.skipIf(!process.env.PLAYTEST || process.env.PLAYTEST === 'long')('playtest', () => {
  it('plays the strategies against the disasters', () => {
    const kinds: DisasterKind[] = ['grid_down', 'nuclear', 'drought', 'pandemic', 'wildfire', 'ash_winter', 'financial', 'solar_flare', 'zombies'];
    const strats: Strategy[] = ['idle', 'homestead', 'prepper', 'fortress'];
    const results: RunResult[] = [];
    let seed = 11;
    for (const kind of kinds) for (const strat of strats) { const site = listings(seed)[seed % 4]; results.push(play(strat, kind, seed++, 'medium', site)); }
    const md = ['# Playtest report (scripted)', '', '| Site | Disaster | Strategy | Variant | Ending | Grade | Alive | Lost to | Hungry days | Days | $ at hit | Built at hit | Fights | Bugs |', '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|',
      ...results.map(r => `| ${r.site} | ${r.kind} | ${r.strat} | ${r.variant} | ${r.ending} | ${r.grade} | ${r.alive} | ${r.causes || '-'} | ${r.hungry} | ${r.days} | ${r.moneyAtHit.toLocaleString('en-US')} | ${r.builtAtHit} | ${r.fights.join(', ') || '-'}${r.prisoners ? ` · ${r.prisoners} held` : ''} | ${r.bugs.join('; ')} |`),
      '', '## Report card lines', '', ...results.map(r => `- **${r.kind} / ${r.strat}:** ${r.lines.join(' ')}`),
      '', '## What keeps happening (log lines seen 40+ times in a run, numbers taken out)', '', ...results.filter(r => r.often.length).map(r => `- **${r.kind} / ${r.strat}:** ${r.often.map(([k, n]) => `${n}× "${k}"`).join('; ')}`),
      '', '## Money', '', ...results.filter(r => r.minMoney < 0).map(r => `- **${r.kind} / ${r.strat}:** went as low as $${r.minMoney.toLocaleString('en-US')}`)];
    writeFileSync('playtest-report.md', md.join('\n'));
    expect(results.flatMap(r => r.bugs)).toEqual([]);
  }, 1_800_000);
});
