/**
 * Tools: the family's hammers, saws, shovels and drills (docs/DECISIONS.md:
 * "there's gotta be a way to work with the tools even degraded once SHTF and
 * there's no more stores"). Pure; mutates only the draft it is handed.
 *
 * The rule is a hybrid. Every kind of work lists the roles it leans on
 * (`toolFor`): a *required* role (cut lumber, drive nails, dig) cannot be done
 * without a tool, while a *soft* role just goes faster with the right one
 * (bare hands run at half pace). A hand tool is the baseline (1×); a power
 * tool is 2–3.5× but needs electricity or fuel; a crude improvised tool is
 * 0.35–0.55×. Tools wear with the hours they are used, go dull (sharpen them)
 * and break when their condition runs out. Nothing is a dead end:
 *
 *   - sharpen   a whetstone or file (or a river rock, a little worse)
 *   - repair    hardware, or parts from a broken tool; each repair leaves it a bit weaker
 *   - improvise a stone axe, a scrap saw, a rock hammer: a few hours' work, always possible
 *   - the family cobbles one up on its own after two days without a required tool
 *   - scavenge  hardware stores and empty farms (sim/scavenge.ts) turn up used tools
 *   - barter    the crossroads market (sim/toolTrade.ts)
 *   - buy       while the stores are open (the shop's Tools tab)
 *
 * Other systems call `toolFor(task)` / `workSpeed(s, task)` / `wearTools(s, task, hours)`.
 */
import { log, prices } from './economy';
import { mulberry32, pick } from './rng';
import { jobTools, type Person, type SkillId } from './family';
import type { StageId } from './blueprints';
import type { GameState } from './state';

// ─────────────────────────────────────────────────────────────────────────
// What a tool is
// ─────────────────────────────────────────────────────────────────────────

/** What a tool does for work: cut lumber, drive nails, drive screws and bolts, dig, fell trees, work the soil, turn a wrench, cut and twist wire. */
export type ToolRole = 'cut' | 'nail' | 'fasten' | 'dig' | 'fell' | 'till' | 'wrench' | 'wire';
export const TOOL_ROLES: readonly ToolRole[] = ['cut', 'nail', 'fasten', 'dig', 'fell', 'till', 'wrench', 'wire'];
export const ROLE_INFO: Record<ToolRole, { name: string; need: string }> = {
  cut: { name: 'Cutting', need: 'a saw' },
  nail: { name: 'Nailing', need: 'a hammer' },
  fasten: { name: 'Screws & bolts', need: 'a screwdriver or drill' },
  dig: { name: 'Digging', need: 'a shovel' },
  fell: { name: 'Felling & splitting', need: 'an axe' },
  till: { name: 'Soil work', need: 'a hoe' },
  wrench: { name: 'Plumbing & machines', need: 'a wrench' },
  wire: { name: 'Wire', need: 'pliers or wire cutters' },
};

export type ToolKind =
  | 'hammer' | 'nail_gun' | 'hand_saw' | 'circular_saw' | 'chainsaw' | 'axe' | 'screwdriver_set' | 'cordless_drill'
  | 'shovel' | 'pick_mattock' | 'hoe' | 'garden_fork' | 'wrench_set' | 'pliers' | 'bolt_cutters' | 'whetstone' | 'file'
  | 'stone_axe' | 'scrap_saw' | 'rock_hammer' | 'scrap_driver' | 'digging_stick' | 'scrap_wrench' | 'bent_pliers';

export type PowerKind = 'hand' | 'electric' | 'fuel';

export interface ToolDef {
  id: ToolKind;
  name: string;
  blurb: string;
  /** Speed (1 = a hand tool) for each role it can do. */
  roles: Partial<Record<ToolRole, number>>;
  power: PowerKind;
  /** Condition lost per hour of use (1 = new, 0 = broken). */
  wear: number;
  /** Sharpness lost per hour (0: it has no edge). */
  dull: number;
  /** Retail price (2025 dollars); null = can't be bought (improvised). */
  price: number | null;
  /** Made on the place from scrap or stone. */
  crude?: boolean;
  /** Keeps the edges (not used for work). */
  honing?: boolean;
}

const HAND = 0.0006, POWER = 0.0012, CRUDE = 0.006;

