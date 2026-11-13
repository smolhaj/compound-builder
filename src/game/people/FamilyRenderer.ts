/**
 * FamilyRenderer — the family as UE figures (one instanced draw): each walks
 * to the spot their sim task puts them (peopleGoals) at a walking pace in
 * real time, follows the ground, and once there sits, kneels, hammers or
 * goes indoors. At fast-forward they walk faster (the sim moves on).
 */
import type * as THREE from 'three';
import { FigureLayer, FIG_POSE, stridePhase, type FigurePose } from '../../engine/world/people/figureKit';
import type { Wear, WearSeason } from '../../engine/world/people/crowdWear';
import { wearForRole, dressForTask, roleOfPerson, seedOf, climateOfCold } from '../../engine/world/people/roleWear';
import type { Person } from '../../sim/family';
import type { PersonState } from '../../sim/state';
import { goalFor, type GoalCtx } from './peopleGoals';
import { slopePace } from '../paths/walkRoute';
import { stepToward, doorAt, isStop, type Mover } from '../paths/deckWalk';
import type { Wp } from '../paths/linkRoute';
import { gateRole, leaveGoal } from './gateWalk';
import { figureScale, type SickPose } from './sickbayPlan';

/** Walking speed (world units per real second at 1×; ≈ brisk walk scaled for the diorama). */
const WALK = 0.5;

interface Agent {
  x: number; z: number; rot: number;
  phase: number;
  placed: boolean;
  wear: Wear | null;
  /** The look as dressed for the current task (apron, gloves, vest…), and the task it was dressed for. */
  dressed: Wear | null; dressedFor: string;
  /** Head turn toward what they look at (smoothed), radians from the heading. */
  look: number;
  /** Where they were last frame (the walk cycle follows the ground covered). */
  px: number; pz: number;
  /** The way along the paths to the goal (game/paths), the goal it was found for. */
  via: Wp[];
  viaFor: { x: number; z: number } | null;
  /** The deck height when inside a tunnel or on a tunnel-bridge (game/paths/deckWalk); null on the ground. */
  y: number | null;
  /** Seconds left at a locked door (the keyholder's card and bolts). */
  wait: number;
  /** Seconds until a walker held at a fallen tunnel looks again whether the way is open. */
  retry: number;
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
  positions(): Array<{ id: string; x: number; z: number; /** Deck height when in a corridor (null: on the ground). */ y: number | null }> {
    return [...this._agents.entries()].map(([id, a]) => ({ id, x: a.x, z: a.z, y: a.y }));
  }

