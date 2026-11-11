/**
 * The small props a cutscene's new beats need (sim/battleTypes.ts: house_door, loot, arson): the house door's leaf (shut, kicked, shot, swung open),
 * the loot carried off on people's backs, and fires set on purpose. Built when first used, fixed caps (one door leaf, 12 packs in ONE instanced
 * mesh, 4 fires), and `end` takes every mesh, geometry and material away so repeated raids leave nothing behind (the leak test counts them).
 * Scale: 1 unit = 6 m; a door is 0.17 wide and 0.37 tall.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { BattleEvent } from '../../sim/battleTypes';
import { AftermathProps } from './AftermathProps';

export interface PropHooks {
  ground: (x: number, z: number) => number;
  puff: (p: THREE.Vector3, r0: number, r1: number, life: number, rise: number, color: number, o0: number, glow?: boolean) => void;
  flash: (p: THREE.Vector3, k: number, color: number) => void;
  /** A steady light that stays where it is put (one per fire, a fixed few made with the renderer so the shaders never change): index, place, intensity, color. */
  glow?: (i: number, p: THREE.Vector3, k: number, color: number) => void;
  shake: (v: number) => void;
}
export interface UnitAt { x: number; y: number; z: number; rot: number; dead: boolean; gone: boolean }

const MAX_PACKS = 12, MAX_FIRES = 4, MAX_LADDERS = 10, MAX_FLARES = 2;
const DOOR_W = 0.17, DOOR_H = 0.37;
/** What a pack looks like by item (colors only: one box shape). */
const ITEM_COLOR: Record<string, number> = { food: 0x8a6a3a, canned: 0x7a5a2c, fuel: 0xa8321e, meds: 0xd9d9d0, ammo: 0x3d4a2a, tools: 0x555a60, guns: 0x222426, radio: 0x2c3a44, bedding: 0x6a5a7a, default: 0x6a5238 };
/** The pack color for what the sim says was taken ("3 cans of fuel", "canned food", ...). */
export const lootKind = (what: string): string => /fuel|gas|diesel/i.test(what) ? 'fuel' : /med|first aid|ifak/i.test(what) ? 'meds' : /ammo|round/i.test(what) ? 'ammo' : /gun|rifle|weapon/i.test(what) ? 'guns' : /tool/i.test(what) ? 'tools' : /radio/i.test(what) ? 'radio' : /food|can|flour|rice|meat|egg|bean|stap/i.test(what) ? 'food' : 'default';
export const itemColor = (item: string): number => ITEM_COLOR[item] ?? ITEM_COLOR.default;

interface Door { pivot: THREE.Group; leaf: THREE.Mesh; nx: number; nz: number; open: number; target: number; speed: number; shudder: number }
interface Fire { x: number; z: number; big: boolean; age: number; acc: number; spread?: boolean; smoke?: number; light?: number }

export class SceneProps {
  private _door: Door | null = null;
  private _packs: THREE.InstancedMesh | null = null;
  private _packOf: Array<{ unit: string; color: number }> = [];
  private _fires: Fire[] = [];
  private _flagOf: string[] = [];
  private _dog: { mesh: THREE.Group; head: THREE.Mesh; x: number; z: number; age: number } | null = null;
  private _flagMesh: THREE.InstancedMesh | null = null;
  private _flares: Array<{ x: number; z: number; age: number; secs: number; acc: number }> = [];
  private _ladders: { x: number; z: number; h: number; fx: number; fz: number }[] = [];
  private _ladderMesh: THREE.InstancedMesh | null = null;
  private _tFlag = 0;
  private readonly _m = new THREE.Matrix4();
  private readonly _q = new THREE.Quaternion();
  private readonly _e = new THREE.Euler();
  private readonly _c = new THREE.Color();
  private _geo: THREE.BufferGeometry[] = [];
  private _mat: THREE.Material[] = [];
  private readonly _group: THREE.Group;
  private readonly _h: PropHooks;
  private readonly _after: AftermathProps;
  constructor(group: THREE.Group, hooks: PropHooks) { this._group = group; this._h = hooks; this._after = new AftermathProps(group, { ground: hooks.ground, puff: hooks.puff }); }

  /** Counts for the leak test. */
  get live(): { door: boolean; packs: number; fires: number; ladders: number } { return { door: !!this._door, packs: this._packOf.length, fires: this._fires.length, ladders: this._ladders.length }; }

