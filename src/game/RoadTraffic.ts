/**
 * Life on the county road: the cars, trucks, bus, tractors, cyclists, wanderers, convoys and roving crews that pass the place, the cars
 * that died on it, and the parties that stand for real encounters (sim/roadTraffic.ts decides all of it; this plays it).
 *
 * Cost: every vehicle and person is one instance of one BatchedMesh (a single draw call for the whole road, no shadows), headlights and
 * taillights one additive InstancedMesh (a second); both are hidden while nothing is on the road. Movement is in world seconds
 * (real seconds x the speed factor, capped at 4, like the delivery truck); nothing is saved: the parties are a function of the seed.
 */
import * as THREE from 'three';
import { buildTrafficGeometries, CLOTHES, PAINT, RAIDER_PAINT, TINTED } from './props/trafficGeometry';
import {
  APPROACH, LEAD, LENGTH, MAX_SHOWN, RAID_LIKE, SLOT, WINDOW, partyForEncounter, spawnFor, stalledCars, trafficLevel,
  type Member, type MemberKind, type RoadParty, type StalledCar, type TrafficCtx, type TrafficLevel, approachDistance,
} from '../sim/roadTraffic';
import { hourOf, type GameState } from '../sim/state';
import { REAL_CLASSES, simHandles, trafficCtx } from '../sim/roadPassers';
import { hasCutscene } from '../sim/siege';

type Quality = 'high' | 'medium' | 'low';
type Kind = MemberKind | 'walkerPack';

/** Parties on the road at once, people and vehicles drawn at the most, and how far from the camera anything is drawn. */
const CAPS: Record<Quality, { parties: number; shown: number; range: number }> = {
  low: { parties: 3, shown: 14, range: 70 },
  medium: { parties: 7, shown: 30, range: 100 },
  high: { parties: 12, shown: 52, range: 140 },
};
/** Instances reserved per kind in the batch (the most of that kind ever drawn at once). */
const POOL: Record<Kind, number> = {
  sedan: 14, pickup: 12, suv: 10, van: 6, bus: 2, semi: 3, flatbed: 3, tractor: 3, motorcycle: 4, bicycle: 5, military: 10, raider: 8, rv: 3,
  walker: 56, walkerPack: 40, cart: 8,
};
const MAX_LIGHTS = 80;
/** Farthest a stalled car is drawn from the camera uses the same range. Taken-in groups do not leave. */
const STAYS: ReadonlySet<string> = new Set(['take_in', 'trial', 'move_keep', 'move_sell', 'move_lease', 'build_first']);

interface Live { spec: RoadParty; z: number; speed: number; t: number; fixed?: boolean; fade: number }
const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpE = new THREE.Euler(0, 0, 0, 'YXZ'), tmpP = new THREE.Vector3(), tmpS = new THREE.Vector3(1, 1, 1), tmpC = new THREE.Color();

