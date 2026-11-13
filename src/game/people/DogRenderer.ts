/**
 * DogRenderer — the family's dogs as modelled procedural quadrupeds (docs/DECISIONS.md, "Realistic wildlife and dogs"): one skinned model per breed
 * (game/wildlife/models/dogs: lab, shepherd, hound, collie, terrier, mutt; lofted body, digitigrade legs, drop / pricked / folded ears, the breed's tail, three
 * coats painted in the shader), about 0.1 tall at the shoulder (SCALE v2: a person is 0.28), one InstancedMesh per breed in use and level of detail. Where they
 * are and what they do comes from dogGoals (follow the bonded person, sleep by the house, stand the post at the gate, bark); here they walk there, trot with the
 * feet advancing by distance, sit, lie, stand alert, bark and wag. No shadow-map casters, no SSAO (perf rule).
 */
import * as THREE from 'three';
import { ageYears, livingDogs, type Dog } from '../../sim/pets';
import { AnimalBatches } from '../livestock/animalBatches';
import { UNIT } from '../livestock/LivestockRenderer';
import { dogModelId } from '../wildlife/models/dogs';
import { wildModelOf } from '../wildlife/wildModels';
import { dayIndex, type GameState } from '../../sim/state';
import type { Quality } from '../livestock/LivestockRenderer';
import { dogGoal, type DogCtx, type Stance } from './dogGoals';
import { stepToward, isStop, type Mover } from '../paths/deckWalk';
import type { Wp } from '../paths/linkRoute';

const CAP = 24;
/** Dog speeds (world units per real second at 1x). A dog trots faster than a person walks. */
const TROT = 0.8, RUN = 1.6;

interface Agent {
  x: number; z: number; rot: number; phase: number; stance: Stance; placed: boolean;
  lie: number; sit: number; up: number; bark: number; moving: boolean; dist?: number;
  via?: Wp[]; viaFor?: { x: number; z: number };
  /** Deck height inside a tunnel or on a tunnel-bridge (null: on the ground). */
  y?: number | null;
  wait?: number;
  retry?: number;
}

export interface PreviewDog { dog: Dog; x: number; z: number; rot: number; stance: Stance; moving?: boolean; phase?: number; up?: number }

export class DogRenderer {
  private readonly _batches: AnimalBatches;
  private readonly _agents = new Map<string, Agent>();
  private _time = 0;
  private _lastClock = -1;
  private _drawn: Array<{ id: string; y: number; scale: number; breed: string }> = [];
  private _cam: { x: number; y: number; z: number } | null = null;

  constructor(scene: THREE.Scene) { this._batches = new AnimalBatches(scene, CAP, 'dogs', wildModelOf); }

  /** The draw detail tier. */
  setQuality(q: Quality): void { this._batches.setQuality(q); }
  /** Where the camera is (for the level of detail). */
  setCamera(x: number, y: number, z: number): void { this._cam = { x, y, z }; }

  /** Where a dog stands (QA / camera / the barn). */
  poseOf(id: string): { x: number; z: number; rot: number; stance: Stance } | null {
    const a = this._agents.get(id);
    return a ? { x: a.x, z: a.z, rot: a.rot, stance: a.stance } : null;
  }
  positions(): Array<{ id: string; x: number; z: number; y: number | null }> { return [...this._agents.entries()].map(([id, a]) => ({ id, x: a.x, z: a.z, y: a.y ?? null })); }

