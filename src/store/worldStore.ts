import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { Quality } from '../engine/world/WorldScene';
import type { SeasonMode } from '../engine/world/season/seasonState';
import type { WeatherMode } from '../engine/world/weather/weatherState';
import type { TourCaption, TourMode } from '../engine/world/camera/TourController';
import type { PropertyGeometry } from '../sim/propertyWall';
import type { BpReadout } from '../game/blueprint/blueprintPlan';
import type { PathSummary } from '../game/paths/pathNet';
import { autoStartTier } from '../engine/perf/device';

export type FrameCap = 0 | 30 | 60;
/** Once-a-second readout of the running game (Settings -> Graphics). */
export interface PerfStats { fps: number; ms: number; calls: number; tris: number; tier: Quality; budgetMs: number }

export type CameraMode = 'diorama' | TourMode;
/** How buildings are drawn: whole, cut to waist height with the roof off, or with see-through walls. */
export type BuildingView = 'full' | 'cutaway' | 'xray';
export const BUILDING_VIEWS: BuildingView[] = ['full', 'cutaway', 'xray'];

/** Seed for this run's parcel: ?seed=N (QA) or random (seeded per run, docs/DECISIONS.md). */
function initialSeed(): number {
  const q = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('seed') : null;
  const n = q === null ? NaN : Number(q);
  return Number.isFinite(n) ? n : Math.floor(Math.random() * 1e6);
}

/** View / world-look state (no simulation yet). */
export interface WorldState {
  seed: number;
  timeOfDay: number;
  /** Day of the year (1–365); advances with the clock. */
  dayOfYear: number;
  /** Total days elapsed (season easing, moon). */
  totalDays: number;
  /** Photo mode: the view clock is set by hand (QA shots, photo mode); otherwise it follows the sim. */
  photo: boolean;
  /** 'auto' follows the calendar; a season pins the look. */
  seasonMode: SeasonMode;
  weatherMode: WeatherMode;
  quality: Quality;
  /** The loading screen: what the boot is doing and how far along (null once the world is up). */
  boot: { label: string; pct: number; hold?: boolean } | null;
  /** Frame-rate cap (0 = uncapped). 60 by default: a 120 Hz display otherwise does twice the work for no visible gain. */
  frameCap: FrameCap;
  setFrameCap: (f: FrameCap) => void;
  /** The FPS / budget readout (Settings -> Graphics). */
  showPerf: boolean;
  setShowPerf: (on: boolean) => void;
  perfStats: PerfStats | null;
  setPerfStats: (p: PerfStats | null) => void;
  /** Shown once when the game stepped the graphics down by itself (dismissible); never set for a change the player made. */
  perfNotice: string | null;
  setPerfNotice: (n: string | null) => void;
  setBoot: (b: { label: string; pct: number; hold?: boolean } | null) => void;
  cameraMode: CameraMode;
  buildingView: BuildingView;
  /** Sightline overlay: off / exposure from the road / from the ridge / night lights / viewshed from a point. */
  sightMode: 'off' | 'road' | 'ridge' | 'night' | 'viewshed';
  /** The terrain overlay (high ground, lanes, water, sun): game/terrain/TerrainOverlay.ts. */
  terrainMode: 'off' | 'high' | 'lanes' | 'water' | 'sun';
  setTerrainMode: (m: WorldState['terrainMode']) => void;
  /** The blueprint view: names and roles of the buildings, rings, gates, towers and tunnels, with the defense readouts (game/blueprint). */
  blueprint: boolean;
  setBlueprint: (on: boolean) => void;
  blueprintReadout: BpReadout | null;
  setBlueprintReadout: (r: BpReadout | null) => void;
  /** The property line drawn on the ground (also shown while a fence or wall is being drawn). */
  showBoundary: boolean;
  setShowBoundary: (on: boolean) => void;
  /** What the world knows of the land that the sim does not (the creek's line, the road gate): the "Wall my property" planner reads it. Set by the canvas. */
  siteGeo: PropertyGeometry | null;
  setSiteGeo: (g: PropertyGeometry | null) => void;
  /** The walks between the stops on the place (game/paths): what the Paths panel lists and prices. Set by the canvas. */
  pathNet: PathSummary | null;
  setPathNet: (p: PathSummary | null) => void;
  /** Underground view (bunker rooms; the ground goes see-through). */
  underground: boolean;
  setUnderground: (on: boolean) => void;
  /** The side panels hidden (H) so the map shows. */
  hudHidden: boolean;
  setHudHidden: (on: boolean) => void;
  /** Marks the n nearest trees to the yard for felling (set by the canvas; returns how many were marked). */
  markNearestTrees: ((n: number) => number) | null;
  setMarkNearestTrees: (f: ((n: number) => number) | null) => void;
  setSightMode: (m: WorldState['sightMode']) => void;
  setBuildingView: (v: BuildingView) => void;
  /** Cinematic tour caption card (null = none). */
  tourCaption: TourCaption | null;
  setCameraMode: (m: CameraMode) => void;
  setTourCaption: (c: TourCaption | null) => void;
  setWeatherMode: (m: WeatherMode) => void;
  /** Set the view hour by hand (enters photo mode). */
  setTimeOfDay: (t: number) => void;
  /** Set the view date by hand (enters photo mode). */
  setDayOfYear: (d: number) => void;
  setPhoto: (on: boolean) => void;
  /** Follow the sim clock (outside photo mode). */
  syncClock: (hour: number, doy: number, totalDays: number) => void;
  setSeasonMode: (s: SeasonMode) => void;
  /** `manual` (the HUD selector) is remembered across visits; the automatic step-down is not. */
  setQuality: (q: Quality, manual?: boolean) => void;
}

