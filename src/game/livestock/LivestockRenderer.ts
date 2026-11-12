/**
 * LivestockRenderer — the farm animals (goats, sheep, cows, steers, pigs, rabbits, hens) as small procedural quadrupeds and birds, three instanced
 * draws for all of them (body, head, legs), no shadows, no SSAO. They walk between the paddock and their barn, coop or barnyard on the same ground rules
 * as the wildlife and the people: round walls, cliffs and buildings by the route search (game/paths/groundMovers), never over them; slower on a slope;
 * hurrying to the innermost shelter when the place is raided (livestockPlan). SCALE v2: a person is 0.28, a cow 0.23 at the withers.
 */
import * as THREE from 'three';
import type { Pt } from '../../sim/pathRoute';
import { animalGoal, doorOf, drawnHerd, type AnimalGoal, type Home, type HerdCtx, type StockKind } from './livestockPlan';
import { slopePace } from '../paths/walkRoute';
import { climbLimit, gradeBetween } from '../paths/groundMovers';
import { bodyGeometry, headGeometry, legGeometry } from './livestockGeometry';

const CAP = 64;
const LEGS = 4;

interface Look { h: number; len: number; wid: number; col: number; head: number; speed: number; legK: number; /** Neck angle above the horizontal (rad). */ up: number }
/** Size (world units), colour and pace (units per second at 1x) of each kind. */
export const LOOK: Record<StockKind, Look> = {
  cow: { h: 0.23, len: 0.3, wid: 0.075, col: 0x9a6a46, head: 0.042, speed: 0.17, legK: 0.45, up: 0.35 },
  steer: { h: 0.21, len: 0.28, wid: 0.07, col: 0x7a4a2e, head: 0.04, speed: 0.17, legK: 0.45, up: 0.35 },
  goat: { h: 0.12, len: 0.15, wid: 0.045, col: 0xd9d2c2, head: 0.024, speed: 0.22, legK: 0.5, up: 0.65 },
  sheep: { h: 0.12, len: 0.16, wid: 0.065, col: 0xe6e0d2, head: 0.024, speed: 0.2, legK: 0.35, up: 0.5 },
  pig: { h: 0.11, len: 0.2, wid: 0.07, col: 0xe0a39a, head: 0.03, speed: 0.2, legK: 0.3, up: -0.15 },
  rabbit: { h: 0.045, len: 0.07, wid: 0.025, col: 0xb9a48a, head: 0.016, speed: 0.28, legK: 0.3, up: 0.5 },
  hen: { h: 0.065, len: 0.07, wid: 0.03, col: 0x9a5a34, head: 0.014, speed: 0.2, legK: 0.35, up: 1.0 },
};

interface Agent {
  id: string; kind: StockKind;
  x: number; z: number; rot: number; phase: number; tone: number;
  via: Pt[]; viaFor: string; wait: number;
  inside: boolean; v: number;
  /** Homes this animal found no way to (across the creek, behind a wall): the plan picks another. */
  noWay: Set<string>; homeId: string | null;
}

const tmpM = new THREE.Matrix4(), tmpL = new THREE.Matrix4(), tmpB = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpE = new THREE.Euler(),
  tmpV = new THREE.Vector3(), tmpS = new THREE.Vector3(), tmpC = new THREE.Color();
const hash = (s: string, k: number): number => { let h = 2166136261 ^ k; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return ((h >>> 0) % 10000) / 10000; };

/**
 * Keep the animals apart: the spots they are sent to (a hash in front of the barn) are pushed apart until no two bodies touch, and kept out of the
 * strip in front of the door where the building stands. Only the ones out in the field (not going in, not on the alarm) are moved. Pure (tested).
 */