export const TOOLS: Record<ToolKind, ToolDef> = {
  hammer: { id: 'hammer', name: 'Claw hammer', blurb: '16 oz framing hammer', roles: { nail: 1 }, power: 'hand', wear: HAND, dull: 0, price: 22 },
  nail_gun: { id: 'nail_gun', name: 'Framing nailer', blurb: 'pneumatic nailer and a compressor (needs power)', roles: { nail: 2.4 }, power: 'electric', wear: POWER, dull: 0, price: 260 },
  hand_saw: { id: 'hand_saw', name: 'Hand saw', blurb: 'crosscut and rip saw for boards and sheets', roles: { cut: 1 }, power: 'hand', wear: HAND, dull: 0.003, price: 25 },
  circular_saw: { id: 'circular_saw', name: 'Circular saw', blurb: '7¼ in corded saw (needs power)', roles: { cut: 2.5 }, power: 'electric', wear: POWER, dull: 0.002, price: 120 },
  chainsaw: { id: 'chainsaw', name: 'Chainsaw', blurb: 'gas chainsaw: fells and bucks, rips a board in a pinch (burns fuel)', roles: { fell: 3.5, cut: 2.8 }, power: 'fuel', wear: POWER * 1.4, dull: 0.003, price: 350 },
  axe: { id: 'axe', name: 'Felling axe', blurb: 'a 3 lb axe for felling, limbing and splitting', roles: { fell: 1 }, power: 'hand', wear: HAND, dull: 0.004, price: 40 },
  screwdriver_set: { id: 'screwdriver_set', name: 'Screwdriver set', blurb: 'flat and Phillips drivers, a few nut drivers', roles: { fasten: 1 }, power: 'hand', wear: HAND, dull: 0, price: 25 },
  cordless_drill: { id: 'cordless_drill', name: 'Cordless drill', blurb: '18 V drill/driver, two batteries (needs power to charge)', roles: { fasten: 2.4 }, power: 'electric', wear: POWER, dull: 0, price: 110 },
  shovel: { id: 'shovel', name: 'Round-point shovel', blurb: 'digs, mixes mud, turns a garden bed', roles: { dig: 1, till: 0.8 }, power: 'hand', wear: HAND, dull: 0.0012, price: 30 },
  pick_mattock: { id: 'pick_mattock', name: 'Pick mattock', blurb: 'breaks rocky ground, grubs roots', roles: { dig: 1.2 }, power: 'hand', wear: HAND, dull: 0.0008, price: 45 },
  hoe: { id: 'hoe', name: 'Garden hoe', blurb: 'for weeding and for working a row', roles: { till: 1 }, power: 'hand', wear: HAND, dull: 0.0015, price: 25 },
  garden_fork: { id: 'garden_fork', name: 'Garden fork', blurb: 'loosens and turns the soil, lifts roots', roles: { till: 1.15, dig: 0.7 }, power: 'hand', wear: HAND, dull: 0, price: 38 },
  wrench_set: { id: 'wrench_set', name: 'Wrench set', blurb: 'combination wrenches, a socket set and an adjustable', roles: { wrench: 1, fasten: 0.7 }, power: 'hand', wear: HAND, dull: 0, price: 70 },
  pliers: { id: 'pliers', name: 'Pliers', blurb: 'lineman pliers: twist, cut and pull wire', roles: { wire: 1 }, power: 'hand', wear: HAND, dull: 0, price: 18 },
  bolt_cutters: { id: 'bolt_cutters', name: 'Bolt cutters', blurb: '24 in cutters: fence wire, chain, rebar ties', roles: { wire: 1.3 }, power: 'hand', wear: HAND, dull: 0.0008, price: 45 },
  whetstone: { id: 'whetstone', name: 'Whetstone', blurb: 'a two-sided stone: puts a proper edge back', roles: {}, power: 'hand', wear: 0, dull: 0, price: 12, honing: true },
  file: { id: 'file', name: 'Mill file', blurb: 'for saws, axes and mower blades', roles: {}, power: 'hand', wear: 0, dull: 0, price: 10, honing: true },
  stone_axe: { id: 'stone_axe', name: 'Stone axe', blurb: 'a knapped stone head lashed to a hickory handle: it works', roles: { fell: 0.45 }, power: 'hand', wear: CRUDE, dull: 0.006, price: null, crude: true },
  scrap_saw: { id: 'scrap_saw', name: 'Scrap saw', blurb: 'a toothed strip of sheet steel on a wooden handle', roles: { cut: 0.4 }, power: 'hand', wear: CRUDE, dull: 0.006, price: null, crude: true },
  rock_hammer: { id: 'rock_hammer', name: 'Rock hammer', blurb: 'a fist-sized stone on a stick', roles: { nail: 0.4 }, power: 'hand', wear: CRUDE, dull: 0, price: null, crude: true },
  scrap_driver: { id: 'scrap_driver', name: 'Scrap driver', blurb: 'a ground-down steel strip in a wooden grip', roles: { fasten: 0.4 }, power: 'hand', wear: CRUDE, dull: 0, price: null, crude: true },
  digging_stick: { id: 'digging_stick', name: 'Digging stick', blurb: 'a fire-hardened pole with a flat blade: breaks ground, slowly', roles: { dig: 0.35, till: 0.55 }, power: 'hand', wear: CRUDE, dull: 0, price: null, crude: true },
  scrap_wrench: { id: 'scrap_wrench', name: 'Scrap wrench', blurb: 'a bent length of flat bar with a notch cut for the nut', roles: { wrench: 0.4, fasten: 0.3 }, power: 'hand', wear: CRUDE, dull: 0, price: null, crude: true },
  bent_pliers: { id: 'bent_pliers', name: 'Bent pliers', blurb: 'two pieces of strap iron riveted into tongs', roles: { wire: 0.4 }, power: 'hand', wear: CRUDE, dull: 0, price: null, crude: true },
};
export const TOOL_KINDS = Object.keys(TOOLS) as ToolKind[];
/** What the shop sells. */
export const SHOP_TOOLS = TOOL_KINDS.filter(k => TOOLS[k].price !== null);
/** The crude tool the family makes for each role. */
export const CRUDE_FOR: Record<ToolRole, ToolKind> = {
  cut: 'scrap_saw', nail: 'rock_hammer', fasten: 'scrap_driver', dig: 'digging_stick', fell: 'stone_axe', till: 'digging_stick', wrench: 'scrap_wrench', wire: 'bent_pliers',
};

/** Quality grades: a cheap tool is what the farm store sells; a pro tool costs 2.5x and lasts twice as long. */
export type Grade = 'cheap' | 'pro';
export const GRADES: Record<Grade, { name: string; price: number; wear: number }> = {
  cheap: { name: 'cheap', price: 1, wear: 1 },
  pro: { name: 'pro', price: 2.5, wear: 0.5 },
};
export const gradeOf = (t: Tool): Grade => t.grade ?? 'cheap';

