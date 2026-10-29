/**
 * ValleyFog — turns the sim's fog (sim/fog.ts: a pure function of seed, day, hour and place) into what the engine draws:
 * the valley bank and the low cloud for the height-fog patch, and the overcast, mist and drizzle the weather layer shows.
 * It eases every number, so a new morning's fog rolls in rather than popping, and it never touches game state.
 *
 * What is drawn is what the mechanics use: the bank top is the sim's "fog down to N m below camp", the thickness is the
 * density that sets the sight range at the camp, and the cloud base is the sim's cloud base. Visual-only spells (the
 * weather layer's own rain, snow and storms) stay cosmetic; fog, low cloud and drizzle are the sim's.
 */
import { fogVisibilityM, type FogNow } from '../../../sim/fog';
import type { HeightFogParams } from './heightFog';
import type { WeatherOutputs } from '../weather/weatherState';

/** Where the camp stands (world Y) and the valley floor the sim measured the fog from (world Y). */
export interface FogGround { campY: number; floorY: number }

/** World units per meter's inverse: 1 unit ≈ 6 m. */
const UNIT_M = 6;

/** Per-unit extinction for a visibility in meters (Koschmieder: β = 3.912 / V, per 6 m unit). */
export const extinctionPerUnit = (visibilityM: number): number => 3.912 * UNIT_M / Math.max(10, visibilityM);

/** The target the eased state chases (everything 0 when there is no fog). */
export interface FogTarget {
  bankTopY: number; bankDensity: number; cloudBaseY: number; cloudDensity: number;
  /** 0–1 overcast the sky should show, mist in the air (global haze) and drizzle (light rain particles, damp ground). */
  overcast: number; mist: number; drizzle: number;
}

export const NO_FOG_TARGET: FogTarget = { bankTopY: 0, bankDensity: 0, cloudBaseY: 0, cloudDensity: 0, overcast: 0, mist: 0, drizzle: 0 };

/** Map one sim fog state to the drawing target. Pure: tested in valleyFog.test.ts. */
export function fogTarget(now: FogNow | null, g: FogGround): FogTarget {
  if (!now) return NO_FOG_TARGET;
  const bank = now.bankM > 0 && now.density > 0.05;
  const bankTopY = bank ? g.floorY + now.bankM / UNIT_M : 0;
  // inside the bank the sight range is the density's; a thick fog is a dense wall of white, a thin one a haze in the hollows
  const bankDensity = bank ? Math.min(0.8, extinctionPerUnit(fogVisibilityM(now.density))) : 0;
  const cloud = now.cloudBaseM < 800 && now.lowCloud > 0.1;
  const cloudBaseY = cloud ? g.campY + now.cloudBaseM / UNIT_M : 0;
  const cloudDensity = cloud ? 0.015 + 0.16 * now.lowCloud * now.lowCloud : 0;
  return {
    bankTopY, bankDensity, cloudBaseY, cloudDensity,
    overcast: Math.min(1, now.overcast * 0.92),
    mist: Math.min(1, 0.04 * now.density + 0.1 * now.drizzle),
    drizzle: now.drizzle,
  };
}

const approach = (cur: number, target: number, dt: number, tau: number): number => cur + (target - cur) * (1 - Math.exp(-Math.min(dt, 1) / tau));

export class ValleyFog {
  /** The eased state. */
  readonly cur: FogTarget = { ...NO_FOG_TARGET };
  private _time = 0;

  private _target: FogTarget = NO_FOG_TARGET;

  /** Ease toward `target`. The bank top is a place, not an amount: while the bank exists its height eases; a bank forming (or gone) fades by density at its height. */
  update(dt: number, target: FogTarget): void {
    const c = this.cur;
    this._target = target;
    this._time += dt;
    if (target.bankDensity > 1e-4) c.bankTopY = c.bankDensity > 1e-4 ? approach(c.bankTopY, target.bankTopY, dt, 6) : target.bankTopY;
    c.bankDensity = approach(c.bankDensity, target.bankDensity, dt, 4);
    if (c.bankDensity < 1e-4) c.bankDensity = 0;
    if (target.cloudDensity > 1e-4) c.cloudBaseY = c.cloudDensity > 1e-4 ? approach(c.cloudBaseY, target.cloudBaseY, dt, 6) : target.cloudBaseY;
    c.cloudDensity = approach(c.cloudDensity, target.cloudDensity, dt, 4);
    if (c.cloudDensity < 1e-4) c.cloudDensity = 0;
    c.overcast = approach(c.overcast, target.overcast, dt, 3);
    c.mist = approach(c.mist, target.mist, dt, 3);
    c.drizzle = approach(c.drizzle, target.drizzle, dt, 3);
  }

  /** Jump to the last target (QA shots: no waiting for the fog to roll in). */
  snap(): void { Object.assign(this.cur, this._target); }

  /** The height-fog parameters for the shader. `noise` by quality (0 = flat), `tint` follows the sky. */
  params(noise: number): HeightFogParams {
    const c = this.cur;
    return { bankTop: c.bankTopY, bankDensity: c.bankDensity, cloudBase: c.cloudBaseY, cloudDensity: c.cloudDensity, noise, tint: [1.1, 1.1, 1.13], time: this._time };
  }

  /**
   * Fold the sim's sky into the weather layer's outputs (in place; the weather layer re-eases its own values next frame):
   * a sim-driven overcast (cloud, cool soft light), mist in the air, and drizzle (fine rain, damp ground). Precipitation
   * spells of the weather layer's own keep their clouds. `auto`: the sim's sky; other modes keep their own but get the mist.
   */
  applyTo(wx: WeatherOutputs, auto: boolean): void {
    const c = this.cur;
    if (auto) {
      const precip = Math.min(1, (wx.rain + wx.snow + wx.storm) * 1.5);
      wx.cloud = Math.max(c.overcast, Math.min(wx.cloud, precip));
      wx.fog = Math.min(wx.fog, 0.1) + c.mist;
      wx.cumulus *= 1 - c.overcast * 0.7;
      if (c.drizzle > 0.02) { wx.rain = Math.max(wx.rain, 0.2 * c.drizzle); wx.wetness = Math.max(wx.wetness, 0.55 * c.drizzle); }
    } else {
      wx.fog = Math.min(wx.fog, 0.1) + c.mist;
      wx.cloud = Math.max(wx.cloud, c.overcast * 0.9);
    }
  }
}