export function spreadGoals(herd: ReadonlyArray<{ id: string; kind: StockKind }>, goals: AnimalGoal[], homes: readonly Home[]): void {
  const idx: number[] = [];
  for (let i = 0; i < goals.length; i++) if (!goals[i].inside && !goals[i].panic) idx.push(i);
  const rad = (i: number): number => LOOK[herd[i].kind].len * 0.5 + 0.09;
  const byId = new Map(homes.map(h => [h.id, h]));
  for (let it = 0; it < 40; it++) {
    for (let p = 0; p < idx.length; p++) for (let q = p + 1; q < idx.length; q++) {
      const A = goals[idx[p]], B = goals[idx[q]];
      let dx = B.x - A.x, dz = B.z - A.z, d = Math.hypot(dx, dz);
      const need = rad(idx[p]) + rad(idx[q]);
      if (d >= need) continue;
      if (d < 1e-4) { const t = (p * 7 + q * 3) * 0.9; dx = Math.cos(t); dz = Math.sin(t); d = 1; }
      const push = (need - d) / 2 + 0.002;
      A.x -= dx / d * push; A.z -= dz / d * push; B.x += dx / d * push; B.z += dz / d * push;
    }
    for (const i of idx) {
      const g = goals[i], home = g.home ? byId.get(g.home) : undefined;
      if (!home) continue;
      const door = doorOf(home), out = (g.x - door.x) * door.ux + (g.z - door.z) * door.uz, min = 0.3 + LOOK[herd[i].kind].len * 0.5;
      if (out < min) { g.x += door.ux * (min - out); g.z += door.uz * (min - out); }
    }
  }
}

export interface LivestockCtx {
  ground: (x: number, z: number) => number;
  /** The way from a to b for this kind: [] = straight, null = none (game/paths/groundMovers animalRoute over the walk world). */
  via: (kind: StockKind, a: Pt, b: Pt) => Pt[] | null;
}

export class LivestockRenderer {
  private readonly _body: THREE.InstancedMesh;
  private readonly _head: THREE.InstancedMesh;
  private readonly _leg: THREE.InstancedMesh;
  private readonly _agents = new Map<string, Agent>();
  private readonly _scene: THREE.Scene;
  private _budget = 0;
  private _age = 0;
  /** Kinds that found no way to a shelter since the last `takeNoWay` (the world writes one log line for them). */
  private readonly _noWay = new Set<StockKind>();
  takeNoWay(): StockKind[] { const o = [...this._noWay]; this._noWay.clear(); return o; }

