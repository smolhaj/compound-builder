/**
 * The collapse's look (QA: "the collapse clock has no presence"): what the sky, the light and the night do while the
 * clock runs through warning, impact and survival. One pure function of the state that already exists (the disaster
 * kind and variant, the day, the track levels), so nothing is saved and the same day always looks the same.
 *
 *   warning   a hint that grows with the tension: a hazy sky, a paler sun, a colour at the horizon
 *   impact    the full look arrives (a day-one pulse where the disaster has one: a dark noon, a flash)
 *   survival  it holds and eases on the disaster's own timeline (an ash winter lasts a year or more, a fire a few
 *             weeks, a solar storm a few days); the grid going out is read from the real grid track, so the dark
 *             nights come back exactly when the power does
 *
 * The renderer (GameCanvas -> WorldScene) turns the numbers into sky, fog, light, grade and falling ash; no new
 * draw calls. Nuclear keeps its own sky (sim/nuclear.ts) and this adds the grade and tint on top.
 */
import { DISASTERS, tension, type DisasterKind, type DisasterState } from './disaster';
import { nuclearSky } from './nuclear';
import type { GameState } from './state';

type RGB = [number, number, number];

export interface CollapseLook {
  /** Which part of the clock this is: nothing yet, the warning days, the impact days, or after. */
  stage: 'none' | 'warning' | 'impact' | 'survival';
  /** 0-1: how strongly the look is on (the envelope). */
  k: number;
  /** Weather the look adds (taken with the larger of it and the real weather). */
  cloud: number; fog: number; haze: number;
  /** Falling ash or dust (0-1), its colour, and a flash (nuclear, an impact). */
  ash: number; ashColor: RGB; flash: number;
  /** Ash lying on the ground (0-1): it builds over the first days and goes with the look. */
  ashCover: number;
  /** Multiplier on the sun (1 = none). */
  dim: number;
  /** The sky is pulled toward this colour by `skyAmt`; `skyNight` = only at night (an aurora). */
  skyTint: RGB; skyAmt: number; skyNight: boolean;
  /** The grade: a whole-frame colour cast, a saturation multiplier, and a contrast change. */
  cast: RGB; sat: number; contrast: number;
  /** 0-1: the lights are out across the county (the grid track): no town glow, a darker, starrier night. */
  blackout: number;
  /**
   * 0-1 multiplier on the town light-pollution glow along the horizon (1 = as the night palette has it): fewer lights in a
   * pandemic, dimmer ones where order is gone, none when the grid is out.
   */
  townGlow: number;
  /** 0-1: the town glow is failing (the grid is going), so the horizon flickers. Peaks half way through the failure. */
  flicker: number;
  /** 0-1: a warm glow from distant fires along the horizon (stronger at dusk and night). */
  fireGlow: number;
  /** 0-1: columns of smoke rising from the skyline. */
  smoke: number;
  /** 0-1: a lift to the moon and sky fill at eye level, so a blacked-out night stays readable (the stars are the only light). */
  nightLift: number;
}

export const NO_LOOK: CollapseLook = {
  stage: 'none', k: 0, cloud: 0, fog: 0, haze: 0, ash: 0, ashColor: [0.5, 0.48, 0.46], flash: 0, ashCover: 0, dim: 1,
  skyTint: [0.5, 0.5, 0.5], skyAmt: 0, skyNight: false, cast: [1, 1, 1], sat: 1, contrast: 0, blackout: 0,
  townGlow: 1, flicker: 0, fireGlow: 0, smoke: 0, nightLift: 0,
};

/** What a disaster looks like at full strength, and how it comes and goes (days after the hit). */
interface Profile {
  /** The share of the full look reached by the hit day through the warning (0 = nothing shows before it). */
  warn: number;
  /** Days to reach full after the hit, days at full, days to ease to `floor`, and what is left after. */
  rise: number; hold: number; fade: number; floor: number;
  /** A day-one pulse (0-1): the first 30 hours push the dim and the tint harder (a dark noon, a flash). */
  pulse?: number;
  cloud?: number; fog?: number; haze?: number;
  ash?: number; ashColor?: RGB;
  dim?: number;
  tint?: RGB; tintAmt?: number; tintNight?: boolean;
  cast?: RGB; sat?: number; contrast?: number;
  /** The town glow left at full strength (1 = unchanged), the distant-fire glow and the smoke columns at full strength. */
  town?: number; fire?: number; smoke?: number;
}

