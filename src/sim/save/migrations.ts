/**
 * Save migrations. Every change to GameState's fields bumps SAVE_VERSION and
 * adds a step here that upgrades the previous version's JSON (CLAUDE.md
 * rule 5). Pure — tested in migrations.test.ts.
 */
import { foundLineage, newLineage } from '../lineage';
import { SAVE_VERSION, type GameState } from '../state';
import { emptyUtilities } from '../utilities';
import { newDisaster } from '../disaster';
import { freshNeeds } from '../needs';
import { generateNeighbors, newGate } from '../encounters';
import { emptyStats } from '../report';
import { newLand } from '../land';
import { CLASSIC, CLASSIC_IMPROVEMENTS } from '../site';
import { newPaper } from '../paperwork';
import { newUpkeep } from '../upkeep';
import { newShelf } from '../shelf';
import { conditionsFor, newBody } from '../body';
import { newDebt, newFin } from '../finance';
import { newArmory } from '../armory';
import { newBreakins } from '../breakins';
import { newRescue } from '../rescue';
import { newWild } from '../wildfood';
import { dayJob, type Person } from '../family';

type Raw = Record<string, unknown> & { version?: number };

/** version n → n + 1 upgraders. */
const STEPS: Record<number, (s: Raw) => Raw> = {
  // 1 → 2: felling jobs, firewood stock and the stove's burn (M2 step 5)
  1: s => ({
    ...s, version: 2,
    stock: { firewood: 0, ...(s.stock as object) },
    forestry: { jobs: [], cleared: [] },
    heat: { burned: 0, warned: -1 },
  }),
  // 2 → 3: concrete joins the stockpile (workshop slab, cellar, log house footings)
  2: s => ({ ...s, version: 3, stock: { concrete: 0, ...(s.stock as object) } }),
  // 3 → 4: the perimeter (fences, hedges, walls) and its materials
  3: s => ({ ...s, version: 4, perimeter: [], stock: { wire: 0, seedlings: 0, container: 0, ...(s.stock as object) } }),
  // 4 → 5: water and power (utilities state, their materials)
  4: s => ({ ...s, version: 5, utilities: emptyUtilities(), stock: { pipe: 0, cable: 0, fixtures: 0, pump: 0, drilling: 0, solar_panel: 0, battery: 0, inverter: 0, generator: 0, fuel: 0, tank: 0, septic_tank: 0, ...(s.stock as object) } }),
  // 5 → 6: the underground (bunker materials, and the spoil pile digs turn up)
  5: s => ({ ...s, version: 6, stock: { rebar: 0, membrane: 0, excavator: 0, blast_door: 0, nbc_filter: 0, spoil: 0, ...(s.stock as object) } }),
  // 6 → 7: the escape tunnel (culvert, egress hatch)
  6: s => ({ ...s, version: 7, stock: { culvert: 0, egress_hatch: 0, ...(s.stock as object) } }),
  // 38 → 40 (round 4, encounter realism; 39 is reserved for the food branch and is renumbered at merge): what's owed on the
  // card (fin.debt: a negative checking balance moves onto it the first day it runs), trial camps outside the wall, a crew coming back
  38: s => ({ ...s, version: 40, fin: { debt: newDebt(), ...(s.fin as object) }, gate: { camps: [], comeBack: null, ...(s.gate as object) } }),
  // 37 → 38: the taken and getting them back (sim/rescue.ts): no records yet (anyone already taken gets one on the first day it runs)
  37: s => ({ ...s, version: 38, rescue: (s.rescue as object | undefined) ?? newRescue() }),
  // 36 → 37: raider temper on an encounter and `taken` on a person (both optional: old saves have desperate raiders and nobody taken)
  36: s => ({ ...s, version: 37 }),
  // 35 → 36: hail is remembered by year (weather.hail) instead of unbuilding the beds; old saves: no hail this year
  35: s => ({ ...s, version: 36 }),
  // 34 → 35: the greenhouse kit and fruit trees (new goods at zero)
  34: s => ({ ...s, version: 35, stock: { greenhouse_kit: 0, fruit_trees: 0, ...(s.stock as object) } }),
  // 33 → 34: peacetime break-ins and the law (the evidence locker,
  // a felony record (no guns), legal costs, the last local-news story: sim/breakins.ts); a raid reputation starting at nothing.
  33: s => ({ ...s, version: 34, breakins: (s.breakins as object | undefined) ?? newBreakins(), gate: { respect: 0, ...(s.gate as object) } }),
  // 32 → 33: after the shooting (sim/aftermath.ts): no decision waiting, no prisoners yet
  32: s => ({ ...s, version: 33, gate: { aftermath: null, prisoners: [], mercy: 0, executed: 0, ...(s.gate as object) } }),
  // 31 → 32: helmets and soft armor (none yet)
  31: s => ({ ...s, version: 32, stock: { helmet: 0, soft_armor: 0, ...(s.stock as object) } }),
  // 30 → 31: livestock, radios, black-market goods (new goods at zero); vehicles, OPSEC, weather, barter and radio state are made on first use
  30: s => ({ ...s, version: 31, stock: { goat: 0, pig: 0, steer: 0, rabbit: 0, hay: 0, feed: 0, sw_radio: 0, ham_rig: 0, grenades: 0, rpg_launcher: 0, rpg_rounds: 0, suppressor: 0, mines: 0, ...(s.stock as object) } }),
  // 29 → 30: the long game (kinship on the family already here, no eras yet)
  29: s => {
    const people = s.people as Person[];
    for (const p of people) p.kin ??= /^p\d+$/.test(p.id);
    foundLineage(people.filter(p => p.kin), s.seed as number);
    return { ...s, version: 30, lineage: newLineage(people[0]?.last ?? 'The family') };
  },
  // 28 → 29: wild food (game as it was), fishing gear, snares, smoker
  28: s => ({ ...s, version: 29, wild: newWild(), stock: { fishing_gear: 0, snares: 0, smoker: 0, ...(s.stock as object) } }),
  // 27 → 28: water goods (jugs, totes, the trailer, filter, RO, softener, greywater)
  27: s => ({ ...s, version: 28, stock: { water_jugs: 0, ibc_tote: 0, water_trailer: 0, water_filter: 0, ro_system: 0, softener: 0, greywater: 0, ...(s.stock as object) } }),
  // 26 → 27: personal kit, watching the place, hardening (all goods in the stockpile)
  26: s => ({ ...s, version: 27, stock: { plate_carrier: 0, ifak: 0, nvg: 0, thermal: 0, radios: 0, cameras: 0, thermal_cam: 0, driveway_alarm: 0, floodlights: 0, tripwire: 0, dog: 0, steel_door: 0, window_bars: 0, sandbags: 0, safe_room: 0, ...(s.stock as object) } }),
  // 25 → 26: the armory (old saves: none), the gun safe and cleaning kit
  25: s => ({ ...s, version: 26, armory: newArmory(), stock: { gun_safe: 0, gun_cleaning: 0, ...(s.stock as object) } }),
  // 24 → 25: accounts and metals (old saves: everything in checking)
  24: s => ({ ...s, version: 25, fin: newFin() }),
  // 23 → 24: chronic conditions and medicine on hand, hygiene supplies
  23: s => ({ ...s, version: 24, body: newBody(), stock: { hygiene: 0, ...(s.stock as object) }, people: (s.people as Person[]).map(p => ({ ...p, conditions: p.conditions ?? conditionsFor(p, s.seed as number) })) }),
  // 22 → 23: shelf life and pests (old stores count as new), stabilizer and traps
  22: s => ({ ...s, version: 23, shelf: newShelf(), stock: { stabilizer: 0, traps: 0, ...(s.stock as object) } }),
  // 21 → 22: seasoning firewood, creosote, the plow blade
  21: s => ({ ...s, version: 22, upkeep: newUpkeep(), stock: { plow: 0, ...(s.stock as object) } }),
  // 20 → 21: permits, property tax, insurance (old saves: permits on, insured)
  20: s => ({ ...s, version: 21, paper: newPaper() }),
  // 19 → 20: how the world comes out of it (old runs: all the way back)
  19: s => ({ ...s, version: 20, disaster: { fate: 'full', ceiling: {}, ...(s.disaster as object) } }),
  // 18 → 19: what came with the land (old places: raw land, power and a drive at the road), hookups, deliveries left at the road
  18: s => ({ ...s, version: 19, site: { ...(s.site as object), improvements: CLASSIC_IMPROVEMENTS }, siteJobs: { power: null, drive: null }, roadside: [] }),
  // 17 → 18: hired crews
  17: s => ({ ...s, version: 18, crews: [] }),
  // 16 → 17: the place is a listing (old saves: the 40 with the creek through it)
  16: s => ({ ...s, version: 17, site: CLASSIC, lifestyle: 'fulltime' }),
  // 15 → 16: field seed and canning jars; the rolling year of food grown vs needed
  15: s => ({ ...s, version: 16, stock: { seed: 0, lids: 0, ...(s.stock as object) }, stats: { grownYear: 0, needYear: 0, ...(s.stats as object) } }),
  // 14 → 15: neighbor land
  14: s => ({ ...s, version: 15, land: newLand(s.seed as number, (s.neighbors as Array<{ id: string }>).map(n => n.id)) }),
  // 13 → 14: run stats and the ending
  13: s => ({ ...s, version: 14, stats: emptyStats(), ending: null }),
  // 12 → 13: electronics fried by an EMP
  12: s => ({ ...s, version: 13, utilities: { fried: [], ...(s.utilities as object) } }),
  // 11 → 12: neighbors and the gate
  11: s => ({ ...s, version: 12, neighbors: generateNeighbors(s.seed as number), gate: newGate(s.seed as number) }),
  // 10 → 11: food in the stockpile, each person's needs, yesterday's eating
  10: s => ({ ...s, version: 11, stock: { fresh: 0, frozen: 0, canned: 0, staples: 0, meds: 0, ...(s.stock as object) }, personState: (s.personState as Array<Record<string, unknown>>).map(ps => ({ needs: freshNeeds(), ...ps })), food: { needKcal: 0, ateKcal: 0, producedKcal: 0, spoiledKcal: 0, fromStores: true, kinds: [], daysLeft: 0 } }),
  // 9 → 10: the county grid (old saves stay off it), breakers, who had power, the bill in the report
  9: s => ({ ...s, version: 10, utilities: { ...(s.utilities as object), grid: false, off: [], lit: [], report: { gridKwh: 0, billUsd: 0, shed: [], ...((s.utilities as { report: object }).report) } } }),
  // 8 → 9: the collapse clock (old saves become Free build) and day jobs (off: they've been building full time)
  8: s => ({ ...s, version: 9, disaster: newDisaster(s.seed as number, 'sandbox'), people: (s.people as Person[]).map(p => (p.kid || p.job ? p : { ...p, job: dayJob(p, s.seed as number) })) }),
  // 7 → 8: bunker hardening (lead, Faraday mesh, blast valves, HEPA sets; the retrofit job list)
  7: s => ({ ...s, version: 8, hardenJobs: [], stock: { lead_sheet: 0, faraday_mesh: 0, blast_valve: 0, filter_set: 0, ...(s.stock as object) } }),
};

