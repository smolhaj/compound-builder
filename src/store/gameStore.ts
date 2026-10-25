import { planProblem } from '../sim/construction';
import { AFTERMATH_TEXT, joinPrisoner, releasePrisoner, resolveAftermath, type AftermathChoice } from '../sim/aftermath';
import { dismissCrew, hireCrew } from '../sim/crews';
import { orderHookup, placeImprovements } from '../sim/improvements';
import { applyForPermit } from '../sim/paperwork';
import { sweepChimney } from '../sim/upkeep';
import { stockUpRx } from '../sim/body';
import { askRansom, giveUp, startRescue, startTrip } from '../sim/rescue';
import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { newGame, SECONDS_PER_DAY, dayIndex, type GameState, type OrderLine, type Speed } from '../sim/state';
import { step } from '../sim/engine';
import { placeOrder } from '../sim/economy';
import { planStructure } from '../sim/construction';
import { markTree, unmarkTree, isMarked, type TreeRef } from '../sim/forestry';
import { planRun, type Gate, type PerimeterKind, type Pt } from '../sim/perimeter';
import { fitProblem, orderFit, plant, repairPump, replaceFried } from '../sim/utilities';

/** Reconnection fee to get back on the grid after leaving it. */
const GRID_RECONNECT = 250;
import { triggerDisaster, type DisasterKind } from '../sim/disaster';
import { resolve, type Stance } from '../sim/encounters';
import { buyLand, type LandKind } from '../sim/land';
import { log } from '../sim/economy';
import { opsecOf } from '../sim/opsec';
import { hardenProblem, orderHarden, orderHardenAll, tierOf, type HardenId } from '../sim/hardening';
import { saveGame, AUTOSAVE } from '../sim/save/saveSystem';

/** Game state (the simulation) + transient UI state for the build tool. */
export interface GameStore {
  game: GameState;
  /** Build tool: the kit piece being placed, 'fell' for marking trees (null = no tool). */
  tool: string | null;
  /** Placement feedback for the HUD (null = valid or no tool). */
  toolProblem: string | null;
  /** Selected structure (construction panel). */
  selected: string | null;
  /** Advance by real seconds at the current speed; autosaves when a new day starts. */
  tick: (realDt: number) => void;
  setSpeed: (s: Speed) => void;
  /** Jump ahead by game days (debug / QA). */
  advance: (days: number) => void;
  order: (lines: OrderLine[]) => boolean;
  plan: (kind: string, x: number, z: number, rot: number) => void;
  load: (g: GameState) => void;
  /** Lay out a fence / hedge / wall run for the family to build. */
  planRun: (kind: PerimeterKind, pts: Pt[], gates: Gate[], offLen?: number) => void;
  /** Plumb or wire a building (a fitting job for the family). */
  fit: (buildingId: string, kind: 'plumb' | 'wire') => string | null;
  /** Order the next tier of a hardening upgrade for one bunker room, or (all) for every room of the bunker up to that tier. */
  harden: (buildingId: string, upgrade: HardenId, all?: boolean) => string | null;
  repairPump: (id: string) => boolean;
  /** Hire a crew for a building, or send one home. */
  hire: (buildingId: string) => string | null;
  dismiss: (crewId: string) => void;
  /** Mark a tree to fell, or unmark it if it is marked and not yet cut. */
  toggleMark: (t: TreeRef, haulDist: number) => void;
  setTool: (kind: string | null) => void;
  setToolProblem: (t: string | null) => void;
  select: (id: string | null) => void;
  /** Answer whoever is at the gate. */
  answer: (stance: Stance) => void;
  dismissCard: () => void;
  decideAftermath: (choice: AftermathChoice) => void;
  releasePrisoner: (id: string) => void;
  joinPrisoner: (id: string) => void;
  /** The taken (sim/rescue.ts): send armed adults to the camp, send word you'll pay, stop looking. Return why not, or null. */
  rescue: (pid: string, team: string[], allies?: boolean) => string | null;
  /** A long trip by truck after a child traded on (a far rumor). */
  trip: (pid: string, team: string[]) => string | null;
  askRansom: (pid: string) => string | null;
  giveUp: (pid: string) => string | null;
  /** Wildfire: the world's count of trees round each building. */
  setFuel: (fuel: Record<string, number>) => void;
  /** Buy a neighbor parcel. */
  buy: (parcelId: string) => string | null;
  /** The world measured what each parcel is (timber, creek bottom, hay, grazing). */
  survey: (kinds: Record<string, LandKind>) => void;
  /** Lay in what came with the land at the spots the world picked. */
  placeImprovements: (spots: Record<string, { x: number; z: number; rot: number }>) => void;
  /** Pay the co-op for the line, or a contractor for the drive. */
  hookup: (what: 'power' | 'drive') => string | null;
  /** Paperwork switches: pull permits for new builds; keep the insurance. */
  setPaper: (k: 'permits' | 'insured', on: boolean) => void;
  /** Sweep the chimney. */
  sweep: () => void;
  /** Eat what you store (rotate the pantry). */
  setRotate: (on: boolean) => void;
  /** OPSEC choices: pick deliveries up in town; blackout curtains. */
  setOpsec: (k: 'quietDeliveries' | 'blackout', on: boolean) => void;
  /** Fill everyone's prescriptions 90 days ahead. */
  stockUpRx: () => void;
  /** After the report card: play on (endless). */
  playOn: () => void;
  /** Put a spare into an EMP-fried building. */
  fixFried: (id: string) => string | null;
  /** Leave the county grid, or get back on it (a reconnection fee). */
  setGrid: (on: boolean) => void;
  /** A building's breaker. */
  setBreaker: (id: string, on: boolean) => void;
  /** Keep or quit an adult's day job (peacetime only). */
  setEmployed: (personId: string, on: boolean) => void;
  /** Free build: start a disaster now, after `warnDays` of warning signs. */
  trigger: (kind: DisasterKind, warnDays: number) => void;
  /** Whether the new-game screen is up. */
  setupOpen: boolean;
  /** The shop & money window. */
  shopOpen: boolean;
  openShop: (open: boolean) => void;
  /** The daily schedule window (sim/daily.ts). */
  scheduleOpen: boolean;
  openSchedule: (open: boolean) => void;
  /** Run a daily-life change (roster, templates, gatherings) on a draft; returns why not, or null. */
  daily: (op: (g: GameState) => string | null) => string | null;
  /** Run a money operation on a draft (transfer, buy / sell / move metal); returns why not, or null. */
  money: (op: (g: GameState) => string | null) => string | null;
  /** The setup screen offers "Back to my game" (opened from the New button, not at boot). */
  setupCanClose: boolean;
  openSetup: (open: boolean, canClose?: boolean) => void;
}