const GREY_ASH: RGB = [0.52, 0.5, 0.48], WARM_ASH: RGB = [0.62, 0.4, 0.26];

/** The profile of each kind (variants change a few numbers below). Values are tuned on screenshots, not measured. */
const PROFILES: Partial<Record<DisasterKind, Profile>> = {
  // a grey, brown-stained sky and a dim disc of a sun, ash coming down for a week and a haze for a year (climate(): a year at full, a year to fade)
  ash_winter: { warn: 0.2, rise: 3, hold: 330, fade: 400, floor: 0.12, pulse: 1, cloud: 0.9, fog: 0.5, haze: 1, ash: 0.75, ashColor: GREY_ASH, dim: 0.5, tint: [0.34, 0.3, 0.25], tintAmt: 0.9, cast: [1.0, 0.96, 0.9], sat: 0.5, contrast: -0.08 },
  // smoke: an orange noon, a red sun, embers and ash for a few days, the smoke for a few weeks
  wildfire: { warn: 0.4, rise: 1, hold: 4, fade: 24, floor: 0, pulse: 0.6, fire: 0.9, smoke: 1, town: 0.6, cloud: 0.45, fog: 0.4, haze: 1, ash: 0.45, ashColor: WARM_ASH, dim: 0.55, tint: [0.78, 0.34, 0.12], tintAmt: 0.85, cast: [1.08, 0.9, 0.74], sat: 0.95 },
  // the power is gone: the sky itself hardly changes; the nights do (blackout), and the day is a little flat and cold
  // the power is gone: the sky hardly changes by day (a flat, slightly cold, quiet light); the nights do (blackout: no town glow, a lifted starlit dark)
  grid_down: { warn: 0.1, rise: 0, hold: 30, fade: 120, floor: 0, haze: 0.16, dim: 0.95, tint: [0.5, 0.55, 0.62], tintAmt: 0.14, cast: [0.96, 0.99, 1.04], sat: 0.8, contrast: -0.03 },
  // the same dead grid, and the networks too: colder, bluer, the day a little flatter, the last lights failing before they go
  cyberattack: { warn: 0.1, rise: 0, hold: 30, fade: 90, floor: 0, haze: 0.14, dim: 0.95, tint: [0.42, 0.5, 0.64], tintAmt: 0.16, cast: [0.92, 1.0, 1.07], sat: 0.76, contrast: 0.02 },
  // an aurora over everything for the first nights (the sky glows green and red), then a dead grid
  solar_flare: { warn: 0.45, rise: 0, hold: 3, fade: 10, floor: 0.02, tint: [0.2, 0.62, 0.36], tintAmt: 0.6, tintNight: true, cast: [1, 1, 1], sat: 1 },
  // a bleached, dusty, rainless sky for as long as it takes to break
  drought: { warn: 0.5, rise: 20, hold: 330, fade: 360, floor: 0.1, cloud: 0.04, haze: 0.85, fog: 0.12, dim: 0.9, tint: [0.62, 0.5, 0.3], tintAmt: 0.42, cast: [1.06, 0.99, 0.86], sat: 0.8, contrast: 0.02 },
  // a muted, grey-green, closed-in look; nobody about
  pandemic: { warn: 0.25, rise: 14, hold: 300, fade: 300, floor: 0.1, cloud: 0.5, haze: 0.8, fog: 0.22, dim: 0.84, tint: [0.42, 0.52, 0.56], tintAmt: 0.5, cast: [0.89, 1.0, 1.09], sat: 0.5, contrast: -0.05, town: 0.4 },
  financial: { warn: 0.3, rise: 20, hold: 300, fade: 300, floor: 0.1, cloud: 0.25, haze: 0.2, dim: 0.92, tint: [0.4, 0.43, 0.5], tintAmt: 0.22, cast: [0.96, 0.98, 1.03], sat: 0.76 },
  // a warm, smoky look: fires out past the edge of town, smoke columns on the skyline, the town's lights thinned and dim
  lawless: { warn: 0.3, rise: 10, hold: 240, fade: 300, floor: 0.12, haze: 0.8, fog: 0.12, cloud: 0.2, dim: 0.84, tint: [0.66, 0.38, 0.19], tintAmt: 0.5, cast: [1.07, 0.96, 0.85], sat: 0.78, fire: 1, smoke: 1, town: 0.3 },
  civil_war: { fire: 0.55, smoke: 0.7, town: 0.5, warn: 0.3, rise: 6, hold: 300, fade: 300, floor: 0.15, cloud: 0.2, haze: 0.6, ash: 0.12, ashColor: GREY_ASH, dim: 0.85, tint: [0.45, 0.38, 0.32], tintAmt: 0.34, cast: [1.02, 0.97, 0.93], sat: 0.78 },
  invasion: { warn: 0.3, rise: 4, hold: 300, fade: 300, floor: 0.15, cloud: 0.3, haze: 0.4, dim: 0.88, tint: [0.36, 0.42, 0.5], tintAmt: 0.3, cast: [0.95, 0.99, 1.04], sat: 0.76 },
  zombies: { warn: 0.3, rise: 4, hold: 300, fade: 300, floor: 0.2, cloud: 0.4, haze: 0.45, fog: 0.2, dim: 0.8, tint: [0.38, 0.32, 0.3], tintAmt: 0.4, cast: [1.0, 0.95, 0.93], sat: 0.7 },
  bioweapon: { warn: 0.3, rise: 4, hold: 300, fade: 300, floor: 0.2, cloud: 0.3, haze: 0.7, fog: 0.2, dim: 0.85, tint: [0.55, 0.58, 0.28], tintAmt: 0.4, cast: [1.0, 1.04, 0.9], sat: 0.7 },
  // the disasters that darken the world for a long time
  asteroid: { warn: 0.3, rise: 1, hold: 700, fade: 400, floor: 0.2, pulse: 1, cloud: 0.85, fog: 0.4, haze: 1, ash: 0.5, ashColor: GREY_ASH, dim: 0.42, tint: [0.42, 0.26, 0.16], tintAmt: 0.7, cast: [1.04, 0.94, 0.84], sat: 0.6 },
  unknown: { warn: 0.4, rise: 1, hold: 30, fade: 90, floor: 0.1, haze: 0.4, tint: [0.45, 0.3, 0.6], tintAmt: 0.5, tintNight: true, cast: [1, 0.98, 1.04], sat: 0.9 },
};

