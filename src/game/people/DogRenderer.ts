/**
 * DogRenderer — the family's dogs as small procedural quadrupeds (about 0.1
 * tall at the shoulder, 0.15 long: SCALE v2, a person is 0.28), one
 * InstancedMesh per part (body, head, snout, nose, ears, tail, legs: 7 draw
 * calls for any number of dogs, coat colors per instance). Where they are and
 * what they do comes from dogGoals (follow the bonded person, sleep by the
 * house, stand the post at the gate, bark); here they walk there, trot with
 * swinging legs, sit, lie, stand alert and bark. No shadows, no SSAO (perf rule).
 */
import * as THREE from 'three';
import { ageYears, livingDogs, type Dog } from '../../sim/pets';
import { dogShape, lookOf } from './dogModel';
import { dayIndex, type GameState } from '../../sim/state';
import { dogGoal, type DogCtx, type Stance } from './dogGoals';
import { stepToward, isStop, type Mover } from '../paths/deckWalk';
import type { Wp } from '../paths/linkRoute';

const CAP = 24;
/** Dog speeds (world units per real second at 1x). A dog trots faster than a person walks. */
const TROT = 0.8, RUN = 1.6;
const BLOBS = 48, BONES = 18;      // instances per dog

interface Agent {
  x: number; z: number; rot: number; phase: number; stance: Stance; placed: boolean;
  lie: number; sit: number; up: number; bark: number; moving: boolean;
  via?: Wp[]; viaFor?: { x: number; z: number };
  /** Deck height inside a tunnel or on a tunnel-bridge (null: on the ground). */
  y?: number | null;
  wait?: number;
  retry?: number;
}

const tmpA = new THREE.Matrix4(), tmpB = new THREE.Matrix4(), tmpV = new THREE.Vector3(), tmpS = new THREE.Vector3(), tmpQ = new THREE.Quaternion(), tmpE = new THREE.Euler(), tmpC = new THREE.Color(), UP = new THREE.Vector3(0, 1, 0), tmpD = new THREE.Vector3();

export interface PreviewDog { dog: Dog; x: number; z: number; rot: number; stance: Stance; moving?: boolean; phase?: number; up?: number }

export class DogRenderer {
  private readonly _blob: THREE.InstancedMesh;
  private readonly _bone: THREE.InstancedMesh;
  private readonly _agents = new Map<string, Agent>();
  private _time = 0;
  private _lastClock = -1;
  private _scene: THREE.Scene | null;

