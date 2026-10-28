/**
 * Floodlight discipline (the user: floodlights are "part of a night-time suite": the compound can go
 * dark, so lights don't draw attention to the camp). Every floodlight, the armory's yard lights and
 * each tower's mast lights (sim/towers.ts), has one of three modes:
 *
 *   on      always lit at night: costs power and is seen from the road (a small OPSEC exposure)
 *   sensor  lit when a threat has been detected nearby and for a while afterwards (the gate has
 *           someone at it, a raid is on)
 *   off     never lit
 *
 * A basic motion sensor trips on ANY movement (a raider, but also a deer, a coyote, a bear walking by at
 * night: sim/wildlife.ts): it burns power and, seen from the road, draws attention. The AI sensor module
 * (good 'ai_sensor_module', one per light, needs the light powered) tells people from animals: with it the
 * light comes on only for humans.
 *
 * A global default (the player's choice) with a per-light override. `floodlightLit` is the ONE
 * place that decides whether a light is lit: a blackout (opsec curtains; later: lights out) plugs in
 * through `blackoutNow` without touching a call site. Pure (tested).
 */
import { powered } from './gear';
import { floodsOut } from './blackout';
import { isFinished } from './construction';
import type { GameState } from './state';

export type LightMode = 'on' | 'sensor' | 'off';
export const LIGHT_MODES: readonly LightMode[] = ['on', 'sensor', 'off'];
export const LIGHT_MODE_NAME: Record<LightMode, string> = { on: 'Always on', sensor: 'Motion sensor', off: 'Off' };
/** The armory's yard floodlights (a good, not a structure) have this id. */
export const ARMORY_LIGHTS = 'armory';
/** How long a motion-sensor light stays on after the last alarm (days; ≈ 20 min). */
export const SENSOR_HOLD = 0.015;

/** What set the sensors off. */
export type ThreatKind = 'human' | 'animal';
export const AI_MODULE = 'ai_sensor_module' as const;

export interface LightsState {
  /** The player's default for every light, and overrides by light id (a tower's structure id, or ARMORY_LIGHTS). */
  mode: LightMode;
  per: Record<string, LightMode>;
  /** Game time until which the sensors still count a threat as nearby. */
  alertUntil: number;
  /** Lights with an AI sensor module installed (light id → true). Save v49. */
  ai: Record<string, boolean>;
  /** Game time until which an animal near the house keeps basic sensors lit. Save v49. */
  animalUntil: number;
  /** Day indices of recent nights an animal tripped the lights (the last week; the road sees the glow). Save v49. */
  animalNights: number[];
}
export const newLights = (): LightsState => ({ mode: 'sensor', per: {}, alertUntil: -1, ai: {}, animalUntil: -1, animalNights: [] });
export const lightsOf = (s: GameState): LightsState => {
  const l = (s.lights ??= newLights());
  l.ai ??= {}; l.animalUntil ??= -1; l.animalNights ??= [];
  return l;
};

/** The mode a light runs in now. */
export const lightMode = (s: GameState, id: string): LightMode => lightsOf(s).per[id] ?? lightsOf(s).mode;

/** Lights-out discipline: a blackout turns every floodlight off whatever its mode (opsec curtains today; a fuller blackout can set this later). */
export const blackoutNow = (s: GameState): boolean => floodsOut(s);

/** A threat is near: someone at the gate, or a raid (battle.ts passes true), or the sensors tripped in the last SENSOR_HOLD. */
export const threatNearby = (s: GameState): boolean => !!s.gate.pending || s.clock.t < lightsOf(s).alertUntil;
/** Trip the sensors (a crew reaches the gate, a raid starts). */
export function raiseAlert(s: GameState): void { lightsOf(s).alertUntil = s.clock.t + SENSOR_HOLD; }

/** An animal is moving near the house now (tripped by sim/wildlife.ts; lasts SENSOR_HOLD). */
export const animalNearby = (s: GameState): boolean => s.clock.t < lightsOf(s).animalUntil;
/** Trip the basic sensors with an animal; remembers the night (the road sees a light that keeps coming on). */
export function raiseAnimalAlert(s: GameState, day: number): void {
  const l = lightsOf(s);
  l.animalUntil = Math.max(l.animalUntil, s.clock.t + SENSOR_HOLD);
  if (!l.animalNights.includes(day)) l.animalNights.push(day);
  l.animalNights = l.animalNights.filter(d => d > day - 7);
}

