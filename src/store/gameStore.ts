import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { Placed } from '../game/buildkit/kit';

/** Game state: what has been built (no simulation yet). */
export interface GameState {
  structures: Placed[];
  /** Build tool: the kit piece being placed (null = no tool). */
  tool: string | null;
  /** Placement feedback for the HUD (null = valid or no tool). */
  toolProblem: string | null;
  place: (p: Omit<Placed, 'id'>) => void;
  setTool: (kind: string | null) => void;
  setToolProblem: (t: string | null) => void;
}

let _n = 0;

export const useGameStore = create<GameState>()(subscribeWithSelector((set) => ({
  structures: [],
  tool: null,
  toolProblem: null,
  place: (p) => set(s => ({ structures: [...s.structures, { ...p, id: `s${++_n}` }] })),
  setTool: (tool) => set({ tool, toolProblem: null }),
  setToolProblem: (toolProblem) => set({ toolProblem }),
})));
