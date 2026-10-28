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
 * A global default (the player's choice) with a per-light override. `floodlightLit` is the ONE
 * place that decides whether a light is lit: a blackout (opsec curtains; later: lights out) plugs in
 * through `blackoutNow` without touching a call site. Pure (tested).
 */
import { powered } from './gear';
import { opsecOf } from './opsec';
import { isFinished } from './construction';
import type { GameState } from './state';

export type LightMode = 'on' | 'sensor' | 'off';
export const LIGHT_MODES: readonly LightMode[] = ['on', 'sensor', 'off'];
export const LIGHT_MODE_NAME: Record<LightMode, string> = { on: 'Always on', sensor: 'Motion sensor', off: 'Off' };
/** The armory's yard floodlights (a good, not a structure) have this id. */
export const ARMORY_LIGHTS = 'armory';
/** How long a motion-sensor light stays on after the last alarm (days; ≈ 20 min). */
export const SENSOR_HOLD = 0.015;

export interface LightsState {
  /** The player's default for every light, and overrides by light id (a tower's structure id, or ARMORY_LIGHTS). */
  mode: LightMode;
  per: Record<string, LightMode>;
  /** Game time until which the sensors still count a threat as nearby. */
  alertUntil: number;
}
export const newLights = (): LightsState => ({ mode: 'sensor', per: {}, alertUntil: -1 });
export const lightsOf = (s: GameState): LightsState => (s.lights ??= newLights());

/** The mode a light runs in now. */
export const lightMode = (s: GameState, id: string): LightMode => lightsOf(s).per[id] ?? lightsOf(s).mode;

/** Lights-out discipline: a blackout turns every floodlight off whatever its mode (opsec curtains today; a fuller blackout can set this later). */
export const blackoutNow = (s: GameState): boolean => opsecOf(s).blackout;

/** A threat is near: someone at the gate, or a raid (battle.ts passes true), or the sensors tripped in the last SENSOR_HOLD. */
export const threatNearby = (s: GameState): boolean => !!s.gate.pending || s.clock.t < lightsOf(s).alertUntil;
/** Trip the sensors (a crew reaches the gate, a raid starts). */
export function raiseAlert(s: GameState): void { lightsOf(s).alertUntil = s.clock.t + SENSOR_HOLD; }

/** Is this light lit right now (power, blackout, then its mode)? The one decision every call site shares. */
export function floodlightLit(s: GameState, id: string, threat: boolean = threatNearby(s)): boolean {
  if (!powered(s) || blackoutNow(s)) return false;
  const m = lightMode(s, id);
  return m === 'on' || (m === 'sensor' && threat);
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
