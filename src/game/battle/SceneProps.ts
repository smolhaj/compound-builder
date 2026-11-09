/**
 * The small props a cutscene's new beats need (sim/battleTypes.ts: house_door, loot, arson): the house door's leaf (shut, kicked, shot, swung open),
 * the loot carried off on people's backs, and fires set on purpose. Built when first used, fixed caps (one door leaf, 12 packs in ONE instanced
 * mesh, 4 fires), and `end` takes every mesh, geometry and material away so repeated raids leave nothing behind (the leak test counts them).
 * Scale: 1 unit = 6 m; a door is 0.17 wide and 0.37 tall.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { BattleEvent } from '../../sim/battleTypes';

export interface PropHooks {
  ground: (x: number, z: number) => number;
  puff: (p: THREE.Vector3, r0: number, r1: number, life: number, rise: number, color: number, o0: number, glow?: boolean) => void;
  flash: (p: THREE.Vector3, k: number, color: number) => void;
  shake: (v: number) => void;
}
export interface UnitAt { x: number; y: number; z: number; rot: number; dead: boolean; gone: boolean }

const MAX_PACKS = 12, MAX_FIRES = 4, MAX_LADDERS = 10;
const DOOR_W = 0.17, DOOR_H = 0.37;
/** What a pack looks like by item (colors only: one box shape). */
const ITEM_COLOR: Record<string, number> = { food: 0x8a6a3a, canned: 0x7a5a2c, fuel: 0xa8321e, meds: 0xd9d9d0, ammo: 0x3d4a2a, tools: 0x555a60, guns: 0x222426, radio: 0x2c3a44, bedding: 0x6a5a7a, default: 0x6a5238 };
/** The pack color for what the sim says was taken ("3 cans of fuel", "canned food", ...). */
export const lootKind = (what: string): string => /fuel|gas|diesel/i.test(what) ? 'fuel' : /med|first aid|ifak/i.test(what) ? 'meds' : /ammo|round/i.test(what) ? 'ammo' : /gun|rifle|weapon/i.test(what) ? 'guns' : /tool/i.test(what) ? 'tools' : /radio/i.test(what) ? 'radio' : /food|can|flour|rice|meat|egg|bean|stap/i.test(what) ? 'food' : 'default';
export const itemColor = (item: string): number => ITEM_COLOR[item] ?? ITEM_COLOR.default;

interface Door { pivot: THREE.Group; leaf: THREE.Mesh; nx: number; nz: number; open: number; target: number; speed: number; shudder: number }
interface Fire { x: number; z: number; big: boolean; age: number; acc: number }

export class SceneProps {
  private _door: Door | null = null;
  private _packs: THREE.InstancedMesh | null = null;
  private _packOf: Array<{ unit: string; color: number }> = [];
  private _fires: Fire[] = [];
  private _ladders: { x: number; z: number; h: number; fx: number; fz: number }[] = [];
  private _ladderMesh: THREE.InstancedMesh | null = null;
  private readonly _m = new THREE.Matrix4();
  private readonly _q = new THREE.Quaternion();
  private readonly _e = new THREE.Euler();
  private readonly _c = new THREE.Color();
  private _geo: THREE.BufferGeometry[] = [];
  private _mat: THREE.Material[] = [];
  private readonly _group: THREE.Group;
  private readonly _h: PropHooks;
  constructor(group: THREE.Group, hooks: PropHooks) { this._group = group; this._h = hooks; }

  /** Counts for the leak test. */
  get live(): { door: boolean; packs: number; fires: number; ladders: number } { return { door: !!this._door, packs: this._packOf.length, fires: this._fires.length, ladders: this._ladders.length }; }

  end(): void {
    if (this._door) this._group.remove(this._door.pivot);
    if (this._packs) this._group.remove(this._packs);
    if (this._ladderMesh) this._group.remove(this._ladderMesh);
    this._ladderMesh = null; this._ladders = [];
    this._door = null; this._packs = null; this._packOf = []; this._fires = [];
    for (const g of this._geo) g.dispose();
    for (const m of this._mat) m.dispose();
    this._geo = []; this._mat = [];
  }

  onEvent(e: BattleEvent): void {
    if (e.kind === 'house_door') this._doorEvent(e);
    else if (e.kind === 'ladder') this._addLadder(e);
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
    for (const f of this._fires) {
      f.age += dt; f.acc += dt;
      if (f.acc < (f.big ? 0.1 : 0.16)) continue;
      f.acc = 0;
      const y = h.ground(f.x, f.z), r = f.big ? 0.45 : 0.14, grow = Math.min(1, f.age / 6);
      const jx = (Math.sin(f.age * 7.3) * 0.5) * r * grow, jz = (Math.cos(f.age * 5.1) * 0.5) * r * grow;
      h.puff(new THREE.Vector3(f.x + jx, y + 0.05, f.z + jz), 0.05 * (0.5 + grow), 0.18 * (0.5 + grow) * (f.big ? 2 : 1), 0.7, 0.28, 0xff7a24, 0.9, true);
      h.puff(new THREE.Vector3(f.x - jx, y + 0.2 * grow, f.z - jz), 0.1, 0.5 * (f.big ? 2 : 1), 2.6, 0.45, 0x2a2826, 0.55);
      if (Math.floor(f.age * 4) % 2 === 0) h.flash(new THREE.Vector3(f.x, y + 0.2, f.z), 5 * grow + 1, 0xff8a30);
    }
  }
}