const wrapDoy = (d: number) => ((Math.floor(d) - 1) % 365 + 365) % 365 + 1;

/** The player's saved choice, else a guess from the device (engine/perf/qualityAuto.ts: only a known-strong GPU starts on High). */
function savedQuality(): Quality {
  try { const q = localStorage.getItem('cb.quality'); if (q === 'high' || q === 'medium' || q === 'low') return q; } catch { /* no storage */ }
  try { return autoStartTier(); } catch { return 'medium'; }
}
function savedFrameCap(): FrameCap {
  try { const v = Number(localStorage.getItem('cb.fpscap')); if (v === 0 || v === 30 || v === 60) return v; } catch { /* no storage */ }
  return 60;
}
/** On unless the player turned it off: the next few builds ask for fps numbers. */
function savedShowPerf(): boolean { try { return localStorage.getItem('cb.showperf') !== '0'; } catch { return true; } }

export const useWorldStore = create<WorldState>()(subscribeWithSelector((set) => ({
  seed: initialSeed(),
  timeOfDay: 10,
  dayOfYear: 226,
  totalDays: 0,
  photo: false,
  seasonMode: 'auto',
  weatherMode: 'auto',
  quality: savedQuality(),
  boot: { label: 'Starting', pct: 0.02 },
  frameCap: savedFrameCap(),
  setFrameCap: (frameCap) => { try { localStorage.setItem('cb.fpscap', String(frameCap)); } catch { /* private mode */ } set({ frameCap }); },
  showPerf: savedShowPerf(),
  setShowPerf: (showPerf) => { try { localStorage.setItem('cb.showperf', showPerf ? '1' : '0'); } catch { /* private mode */ } set({ showPerf }); },
  perfStats: null,
  setPerfStats: (perfStats) => set({ perfStats }),
  perfNotice: null,
  setPerfNotice: (perfNotice) => set({ perfNotice }),
  setBoot: (boot) => set({ boot }),
  cameraMode: 'diorama',
  buildingView: 'full',
  sightMode: 'off',
  terrainMode: 'off',
  blueprint: false,
  setBlueprint: (blueprint) => set({ blueprint }),
  blueprintReadout: null,
  setBlueprintReadout: (blueprintReadout) => set({ blueprintReadout }),
  showBoundary: false,
  siteGeo: null,
  setSiteGeo: (siteGeo) => set({ siteGeo }),
  pathNet: null,
  setPathNet: (pathNet) => set({ pathNet }),
  underground: false,
  setUnderground: (underground) => set({ underground }),
  hudHidden: false,
  setHudHidden: (hudHidden) => set({ hudHidden }),
  markNearestTrees: null,
  setMarkNearestTrees: (markNearestTrees) => set({ markNearestTrees }),
  setSightMode: (sightMode) => set({ sightMode }),
  setTerrainMode: (terrainMode) => set({ terrainMode }),
  setShowBoundary: (showBoundary) => set({ showBoundary }),
  setBuildingView: (buildingView) => set({ buildingView }),
  tourCaption: null,
  setCameraMode: (cameraMode) => set({ cameraMode }),
  setTourCaption: (tourCaption) => set({ tourCaption }),
  setWeatherMode: (weatherMode) => set({ weatherMode }),
  setTimeOfDay: (t) => set({ timeOfDay: ((t % 24) + 24) % 24, photo: true }),
  setDayOfYear: (d) => set(s => ({ dayOfYear: wrapDoy(d), totalDays: s.totalDays + 100, photo: true })),
  setPhoto: (photo) => set({ photo }),
  syncClock: (timeOfDay, dayOfYear, totalDays) => set({ timeOfDay, dayOfYear, totalDays }),
  setSeasonMode: (seasonMode) => set({ seasonMode }),
  setQuality: (quality, manual = false) => {
    if (manual) { try { localStorage.setItem('cb.quality', quality); } catch { /* private mode */ } }
    set({ quality });
  },
})));
