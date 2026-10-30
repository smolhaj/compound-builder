/**
 * Polytunnels and high tunnels (docs/DECISIONS.md, "Tunnels and aquaponics"): season extension without glass. They join the greenhouse
 * tiers (sim/greenhouse.ts: the garden starts earlier and runs later, a higher peak, winter greens), cost a fraction of glass, and pay for it:
 *
 *  Polytunnel  6 x 12 m hoops, one layer of poly: 21 days each end, peak +6 %, 250 kcal a day of winter greens under row cover.
 *  High tunnel 9 x 30 m gothic frame, roll-up sides, inflated double layer: 35 days each end (the extension-service figure of
 *              three to five weeks), peak +12 %, 520 kcal a day of cold-hardy greens (spinach, kale, claytonia).
 *  Water       drip line: 120 L a day (poly) / 420 L (high) in the growing months, drawn from the pond first (sim/utilities.ts).
 *  The film    6 mil poly lasts four years in the sun; after that it chalks and lets less light in (10 % a year, to half), and
 *              a re-cover job is queued for it. Wind and a snow load tear it (a repair job: patch it, or re-cover the hoops).
 *  Wind        a windstorm, derecho or tornado tears the film on a tunnel with odds that grow with the ground's exposure
 *              (sim/renewables.ts windExposure squared: a tunnel on the knoll goes first; a windbreak halves it).
 *  Snow        a blizzard loads the hoops: an unheated tunnel in a cold region is the one that collapses (high tunnels
 *              shed snow badly unless somebody knocks it off, the greenhouse chore).
 *  Pests       whitefly, aphids and botrytis thrive in warm damp air under film: a year-seeded outbreak takes up to a fifth of
 *              the greens; a tunnel whose vents and sides are tended (the greenhouse chore under 40) loses half as much.
 * Pure (tested).
 */
import { calendarOf, type GameState, type Structure } from './state';
import { isFinished } from './construction';
import { mulberry32 } from './rng';
import { regionFor } from './climate';
import { windExposure } from './renewables';
import { windbreakNear } from './microclimate';
import { crackFilm, pendingFixes } from './improvements';

export const TUNNEL_KINDS = ['polytunnel', 'high_tunnel'] as const;
export const isTunnel = (kind: string): boolean => (TUNNEL_KINDS as readonly string[]).includes(kind);

export const TUNNEL = {
  polytunnel: { name: 'Polytunnel', extend: 21, peak: 1.06, kcal: 250, waterLpd: 120, snow: 0.5 },
  high_tunnel: { name: 'High tunnel', extend: 35, peak: 1.12, kcal: 520, waterLpd: 420, snow: 1 },
} as const;

/** Years the film lasts, the yield it loses a year after that, and the least it keeps. */
export const FILM_YEARS = 4, FILM_FADE = 0.1, FILM_FLOOR = 0.5;

/** Years since the poly went on (the build, or the last re-cover). */
export const filmYears = (s: GameState, st: Structure): number => Math.max(0, (s.clock.t - (st.filmAt ?? st.finishedAt ?? 0)) / 365);
/** Light through the film: 1 while it is young, fading with age. */
export const filmLight = (s: GameState, st: Structure): number => Math.max(FILM_FLOOR, 1 - FILM_FADE * Math.max(0, filmYears(s, st) - FILM_YEARS));

/** Litres a day the drip lines draw in the growing months (day 100 to 290). */
export function tunnelWaterL(s: GameState): number {
  const doy = calendarOf(s.clock).doy;
  if (doy < 100 || doy > 290) return 0;
  return s.structures.reduce((a, st) => a + (isFinished(st) && isTunnel(st.kind) ? TUNNEL[st.kind as 'polytunnel'].waterLpd : 0), 0);
}

