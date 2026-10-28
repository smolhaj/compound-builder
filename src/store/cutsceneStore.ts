import { create } from 'zustand';
import type { SegmentKind } from '../sim/siege';

/** What the cutscene overlay reads while the scenes play (written by the player in the frame loop, a few times a second). */
export interface CutsceneView {
  scene: number;
  scenes: number;
  sceneLabel: string;
  seg: SegmentKind | null;
  /** The game clock's hour of day, and game seconds since the raid arrived. */
  hour: number;
  game: number;
  /** One line of narration for the current stretch, and the "40 minutes later" card text while a gap is skipped. */
  caption: string;
  gap: string | null;
  /** 0-1 through the whole cutscene. */
  progress: number;
}

interface CutsceneViewStore {
  view: CutsceneView | null;
  set: (v: CutsceneView | null) => void;
  /** Counters the frame loop watches: Skip scene / Skip all. */
  skipScene: number;
  skipAll: number;
  requestSkipScene: () => void;
  requestSkipAll: () => void;
}

export const useCutsceneView = create<CutsceneViewStore>(set => ({
  view: null, set: view => set({ view }), skipScene: 0, skipAll: 0,
  requestSkipScene: () => set(s => ({ skipScene: s.skipScene + 1 })),
  requestSkipAll: () => set(s => ({ skipAll: s.skipAll + 1 })),
}));