  update(dt: number, people: readonly Person[], states: readonly PersonState[], hour: number, clock: number, ctx: GoalCtx,
    ground: (x: number, z: number) => number, season: WearSeason, speedK: number, sick?: ReadonlyMap<string, SickPose>, cold = 0.3): void {
    this._time += dt;
    // the sim clock jumped (load, debug advance): everyone is simply where they should be
    const first = this._lastClock < 0;
    const jumped = this._lastClock >= 0 && Math.abs(clock - this._lastClock) > 0.05;
    this._lastClock = clock;
    const redress = season !== this._season;
    this._season = season;
    let n = 0;
    this.shown.clear();
    people.forEach((p, i) => {
      const st = states.find(s => s.id === p.id);
      if (!st) return;
      const role = ctx.entry && ctx.today !== undefined ? gateRole(p, st, ctx.today) : null;
      const goal = role === 'leaving' && ctx.entry ? leaveGoal(ctx.entry) : goalFor(i, p.kid, st.task, st.target, hour, ctx, clock);
      let a = this._agents.get(p.id);
      if (!a) {
        // taken in just now (not a load): they walk up the drive from the road
        const walkIn = role === 'arriving' && ctx.entry && !first && !jumped;
        a = { x: walkIn ? ctx.entry!.x : goal.x, z: walkIn ? ctx.entry!.z : goal.z, rot: 0, phase: i, placed: true, wear: null, dressed: null, dressedFor: '', look: 0, px: walkIn ? ctx.entry!.x : goal.x, pz: walkIn ? ctx.entry!.z : goal.z, via: [], viaFor: null, y: null, wait: 0, retry: 0 };
        this._agents.set(p.id, a);
      }
      if (redress || !a.wear) {
        // who they are comes from their id (deterministic: no save), what they wear from their role, the weather and the season
        const w = wearForRole(seedOf(p.id), roleOfPerson(p), { season, climate: climateOfCold(cold), female: p.body === 'f', age: p.age });
        if (!p.kid && !p.elder) w.shirt = p.shirt;
        a.wear = w; a.dressed = null;
      }
      if (!a.dressed || a.dressedFor !== st.task) { a.dressed = dressForTask(a.wear, st.task, { season, climate: climateOfCold(cold), armed: ctx.armed, kid: p.kid }); a.dressedFor = st.task; }
      this._layer.setWear(n, a.dressed);
      // in the sickbay (sickbayPlan): the patient lying on the bed, the medic at the bedside; put there, not walked there
      const bed = sick?.get(p.id);
      if (bed) {
        a.x = bed.x; a.z = bed.z; a.rot = bed.rot; a.via = []; a.viaFor = null; a.y = null; a.wait = 0;
        this._layer.setPose(n, { x: bed.x, y: bed.y, z: bed.z, rot: bed.rot, scale: bed.scale, pose: bed.pose, phase: 0, amp: 0, ...(bed.pitch ? { pitch: bed.pitch } : {}) });
        n++;
        return;
      }
      // walk toward the goal, along the paths when they lead there (round the walls, not through them), through a tunnel when the goal is on the other side of the rock
      // (a goal that changes inside a tunnel is followed once they are out of it)
      if (isStop(a.via[0])) { a.retry -= dt; if (a.retry <= 0) { a.viaFor = null; a.retry = 3; } }       // (held at a fallen tunnel: look again for the way every few seconds)
      if (ctx.via && a.y === null && (!a.viaFor || Math.hypot(a.viaFor.x - goal.x, a.viaFor.z - goal.z) > 0.3)) {
        a.viaFor = { x: goal.x, z: goal.z };
        a.via = [...ctx.via(a.x, a.z, goal.x, goal.z)];
      }
      while (a.via.length && a.via[0][3] === undefined && a.via[0][2] === undefined && Math.hypot(a.via[0][0] - a.x, a.via[0][1] - a.z) < 0.1) a.via.shift();
      const leg = a.via[0], tx = leg ? leg[0] : goal.x, tz = leg ? leg[1] : goal.z;
      const dx = tx - a.x, dz = tz - a.z, dl = Math.hypot(dx, dz), d = leg ? Math.hypot(goal.x - a.x, goal.z - a.z) : dl;
      // climbing steep ground is slow, picking down it a little slower than the flat (game/paths/walkRoute slopePace); a tunnel's deck is at its own grade
      const ahead = leg && leg[2] !== undefined && a.y !== null ? (leg[2] - a.y) / Math.max(dl, 0.2) : null;
      const pace = ahead !== null ? slopePace(ahead) : dl > 1e-6 ? slopePace((ground(a.x + dx / dl * 0.2, a.z + dz / dl * 0.2) - ground(a.x, a.z)) / 0.2) : 1;
      const v = WALK * Math.max(1, speedK) * (goal.pace ?? 1) * (p.kid ? 1.1 : 1) * (ctx.footing ? ctx.footing(a.x, a.z) : 1) * pace;
      let moving = false;
      if (a.wait > 0) { a.wait = Math.max(0, a.wait - dt * Math.max(1, speedK)); if (a.wait === 0 && leg) { a.via.shift(); } }
      else if (d > 0.02 || (leg && a.via.length)) {
        if ((d > 25 && !a.via.length && !role) || (jumped && !isStop(leg))) { a.x = goal.x; a.z = goal.z; a.via = []; a.y = null; }          // far: just be there (fast-forward / load)
        else if (dl > 1e-6 || (leg && leg[2] !== undefined)) {
          const me: Mover = a;
          const st = stepToward(me, leg ?? [goal.x, goal.z], v * dt, ground);
          moving = st.moved > 1e-6;
          // the door at a portal: open by day it is walked through; locked (dusk to dawn, the alarm) it costs the keyholder a few seconds
          const door = leg && st.arrived ? doorAt(leg) : null;
          if (door && ctx.doorWait) { const w = ctx.doorWait(leg[3]!, a.x, a.z); if (w > 0) a.wait = w; }
          if (leg && st.arrived && !a.wait && !isStop(leg) && (leg[3] !== undefined || leg[2] !== undefined || a.via.length > 1)) a.via.shift();
        }
        if (dl > 1e-6) {
          const want = Math.atan2(dx, dz);
          let dr = want - a.rot;
          dr = Math.atan2(Math.sin(dr), Math.cos(dr));
          a.rot += dr * Math.min(1, dt * 10);
        }
      } else if (goal.face !== null) {
        let dr = goal.face - a.rot;
        dr = Math.atan2(Math.sin(dr), Math.cos(dr));
        a.rot += dr * Math.min(1, dt * 6);
      }
      if (!moving && goal.hidden) return;     // indoors
      this.shown.add(p.id);
      // the walk cycle follows the ground covered (the planted foot does not slide)
      const fsc = figureScale(p);
      a.phase = (a.phase + (moving ? stridePhase(Math.hypot(a.x - a.px, a.z - a.pz), fsc, 0.5) : 0)) % 6283.19;
      // at work: hammer (reach / stand) on a beat, or kneel
      let pose = moving ? goal.walkPose ?? FIG_POSE.STAND : goal.pose;
      if (!moving && goal.work && goal.pose === FIG_POSE.REACH) pose = Math.sin(this._time * 6 + i * 1.7) > 0 ? FIG_POSE.REACH : FIG_POSE.STAND;
      // head: toward the nearest other person within a few steps when standing; the slope under the feet along the heading
      let lookT = 0;
      if (!moving) {
        let best = 1.6;
        for (const [oid, o] of this._agents) {
          if (oid === p.id || !this.shown.has(oid)) continue;
          const d = Math.hypot(o.x - a.x, o.z - a.z);
          if (d < best) { best = d; const br = Math.atan2(o.x - a.x, o.z - a.z) - a.rot; lookT = Math.atan2(Math.sin(br), Math.cos(br)); }
        }
        if (Math.abs(lookT) > 1.1) lookT = 0;
      }
      a.look += (lookT - a.look) * Math.min(1, dt * 3);
      const slope = a.y === null ? (ground(a.x + Math.sin(a.rot) * 0.1, a.z + Math.cos(a.rot) * 0.1) - ground(a.x - Math.sin(a.rot) * 0.1, a.z - Math.cos(a.rot) * 0.1)) / 0.2 : 0;
      const fp: FigurePose = {
        look: a.look, slope,
        x: a.x, y: (a.y ?? ground(a.x, a.z)) + (a.y === null && (!moving || d < 0.3) ? goal.y ?? 0 : 0), z: a.z, rot: a.rot,
        scale: figureScale(p),
        pose, phase: a.phase, amp: moving ? 0.5 : 0,
        tool: goal.tool ?? 0,
      };
      a.px = a.x; a.pz = a.z;
      this._layer.setPose(n, fp);
      n++;
    });
    this._layer.commit(n, true);
  }

  dispose(): void { this._layer.dispose(); }
}
