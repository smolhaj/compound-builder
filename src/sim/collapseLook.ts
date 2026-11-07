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
 *
 * It also says what happens ON THE SKYLINE, matched to the disaster and its timeline (all drawn by the sky dome's
 * shader, so no new draw calls): the far town's lights (`townGlow`, which also dims the horizon glow) go out over
 * weeks, the far road's headlights thin to nothing as fuel and deliveries fail (`traffic`), convoys run on it where
 * the disaster has them, distant gunfire and blasts flash (`flashes`), fires glow in an arc and smoke rises (`fireGlow`,
 * `smoke`). `withWeather` then lets rain, snow and the season act on the look (rain washes ash from the air, snow
 * buries it, a wet night dims the fires).
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
  /** A colour the night horizon glows with (added to the sky's glow, at night only): a sick green, a cold blue, a dusty red. Nothing for the dead-grid kinds, whose night is starlit. */
  nightGlow: RGB;
  /** 0-1: the far town's lights as little points on the skyline (they fail with the grid and thin over weeks; 0 = none shown). */
  townLights: number;
  /** 0-1: the headlights of the far road (people leaving, then fewer cars as fuel and deliveries fail). */
  traffic: number;
  /** 0-1: of those, the share that is a convoy (a long, slow string: soldiers, trucks, refugees). */
  convoy: number;
  /** 0-1: distant gunfire, artillery or blasts flashing along the skyline (night and dusk mostly). */
  flashes: number;
  /** 0-1: an aurora over the night sky (a solar storm); a comet growing in the sky through an asteroid's warning. */
  aurora: number; comet: number;
  /** Where on the skyline (radians, world x toward z) the town, the far road, the fires and the fighting lie: fixed by the seed. */
  az: { town: number; road: number; fire: number; war: number };
}

/**
 * Compass bearings of the things on the skyline (radians, 0 = south toward +z, pi = north). The county road runs north-south just east of
 * the place and the town lies up it to the north (a little either side by seed), so the fires, the fighting and the road's lights are all
 * over that way, where the road leads; a few more fires lie round it. The road's far ends are at `road` (north) and pi - `road` (south).
 */
export function skylineAz(seed: number): CollapseLook['az'] {
  const r = (n: number) => { const x = Math.sin((seed + 1) * 12.9898 + n * 78.233) * 43758.5453; return x - Math.floor(x); };
  const town = Math.PI + (r(1) - 0.5) * 0.5;
  return { town, road: Math.PI - 0.05, fire: town + (r(2) - 0.5) * 0.9, war: town + (r(3) - 0.5) * 0.6 };
}

export const NO_LOOK: CollapseLook = {
  stage: 'none', k: 0, cloud: 0, fog: 0, haze: 0, ash: 0, ashColor: [0.5, 0.48, 0.46], flash: 0, ashCover: 0, dim: 1,
  skyTint: [0.5, 0.5, 0.5], skyAmt: 0, skyNight: false, cast: [1, 1, 1], sat: 1, contrast: 0, blackout: 0,
  townGlow: 1, flicker: 0, fireGlow: 0, smoke: 0, nightLift: 0,
  nightGlow: [0, 0, 0], townLights: 0, traffic: 0, convoy: 0, flashes: 0, aurora: 0, comet: 0, az: { town: 3.14, road: 3.09, fire: 3.14, war: 3.14 },
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
  /** Days over which the town's lights thin to `town` (the weeks the world takes to fall away); default 20. */
  townDays?: number;
  /** The far road: the share of normal traffic left when fuel and deliveries are fine (`road`), the extra traffic of people leaving through the warning (`flee`), and a convoy's strength (`convoy`). */
  road?: number; flee?: number; convoy?: number;
  /** Distant gunfire, artillery and blasts on the skyline at full strength. */
  war?: number;
  /** An aurora (solar storm) and a comet in the sky (asteroid, through the warning only) at full strength. */
  aurora?: number; comet?: number;
  /** The night horizon's own glow at full strength. */
  glow?: RGB;
}

const GREY_ASH: RGB = [0.52, 0.5, 0.48], WARM_ASH: RGB = [0.62, 0.4, 0.26];