  constructor(scene: THREE.Scene) {
    this._scene = scene;
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, metalness: 0 });
    const mk = (name: string, g: THREE.BufferGeometry, per: number): THREE.InstancedMesh => {
      const mesh = new THREE.InstancedMesh(g, mat, CAP * per);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(CAP * per * 3), 3);
      mesh.count = 0; mesh.castShadow = false; mesh.receiveShadow = false; mesh.frustumCulled = false;
      mesh.name = `dog_${name}`; mesh.userData = { type: 'dogs', noSSAO: true };
      scene.add(mesh);
      return mesh;
    };
    // a unit sphere (scaled into ellipsoids) and a tapered limb that runs from y = 0 (radius 1) to y = 1 (radius 0.72)
    this._blob = mk('blobs', new THREE.SphereGeometry(1, 12, 8), BLOBS);
    this._bone = mk('bones', new THREE.CylinderGeometry(0.72, 1, 1, 8, 1, false).translate(0, 0.5, 0), BONES);
  }

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
    let n = 0;
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
      a.phase += dt * (moving ? (dist > 0.5 ? 16 : 11) * Math.min(2.2, Math.max(1, speedK)) : 0);
      a.moving = moving;
      this._draw(n++, d, a, ground, day);
    });
    this._commit(n);
  }

  /** World y of the first body blob of dog `slot` (test hook). */
  bodyY(slot = 0): number { const m = new THREE.Matrix4(); this._blob.getMatrixAt(slot * BLOBS, m); return new THREE.Vector3().setFromMatrixPosition(m).y; }

  /** Draw dogs exactly as given (the dog viewer / QA): no walking, no goals. */
  preview(items: PreviewDog[], ground: (x: number, z: number) => number = () => 0): void {
    let n = 0;
    for (const it of items.slice(0, CAP)) {
      const a: Agent = { x: it.x, z: it.z, rot: it.rot, phase: it.phase ?? 0, stance: it.stance, placed: true, lie: it.stance === 'lie' ? 1 : 0, sit: it.stance === 'sit' ? 1 : 0, up: it.stance === 'alert' || it.stance === 'bark' ? 1 : it.up ?? 0, bark: 0, moving: !!it.moving };
      this._draw(n++, it.dog, a, ground, 365 * 3 + it.dog.born);
    }
    this._commit(n);
  }

  private _commit(n: number): void {
    for (const [m, per] of [[this._blob, BLOBS], [this._bone, BONES]] as const) {
      m.count = n * per; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
  }

  private _draw(n: number, d: Dog, a: Agent, ground: (x: number, z: number) => number, day: number): void {
    const pup = ageYears(d, day) < 0.5;
    const grow = pup ? 0.55 + 0.45 * Math.max(0, ageYears(d, day)) / 0.5 : 1;
    const look0 = lookOf(d.breed, d.tone);
    const look = pup ? { ...look0, head: look0.head * (1 + 0.3 * (1 - grow)), muzzle: look0.muzzle * 0.85 } : look0;
    const sc = grow * look.size;
    const happy = d.mood > 60 ? 1 : d.mood > 35 ? 0.4 : 0;
    const seed = (d.born * 0.37 + d.tone * 0.11) % 1;
    const shape = dogShape(look, { lie: a.lie, sit: a.sit, up: a.up, phase: a.phase, moving: a.moving, t: this._time, happy: d.mood < 35 ? 0 : happy, bark: a.stance === 'bark' ? Math.sin(a.bark * 3) * 0.2 : 0, seed: Math.abs(seed) });
    const gy = a.y ?? ground(a.x, a.z);
    const world = tmpA.compose(tmpV.set(a.x, gy, a.z), tmpQ.setFromAxisAngle(UP, a.rot), tmpS.set(sc, sc, sc));
    const W = new THREE.Matrix4().copy(world);
    let i = n * BLOBS;
    for (const b of shape.blobs) {
      if (i >= (n + 1) * BLOBS) break;
      tmpB.compose(tmpV.set(b.c[0], b.c[1], b.c[2]), tmpQ.setFromEuler(tmpE.set(b.rot[0], b.rot[1], b.rot[2], 'XYZ')), tmpS.set(b.r[0], b.r[1], b.r[2]));
      this._blob.setMatrixAt(i, tmpB.premultiply(W)); this._blob.setColorAt(i, tmpC.setHex(b.col)); i++;
    }
    // unused slots collapse to nothing
    for (; i < (n + 1) * BLOBS; i++) { tmpB.makeScale(0, 0, 0); this._blob.setMatrixAt(i, tmpB); }
    let j = n * BONES;
    for (const b of shape.bones) {
      if (j >= (n + 1) * BONES) break;
      tmpD.set(b.b[0] - b.a[0], b.b[1] - b.a[1], b.b[2] - b.a[2]);
      const len = tmpD.length() || 1e-6;
      tmpQ.setFromUnitVectors(UP, tmpD.multiplyScalar(1 / len));
      tmpB.compose(tmpV.set(b.a[0], b.a[1], b.a[2]), tmpQ, tmpS.set(b.r, len, b.r));
      this._bone.setMatrixAt(j, tmpB.premultiply(W)); this._bone.setColorAt(j, tmpC.setHex(b.col)); j++;
    }
    for (; j < (n + 1) * BONES; j++) { tmpB.makeScale(0, 0, 0); this._bone.setMatrixAt(j, tmpB); }
  }

  dispose(): void {
    if (!this._scene) return;
    for (const m of [this._blob, this._bone]) { this._scene.remove(m); m.geometry.dispose(); m.dispose(); }
    (this._blob.material as THREE.Material).dispose();
    this._scene = null;
  }
}