/** What the sensors see now: a person (always wins) or an animal, else nothing. */
export const currentThreat = (s: GameState): ThreatKind | null => threatNearby(s) ? 'human' : animalNearby(s) ? 'animal' : null;

/** Has this light an AI sensor module (and does it still have the module in stock)? */
export const hasAiSensor = (s: GameState, id: string): boolean => !!lightsOf(s).ai[id];
export const aiModulesUsed = (s: GameState): number => Object.values(lightsOf(s).ai).filter(Boolean).length;

/**
 * Is this light lit right now (power, blackout, then its mode)? The one decision every call site shares.
 * `threat`: what the sensors saw (true = a person, as raids and the gate pass it; false/null = nothing; 'animal').
 * A sensor light with an AI module ignores animals entirely; a basic one comes on for anything that moves.
 */
export function floodlightLit(s: GameState, id: string, threat: ThreatKind | boolean | null = currentThreat(s)): boolean {
  if (!powered(s) || blackoutNow(s)) return false;
  const m = lightMode(s, id);
  if (m === 'on') return true;
  if (m !== 'sensor') return false;
  const kind: ThreatKind | null = threat === true ? 'human' : threat === false ? null : threat;
  if (kind === null) return false;
  return kind === 'human' || !hasAiSensor(s, id);
}

/** Install or remove an AI sensor module on one light (the Defense tab). Returns why not, or null. */
export function setAiSensor(s: GameState, id: string, on: boolean): string | null {
  const l = lightsOf(s);
  if (!on) { delete l.ai[id]; return null; }
  if (l.ai[id]) return null;
  if (!powered(s)) return 'the module needs the light powered';
  if (((s.stock as unknown as Record<string, number>)[AI_MODULE] ?? 0) - aiModulesUsed(s) < 1) return 'no spare AI sensor module (buy one in the Shop, Defense)';
  l.ai[id] = true;
  return null;
}
/** Fit (or strip) the module on every given light, as many as there are spare modules; returns how many changed. */
export function setAllAi(s: GameState, ids: readonly string[], on: boolean): number {
  let n = 0;
  for (const id of ids) {
    if (hasAiSensor(s, id) === on) continue;
    if (setAiSensor(s, id, on) === null) n++;
  }
  return n;
}

/** A basic sensor light that animals set off: armed in sensor mode and without a module (a nuisance, and a glow the road sees). */
export const basicSensors = (s: GameState, ids: readonly string[]): number => ids.filter(id => floodlightArmed(s, id) && lightMode(s, id) === 'sensor' && !hasAiSensor(s, id)).length;
/** OPSEC: nights this week an animal tripped basic sensor lights that someone on the road could see (0–3). */
export function animalGlow(s: GameState, ids: readonly string[]): number {
  if (basicSensors(s, ids) === 0) return 0;
  const day = Math.floor(s.clock.t + 0.25);
  return Math.min(3, lightsOf(s).animalNights.filter(d => d > day - 7).length * 0.75);
}

/** Could this light ever come on (not off, power, no blackout)? Used by what the lights add to warning. */
export const floodlightArmed = (s: GameState, id: string): boolean => powered(s) && !blackoutNow(s) && lightMode(s, id) !== 'off';

/** Every light the player has: the armory's yard lights (if bought) and each finished tower with a mast. */
export function lightList(s: GameState, floodTowerIds: readonly string[]): Array<{ id: string; name: string }> {
  const out: Array<{ id: string; name: string }> = [];
  if ((s.stock.floodlights ?? 0) > 0) out.push({ id: ARMORY_LIGHTS, name: 'Yard floodlights' });
  for (const id of floodTowerIds) { const st = s.structures.find(x => x.id === id); if (st && isFinished(st)) out.push({ id, name: st.kind.replace(/_/g, ' ') }); }
  return out;
}

/** How many lights burn all night (for the OPSEC exposure: a lit compound is seen from the road). */
export function alwaysLit(s: GameState, floodTowerIds: readonly string[]): number {
  if (!powered(s) || blackoutNow(s)) return 0;
  return lightList(s, floodTowerIds).filter(l => lightMode(s, l.id) === 'on').length;
}