/** The profile of each kind (variants change a few numbers below). Values are tuned on screenshots, not measured. */
const PROFILES: Partial<Record<DisasterKind, Profile>> = {
  // a grey, brown-stained sky and a dim disc of a sun, ash coming down for a week and a haze for a year (climate(): a year at full, a year to fade)
  ash_winter: { glow: [0.03, 0.022, 0.015], road: 0.25, flee: 0.6, town: 0.35, townDays: 20, warn: 0.2, rise: 3, hold: 330, fade: 400, floor: 0.12, pulse: 1, cloud: 0.9, fog: 0.5, haze: 1, ash: 0.75, ashColor: GREY_ASH, dim: 0.5, tint: [0.34, 0.3, 0.25], tintAmt: 0.9, cast: [1.0, 0.96, 0.9], sat: 0.5, contrast: -0.08 },
  // smoke: an orange noon, a red sun, embers and ash for a few days, the smoke for a few weeks
  wildfire: { road: 0.3, flee: 0.8, townDays: 3, warn: 0.4, rise: 1, hold: 4, fade: 24, floor: 0, pulse: 0.6, fire: 0.9, smoke: 1, town: 0.6, cloud: 0.22, fog: 0.45, haze: 1, ash: 0.45, ashColor: WARM_ASH, dim: 0.55, tint: [0.78, 0.30, 0.10], tintAmt: 0.9, cast: [1.1, 0.88, 0.7], sat: 0.95 },
  // the power is gone: the sky itself hardly changes; the nights do (blackout), and the day is a little flat and cold
  // the power is gone: the sky hardly changes by day (a flat, slightly cold, quiet light); the nights do (blackout: no town glow, a lifted starlit dark)
  grid_down: { warn: 0.1, rise: 0, hold: 30, fade: 120, floor: 0, haze: 0.05, dim: 1, tint: [0.4, 0.5, 0.7], tintAmt: 0.2, cast: [0.95, 0.99, 1.05], sat: 0.8, contrast: 0.04, road: 0.55, flee: 0.25 },
  // the same dead grid, and the networks too: colder, bluer, the day a little flatter, the last lights failing before they go
  cyberattack: { warn: 0.1, rise: 0, hold: 30, fade: 90, floor: 0, haze: 0.05, dim: 0.97, tint: [0.35, 0.45, 0.68], tintAmt: 0.3, cast: [0.9, 0.99, 1.09], sat: 0.65, contrast: 0.06, road: 0.5, flee: 0.15 },
  // an aurora over everything for the first nights (the sky glows green and red), then a dead grid
  solar_flare: { aurora: 1, road: 0.5, flee: 0.2, warn: 0.45, rise: 0, hold: 3, fade: 10, floor: 0.02, haze: 0.2, dim: 0.96, tint: [0.2, 0.62, 0.36], tintAmt: 0.25, tintNight: true, cast: [1.02, 0.97, 1.05], sat: 0.92 },
  // a bleached, dusty, rainless sky for as long as it takes to break
  drought: { glow: [0.03, 0.02, 0.008], road: 0.8, town: 0.8, townDays: 120, warn: 0.5, rise: 6, hold: 330, fade: 360, floor: 0.1, cloud: 0.02, haze: 1, fog: 0.22, dim: 0.97, tint: [0.78, 0.62, 0.36], tintAmt: 0.6, cast: [1.12, 1.0, 0.8], sat: 0.7, contrast: 0.06 },
  // a muted, grey-green, closed-in look; nobody about. It arrives with the news (QA run 6: over 14 days the first week looked like peacetime), so the rise is hours, not weeks
  pandemic: { glow: [0.012, 0.02, 0.03], road: 0.25, flee: 0.1, townDays: 10, warn: 0.25, rise: 0.25, hold: 300, fade: 300, floor: 0.1, cloud: 0.5, haze: 0.8, fog: 0.22, dim: 0.84, tint: [0.42, 0.52, 0.56], tintAmt: 0.5, cast: [0.89, 1.0, 1.09], sat: 0.5, contrast: -0.05, town: 0.4 },
  financial: { glow: [0.02, 0.016, 0.01], road: 0.6, flee: 0.1, town: 0.6, townDays: 60, warn: 0.3, rise: 8, hold: 300, fade: 300, floor: 0.1, cloud: 0.5, haze: 0.5, fog: 0.1, dim: 0.9, tint: [0.54, 0.47, 0.36], tintAmt: 0.5, cast: [1.04, 0.99, 0.9], sat: 0.5, contrast: -0.07 },
  // a warm, smoky look: fires out past the edge of town, smoke columns on the skyline, the town's lights thinned and dim
  lawless: { road: 0.35, war: 0.25, townDays: 30, warn: 0.3, rise: 10, hold: 240, fade: 300, floor: 0.12, haze: 0.8, fog: 0.12, cloud: 0.2, dim: 0.84, tint: [0.66, 0.38, 0.19], tintAmt: 0.5, cast: [1.07, 0.96, 0.85], sat: 0.78, fire: 1, smoke: 1, town: 0.3 },
  civil_war: { road: 0.3, convoy: 0.6, war: 0.7, flee: 0.5, townDays: 25, fire: 0.6, smoke: 0.85, town: 0.5, warn: 0.3, rise: 6, hold: 300, fade: 300, floor: 0.15, cloud: 0.35, haze: 0.8, fog: 0.15, ash: 0.2, ashColor: GREY_ASH, dim: 0.82, tint: [0.4, 0.36, 0.33], tintAmt: 0.5, cast: [1.02, 0.96, 0.9], sat: 0.68 },
  invasion: { glow: [0.012, 0.02, 0.04], road: 0.2, convoy: 1, war: 0.8, fire: 0.3, smoke: 0.35, town: 0.3, townDays: 15, flee: 0.4, warn: 0.3, rise: 4, hold: 300, fade: 300, floor: 0.15, cloud: 0.35, haze: 0.5, dim: 0.86, tint: [0.3, 0.4, 0.56], tintAmt: 0.5, cast: [0.92, 0.99, 1.08], sat: 0.62 },
  zombies: { glow: [0.015, 0.032, 0.018], road: 0.15, flee: 0.5, war: 0.3, fire: 0.55, smoke: 0.55, town: 0.25, townDays: 7, warn: 0.3, rise: 4, hold: 300, fade: 300, floor: 0.2, cloud: 0.5, haze: 0.55, fog: 0.3, dim: 0.76, tint: [0.36, 0.42, 0.36], tintAmt: 0.5, cast: [0.95, 1.0, 0.94], sat: 0.5 },
  bioweapon: { glow: [0.02, 0.045, 0.008], road: 0.1, flee: 0.3, town: 0.25, townDays: 7, warn: 0.3, rise: 4, hold: 300, fade: 300, floor: 0.2, cloud: 0.35, haze: 0.9, fog: 0.25, dim: 0.85, tint: [0.5, 0.66, 0.2], tintAmt: 0.6, cast: [0.97, 1.09, 0.8], sat: 0.62 },
  // the disasters that darken the world for a long time
  asteroid: { glow: [0.055, 0.016, 0.01], comet: 1, road: 0.3, flee: 1, fire: 0.35, smoke: 0.5, town: 0.4, townDays: 40, warn: 0.3, rise: 1, hold: 700, fade: 400, floor: 0.2, pulse: 1, cloud: 0.85, fog: 0.4, haze: 1, ash: 0.5, ashColor: GREY_ASH, dim: 0.42, tint: [0.42, 0.26, 0.16], tintAmt: 0.7, cast: [1.04, 0.94, 0.84], sat: 0.6 },
  unknown: { glow: [0.03, 0.012, 0.055], road: 0, town: 0.5, townDays: 3, warn: 0.4, rise: 1, hold: 30, fade: 90, floor: 0.1, haze: 0.5, tint: [0.5, 0.32, 0.72], tintAmt: 0.5, cast: [1, 0.95, 1.08], sat: 0.85 },
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

/** What the far road and the town do: the lights go out with the grid and over weeks; the road empties as fuel and deliveries fail. */
export function skyline(p: Profile, days: number, tens: number, tracks: { fuel: number; deliveries: number }, townGlow: number, k: number): Pick<CollapseLook, 'townLights' | 'traffic' | 'convoy' | 'flashes' | 'aurora' | 'comet'> {
  const after = days >= 0;
  // the road: people leave through the warning (busier than peace), then it follows fuel and deliveries down to what the disaster leaves
  const svc = Math.min(clamp01(tracks.fuel), clamp01(tracks.deliveries));
  const road = after ? (p.road ?? 0.5) * (0.12 + 0.88 * svc) : 0.45 + (p.flee ?? 0.2) * Math.pow(clamp01(tens), 1.2);
  const convoy = (p.convoy ?? 0) * (after ? (0.25 + 0.75 * Math.sqrt(svc)) * Math.min(1, k * 1.5) : 0.55 * Math.pow(clamp01(tens), 1.2));
  const flashes = (p.war ?? 0) * (after ? k : 0.35 * Math.pow(clamp01(tens), 2));
  const aurora = (p.aurora ?? 0) * (after ? k : 0.5 * Math.pow(clamp01(tens), 1.2));
  const comet = after ? 0 : (p.comet ?? 0) * Math.pow(clamp01(tens), 1.3);
  return { townLights: clamp01(townGlow), traffic: clamp01(road), convoy: clamp01(convoy), flashes: clamp01(flashes), aurora: clamp01(aurora), comet: clamp01(comet) };
}

/** How far the town's lights have thinned `days` after the hit (1 = as in peace): they go over weeks, not at once, and come back as the look eases. */
export function townFade(p: Pick<Profile, 'town' | 'townDays' | 'rise' | 'hold' | 'fade' | 'floor'>, days: number, k: number, slow = 1): number {
  const floor = p.town ?? 1;
  if (days < 0) return 1 - (1 - floor) * k;
  const dd = Math.max(0.5, p.townDays ?? 20);
  const gone = days - p.rise - p.hold;
  const down = smooth(days / dd);
  const back = gone <= 0 ? 1 : 1 - smooth(gone / Math.max(1, p.fade * slow)) * (1 - p.floor);
  return 1 - (1 - floor) * down * back;
}

const SEED_AZ = new Map<number, CollapseLook['az']>();

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
  const seed = s.seed ?? 7;
  let az = SEED_AZ.get(seed);
  if (!az) { if (SEED_AZ.size > 16) SEED_AZ.clear(); az = skylineAz(seed); SEED_AZ.set(seed, az); }
  // (the town appears on the skyline over the first days of the warning, then is the thing that fails)
  const appear = smooth((t - d.warnAt) / 3);
  // nuclear: the sky is sim/nuclear.ts's (flash, haze, dust); the grade and the tint come from the haze
  if (kind === 'nuclear') {
    const n = after && s.site ? nuclearSky(s as GameState) : { haze: 0, flash: 0, dust: 0 };
    const w = clamp01(n.haze);
    const tens = clamp01(tension(d, t));
    const warn = after ? 0 : 0.25 * Math.pow(tens, 1.5);
    const k = Math.max(w, warn);
    const np: Profile = { warn: 0, rise: 0, hold: 0, fade: 1, floor: 0, road: 0.08, flee: 0.9, convoy: 1 };
    const sl = skyline(np, days, tens, d.tracks, dark.townGlow, k);
    // the strike's fires burn on the skyline for weeks (a full exchange: all round); lightning-like flashes from the missile fields while the world still has power
    const burn = after ? 0.55 * (1 - smooth(days / 25)) * (d.variant === 'exchange' ? 1 : 0.8) : 0;
    return {
      stage: after ? (days < 3 ? 'impact' : 'survival') : 'warning', k,
      cloud: 0.55 * n.haze, fog: 0.35 * n.haze + 0.4 * n.dust, haze: 0.9 * n.haze, ash: 0.6 * n.dust, ashColor: GREY_ASH, flash: n.flash, ashCover: 0.5 * n.dust,
      dim: 1 - 0.42 * k, skyTint: [0.6, 0.54, 0.3], skyAmt: 0.75 * k, skyNight: false,
      cast: mix(ONE, [1.07, 1.04, 0.8], k), sat: 1 - 0.42 * k, contrast: -0.04 * k, blackout,
      ...dark, fireGlow: burn, smoke: after ? 0.35 * k : 0,
      nightGlow: [0.03 * k, 0.03 * k, 0.012 * k],
      ...sl, townLights: clamp01(dark.townGlow) * appear, flashes: after ? 0.5 * clamp01(1 - days / 4) : 0,
      az: { ...az, fire: Math.PI },
    };
  }
  if (!base) return { ...NO_LOOK, stage: after ? 'impact' : 'warning', blackout, ...dark, az };
  const p = variantProfile(kind, d.variant, base);
  // a world that never comes back is slow to clear
  const slow = d.fate === 'never' ? 2 : 1;
  const tens = clamp01(tension(d, t));
  const k = envelope(p, days, tens, slow);
  const pulse = after && p.pulse ? p.pulse * clamp01(1 - days / 1.25) * clamp01(1 + days * 8) : 0;
  const stage: CollapseLook['stage'] = after ? (days < 3 ? 'impact' : 'survival') : 'warning';
  // ash and dust fall heavily for the first days, then thin to a drift
  const fall = !p.ash ? 0 : after ? p.ash * (days < 10 ? 1 - 0.6 * smooth(days / 10) : 0.4) * k : p.ash * 0.35 * k;
  const tintAmt = clamp01((p.tintAmt ?? 0) * k + 0.25 * pulse * (p.tintAmt ?? 0));
  const townGlow = dark.townGlow * townFade(p, days, k, slow);
  const sl = skyline(p, days, tens, d.tracks, townGlow, k);
  return {
    stage, k,
    cloud: (p.cloud ?? 0) * k, fog: (p.fog ?? 0) * k, haze: (p.haze ?? 0) * k,
    ash: fall, ashColor: p.ashColor ?? GREY_ASH, flash: 0,
    ashCover: p.ash && after ? Math.min(1, p.ash * 1.15) * k * smooth(days / 4) : 0,
    dim: 1 - (1 - (p.dim ?? 1)) * k - 0.3 * pulse,
    skyTint: p.tint ?? NO_LOOK.skyTint, skyAmt: tintAmt, skyNight: !!p.tintNight,
    cast: mix(ONE, p.cast ?? ONE, k), sat: 1 + ((p.sat ?? 1) - 1) * k, contrast: (p.contrast ?? 0) * k,
    blackout,
    townGlow, flicker: dark.flicker,
    fireGlow: (p.fire ?? 0) * k * (after ? 1 : 0.4), smoke: (p.smoke ?? 0) * k * (after ? 1 : 0.3), nightLift: dark.nightLift,
    nightGlow: [(p.glow?.[0] ?? 0) * k, (p.glow?.[1] ?? 0) * k, (p.glow?.[2] ?? 0) * k],
    ...sl, townLights: sl.townLights * appear, az,
  };
}

