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
import { COATS, ageYears, livingDogs, type Dog } from '../../sim/pets';
import { dayIndex, type GameState } from '../../sim/state';
import { dogGoal, type DogCtx, type Stance } from './dogGoals';

const CAP = 16;
/** The base dog is already sized for SCALE v2: back about 0.13 high (a medium dog, hip height about half a 0.28 person's). */
const SCALE_UP = 1;
/** Dog speeds (world units per real second at 1×). A dog trots faster than a person walks. */
const TROT = 0.8, RUN = 1.6;

interface Part { mesh: THREE.InstancedMesh; per: number }

interface Agent {
  x: number; z: number; rot: number; phase: number; stance: Stance; placed: boolean;
  /** Smoothed posture values. */
  lie: number; sit: number; up: number;
  bark: number;
}

const tmpM = new THREE.Matrix4(), tmpP = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpE = new THREE.Euler(), tmpV = new THREE.Vector3(), tmpS = new THREE.Vector3(1, 1, 1);
const tmpC = new THREE.Color();

function ellipsoid(rx: number, ry: number, rz: number, seg = 10): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, seg, Math.max(6, seg - 2));
  g.scale(rx, ry, rz);
  return g;
}

export class DogRenderer {
  private readonly _parts: Record<'body' | 'head' | 'snout' | 'nose' | 'ear' | 'tail' | 'leg', Part>;
  private readonly _agents = new Map<string, Agent>();
  private _time = 0;
  private _lastClock = -1;
  private _scene: THREE.Scene | null;