/** One tool the family owns. */
export interface Tool {
  id: string;
  kind: ToolKind;
  /** 1 = new … 0 = broken. */
  cond: number;
  /** 1 = razor … 0 = dull as a spoon (only tools with an edge lose it). */
  sharp: number;
  /** The best condition it can be brought back to (each repair and each sharpening takes a little). */
  max: number;
  repairs: number;
  /** Absent = cheap. */
  grade?: Grade;
}

export interface ToolKit {
  items: Tool[];
  next: number;
  /** Roles with no usable tool: the day it was noticed. */
  missing: Partial<Record<ToolRole, number>>;
  /** The family sharpens dull blades on its own (a daily chore). */
  care: boolean;
  /** Tallies. */
  made: number;
  broke: number;
  /** Person-hours of tool work so far. */
  hours: number;
  /** Hours of the family's work already spent on tool upkeep (sharpening) that the next work pays out of. */
  owed?: number;
}

export const newKit = (): ToolKit => ({ items: [], next: 1, missing: {}, care: true, made: 0, broke: 0, hours: 0 });

// ─────────────────────────────────────────────────────────────────────────
// Work: what each task needs
// ─────────────────────────────────────────────────────────────────────────

/** A role a task leans on: its share of the work's time, and whether it can't be done without. */
export interface Need { role: ToolRole; share: number; req: boolean }

/** A kind of work, for `toolFor`. Systems that do other work (the daily roster) add their own kind here. */
export type ToolTask =
  | { kind: 'build'; stage: StageId }
  | { kind: 'fell'; stage: 'marked' | 'felled' | 'bucked' }
  | { kind: 'fence'; run: string }
  | { kind: 'garden' } | { kind: 'firewood' } | { kind: 'plumb' } | { kind: 'wire' } | { kind: 'repair' };

const n = (role: ToolRole, share: number, req = false): Need => ({ role, share, req });

const STAGE_NEEDS: Record<StageId, Need[]> = {
  site: [n('dig', 1, true)],
  foundation: [n('dig', 0.7, true), n('nail', 0.3)],
  frame: [n('cut', 0.35, true), n('nail', 0.45, true), n('fasten', 0.2)],
  roof: [n('cut', 0.2, true), n('nail', 0.3), n('fasten', 0.5)],
  finish: [n('fasten', 0.4), n('nail', 0.3), n('cut', 0.3)],
};

/** Walls and the like by the kind of run. */
function fenceNeeds(kind: string): Need[] {
  if (kind === 'earth_berm' || kind === 'ditch' || kind === 'escape_tunnel') return [n('dig', 1, true)];
  if (kind === 'water_pipe') return [n('dig', 0.7, true), n('wrench', 0.3, true)];
  if (kind === 'power_cable') return [n('dig', 0.7, true), n('wire', 0.3)];
  if (kind === 'thorn_hedge') return [n('till', 0.7), n('dig', 0.3)];
  if (kind === 'log_palisade') return [n('dig', 0.45, true), n('cut', 0.25, true), n('fasten', 0.3)];
  if (kind === 'split_rail') return [n('dig', 0.5, true), n('cut', 0.25), n('nail', 0.25)];
  if (kind === 'barbed_wire' || kind === 'woven_wire' || kind === 'chain_link') return [n('dig', 0.35, true), n('wire', 0.45, true), n('nail', 0.2)];
  return [n('dig', 0.5, true), n('wrench', 0.3), n('fasten', 0.2)];
}

/**
 * The roles a kind of work leans on, with each one's share of the time. Shares sum to 1
 * (or the list is empty: no tool matters). `req`: it can't be done at all without one.
 * The daily roster calls this for its own tasks ('garden', 'firewood', 'plumb', 'wire', 'repair').
 */
export function toolFor(task: ToolTask): Need[] {
  switch (task.kind) {
    case 'build': return STAGE_NEEDS[task.stage];
    case 'fell': return task.stage === 'marked' ? [n('fell', 1, true)] : task.stage === 'felled' ? [n('fell', 0.45, true), n('cut', 0.55)] : [];
    case 'fence': return fenceNeeds(task.run);
    case 'garden': return [n('till', 0.7), n('dig', 0.3)];
    case 'firewood': return [n('fell', 1)];
    case 'plumb': return [n('wrench', 0.7, true), n('fasten', 0.3)];
    case 'wire': return [n('wire', 0.5, true), n('fasten', 0.5)];
    case 'repair': return [n('wrench', 0.4), n('fasten', 0.4), n('nail', 0.2)];
  }
}

/** Speed of a person with nothing in hand on a soft role. */
export const BARE_HANDS = 0.5;

/** Fuel (cans of 20 L) a chainsaw burns per hour of use. */
export const FUEL_PER_HOUR = 0.04;

/** Whether the electric and gas tools can run right now. */
export interface WorkCtx { power: boolean; fuel: number }
export function ctxOf(s: GameState): WorkCtx {
  return { power: s.utilities.lit.length > 0 || (s.utilities.grid && s.disaster.tracks.grid > 0.5), fuel: s.stock.fuel };
}

