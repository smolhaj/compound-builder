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
import { LODS, type Lod } from './animalKit';
import { animalMaterial } from './animalMaterial';
import { modelFor, modelOf, type ModelId } from './animalModels';
import type { AnimalModel } from './animalParts';

const CAP = 64;
/** SCALE v2: the models are built in metres; 1 world unit is 6 m. */
export const UNIT = 1 / 6;

interface Look { len: number; speed: number }
/** Spacing (body length in world units) and pace (units per second at 1x) of each kind. */
export const LOOK: Record<StockKind, Look> = {
  cow: { len: 0.4, speed: 0.17 },
  steer: { len: 0.38, speed: 0.17 },
  goat: { len: 0.2, speed: 0.22 },
  sheep: { len: 0.2, speed: 0.2 },
  pig: { len: 0.24, speed: 0.2 },
  rabbit: { len: 0.08, speed: 0.28 },
  hen: { len: 0.09, speed: 0.2 },
};

export type Quality = 'high' | 'medium' | 'low';
/** Level of detail by distance: the three meshes a quality tier draws (near, mid, far) and the distances (world units) they switch at. */
export function lodTier(q: Quality): { lods: [Lod, Lod, Lod]; at: [number, number] } {
  return q === 'high' ? { lods: [LODS[0], LODS[2], LODS[3]], at: [9, 24] } : q === 'medium' ? { lods: [LODS[1], LODS[2], LODS[3]], at: [7, 18] } : { lods: [LODS[2], LODS[3], LODS[3]], at: [5, 12] };
}

interface Agent {
  id: string; kind: StockKind;
  x: number; z: number; rot: number; phase: number; tone: number;
  via: Pt[]; viaFor: string; wait: number;
  inside: boolean; v: number;
  /** Size variation (1 +- 5 %). */
  size: number;
  /** Heading into its shelter (the ones queueing at a door do not shove each other). */
  goingIn: boolean;
  /** Animation state: gait amplitude 0..1 and the grazing amount 0..1, both eased. */
  gait: number; graze: number;
  /** Homes this animal found no way to (across the creek, behind a wall): the plan picks another. */
  noWay: Set<string>; homeId: string | null;
}

const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpQ2 = new THREE.Quaternion(), tmpE = new THREE.Euler(), tmpV = new THREE.Vector3(), tmpS = new THREE.Vector3(), tmpN = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
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

/** One thing to draw in a QA preview (scripts/animalviewer.js): an animal of a kind and breed standing, walking, grazing. */
export interface PreviewAnimal { kind: StockKind; breed?: number; rooster?: boolean; x: number; z: number; rot: number; gait?: number; phase?: number; graze?: number; seed?: number; scale?: number }

interface Batch { mesh: THREE.InstancedMesh; anim: Float32Array; coat: Float32Array; n: number }

export class LivestockRenderer {
  private readonly _batches = new Map<string, Batch>();
  private readonly _mats = new Map<ModelId, { model: AnimalModel; material: THREE.MeshStandardMaterial; uniforms: Record<string, { value: unknown }> }>();
  private readonly _geos = new Map<string, THREE.BufferGeometry>();
  private readonly _agents = new Map<string, Agent>();
  private readonly _scene: THREE.Scene;
  private _budget = 0;
  private _age = 0;
  private _time = 0;
  private _quality: Quality = 'medium';
  /** Kinds that found no way to a shelter since the last `takeNoWay` (the world writes one log line for them). */
  private readonly _noWay = new Set<StockKind>();
  takeNoWay(): StockKind[] { const o = [...this._noWay]; this._noWay.clear(); return o; }

  /** A soft contact shadow under every animal: one transparent instanced mesh for all of them (no shadow-map casters, no SSAO). */
  private _shadow: THREE.InstancedMesh | null = null;
  private _shadowN = 0;

  constructor(scene: THREE.Scene) { this._scene = scene; }