  end(): void {
    this._after.end();
    if (this._door) this._group.remove(this._door.pivot);
    if (this._packs) this._group.remove(this._packs);
    if (this._ladderMesh) this._group.remove(this._ladderMesh);
    this._ladderMesh = null; this._ladders = [];
    this._door = null; this._packs = null; this._packOf = []; this._fires = []; this._flares = []; this._flagOf = []; if (this._dog) this._group.remove(this._dog.mesh); this._dog = null; if (this._flagMesh) this._group.remove(this._flagMesh); this._flagMesh = null;
    for (const g of this._geo) g.dispose();
    for (const m of this._mat) m.dispose();
    this._geo = []; this._mat = [];
  }

  onEvent(e: BattleEvent): void {
    if (e.kind === 'house_door') this._doorEvent(e);
    else if (e.kind === 'ladder') this._addLadder(e);
    else if (e.kind === 'flag') this._addFlag(e.unit);
    else if (e.kind === 'tool' || e.kind === 'grave' || e.kind === 'repair') this._after.onEvent(e);
    else if (e.kind === 'alarm') this._addDog();
    else if (e.kind === 'flare') { if (this._flares.length < MAX_FLARES) this._flares.push({ x: e.x, z: e.z, age: 0, secs: e.secs, acc: 0 }); }
    else if (e.kind === 'loot') {
      if (this._packOf.length < MAX_PACKS && !this._packOf.some(p => p.unit === e.by)) this._packOf.push({ unit: e.by, color: itemColor(lootKind(e.what)) });
      this._ensurePacks();
    } else if (e.kind === 'fire') {
      if (this._fires.length < MAX_FIRES) this._fires.push({ x: e.x, z: e.z, big: true, age: 0, acc: 0 });
    }
  }

  /** One instanced mesh for every ladder of the scene (two rails and six rungs, stretched to length). */
  private _addLadder(e: Extract<BattleEvent, { kind: 'ladder' }>): void {
    if (this._ladders.length >= MAX_LADDERS || this._ladders.some(l => Math.hypot(l.x - e.x, l.z - e.z) < 0.05 && Math.hypot(l.fx - e.fx, l.fz - e.fz) < 0.05)) return;
    if (!this._ladderMesh) {
      const parts: THREE.BufferGeometry[] = [];
      for (const sx of [-0.028, 0.028]) parts.push(new THREE.BoxGeometry(0.014, 1, 0.014).translate(sx, 0.5, 0));
      for (let i = 0; i < 7; i++) parts.push(new THREE.BoxGeometry(0.06, 0.012, 0.012).translate(0, 0.07 + i * 0.14, 0));
      const geo = mergeGeometries(parts)!;
      for (const p of parts) p.dispose();
      const mat = new THREE.MeshStandardMaterial({ color: 0x6b4d2c, roughness: 0.9 });
      this._geo.push(geo); this._mat.push(mat);
      this._ladderMesh = new THREE.InstancedMesh(geo, mat, MAX_LADDERS);
      this._ladderMesh.count = 0; this._ladderMesh.frustumCulled = false; this._ladderMesh.userData = { noSSAO: true };
      this._group.add(this._ladderMesh);
    }
    this._ladders.push({ x: e.x, z: e.z, h: e.h, fx: e.fx, fz: e.fz });
    const h = this._h, m = this._ladderMesh;
    const top = new THREE.Vector3(e.x, h.ground(e.x, e.z) + e.h, e.z), foot = new THREE.Vector3(e.fx, h.ground(e.fx, e.fz), e.fz);
    const d = top.clone().sub(foot), L = d.length(), y = d.clone().normalize();
    const hz = new THREE.Vector3(d.x, 0, d.z).normalize(), x = new THREE.Vector3(-hz.z, 0, hz.x), z = new THREE.Vector3().crossVectors(x, y).normalize();
    this._m.makeBasis(x, y.clone().multiplyScalar(L), z).setPosition(foot);
    m.setMatrixAt(this._ladders.length - 1, this._m);
    m.count = this._ladders.length;
    m.instanceMatrix.needsUpdate = true;
  }