  update(dt: number, game: GameState, hour: number, clock: number, ctx: DogCtx, ground: (x: number, z: number) => number, speedK: number): void {
    this._time += dt;
    const jumped = this._lastClock >= 0 && Math.abs(clock - this._lastClock) > 0.05;
    this._lastClock = clock;
    const day = dayIndex(game.clock.t);
    const dogs = livingDogs(game).slice(0, CAP);
    const live = new Set(dogs.map(d => d.id));
    for (const k of [...this._agents.keys()]) if (!live.has(k)) this._agents.delete(k);
    const guards = dogs.filter(d => d.guard && ageYears(d, day) >= 0.5);
    this._batches.begin(); this._drawn = [];
    dogs.forEach((d, i) => {
      const idx = d.guard ? guards.indexOf(d) : i;
      const goal = dogGoal(d, Math.max(0, idx), hour, day, ctx, clock);
      let a = this._agents.get(d.id);
      if (!a) { a = { x: goal.x, z: goal.z, rot: goal.face ?? 0, phase: i * 1.3, stance: goal.stance, placed: true, lie: goal.stance === 'lie' ? 1 : 0, sit: 0, up: 0, bark: 0, moving: false }; this._agents.set(d.id, a); }
      // walk to the goal, round whatever is in the way (the same route finding as the people)
      if (!a.via) a.via = [];
      if (a.y === undefined) a.y = null;
      if (isStop(a.via[0])) { a.retry = (a.retry ?? 0) - dt; if (a.retry <= 0) { a.viaFor = undefined; a.retry = 3; } }
      if (ctx.via && a.y === null && (!a.viaFor || Math.hypot(a.viaFor.x - goal.x, a.viaFor.z - goal.z) > 0.5)) {
        a.viaFor = { x: goal.x, z: goal.z };
        a.via = [...ctx.via(a.x, a.z, goal.x, goal.z)];
      }
      while (a.via!.length && a.via[0][2] === undefined && a.via[0][3] === undefined && Math.hypot(a.via[0][0] - a.x, a.via[0][1] - a.z) < 0.12) a.via!.shift();
      const leg = a.via![0], gx = leg ? leg[0] : goal.x, gz = leg ? leg[1] : goal.z;
      const dx = gx - a.x, dz = gz - a.z, dist = leg ? Math.hypot(goal.x - a.x, goal.z - a.z) : Math.hypot(dx, dz), legD = Math.hypot(dx, dz);
      let moving = false;
      const px0 = a.x, pz0 = a.z;
      const tol = goal.follow ? 0.1 : 0.04;
      if ((a.wait ?? 0) > 0) { a.wait = Math.max(0, a.wait! - dt * Math.max(1, speedK)); if (a.wait === 0) a.via!.shift(); }
      else if (dist > tol || (leg && a.via!.length > 1)) {
        if ((dist > 30 && !a.via!.length) || jumped) { a.x = goal.x; a.z = goal.z; a.via = []; a.y = null; }
        else {
          const v = (dist > 0.5 ? RUN : TROT) * Math.max(1, Math.min(3, speedK)) * (goal.follow ? 1.25 : 1);
          if (leg && (leg[2] !== undefined || leg[3] !== undefined || a.y !== null)) {
            // through a tunnel: along the deck, a dog with its person's key waits at a locked door
            const st = stepToward(a as Mover, leg, v * dt, ground);
            moving = st.moved > 1e-6;
            if (st.arrived && !isStop(leg)) {
              if (leg[3] && ctx.doorWait) { const w = ctx.doorWait(leg[3], a.x, a.z); if (w > 0) a.wait = w; }
              if (!a.wait) a.via!.shift();
            }
          } else {
            const step = Math.min(Math.max(legD - tol * 0.5, 0.001), v * dt);
            a.x += dx / (legD || 1) * step; a.z += dz / (legD || 1) * step; moving = true;
          }
          const want = Math.atan2(dx, dz);
          a.rot += Math.atan2(Math.sin(want - a.rot), Math.cos(want - a.rot)) * Math.min(1, dt * 9);
        }
      } else if (goal.face !== null) {
        a.rot += Math.atan2(Math.sin(goal.face - a.rot), Math.cos(goal.face - a.rot)) * Math.min(1, dt * 4);
      }
      // frisky dogs (puppies) dash about
      const stance: Stance = moving ? 'stand' : goal.stance;
      a.stance = stance;
      const k = Math.min(1, dt * 5);
      a.lie += ((stance === 'lie' ? 1 : 0) - a.lie) * k;
      a.sit += ((stance === 'sit' ? 1 : 0) - a.sit) * k;
      a.up += ((stance === 'alert' || stance === 'bark' ? 1 : 0) - a.up) * k;
      a.bark = stance === 'bark' ? a.bark + dt * 7 : 0;
      // the legs advance with the distance walked (no sliding): one gait cycle per stride
      if (moving) a.phase += Math.hypot(a.x - px0, a.z - pz0) * Math.PI * 2 / (Math.max(0.05, stride(d) * UNIT));
      a.dist = dist;
      a.moving = moving;
      this._draw(d, a, ground, day);
    });
    this._commit();
  }