/** A tool's efficiency in a role: its speed, dulled by the edge and the wear. 0: can't be used now. */
export function efficiency(t: Tool, role: ToolRole, ctx: WorkCtx): number {
  const d = TOOLS[t.kind], base = d.roles[role] ?? 0;
  if (base <= 0 || t.cond <= 0) return 0;
  if (d.power === 'electric' && !ctx.power) return 0;
  if (d.power === 'fuel' && ctx.fuel < FUEL_PER_HOUR) return 0;
  // a decently kept tool (edge ≥ 60 %, condition ≥ 50 %) works at full speed; past that it slows to half (a dull edge) and 60 % (worn)
  const edge = d.dull > 0 ? 0.5 + 0.5 * Math.min(1, t.sharp / 0.6) : 1;
  return base * edge * (0.6 + 0.4 * Math.min(1, t.cond / 0.5));
}

/** The tool the family would pick up for a role (the fastest right now), or null. */
export function bestTool(kit: ToolKit, role: ToolRole, ctx: WorkCtx): { tool: Tool; rate: number } | null {
  let best: { tool: Tool; rate: number } | null = null;
  for (const t of kit.items) {
    const rate = efficiency(t, role, ctx);
    if (rate > 0 && (!best || rate > best.rate)) best = { tool: t, rate };
  }
  return best;
}

/** The lowest a crowded tool role runs, relative to the best tool (extra hands with too few tools still do something). */
export const CROWD_FLOOR = 0.3;

/**
 * The toolbox is shared: when more people work a role than there are tools of that role, the tools are handed
 * round and each worker runs slower (3 people framing with 1 saw: a third each). The best tools go first, so
 * a power saw and a hand saw serve two framers at the average of the two.
 */
export function crowdRate(kit: ToolKit, role: ToolRole, ctx: WorkCtx, workers: number, best: number): number {
  if (workers <= 1) return best;
  const rates: number[] = [];
  for (const t of kit.items) { const r = efficiency(t, role, ctx); if (r > 0) rates.push(r); }
  rates.sort((a, b) => b - a);
  const sum = rates.slice(0, workers).reduce((a, x) => a + x, 0);
  return Math.max(CROWD_FLOOR * best, sum / workers);
}

export interface Pick { need: Need; tool: Tool | null; rate: number }
export interface Speed {
  /** Work done per hour worked, relative to one person with a hand tool in good shape (0 = blocked). */
  mult: number;
  /** The required role that has no tool (blocked). */
  blocked: ToolRole | null;
  picks: Pick[];
}

/** How fast work goes with this kit: harmonic over the roles, weighted by their share of the time. */
export function taskSpeed(kit: ToolKit, needs: readonly Need[], ctx: WorkCtx, workers = 1): Speed {
  const picks: Pick[] = [];
  let inv = 0, blocked: ToolRole | null = null;
  for (const need of needs) {
    const b = bestTool(kit, need.role, ctx);
    const rate = b ? crowdRate(kit, need.role, ctx, workers, b.rate) : need.req ? 0 : BARE_HANDS;
    picks.push({ need, tool: b?.tool ?? null, rate });
    if (rate <= 0) blocked ??= need.role; else inv += need.share / rate;
  }
  if (blocked) return { mult: 0, blocked, picks };
  return { mult: inv > 0 ? 1 / inv : 1, blocked: null, picks };
}

// ─────────────────────────────────────────────────────────────────────────
// The kit in the state
// ─────────────────────────────────────────────────────────────────────────

/** The kit for reading (an old save without one gets the starter kit; nothing is stored). */
export function readKit(s: GameState): ToolKit {
  return s.tools ?? starterKit(s.people, s.seed);
}
/** The kit for changing (made on first use). */
export function kitOf(s: GameState): ToolKit {
  return (s.tools ??= starterKit(s.people, s.seed));
}

/** Put a used tool in the kit (barter, gifts). */
export function addTool(s: GameState, kind: ToolKind, cond: number, sharp: number, grade: Grade = 'cheap'): Tool {
  return add(kitOf(s), kind, cond, sharp, grade);
}

function add(kit: ToolKit, kind: ToolKind, cond = 1, sharp = 1, grade: Grade = 'cheap'): Tool {
  const t: Tool = { id: `t${kit.next++}`, kind, cond, sharp: TOOLS[kind].dull > 0 ? sharp : 1, max: 1, repairs: 0, ...(grade === 'pro' && !TOOLS[kind].crude ? { grade } : {}) };
  kit.items.push(t);
  return t;
}

/**
 * What the family brings: a basic set everyone owns, and more by trade (a carpenter has power tools and a
 * second hammer, a mechanic wrenches and a file, a gardener a fork, a hunter or a woodsman a chainsaw, a
 * grandparent a shed of old tools). Second-hand condition, seeded.
 */