  /** A white cloth on a stick, held up by one man (the envoy of a parley): one instanced mesh, two at most. */
  private _addFlag(unit: string): void {
    if (this._flagOf.length >= 2 || this._flagOf.includes(unit)) return;
    if (!this._flagMesh) {
      // a tall stick and a big cloth (as wide as a man is tall), turned 45 degrees so it reads from behind, the side and the front
      const parts = [new THREE.BoxGeometry(0.014, 0.56, 0.014).translate(0, 0.28, 0), new THREE.PlaneGeometry(0.3, 0.2).translate(0.15, 0.44, 0).rotateY(Math.PI / 4), new THREE.PlaneGeometry(0.3, 0.2).translate(0.15, 0.44, 0).rotateY(-Math.PI / 4)];   // two cloths in a V: one is never edge-on to the camera
      const geo = mergeGeometries(parts)!;
      for (const g of parts) g.dispose();
      const mat = new THREE.MeshStandardMaterial({ color: 0xf2efe6, roughness: 0.9, emissive: 0xb8b6ae, side: THREE.DoubleSide });
      this._geo.push(geo); this._mat.push(mat);
      this._flagMesh = new THREE.InstancedMesh(geo, mat, 2);
      this._flagMesh.count = 0; this._flagMesh.frustumCulled = false; this._flagMesh.userData = { noSSAO: true };
      this._group.add(this._flagMesh);
    }
    this._flagOf.push(unit);
  }