  /** What was drawn last frame (test hook): the dog's id, the ground it stands on, its scale and breed model. */
  drawn(): ReadonlyArray<{ id: string; y: number; scale: number; breed: string }> { return this._drawn; }
  /** Draw calls and dogs drawn now (QA / tests). */
  drawCalls(): number { return this._batches.drawCalls(); }

  /** Draw dogs exactly as given (the dog viewer / QA): no walking, no goals. */
  preview(items: PreviewDog[], ground: (x: number, z: number) => number = () => 0): void {
    this._batches.begin(); this._drawn = [];
    for (const it of items.slice(0, CAP)) {
      const a: Agent = { x: it.x, z: it.z, rot: it.rot, phase: it.phase ?? 0, stance: it.stance, placed: true, lie: it.stance === 'lie' ? 1 : 0, sit: it.stance === 'sit' ? 1 : 0, up: it.stance === 'alert' || it.stance === 'bark' ? 1 : it.up ?? 0, bark: 0, moving: !!it.moving };
      this._draw(it.dog, a, ground, 365 * 3 + it.dog.born);
    }
    this._batches.flush(this._time);
  }

  private _commit(): void { this._batches.flush(this._time); }

  private _draw(d: Dog, a: Agent, ground: (x: number, z: number) => number, day: number): void {
    const pup = ageYears(d, day) < 0.5;
    const grow = pup ? 0.55 + 0.45 * Math.max(0, ageYears(d, day)) / 0.5 : 1;
    const happy = d.mood > 60 ? 1 : d.mood > 35 ? 0.4 : 0;
    const seed = Math.abs((d.born * 0.37 + d.tone * 0.11) % 1);
    const gy = a.y ?? ground(a.x, a.z), id = dogModelId(d.breed), model = wildModelOf(id);
    const tier = this._batches.tier(), cam = this._cam;
    const dd = cam ? Math.hypot(a.x - cam.x, gy - cam.y, a.z - cam.z) : 0, li = dd < tier.at[0] ? 0 : dd < tier.at[1] ? 1 : 2;
    // a barking dog throws its head up; the sit is the haunches folding; the lie wins over the sit
    const bark = a.stance === 'bark' ? 0.75 + 0.25 * Math.sin(a.bark * 3) : 0;
    this._batches.put({
      id, breed: d.tone % 3, x: a.x, y: gy, z: a.z, rot: a.rot, phase: a.phase, gait: a.moving ? ((a.dist ?? 0) > 0.5 ? 1.25 : 1) : 0, graze: a.sit * (1 - a.lie), seed, tone: seed,
      size: grow, lie: a.lie, alert: Math.max(a.up * (1 - a.lie), bark), wag: d.mood < 35 ? 0 : happy, li,
      nx: (ground(a.x - 0.05, a.z) - ground(a.x + 0.05, a.z)) / 0.1, nz: (ground(a.x, a.z - 0.05) - ground(a.x, a.z + 0.05)) / 0.1,
    });
    this._drawn.push({ id: d.id, y: gy, scale: grow * UNIT * (model.spec.breeds[d.tone % 3].size ?? 1), breed: id });
  }

  dispose(): void { this._batches.dispose(); }
}

/** Metres a dog covers per gait cycle: about the length of its own body (a trot). */
function stride(d: Dog): number { return wildModelOf(dogModelId(d.breed)).stride; }