/** Variants that change the look (the ice storm is a grey freezing day; a nuclear exchange is a winter). */
function variantProfile(kind: DisasterKind, variant: string, p: Profile): Profile {
  if (kind === 'grid_down' && variant === 'ice_storm') return { ...p, rise: 1, hold: 8, fade: 22, cloud: 0.9, fog: 0.35, haze: 0.5, dim: 0.75, tint: [0.42, 0.5, 0.6], tintAmt: 0.5, cast: [0.94, 0.99, 1.07], sat: 0.7 };
  if (kind === 'grid_down' && variant === 'substation') return { ...p, haze: 0.12 };
  if (kind === 'grid_down' && variant === 'cascade') return { ...p, hold: 120, fade: 240, sat: 0.84 };
  return p;
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const smooth = (x: number) => { const t = clamp01(x); return t * t * (3 - 2 * t); };

/** The look's strength 0-1 `d` days from the hit (negative = in the warning), with `tens` the 0-1 tension of the warning. */
export function envelope(p: Pick<Profile, 'warn' | 'rise' | 'hold' | 'fade' | 'floor'>, d: number, tens: number, slow = 1): number {
  if (d < 0) return p.warn * Math.pow(clamp01(tens), 1.5);
  const up = p.rise <= 0 ? 1 : smooth(d / p.rise);
  const start = p.warn + (1 - p.warn) * up;
  const gone = d - p.rise - p.hold;
  if (gone <= 0) return start;
  return p.floor + (1 - p.floor) * (1 - smooth(gone / Math.max(1, p.fade * slow)));
}

/** The grid track as a blackout: the lights are out below about a third of power, and fully so by 10 %. */
export function blackoutOf(grid: number): number { return 1 - smooth((grid - 0.1) / 0.6); }

/** What a dead grid does to the night: the town glow goes (flickering as it fails), and the moon and stars get a lift so it stays readable. */
export function darkness(blackout: number): Pick<CollapseLook, 'townGlow' | 'flicker' | 'nightLift'> {
  const b = clamp01(blackout);
  return { townGlow: 1 - b, flicker: 4 * b * (1 - b), nightLift: 0.5 * b };
}

const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const ONE: RGB = [1, 1, 1];

/** The look for the state now. Cheap enough to call every frame. */
export function collapseLook(s: Pick<GameState, 'disaster' | 'clock'> & Partial<GameState>): CollapseLook {
  const d: DisasterState = s.disaster, t = s.clock.t;
  const kind = d.kind;
  if (!kind || !DISASTERS[kind] || t < d.warnAt) return NO_LOOK;
  const days = t - d.hitAt;
  const after = days >= 0;
  const blackout = after ? blackoutOf(d.tracks.grid) : 0;
  const dark = darkness(blackout);
  const base = PROFILES[kind];
  // nuclear: the sky is sim/nuclear.ts's (flash, haze, dust); the grade and the tint come from the haze
  if (kind === 'nuclear') {
    const n = after && s.site ? nuclearSky(s as GameState) : { haze: 0, flash: 0, dust: 0 };
    const w = clamp01(n.haze);
    const warn = after ? 0 : 0.25 * Math.pow(clamp01(tension(d, t)), 1.5);
    const k = Math.max(w, warn);
    return {
      stage: after ? (days < 3 ? 'impact' : 'survival') : 'warning', k,
      cloud: 0.55 * n.haze, fog: 0.35 * n.haze + 0.4 * n.dust, haze: 0.9 * n.haze, ash: 0.6 * n.dust, ashColor: GREY_ASH, flash: n.flash, ashCover: 0.5 * n.dust,
      dim: 1 - 0.42 * k, skyTint: [0.46, 0.5, 0.3], skyAmt: 0.62 * k, skyNight: false,
      cast: mix(ONE, [1.02, 1.04, 0.88], k), sat: 1 - 0.32 * k, contrast: -0.04 * k, blackout,
      ...dark, fireGlow: 0, smoke: 0,
    };
  }
  if (!base) return { ...NO_LOOK, stage: after ? 'impact' : 'warning', blackout, ...dark };
  const p = variantProfile(kind, d.variant, base);
  // a world that never comes back is slow to clear
  const slow = d.fate === 'never' ? 2 : 1;
  const k = envelope(p, days, tension(d, t), slow);
  const pulse = after && p.pulse ? p.pulse * clamp01(1 - days / 1.25) * clamp01(1 + days * 8) : 0;
  const stage: CollapseLook['stage'] = after ? (days < 3 ? 'impact' : 'survival') : 'warning';
  // ash and dust fall heavily for the first days, then thin to a drift
  const fall = !p.ash ? 0 : after ? p.ash * (days < 10 ? 1 - 0.6 * smooth(days / 10) : 0.4) * k : p.ash * 0.35 * k;
  const tintAmt = clamp01((p.tintAmt ?? 0) * k + 0.25 * pulse * (p.tintAmt ?? 0));
  return {
    stage, k,
    cloud: (p.cloud ?? 0) * k, fog: (p.fog ?? 0) * k, haze: (p.haze ?? 0) * k,
    ash: fall, ashColor: p.ashColor ?? GREY_ASH, flash: 0,
    ashCover: p.ash && after ? Math.min(1, p.ash * 1.15) * k * smooth(days / 4) : 0,
    dim: 1 - (1 - (p.dim ?? 1)) * k - 0.3 * pulse,
    skyTint: p.tint ?? NO_LOOK.skyTint, skyAmt: tintAmt, skyNight: !!p.tintNight,
    cast: mix(ONE, p.cast ?? ONE, k), sat: 1 + ((p.sat ?? 1) - 1) * k, contrast: (p.contrast ?? 0) * k,
    blackout,
    townGlow: dark.townGlow * (1 - k * (1 - (p.town ?? 1))), flicker: dark.flicker,
    fireGlow: (p.fire ?? 0) * k * (after ? 1 : 0.4), smoke: (p.smoke ?? 0) * k * (after ? 1 : 0.3), nightLift: dark.nightLift,
  };
}
