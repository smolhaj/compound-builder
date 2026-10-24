import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { newGame, SECONDS_PER_DAY, dayIndex, type GameState, type OrderLine, type Speed } from '../sim/state';
import { step } from '../sim/engine';
import { placeOrder } from '../sim/economy';
import { planStructure } from '../sim/construction';
import { markTree, unmarkTree, isMarked, type TreeRef } from '../sim/forestry';
import { planRun, type Gate, type PerimeterKind, type Pt } from '../sim/perimeter';
import { fitProblem, orderFit, plant, repairPump } from '../sim/utilities';

/** Reconnection fee to get back on the grid after leaving it. */
const GRID_RECONNECT = 250;
import { triggerDisaster, type DisasterKind } from '../sim/disaster';
import { resolve, type Stance } from '../sim/encounters';
import { log } from '../sim/economy';
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
  /** Mark a tree to fell, or unmark it if it is marked and not yet cut. */
  toggleMark: (t: TreeRef, haulDist: number) => void;
  setTool: (kind: string | null) => void;
  setToolProblem: (t: string | null) => void;
  select: (id: string | null) => void;
  /** Answer whoever is at the gate. */
  answer: (stance: Stance) => void;
  dismissCard: () => void;
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
    if (g.clock.speed === 0 || g.gate.pending) return;
    const days = Math.min(realDt, MAX_DT) / SECONDS_PER_DAY[g.clock.speed];
    const next = step(g, days);
    // someone at the gate: stop the clock until the player decides
    if (next.gate.pending && !g.gate.pending) next.clock = { ...next.clock, speed: 0 };
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
    const g = structuredClone(get().game);
    const st = planStructure(g, kind, x, z, rot);
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
  answer: (stance) => {
    const g = structuredClone(get().game);
    resolve(g, stance);
    set({ game: g });
    void saveGame(AUTOSAVE, g);
  },
  dismissCard: () => {
    const g = structuredClone(get().game);
    g.gate.card = null;
    set({ game: g });
  },
  setGrid: (on) => {
    const g = structuredClone(get().game);
    if (g.utilities.grid === on) return;
    if (on) {
      if (g.disaster.tracks.grid < 0.5 || g.money < GRID_RECONNECT) return;
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
  setupCanClose: false,
  openSetup: (setupOpen, setupCanClose = false) => set({ setupOpen, setupCanClose }),
})));