export class SaveVersionError extends Error {}

/** Upgrade a parsed save to the current version (throws on unknown / newer saves). */
export function migrate(raw: unknown): GameState {
  if (!raw || typeof raw !== 'object') throw new SaveVersionError('Not a save file');
  let s = raw as Raw;
  const v = s.version;
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1) throw new SaveVersionError('Save has no version');
  if (v > SAVE_VERSION) throw new SaveVersionError(`Save is from a newer version (${v} > ${SAVE_VERSION})`);
  while ((s.version as number) < SAVE_VERSION) {
    const up = STEPS[s.version as number];
    if (!up) throw new SaveVersionError(`No migration from version ${s.version}`);
    s = up(s);
  }
  for (const k of ['seed', 'clock', 'money', 'stock', 'orders', 'people', 'personState', 'structures', 'forestry', 'heat', 'perimeter', 'utilities', 'hardenJobs', 'disaster', 'food', 'neighbors', 'gate', 'stats', 'land', 'site', 'lifestyle', 'crews', 'siteJobs', 'roadside', 'paper', 'upkeep', 'shelf', 'body', 'fin', 'armory', 'wild', 'lineage', 'log', 'nextId'] as const) {
    if (!(k in s)) throw new SaveVersionError(`Save is missing "${k}"`);
  }
  return s as unknown as GameState;
}

/** JSON export (pretty, with a header the importer checks). */
export function exportJson(s: GameState): string {
  return JSON.stringify({ game: 'compound-builder', ...s }, null, 1);
}

export function importJson(text: string): GameState {
  const raw = JSON.parse(text) as Raw;
  if (raw.game !== 'compound-builder') throw new SaveVersionError('Not a Compound Builder save');
  delete raw.game;
  return migrate(raw);
}
