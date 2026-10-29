/**
 * FamilyRenderer — the family as UE figures (one instanced draw): each walks
 * to the spot their sim task puts them (peopleGoals) at a walking pace in
 * real time, follows the ground, and once there sits, kneels, hammers or
 * goes indoors. At fast-forward they walk faster (the sim moves on).
 */
import type * as THREE from 'three';
import { FigureLayer, FIG_POSE, type FigurePose } from '../../engine/world/people/figureKit';
import { pickPersonaWear, type Wear, type WearSeason } from '../../engine/world/people/crowdWear';
import type { Person } from '../../sim/family';
import type { PersonState } from '../../sim/state';
import { goalFor, type GoalCtx } from './peopleGoals';

/** Walking speed (world units per real second at 1×; ≈ brisk walk scaled for the diorama). */
const WALK = 0.5;

interface Agent {
  x: number; z: number; rot: number;
  phase: number;
  placed: boolean;
  wear: Wear | null;
  /** The way along the paths to the goal (game/paths), the goal it was found for. */
  via: Array<readonly [number, number]>;
  viaFor: { x: number; z: number } | null;
}

function hashRnd(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}

export class FamilyRenderer {
  private readonly _layer: FigureLayer;
  private readonly _agents = new Map<string, Agent>();
  private _season: WearSeason | null = null;
  private _time = 0;
  private _lastClock = -1;

  constructor(scene: THREE.Scene) {
    this._layer = new FigureLayer(scene, 16, 'family');
  }

  /** Ids of the people drawn outdoors this frame (not hidden indoors / asleep). */
  readonly shown = new Set<string>();

  /** Where someone stands and which way they face (null: never placed). */
  poseOf(id: string): { x: number; z: number; rot: number } | null {
    const a = this._agents.get(id);
    return a ? { x: a.x, z: a.z, rot: a.rot } : null;
  }

  /** World positions of the visible people (QA / camera). */
  positions(): Array<{ id: string; x: number; z: number }> {
    return [...this._agents.entries()].map(([id, a]) => ({ id, x: a.x, z: a.z }));
  }

  update(dt: number, people: readonly Person[], states: readonly PersonState[], hour: number, clock: number, ctx: GoalCtx,
    ground: (x: number, z: number) => number, season: WearSeason, speedK: number): void {
    this._time += dt;
    // the sim clock jumped (load, debug advance): everyone is simply where they should be
    const jumped = this._lastClock >= 0 && Math.abs(clock - this._lastClock) > 0.05;
    this._lastClock = clock;
    const redress = season !== this._season;
    this._season = season;
    let n = 0;
    this.shown.clear();
    people.forEach((p, i) => {
      const st = states.find(s => s.id === p.id);
      if (!st) return;
      const goal = goalFor(i, p.kid, st.task, st.target, hour, ctx, clock);
      let a = this._agents.get(p.id);
      if (!a) {
        a = { x: goal.x, z: goal.z, rot: 0, phase: i, placed: true, wear: null, via: [], viaFor: null };
        this._agents.set(p.id, a);
      }
      if (redress || !a.wear) {
        const persona = p.kid ? 'kid' : 'resident';
        const keep = a.wear ? { skin: a.wear.skin, hair: a.wear.hair, longHair: a.wear.longHair, pack: a.wear.pack } : undefined;
        const w = pickPersonaWear(hashRnd(p.id.charCodeAt(1) * 7919 + (p.body === 'f' ? 1 : 2)), persona, { season, team: null }, keep);
        w.hasPack = false;
        w.longHair = keep?.longHair ?? p.body === 'f';
        if (!p.kid) { w.shirt = p.shirt; w.pants = season === 'summer' ? 0x4a5a7a : 0x3b4a66; w.shorts = false; }
        a.wear = w;
        this._layer.setWear(n, w);
      }
      // walk toward the goal, along the paths when they lead there (round the walls, not through them)
      if (ctx.via && (!a.viaFor || Math.hypot(a.viaFor.x - goal.x, a.viaFor.z - goal.z) > 0.3)) {
        a.viaFor = { x: goal.x, z: goal.z };
        a.via = Math.hypot(goal.x - a.x, goal.z - a.z) > 25 ? [] : [...ctx.via(a.x, a.z, goal.x, goal.z)];
      }
      while (a.via.length && Math.hypot(a.via[0][0] - a.x, a.via[0][1] - a.z) < 0.1) a.via.shift();
      const leg = a.via[0], tx = leg ? leg[0] : goal.x, tz = leg ? leg[1] : goal.z;
      const dx = tx - a.x, dz = tz - a.z, dl = Math.hypot(dx, dz), d = leg ? Math.hypot(goal.x - a.x, goal.z - a.z) : dl;
      const v = WALK * Math.max(1, speedK) * (p.kid ? 1.1 : 1) * (ctx.footing ? ctx.footing(a.x, a.z) : 1);
      let moving = false;
      if (d > 0.02) {
        const stepLen = Math.min(dl, v * dt);
        if (d > 25 || jumped) { a.x = goal.x; a.z = goal.z; a.via = []; }          // far: just be there (fast-forward / load)
        else if (dl > 1e-6) { a.x += dx / dl * stepLen; a.z += dz / dl * stepLen; moving = true; }
        const want = Math.atan2(dx, dz);
        let dr = want - a.rot;
        dr = Math.atan2(Math.sin(dr), Math.cos(dr));
        a.rot += dr * Math.min(1, dt * 10);
      } else if (goal.face !== null) {
        let dr = goal.face - a.rot;
        dr = Math.atan2(Math.sin(dr), Math.cos(dr));
        a.rot += dr * Math.min(1, dt * 6);
      }
      if (!moving && goal.hidden) return;     // indoors
      this.shown.add(p.id);
      a.phase += dt * (moving ? 9 * Math.min(2.5, Math.max(1, speedK)) : 0);
      // at work: hammer (reach / stand) on a beat, or kneel
      let pose = moving ? goal.walkPose ?? FIG_POSE.STAND : goal.pose;
      if (!moving && goal.work && goal.pose === FIG_POSE.REACH) pose = Math.sin(this._time * 6 + i * 1.7) > 0 ? FIG_POSE.REACH : FIG_POSE.STAND;
      const fp: FigurePose = {
        x: a.x, y: ground(a.x, a.z) + (!moving || d < 0.3 ? goal.y ?? 0 : 0), z: a.z, rot: a.rot,
        scale: p.kid ? (p.age < 3 ? 0.42 : p.age < 8 ? 0.62 : p.age < 13 ? 0.78 : 0.92) : 1,
        pose, phase: a.phase, amp: moving ? 0.5 : 0,
        tool: goal.tool ?? 0,
      };
      // the wear slot must follow the draw slot
      if (!redress && a.wear) this._layer.setWear(n, a.wear);
      this._layer.setPose(n, fp);
      n++;
    });
    this._layer.commit(n, true);
  }

  dispose(): void { this._layer.dispose(); }
}