export function starterKit(people: readonly Person[], seed: number): ToolKit {
  const r = mulberry32(seed * 313 + 7);
  const kit = newKit();
  const worn = (lo = 0.72) => lo + (1 - lo) * r();
  const keen = () => 0.6 + 0.4 * r();
  // some of it is good gear (pro grade): more of a trade's own tools
  const give = (k: ToolKind, lo?: number, pro = 0.2) => add(kit, k, worn(lo), keen(), r() < pro ? 'pro' : 'cheap');
  const adults = people.filter(p => !p.kid);
  const top = (sk: SkillId) => Math.max(0, ...adults.map(p => p.skills[sk]));
  const job = (re: RegExp) => adults.some(p => p.job && re.test(p.job.title));
  // the toolbox is shared, so a family with more working hands owns more of the plain ones (a hammer, saw, driver and shovel each)
  const hands = Math.max(1, Math.min(5, people.filter(p => !(p.elder && p.age >= 75)).length));
  for (const k of ['hammer', 'hand_saw', 'screwdriver_set', 'shovel'] as ToolKind[]) for (let i = 0; i < hands; i++) give(k, undefined, top('builder') >= 5 ? 0.35 : 0.15);
  for (const k of ['axe', 'wrench_set', 'pliers', 'hoe'] as ToolKind[]) for (let i = 0; i < hands; i++) give(k);
  give('whetstone');
  if (top('builder') >= 5 || job(/carpenter/i)) { give('circular_saw', undefined, 0.5); give('cordless_drill', undefined, 0.5); give('hammer', undefined, 0.5); }
  if (top('builder') >= 8 || (job(/carpenter/i) && top('builder') >= 6)) give('nail_gun', undefined, 0.5);
  if (top('builder') >= 6 || top('hunter') >= 6) give('chainsaw', undefined, 0.4);
  if (top('mechanic') >= 5 || job(/mechanic/i)) { give('file', undefined, 0.5); give('bolt_cutters', undefined, 0.5); if (!kit.items.some(t => t.kind === 'cordless_drill')) give('cordless_drill'); give('wrench_set', undefined, 0.5); }
  if (top('gardener') >= 5 || job(/nursery/i)) { give('garden_fork', undefined, 0.4); give('hoe', undefined, 0.4); }
  if (top('hunter') >= 5 || job(/warden/i)) give('axe', undefined, 0.4);
  // the trades' own gear (a welder's file and bolt cutters, an electrician's drill), pro grade about half the time
  { const have = new Set(kit.items.map(t => t.kind));
    for (const p of adults) for (const k of JOB_KITS[(p.job as { id?: string } | undefined)?.id ?? ''] ?? []) {
      const base = jobTools((p.job as { id?: string } | undefined)?.id).length > 0;
      if (base && !have.has(k)) { give(k, undefined, 0.5); have.add(k); }
    } }
  if (people.some(p => p.elder)) { give('pick_mattock', 0.5, 0.3); give('hand_saw', 0.5, 0.3); give('file', 0.5, 0.3); }
  return kit;
}

/**
 * What each trade brings (family.ts `jobTools` names the trade's own gear; these are the items of the toolbox
 * it maps to). Only the tools that do work: a stethoscope or a laptop is not in the toolbox.
 */
export const JOB_KITS: Record<string, ToolKind[]> = {
  carpenter: ['circular_saw', 'cordless_drill', 'nail_gun', 'hammer'],
  electrician: ['cordless_drill', 'pliers', 'screwdriver_set'],
  plumber: ['wrench_set', 'pliers'],
  farmer: ['hoe', 'garden_fork', 'chainsaw', 'bolt_cutters'],
  diesel: ['wrench_set', 'file', 'bolt_cutters', 'cordless_drill'],
  welder: ['file', 'bolt_cutters', 'wrench_set'],
  forester: ['chainsaw', 'axe', 'pick_mattock'],
  hvac: ['cordless_drill', 'pliers', 'wrench_set'],
  nursery: ['garden_fork', 'hoe'],
  warden: ['axe'],
  soldier: ['shovel'],
  trucker: ['wrench_set'],
  butcher: ['file'],
};

/** A word for a condition. */
export function condWord(t: Tool): string {
  if (t.cond <= 0) return 'broken';
  if (t.cond < 0.25) return 'nearly done';
  if (t.cond < 0.5) return 'worn';
  if (t.cond < 0.8) return 'used';
  return t.cond > 0.95 && t.repairs === 0 ? 'like new' : 'good';
}
export const isDull = (t: Tool) => TOOLS[t.kind].dull > 0 && t.sharp < 0.45 && t.cond > 0;

// ─────────────────────────────────────────────────────────────────────────
// Using tools
// ─────────────────────────────────────────────────────────────────────────

/** How fast a task goes right now for the family (0 = blocked). */
export function workSpeed(s: GameState, task: ToolTask): number {
  return taskSpeed(readKit(s), toolFor(task), ctxOf(s), workersOn(s, task)).mult;
}

/** How many people are at work on this kind of task right now (they share the toolbox). */
export function workersOn(s: GameState, task: ToolTask): number {
  const doing = task.kind === 'fell' ? 'forestry' : task.kind === 'build' || task.kind === 'fence' ? 'build' : null;
  if (!doing) return 1;
  let n = 0;
  for (const ps of s.personState) if (ps.task === doing && ps.needs.died == null) n++;
  return Math.max(1, n);
}

/** Pay the day's tool upkeep (sharpening) out of the hours about to be worked. Returns the hours left for the work. */
export function payUpkeep(s: GameState, hours: number): number {
  const kit = s.tools;
  if (!kit || !(kit.owed && kit.owed > 0)) return hours;
  const t = Math.min(kit.owed, hours);
  kit.owed -= t;
  return hours - t;
}

/** Why a task can't be done now ("Needs a saw"), or null. */
export function toolHold(s: GameState, task: ToolTask): string | null {
  const kit = readKit(s), sp = taskSpeed(kit, toolFor(task), ctxOf(s));
  if (!sp.blocked) return null;
  const since = kit.missing[sp.blocked];
  const day = Math.floor(s.clock.t);
  const wait = since === undefined ? MAKE_DO_DAYS : Math.max(0, since + MAKE_DO_DAYS - day);
  return `Needs ${ROLE_INFO[sp.blocked].need}${wait > 0 ? `: buy, find or make one (the family makes do in ${wait} day${wait === 1 ? '' : 's'})` : ''}`;
}

