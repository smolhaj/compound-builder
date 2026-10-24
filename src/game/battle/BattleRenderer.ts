/**
 * BattleRenderer — plays a `Battle` timeline back in the world: residents run
 * to their posts, raiders in dark clothes come in, bound between cover and run
 * off; tracers, muzzle flashes, mines, grenades, rockets, explosions, the
 * alarm and floodlights. Cheap: one figure draw, pooled tracers (one
 * LineSegments), pooled puffs, a handful of lights (no shadows).
 * API: play(b) / update(dt) / stop(); `shake` is a camera-shake amount the
 * canvas applies.
 */
import * as THREE from 'three';
import { FigureLayer, FIG_POSE, FIG_SCALE } from '../../engine/world/people/figureKit';
import { pickPersonaWear, type Wear } from '../../engine/world/people/crowdWear';
import type { Battle, BattleEvent, BattleUnit } from '../../sim/battleTypes';

const RUN = 1.1;          // world units / s (≈ 6.5 m/s)
const FLEE = 1.6;
const MAX_TRACERS = 64;
const MAX_PUFFS = 48;
/** How long a tracer streak takes muzzle to target (s). */
const TRACER_LIFE = 0.3;
/** A tracer streak's length (world units, ≈ 7 m). */
const STREAK = 1.2;
const END_HOLD = 3.5;

interface U {
  def: BattleUnit;
  x: number; y: number; z: number; tx: number; ty: number; tz: number;
  rot: number; phase: number; speed: number;
  wear: Wear; wound: number; dead: boolean; crouch: boolean; gone: boolean;
}
interface Tracer { ttl: number; a: THREE.Vector3; b: THREE.Vector3 }
interface Puff { mesh: THREE.Sprite; mat: THREE.SpriteMaterial; age: number; life: number; r0: number; r1: number; rise: number; o0: number }
interface Proj { mesh: THREE.Mesh; a: THREE.Vector3; b: THREE.Vector3; age: number; dur: number; arc: number; trail: boolean; lastPuff: number }
interface Pending { at: number; ev: BattleEvent }