  /** The yard dog, barking at the drive from the alarm on (one small group of boxes: a body, a head that jerks with each bark, four legs, a tail). Placed beside the house. */
  centerOf: () => { x: number; z: number } = () => ({ x: 0, z: 0 });
  private _addDog(): void {
    if (this._dog) return;
    const c = this.centerOf(), g = new THREE.Group(), mat = new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 0.95 });
    this._mat.push(mat);
    const box = (w: number, h: number, d: number, x: number, y: number, z: number) => { const geo = new THREE.BoxGeometry(w, h, d); this._geo.push(geo); const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); g.add(m); return m; };
    box(0.13, 0.055, 0.05, 0, 0.075, 0);                       // body (a dog is 0.1 tall at the shoulder: SCALE v2)
    const head = box(0.05, 0.045, 0.04, 0.085, 0.105, 0);
    for (const [x, z] of [[0.05, 0.018], [0.05, -0.018], [-0.05, 0.018], [-0.05, -0.018]]) box(0.014, 0.05, 0.014, x, 0.025, z);
    const tail = box(0.05, 0.012, 0.012, -0.09, 0.1, 0); tail.rotation.z = 0.5;
    const x = c.x + 0.7, z = c.z + 0.55;
    g.position.set(x, this._h.ground(x, z), z);
    this._group.add(g);
    this._dog = { mesh: g, head, x, z, age: 0 };
  }

  private _ensurePacks(): void {
    if (this._packs) return;
    const geo = new THREE.BoxGeometry(0.07, 0.06, 0.05), mat = new THREE.MeshStandardMaterial({ roughness: 0.9 });
    this._geo.push(geo); this._mat.push(mat);
    this._packs = new THREE.InstancedMesh(geo, mat, MAX_PACKS);
    this._packs.count = 0; this._packs.frustumCulled = false; this._packs.userData = { noSSAO: true };
    this._group.add(this._packs);
  }

  private _ensureDoor(e: Extract<BattleEvent, { kind: 'house_door' }>): Door {
    if (this._door) return this._door;
    const geo = new THREE.BoxGeometry(DOOR_W, DOOR_H, 0.014).translate(DOOR_W / 2, DOOR_H / 2, 0);
    const mat = new THREE.MeshStandardMaterial({ color: 0x5e4129, roughness: 0.85 });
    this._geo.push(geo); this._mat.push(mat);
    const leaf = new THREE.Mesh(geo, mat), pivot = new THREE.Group();
    pivot.add(leaf);
    // the hinge is at one side of the opening; the leaf lies across it (closed) and swings in, against the way out
    const px = -e.nz, pz = e.nx;   // along the wall
    pivot.position.set(e.x - px * DOOR_W / 2, this._h.ground(e.x, e.z) + 0.01, e.z - pz * DOOR_W / 2);
    pivot.rotation.y = Math.atan2(px, pz) - Math.PI / 2;   // leaf's +x runs along the wall
    this._group.add(pivot);
    // shut state: rotation 0 relative to the base yaw; open: swung inward by `open` radians
    this._door = { pivot, leaf, nx: e.nx, nz: e.nz, open: 0, target: 0, speed: 3, shudder: 0 };
    (this._door.pivot.userData as { base: number }).base = pivot.rotation.y;
    return this._door;
  }

  private _doorEvent(e: Extract<BattleEvent, { kind: 'house_door' }>): void {
    const d = this._ensureDoor(e), h = this._h, p = new THREE.Vector3(e.x, h.ground(e.x, e.z) + 0.18, e.z);
    if (e.action === 'open') { d.target = 1.5; d.speed = 2.6; }
    else if (e.action === 'close') { d.target = 0; d.speed = 5; h.shake(0.04); }
    else if (!e.ok) {
      // it holds: the leaf jumps in its frame, dust off the lintel
      d.shudder = 0.45; h.shake(0.12);
      for (let i = 0; i < 3; i++) h.puff(p.clone().add(new THREE.Vector3((i - 1) * 0.05, 0.12, 0)), 0.02, 0.09, 0.9, 0.03, 0x9a8c74, 0.45);
    } else {
      d.target = e.action === 'charge' ? 1.9 : 1.45; d.speed = 9; h.shake(e.action === 'charge' ? 0.3 : 0.16);
      if (e.action === 'shoot') h.flash(p, 3, 0xffc070);
      if (e.action === 'charge') h.flash(p, 14, 0xffd9a0);
      for (let i = 0; i < 6; i++) h.puff(p.clone().add(new THREE.Vector3(((i % 3) - 1) * 0.06, (i >> 1) * 0.05 - 0.05, 0)), 0.02, 0.1 + 0.02 * i, 1.1, 0.05, i % 2 ? 0x8f8068 : 0x6e5a42, 0.5);
    }
  }

  update(dt: number, at: (id: string) => UnitAt | null): void {
    const h = this._h;
    this._after.update(dt, at);
    const d = this._door;
    if (d) {
      d.open += Math.sign(d.target - d.open) * Math.min(Math.abs(d.target - d.open), d.speed * dt);
      const base = (d.pivot.userData as { base: number }).base;
      d.shudder = Math.max(0, d.shudder - dt);
      d.pivot.rotation.y = base + d.open + Math.sin(d.shudder * 70) * d.shudder * 0.18;
    }
    if (this._packs) {
      let n = 0;
      for (const p of this._packOf) {
        const u = at(p.unit);
        if (!u || u.dead || u.gone) continue;
        // on the back, a little above the shoulder
        this._e.set(0, u.rot, 0);
        this._q.setFromEuler(this._e);
        this._m.compose(new THREE.Vector3(u.x - Math.sin(u.rot) * 0.045, h.ground(u.x, u.z) + u.y + 0.17, u.z - Math.cos(u.rot) * 0.045), this._q, new THREE.Vector3(1, 1, 1));
        this._packs.setMatrixAt(n, this._m);
        this._packs.setColorAt(n, this._c.setHex(p.color));
        n++;
      }
      this._packs.count = n;
      this._packs.instanceMatrix.needsUpdate = true;
      if (this._packs.instanceColor) this._packs.instanceColor.needsUpdate = true;
    }
    // a flare: a hard red-white light high over the yard, drifting down, for its seconds (it refreshes a light of the battle renderer's own pool: no new light, no new shader)
    for (let i = this._flares.length - 1; i >= 0; i--) {
      const f = this._flares[i];
      f.age += dt; f.acc += dt;
      if (f.age > f.secs) { this._flares.splice(i, 1); continue; }
      if (f.acc < 0.12) continue;
      f.acc = 0;
      const rise = Math.min(1, f.age / 1.2), fall = Math.max(0, (f.age - 1.2) / Math.max(1, f.secs - 1.2)), y = h.ground(f.x, f.z) + 1.5 * rise * (1 - 0.6 * fall), fade = Math.min(1, (f.secs - f.age) / 2);
      h.flash(new THREE.Vector3(f.x + Math.sin(f.age * 0.7) * 0.2, y, f.z), 9 * fade + 1, 0xff9a80);
      h.puff(new THREE.Vector3(f.x + Math.sin(f.age * 0.7) * 0.2, y, f.z), 0.03, 0.09, 0.5, 0, 0xffb090, 0.9, true);
    }
    if (this._dog) {
      // barking: the head jerks up and back three times a second, and he turns to face the drive
      const d = this._dog; d.age += dt;
      const bark = Math.max(0, Math.sin(d.age * 18)) * (Math.sin(d.age * 3) > 0 ? 1 : 0.2);
      d.head.position.y = 0.105 + bark * 0.018; d.head.rotation.z = bark * 0.35;
      d.mesh.rotation.y = Math.atan2(d.x - this.centerOf().x, d.z - this.centerOf().z) - Math.PI / 2 + 0.4;
      if (d.age > 3 && Math.floor(d.age * 3) !== Math.floor((d.age - dt) * 3) && bark > 0.3) h.puff(new THREE.Vector3(d.x, h.ground(d.x, d.z) + 0.12, d.z), 0.01, 0.05, 0.4, 0.02, 0xdddddd, 0.15);
    }
    if (this._flagMesh) {
      let n = 0;
      for (const id of this._flagOf) {
        const u = at(id);
        if (!u || u.dead || u.gone) continue;
        // held up in the right hand, the cloth streaming a little in the wind
        this._e.set(0, u.rot + Math.sin(this._tFlag * 3) * 0.08, 0);
        this._q.setFromEuler(this._e);
        this._m.compose(new THREE.Vector3(u.x + Math.cos(u.rot) * 0.045, h.ground(u.x, u.z) + u.y + 0.09, u.z - Math.sin(u.rot) * 0.045), this._q, new THREE.Vector3(1, 1, 1));
        this._flagMesh.setMatrixAt(n++, this._m);
      }
      this._flagMesh.count = n; this._flagMesh.instanceMatrix.needsUpdate = true;
      this._tFlag += dt;
    }
    for (const f of this._fires) {
      f.age += dt; f.acc += dt;
      // the fire spreads: a few seconds on, a second one takes along the wall (at most MAX_FIRES burning), and the smoke piles up thick enough to hide the yard behind it
      if (!f.spread && f.age > 7 && this._fires.length < MAX_FIRES) { f.spread = true; const a = f.x * 12.9898 + f.z * 78.233; this._fires.push({ x: f.x + Math.cos(a) * 0.5, z: f.z + Math.sin(a) * 0.5, big: f.big, age: 0, acc: 0 }); }
      // the firelight: ONE steady light per fire, brightening over the first seconds and then only breathing (two slow sines, under 10 % either way): a fire
      // lights a room evenly, it does not strobe (the old on-off flash every half second made the interior flicker between red and dark)
      { const i = this._fires.indexOf(f), grow0 = Math.min(1, f.age / 6), target = (4 * grow0 + 1.2) * (1 + 0.06 * Math.sin(f.age * 1.9 + i) + 0.04 * Math.sin(f.age * 3.1 + i * 2));
        f.light = (f.light ?? 0) + (target - (f.light ?? 0)) * Math.min(1, dt * 2.5);
        h.glow?.(i, new THREE.Vector3(f.x, h.ground(f.x, f.z) + 0.25, f.z), f.light, 0xff8a30); }
      f.smoke = (f.smoke ?? 0) + dt;
      if (f.smoke > 0.45) { f.smoke = 0; const yy = h.ground(f.x, f.z); h.puff(new THREE.Vector3(f.x, yy + 0.3, f.z), 0.15, 0.9 + Math.min(1, f.age / 10) * 0.6, 5, 0.25, 0x2a2826, 0.42); }
      if (f.acc < (f.big ? 0.1 : 0.16)) continue;
      f.acc = 0;
      const y = h.ground(f.x, f.z), r = f.big ? 0.45 : 0.14, grow = Math.min(1, f.age / 6);
      const jx = (Math.sin(f.age * 7.3) * 0.5) * r * grow, jz = (Math.cos(f.age * 5.1) * 0.5) * r * grow;
      h.puff(new THREE.Vector3(f.x + jx, y + 0.05, f.z + jz), 0.05 * (0.5 + grow), 0.18 * (0.5 + grow) * (f.big ? 2 : 1), 0.7, 0.28, 0xff7a24, 0.9, true);
      h.puff(new THREE.Vector3(f.x - jx, y + 0.2 * grow, f.z - jz), 0.1, 0.5 * (f.big ? 2 : 1), 2.6, 0.45, 0x2a2826, 0.55);
    }
  }
}
