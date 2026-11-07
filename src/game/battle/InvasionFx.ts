/**
 * What an invasion adds to the battle picture (sim/breach.ts is the legend of real versus cinematic): the raiders' truck that rams the wall with
 * its headlights on (beams through the dust), the charge that is planted, blinks and blows, the wall's debris flung and left lying, a shock ring.
 * Everything here lives only while the scene plays: `begin` builds the truck and the lights when the battle has a `ram`, `end` takes them all
 * away. One instanced mesh for all the debris (one draw), one small light pair (fixed count, so the shaders compile once), sprites from the
 * battle renderer's own puff pool. Scale: 1 unit = 6 m (a pickup is 0.9 long).
 */
import * as THREE from 'three';
import type { Battle, BattleEvent } from '../../sim/battleTypes';
import { buildVehicle } from '../props/vehicleGeometry';

export interface FxHooks {
  ground: (x: number, z: number) => number;
  puff: (p: THREE.Vector3, r0: number, r1: number, life: number, rise: number, color: number, o0: number, glow?: boolean) => void;
  flash: (p: THREE.Vector3, k: number, color: number) => void;
  boom: (x: number, y: number, z: number, radius: number, dust: boolean) => void;
  shake: (v: number) => void;
  /** The wall run is open here (a live gap drawn until the cutscene ends). */
  gap: (runId: string, at: number, w: number) => void;
}

const MAX_DEBRIS = 72, G = 2.4;
interface Chunk { pos: THREE.Vector3; vel: THREE.Vector3; rot: THREE.Euler; spin: THREE.Vector3; size: THREE.Vector3; color: number; settled: boolean }
interface Run { group: THREE.Group; from: THREE.Vector3; to: THREE.Vector3; secs: number; age: number; yaw: number; done: boolean; hitAt: number; lamps: THREE.SpotLight[] }

export class InvasionFx {
  private readonly _group: THREE.Group;
  private readonly _h: FxHooks;
  private _run: Run | null = null;
  private _lamps: THREE.SpotLight[] = [];
  private _beams: THREE.Mesh[] = [];
  private _satchel: { mesh: THREE.Group; led: THREE.Mesh; age: number; fuse: number } | null = null;
  private _ring: { mesh: THREE.Mesh; age: number } | null = null;
  private _debris: InstancedMesh3 | null = null;
  private _chunks: Chunk[] = [];
  private _m = new THREE.Matrix4();
  private _q = new THREE.Quaternion();
  private _s = new THREE.Vector3();
  private _c = new THREE.Color();
  /** Seconds since the scene started (the debris and the lights run on it). */
  private _t = 0;
  private _heat = 0;

  constructor(group: THREE.Group, hooks: FxHooks) { this._group = group; this._h = hooks; }

  get active(): boolean { return this._run !== null || this._satchel !== null || this._chunks.length > 0; }

  /** The scene starts: if its wall comes down to a truck, the headlights exist from the first frame (no shader recompile mid-scene). */
  begin(b: Battle): void {
    this.end();
    this._t = 0;
    if (b.invasion?.method === 'ram') {
      for (let i = 0; i < 2; i++) {
        const l = new THREE.SpotLight(0xfff0d0, 0, 18, 0.42, 0.7, 1.3);
        l.castShadow = false;
        this._group.add(l, l.target);
        this._lamps.push(l);
      }
    }
  }

