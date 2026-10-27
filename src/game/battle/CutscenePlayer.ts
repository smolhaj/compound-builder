/**
 * Plays a staged raid (sim/siege.ts plan + one Battle per scene): walks the
 * timeline, starts each scene's fight on the battle renderer, runs the camera
 * operator, and publishes the clock and captions for the overlay. It never touches
 * the sim: when the timeline is done it asks the store to commit (the clock
 * advances once, by the plan's length).
 */
import { useBattleStore } from '../../store/battleStore';
import { useCutsceneView } from '../../store/cutsceneStore';
import type { CutsceneState } from '../../store/gameStore';
import { hourAfter, locate, sceneCaption, sceneWindow } from '../../sim/siege';
import { Director, poseAt, type V3 } from './director';
import type { BattleRenderer } from './BattleRenderer';

export interface PlayerDeps {
  battle: BattleRenderer;
  ground: (x: number, z: number) => number;
  /** The home, where the family wakes. */
  house: () => V3;
  commit: () => void;
  seed: number;
}

export class CutscenePlayer {
  active = false;
  private _c: CutsceneState | null = null;
  private _real = 0;
  private _seen = false;
  private _startedScene = -1;
  private _dir: Director;
  private _road = { x: 0, z: 1 };
  private _view = 0;
  private _done = false;
  private _lastKind = '';
  /** Wall-clock seconds the player has run (the camera operator's time base). */
  private _time = 0;
  /** Game seconds since the arrival, for the sky and the clock while the scenes play. */
  clockGame = 0;

  private readonly d: PlayerDeps;
  constructor(d: PlayerDeps) { this.d = d; this._dir = new Director(d.seed); }

  start(c: CutsceneState): void {
    this._c = c;
    this.clockGame = 0;
    this._real = 0; this._startedScene = -1; this._done = false; this._time = 0; this._lastKind = '';
    this._dir = new Director(this.d.seed);
    this.active = true;
    this._publish(true);
  }

  stop(): void {
    if (this.active && useBattleStore.getState().battle) useBattleStore.getState().endBattle();
    this.active = false; this._c = null;
    useCutsceneView.getState().set(null);
  }

  skipScene(): void {
    const c = this._c; if (!c?.plan || this._done) return;
    const loc = locate(c.plan, this._real);
    this._endBattle();
    this._real = sceneWindow(c.plan, loc.segment.scene).end + 1e-6;
  }

  skipAll(): void {
    const c = this._c; if (!c?.plan || this._done) return;
    this._endBattle();
    this._real = c.plan.totalReal + 1;
  }

  private _endBattle(): void {
    if (useBattleStore.getState().battle) useBattleStore.getState().endBattle();
  }

  /** Advance by dt; returns the camera pose to use this frame. */
  update(dt: number): { eye: V3; look: V3; fov: number } | null {
    const c = this._c;
    if (!c?.plan || !c.battles) return null;
    const plan = c.plan;
    this._time += dt;
    const { battle, ground } = this.d;
    let loc = locate(plan, this._real);
    const seg = loc.segment;
    // the fight is driven by the renderer's own clock, so the picture and the timeline agree
    if (!loc.done && seg.kind === 'fight') {
      if (this._startedScene !== seg.scene) {
        this._startedScene = seg.scene; this._seen = false;
        useBattleStore.getState().playBattle(c.battles[seg.scene]);
      }
      if (battle.playing) this._seen = true;
      const bt = battle.playing ? battle.time : this._seen ? seg.realLen : 0;
      this._real = Math.max(this._real, seg.real0 + Math.min(seg.realLen, bt));
      if ((this._seen && !battle.playing) || bt >= seg.realLen) this._real = Math.max(this._real, seg.real0 + seg.realLen + 1e-6);
    } else {
      if (!loc.done) this._real += dt;
    }
    loc = locate(plan, this._real);
    this.clockGame = loc.game;
    // a fight ends with its tail (bodies stay down, the alarm dies); the next scene starts clean
    if (loc.segment.scene !== seg.scene || loc.done) this._endBattle();
    if (loc.done) {
      if (!this._done) { this._done = true; this._publish(true); this.d.commit(); }
      return null;
    }
    // camera
    const house = this.d.house();
    const b = c.battles[loc.segment.scene];
    const raiders = b.units.filter(u => u.side === 'raider');
    if (raiders.length) {
      const rx = raiders.reduce((a, u) => a + u.x, 0) / raiders.length - house.x, rz = raiders.reduce((a, u) => a + u.z, 0) / raiders.length - house.z, l = Math.hypot(rx, rz) || 1;
      this._road = { x: rx / l, z: rz / l };
    }
    let shot;
    if (battle.playing) {
      shot = this._dir.update(this._time, battle.actors(), battle.drainEvents(), house, ground);
    } else {
      if (this._lastKind !== `est${loc.segment.scene}`) { this._dir.establish(this._time, house, this._road, ground); this._lastKind = `est${loc.segment.scene}`; }
      shot = this._dir.shot!;
    }
    this._publish(false);
    return poseAt(shot, this._time);
  }

  private _publish(force: boolean): void {
    const c = this._c; if (!c?.plan) return;
    this._view += 1;
    if (!force && this._view % 6 !== 0) return;
    const plan = c.plan, loc = locate(plan, this._real), sc = plan.scenes[loc.segment.scene];
    const kind = loc.segment.kind;
    const part = kind === 'gap' ? 'gap' : kind === 'tail' ? 'tail' : 'lead';
    const caption = kind === 'fight' ? '' : sceneCaption(plan, sc, part, this.d.seed);
    useCutsceneView.getState().set({
      scene: sc.index, scenes: plan.scenes.length, sceneLabel: sc.label, seg: kind,
      hour: hourAfter(plan, loc.game), game: loc.game, caption,
      gap: kind === 'gap' ? sceneCaption(plan, sc, 'gap', this.d.seed) : null,
      progress: Math.min(1, this._real / Math.max(1, plan.totalReal)),
    });
  }
}