/** The hint for a task that can go on: "a circular saw will do it 2.5× faster", or null when the kit is fine. */
export function toolNote(s: GameState, task: ToolTask): string | null {
  const needs = toolFor(task);
  if (!needs.length) return null;
  const kit = readKit(s), ctx = ctxOf(s), sp = taskSpeed(kit, needs, ctx);
  if (sp.blocked) return toolHold(s, task);
  const bare = sp.picks.filter(p => !p.tool);
  if (bare.length) return `No ${ROLE_INFO[bare[0].need.role].need.replace(/^an? /, '')}: by hand, slowly`;
  const crude = sp.picks.find(p => p.tool && TOOLS[p.tool.kind].crude);
  if (crude) return `Making do with a ${TOOLS[crude.tool!.kind].name.toLowerCase()}`;
  return null;
}

/** The text on a project for the tools it will want ("saw, hammer, shovel"), required ones marked. */
export function projectNeeds(stages: readonly StageId[]): Need[] {
  const out = new Map<ToolRole, Need>();
  for (const st of stages) for (const nd of STAGE_NEEDS[st]) { const o = out.get(nd.role); out.set(nd.role, { role: nd.role, share: (o?.share ?? 0) + nd.share, req: nd.req || !!o?.req }); }
  return [...out.values()].sort((a, b) => Number(b.req) - Number(a.req) || b.share - a.share);
}

/**
 * Wear the tools used for `hours` of work on a task (the work done, before the tool speed-up).
 * Returns the names of tools that broke. Call after the work, with the same task.
 */
export function wearTools(s: GameState, task: ToolTask, hours: number): string[] {
  if (hours <= 0) return [];
  const kit = kitOf(s), ctx = ctxOf(s), sp = taskSpeed(kit, toolFor(task), ctx);
  const broke: string[] = [];
  kit.hours += hours;
  for (const p of sp.picks) {
    const t = p.tool;
    if (!t) continue;
    const d = TOOLS[t.kind], h = hours * p.need.share;
    t.cond = Math.max(0, t.cond - d.wear * GRADES[gradeOf(t)].wear * h * (1 + 0.5 * (1 - t.sharp)));
    if (d.dull > 0) t.sharp = Math.max(0, t.sharp - d.dull * h);
    if (d.power === 'fuel') s.stock.fuel = Math.max(0, s.stock.fuel - FUEL_PER_HOUR * h);
    if (t.cond <= 0) { kit.broke++; broke.push(d.name); log(s, `The ${d.name.toLowerCase()} gives out${d.crude ? '' : ' (the handle splits, the teeth are gone)'}. It might be mended.`); }
  }
  return broke;
}

// ─────────────────────────────────────────────────────────────────────────
// Keeping tools going: sharpen, repair, improvise
// ─────────────────────────────────────────────────────────────────────────

const toolById = (kit: ToolKit, id: string) => kit.items.find(t => t.id === id);

/** What the family hones with: a whetstone or file in good shape, else a river rock. */
export const honer = (kit: ToolKit): Tool | null => kit.items.find(t => TOOLS[t.kind].honing && t.cond > 0) ?? null;

/** Sharpen one tool (null = done). A whetstone or file takes it to razor; a rock, to 80 %. Each honing grinds the metal a little. */
export function sharpen(s: GameState, id: string): string | null {
  const kit = kitOf(s), t = toolById(kit, id);
  if (!t) return 'No such tool.';
  if (TOOLS[t.kind].dull <= 0) return `A ${TOOLS[t.kind].name.toLowerCase()} has no edge to sharpen.`;
  if (t.cond <= 0) return 'It is broken: mend it first.';
  const top = honer(kit) ? 1 : 0.8;
  if (t.sharp >= top - 0.02) return 'It is as sharp as it will get.';
  t.sharp = top;
  t.max = Math.max(0.35, t.max - 0.004);
  t.cond = Math.min(t.cond, t.max);
  return null;
}

/** Sharpen every dull blade. Returns how many. */
export function sharpenAll(s: GameState, below = 0.75): number {
  const kit = kitOf(s);
  let c = 0;
  for (const t of kit.items) if (TOOLS[t.kind].dull > 0 && t.cond > 0 && t.sharp < below && sharpen(s, t.id) === null) c++;
  return c;
}

/** Hardware (a kit's fraction) a repair uses. */
export const REPAIR_HARDWARE = 0.15;
/** What each repair costs the tool's best condition. */
export const REPAIR_TOLL = 0.12;

/** What a repair would use and give: parts from a broken tool, or hardware. */
export function repairPlan(s: GameState, id: string): { ok: boolean; why: string | null; uses: string; to: number } {
  const kit = readKit(s), t = toolById(kit, id);
  if (!t) return { ok: false, why: 'No such tool.', uses: '', to: 0 };
  const skill = Math.max(0, ...s.people.filter(p => !p.kid).map(p => p.skills.mechanic));
  const to = Math.max(0.2, Math.min(t.max - REPAIR_TOLL, 0.5 + 0.04 * skill));
  if (t.cond >= t.max - REPAIR_TOLL - 0.02 && t.cond > 0) return { ok: false, why: 'It is as good as a repair would make it.', uses: '', to };
  if (s.stock.hardware >= REPAIR_HARDWARE) return { ok: true, why: null, uses: 'some hardware', to };
  if (kit.items.some(x => x.id !== id && x.cond <= 0)) return { ok: true, why: null, uses: 'parts from a broken tool', to };
  return { ok: false, why: 'Needs a little hardware (nails, rivets, a bolt) or a broken tool to take parts from.', uses: '', to };
}