  end(): void {
    if (this._run) { this._group.remove(this._run.group); this._run.group.traverse(o => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).geometry.dispose(); }); this._run = null; }
    for (const l of this._lamps) { this._group.remove(l, l.target); l.dispose(); }
    this._lamps = [];
    for (const m of this._beams) { this._group.remove(m); m.geometry.dispose(); (m.material as THREE.Material).dispose(); }
    this._beams = [];
    if (this._satchel) { this._group.remove(this._satchel.mesh); this._satchel = null; }
    if (this._ring) { this._group.remove(this._ring.mesh); this._ring.mesh.geometry.dispose(); (this._ring.mesh.material as THREE.Material).dispose(); this._ring = null; }
    if (this._debris) { this._group.remove(this._debris); this._debris.geometry.dispose(); (this._debris.material as THREE.Material).dispose(); this._debris = null; }
    this._chunks = [];
    this._heat = 0;
  }

  onEvent(e: BattleEvent): void {
    if (e.kind === 'ram') this._startRam(e);
    else if (e.kind === 'charge') this._plant(e);
    else if (e.kind === 'gap') this._gap(e);
  }

  // ── the truck ─────────────────────────────────────────────────────────
  private _startRam(e: Extract<BattleEvent, { kind: 'ram' }>): void {
    const h = this._h;
    const truck = buildVehicle('pickup', 0x4a4d4f);
    truck.scale.setScalar(1.12);
    // a bent-steel push bar across the nose, and dents of rust (cheap, one box each)
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.07, 0.03), new THREE.MeshStandardMaterial({ color: 0x1d1f20, roughness: 0.8, metalness: 0.4 }));
    bar.position.set(0, 0.09, 0.47);
    truck.add(bar);
    const from = new THREE.Vector3(e.fromX, 0, e.fromZ), to = new THREE.Vector3(e.x, 0, e.z);
    const yaw = Math.atan2(to.x - from.x, to.z - from.z);
    truck.rotation.y = yaw;
    from.y = h.ground(from.x, from.z); to.y = h.ground(to.x, to.z);
    truck.position.copy(from);
    this._group.add(truck);
    // headlights: two lamps on the nose, a pale additive cone each (the beam in the dust)
    this._lamps.forEach((l, i) => {
      const side = i ? 1 : -1;
      const beam = new THREE.Mesh(new THREE.ConeGeometry(0.34, 2.8, 14, 1, true).translate(0, -1.4, 0).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: 0xfff1cc, transparent: true, opacity: 0.085, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
      beam.userData = { noSSAO: true, side };
      beam.frustumCulled = false;
      this._group.add(beam);
      this._beams.push(beam);
      void l;
    });
    this._run = { group: truck, from, to, secs: e.secs, age: 0, yaw, done: false, hitAt: -1, lamps: this._lamps };
  }

  private _placeLamps(r: Run, intensity: number): void {
    const f = new THREE.Vector3(Math.sin(r.yaw), 0, Math.cos(r.yaw)), s = new THREE.Vector3(Math.cos(r.yaw), 0, -Math.sin(r.yaw));
    r.lamps.forEach((l, i) => {
      const side = i ? 1 : -1;
      const p = r.group.position.clone().addScaledVector(f, 0.5).addScaledVector(s, side * 0.1); p.y += 0.16;
      l.position.copy(p);
      l.target.position.copy(p).addScaledVector(f, 4).add(new THREE.Vector3(0, -0.5, 0));
      l.intensity = intensity;
      const beam = this._beams[i];
      if (beam) {
        beam.position.copy(p);
        beam.rotation.set(0, r.yaw, 0);
        (beam.material as THREE.MeshBasicMaterial).opacity = intensity > 0 ? 0.085 : 0;
      }
    });
  }

  // ── the charge ────────────────────────────────────────────────────────
  private _plant(e: Extract<BattleEvent, { kind: 'charge' }>): void {
    const g = new THREE.Group();
    const bag = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.07, 0.06), new THREE.MeshStandardMaterial({ color: 0x3b4034, roughness: 0.95 }));
    bag.position.y = 0.035;
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2a1a, toneMapped: false }));
    led.position.set(0, 0.085, 0); led.userData = { noSSAO: true };
    g.add(bag, led);
    // it hangs on the wall at waist height
    g.position.set(e.x, this._h.ground(e.x, e.z) + 0.1, e.z);
    this._group.add(g);
    this._satchel = { mesh: g, led, age: 0, fuse: e.fuse };
  }

  // ── the wall goes ─────────────────────────────────────────────────────
  private _gap(e: Extract<BattleEvent, { kind: 'gap' }>): void {
    const h = this._h, p = new THREE.Vector3(e.x, h.ground(e.x, e.z), e.z);
    h.gap(e.runId, e.at, e.w);
    const charge = this._satchel !== null;
    const dir = this._run ? new THREE.Vector3(Math.sin(this._run.yaw), 0, Math.cos(this._run.yaw)) : new THREE.Vector3(0, 0, 0);
    if (this._satchel) { this._group.remove(this._satchel.mesh); this._satchel = null; }
    this._spawnDebris(p, dir, charge ? 44 : 36, charge ? 1 : 0.6, e.w);
    // dust: a wall of it rolling out along the way the truck came (ram) or a ball (charge), brown-grey and slow
    const n = charge ? 10 : 14;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + 0.4, d = 0.1 + (i % 4) * 0.08;
      const q = p.clone().add(new THREE.Vector3(Math.cos(a) * d + dir.x * i * 0.03, 0.08 + (i % 3) * 0.06, Math.sin(a) * d + dir.z * i * 0.03));
      h.puff(q, 0.1, 0.55 + (i % 3) * 0.15, 3.2 + (i % 4) * 0.5, 0.12, i % 2 ? 0x8f8068 : 0x6e6454, 0.55);
    }
    h.puff(p.clone().add(new THREE.Vector3(0, 0.15, 0)), 0.3, 1.1, 4, 0.08, 0x7a6f5c, 0.35);
    if (charge) {
      h.boom(p.x, p.y, p.z, 0.8, true);
      h.flash(p.clone().add(new THREE.Vector3(0, 0.2, 0)), 16, 0xffd9a0);
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xfff0d0, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }));
      ring.position.copy(p).y += 0.05; ring.scale.setScalar(0.1); ring.userData = { noSSAO: true };
      this._group.add(ring);
      this._ring = { mesh: ring, age: 0 };
      h.shake(0.45);
      this._heat = 1;
    } else {
      // sparks off the steel, one hot flash
      h.flash(p.clone().add(new THREE.Vector3(0, 0.15, 0)), 7, 0xffc880);
      for (let i = 0; i < 8; i++) h.puff(p.clone().add(new THREE.Vector3((i % 4 - 1.5) * 0.12, 0.1 + (i % 2) * 0.08, ((i >> 1) % 3 - 1) * 0.1)), 0.02, 0.05, 0.35, 0.1, 0xffb050, 1, true);
      h.shake(0.38);
    }
  }

  private _spawnDebris(p: THREE.Vector3, dir: THREE.Vector3, n: number, power: number, w: number): void {
    if (!this._debris) {
      const geo = new THREE.BoxGeometry(1, 1, 1);
      const mat = new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0.1 });
      this._debris = new THREE.InstancedMesh(geo, mat, MAX_DEBRIS) as InstancedMesh3;
      this._debris.count = 0; this._debris.frustumCulled = false; this._debris.userData = { noSSAO: true };
      this._group.add(this._debris);
    }
    const palette = [0x6b5a45, 0x5a4a38, 0x8a8478, 0x55585c, 0x7a6a52, 0x3f3a33];
    let seed = this._chunks.length * 7919 + 13;
    const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    for (let i = 0; i < n && this._chunks.length < MAX_DEBRIS; i++) {
      const along = (rnd() - 0.5) * w;
      // flung forward (the way the truck was going) and sideways, up fast, spinning
      const fwd = dir.lengthSq() > 0 ? dir.clone() : new THREE.Vector3((rnd() - 0.5) * 2, 0, (rnd() - 0.5) * 2).normalize();
      const v = fwd.multiplyScalar((0.6 + rnd() * 1.8) * power).add(new THREE.Vector3((rnd() - 0.5) * 1.2, 0, (rnd() - 0.5) * 1.2));
      v.y = 0.9 + rnd() * 1.9 * power;
      const big = i < 5;
      this._chunks.push({
        pos: new THREE.Vector3(p.x + Math.cos(0) * along * 0.4 + (rnd() - 0.5) * 0.2, p.y + 0.06 + rnd() * 0.22, p.z + (rnd() - 0.5) * 0.2),
        vel: v, rot: new THREE.Euler(rnd() * 3, rnd() * 3, rnd() * 3), spin: new THREE.Vector3((rnd() - 0.5) * 12, (rnd() - 0.5) * 12, (rnd() - 0.5) * 12),
        size: big ? new THREE.Vector3(0.1 + rnd() * 0.08, 0.05 + rnd() * 0.03, 0.03) : new THREE.Vector3(0.02 + rnd() * 0.05, 0.015 + rnd() * 0.035, 0.015 + rnd() * 0.04),
        color: palette[Math.floor(rnd() * palette.length)], settled: false,
      });
    }
  }

  update(dt: number): void {
    this._t += dt;
    const h = this._h;
    const r = this._run;
    if (r) {
      r.age += dt;
      const u = Math.min(1, r.age / r.secs);
      if (!r.done) {
        // accelerating run-in: slow to start, fast at the wall
        const k = u * u;
        r.group.position.lerpVectors(r.from, r.to, k);
        r.group.position.y = h.ground(r.group.position.x, r.group.position.z) + Math.sin(this._t * 38) * 0.004 * u;
        // dust kicked up behind the tires
        if (Math.floor(r.age * 9) !== Math.floor((r.age - dt) * 9) && u < 1) h.puff(r.group.position.clone().add(new THREE.Vector3(-Math.sin(r.yaw) * 0.4, 0.04, -Math.cos(r.yaw) * 0.4)), 0.05, 0.28, 1.4, 0.05, 0x8a7d66, 0.35);
        this._placeLamps(r, 70);
        if (u >= 1) { r.done = true; r.hitAt = r.age; }
      } else {
        // through the opening and stopping, nose up, a little crumpled
        const s = Math.min(1, (r.age - r.hitAt) / 1.0), ease = 1 - (1 - s) * (1 - s);
        const f = new THREE.Vector3(Math.sin(r.yaw), 0, Math.cos(r.yaw));
        r.group.position.copy(r.to).addScaledVector(f, 0.55 * ease);
        r.group.position.y = h.ground(r.group.position.x, r.group.position.z);
        r.group.rotation.x = -0.05 * ease; r.group.rotation.z = 0.035 * ease;
        this._placeLamps(r, 70);
        if (s < 1 && Math.floor(r.age * 14) !== Math.floor((r.age - dt) * 14)) h.puff(r.group.position.clone().add(new THREE.Vector3(0, 0.1, 0)), 0.05, 0.22, 1.2, 0.08, 0x8a7d66, 0.3);
        // steam off the hood
        if (Math.floor(r.age * 3) !== Math.floor((r.age - dt) * 3)) h.puff(r.group.position.clone().addScaledVector(f, 0.3).add(new THREE.Vector3(0, 0.22, 0)), 0.04, 0.2, 1.8, 0.2, 0xcfcfcf, 0.2);
      }
    }
    if (this._satchel) {
      const s = this._satchel; s.age += dt;
      const rate = 3 + 9 * (s.age / s.fuse);
      (s.led.material as THREE.MeshBasicMaterial).color.setHex(Math.sin(s.age * rate * Math.PI * 2) > 0 ? 0xff2a1a : 0x3a0c08);
    }
    if (this._ring) {
      const rg = this._ring; rg.age += dt;
      const u = rg.age / 0.7;
      rg.mesh.scale.setScalar(0.1 + u * 3.2);
      (rg.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.8 * (1 - u));
      if (u >= 1) { this._group.remove(rg.mesh); rg.mesh.geometry.dispose(); (rg.mesh.material as THREE.Material).dispose(); this._ring = null; }
    }
    if (this._heat > 0) {
      // smoke keeps rising from the blast for a while
      this._heat = Math.max(0, this._heat - dt * 0.18);
    }
    this._debrisStep(dt);
  }

  private _debrisStep(dt: number): void {
    const d = this._debris; if (!d) return;
    const h = this._h;
    this._chunks.forEach((c, i) => {
      if (!c.settled) {
        c.vel.y -= G * dt;
        c.pos.addScaledVector(c.vel, dt);
        c.rot.x += c.spin.x * dt; c.rot.y += c.spin.y * dt; c.rot.z += c.spin.z * dt;
        const gy = h.ground(c.pos.x, c.pos.z) + c.size.y * 0.5;
        if (c.pos.y <= gy) {
          c.pos.y = gy;
          if (c.vel.y < -0.5 && Math.hypot(c.vel.x, c.vel.z) > 0.3) { c.vel.y *= -0.28; c.vel.x *= 0.5; c.vel.z *= 0.5; c.spin.multiplyScalar(0.4); }
          else { c.settled = true; c.rot.x = 0; c.rot.z = 0; }
        }
      }
      this._q.setFromEuler(c.rot);
      this._m.compose(c.pos, this._q, this._s.copy(c.size));
      d.setMatrixAt(i, this._m);
      d.setColorAt(i, this._c.setHex(c.color));
    });
    d.count = this._chunks.length;
    d.instanceMatrix.needsUpdate = true;
    if (d.instanceColor) d.instanceColor.needsUpdate = true;
  }
}

type InstancedMesh3 = THREE.InstancedMesh;