export type Season = 'spring' | 'summer' | 'fall' | 'winter';
/** The weather and season now, as the look needs them. */
export interface WeatherNow { rain: number; snow: number; season: Season }

/**
 * Rain, snow and the season act on the look: rain washes ash out of the air and off the ground and dampens the fires, smoke and gunfire;
 * snow buries the ash that lay; winter drains the warm cast, a dry summer or a fall sharpens it. Returns the same object when there is nothing to change.
 */
export function withWeather(l: CollapseLook, w: WeatherNow): CollapseLook {
  if (l.stage === 'none') return l;
  const rain = clamp01(w.rain), snow = clamp01(w.snow);
  const warm = w.season === 'winter' ? -0.04 : w.season === 'summer' ? 0.02 : w.season === 'fall' ? 0.015 : 0;
  if (rain < 0.02 && snow < 0.02 && warm === 0) return l;
  const strength = clamp01(l.k * 1.5);
  const c: RGB = [l.cast[0] + warm * strength, l.cast[1], l.cast[2] - warm * strength];
  return {
    ...l,
    ash: l.ash * (1 - 0.75 * rain), ashCover: l.ashCover * (1 - 0.55 * rain) * (1 - 0.7 * snow),
    smoke: l.smoke * (1 - 0.4 * rain), fireGlow: l.fireGlow * (1 - 0.5 * rain), flashes: l.flashes * (1 - 0.45 * rain),
    traffic: l.traffic * (1 - 0.25 * snow), cast: c,
    sat: l.sat * (1 - 0.06 * snow * strength),
  };
}
