import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { Quality } from '../engine/world/WorldScene';
import type { SeasonMode } from '../engine/world/season/seasonState';
import type { WeatherMode } from '../engine/world/weather/weatherState';
import type { TourCaption, TourMode } from '../engine/world/camera/TourController';

export type CameraMode = 'diorama' | TourMode;

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
  setQuality: (q: Quality) => void;
}

const wrapDoy = (d: number) => ((Math.floor(d) - 1) % 365 + 365) % 365 + 1;

export const useWorldStore = create<WorldState>()(subscribeWithSelector((set) => ({
  seed: initialSeed(),
  timeOfDay: 10,
  dayOfYear: 226,
  totalDays: 0,
  photo: false,
  seasonMode: 'auto',
  weatherMode: 'auto',
  quality: 'high',
  cameraMode: 'diorama',
  tourCaption: null,
  setCameraMode: (cameraMode) => set({ cameraMode }),
  setTourCaption: (tourCaption) => set({ tourCaption }),
  setWeatherMode: (weatherMode) => set({ weatherMode }),
  setTimeOfDay: (t) => set({ timeOfDay: ((t % 24) + 24) % 24, photo: true }),
  setDayOfYear: (d) => set(s => ({ dayOfYear: wrapDoy(d), totalDays: s.totalDays + 100, photo: true })),
  setPhoto: (photo) => set({ photo }),
  syncClock: (timeOfDay, dayOfYear, totalDays) => set({ timeOfDay, dayOfYear, totalDays }),
  setSeasonMode: (seasonMode) => set({ seasonMode }),
  setQuality: (quality) => set({ quality }),
})));