  constructor(scene: THREE.Scene) {
    this._scene = scene;
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, metalness: 0 });
    const mk = (name: string, g: THREE.BufferGeometry, per: number): Part => {
      const mesh = new THREE.InstancedMesh(g, mat, CAP * per);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(CAP * per * 3), 3);
      mesh.count = 0; mesh.castShadow = false; mesh.receiveShadow = false; mesh.frustumCulled = false;
      mesh.name = `dog_${name}`; mesh.userData = { type: 'dogs', noSSAO: true };
      scene.add(mesh);
      return { mesh, per };
    };
    // (the leg hangs from its hip: the geometry runs from y = 0 down to y = -len)
    const leg = new THREE.CylinderGeometry(0.0058, 0.0042, 0.075, 6).translate(0, -0.0375, 0);
    const ear = ellipsoid(0.0065, 0.016, 0.0045, 6).translate(0, 0.004, 0);
    const tail = ellipsoid(0.0045, 0.0045, 0.036, 6).translate(0, 0, -0.034);
    this._parts = {
      body: mk('body', ellipsoid(0.026, 0.032, 0.068), 1), head: mk('head', ellipsoid(0.02, 0.019, 0.026), 1), snout: mk('snout', ellipsoid(0.0085, 0.0075, 0.021, 8), 1),
      nose: mk('nose', ellipsoid(0.0045, 0.0038, 0.004, 6), 1), ear: mk('ear', ear, 2), tail: mk('tail', tail, 1), leg: mk('leg', leg, 4),
    };
  }

  /** Where a dog stands (QA / camera / the barn). */
  poseOf(id: string): { x: number; z: number; rot: number; stance: Stance } | null {
    const a = this._agents.get(id);
    return a ? { x: a.x, z: a.z, rot: a.rot, stance: a.stance } : null;
  }
  /** World y of a dog's body part instance 0 (test hook). */
  bodyY(slot = 0): number { const m = new THREE.Matrix4(); this._parts.body.mesh.getMatrixAt(slot, m); return new THREE.Vector3().setFromMatrixPosition(m).y; }
  positions(): Array<{ id: string; x: number; z: number }> { return [...this._agents.entries()].map(([id, a]) => ({ id, x: a.x, z: a.z })); }

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
      if (!a) { a = { x: goal.x, z: goal.z, rot: goal.face ?? 0, phase: i * 1.3, stance: goal.stance, placed: true, lie: goal.stance === 'lie' ? 1 : 0, sit: 0, up: 0, bark: 0 }; this._agents.set(d.id, a); }
      // walk to the goal
      const dx = goal.x - a.x, dz = goal.z - a.z, dist = Math.hypot(dx, dz);
      let moving = false;
      const tol = goal.follow ? 0.1 : 0.04;
      if (dist > tol) {
        if (dist > 30 || jumped) { a.x = goal.x; a.z = goal.z; }
        else {
          const v = (dist > 0.5 ? RUN : TROT) * Math.max(1, Math.min(3, speedK)) * (goal.follow ? 1.25 : 1);
          const step = Math.min(dist - tol * 0.5, v * dt);
          a.x += dx / dist * step; a.z += dz / dist * step; moving = true;
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
      this._draw(n++, d, a, moving, ground, day);
    });
    for (const p of Object.values(this._parts)) {
      p.mesh.count = n * p.per;
      p.mesh.instanceMatrix.needsUpdate = true;
      if (p.mesh.instanceColor) p.mesh.instanceColor.needsUpdate = true;
    }
  }

  private _put(part: Part, slot: number, base: THREE.Matrix4, local: THREE.Matrix4, color: number): void {
    const i = slot;
    tmpM.multiplyMatrices(base, local);
    part.mesh.setMatrixAt(i, tmpM);
    part.mesh.setColorAt(i, tmpC.setHex(color));
  }

  /** Local transform: translate, then rotate about x (pitch) / z (roll) / y (yaw). */
  private _loc(x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, s = 1, sy = s): THREE.Matrix4 {
    tmpQ.setFromEuler(tmpE.set(rx, ry, rz));
    return tmpP.compose(tmpV.set(x, y, z), tmpQ, tmpS.set(s, sy, s));
  }

  private _draw(n: number, d: Dog, a: Agent, moving: boolean, ground: (x: number, z: number) => number, day: number): void {
    const pup = ageYears(d, day) < 0.5;
    const grow = pup ? 0.55 + 0.45 * Math.max(0, ageYears(d, day)) / 0.5 : 1;
    const big = d.breed === 'shepherd' || d.breed === 'lab' ? 1.06 : d.breed === 'hound' ? 1.0 : d.breed === 'collie' ? 0.98 : 0.94;
    const sc = grow * big * SCALE_UP;
    const coat = COATS[d.breed][d.tone % 3];
    const ph = a.phase, trot = moving ? 1 : 0;
    const bob = trot * Math.abs(Math.sin(ph)) * 0.004;
    const lie = a.lie, sit = a.sit * (1 - lie), up = a.up;
    // body: standing 0.10 up (back 0.128); lying drops it; sitting tips the chest up about the rump
    const bodyY = 0.1 - 0.058 * lie - 0.03 * sit + bob;
    const pitch = -0.35 * sit;
    const gy = ground(a.x, a.z);
    const base = new THREE.Matrix4().compose(tmpV.set(a.x, gy, a.z), tmpQ.setFromEuler(tmpE.set(0, a.rot, 0)), tmpS.set(sc, sc, sc));
    const bodyM = new THREE.Matrix4().multiplyMatrices(base, this._loc(0, bodyY, -0.012 * sit, pitch, 0, 0));
    const body = this._parts.body, head = this._parts.head, snout = this._parts.snout, nose = this._parts.nose, ear = this._parts.ear, tail = this._parts.tail, leg = this._parts.leg;
    const dark = 0x14110e;
    const prick = d.breed === 'shepherd' || d.breed === 'collie';          // upright ears; the others hang
    const earC = prick ? (d.breed === 'shepherd' ? 0x1c1814 : coat.body) : coat.trim;
    const legC = d.breed === 'collie' || d.breed === 'hound' || d.breed === 'mutt' ? coat.trim : coat.body;
    const snoutC = d.breed === 'shepherd' ? 0x2a2018 : d.breed === 'collie' ? coat.trim : coat.body;
    body.mesh.setMatrixAt(n, bodyM); body.mesh.setColorAt(n, tmpC.setHex(coat.body));
    // head: level on a short neck (it is lifted when alert, rests low when lying, bobs when barking); counter-pitched so it stays level when the chest tips
    const bark = a.stance === 'bark' ? Math.sin(a.bark * 3) * 0.28 : 0;
    const headY = 0.03 + 0.016 * up - 0.014 * lie + 0.01 * sit;
    const hm = this._loc(0, headY, 0.074 + 0.004 * lie, -pitch * 0.9 + 0.1 * lie - 0.08 * up + bark);
    this._put(head, n, bodyM, hm, coat.body);
    const headBase = new THREE.Matrix4().multiplyMatrices(bodyM, hm);
    this._put(snout, n, headBase, this._loc(0, -0.005, 0.03, 0.05 + bark * 0.3), snoutC);
    this._put(nose, n, headBase, this._loc(0, -0.002, 0.05), dark);
    // ears: upright cones for shepherds and collies, hanging flaps for the rest
    const earRoll = prick ? 0.12 : 0.9 + 0.2 * (1 - up);
    const earLen = d.breed === 'hound' ? 1.3 : prick ? 1.15 : 0.9;
    this._put(ear, n * 2, headBase, this._loc(0.012, 0.014, -0.008, prick ? -0.1 : 0.1, 0, -earRoll, earLen), earC);
    this._put(ear, n * 2 + 1, headBase, this._loc(-0.012, 0.014, -0.008, prick ? -0.1 : 0.1, 0, earRoll, earLen), earC);
    // tail: wags when the dog is happy, hangs when it is low, held out when alert
    const happy = d.mood > 60 ? 1 : d.mood > 35 ? 0.4 : 0;
    const wag = Math.sin(this._time * (happy ? 12 : 3) + ph) * 0.4 * (happy + 0.1);
    const tailUp = 0.45 + 0.25 * up + 0.3 * happy - 0.5 * (d.mood < 35 ? 1 : 0) - 0.25 * lie;
    this._put(tail, n, bodyM, this._loc(0, 0.014, -0.064, -tailUp, wag, 0), d.breed === 'collie' || d.breed === 'mutt' ? coat.trim : coat.body);
    // legs hang from the hips (y = hip height): a diagonal trot, tucked when lying, haunches down when sitting, front legs straight when sitting
    const hips: Array<[number, number, number]> = [[-0.017, 0.045, 1], [0.017, 0.045, 0], [-0.017, -0.045, 0], [0.017, -0.045, 1]];
    for (let k = 0; k < 4; k++) {
      const [hx, hz, par] = hips[k];
      const swing = trot * Math.sin(ph + par * Math.PI) * 0.7;
      const rear = hz < 0;
      let rx = swing, ly = 0.075, lz = hz, sy = 1;
      if (lie > 0.01) {          // tucked: the forelegs reach out ahead, the hind legs fold under
        rx = (rear ? 1.5 : -1.45) * lie + swing * (1 - lie); ly = 0.075 - (0.075 - 0.032) * lie; lz = hz + (rear ? -0.006 : 0.025) * lie; sy = 1 - 0.3 * lie;
      }
      if (sit > 0.01) {
        if (rear) { rx = 1.45 * sit; ly = 0.075 - 0.047 * sit; lz = hz - 0.016 * sit; sy = 1 - 0.35 * sit; }
        else { ly = 0.075 + 0.006 * sit; lz = hz - 0.012 * sit; }
      }
      const lm = tmpP.copy(this._loc(hx, ly, lz, rx, 0, 0, 1, sy));
      tmpM.multiplyMatrices(base, lm);
      leg.mesh.setMatrixAt(n * 4 + k, tmpM); leg.mesh.setColorAt(n * 4 + k, tmpC.setHex(legC));
    }
  }

  dispose(): void {
    if (!this._scene) return;
    for (const p of Object.values(this._parts)) { this._scene.remove(p.mesh); p.mesh.geometry.dispose(); p.mesh.dispose(); }
    (Object.values(this._parts)[0].mesh.material as THREE.Material).dispose();
    this._scene = null;
  }
}