/** Mend a tool: new handle, rivets, a bit of weld. It comes back weaker each time. */
export function repair(s: GameState, id: string): string | null {
  const plan = repairPlan(s, id);
  if (!plan.ok) return plan.why;
  const kit = kitOf(s), t = toolById(kit, id)!;
  if (s.stock.hardware >= REPAIR_HARDWARE) s.stock.hardware -= REPAIR_HARDWARE;
  else {
    const donor = kit.items.find(x => x.id !== id && x.cond <= 0);
    if (donor) kit.items.splice(kit.items.indexOf(donor), 1);
  }
  t.max = Math.max(0.35, t.max - REPAIR_TOLL);
  t.cond = Math.min(t.max, Math.max(t.cond, plan.to));
  t.repairs++;
  log(s, `Mended the ${TOOLS[t.kind].name.toLowerCase()} (${condWord(t)}).`);
  return null;
}

/** Scrap steel (hardware) a crude metal tool takes to make well. */
const CRUDE_STEEL: ToolKind[] = ['scrap_saw', 'scrap_driver', 'scrap_wrench', 'bent_pliers'];

/** Person-hours it takes to make a crude tool. */
export const IMPROVISE_HOURS = 4;

/** Make a crude tool for a role from stone, wood and scrap: always possible. With a little hardware it comes out better. Returns the tool made. */
export function improvise(s: GameState, role: ToolRole): Tool {
  const kit = kitOf(s), kind = CRUDE_FOR[role];
  let cond = 0.65;
  if (CRUDE_STEEL.includes(kind) && s.stock.hardware >= 0.05) { s.stock.hardware -= 0.05; cond = 0.9; }
  const t = add(kit, kind, cond, 0.8);
  kit.made++;
  delete kit.missing[role];
  log(s, `Made a ${TOOLS[kind].name.toLowerCase()}: ${TOOLS[kind].blurb}.`);
  return t;
}

/** Days without a required tool before the family makes one itself. */
export const MAKE_DO_DAYS = 2;
/** Roles that can't be done without a tool somewhere. */
const HARD_ROLES: ToolRole[] = ['cut', 'nail', 'dig', 'fell', 'wrench', 'wire'];

