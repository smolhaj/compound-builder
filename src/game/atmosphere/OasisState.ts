/**
 * The live oasis state (one per world): the smoothed home safety level, where the camera stands relative to the held walls, and the
 * collapse progress, ready for WorldScene.setOasis. The sim reads (postureOf walks the property line) run about once a second; the smoothing
 * and the inside blend run every frame. Other layers read `homeSafetyNow()` for the same level this draws with.
 *
 * QA: `qa.oasis = { collapse?, safety?, inside?, snap? }` forces any of the three numbers (and `snap` skips the smoothing).
 */
import type { GameState } from '../../sim/state';
import { homeSafety, homeSafetyInput, type HomeSafety, type RaidState } from './homeSafety';
import { compoundPolygons, insideness, rectRing, samplePoint } from './compoundRegion';
import { enclosure } from '../../sim/enclosure';
import { follow } from '../../engine/world/post/oasisGrade';
import type { Pt } from '../../sim/perimeter';

export interface OasisQa { collapse?: number; safety?: number; inside?: number; snap?: boolean }

export interface OasisOut { collapse: number; safety: number; inside: number }

let live: HomeSafety = { level: 1, target: 1, reasons: [] };
/** The level and reasons the world is drawn with right now (1 and none before the first frame). */
export const homeSafetyNow = (): HomeSafety => live;

export class OasisState {
  private _level = 1;
  private _inside = 0;
  private _collapse = 0;
  private _polys: Pt[][] = [];
  private _input: ReturnType<typeof homeSafetyInput> | null = null;
  private _since = 99;
  private _first = true;
  qa: OasisQa | null = null;

  update(dt: number, game: GameState, cam: { x: number; y: number; z: number }, target: { x: number; z: number }, groundY: number, raid: RaidState): OasisOut {
    this._since += dt;
    if (this._since >= 1 || !this._input || this._first) {
      this._since = 0;
      this._input = homeSafetyInput(game, { raid });
      this._collapse = this._input.collapse;
      this._polys = compoundPolygons(game.perimeter);
      // a property line that holds all round (no single closed run) is a held compound too
      if (!this._polys.length && this._collapse > 0 && enclosure(game).openShare < 0.02) this._polys = [rectRing(game.site.home)];
    } else this._input.raid = raid;
    const q = this.qa;
    const snap = this._first || !!q?.snap;
    const r = homeSafety({ ...this._input, prev: snap ? undefined : this._level, dt });
    this._level = r.level;
    live = r;
    const p = samplePoint(cam, target, groundY);
    const insideNow = insideness(this._polys, p.x, p.z);
    this._inside = snap ? insideNow : follow(this._inside, insideNow, dt, 0.35);
    this._first = false;
    return {
      collapse: q?.collapse ?? this._collapse,
      safety: q?.safety ?? this._level,
      inside: q?.inside ?? this._inside,
    };
  }
}