/** Longest real-time step taken in one frame (a background tab does not jump a week). */
const MAX_DT = 0.25;

export const useGameStore = create<GameStore>()(subscribeWithSelector((set, get) => ({
  game: newGame(1),
  tool: null,
  toolProblem: null,
  selected: null,
  tick: (realDt) => {
    const g = get().game;
    if (g.clock.speed === 0 || g.gate.pending || g.gate.aftermath || (g.ending && !g.ending.continued)) return;
    const days = Math.min(realDt, MAX_DT) / SECONDS_PER_DAY[g.clock.speed];
    const next = step(g, days);
    // someone at the gate: stop the clock until the player decides
    // (and when news of a rescue comes in: the card)
    if ((next.gate.pending && !g.gate.pending) || (next.gate.card && !g.gate.card) || (next.ending && !g.ending)) next.clock = { ...next.clock, speed: 0 };
    set({ game: next });
    if (dayIndex(next.clock.t) !== dayIndex(g.clock.t)) void saveGame(AUTOSAVE, next);
  },
  advance: (days) => set(s => ({ game: step(s.game, days) })),
  setSpeed: (speed) => set(s => ({ game: { ...s.game, clock: { ...s.game.clock, speed } } })),
  order: (lines) => {
    const g = structuredClone(get().game);
    const ok = placeOrder(g, lines) !== null;
    if (ok) { set({ game: g }); void saveGame(AUTOSAVE, g); }
    return ok;
  },
  plan: (kind, x, z, rot) => {
    if (planProblem(get().game, kind)) return;
    const g = structuredClone(get().game);
    const st = planStructure(g, kind, x, z, rot);
    applyForPermit(g, st);
    set({ game: g, selected: st.id });
    void saveGame(AUTOSAVE, g);
  },
  load: (game) => set({ game, selected: null, tool: null }),
  planRun: (kind, pts, gates, offLen = 0) => {
    const g = structuredClone(get().game);
    planRun(g, kind, pts, gates, offLen);
    set({ game: g });
    void saveGame(AUTOSAVE, g);
  },
  fit: (id, kind) => {
    const g = structuredClone(get().game);
    const st = g.structures.find(x => x.id === id);
    if (!st) return 'no such building';
    const why = fitProblem(g, plant(g), st, kind);
    if (why) return why;
    orderFit(g, id, kind);
    set({ game: g });
    return null;
  },
  harden: (id, upgrade, all = false) => {
    const g = structuredClone(get().game);
    const st = g.structures.find(x => x.id === id);
    if (!st) return 'no such building';
    const why = hardenProblem(g, st, upgrade);
    if (why) return why;
    if (all) orderHardenAll(g, upgrade, (tierOf(st, upgrade) + 1) as 1 | 2 | 3);
    else orderHarden(g, st, upgrade);
    set({ game: g });
    return null;
  },
  repairPump: (id) => {
    const g = structuredClone(get().game);
    const ok = repairPump(g, id);
    if (ok) set({ game: g });
    return ok;
  },
  toggleMark: (t, haulDist) => {
    const g = structuredClone(get().game);
    const changed = isMarked(g, t.id) ? unmarkTree(g, t.id) : markTree(g, t, haulDist) !== null;
    if (changed) set({ game: g });
  },
  setTool: (tool) => set({ tool, toolProblem: null }),
  setToolProblem: (toolProblem) => set({ toolProblem }),
  select: (selected) => set({ selected }),
  hire: (id) => {
    const g = structuredClone(get().game);
    const why = hireCrew(g, id);
    if (!why) { set({ game: g }); void saveGame(AUTOSAVE, g); }
    return why;
  },
  dismiss: (crewId) => {
    const g = structuredClone(get().game);
    dismissCrew(g, crewId);
    set({ game: g });
  },
  answer: (stance) => {
    const g = structuredClone(get().game);
    resolve(g, stance);
    set({ game: g });
    void saveGame(AUTOSAVE, g);
  },
  setFuel: (fuel) => {
    const g = structuredClone(get().game);
    g.disaster.fuel = fuel;
    set({ game: g });
  },
  buy: (id) => {
    const g = structuredClone(get().game);
    const why = buyLand(g, id);
    if (!why) { set({ game: g }); void saveGame(AUTOSAVE, g); }
    return why;
  },
  placeImprovements: (spots) => {
    const g = structuredClone(get().game);
    placeImprovements(g, spots);
    // anything with no spot (no room for it) is dropped rather than left floating
    const lost = g.structures.filter(x => x.unplaced);
    if (lost.length) { g.structures = g.structures.filter(x => !x.unplaced); }
    set({ game: g });
  },
  stockUpRx: () => {
    const g = structuredClone(get().game);
    const cost = stockUpRx(g);
    if (cost > 0) { log(g, `Filled everyone's prescriptions three months ahead ($${cost.toLocaleString('en-US')}).`); set({ game: g }); }
  },
  setOpsec: (k, on) => {
    const g = structuredClone(get().game);
    opsecOf(g)[k] = on;
    log(g, k === 'quietDeliveries' ? (on ? 'Picking deliveries up in town from now on: fewer people see the truck.' : 'Deliveries come to the place again.') : (on ? 'Blackout curtains up: the lights don\'t show from the road.' : 'Blackout curtains down.'));
    set({ game: g });
  },
  setRotate: (on) => {
    const g = structuredClone(get().game);
    g.shelf.rotate = on;
    log(g, on ? 'Eating what we store: the oldest off the shelf first, the grocery run replaces it.' : 'Stopped rotating the pantry.');
    set({ game: g });
  },
  sweep: () => {
    const g = structuredClone(get().game);
    log(g, sweepChimney(g));
    set({ game: g });
  },
  setPaper: (k, on) => {
    const g = structuredClone(get().game);
    g.paper[k] = on;
    log(g, k === 'permits' ? (on ? 'From now on: permits for everything that needs one.' : 'From now on: no permits. Hope the inspector doesn\'t drive by.') : (on ? 'Took out insurance on the place.' : 'Dropped the insurance.'));
    set({ game: g });
  },
  hookup: (what) => {
    const g = structuredClone(get().game);
    const why = orderHookup(g, what);
    if (!why) { set({ game: g }); void saveGame(AUTOSAVE, g); }
    return why;
  },
  survey: (kinds) => {
    const g = structuredClone(get().game);
    for (const p of g.land.parcels) if (kinds[p.id]) p.kind = kinds[p.id];
    g.land.surveyed = true;
    set({ game: g });
  },
  playOn: () => {
    const g = structuredClone(get().game);
    if (g.ending) g.ending.continued = true;
    set({ game: g });
  },
  fixFried: (id) => {
    const g = structuredClone(get().game);
    const why = replaceFried(g, id);
    if (!why) set({ game: g });
    return why;
  },
  dismissCard: () => {
    const g = structuredClone(get().game);
    g.gate.card = null;
    set({ game: g });
  },
  decideAftermath: (choice) => {
    const g = structuredClone(get().game);
    const onlyDead = !g.gate.aftermath?.wounded;
    const lines = resolveAftermath(g, choice);
    g.gate.card = { title: onlyDead ? 'Buried' : AFTERMATH_TEXT[choice][0], text: lines[0] ?? '', tone: choice === 'treat_release' ? 'good' : choice === 'finish' ? 'bad' : 'mixed', lines: lines.slice(1) };
    set({ game: g });
    void saveGame(AUTOSAVE, g);
  },
  releasePrisoner: (id) => {
    const g = structuredClone(get().game);
    if (!releasePrisoner(g, id)) set({ game: g });
  },
  trip: (pid, team) => {
    const g = structuredClone(get().game);
    const why = startTrip(g, pid, team);
    if (!why) { set({ game: g }); void saveGame(AUTOSAVE, g); }
    return why;
  },
  rescue: (pid, team, allies) => {
    const g = structuredClone(get().game);
    const why = startRescue(g, pid, team, allies);
    if (!why) { set({ game: g }); void saveGame(AUTOSAVE, g); }
    return why;
  },
  askRansom: (pid) => {
    const g = structuredClone(get().game);
    const why = askRansom(g, pid);
    if (!why) set({ game: g });
    return why;
  },
  giveUp: (pid) => {
    const g = structuredClone(get().game);
    const why = giveUp(g, pid);
    if (!why) { set({ game: g }); void saveGame(AUTOSAVE, g); }
    return why;
  },
  joinPrisoner: (id) => {
    const g = structuredClone(get().game);
    if (!joinPrisoner(g, id)) set({ game: g });
  },
  setGrid: (on) => {
    const g = structuredClone(get().game);
    if (g.utilities.grid === on) return;
    if (on) {
      if (!g.site.improvements.power || g.disaster.tracks.grid < 0.5 || g.money < GRID_RECONNECT) return;
      g.money -= GRID_RECONNECT;
      log(g, `Back on the county grid ($${GRID_RECONNECT} to reconnect).`);
    } else log(g, 'The co-op pulled the meter: the place is off the grid.');
    g.utilities.grid = on;
    set({ game: g });
  },
  setBreaker: (id, on) => {
    const g = structuredClone(get().game);
    g.utilities.off = on ? g.utilities.off.filter(x => x !== id) : [...new Set([...g.utilities.off, id])];
    set({ game: g });
  },
  setEmployed: (personId, on) => {
    const g = structuredClone(get().game);
    const ps = g.personState.find(x => x.id === personId), p = g.people.find(x => x.id === personId);
    if (!ps || !p?.job || g.disaster.phase === 'impact' || g.disaster.phase === 'survival') return;
    ps.employed = on;
    log(g, on ? `${p.first} is back at work as a ${p.job.title.toLowerCase()}.` : `${p.first} quit the job to work on the place full time.`);
    set({ game: g });
  },
  trigger: (kind, warnDays) => {
    const g = structuredClone(get().game);
    if (g.disaster.mode !== 'sandbox' || (g.disaster.kind && g.disaster.phase !== 'peace')) return;
    triggerDisaster(g.disaster, g.clock.t, kind, g.seed, warnDays);
    set({ game: g });
  },
  setupOpen: false,
  shopOpen: false,
  openShop: (shopOpen) => set({ shopOpen }),
  scheduleOpen: false,
  openSchedule: (scheduleOpen) => set({ scheduleOpen }),
  daily: (op) => {
    const g = structuredClone(get().game);
    const why = op(g);
    if (!why) set({ game: g });
    return why;
  },
  money: (op) => {
    const g = structuredClone(get().game);
    const why = op(g);
    if (!why) { set({ game: g }); void saveGame(AUTOSAVE, g); }
    return why;
  },
  setupCanClose: false,
  openSetup: (setupOpen, setupCanClose = false) => set({ setupOpen, setupCanClose }),
})));
