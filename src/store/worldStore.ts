import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { Quality } from '../engine/world/WorldScene';
import type { SeasonMode } from '../engine/world/season/seasonState';
import type { WeatherMode } from '../engine/world/weather/weatherState';
import type { TourCaption, TourMode } from '../engine/world/camera/TourController';
import type { PropertyGeometry } from '../sim/propertyWall';

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
  cameraMode: CameraMode;
  buildingView: BuildingView;
  /** Sightline overlay: off / exposure from the road / from the ridge / night lights / viewshed from a point. */
  sightMode: 'off' | 'road' | 'ridge' | 'night' | 'viewshed';
  /** The property line drawn on the ground (also shown while a fence or wall is being drawn). */
  showBoundary: boolean;
  setShowBoundary: (on: boolean) => void;
  /** What the world knows of the land that the sim does not (the creek's line, the road gate): the "Wall my property" planner reads it. Set by the canvas. */
  siteGeo: PropertyGeometry | null;
  setSiteGeo: (g: PropertyGeometry | null) => void;
  /** Underground view (bunker rooms; the ground goes see-through). */
  underground: boolean;
  setUnderground: (on: boolean) => void;
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

/** Medium unless the player chose otherwise (High adds SSAO and a 2× pixel ratio, which is laggy on retina screens). */
function savedQuality(): Quality {
  try { const q = localStorage.getItem('cb.quality'); if (q === 'high' || q === 'medium' || q === 'low') return q; } catch { /* no storage */ }
  return 'medium';
}

export const useWorldStore = create<WorldState>()(subscribeWithSelector((set) => ({
  seed: initialSeed(),
  timeOfDay: 10,
  dayOfYear: 226,
  totalDays: 0,
  photo: false,
  seasonMode: 'auto',
  weatherMode: 'auto',
  quality: savedQuality(),
  cameraMode: 'diorama',
  buildingView: 'full',
  sightMode: 'off',
  showBoundary: false,
  siteGeo: null,
  setSiteGeo: (siteGeo) => set({ siteGeo }),
  underground: false,
  setUnderground: (underground) => set({ underground }),
  setSightMode: (sightMode) => set({ sightMode }),
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