/** The year's outbreak under the film: 0 (a clean year) to 0.2 of the greens, seeded by the game and the year; damp regions get more of them. */
export function tunnelPestLoss(s: GameState, year = calendarOf(s.clock).year): { loss: number; name: string } {
  const r = mulberry32(s.seed * 6007 + year * 131 + 17);
  const damp = Math.min(1, regionFor(s.site).rainMm / 1100);
  const hit = r() < 0.3 + 0.3 * damp, sev = 0.06 + 0.14 * r();
  const names = ['whitefly', 'aphids', 'botrytis (grey mould)', 'leaf miner'];
  return { loss: hit ? sev : 0, name: names[Math.floor(r() * names.length) % names.length] };
}
/** What the outbreak costs this tunnel: halved when the vents and sides are tended. */
export function tunnelPestK(s: GameState, careLevel: number): number {
  return 1 - tunnelPestLoss(s).loss * (careLevel < 40 ? 0.5 : 1);
}

/** Chance that today's storm tears the film on this tunnel. */
export function tearChance(s: GameState, st: Structure, storm: string): number {
  const def = TUNNEL[st.kind as 'polytunnel'];
  if (!def) return 0;
  const cold = regionFor(s.site).cold;
  const w = windExposure(s, st.x, st.z), shelter = windbreakNear(s, st) ? 0.5 : 1;
  if (storm === 'windstorm' || storm === 'derecho') return Math.min(0.9, 0.3 * w * w * shelter * (storm === 'derecho' ? 1.6 : 1));
  if (storm === 'tornado') return Math.min(0.95, 0.6 * w * w * shelter);
  if (storm === 'hurricane_remnants') return Math.min(0.8, 0.2 * w * w * shelter);
  if (storm === 'blizzard') return Math.min(0.8, 0.3 * def.snow * Math.max(0.3, cold));
  return 0;
}

/** The storm's first day: each tunnel may be torn (a patch job) or, in the worst of it, stripped (a re-cover). Returns the log lines. */
export function tunnelStorm(s: GameState, storm: string, r: () => number, out: string[]): void {
  for (const st of s.structures) {
    if (!isFinished(st) || !isTunnel(st.kind)) continue;
    const p = tearChance(s, st, storm);
    if (p <= 0 || r() >= p) continue;
    const bad = r() < 0.35;
    const name = TUNNEL[st.kind as 'polytunnel'].name.toLowerCase();
    if (crackFilm(st, bad ? 'poor' : 'fair')) out.push(storm === 'blizzard'
      ? `The snow load ${bad ? 'bent the hoops and split the film' : 'split the film'} on the ${name}. ${bad ? 'Re-cover the hoops' : 'Patch the poly'} (Projects); it grows less until it is mended.`
      : `The wind ${bad ? 'stripped the film off' : 'tore the film on'} the ${name}. ${bad ? 'Re-cover the hoops' : 'Patch the poly'} (Projects); it grows less until it is mended.`);
  }
}

/** Once a day: film that has seen its four years is queued for a re-cover (the job the family does on a calm day). */
export function tunnelDay(s: GameState): string[] {
  const out: string[] = [];
  for (const st of s.structures) {
    if (!isFinished(st) || !isTunnel(st.kind)) continue;
    if (filmYears(s, st) >= FILM_YEARS && !pendingFixes(st).some(f => f.part === 'film')) {
      if (crackFilm(st, 'poor')) { out.push(`The poly on the ${TUNNEL[st.kind as 'polytunnel'].name.toLowerCase()} is four years old and chalking. A re-cover job (3 rolls of film) is in Projects.`); }
    }
  }
  return out;
}

/** Plain words for a tunnel's card. */
export function tunnelNote(s: GameState, st: Structure): string {
  const age = filmYears(s, st);
  return age >= FILM_YEARS ? `Film ${age.toFixed(1)} years old: chalky, ${Math.round((1 - filmLight(s, st)) * 100)} % less light.` : `Film ${age.toFixed(1)} years old; good for ${(FILM_YEARS - age).toFixed(1)} more.`;
}