function rnd(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}
/** A red cross on a white disc (first aid), drawn once. */
function crossTexture(): THREE.Texture {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ffffff'; g.beginPath(); g.arc(32, 32, 30, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#d02020'; g.fillRect(25, 12, 14, 40); g.fillRect(12, 25, 40, 14);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function hashStr(s: string): number { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; }

export class BattleRenderer {
  /** Camera shake (world units of jitter), decays by itself. */
  shake = 0;
  /** Playback clock (s). */
  time = 0;
  /** Latest 'say' lines. */
  lines: Array<{ who?: string; text: string }> = [];
  /** Called once the battle (and its hold) is over. */
  onEnd: (() => void) | null = null;
  battle: Battle | null = null;

  private readonly _scene: THREE.Scene;
  private readonly _ground: (x: number, z: number) => number;
  private readonly _people: () => ReadonlyArray<{ id: string; shirt: number; body: 'f' | 'm' }>;
  private readonly _layer: FigureLayer;
  private readonly _group = new THREE.Group();
  private _units = new Map<string, U>();
  private _cursor = 0;
  private _pending: Pending[] = [];
  private _endAt = -1;
  // tracers
  private readonly _tracers: Tracer[] = [];
  /** Tracer streaks as glowing rods (a 1-px line vanishes at game distance). */
  private readonly _rods: THREE.InstancedMesh;
  /** A ring at each fighter's feet: red raiders, blue residents (readable from the diorama camera). */
  private readonly _rings: THREE.InstancedMesh;
  private readonly _trGeo = new THREE.BufferGeometry();
  private readonly _trPos = new Float32Array(MAX_TRACERS * 6);
  private readonly _trLines: THREE.LineSegments;
  // fx
  private readonly _puffGeo = new THREE.SphereGeometry(1, 10, 8);
  private readonly _puffs: Puff[] = [];
  private readonly _projs: Proj[] = [];
  private readonly _decals: THREE.Mesh[] = [];
  private readonly _flashes: THREE.PointLight[] = [];
  private _flashI = 0;
  private _alarm: THREE.PointLight | null = null;
  private _alarmOn = false;
  private _floods: THREE.SpotLight[] = [];
  /** First aid under way: a red cross over the wounded until it's done. */
  private readonly _marks: Array<{ sprite: THREE.Sprite; unit: string; ttl: number }> = [];
  private _crossTex: THREE.Texture | null = null;
  private _center = new THREE.Vector3();
  private readonly _m = new THREE.Matrix4();
  private readonly _q = new THREE.Quaternion();
  private readonly _e = new THREE.Euler();
  private readonly _v = new THREE.Vector3();
  private readonly _s = new THREE.Vector3();
  private readonly _c = new THREE.Color();

  constructor(scene: THREE.Scene, ground: (x: number, z: number) => number,
    people: () => ReadonlyArray<{ id: string; shirt: number; body: 'f' | 'm' }>) {
    this._scene = scene; this._ground = ground; this._people = people;
    this._layer = new FigureLayer(scene, 64, 'battle');
    this._group.name = 'battle-fx';
    scene.add(this._group);
    this._trGeo.setAttribute('position', new THREE.BufferAttribute(this._trPos, 3).setUsage(THREE.DynamicDrawUsage));
    this._trGeo.setDrawRange(0, 0);
    this._trLines = new THREE.LineSegments(this._trGeo, new THREE.LineBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    this._trLines.frustumCulled = false;
    this._group.add(this._trLines);
    this._rods = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }), MAX_TRACERS);
    this._rods.count = 0; this._rods.frustumCulled = false; this._rods.userData = { noSSAO: true };
    this._group.add(this._rods);
    this._rings = new THREE.InstancedMesh(new THREE.RingGeometry(0.16, 0.22, 20).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false }), 64);
    this._rings.count = 0; this._rings.frustumCulled = false; this._rings.userData = { noSSAO: true };
    this._group.add(this._rings);
    for (let i = 0; i < 4; i++) {
      const l = new THREE.PointLight(0xffc070, 0, 4, 2);
      l.castShadow = false;
      this._flashes.push(l); this._group.add(l);
    }
  }

  get playing(): boolean { return this.battle !== null; }

  /** Where the fight is: between the defenders and the nearest raiders still in it (for the camera), and how far apart they are. */
  focus(): { x: number; z: number; spread: number } | null {
    const live = [...this._units.values()].filter(u => !u.gone && !u.dead);
    const home = live.filter(u => u.def.side === 'home'), raiders = live.filter(u => u.def.side === 'raider');
    if (!home.length && !raiders.length) return null;
    const pick = home.length ? home : raiders;
    const hx = pick.reduce((a, u) => a + u.x, 0) / pick.length, hz = pick.reduce((a, u) => a + u.z, 0) / pick.length;
    if (!home.length || !raiders.length) return { x: hx, z: hz, spread: 4 };
    const near = raiders.reduce((a, u) => (Math.hypot(u.x - hx, u.z - hz) < Math.hypot(a.x - hx, a.z - hz) ? u : a));
    const d = Math.hypot(near.x - hx, near.z - hz);
    return { x: (hx + near.x) / 2, z: (hz + near.z) / 2, spread: d / 2 };
  }

  play(b: Battle): void {
    this.stop();
    this.battle = b;
    this.time = 0; this._cursor = 0; this._endAt = -1; this.lines = [];
    const people = this._people();
    const home = b.units.filter(u => u.side === 'home');
    const src = home.length ? home : b.units;
    this._center.set(src.reduce((a, u) => a + u.x, 0) / Math.max(1, src.length), 0, src.reduce((a, u) => a + u.z, 0) / Math.max(1, src.length));
    for (const def of b.units) {
      const r = rnd(hashStr(def.personId ?? def.id));
      let wear: Wear;
      if (def.side === 'home') {
        const p = people.find(q => q.id === def.personId);
        wear = pickPersonaWear(r, 'resident', { season: 'fall', team: null });
        if (p) { wear.shirt = p.shirt; wear.longHair = p.body === 'f'; }
        wear.pants = 0x3b4a66;
      } else {
        wear = pickPersonaWear(r, 'resident', { season: 'winter', team: null });
        wear.shirt = [0x1a1c1e, 0x23261f, 0x2a2622][Math.floor(r() * 3)];
        wear.pants = 0x161718; wear.hat = -1; wear.coat = 1;
      }
      wear.hasPack = false; wear.shorts = false;
      // armor over the clothes: a coyote plate carrier (back panel), a navy soft vest, an olive helmet
      if (def.armor?.plate) { wear.shirt = 0x6e6446; wear.coat = 1; wear.hasPack = true; wear.pack = 0x4b4a3a; }
      else if (def.armor?.soft) { wear.shirt = 0x2d3440; wear.coat = 1; }
      if (def.armor?.helmet) wear.hat = 0x3d4232;
      const y = def.y ?? 0;
      this._units.set(def.id, { def, x: def.x, y, z: def.z, tx: def.x, ty: y, tz: def.z, rot: def.side === 'raider' ? Math.atan2(this._center.x - def.x, this._center.z - def.z) : 0,
        phase: r() * 6, speed: RUN, wear, wound: 0, dead: false, crouch: false, gone: false });
    }
    this._alarm = new THREE.PointLight(0xff2020, 0, 14, 1.6);
    this._alarm.position.set(this._center.x, this._ground(this._center.x, this._center.z) + 0.8, this._center.z);
    this._group.add(this._alarm);
  }

  /** Run the playback forward to time t (screenshots, scrubbing): small steps, so everything in flight at t is drawn. */
  seek(t: number): void {
    let guard = 0;
    while (this.battle && this.time < t && guard++ < 10000) this.update(Math.min(1 / 30, t - this.time));
  }

  /** Jump to the end (Skip). */
  skip(): void {
    if (!this.battle) return;
    this.stop();
    this.onEnd?.();
  }

  stop(): void {
    for (const m of this._marks) { this._group.remove(m.sprite); m.sprite.material.dispose(); }
    this._marks.length = 0;
    this.battle = null;
    this._units.clear();
    this._pending = [];
    this._tracers.length = 0;
    this._trGeo.setDrawRange(0, 0);
    this._rods.count = 0; this._rings.count = 0;
    for (const p of this._puffs) { this._group.remove(p.mesh); p.mat.dispose(); }
    this._puffs.length = 0;
    for (const p of this._projs) { this._group.remove(p.mesh); (p.mesh.material as THREE.Material).dispose(); }
    this._projs.length = 0;
    for (const d of this._decals) { this._group.remove(d); d.geometry.dispose(); (d.material as THREE.Material).dispose(); }
    this._decals.length = 0;
    for (const f of this._floods) { this._group.remove(f); this._group.remove(f.target); f.dispose(); }
    this._floods = [];
    if (this._alarm) { this._group.remove(this._alarm); this._alarm.dispose(); this._alarm = null; }
    this._alarmOn = false;
    for (const f of this._flashes) f.intensity = 0;
    this.shake = 0;
    this._layer.commit(0, false);
  }

  update(dt: number): void {
    const b = this.battle;
    if (!b) return;
    this.time += dt;
    while (this._cursor < b.events.length && b.events[this._cursor].t <= this.time) this._apply(b.events[this._cursor++]);
    for (let i = this._pending.length - 1; i >= 0; i--) if (this._pending[i].at <= this.time) { this._apply(this._pending[i].ev); this._pending.splice(i, 1); }
    if (this._endAt < 0 && this.time > b.duration + 1) this._endAt = this.time;
    if (this._endAt >= 0 && this.time - this._endAt > END_HOLD) { this.stop(); this.onEnd?.(); return; }
    this._moveUnits(dt);
    this._tickFx(dt);
    if (this._alarm) this._alarm.intensity = this._alarmOn ? (0.5 + 0.5 * Math.sin(this.time * 9)) * 6 : 0;
    this.shake = Math.max(0, this.shake - dt * 1.5);
  }

  /** Where a unit's chest is. */
  private _chest(u: U, out: THREE.Vector3): THREE.Vector3 {
    return out.set(u.x, this._ground(u.x, u.z) + u.y + (u.crouch ? 0.12 : 0.2), u.z);
  }

  private _apply(e: BattleEvent): void {
    const U_ = (id: string) => this._units.get(id);
    switch (e.kind) {
      case 'alarm': this._alarmOn = true; break;
      case 'lights': this._lightsOn(); break;
      case 'move': { const u = U_(e.unit); if (u && !u.dead) { u.tx = e.x; u.tz = e.z; u.ty = e.y ?? 0; u.crouch = false; } break; }
      case 'cover': { const u = U_(e.unit); if (u && !u.dead) { u.tx = e.x; u.tz = e.z; u.ty = 0; u.crouch = true; } break; }
      case 'shot': {
        const a = U_(e.from), t = U_(e.to);
        if (!a || !t || a.dead) break;
        const p0 = this._chest(a, new THREE.Vector3()), p1 = this._chest(t, new THREE.Vector3());
        if (!e.hit) { p1.x += (Math.random() - 0.5) * 0.6; p1.z += (Math.random() - 0.5) * 0.6; p1.y += (Math.random() - 0.3) * 0.3; }
        a.rot = Math.atan2(p1.x - p0.x, p1.z - p0.z);
        this._tracer(p0, p1);
        this._flash(p0, 3, 0xffc070);
        if (e.auto) for (let k = 1; k <= 3; k++) this._pending.push({ at: this.time + k * 0.09, ev: { ...e, t: e.t, auto: false, hit: false } });
        break;
      }
      case 'mine': {
        this._boom(e.x, this._ground(e.x, e.z), e.z, 0.7, true);
        break;
      }
      case 'throw': {
        const a = U_(e.from); if (!a) break;
        const m = new THREE.Mesh(this._puffGeo, new THREE.MeshStandardMaterial({ color: 0x2c3224, roughness: 0.7 }));
        m.scale.setScalar(0.025);
        this._group.add(m);
        this._projs.push({ mesh: m, a: this._chest(a, new THREE.Vector3()), b: new THREE.Vector3(e.x, this._ground(e.x, e.z) + 0.02, e.z), age: 0, dur: 1, arc: 0.5, trail: false, lastPuff: 0 });
        break;
      }
      case 'rocket': {
        const a = U_(e.from); if (!a) break;
        const p0 = this._chest(a, new THREE.Vector3());
        const p1 = new THREE.Vector3(e.x, this._ground(e.x, e.z) + (e.y ?? 0.1), e.z);
        const m = new THREE.Mesh(this._puffGeo, new THREE.MeshBasicMaterial({ color: 0xffb050, toneMapped: false }));
        m.scale.set(0.03, 0.03, 0.03);
        this._group.add(m);
        this._flash(p0, 6, 0xffa040);
        this._puff(p0, 0.06, 0.25, 0.9, 0.05, 0x8a8a86, 0.6);
        this._projs.push({ mesh: m, a: p0, b: p1, age: 0, dur: Math.max(0.25, p0.distanceTo(p1) / 9), arc: 0.03, trail: true, lastPuff: 0 });
        break;
      }
      case 'explosion': {
        const y = this._ground(e.x, e.z) + (e.y ?? 0);
        this._boom(e.x, y, e.z, Math.max(0.3, e.radius), !!e.wrecks);
        if (e.wrecks) this._decal(e.x, e.z, e.radius * 0.8);
        break;
      }
      case 'breach': this._boom(e.x, this._ground(e.x, e.z), e.z, 0.5, true); break;
      case 'wound': { const u = U_(e.unit); if (u && !e.stopped) { u.wound = Math.min(1, u.wound + Math.max(0.3, e.sev)); this._tint(u); } break; }
      case 'death': { const u = U_(e.unit); if (u) { u.dead = true; u.wound = 1; this._tint(u); u.y = 0; } break; }
      case 'flee': {
        const u = U_(e.unit); if (!u || u.dead) break;
        const dx = u.x - this._center.x, dz = u.z - this._center.z, d = Math.hypot(dx, dz) || 1;
        u.tx = u.x + dx / d * 60; u.tz = u.z + dz / d * 60; u.ty = 0; u.speed = FLEE; u.crouch = false;
        break;
      }
      case 'reload': case 'jam': { const u = U_(e.unit); if (u && !u.dead) u.crouch = true; break; }   // down behind cover to fix the gun
      case 'aid': {
        const u = U_(e.unit), by = U_(e.by);
        if (by && u && by !== u) { by.tx = u.x + 0.08; by.tz = u.z; by.crouch = true; }
        if (u) {
          this._crossTex ??= crossTexture();
          const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this._crossTex, depthTest: false, transparent: true }));
          sp.scale.setScalar(0.16);
          this._group.add(sp);
          this._marks.push({ sprite: sp, unit: e.unit, ttl: 4 });
        }
        break;
      }
      case 'say': this.lines = [...this.lines, { who: e.who, text: e.text }].slice(-4); break;
      case 'end': this._endAt = this.time; this._alarmOn = false; break;
    }
  }

  private _tint(u: U): void {
    const c = new THREE.Color(u.wear.shirt).lerp(new THREE.Color(0x8a1010), 0.25 + 0.5 * u.wound);
    u.wear = { ...u.wear, shirt: c.getHex() };
  }

  private _lightsOn(): void {
    if (this._floods.length) return;
    const c = this._center;
    for (let i = 0; i < 3; i++) {
      const a = i * (Math.PI * 2 / 3) + 0.4;
      const x = c.x + Math.cos(a) * 2.5, z = c.z + Math.sin(a) * 2.5;
      const s = new THREE.SpotLight(0xfff3dd, this.battle?.night ? 40 : 8, 30, 0.6, 0.5, 1.4);
      s.position.set(x, this._ground(x, z) + 1.4, z);
      s.target.position.set(c.x + Math.cos(a) * 12, this._ground(c.x, c.z), c.z + Math.sin(a) * 12);
      s.castShadow = i === 0;
      if (s.castShadow) s.shadow.mapSize.set(512, 512);
      this._group.add(s); this._group.add(s.target);
      this._floods.push(s);
    }
  }

  private _tracer(a: THREE.Vector3, b: THREE.Vector3): void {
    if (this._tracers.length >= MAX_TRACERS) this._tracers.shift();
    // a short streak along the line (not the whole line): starts near the muzzle
    this._tracers.push({ ttl: TRACER_LIFE, a: a.clone(), b: b.clone() });
  }

  private _flash(p: THREE.Vector3, k: number, color: number): void {
    const l = this._flashes[this._flashI++ % this._flashes.length];
    l.position.copy(p); l.color.setHex(color); l.intensity = k; l.distance = 2 + k * 0.6;
    this._puff(p, 0.06, 0.16, 0.12, 0, 0xffe0a0, 1, true);
  }

  /** A soft round blob (smoke, dust, fire): a canvas radial gradient, made once. */
  private static _soft: THREE.CanvasTexture | null = null;
  private static softTex(): THREE.CanvasTexture {
    if (BattleRenderer._soft) return BattleRenderer._soft;
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d')!, grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.45, 'rgba(255,255,255,0.7)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
    // a little lumpiness so smoke isn't a perfect disc
    for (let i = 0; i < 18; i++) { const a = i * 2.4, rr = 10 + (i * 7) % 12; g.fillStyle = 'rgba(0,0,0,0.06)'; g.beginPath(); g.arc(32 + Math.cos(a) * rr, 32 + Math.sin(a) * rr, 6, 0, Math.PI * 2); g.fill(); }
    BattleRenderer._soft = new THREE.CanvasTexture(c);
    BattleRenderer._soft.colorSpace = THREE.SRGBColorSpace;
    return BattleRenderer._soft;
  }

  private _puff(p: THREE.Vector3, r0: number, r1: number, life: number, rise: number, color: number, o0: number, glow = false): void {
    if (this._puffs.length >= MAX_PUFFS) { const old = this._puffs.shift()!; this._group.remove(old.mesh); old.mat.dispose(); }
    const mat = new THREE.SpriteMaterial({ map: BattleRenderer.softTex(), color, transparent: true, opacity: o0, depthWrite: false, toneMapped: !glow, blending: glow ? THREE.AdditiveBlending : THREE.NormalBlending, rotation: Math.random() * Math.PI * 2 });
    const mesh = new THREE.Sprite(mat);
    mesh.position.copy(p); mesh.scale.setScalar(r0 * 2.4);
    mesh.userData = { noSSAO: true };
    this._group.add(mesh);
    this._puffs.push({ mesh, mat, age: 0, life, r0, r1, rise, o0 });
  }

  /** Flash + fireball + rising dark smoke + dust, scaled by radius. */
  private _boom(x: number, y: number, z: number, radius: number, dust: boolean): void {
    const p = new THREE.Vector3(x, y + radius * 0.25, z);
    const l = this._flashes[this._flashI++ % this._flashes.length];
    l.position.copy(p).y += radius * 0.5; l.color.setHex(0xffa040); l.intensity = 30 * radius; l.distance = 6 + radius * 6;
    this._puff(p, radius * 0.15, radius * 0.9, 0.45, 0.1, 0xffd070, 1, true);
    this._puff(p, radius * 0.05, radius * 0.45, 0.25, 0.05, 0xfff4c0, 1, true);
    this._puff(p, radius * 0.08, radius * 0.6, 0.5, 0.2, 0xff6a20, 0.9, true);
    for (let i = 0; i < 4; i++) {
      const q = p.clone().add(new THREE.Vector3((Math.random() - 0.5) * radius * 0.6, radius * 0.2, (Math.random() - 0.5) * radius * 0.6));
      this._puff(q, radius * 0.2, radius * (0.7 + Math.random() * 0.4), 2.5 + Math.random(), radius * 0.6, 0x2a2826, 0.75);
    }
    if (dust) this._puff(new THREE.Vector3(x, y, z), radius * 0.3, radius * 1.4, 1.8, 0.1, 0x8c7a62, 0.5);
    this.shake = Math.min(0.25, this.shake + 0.06 + radius * 0.08);
  }

  private _decal(x: number, z: number, r: number): void {
    const g = new THREE.CircleGeometry(Math.max(0.15, r * 0.6), 18).rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0x1b1714, roughness: 1, transparent: true, opacity: 0.6, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
    m.position.set(x, this._ground(x, z) + 0.01, z);
    this._group.add(m);
    this._decals.push(m);
    // a few rubble chunks
    for (let i = 0; i < 5; i++) {
      const c = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.03, 0.04), new THREE.MeshStandardMaterial({ color: 0x5a524a, roughness: 1 }));
      const a = Math.random() * Math.PI * 2, d = Math.random() * r * 0.8;
      c.position.set(x + Math.cos(a) * d, this._ground(x, z) + 0.015, z + Math.sin(a) * d);
      c.rotation.y = a;
      this._group.add(c); this._decals.push(c);
    }
  }

  private _moveUnits(dt: number): void {
    let n = 0;
    for (const u of this._units.values()) {
      if (u.gone) continue;
      let moving = false;
      if (!u.dead) {
        const dx = u.tx - u.x, dz = u.tz - u.z, d = Math.hypot(dx, dz);
        if (d > 0.02) {
          const step = Math.min(d, u.speed * (u.wound > 0.5 ? 0.6 : 1) * dt);
          u.x += dx / d * step; u.z += dz / d * step; moving = true;
          let dr = Math.atan2(dx, dz) - u.rot; dr = Math.atan2(Math.sin(dr), Math.cos(dr));
          u.rot += dr * Math.min(1, dt * 10);
          // climbing to a post: the height follows the remaining distance
          u.y += (u.ty - u.y) * Math.min(1, step / Math.max(d, 0.3));
        } else u.y += (u.ty - u.y) * Math.min(1, dt * 4);
        if (u.speed === FLEE && Math.hypot(u.x - this._center.x, u.z - this._center.z) > 50) { u.gone = true; continue; }
      }
      u.phase += dt * (moving ? 12 : 0);
      if (n >= this._layer.capacity) break;
      this._layer.setWear(n, u.wear);
      const gy = this._ground(u.x, u.z) + u.y;
      this._layer.setPose(n, { x: u.x, y: gy, z: u.z, rot: u.rot, scale: 1,
        pose: u.crouch && !moving ? FIG_POSE.KNEEL : FIG_POSE.STAND, phase: u.phase, amp: moving ? 0.6 : 0 });
      if (u.dead) {   // laid down: tip the figure onto its back along its heading
        this._e.set(-Math.PI / 2, u.rot, 0, 'YXZ');
        this._q.setFromEuler(this._e);
        this._m.compose(this._v.set(u.x, gy + 0.03, u.z), this._q, this._s.setScalar(FIG_SCALE));
        this._m.toArray(this._layer.mesh.instanceMatrix.array as Float32Array, n * 16);
      }
      n++;
    }
    this._layer.commit(n, true);
    let ri = 0;
    for (const u of this._units.values()) {
      if (u.gone || u.dead || ri >= 64) continue;
      this._m.makeTranslation(u.x, this._ground(u.x, u.z) + u.y + 0.02, u.z);
      this._rings.setMatrixAt(ri, this._m);
      this._rings.setColorAt(ri, this._c.setHex(u.def.side === 'raider' ? 0xff3b30 : 0x4aa8ff));
      ri++;
    }
    this._rings.count = ri;
    this._rings.instanceMatrix.needsUpdate = true;
    if (this._rings.instanceColor) this._rings.instanceColor.needsUpdate = true;
  }

  private _tickFx(dt: number): void {
    for (let i = this._marks.length - 1; i >= 0; i--) {
      const m = this._marks[i], u = this._units.get(m.unit);
      m.ttl -= dt;
      if (m.ttl <= 0 || !u) { this._group.remove(m.sprite); m.sprite.material.dispose(); this._marks.splice(i, 1); continue; }
      m.sprite.position.set(u.x, this._ground(u.x, u.z) + u.y + 0.45 + Math.sin(this.time * 4) * 0.02, u.z);
      m.sprite.material.opacity = Math.min(1, m.ttl);
    }
    // tracers: a short bright streak racing from muzzle to target
    let k = 0;
    for (let i = this._tracers.length - 1; i >= 0; i--) {
      const tr = this._tracers[i];
      tr.ttl -= dt;
      if (tr.ttl <= 0) { this._tracers.splice(i, 1); continue; }
    }
    for (const tr of this._tracers) {
      const len = Math.max(1e-3, tr.a.distanceTo(tr.b));
      const h = Math.min(1, (1 - tr.ttl / TRACER_LIFE) * (1 + STREAK / len)), f = Math.max(0, h - STREAK / len);
      this._v.lerpVectors(tr.a, tr.b, f);
      this._trPos.set([this._v.x, this._v.y, this._v.z], k * 6);
      this._v.lerpVectors(tr.a, tr.b, h);
      this._trPos.set([this._v.x, this._v.y, this._v.z], k * 6 + 3);
      k++;
    }
    this._trGeo.setDrawRange(0, k * 2);
    // the rods: from the streak's tail to its head, a few cm thick
    let r = 0;
    for (const tr of this._tracers) {
      const full = Math.max(1e-3, tr.a.distanceTo(tr.b));
      const h = Math.min(1, (1 - tr.ttl / TRACER_LIFE) * (1 + STREAK / full)), f = Math.max(0, h - STREAK / full);
      const a = this._v.lerpVectors(tr.a, tr.b, f).clone(), b = this._s.lerpVectors(tr.a, tr.b, h).clone();
      const len = a.distanceTo(b);
      if (len < 1e-3) continue;
      this._m.lookAt(a, b, THREE.Object3D.DEFAULT_UP);
      this._q.setFromRotationMatrix(this._m);
      this._m.compose(a.add(b).multiplyScalar(0.5), this._q, new THREE.Vector3(0.035, 0.035, len));
      this._rods.setMatrixAt(r++, this._m);
    }
    this._rods.count = r;
    this._rods.instanceMatrix.needsUpdate = true;
    (this._trGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    for (const f of this._flashes) f.intensity *= Math.max(0, 1 - dt * 14);
    for (let i = this._puffs.length - 1; i >= 0; i--) {
      const p = this._puffs[i];
      p.age += dt;
      const f = p.age / p.life;
      if (f >= 1) { this._group.remove(p.mesh); p.mat.dispose(); this._puffs.splice(i, 1); continue; }
      const e = 1 - (1 - f) * (1 - f);
      p.mesh.scale.setScalar((p.r0 + (p.r1 - p.r0) * e) * 2.4);
      p.mesh.position.y += p.rise * dt;
      p.mat.opacity = p.o0 * (1 - f);
    }
    for (let i = this._projs.length - 1; i >= 0; i--) {
      const p = this._projs[i];
      p.age += dt;
      const f = Math.min(1, p.age / p.dur);
      p.mesh.position.lerpVectors(p.a, p.b, f);
      p.mesh.position.y += 4 * p.arc * f * (1 - f);
      if (p.trail && p.age - p.lastPuff > 0.03) { p.lastPuff = p.age; this._puff(p.mesh.position, 0.02, 0.09, 1.1, 0.05, 0x9a9894, 0.55); }
      if (f >= 1) { this._group.remove(p.mesh); (p.mesh.material as THREE.Material).dispose(); this._projs.splice(i, 1); }
    }
  }

  dispose(): void {
    this.stop();
    this._layer.dispose();
    this._trGeo.dispose(); (this._trLines.material as THREE.Material).dispose();
    this._rods.geometry.dispose(); (this._rods.material as THREE.Material).dispose();
    this._rings.geometry.dispose(); (this._rings.material as THREE.Material).dispose();
    this._puffGeo.dispose();
    this._scene.remove(this._group);
  }
}