/** Once a day: the chore of sharpening, and making do when a required tool is gone. Returns log lines. */
export function toolsDay(s: GameState): string[] {
  const kit = kitOf(s), out: string[] = [], day = Math.floor(s.clock.t);
  if (kit.care) {
    // the chore of sharpening takes a little of the family's work time (a stone is quicker than a river rock)
    const n = sharpenAll(s, 0.5);
    if (n > 0) kit.owed = (kit.owed ?? 0) + n * (honer(kit) ? 0.2 : 0.4);
  }
  const ctx = ctxOf(s);
  for (const role of HARD_ROLES) {
    // judged without the power/fuel check: a saw that needs a plug is still a saw (the work waits for the power)
    const have = kit.items.some(t => t.cond > 0 && (TOOLS[t.kind].roles[role] ?? 0) > 0 && (TOOLS[t.kind].power === 'hand' || efficiency(t, role, ctx) > 0));
    if (have) { delete kit.missing[role]; continue; }
    kit.missing[role] ??= day;
    if (day - kit.missing[role]! >= MAKE_DO_DAYS) {
      const t = improvise(s, role);
      out.push(`With no ${ROLE_INFO[role].need.replace(/^an? /, '')} left, the family made do with a ${TOOLS[t.kind].name.toLowerCase()}.`);
    }
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────
// Getting tools: the shop, the scrap heap, the empty farm
// ─────────────────────────────────────────────────────────────────────────

/** Is anyone selling? The stores have to be open. */
export const toolShopOpen = (s: GameState) => s.disaster.tracks.stores > 0.5;

/** Price of a new tool today (null: not for sale). */
export const toolPrice = (s: GameState, kind: ToolKind, grade: Grade = 'cheap'): number | null => {
  const p = TOOLS[kind].price;
  return p === null ? null : Math.round(p * GRADES[grade].price * prices(s));
};

/** Buy a new tool at the hardware store (cash from the safe once the banks are shut). Returns why not, or null. */
export function buyTool(s: GameState, kind: ToolKind, grade: Grade = 'cheap'): string | null {
  const price = toolPrice(s, kind, grade);
  if (price === null) return 'That is not sold.';
  if (!toolShopOpen(s)) return 'The stores are closed.';
  const bank = s.disaster.tracks.banks > 0.25;
  if ((bank ? s.money : s.fin.cash) < price) return 'Not enough money.';
  if (bank) s.money -= price; else s.fin.cash -= price;
  add(kitOf(s), kind, 1, 1, grade);
  log(s, `Bought a ${grade === 'pro' ? 'pro-grade ' : ''}${TOOLS[kind].name.toLowerCase()} — $${price.toLocaleString('en-US')}.`);
  return null;
}

/** What a hardware store, a farm shed or a garage turns up, by weight. */
const FINDS: Array<[ToolKind, number]> = [
  ['hammer', 6], ['hand_saw', 6], ['shovel', 6], ['axe', 5], ['hoe', 4], ['pliers', 5], ['screwdriver_set', 5], ['wrench_set', 4], ['garden_fork', 3], ['pick_mattock', 3],
  ['bolt_cutters', 2], ['file', 3], ['whetstone', 3], ['circular_saw', 2], ['cordless_drill', 2], ['chainsaw', 1.5], ['nail_gun', 0.7],
];

/** A used tool from the shelves or the shed: seeded by the caller's random stream. */
export function findTool(s: GameState, r: () => number): Tool {
  const total = FINDS.reduce((a, [, w]) => a + w, 0);
  let x = r() * total, kind = FINDS[0][0];
  for (const [k, w] of FINDS) { x -= w; if (x <= 0) { kind = k; break; } }
  const t = add(kitOf(s), kind, 0.4 + 0.5 * r(), 0.3 + 0.5 * r(), r() < 0.3 ? 'pro' : 'cheap');
  return t;
}

/** What a used tool is worth in 2025 dollars (barter). */
export const usedValue = (kind: ToolKind, cond = 0.7) => Math.round((TOOLS[kind].price ?? 20) * (0.35 + 0.5 * cond));

/** Pick one of the tools at random (a helper for callers with a seeded stream). */
export const randomKind = (r: () => number): ToolKind => pick(r, SHOP_TOOLS);

// ─────────────────────────────────────────────────────────────────────────
// For the screens
// ─────────────────────────────────────────────────────────────────────────

export interface RoleLine { role: ToolRole; tool: Tool | null; rate: number; waiting: boolean }
/** Per role: the tool the family would reach for, its speed, and whether a power/fuel tool is waiting on power or gas. */
export function coverage(s: GameState): RoleLine[] {
  const kit = readKit(s), ctx = ctxOf(s);
  return TOOL_ROLES.map(role => {
    const b = bestTool(kit, role, ctx);
    if (b) return { role, tool: b.tool, rate: b.rate, waiting: false };
    const waiting = kit.items.some(t => t.cond > 0 && (TOOLS[t.kind].roles[role] ?? 0) > 0);
    return { role, tool: null, rate: 0, waiting };
  });
}

/** Counts for the header: tools, worn, broken, dull. */
export function kitCounts(kit: ToolKit): { total: number; worn: number; broken: number; dull: number } {
  let worn = 0, broken = 0, dull = 0;
  for (const t of kit.items) { if (t.cond <= 0) broken++; else if (t.cond < 0.35) worn++; if (isDull(t)) dull++; }
  return { total: kit.items.length, worn, broken, dull };
}

/** What a tool is for, in a line ("saw ×2.5 · needs power"). */
export function toolUse(k: ToolKind): string {
  const d = TOOLS[k];
  const roles = (Object.entries(d.roles) as Array<[ToolRole, number]>).map(([r, v]) => `${ROLE_INFO[r].name.toLowerCase()} ×${v}`).join(', ');
  return [roles || 'sharpens blades', d.power === 'electric' ? 'needs power' : d.power === 'fuel' ? 'burns fuel' : ''].filter(Boolean).join(' · ');
}


/** Plain tools a stall, a trader or a neighbor will have. */
export const SWAP_KINDS: ToolKind[] = ['hammer', 'hand_saw', 'shovel', 'axe', 'hoe', 'pliers', 'screwdriver_set', 'wrench_set', 'whetstone', 'file', 'garden_fork', 'pick_mattock', 'bolt_cutters'];

// ─────────────────────────────────────────────────────────────────────────
// Theft
// ─────────────────────────────────────────────────────────────────────────

/**
 * How much of a theft gets through to the tools (1 = all of it open): a locked workshop or metal garage keeps
 * them behind a door, a gun-safe-like locker holds the small ones, and the bunker's stores room has its own hatch.
 */
export function toolSecurity(s: GameState): number {
  const done = (k: string) => s.structures.some(st => st.kind === k && st.finishedAt !== null);
  let open = 1;
  if (done('workshop')) open *= 0.5;
  if (done('metal_garage') || done('garage_solar')) open *= 0.65;
  if (done('bunker_stores')) open *= 0.5;
  if ((s.stock.gun_safe ?? 0) > 0) open *= 0.75;
  return open;
}

/**
 * Thieves take tools (a burglary, a crew that goes through the place). `salt` varies the dice. `p` is the chance each good tool is
 * grabbed before security; dearer tools go first. Returns a log line and the replacement value (2025 dollars).
 */
export function stealTools(s: GameState, p: number, salt = 0): { lines: string[]; value: number } {
  const kit = s.tools;
  if (!kit) return { lines: [], value: 0 };
  // its own random stream, so the raid or burglary that calls it plays out the same as before
  const r = mulberry32(s.seed * 7919 + Math.floor(s.clock.t * 96) * 31 + salt);
  const open = toolSecurity(s), taken: Tool[] = [];
  for (const t of [...kit.items]) {
    const d = TOOLS[t.kind];
    if (d.crude || t.cond <= 0 || taken.length >= 5) continue;
    if (r() < Math.min(0.9, p * open * (0.5 + (d.price ?? 0) / 150))) taken.push(t);
  }
  kit.items = kit.items.filter(t => !taken.includes(t));
  const value = taken.reduce((a, t) => a + (TOOLS[t.kind].price ?? 0) * GRADES[gradeOf(t)].price, 0);
  return { lines: taken.length ? [`Tools taken: ${taken.map(t => `the ${TOOLS[t.kind].name.toLowerCase()}`).join(', ')}.`] : [], value };
}
