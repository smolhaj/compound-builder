import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { newGame, SECONDS_PER_DAY, dayIndex, type GameState, type OrderLine, type Speed } from '../sim/state';
import { step } from '../sim/engine';
import { placeOrder } from '../sim/economy';
import { planStructure } from '../sim/construction';
import { saveGame, AUTOSAVE } from '../sim/save/saveSystem';

/** Game state (the simulation) + transient UI state for the build tool. */
export interface GameStore {
  game: GameState;
  /** Build tool: the kit piece being placed (null = no tool). */
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
  setTool: (kind: string | null) => void;
  setToolProblem: (t: string | null) => void;
  select: (id: string | null) => void;
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
    if (g.clock.speed === 0) return;
    const days = Math.min(realDt, MAX_DT) / SECONDS_PER_DAY[g.clock.speed];
    const next = step(g, days);
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
  setTool: (tool) => set({ tool, toolProblem: null }),
  setToolProblem: (toolProblem) => set({ toolProblem }),
  select: (selected) => set({ selected }),
})));