  constructor(scene: THREE.Scene) {
    this._scene = scene;
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, metalness: 0, vertexColors: true });
    const mk = (name: string, g: THREE.BufferGeometry, per: number): THREE.InstancedMesh => {
      const m = new THREE.InstancedMesh(g, mat, CAP * per);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(CAP * per * 3), 3);
      m.count = 0; m.castShadow = false; m.receiveShadow = false; m.frustumCulled = false;
      m.name = `stock_${name}`; m.userData = { type: 'livestock', noSSAO: true };
      scene.add(m);
      return m;
    };
    this._body = mk('body', bodyGeometry(), 1);
    this._head = mk('head', headGeometry(), 1);          // (neck, skull, muzzle and ears are one merged mesh)
    this._leg = mk('leg', legGeometry(), LEGS);
  }

  /** Where the animals are (QA / tests). */
  animals(): Array<{ id: string; kind: StockKind; x: number; z: number; inside: boolean; moving: boolean; wait: number; legs: number; goal: string }> {
    return [...this._agents.values()].map(a => ({ id: a.id, kind: a.kind, x: a.x, z: a.z, inside: a.inside, moving: a.v > 0.01, wait: a.wait, legs: a.via.length, goal: a.viaFor }));
  }

  update(dt: number, stock: Readonly<Record<string, number>>, coops: number, homes: readonly Home[], c: HerdCtx, ctx: LivestockCtx, speedK: number, cam?: { x: number; z: number }): void {
    const herd = drawnHerd(stock, coops).slice(0, CAP), live = new Set(herd.map(a => a.id));
    for (const k of [...this._agents.keys()]) if (!live.has(k)) this._agents.delete(k);
    this._budget = 3;
    this._age += dt;
    if (this._age > 90) { this._age = 0; for (const a of this._agents.values()) a.noWay.clear(); }     // (the layout may have changed: look again)
    const k = Math.max(1, Math.min(3, speedK));
    const goals = herd.map(h => animalGoal(h, homes, c, this._agents.get(h.id)?.noWay));
    spreadGoals(herd, goals, homes);
    for (let gi = 0; gi < herd.length; gi++) {
      const h = herd[gi], goal = goals[gi];
      let a = this._agents.get(h.id);
      if (!a) {
        // a new animal starts at its own spot (a load puts everyone where they belong)
        a = { id: h.id, kind: h.kind, x: goal.x, z: goal.z, rot: hash(h.id, 9) * 6.28, phase: hash(h.id, 8) * 6, tone: hash(h.id, 7), via: [], viaFor: '', wait: 0, inside: goal.inside, v: 0, noWay: new Set(), homeId: goal.home };
        this._agents.set(h.id, a);
      }
      this._step(a, goal, dt, k, ctx);
    }
    this._separate(dt * k);
    this._draw(herd, ctx, cam);
  }

  /** Bodies in the field never stand inside each other: two that meet (one walked up to the other's spot) ease apart. */
  private _separate(dt: number): void {
    const out = [...this._agents.values()].filter(a => !a.inside);
    for (let i = 0; i < out.length; i++) for (let j = i + 1; j < out.length; j++) {
      const A = out[i], B = out[j], need = (LOOK[A.kind].len + LOOK[B.kind].len) * 0.42;
      let dx = B.x - A.x, dz = B.z - A.z, d = Math.hypot(dx, dz);
      if (d >= need) continue;
      if (d < 1e-4) { dx = 1; dz = 0; d = 1; }
      const m = Math.min(need - d, 1.0 * dt + 0.002) / 2;
      A.x -= dx / d * m; A.z -= dz / d * m; B.x += dx / d * m; B.z += dz / d * m;
    }
  }

  private _step(a: Agent, goal: AnimalGoal, dt: number, k: number, ctx: LivestockCtx): void {
    a.homeId = goal.home;
    const look = LOOK[a.kind], key = `${goal.x.toFixed(1)},${goal.z.toFixed(1)}`;
    a.v = 0;
    const away = Math.hypot(goal.x - a.x, goal.z - a.z);
    if (away > 40) { a.x = goal.x; a.z = goal.z; a.via = []; a.viaFor = key; a.inside = goal.inside; return; }       // far (a load, a long skip): simply there
    if (a.wait > 0) { a.wait -= dt; return; }
    if (a.viaFor !== key) {
      if (away > 0.05 && this._budget > 0) {
        this._budget--;
        const r = ctx.via(a.kind, [a.x, a.z], [goal.x, goal.z]);
        if (r === null) {                                    // no way there (across the creek, walled in): another home next time, or it waits and looks again
          if (goal.home) { a.noWay.add(goal.home); this._noWay.add(a.kind); }
          a.wait = 0.5; return;
        }
        a.via = [...r];
        a.viaFor = key;
      } else if (away <= 0.05) { a.viaFor = key; a.via = []; } else return;
    }
    while (a.via.length && Math.hypot(a.via[0][0] - a.x, a.via[0][1] - a.z) < 0.05) a.via.shift();
    const tx = a.via.length ? a.via[0][0] : goal.x, tz = a.via.length ? a.via[0][1] : goal.z, dx = tx - a.x, dz = tz - a.z, d = Math.hypot(dx, dz);
    if (d > 0.03) {
      a.inside = false;
      const grade = gradeBetween(ctx.ground, [a.x, a.z], [tx, tz]);
      const v = look.speed * k * (goal.panic ? 2.4 : 1) * slopePace(Math.min(grade, climbLimit(a.kind)));
      const step = Math.min(d, v * dt);
      a.x += dx / d * step; a.z += dz / d * step; a.v = v;
      a.phase += dt * v * 9 / Math.max(0.05, look.h * 4);
      a.rot += Math.atan2(Math.sin(Math.atan2(dx, dz) - a.rot), Math.cos(Math.atan2(dx, dz) - a.rot)) * Math.min(1, dt * 6);
    } else if (!a.via.length) {
      a.inside = goal.inside;
      // grazing: the head goes down now and then (no motion), nothing more to do
    }
  }

  private _draw(herd: ReadonlyArray<{ id: string; kind: StockKind }>, ctx: LivestockCtx, cam?: { x: number; z: number }): void {
    let nb = 0, nh = 0, nl = 0;
    const put = (m: THREE.InstancedMesh, i: number, col: number, tone: number) => {
      m.setMatrixAt(i, tmpM);
      tmpC.setHex(col).multiplyScalar(0.9 + tone * 0.2);
      m.setColorAt(i, tmpC);
    };
    for (const h of herd) {
      const a = this._agents.get(h.id);
      if (!a || a.inside) continue;
      if (cam && Math.abs(a.x - cam.x) + Math.abs(a.z - cam.z) > 140) continue;
      const L = LOOK[a.kind], gy = ctx.ground(a.x, a.z);
      tmpB.compose(tmpV.set(a.x, gy, a.z), tmpQ.setFromEuler(tmpE.set(0, a.rot, 0)), tmpS.set(1, 1, 1));
      const legLen = L.h * L.legK, bh = (L.h - legLen) * 0.52, by = legLen * 0.82 + bh, swing = a.v > 0.01 ? Math.sin(a.phase) * 0.5 : 0;
      const loc = (x: number, y: number, z: number, rx: number, sx: number, sy: number, sz: number) => {
        tmpL.compose(tmpV.set(x, y, z), tmpQ.setFromEuler(tmpE.set(rx, 0, 0)), tmpS.set(sx, sy, sz));
        tmpM.multiplyMatrices(tmpB, tmpL);
      };
      const bodyCol = a.kind === 'cow' ? [0xe6e0d4, 0x9a6a46, 0x5a4636, 0xc9b79a][Math.floor(hash(a.id, 1) * 4)] : L.col;
      // wool and fat make a sheep and a pig a little rounder than the frame under them
      const fat = a.kind === 'sheep' ? 1.18 : a.kind === 'pig' ? 1.1 : 1;
      loc(0, by, 0, 0, L.wid * 0.55 * fat, bh * fat, L.len / 2);
      put(this._body, nb++, bodyCol, a.tone);
      const grazing = a.v < 0.01 && hash(a.id, 6) < 0.7 && Math.sin(a.phase * 0.1 + hash(a.id, 5) * 9 + performance.now() / 2600) > 0.1;
      // the neck is part of the head mesh: it starts at the withers and runs up (or down, grazing) to the skull
      const th = grazing ? -0.95 : L.up, nk = 2.6 * L.head;
      loc(0, by + bh * 0.45 + Math.sin(th) * nk, L.len * 0.4 + Math.cos(th) * nk, -th, L.head, L.head, L.head);
      put(this._head, nh++, a.kind === 'cow' ? 0xc9a98a : a.kind === 'sheep' ? 0x6a5c4c : L.col, a.tone);
      for (let i = 0; i < LEGS; i++) {
        const fz = (i < 2 ? 1 : -1) * L.len * 0.3, fx = (i % 2 ? 1 : -1) * L.wid * 0.6, sw = swing * ((i < 2) === (i % 2 === 0) ? 1 : -1), r = Math.max(0.007, L.h * 0.085);
        loc(fx, by - bh * 0.2, fz, sw, r, by - bh * 0.2, r);
        put(this._leg, nl, a.kind === 'sheep' ? 0x4a4540 : bodyCol, a.tone * 0.7);
        nl++;
      }
    }
    for (const [m, n] of [[this._body, nb], [this._head, nh], [this._leg, nl]] as const) {
      m.count = n; m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
  }

  dispose(): void {
    for (const m of [this._body, this._head, this._leg]) { this._scene.remove(m); m.geometry.dispose(); }
    (this._body.material as THREE.Material).dispose();
  }
}