function beamTexture(): THREE.CanvasTexture {
  const w = 48, h = 96, c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d')!, img = g.createImageData(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const v = y / (h - 1), u = Math.abs(x / (w - 1) - 0.5) * 2;
    const half = 0.18 + 0.82 * v;
    const a = Math.max(0, 1 - u / half) * Math.pow(1 - v, 1.5) * (0.35 + 0.65 * Math.exp(-v * 9));
    const i = (y * w + x) * 4;
    img.data[i] = 255; img.data[i + 1] = 245; img.data[i + 2] = 215; img.data[i + 3] = Math.round(255 * Math.min(1, a));
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class RoadTraffic {
  private readonly _scene: THREE.Scene;
  private readonly _county: { x(z: number): number };
  private readonly _roadY: (x: number, z: number) => number;
  private readonly _batch: THREE.BatchedMesh;
  private readonly _ids = new Map<Kind, number[]>();
  private readonly _lights: THREE.InstancedMesh;
  private readonly _beamTex: THREE.CanvasTexture;
  private _gateZ = 0;
  private _quality: Quality = 'medium';
  private _seed = -1;
  private _acc = 0;
  private _slot = 0;
  private _time = 0;
  private readonly _live: Live[] = [];
  private _level: TrafficLevel | null = null;
  private _levelAt = -9;
  private _levelT = -9;
  private _levelPhase = '';
  private _stalledKey = '';
  private _stalled: StalledCar[] = [];
  private _incoming: Live | null = null;
  private _incomingId = '';
  private _tableau: Live | null = null;
  /** The day's real passers-by (sim/roadPassers.ts) and a party stopped at the line for a swap. */
  private readonly _passes = new Map<string, Live>();
  private _hail: Live | null = null;
  /** The roadblock or checkpoint across the county road at the drive (sim/roadPassers.ts `RoadBlock`). */
  private _block: THREE.Group | null = null;
  private _blockKey = '';
  private _tableauId = '';
  private _qaFreeze = false;
  /** QA / tests: draw this much darkness (0-1) instead of the world's. */
  qaDark: number | null = null;
  /** Counts for tests and the census (parties on the road, instances drawn this frame). */
  stats = { parties: 0, drawn: 0, lit: 0, stalled: 0 };

  constructor(scene: THREE.Scene, county: { x(z: number): number }, roadY: (x: number, z: number) => number) {
    this._scene = scene; this._county = county; this._roadY = roadY;
    const geos = buildTrafficGeometries();
    const kinds = Object.keys(POOL) as Kind[];
    let verts = 0;
    for (const k of kinds) verts += geos[k].attributes.position.count;
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.12 });
    const total = kinds.reduce((a, k) => a + POOL[k], 0);
    this._batch = new THREE.BatchedMesh(total, verts + 64, 0, mat);
    this._batch.frustumCulled = false; this._batch.perObjectFrustumCulled = false; this._batch.sortObjects = false;
    this._batch.castShadow = false; this._batch.receiveShadow = false;
    this._batch.name = 'road_life'; this._batch.userData = { type: 'roadLife', noSSAO: true };
    tmpM.makeScale(0, 0, 0);
    for (const k of kinds) {
      const gid = this._batch.addGeometry(geos[k]);
      const list: number[] = [];
      for (let i = 0; i < POOL[k]; i++) { const id = this._batch.addInstance(gid); this._batch.setMatrixAt(id, tmpM); this._batch.setColorAt(id, tmpC.set(0xffffff)); this._batch.setVisibleAt(id, false); list.push(id); }
      this._ids.set(k, list);
      geos[k].dispose();
    }
    this._batch.visible = false;
    scene.add(this._batch);
    this._beamTex = beamTexture();
    const lg = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0, 0, 0.5);
    const lm = new THREE.MeshBasicMaterial({ map: this._beamTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.9, side: THREE.DoubleSide, fog: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    this._lights = new THREE.InstancedMesh(lg, lm, MAX_LIGHTS);
    this._lights.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this._lights.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_LIGHTS * 3), 3);
    this._lights.count = 0; this._lights.frustumCulled = false; this._lights.castShadow = false; this._lights.receiveShadow = false; this._lights.renderOrder = 4;
    this._lights.visible = false; this._lights.name = 'road_life_lights'; this._lights.userData = { type: 'roadLife', noSSAO: true };
    scene.add(this._lights);
  }

  setQuality(q: Quality): void { this._quality = q; }
  /** The z of the gate: parties are played this far either side of it, and the tableau of a real arrival stands here. */
  setGate(z: number): void { this._gateZ = z; }
  /** QA: stop spawning and moving (the parties already on the road stay where they are). */
  freeze(on: boolean): void { this._qaFreeze = on; }
  /** QA: clear the road and put these parties on it, `z` is the lead's position. */
  qaSet(list: Array<{ spec: RoadParty; z: number }>): void {
    this._live.length = 0;
    for (const p of list) this._live.push({ spec: p.spec, z: p.z, speed: 0, t: 0, fixed: true, fade: 1 });
    this._qaFreeze = true;
  }

  private _ctx(game: GameState, hour: number): TrafficCtx { return trafficCtx(game, hour); }

  private _at(z: number, lat: number): { x: number; z: number; y: number; yaw: number; pitch: number } {
    const dx = (this._county.x(z + 0.5) - this._county.x(z - 0.5));
    const n = Math.hypot(dx, 1), px = 1 / n, pz = -dx / n;
    const x = this._county.x(z) + lat * px, zz = z + lat * pz;
    const y = this._roadY(x, zz);
    const y1 = this._roadY(this._county.x(z + 0.3), z + 0.3), y0 = this._roadY(this._county.x(z - 0.3), z - 0.3);
    return { x, z: zz, y, yaw: Math.atan2(dx, 1), pitch: -Math.atan2(y1 - y0, 0.6) };
  }

  update(dt: number, game: GameState, speedK: number, cam: { x: number; z: number }, dark: number): void {
    if (game.seed !== this._seed) { this._seed = game.seed; this._live.length = 0; this._slot = 0; this._acc = 0; this._incoming = this._tableau = this._hail = null; this._passes.clear(); this._incomingId = this._tableauId = ''; }
    const k = Math.min(4, Math.max(0, speedK));
    const w = dt * k;
    this._time += dt;
    const hour = hourOf(game.clock.t);
    const cap = CAPS[this._quality];
    const night = this.qaDark ?? dark;
    if (!this._level || this._time - this._levelAt > 0.5 || Math.abs(game.clock.t - this._levelT) > 0.02 || game.disaster.phase !== this._levelPhase) { this._level = trafficLevel(this._ctx(game, hour)); this._levelAt = this._time; this._levelT = game.clock.t; this._levelPhase = game.disaster.phase; }
    const level = this._level;
    const zLo = this._gateZ - WINDOW, zHi = this._gateZ + WINDOW;
    // spawn
    if (!this._qaFreeze) {
      this._acc += w;
      let guard = 0;
      while (this._acc >= SLOT && guard++ < 8) {
        this._acc -= SLOT; this._slot++;
        if (this._live.filter(l => !l.fixed || !l.spec.encounter).length >= cap.parties) continue;
        const ctx = this._ctx(game, hour);
        const spec = spawnFor(ctx, this._slot, level);
        // once the world has ended the busy classes are real events, scheduled by the sim (they come through `_encounters`)
        if (spec && simHandles(ctx) && REAL_CLASSES.has(spec.cls)) continue;
        if (spec) this._live.push({ spec, z: spec.dir > 0 ? zLo - 4 : zHi + 4, speed: spec.speed, t: 0, fade: 1 });
      }
      this._follow(w);
    }
    // the real encounters
    this._encounters(game, w, night);
    // stalled
    const stalledN = Math.min(level.stalled, this._quality === 'low' ? 3 : 7);
    const sk = `${game.seed}|${stalledN}|${Math.round(this._gateZ)}`;
    if (sk !== this._stalledKey) { this._stalledKey = sk; this._stalled = stalledCars(game.seed, stalledN, zLo, zHi, this._gateZ); }
    this._draw(cap, cam, night, level.lightsOk);
  }

  /** Build or remove the barrier / checkpoint across the road at the gate. Primitives only, merged per material (a handful of draw calls). */
  private _syncBlock(b: { kind: string } | null): void {
    const key = b ? `${b.kind}|${Math.round(this._gateZ)}` : '';
    if (key === this._blockKey) return;
    this._blockKey = key;
    if (this._block) { this._scene.remove(this._block); this._block.traverse(o => { const m = o as THREE.Mesh; m.geometry?.dispose(); }); this._block = null; }
    if (!b) return;
    const g = new THREE.Group(); g.name = 'road_block'; g.userData = { type: 'roadBlock', noSSAO: true };
    const mat = (c: number) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, metalness: 0.05 });
    const orange = mat(0xe8742a), white = mat(0xeeeeee), red = mat(0xb3281f), wood = mat(0x8a6a44), dark = mat(0x3b3f3a), glass = mat(0x9db8c4);
    const box = (m: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number, ry = 0) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.rotation.y = ry; o.castShadow = false; g.add(o); return o; };
    // the road here: centre line, +x across it (the lanes lie either side); everything sized to the 0.65 lane, person 0.28, rail height 0.17
    const half = 0.62;
    if (b.kind === 'barrier') {
      // two sawhorses with striped rails, a chain between, a stop sign on a post
      for (const x of [-0.32, 0.32]) {
        box(orange, 0.5, 0.03, 0.025, x, 0.15, 0); box(white, 0.5, 0.03, 0.025, x, 0.115, 0);
        for (const s of [-0.22, 0.22]) box(wood, 0.025, 0.17, 0.025, x + s, 0.085, 0);
      }
      box(dark, 0.24, 0.006, 0.006, 0, 0.13, 0);
      box(wood, 0.02, 0.34, 0.02, half - 0.06, 0.17, 0.06); box(red, 0.12, 0.12, 0.012, half - 0.06, 0.32, 0.06);
    } else {
      // a boom gate across the road, a guard booth at the verge with a window and roof, a stop sign, cones
      box(dark, 0.06, 0.2, 0.06, -half, 0.1, 0);
      for (let i = 0; i < 6; i++) box(i % 2 ? white : red, (2 * half - 0.06) / 6, 0.03, 0.03, -half + 0.03 + (i + 0.5) * (2 * half - 0.06) / 6, 0.2, 0);
      box(dark, 0.04, 0.17, 0.04, half, 0.085, 0);
      box(white, 0.26, 0.2, 0.26, half + 0.28, 0.1, -0.05); box(dark, 0.3, 0.025, 0.3, half + 0.28, 0.215, -0.05); box(glass, 0.18, 0.07, 0.01, half + 0.28, 0.13, -0.18);
      box(wood, 0.02, 0.36, 0.02, -half - 0.1, 0.18, 0.1); box(red, 0.13, 0.13, 0.012, -half - 0.1, 0.34, 0.1);
      for (const x of [-0.3, 0.3]) { const c = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.09, 8), orange); c.position.set(x, 0.045, 0.14); g.add(c); }
    }
    this._block = g;
    this._scene.add(g);
    this._placeBlock();
  }

  private _placeBlock(): void {
    if (!this._block) return;
    const a = this._at(this._gateZ, 0);
    this._block.position.set(a.x, a.y, a.z);
    this._block.rotation.set(0, a.yaw, 0);
  }

  /** Cars keep a gap behind the one ahead in their lane; everything else just goes. */
  private _follow(w: number): void {
    const lanes = this._live.filter(l => !l.fixed && Math.abs(l.spec.members[0].lat) < 0.3);
    for (const a of this._live) {
      if (a.fixed) continue;
      let v = a.spec.speed;
      if (Math.abs(a.spec.members[0].lat) < 0.3) {
        for (const b of lanes) {
          if (b === a || b.spec.dir !== a.spec.dir) continue;
          const ahead = (b.z - a.z) * a.spec.dir;
          if (ahead <= 0) continue;
          const rear = ahead - this._extent(b.spec);
          if (rear < 1.1) v = Math.min(v, b.spec.speed * (rear < 0.5 ? 0.3 : 0.95));
        }
      }
      a.speed = v;
      a.z += a.spec.dir * v * w;
      a.t += w;
    }
    for (let i = this._live.length - 1; i >= 0; i--) {
      const l = this._live[i];
      if (l.fixed) continue;
      const out = (l.z - this._gateZ) * l.spec.dir;
      if (out > WINDOW + 8 + this._extent(l.spec)) this._live.splice(i, 1);
    }
  }

  /** QA: where the dead cars stand (world x, z). */
  stalledAt(): Array<{ x: number; z: number }> { return this._stalled.map(c => { const a = this._at(c.z, c.lat); return { x: a.x, z: a.z }; }); }

  private _extent(p: RoadParty): number { return p.members.reduce((a, m) => Math.max(a, m.gap + LENGTH[m.kind]), 0); }

  private _encounters(game: GameState, w: number, night: number): void {
    void night;
    const t = game.clock.t, g = game.gate;
    // a raid on its way: the crew is on the road, nearer the gate as its hour comes
    const inc = g.incoming;
    if (inc && !g.pending) {
      if (this._incomingId !== inc.e.id || !this._incoming) { this._incomingId = inc.e.id; this._incoming = { spec: partyForEncounter(inc.e, game.seed), z: 0, speed: 0, t: 0, fixed: true, fade: 0 }; }
      const d = approachDistance(t, inc.from ?? inc.e.day - 0.25, inc.at);
      const s = this._incoming.spec;
      this._incoming.z = this._gateZ - s.dir * Math.min(d, APPROACH);
      this._incoming.fade = Number.isFinite(d) ? 1 : 0;
      this._incoming.t += w;
    } else { this._incoming = null; this._incomingId = ''; }
    // the day's real passers-by: each crosses the stretch of road the world shows round the hour it is abreast of the gate
    const road = game.road;
    if (road) {
      const seen = new Set<string>();
      for (const p of road.passes) {
        const away = (t - p.at) / LEAD;
        // one that turned up the drive or stopped for a swap is not drawn going on past
        const back = p.fate === 'turned' || p.fate === 'blocked';
        if (Math.abs(away) > 1 || (p.fate === 'stopped' && away >= 0)) continue;
        seen.add(p.id);
        let l = this._passes.get(p.id);
        const want = back && away >= 0 ? -p.party.dir as 1 | -1 : p.party.dir;
        if (!l || l.spec.dir !== want) { l = { spec: want === p.party.dir ? p.party : { ...p.party, dir: want }, z: 0, speed: 0, t: l?.t ?? 0, fixed: true, fade: 1 }; this._passes.set(p.id, l); }
        // a party turned back at the block drives or walks back the way it came
        l.z = back && away >= 0 ? this._gateZ - p.party.dir * away * APPROACH : this._gateZ + p.party.dir * away * APPROACH;
        l.t += w;
      }
      for (const id of [...this._passes.keys()]) if (!seen.has(id)) this._passes.delete(id);
      const h = road.hail;
      if (h) { if (!this._hail || this._hail.spec.id !== h.party.id) this._hail = { spec: h.party, z: this._gateZ, speed: 0, t: 0, fixed: true, fade: 1 }; this._hail.t += w; }
      else this._hail = null;
    } else { this._passes.clear(); this._hail = null; }
    this._syncBlock(game.road?.block ?? null);
    // someone at the gate now (anything but a raid, which the cutscene plays): the party stands on the road outside it
    const pe = g.pending;
    if (pe && !hasCutscene(pe) && !RAID_LIKE.has(pe.kind)) {
      if (this._tableauId !== pe.id || !this._tableau) { this._tableauId = pe.id; this._tableau = { spec: partyForEncounter(pe, game.seed), z: this._gateZ, speed: 0, t: 0, fixed: true, fade: 1 }; }
      this._tableau.t += w;
    } else if (this._tableau) {
      // they are gone from the gate: unless the family took them in, they go on their way
      const last = g.history[g.history.length - 1];
      const stays = !!last && STAYS.has(last.stance);
      if (!stays && !this._qaFreeze) this._live.push({ spec: { ...this._tableau.spec, id: this._tableau.spec.id + ':leave', encounter: undefined }, z: this._gateZ, speed: this._tableau.spec.speed, t: 0, fade: 1 });
      this._tableau = null; this._tableauId = '';
    }
  }

  private _draw(cap: { parties: number; shown: number; range: number }, cam: { x: number; z: number }, night: number, lightsOk: boolean): void {
    const used = new Map<Kind, number>();
    let shown = 0, nLights = 0;
    const lit = night > 0.25;
    const pools = this._ids;
    const put = (kind: Kind, x: number, y: number, z: number, yaw: number, pitch: number, col: number, roll = 0, scale = 1): boolean => {
      const n = used.get(kind) ?? 0;
      const ids = pools.get(kind)!;
      if (n >= ids.length || shown >= cap.shown) return false;
      used.set(kind, n + 1); shown++;
      tmpE.set(pitch, yaw, roll);
      tmpQ.setFromEuler(tmpE);
      tmpP.set(x, y, z); tmpS.setScalar(scale);
      tmpM.compose(tmpP, tmpQ, tmpS);
      this._batch.setMatrixAt(ids[n], tmpM);
      this._batch.setColorAt(ids[n], tmpC.set(col));
      this._batch.setVisibleAt(ids[n], true);
      return true;
    };
    const lamp = (x: number, y: number, z: number, yaw: number, front: boolean, scale: number): void => {
      if (nLights >= MAX_LIGHTS) return;
      tmpE.set(0, yaw + (front ? 0 : Math.PI), 0); tmpQ.setFromEuler(tmpE);
      tmpP.set(x, y + 0.03, z);
      tmpS.set(front ? 0.62 * scale : 0.22, 1, front ? 2.2 * scale : 0.34);
      tmpM.compose(tmpP, tmpQ, tmpS);
      this._lights.setMatrixAt(nLights, tmpM);
      this._lights.setColorAt(nLights, front ? tmpC.set(0xfff0c8) : tmpC.set(0xff2a1a));
      nLights++;
    };
    const near = (x: number, z: number) => Math.hypot(x - cam.x, z - cam.z) < cap.range;
    const drawParty = (l: Live, parked: boolean, shy: boolean): void => {
      const s = l.spec, dir = s.dir;
      const lightsOn = s.lights && lit && (lightsOk || !!s.encounter);
      s.members.forEach((m: Member, i) => {
        const gap = parked ? 1.5 + m.gap : m.gap;
        const z = l.z - dir * gap;
        const kind = m.kind;
        let lat = m.lat;
        if (parked) lat = kind === 'walker' || kind === 'cart' ? -0.46 + (m.lat > 0 ? 0 : 0.02) * 0 + ((i % 3) - 1) * 0.07 : -0.36;
        else lat += this._swerve(z, lat);
        const a = this._at(z, lat);
        if (!near(a.x, a.z)) return;
        const walking = kind === 'walker' || kind === 'cart';
        const yaw = a.yaw + (dir < 0 ? Math.PI : 0) + (parked && walking ? (i % 2 ? 1.2 : -1.3) : 0);
        const pitch = dir < 0 ? -a.pitch : a.pitch;
        const phase = (l.t * (walking ? 7 : 0) + i * 1.7);
        const bob = walking && !parked ? Math.abs(Math.sin(phase)) * 0.012 : 0;
        const roll = walking && !parked ? Math.sin(phase) * 0.05 : 0;
        const fade = shy ? l.fade : 1;
        if (fade <= 0.01) return;
        const col = this._color(kind, s, m);
        const real: Kind = kind === 'walker' && m.loaded ? 'walkerPack' : kind;
        if (!put(real, a.x, a.y + bob, a.z, yaw, pitch, col, roll, fade < 1 ? fade : 1)) return;
        // people riding in the bed
        if (m.riders > 0 && kind !== 'military' && kind !== 'bus') {
          for (let r = 0; r < m.riders; r++) {
            const bz = -0.26 + (r % 2) * 0.12 - (r > 1 ? 0.14 : 0), bx = r % 2 ? 0.08 : -0.08;
            const cy = Math.cos(yaw), sy = Math.sin(yaw);
            put('walkerPack', a.x + bx * cy + bz * sy, a.y + 0.1, a.z - bx * sy + bz * cy, yaw + 0.3 * (r - 1), 0, CLOTHES[(Math.floor(m.tint * 97) + r * 3) % CLOTHES.length]);
          }
        }
        if (lightsOn && !walking && kind !== 'bicycle' && kind !== 'tractor' || (lightsOn && kind === 'tractor')) {
          const half = LENGTH[kind] / 2;
          const fx = a.x + Math.sin(yaw) * half, fz = a.z + Math.cos(yaw) * half;
          lamp(fx, a.y, fz, yaw, true, kind === 'semi' || kind === 'bus' ? 1.2 : kind === 'motorcycle' ? 0.55 : 1);
          if (kind !== 'motorcycle') lamp(a.x - Math.sin(yaw) * half, a.y, a.z - Math.cos(yaw) * half, yaw, false, 1);
        }
      });
    };
    // reset the pools
    const prev = this._lastUsed;
    for (const [kind, n] of prev) { const ids = pools.get(kind)!; for (let i = 0; i < n; i++) this._batch.setVisibleAt(ids[i], false); }
    for (const l of this._live) drawParty(l, false, false);
    for (const l of this._passes.values()) drawParty(l, false, false);
    if (this._hail) drawParty(this._hail, true, false);
    if (this._incoming) drawParty(this._incoming, false, true);
    if (this._tableau) drawParty(this._tableau, true, false);
    // the dead cars
    for (const c of this._stalled) {
      const a = this._at(c.z, c.lat);
      if (!near(a.x, a.z)) continue;
      put(c.kind, a.x, a.y, a.z, a.yaw + c.yaw, Math.cos(c.yaw) < 0 ? -a.pitch : a.pitch, TINTED.has(c.kind) ? (c.kind === 'semi' ? 0xffffff : PAINT[Math.floor(c.tint * PAINT.length) % PAINT.length]) : 0xffffff);
    }
    this._lastUsed = used;
    this._batch.visible = shown > 0;
    this._lights.count = nLights;
    this._lights.visible = nLights > 0;
    if (nLights) { this._lights.instanceMatrix.needsUpdate = true; if (this._lights.instanceColor) this._lights.instanceColor.needsUpdate = true; (this._lights.material as THREE.MeshBasicMaterial).opacity = Math.min(0.95, 0.35 + night); }
    this.stats = { parties: this._live.length + this._passes.size + (this._hail ? 1 : 0) + (this._incoming ? 1 : 0) + (this._tableau ? 1 : 0), drawn: shown, lit: nLights, stalled: this._stalled.length };
  }
  private _lastUsed = new Map<Kind, number>();

  /** A moving car goes round a dead one in its lane. */
  private _swerve(z: number, lat: number): number {
    if (Math.abs(lat) > 0.3) return 0;
    for (const c of this._stalled) {
      if (Math.sign(c.lat) !== Math.sign(lat) || Math.abs(c.lat) > 0.3) continue;
      const d = Math.abs(z - c.z);
      if (d < 2.6) return -Math.sign(lat) * 0.2 * Math.cos((d / 2.6) * Math.PI / 2);
    }
    return 0;
  }

  private _color(kind: MemberKind, s: RoadParty, m: Member): number {
    if (kind === 'raider') return RAIDER_PAINT[Math.floor(m.tint * RAIDER_PAINT.length) % RAIDER_PAINT.length];
    if (kind === 'walker') return CLOTHES[Math.floor(m.tint * CLOTHES.length) % CLOTHES.length];
    if (s.cls === 'hazmat' && TINTED.has(kind)) return 0xe8e6dc;
    if (TINTED.has(kind)) return PAINT[Math.floor(m.tint * PAINT.length) % PAINT.length];
    return 0xffffff;
  }

  /** Test hook: the cap on shown people never exceeds what the encounter says. */
  static readonly MAX_SHOWN = MAX_SHOWN;

  dispose(): void {
    this._syncBlock(null);
    this._scene.remove(this._batch); this._scene.remove(this._lights);
    this._batch.dispose(); this._lights.geometry.dispose(); (this._lights.material as THREE.Material).dispose(); this._beamTex.dispose();
    (this._batch.material as THREE.Material).dispose();
  }
}