  private _shadowMesh(): THREE.InstancedMesh {
    if (this._shadow) return this._shadow;
    const N = 32, d = new Uint8Array(N * N * 4);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const r = Math.hypot((i + 0.5) / N - 0.5, (j + 0.5) / N - 0.5) * 2, v = Math.round(255 * Math.pow(Math.max(0, 1 - r), 1.4));
      d.set([v, v, v, 255], (j * N + i) * 4);
    }
    const tex = new THREE.DataTexture(d, N, N, THREE.RGBAFormat); tex.magFilter = tex.minFilter = THREE.LinearFilter; tex.needsUpdate = true;
    const mat = new THREE.MeshBasicMaterial({ color: 0x14130e, alphaMap: tex, transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const m = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), mat, CAP);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.count = 0; m.visible = false; m.frustumCulled = false; m.castShadow = false; m.receiveShadow = false; m.renderOrder = 1;
    m.name = 'stock_shadow'; m.userData = { type: 'livestock', noSSAO: true };
    this._scene.add(m);
    this._shadow = m;
    return m;
  }

  /** The draw detail tier (rebuilds the meshes lazily at the next draw when it changes). */
  setQuality(q: Quality): void {
    if (q === this._quality) return;
    this._quality = q;
    for (const b of this._batches.values()) { this._scene.remove(b.mesh); b.mesh.dispose(); }
    this._batches.clear();
    for (const g of this._geos.values()) g.dispose();
    this._geos.clear();
  }

  private _model(id: ModelId): { model: AnimalModel; material: THREE.MeshStandardMaterial; uniforms: Record<string, { value: unknown }> } {
    let m = this._mats.get(id);
    if (!m) { const model = modelOf(id); m = { model, ...animalMaterial(model.spec) }; this._mats.set(id, m); }
    return m;
  }

  private _batch(id: ModelId, li: number): Batch {
    const key = `${id}|${li}`;
    let b = this._batches.get(key);
    if (b) return b;
    const { model, material } = this._model(id), lod = lodTier(this._quality).lods[li];
    const gk = `${id}|${lod.seg}|${lod.sub}|${lod.detail}`;
    let g = this._geos.get(gk);
    if (!g) {
      g = model.build(lod).clone();
      this._geos.set(gk, g);
    }
    const geo = g.clone();       // (own instanced attributes per mesh)
    const anim = new Float32Array(CAP * 4), coat = new Float32Array(CAP * 4);
    geo.setAttribute('iAnim', new THREE.InstancedBufferAttribute(anim, 4).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('iCoat', new THREE.InstancedBufferAttribute(coat, 4).setUsage(THREE.DynamicDrawUsage));
    const mesh = new THREE.InstancedMesh(geo, material, CAP);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.count = 0; mesh.visible = false; mesh.castShadow = false; mesh.receiveShadow = false; mesh.frustumCulled = false;
    mesh.name = `stock_${id}_${li}`; mesh.userData = { type: 'livestock', noSSAO: true };
    this._scene.add(mesh);
    b = { mesh, anim, coat, n: 0 };
    this._batches.set(key, b);
    return b;
  }

  /** QA: draw exactly these animals (no simulation, no goals). */
  preview(items: readonly PreviewAnimal[], lod = 0): void {
    this._time += 0.016;
    for (const b of this._batches.values()) b.n = 0;
    this._shadowN = 0;
    items.forEach((it, i) => this._put(it.kind, !!it.rooster, it.breed ?? 0, it.x, 0, it.z, it.rot, it.phase ?? 0, it.gait ?? 0, it.graze ?? 0, it.seed ?? ((i * 0.37) % 1), it.scale ?? 1, 0.5, lod));
    this._flush();
  }

  /** Where the animals are (QA / tests). */
  animals(): Array<{ id: string; kind: StockKind; x: number; z: number; inside: boolean; moving: boolean; wait: number; legs: number; goal: string }> {
    return [...this._agents.values()].map(a => ({ id: a.id, kind: a.kind, x: a.x, z: a.z, inside: a.inside, moving: a.v > 0.01, wait: a.wait, legs: a.via.length, goal: a.viaFor }));
  }

  update(dt: number, stock: Readonly<Record<string, number>>, coops: number, homes: readonly Home[], c: HerdCtx, ctx: LivestockCtx, speedK: number, cam?: { x: number; z: number; y?: number }): void {
    const herd = drawnHerd(stock, coops).slice(0, CAP), live = new Set(herd.map(a => a.id));
    for (const k of [...this._agents.keys()]) if (!live.has(k)) this._agents.delete(k);
    this._budget = 3;
    this._age += dt;
    this._time += dt;
    if (this._age > 90) { this._age = 0; for (const a of this._agents.values()) a.noWay.clear(); }     // (the layout may have changed: look again)
    const k = Math.max(1, Math.min(3, speedK));
    const goals = herd.map(h => animalGoal(h, homes, c, this._agents.get(h.id)?.noWay));
    spreadGoals(herd, goals, homes);
    for (let gi = 0; gi < herd.length; gi++) {
      const h = herd[gi], goal = goals[gi];
      let a = this._agents.get(h.id);
      if (!a) {
        // a new animal starts at its own spot (a load puts everyone where they belong)
        a = { id: h.id, kind: h.kind, x: goal.x, z: goal.z, rot: hash(h.id, 9) * 6.28, phase: hash(h.id, 8) * 6, tone: hash(h.id, 7), via: [], viaFor: '', wait: 0, inside: goal.inside, v: 0, goingIn: goal.inside, size: 0.95 + hash(h.id, 11) * 0.1, gait: 0, graze: 0, noWay: new Set(), homeId: goal.home };
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
      const A = out[i], B = out[j];
      if (A.goingIn || B.goingIn) continue;
      const need = (LOOK[A.kind].len + LOOK[B.kind].len) * 0.42;
      let dx = B.x - A.x, dz = B.z - A.z, d = Math.hypot(dx, dz);
      if (d >= need) continue;
      if (d < 1e-4) { dx = 1; dz = 0; d = 1; }
      const m = Math.min(need - d, 1.0 * dt + 0.002) / 2;
      A.x -= dx / d * m; A.z -= dz / d * m; B.x += dx / d * m; B.z += dz / d * m;
    }
  }

  private _step(a: Agent, goal: AnimalGoal, dt: number, k: number, ctx: LivestockCtx): void {
    a.homeId = goal.home;
    a.goingIn = goal.inside;
    a.gait *= Math.max(0, 1 - dt * 5);
    const look = LOOK[a.kind], key = `${goal.x.toFixed(1)},${goal.z.toFixed(1)}`;
    a.v = 0;
    const away = Math.hypot(goal.x - a.x, goal.z - a.z);
    if (away > 40) { a.x = goal.x; a.z = goal.z; a.via = []; a.viaFor = key; a.inside = goal.inside; return; }       // far (a load, a long skip): simply there
    // at the door of its shelter (within a body length of the doorway: the wall stops it getting nearer) it goes in
    if (goal.inside && away < 0.4 + look.len * 0.5) { a.inside = true; a.via = []; a.viaFor = key; return; }
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
      a.phase += step * Math.PI * 2 / (modelOf(modelFor(a.kind, a.id)).stride * UNIT * a.size);
      a.gait += (Math.min(1.25, v / (look.speed * k)) - a.gait) * Math.min(1, dt * 6);
      a.rot += Math.atan2(Math.sin(Math.atan2(dx, dz) - a.rot), Math.cos(Math.atan2(dx, dz) - a.rot)) * Math.min(1, dt * 6);
    } else if (!a.via.length) {
      a.inside = goal.inside;
      // grazing: the head goes down now and then (no motion), nothing more to do
    }
  }

  /** Put one animal into its model / LOD batch. */
  private _put(kind: StockKind, rooster: boolean, breed: number, x: number, y: number, z: number, rot: number, phase: number, gait: number, graze: number, seed: number, size: number, tone: number, li: number, nx = 0, nz = 0): void {
    const id = modelFor(kind, rooster ? 'rooster' : 'x'), b = this._batch(id, li), { model } = this._model(id);
    if (b.n >= CAP) return;
    const nb = model.spec.breeds.length, bi = ((breed % nb) + nb) % nb, sc = UNIT * size * (model.spec.breeds[bi].size ?? 1);
    tmpM.compose(tmpV.set(x, y, z), tmpQ.setFromEuler(tmpE.set(0, rot, 0)), tmpS.set(sc, sc, sc));
    b.mesh.setMatrixAt(b.n, tmpM);
    b.anim.set([phase, gait, graze, seed], b.n * 4);
    b.coat.set([bi, seed, tone, 0], b.n * 4);
    b.n++;
    // contact shadow: an ellipse the length of the body, lying on the ground (tilted to the slope)
    const sh = this._shadowMesh();
    if (this._shadowN < CAP) {
      const hl = model.length * sc * 0.62, hw = hl * (kind === 'hen' || kind === 'rabbit' ? 0.7 : 0.5);
      tmpN.set(nx, 1, nz).normalize();
      tmpQ2.setFromUnitVectors(UP, tmpN);
      tmpQ.setFromEuler(tmpE.set(0, rot, 0)); tmpQ2.multiply(tmpQ);
      tmpM.compose(tmpV.set(x, y + 0.004, z), tmpQ2, tmpS.set(hw * 2, 1, hl * 2));
      sh.setMatrixAt(this._shadowN++, tmpM);
    }
  }

  private _flush(): void {
    if (this._shadow) { this._shadow.count = this._shadowN; this._shadow.visible = this._shadowN > 0; this._shadow.instanceMatrix.needsUpdate = true; }
    for (const [, b] of this._batches) {
      b.mesh.count = b.n; b.mesh.visible = b.n > 0;
      b.mesh.instanceMatrix.needsUpdate = true;
      (b.mesh.geometry.attributes.iAnim as THREE.BufferAttribute).needsUpdate = true;
      (b.mesh.geometry.attributes.iCoat as THREE.BufferAttribute).needsUpdate = true;
    }
    for (const m of this._mats.values()) m.uniforms.uTime.value = this._time;
  }

  private _draw(herd: ReadonlyArray<{ id: string; kind: StockKind }>, ctx: LivestockCtx, cam?: { x: number; z: number; y?: number }): void {
    for (const b of this._batches.values()) b.n = 0;
    this._shadowN = 0;
    const { at } = lodTier(this._quality);
    for (const h of herd) {
      const a = this._agents.get(h.id);
      if (!a || a.inside) continue;
      if (cam && Math.abs(a.x - cam.x) + Math.abs(a.z - cam.z) > 140) continue;
      const gy = ctx.ground(a.x, a.z);
      // grazing: now and then the head goes down (or the beak pecks); eased in and out
      const want = a.v < 0.01 && hash(a.id, 6) < 0.7 && Math.sin(this._time * 0.1 + hash(a.id, 5) * 9 + a.phase * 0.0 + (hash(a.id, 4) * 40)) > 0.1 ? 1 : 0;
      a.graze += (want - a.graze) * 0.06;
      const d = cam ? Math.hypot(a.x - cam.x, gy - (cam.y ?? gy + 8), a.z - cam.z) : 0, li = d < at[0] ? 0 : d < at[1] ? 1 : 2;
      this._put(a.kind, a.kind === 'hen' && h.id === 'hen0', Math.floor(hash(a.id, 1) * 4), a.x, gy, a.z, a.rot, a.phase, a.gait, a.graze, hash(a.id, 8), a.size, a.tone, li,
        (ctx.ground(a.x - 0.05, a.z) - ctx.ground(a.x + 0.05, a.z)) / 0.1, (ctx.ground(a.x, a.z - 0.05) - ctx.ground(a.x, a.z + 0.05)) / 0.1);
    }
    this._flush();
  }

  dispose(): void {
    for (const b of this._batches.values()) { this._scene.remove(b.mesh); b.mesh.geometry.dispose(); }
    for (const g of this._geos.values()) g.dispose();
    for (const m of this._mats.values()) m.material.dispose();
    this._batches.clear();
    if (this._shadow) { this._scene.remove(this._shadow); this._shadow.geometry.dispose(); (this._shadow.material as THREE.Material).dispose(); this._shadow = null; }
  }
}
