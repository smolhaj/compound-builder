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
import { FigureLayer, FIG_POSE, FIG_SCALE, FIG_TOOL, GEAR, HEADWEAR, stridePhase } from '../../engine/world/people/figureKit';
import type { Wear } from '../../engine/world/people/crowdWear';
import { wearForRole, roleOfPerson, seedOf, type Role } from '../../engine/world/people/roleWear';
import type { Battle, BattleEvent, BattleUnit } from '../../sim/battleTypes';
import { blockedAt, keepPush } from '../../sim/cutNav';
import { navFor } from '../../sim/cutLive';
import { coverPusher, type Box } from './cameraObstacles';
import { MUZZLE, OWN_BOX, TORSO, WALL_POST, faceNormal, lineOfFire } from './lineOfFire';
import { chooseCover, dropsProne, type Round } from './coverChoice';
import { getViolence, poolRadius, spatter, stain, woundSpot } from './bloodFx';
import { buildVehicle } from '../props/vehicleGeometry';
import { InvasionFx } from './InvasionFx';
import { SceneProps } from './SceneProps';

const RUN = 1.1;          // world units / s (≈ 6.5 m/s)
const FLEE = 1.6;
const MAX_TRACERS = 64;
const MAX_PUFFS = 48;
/** How long a tracer streak takes muzzle to target (s). */
const TRACER_LIFE = 0.3;
/** A tracer streak's length (world units, ≈ 7 m). */
const STREAK = 1.2;
const END_HOLD = 3.5;

/** Raider clothing by light: dark and varied at night (the look stays), mid-dark work tones by day. */
const RAIDER_SHIRTS_NIGHT = [0x1a1c1e, 0x23261f, 0x2a2622, 0x20252e, 0x2b2d24];
const RAIDER_PANTS_NIGHT = [0x161718, 0x1b1d20, 0x1d1a16];
const RAIDER_SHIRTS_DAY = [0x4b5240, 0x5b4c3a, 0x3f4a5a, 0x6b6a5a, 0x7a4a3c, 0x38403a, 0x62594a];
const RAIDER_PANTS_DAY = [0x2f3338, 0x3d3a2e, 0x4a4436, 0x272b31, 0x35383c];

/** A color dimmed for the dark (a mob's bright coats are dark shapes at night; the torch lights them). */
const dim = (hex: number, k: number): number => ((((hex >> 16) & 255) * k) << 16) | ((((hex >> 8) & 255) * k) << 8) | ((hex & 255) * k) | 0;
const CROWD_COATS = [0xb0452f, 0x3f6f9c, 0xc9a53a, 0x5a8a4a, 0x8a4f8f, 0xd6d0c0];
const FAMILY_COATS = [0x7d6a54, 0x5d6b78, 0x806060, 0x6c7a62, 0x8a7a5a, 0x5a5048];
const KID_COATS = [0xd9a43a, 0x6aa0d0, 0xc65a5a, 0x7ab07a, 0xd08ab0, 0xe0d070];
const WORK_COATS = [0x8a5a2a, 0x3f5a7a, 0x6a6a4a, 0x7a3a2a, 0x4a5a4a, 0x9a8a5a];

/** Dress a raider by his role (sim/raiderKinds.ts): the crew's style reads at a glance in a wide shot. */
function dressRaider(w: Wear, look: NonNullable<BattleUnit['look']>, dark: boolean, r: () => number): number {
  const k = dark ? 0.62 : 1;
  const pick = <T,>(xs: readonly T[]): T => xs[look.tone % xs.length];
  switch (look.role) {
    case 'scout': w.shirt = 0x16181a; w.pants = 0x121315; w.coat = 2; w.hat = 0x101112; w.hasPack = false; return 0.96;
    case 'shouter': case 'rabble': w.shirt = dim(pick(CROWD_COATS), k); w.pants = dark ? 0x1b1d20 : 0x3d3a2e; w.coat = look.role === 'shouter' ? 2 : 1; w.hat = r() < 0.4 ? dim(0xb04030, k) : -1; return 1.02;
    case 'leader': case 'soldier': w.shirt = dark ? 0x23281e : 0x6a6a4a; w.pants = dark ? 0x1a1c16 : 0x4a4a38; w.coat = 1; w.hat = dark ? 0x1c2018 : 0x3d4232; w.hasPack = true; w.pack = dark ? 0x1d1d18 : 0x3a3a30; return look.role === 'leader' ? 1.05 : 1;
    case 'parent': w.shirt = dim(pick(FAMILY_COATS), k); w.pants = dark ? 0x1b1d20 : 0x4a4436; w.coat = 1; w.hat = r() < 0.5 ? dim(0x6a5a4a, k) : -1; w.hasPack = true; w.pack = dim(0x5a5038, k); return 0.98;
    case 'kid': w.shirt = dim(pick(KID_COATS), dark ? 0.7 : 1); w.pants = dark ? 0x1d2230 : 0x3b4a66; w.coat = 1; w.hat = r() < 0.5 ? dim(0xc65a5a, k) : -1; w.hasPack = false; return 0.6;
    default: w.shirt = dim(pick(WORK_COATS), k); w.pants = dark ? 0x1b1d20 : 0x35383c; w.coat = 1; w.hat = dim(look.role === 'driver' ? 0xd9742a : 0x3a3a30, k); w.hasPack = look.role === 'looter'; if (w.hasPack) w.pack = dim(0x3a3a40, k); return 1;
  }
}

interface U {
  scale: number;
  def: BattleUnit;
  x: number; y: number; z: number; tx: number; ty: number; tz: number;
  rot: number; phase: number; speed: number;
  wear: Wear; wound: number; dead: boolean; crouch: boolean; gone: boolean;
  /** Battle time the fall began (a body drops after the round has arrived), and when a living one was laid down. */
  fallAt?: number; layAt?: number; /** Taken out of the picture at this time (buried: the earth has covered the fallen). */ hideAt?: number; /** Being laid into a grave: slides from where it lay to (x, z) over `secs`. */ sink?: { x: number; z: number; x0: number; z0: number; t0: number; secs: number };
  /** Who carries this unit in their arms now. */
  carriedBy?: string;
  /** Wounds to draw as patches (graphic only) and when the first-aid bandage went on. */
  marks?: Array<{ part: 'head' | 'torso' | 'arm' | 'leg' | undefined; sev: number }>;
  bandagedAt?: number;
  /** Hands up (surrendered or held at gunpoint). */
  hands?: boolean;
  /** Gone to ground in a closet or the cellar (not drawn until found), and who leads this unit by the arm (a hostage). */
  hidden?: boolean; hideHow?: string; ledBy?: string;
  /** Lasting wounds (drawn for the rest of the scene): a limp (a hit leg), a crawl (a leg gone or a bad hit), an arm held to the chest (a hit arm). */
  limp?: boolean; crawl?: boolean; sling?: boolean;
  /** Frozen with fear until this time (sim `panic`), and the one who stands over a fallen friend (sim `heroic`). */
  frozenUntil?: number;
  /** Behind cover: which way they lean out round it (-1, +1; 0 none), when cover was last chosen, and until when they are flat on the ground under fire. */
  lean?: number; coverAt?: number; proneUntil?: number; /** Heads down while rounds crack past (suppression). */ duckUntil?: number;
  /** Drawn size this frame (the figure grows with the camera's distance). */
  gs?: number;
  /** Carries a rifle (every defender on the line, a raider who has fired), and until when the muzzle is up at the target. */
  armed?: boolean; aimUntil?: number;
  /** Where it stood last frame (the stride follows the ground covered). */
  px?: number; pz?: number;
}
/** A flat mark on the ground or a wall: pools, spatter. `born`: a pool still spreading (radius `r1` after a few seconds). */
interface Stain { clean?: { t0: number; secs: number }; x: number; y: number; z: number; r: number; stretch: number; rot: number; color: number; wall?: { nx: number; nz: number }; born?: number; r1?: number; /** A prop on the ground (a dropped rifle): drawn in Restrained too. */ prop?: boolean }
const WALK = 0.8;
const MAX_STAINS = 200;
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
  /** The crew at a tunnel door: working at it (open false) or through it (open true), where (x, z) and how. */
  onDoor: ((open: boolean, x: number | undefined, z: number | undefined, what: string) => void) | null = null;
  /** A wall run opens at a breach (the live gap): run id, distance along it, width. */
  onGap: ((runId: string, at: number, w: number) => void) | null = null;
  /** The invasion look: the ramming truck, the charge, the debris (game/battle/InvasionFx.ts). */
  readonly invasion: InvasionFx;
  /** The door leaf, the loot packs and the set fires (game/battle/SceneProps.ts). */
  readonly props: SceneProps;
  battle: Battle | null = null;
  /** Sagebrush, willow and rocks (set by the canvas): a raider is never put down inside a bush, so a crew is not half hidden behind one. */
  coverSource: () => ReadonlyArray<{ x: number; z: number; r: number }> = () => [];
  /** Is the spot inside a wall, a building or furniture (set by the canvas: the world's walk collision)? A raider is never nudged out of a bush into one. */
  walkSolid: (x: number, z: number) => boolean = () => false;
  /** The walk collision as it is right now in this scene: the world's own, with the scene's breaches open from their moment and its shut doors shut (sim/cutNav.ts). */
  private _navFor: { battle: Battle; nav: ReturnType<typeof navFor> } | null = null;
  private _solidNow(): (x: number, z: number) => boolean {
    const b = this.battle;
    if (!b) return this.walkSolid;
    if (this._navFor?.battle !== b) this._navFor = { battle: b, nav: navFor(b, this.walkSolid) };
    const nav = this._navFor.nav, t = this.time;
    return (x, z) => blockedAt(nav, x, z, t);
  }
  private _coverIdx: { src: unknown; push: (x: number, z: number) => { x: number; z: number } } | null = null;
  private _clearOfCover(x: number, z: number, now?: { x: number; z: number }, unit?: string): { x: number; z: number } {
    const cover = this.coverSource();
    if (!cover.length) return { x, z };
    if (this._coverIdx?.src !== cover) this._coverIdx = { src: cover, push: coverPusher(cover) };
    const p = this._coverIdx.push(x, z);
    // (a push that ends inside something solid, or hops a wall beside the breach, is refused: sim/cutNav.ts `keepPush`)
    // (the plan's next waypoint for him, if there is one: the leg on from the pushed spot must run clear to it as the plan's did)
    let next: { at: { x: number; z: number }; solid: (x: number, z: number) => boolean } | undefined;
    const b = this.battle;
    if (b && unit && this._navFor?.battle === b) {
      const nav = this._navFor.nav;
      for (const f of b.events) if (f.t > this.time + 1e-6 && (f.kind === 'move' || f.kind === 'cover') && f.unit === unit) { next = { at: { x: f.x, z: f.z }, solid: (sx, sz) => blockedAt(nav, sx, sz, f.t) }; break; }
    }
    return keepPush(this._solidNow(), { x, z }, p, now, next);
  }

  private readonly _scene: THREE.Scene;
  private readonly _ground: (x: number, z: number) => number;
  private readonly _people: () => ReadonlyArray<{ id: string; shirt: number; body: 'f' | 'm'; kid?: boolean; age?: number; elder?: boolean }>;
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
  /** A small bright pip over each head: the ring is a sliver from far away and at a low angle, the pip is not. */
  private readonly _pips: THREE.InstancedMesh;
  /** Where the camera is (set by the canvas): rings and pips grow with the distance so a crew at the far end of the drive still reads. */
  viewer: THREE.Vector3 | null = null;
  private readonly _trGeo = new THREE.BufferGeometry();
  private readonly _trPos = new Float32Array(MAX_TRACERS * 6);
  private readonly _trLines: THREE.LineSegments;
  /** Blood, wound patches and bandages: flat discs, one instanced mesh (no extra draw call while idle: count 0). */
  private readonly _bloodMesh: THREE.InstancedMesh;
  private _stains: Stain[] = [];
  /** What the picture shows of a wound: graphic (default) or restrained (View menu); read when a fight starts. */
  private _graphic = true;
  /** The walls and buildings that stop a round (set by the canvas), read once per fight. */
  fireSource: () => ReadonlyArray<Box> = () => [];
  /** More things to take cover behind: tree trunks (set by the canvas). A parked vehicle in the scene is added when the fight starts. */
  extraCover: () => ReadonlyArray<Box> = () => [];
  private _extra: Box[] | null = null;
  private _fire: ReadonlyArray<Box> | null = null;
  /** Rounds stopped by a wall or a roof so far, and the last one (QA and the screenshot harness read them). */
  impacts = 0;
  lastImpact: { x: number; y: number; z: number; from: { x: number; z: number } } | null = null;
  /** Slow motion: until this battle time, at this rate (the death scene's held beat). */
  private _slowUntil = -1;
  private _rate = 1;
  // fx
  private readonly _puffGeo = new THREE.SphereGeometry(1, 10, 8);
  private readonly _puffs: Puff[] = [];
  private readonly _projs: Proj[] = [];
  private readonly _decals: THREE.Mesh[] = [];
  private readonly _flashes: THREE.PointLight[] = [];
  /** The steady lights of the fires (one each, a fixed four). */
  private readonly _glows: THREE.PointLight[] = [];
  private readonly _lanternLights: THREE.PointLight[] = [];
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
    people: () => ReadonlyArray<{ id: string; shirt: number; body: 'f' | 'm'; kid?: boolean; age?: number; elder?: boolean }>) {
    this._scene = scene; this._ground = ground; this._people = people;
    this._layer = new FigureLayer(scene, 64, 'battle');
    this._group.name = 'battle-fx';
    scene.add(this._group);
    this.invasion = new InvasionFx(this._group, {
      ground, puff: (p, r0, r1, life, rise, color, o0, glow) => this._puff(p, r0, r1, life, rise, color, o0, glow), flash: (p, k, c) => this._flash(p, k, c),
      boom: (x, y, z, r, dust) => this._boom(x, y, z, r, dust), shake: v => { this.shake = Math.max(this.shake, v); }, gap: (id, at, w) => this.onGap?.(id, at, w),
    });
    this.props = new SceneProps(this._group, { ground, puff: (p, r0, r1, life, rise, color, o0, glow) => this._puff(p, r0, r1, life, rise, color, o0, glow), flash: (p, k, c) => this._flash(p, k, c), glow: (i, p, k, c) => { const l = this._glows[i]; if (l) { l.position.copy(p); l.color.setHex(c); l.intensity = k; l.distance = 3 + k * 0.5; } }, shake: v => { this.shake = Math.max(this.shake, v); } });
    this.props.centerOf = () => ({ x: this._center.x, z: this._center.z });
    this._trGeo.setAttribute('position', new THREE.BufferAttribute(this._trPos, 3).setUsage(THREE.DynamicDrawUsage));
    this._trGeo.setDrawRange(0, 0);
    this._trLines = new THREE.LineSegments(this._trGeo, new THREE.LineBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    this._trLines.frustumCulled = false;
    this._group.add(this._trLines);
    this._bloodMesh = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 14), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.92, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3, side: THREE.DoubleSide }), MAX_STAINS + 80);
    this._bloodMesh.count = 0; this._bloodMesh.frustumCulled = false; this._bloodMesh.userData = { noSSAO: true };
    // (in the scene graph only while a fight plays, so the idle scene's draw-call census does not grow)
    this._rods = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }), MAX_TRACERS);
    this._rods.count = 0; this._rods.frustumCulled = false; this._rods.userData = { noSSAO: true };
    this._group.add(this._rods);
    this._rings = new THREE.InstancedMesh(new THREE.RingGeometry(0.16, 0.22, 20).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false }), 64);
    this._rings.count = 0; this._rings.frustumCulled = false; this._rings.userData = { noSSAO: true };
    this._group.add(this._rings);
    this._pips = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.05), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.95, depthWrite: false, toneMapped: false }), 128);
    this._pips.count = 0; this._pips.frustumCulled = false; this._pips.userData = { noSSAO: true };
    this._group.add(this._pips);
    // the lanterns raiders carry at night: two small warm lights (a fixed count, so the shaders never recompile), flickering
    for (let i = 0; i < 2; i++) {
      const l = new THREE.PointLight(0xffa24a, 0, 2.6, 2);
      l.castShadow = false;
      this._lanternLights.push(l); this._group.add(l);
    }
    for (let i = 0; i < 4; i++) {
      const l = new THREE.PointLight(0xffc070, 0, 4, 2);
      l.castShadow = false;
      this._flashes.push(l); this._group.add(l);
    }
    for (let i = 0; i < 4; i++) { const l = new THREE.PointLight(0xff8a30, 0, 5, 2); l.castShadow = false; this._glows.push(l); this._group.add(l); }
  }

  get playing(): boolean { return this.battle !== null; }
  /** Frozen at time 0: the cutscene's lead-in shows the cast in place before the first shot is fired. */
  hold = false;
  /** Whether the sky is dark for this fight (the player sets it from the clock before `play`): decides the clothes and the rim. Unset: the battle's own night flag. */
  lightNight: boolean | null = null;

  /** Everyone in the fight where they stand now (for the cutscene camera). */
  actors(): Array<{ id: string; side: 'home' | 'raider'; post?: string; x: number; y: number; z: number; dead: boolean; gone: boolean }> {
    return [...this._units.values()].filter(u => !u.def.bystander).map(u => ({ id: u.def.id, side: u.def.side, post: u.def.post, x: u.x, y: u.y, z: u.z, dead: u.dead, gone: u.gone || !!u.hidden }));
  }

  /** What the picture shows of each unit's state now (for the name labels' status pips). */
  statuses(): Map<string, { wound: number; dead: boolean; lying: boolean; hands: boolean; carried: boolean }> {
    const m = new Map<string, { wound: number; dead: boolean; lying: boolean; hands: boolean; carried: boolean }>();
    for (const u of this._units.values()) m.set(u.def.id, { wound: u.wound, dead: u.dead, lying: u.layAt != null, hands: !!u.hands, carried: !!u.carriedBy });
    return m;
  }

  /** Events applied since the last call (the cutscene camera reacts to them). */
  drainEvents(): BattleEvent[] {
    const e = this._fed; this._fed = [];
    return e;
  }
  private _fed: BattleEvent[] = [];

  /** Where the fight is: between the defenders and the nearest raiders still in it (for the camera), and how far apart they are. */
  focus(): { x: number; z: number; spread: number } | null {
    const live = [...this._units.values()].filter(u => !u.gone && !u.dead && !u.def.bystander);
    const home = live.filter(u => u.def.side === 'home' && !u.def.machine), raiders = live.filter(u => u.def.side === 'raider');
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
    this.hold = false;
    // a thin rim of sky light (day) or moonlight (night) along each figure's edge, so a dark coat still has a silhouette
    const dark = this.lightNight ?? !!b.night;
    if (dark) this._layer.setRim(0x7f9bd8, 0.3); else this._layer.setRim(0xdfe8f5, 0.45);
    this.time = 0; this._cursor = 0; this._endAt = -1; this.lines = [];
    this._graphic = getViolence() === 'graphic'; this._fire = null; this._extra = null; this._roundCover = null; if (!this._bloodMesh.parent) this._group.add(this._bloodMesh); this._slowUntil = -1; this._rate = 1; this._stains = [];
    const people = this._people();
    const home = b.units.filter(u => u.side === 'home' && !u.bystander);
    const src = home.length ? home : b.units;
    this._center.set(src.reduce((a, u) => a + u.x, 0) / Math.max(1, src.length), 0, src.reduce((a, u) => a + u.z, 0) / Math.max(1, src.length));
    for (const def of b.units) {
      const r = rnd(hashStr(def.personId ?? def.id));
      let wear: Wear, scale = 1;
      const night = dark;
      let armed = false;
      if (def.side === 'home') {
        const p = people.find(q => q.id === def.personId);
        // the household as people: age, sex and build from the person; a defender on the line wears a vest, radio and cap or helmet over their own shirt
        const role: Role = def.civilian ? (p ? roleOfPerson({ kid: !!p.kid, age: p.age ?? 30, elder: p.elder }) : 'adult') : 'guard';
        wear = wearForRole(seedOf(def.personId ?? def.id), role, { season: 'fall', climate: 'mild', female: p?.body === 'f', age: p?.age, night });
        if (p) { wear.shirt = p.shirt; if (p.body === 'f' && wear.hairStyle === 0) wear.longHair = true; }
        if (def.civilian) scale = p ? (p.kid ? ((p.age ?? 9) < 8 ? 0.62 : 0.78) : 1) : 0.66;
        wear.pants = 0x3b4a66;
        armed = !def.civilian && !def.machine;
      } else {
        const rl = def.look?.role;
        const role: Role = rl === 'scout' || rl === 'leader' ? (rl === 'leader' ? 'militia' : 'tactical') : rl === 'soldier' ? 'militia' : rl === 'kid' ? 'child' : rl === 'parent' ? 'neighbor' : !def.look ? (hashStr(def.id) % 3 === 0 ? 'militia' : 'scavenger') : 'scavenger';
        wear = wearForRole(seedOf(def.id), role, { season: 'winter', climate: 'mild', night });
        // (work clothes and old surplus, not one black: by day the tones read against snow and grass, at night they stay near-black)
        const shirts = dark ? RAIDER_SHIRTS_NIGHT : RAIDER_SHIRTS_DAY, pants = dark ? RAIDER_PANTS_NIGHT : RAIDER_PANTS_DAY;
        wear.shirt = shirts[Math.floor(r() * shirts.length)];
        wear.pants = pants[Math.floor(r() * pants.length)]; wear.coat = 1;
        if (def.look) scale = dressRaider(wear, def.look, dark, r);
        if (role === 'militia' || role === 'tactical') { wear.headwear = wear.headwear || HEADWEAR.HELMET; }
        armed = !def.machine && role !== 'child' && role !== 'neighbor' && rl !== 'rabble' && rl !== 'shouter';
      }
      if (def.side === 'raider' && !def.look) wear.hasPack = false;
      wear.shorts = false;
      // armor over the clothes: a coyote plate carrier (back panel), a navy soft vest, an olive helmet
      if (def.armor?.plate) { wear.coat = 1; wear.gear = ((wear.gear ?? 0) & ~GEAR.VEST) | GEAR.PLATE; wear.pack = 0x6e6446; wear.hasPack = false; }
      else if (def.armor?.soft) { wear.coat = 1; wear.gear = (wear.gear ?? 0) | GEAR.VEST; wear.pack = 0x2d3440; }
      if (def.armor?.helmet) { wear.headwear = HEADWEAR.HELMET; wear.hat = 0x3d4232; }
      const y = def.y ?? 0;
      const start = def.side === 'raider' && !def.machine ? this._clearOfCover(def.x, def.z) : { x: def.x, z: def.z };
      this._units.set(def.id, { scale, def, x: start.x, y, z: start.z, tx: start.x, ty: y, tz: start.z, rot: def.side === 'raider' ? Math.atan2(this._center.x - def.x, this._center.z - def.z) : 0,
        phase: r() * 6, speed: RUN, wear, armed, wound: 0, dead: false, crouch: false, gone: false });
    }
    if (b.vehicle) {
      // (the opportunists' pickup: one small group of merged parts, only while this scene plays)
      const v = buildVehicle(b.vehicle.kind);
      const c = this._clearOfCover(b.vehicle.x, b.vehicle.z);
      v.position.set(c.x, this._ground(c.x, c.z), c.z); v.rotation.y = b.vehicle.rot;
      this._group.add(v); this._vehicle = v;
    }
    this.invasion.begin(b);
    this.props.end();
    this._floodsOutAt = -1; this._floodBase = []; this._lightsSparked = false;
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

  private _vehicle: THREE.Group | null = null;

  stop(): void {
    this.invasion.end();
    this.props.end();
    if (this._vehicle) { this._group.remove(this._vehicle); this._vehicle.traverse(o => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).geometry.dispose(); }); this._vehicle = null; }
    for (const m of this._marks) { this._group.remove(m.sprite); m.sprite.material.dispose(); }
    this._marks.length = 0;
    this.battle = null;
    this._fed = [];
    this._units.clear();
    this._pending = [];
    this._tracers.length = 0;
    this._trGeo.setDrawRange(0, 0);
    this._rods.count = 0; this._rings.count = 0; this._pips.count = 0; this._bloodMesh.count = 0; this._stains = []; this._slowUntil = -1; this._rate = 1; this._group.remove(this._bloodMesh);
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
    for (const f of this._glows) f.intensity = 0;
    for (const l of this._lanternLights) l.intensity = 0;
    this.shake = 0;
    this._layer.commit(0, false);
  }

  update(dt: number): void {
    const b = this.battle;
    if (!b) return;
    if (this.hold) { this._moveUnits(0); return; }
    if (this.time < this._slowUntil) dt *= this._rate;
    this.time += dt;
    while (this._cursor < b.events.length && b.events[this._cursor].t <= this.time) this._apply(b.events[this._cursor++]);
    for (let i = this._pending.length - 1; i >= 0; i--) if (this._pending[i].at <= this.time) { this._apply(this._pending[i].ev); this._pending.splice(i, 1); }
    if (this._endAt < 0 && this.time > b.duration + 1) this._endAt = this.time;
    if (this._endAt >= 0 && this.time - this._endAt > END_HOLD) { this.stop(); this.onEnd?.(); return; }
    this._moveUnits(dt);
    this.invasion.update(dt);
    this.props.update(dt, id => { const u = this._units.get(id); return u ? { x: u.x, y: u.y, z: u.z, rot: u.rot, dead: u.dead, gone: u.gone } : null; });
    this._tickFx(dt);
    if (this._alarm) this._alarm.intensity = this._alarmOn ? (0.5 + 0.5 * Math.sin(this.time * 9)) * 6 : 0;
    this.shake = Math.max(0, this.shake - dt * 1.5);
  }

  /** Where a unit's chest is. */
  private _chest(u: U, out: THREE.Vector3): THREE.Vector3 {
    return out.set(u.x, this._ground(u.x, u.z) + u.y + (u.crouch ? 0.12 : 0.2), u.z);
  }

  private _roundCover: Round[] | null = null;
  private _rounds(): Round[] { return (this._roundCover ??= this.coverSource().map(c => ({ x: c.x, z: c.z, r: c.r, h: (c as { h?: number }).h ?? 0.25 }))); }
  /** The shooter takes cover the way a real one does: the nearest thing that blocks the threat (kneels behind low cover, leans out of a tall one); a raider steps to it. The target in the open goes flat when rounds crack past. */
  private _takeCover(a: U, t: U, e: { hit: boolean }): void {
    if (!a.dead && !a.carriedBy && !a.hands && !a.def.machine && this.time - (a.coverAt ?? -9) > 2 && Math.hypot(a.tx - a.x, a.tz - a.z) < 0.05) {
      a.coverAt = this.time;
      const pick = chooseCover({ x: a.x, z: a.z }, { x: t.x, z: t.z }, this._coverBoxes(), this._rounds(), false);
      if (pick.stance === 'kneel' || pick.stance === 'lean') {
        if (a.def.side === 'raider' && pick.walk > 0.03) { a.tx = pick.x; a.tz = pick.z; }
        a.crouch = pick.stance === 'kneel'; a.lean = pick.stance === 'lean' ? pick.side : 0;
      } else { a.lean = 0; if (a.def.side === 'raider') a.crouch = true; }   // (nothing to get behind: a raider covering the others' advance fires from a knee, and gets up to run)
    }
    const inCover = !!t.lean || t.crouch;
    if (!e.hit && !t.dead && !t.def.machine && inCover) t.duckUntil = this.time + 1.1;   // rounds cracking past: heads down
    if (!t.dead && !t.carriedBy && !t.def.machine && (t.def.side === 'raider' || e.hit) && dropsProne(inCover, e.hit, !e.hit)) t.proneUntil = this.time + 1.4;
  }
  /** What a shooter can get behind: the walls and buildings (low ones kneel, tall ones lean), the trunks of trees, a parked truck. */
  private _coverBoxes(): ReadonlyArray<Box> {
    if (!this._extra) {
      this._extra = [...this.extraCover()];
      const v = this.battle?.vehicle;
      if (v) this._extra.push({ x0: v.x - 0.4, x1: v.x + 0.4, z0: v.z - 0.4, z1: v.z + 0.4, h: 0.31, kind: 'building' });
    }
    return [...this._fireBoxes(), ...this._extra];
  }
  private _fireBoxes(): ReadonlyArray<Box> { return (this._fire ??= this.fireSource()); }
  /** Where a rifle's muzzle is (the shoulder: SCALE v2, a person is 0.28 tall) and where a round aimed at someone lands (the chest). */
  private _muzzle(u: U, out: THREE.Vector3): THREE.Vector3 { return out.set(u.x, this._ground(u.x, u.z) + u.y + (u.crouch ? MUZZLE.kneel : MUZZLE.stand) * u.scale, u.z); }
  private _torso(u: U, out: THREE.Vector3): THREE.Vector3 { return out.set(u.x, this._ground(u.x, u.z) + u.y + (u.crouch ? TORSO.kneel : TORSO.stand) * u.scale, u.z); }
  /** Sand over the blood: every pool within a hand's breadth of the place shrinks away over `secs`. */
  private _cleanStains(x: number, z: number, secs: number): void {
    for (const s of this._stains) if (!s.prop && Math.hypot(s.x - x, s.z - z) < 0.45) s.clean = { t0: this.time, secs: Math.max(0.5, secs) };
  }
  private _stain(s: Stain): void {
    if (this._stains.length >= MAX_STAINS) { const i = this._stains.findIndex(x => x.born == null); if (i >= 0) this._stains.splice(i, 1); else this._stains.shift(); }
    this._stains.push(s);
  }
  /** A round stopped by a wall or a roof: dust and a spark where it struck, nothing on the far side. */
  private _impact(at: THREE.Vector3, from?: THREE.Vector3): void {
    this.impacts++; this.lastImpact = { x: at.x, y: at.y, z: at.z, from: from ? { x: from.x, z: from.z } : { x: at.x, z: at.z } };
    this._puff(at, 0.016, 0.08, 0.6, 0.03, 0xb9aa90, 0.6);
    this._puff(at, 0.02, 0.06, 0.3, 0, 0xffdca8, 1, true);
    this._puff(at, 0.006, 0.02, 0.18, 0, 0xfff4d0, 1, true);
  }
  /** A round that hits: a red mist at the chest, droplets on the ground behind, and on a wall if one stands there (graphic only). */
  private _hit(p1: THREE.Vector3, p0: THREE.Vector3): void {
    if (!this._graphic) return;
    this._puff(p1, 0.01, 0.05, 0.3, 0.015, 0x8c1511, 0.8);
    const d = { x: p1.x - p0.x, z: p1.z - p0.z }, l = Math.hypot(d.x, d.z) || 1, seed = Math.floor(this.time * 1000) + this._stains.length;
    for (const b of spatter(seed, p1.x, p1.z, d)) this._stain({ x: b.x, y: this._ground(b.x, b.z) + 0.006, z: b.z, r: b.r, stretch: b.stretch, rot: b.rot, color: 0x5e0d0b });
    const far = new THREE.Vector3(p1.x + d.x / l * 0.8, p1.y, p1.z + d.z / l * 0.8);
    const w = lineOfFire(p1, far, this._fireBoxes(), this._ground, 0);
    if (w.blocked && w.at && w.by) {
      const n = faceNormal(w.by, w.at);
      this._stain({ x: w.at.x + n.x * 0.006, y: w.at.y, z: w.at.z + n.z * 0.006, r: 0.03, stretch: 1.5, rot: 0, color: 0x5a0c0a, wall: { nx: n.x, nz: n.z } });
    }
  }
  private _near(e: { x: number; z: number; near?: { unit: string; r: number; a: number } }): { x: number; z: number } {
    if (!e.near) return e;
    const o = this._units.get(e.near.unit);
    return o ? { x: o.x + Math.cos(e.near.a) * e.near.r, z: o.z + Math.sin(e.near.a) * e.near.r } : e;
  }

  private _apply(e: BattleEvent): void {
    if (this._fed.length < 64) this._fed.push(e);
    const U_ = (id: string) => this._units.get(id);
    switch (e.kind) {
      case 'alarm': this._alarmOn = true; if (e.what === 'dog') this.props.onEvent({ ...e }); break;
      case 'lights': this._lightsOn(e.masts, e.aim); break;
      case 'move': { const u = U_(e.unit); if (u && !u.dead) { const n = this._near(e), c = u.def.side === 'raider' ? this._clearOfCover(n.x, n.z, { x: u.x, z: u.z }, e.unit) : n; u.tx = c.x; u.tz = c.z; u.ty = e.y ?? 0; u.crouch = false; u.lean = 0; if (e.walk) u.speed = WALK; } break; }
      case 'cover': { const u = U_(e.unit); if (u && !u.dead) { const n = this._near(e), c = u.def.side === 'raider' ? this._clearOfCover(n.x, n.z, { x: u.x, z: u.z }, e.unit) : n; u.tx = c.x; u.tz = c.z; u.ty = 0; u.crouch = true; if (e.walk) u.speed = WALK; } break; }
      case 'beat':
        if (e.rate && e.secs) { this._rate = e.rate; this._slowUntil = Math.max(this._slowUntil, this.time + e.secs); }
        if (e.role === 'vigil') this._alarmOn = false;   // the shooting is over: the alarm light goes out, and the yard is quiet
        break;
      case 'surrender': {
        const u = U_(e.unit);
        if (u && !u.dead) {
          u.tx = u.x; u.tz = u.z; u.hands = true; u.crouch = false;
          // the weapon goes down at his feet: a dark rifle-length bar on the ground (0.1 units = 60 cm)
          this._stain({ x: u.x + Math.cos(u.rot) * 0.08, y: this._ground(u.x, u.z) + 0.013, z: u.z - Math.sin(u.rot) * 0.08, r: 0.008, stretch: 11, rot: u.rot + 1.2, color: 0x2b2824, prop: true });
        }
        break;
      }
      case 'lay': { const u = U_(e.unit); if (u && !u.dead && u.layAt == null) { u.tx = u.x; u.tz = u.z; u.layAt = this.time + 0.2; u.crouch = false; if (this._graphic) this._stain({ x: u.x, y: this._ground(u.x, u.z) + 0.01, z: u.z, r: 0.01, stretch: 1.2, rot: u.rot, color: 0x4d0a09, born: this.time + 0.6, r1: 0.05 }); } break; }
      case 'hide': { const u = U_(e.unit); if (u && !u.dead) { u.tx = e.x; u.tz = e.z; u.ty = 0; u.crouch = true; u.lean = 0; u.hideHow = e.how; } break; }
      case 'freeze': { const u = U_(e.unit); if (u && !u.dead) { u.tx = u.x; u.tz = u.z; u.hands = true; u.crouch = false; } break; }
      case 'shield': { const u = U_(e.unit), o = U_(e.over); if (u && o && !u.dead) { u.crouch = true; o.crouch = true; u.rot = Math.atan2(o.x - u.x, o.z - u.z); } break; }   // (the planner walks the shielder to a free spot beside the other)
      case 'found': { const u = U_(e.unit); if (u && !u.dead) { u.hidden = false; u.hideHow = undefined; u.hands = true; u.crouch = false; u.tx = u.x; u.tz = u.z; } break; }
      case 'hostage': { const u = U_(e.unit); if (u && !u.dead) { u.ledBy = e.by; u.hands = true; u.crouch = false; u.hidden = false; u.hideHow = undefined; } break; }
      case 'spare': { const u = U_(e.unit); if (u && !u.dead) { u.hidden = false; u.hideHow = undefined; u.hands = true; u.crouch = false; u.tx = u.x; u.tz = u.z; } break; }
      case 'scout': { for (const id of e.units) { const u = U_(id); if (u && !u.dead) { u.crouch = true; u.tx = u.x; u.tz = u.z; } } break; }   // (two men at the edge of the light, down on a knee, watching the place)
      case 'panic': {
        const u = U_(e.unit);
        if (u && !u.dead && e.how === 'freeze') { u.frozenUntil = this.time + e.secs; u.tx = u.x; u.tz = u.z; u.hands = true; u.crouch = false; }
        break;
      }
      case 'lift': { const v = U_(e.unit), c = U_(e.by); if (v && c) { v.carriedBy = c.def.id; v.crouch = false; } break; }
      case 'lower': { const v = U_(e.unit); if (v?.carriedBy) { const c = U_(v.carriedBy); if (c) { v.x = v.tx = c.x + Math.sin(c.rot) * 0.1; v.z = v.tz = c.z + Math.cos(c.rot) * 0.1; v.rot = c.rot + Math.PI / 2; } v.carriedBy = undefined; if (!v.dead) v.crouch = true; } break; }
      case 'shot': {
        const a = U_(e.from), t = U_(e.to);
        if (!a || !t || a.dead) break;
        const p0 = this._muzzle(a, new THREE.Vector3()), p1 = this._torso(t, new THREE.Vector3());
        if (!e.hit) { p1.x += (Math.random() - 0.5) * 0.6; p1.z += (Math.random() - 0.5) * 0.6; p1.y += (Math.random() - 0.3) * 0.3; }
        a.rot = Math.atan2(p1.x - p0.x, p1.z - p0.z);
        a.armed = true; a.aimUntil = this.time + 1.1;
        // a round only crosses a wall or a roof when the line clears its top (a tower, a wall walk): otherwise it stops at the face (lineOfFire.ts)
        const lof = lineOfFire(p0, p1, this._fireBoxes(), this._ground, { from: a.def.side === 'home' && !a.def.machine ? WALL_POST : OWN_BOX, to: OWN_BOX });
        if (lof.blocked && lof.at) { p1.set(lof.at.x, lof.at.y, lof.at.z); this._impact(p1, p0); } else if (e.hit) this._hit(p1.clone(), p0);
        this._takeCover(a, t, e);
        this._tracer(p0, p1);
        this._flash(p0, 3, 0xffc070);
        if (e.auto) for (let k = 1; k <= 3; k++) this._pending.push({ at: this.time + k * 0.09, ev: { ...e, t: e.t, auto: false, hit: false } });
        break;
      }
      case 'snag': {
        // caught on the wire / the thorns / in the ditch: he stops where he is and crouches, a small cloud of dust
        const u = U_(e.unit); if (!u || u.dead) break;
        u.tx = u.x; u.tz = u.z; u.crouch = true;
        this._puff(new THREE.Vector3(u.x, this._ground(u.x, u.z) + 0.05, u.z), 0.04, 0.3, 0.6, 0.03, 0x8a7a5c, 0.5);
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
      case 'ram': case 'charge': case 'gap': this.invasion.onEvent(e); break;
      case 'house_door': case 'loot': case 'fire': case 'ladder': case 'flare': case 'flag': case 'tool': case 'repair': this.props.onEvent(e); break;
      case 'grave': {
        this.props.onEvent(e);
        // under the earth: the fallen is no longer on the ground once the filling has begun
        if (e.stage === 'fill' && e.unit) { const v = U_(e.unit); if (v) v.hideAt = this.time + 1.2; }
        // laid in: the body is slid from where it was set down into the pit
        if (e.stage === 'lower' && e.unit) { const v = U_(e.unit); if (v) v.sink = { x: e.x, z: e.z, x0: v.x, z0: v.z, t0: this.time, secs: Math.max(0.6, e.secs) }; }
        break;
      }
      case 'clean': this._cleanStains(e.x, e.z, e.secs); break;
      case 'breach':
        this._boom(e.x, this._ground(e.x, e.z), e.z, 0.5, true);
        // a crew that has broken the line shoots out the floodlights: the yard goes dark a moment after (night only: by day nobody needs them)
        if (this._floods.length && (this.lightNight ?? this.battle?.night)) this._floodsOutAt = this.time + 1.4;
        break;
      case 'door': this.onDoor?.(e.open, e.x, e.z, e.what); break;      // the crew at the tunnel's steel door: shut while they work at it, forced when they are through
      case 'fallback': this.shake = Math.max(this.shake, 0.15); break;
      case 'carry': break;   // the wounded's own move event carries them in
      case 'wound': {
        const u = U_(e.unit);
        if (u && !e.stopped) {
          u.wound = Math.min(1, u.wound + Math.max(0.3, e.sev)); this._tint(u, e.part);
          if (!u.dead) u.duckUntil = Math.max(u.duckUntil ?? 0, this.time + 1.6);
          if (e.part === 'leg') { if (u.limp || e.sev >= 45) u.crawl = true; u.limp = true; } else if (e.part === 'arm') u.sling = true; else if (e.part === 'torso' && e.sev >= 60) u.crawl = true;   // (a hit is felt: down on a knee, a hand to it, whatever else he is doing)
          if (this._graphic) {
            (u.marks ??= []).push({ part: e.part, sev: e.sev }); if (u.marks.length > 2) u.marks.shift();
            this._stain({ x: u.x, y: this._ground(u.x, u.z) + 0.006, z: u.z, r: 0.008 + 0.012 * Math.min(1, e.sev / 60), stretch: 1.3, rot: u.rot, color: 0x5e0d0b });
          }
        }
        break;
      }
      case 'death': {
        const u = U_(e.unit);
        if (u) {
          u.dead = true; u.wound = 1; this._tint(u); u.y = 0; u.fallAt = this.time + 0.3;
          if (this._graphic) this._stain({ x: u.x, y: this._ground(u.x, u.z) + 0.009, z: u.z, r: 0.01, stretch: 1.25, rot: u.rot, color: 0x4a0908, born: this.time + 0.7, r1: u.def.side === 'home' ? 0.115 : 0.095 });
        }
        break;
      }
      case 'taken':
      case 'flee': {
        const u = U_(e.unit); if (!u || u.dead) break;
        const dx = u.x - this._center.x, dz = u.z - this._center.z, d = Math.hypot(dx, dz) || 1;
        u.tx = u.x + dx / d * 60; u.tz = u.z + dz / d * 60; u.ty = 0; u.speed = FLEE; u.crouch = false;
        break;
      }
      case 'reload': case 'jam': { const u = U_(e.unit); if (u && !u.dead) u.crouch = true; break; }   // down behind cover to fix the gun
      case 'aid': {
        const u = U_(e.unit), by = U_(e.by);
        if (by && u && by !== u) { if (!e.still && Math.hypot(by.x - u.x, by.z - u.z) > 0.16) { by.tx = u.x + 0.08; by.tz = u.z; } by.crouch = true; }
        if (u) {
          u.bandagedAt = this.time + 2.2;
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

  private _tint(u: U, part?: 'head' | 'torso' | 'arm' | 'leg'): void {
    const k = stain(u.wound, this._graphic);
    const c = new THREE.Color(u.wear.shirt).lerp(new THREE.Color(this._graphic ? 0x6a0c0c : 0x8a1010), k);
    u.wear = { ...u.wear, shirt: c.getHex(), ...(this._graphic && part === 'leg' ? { pants: new THREE.Color(u.wear.pants).lerp(new THREE.Color(0x5a0a0a), 0.6).getHex() } : {}) };
  }

  private _lightsOn(masts?: Array<{ x: number; z: number; y: number }>, aim?: { x: number; z: number }): void {
    if (this._floods.length) return;
    const c = this._center;
    // floodlights on the towers' masts (sim/towers.ts): hard white lamps up high, aimed down the approach
    if (masts?.length) {
      masts.forEach((m, i) => {
        const a = aim ?? c;
        const s = new THREE.SpotLight(0xfff6ea, this.lightNight ?? this.battle?.night ? 90 : 12, 40, 0.75, 0.45, 1.2);
        s.position.set(m.x, this._ground(m.x, m.z) + m.y, m.z);
        s.target.position.set(a.x, this._ground(a.x, a.z), a.z);
        s.castShadow = i === 0;
        if (s.castShadow) s.shadow.mapSize.set(512, 512);
        this._group.add(s); this._group.add(s.target);
        this._floods.push(s);
      });
      return;
    }
    for (let i = 0; i < 3; i++) {
      const a = i * (Math.PI * 2 / 3) + 0.4;
      const x = c.x + Math.cos(a) * 2.5, z = c.z + Math.sin(a) * 2.5;
      const s = new THREE.SpotLight(0xfff3dd, this.lightNight ?? this.battle?.night ? 40 : 8, 30, 0.6, 0.5, 1.4);
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
    this._layer.setTime(this.time);
    const carriers = new Set<string>();
    for (const q of this._units.values()) if (q.carriedBy && !q.gone) carriers.add(q.carriedBy);
    for (const u of this._units.values()) {
      if (u.hideAt != null && this.time >= u.hideAt) u.gone = true;   // (buried: under the earth)
      if (u.sink) { const k = Math.max(0, Math.min(1, (this.time - u.sink.t0) / u.sink.secs)); u.x = u.tx = u.sink.x0 + (u.sink.x - u.sink.x0) * k; u.z = u.tz = u.sink.z0 + (u.sink.z - u.sink.z0) * k; u.y = -0.004 * k; }
      if (u.gone || u.def.machine) continue;
      let moving = false;
      if (u.frozenUntil != null && this.time >= u.frozenUntil) { u.frozenUntil = undefined; u.hands = false; }
      if (u.frozenUntil != null) { u.tx = u.x; u.tz = u.z; }   // (rooted to the spot, hands to the face, until the fear lets go)
      // (someone who has gone to ground is crouched where they hide, in plain sight of the camera: nobody blinks out of the picture)
      if (u.ledBy && !u.dead) {
        // led by the arm: a step behind the captor, wherever they go
        const c = this._units.get(u.ledBy);
        if (c && !c.dead) { const k = Math.min(1, dt * 5); u.x += (c.x - Math.sin(c.rot) * 0.08 - u.x) * k; u.z += (c.z - Math.cos(c.rot) * 0.08 - u.z) * k; u.rot = c.rot; moving = Math.hypot(c.x - u.x, c.z - u.z) > 0.12; u.tx = u.x; u.tz = u.z; }
      } else if (u.carriedBy) {
        // in someone's arms: across the carrier's forearms, wherever they walk
        const c = this._units.get(u.carriedBy);
        if (c) { u.x = c.x + Math.sin(c.rot) * 0.04; u.z = c.z + Math.cos(c.rot) * 0.04; u.rot = c.rot + Math.PI / 2; u.tx = u.x; u.tz = u.z; }
      } else if (!u.dead && u.layAt == null) {
        const dx = u.tx - u.x, dz = u.tz - u.z, d = Math.hypot(dx, dz);
        if (d > 0.02) {
          const step = Math.min(d, u.speed * (u.wound > 0.5 ? 0.6 : 1) * (u.crawl ? 0.4 : u.limp ? 0.8 : 1) * dt);
          u.x += dx / d * step; u.z += dz / d * step; moving = true;
          let dr = Math.atan2(dx, dz) - u.rot; dr = Math.atan2(Math.sin(dr), Math.cos(dr));
          u.rot += dr * Math.min(1, dt * 10);
          // climbing to a post: the height follows the remaining distance
          u.y += (u.ty - u.y) * Math.min(1, step / Math.max(d, d <= 0.3 ? 0.02 : 0.3));   // (lands exactly on arrival: up a ladder, the last 30 cm is the climb)
        } else u.y += (u.ty - u.y) * Math.min(1, dt * 4);
        if (u.speed === FLEE && Math.hypot(u.x - this._center.x, u.z - this._center.z) > 50) { u.gone = true; continue; }
      }
      // the stride follows the ground covered, so the planted foot does not slide; the swing grows with the pace
      const stepD = u.px === undefined ? 0 : Math.hypot(u.x - u.px, u.z - (u.pz ?? u.z));
      u.px = u.x; u.pz = u.z;
      const pace = dt > 1e-4 ? stepD / dt : 0;
      const amp = moving ? (u.limp ? 0.3 : pace > 0.75 ? 0.85 : 0.55) : 0;
      if (moving) u.phase = (u.phase + stridePhase(stepD, u.scale, Math.max(0.3, amp))) % 6283.19;
      if (n >= this._layer.capacity) break;
      this._layer.setWear(n, u.wear);
      const gy = this._ground(u.x, u.z) + u.y;
      // from far off the figures grow a little (up to 2.4x), so a crew at the end of the drive is still people, not specks
      const dv = this.viewer ? Math.hypot(u.x - this.viewer.x, gy - this.viewer.y, u.z - this.viewer.z) : 0;
      const gs = u.scale * Math.min(2.4, Math.max(1, dv / 16));
      const ducking = u.duckUntil != null && this.time < u.duckUntil;
      const aiming = u.aimUntil != null && this.time < u.aimUntil && !moving && !u.dead && !u.hands;
      const fallT = u.dead ? Math.max(0, Math.min(1, (this.time - (u.fallAt ?? 0)) / 0.95)) : -1;
      let pose: number = FIG_POSE.STAND, tool: number = FIG_TOOL.NONE;
      if ((u.hands && !moving) || (u.y > 0.06 && u.def.side === 'raider' && !u.dead)) pose = FIG_POSE.REACH;   // (a raider off the ground is on a ladder's rungs: arms up, reaching for the next one)
      else if (fallT >= 0 && fallT < 1) pose = FIG_POSE.FALL;
      else if (ducking && !moving) pose = FIG_POSE.COVER;
      else if (aiming && u.armed) { pose = FIG_POSE.AIM; tool = FIG_TOOL.RIFLE; }
      else if (u.crouch && !moving) { pose = u.armed && !u.dead ? FIG_POSE.RIFLE : FIG_POSE.KNEEL; tool = u.armed && !u.dead ? FIG_TOOL.RIFLE : tool; }
      else if (carriers.has(u.def.id)) pose = FIG_POSE.CARRYP;
      else if (u.sling && !u.dead) pose = FIG_POSE.CROSS;
      else if (u.armed && !u.dead && !u.def.civilian) { pose = FIG_POSE.RIFLE; tool = FIG_TOOL.RIFLE; }
      const slope = (this._ground(u.x + Math.sin(u.rot) * 0.1, u.z + Math.cos(u.rot) * 0.1) - this._ground(u.x - Math.sin(u.rot) * 0.1, u.z - Math.cos(u.rot) * 0.1)) / 0.2;
      this._layer.setPose(n, { x: u.x, y: gy, z: u.z, rot: u.rot, scale: gs, pose, tool, slope, phase: pose === FIG_POSE.FALL ? fallT : u.phase, amp });
      u.gs = gs;
      const down = u.carriedBy ? 1 : u.dead ? Math.max(0, Math.min(1, (this.time - (u.fallAt ?? 0)) / 0.95)) : u.layAt != null ? Math.max(0, Math.min(1, (this.time - u.layAt) / 0.7)) : -1;
      const flat = ((u.proneUntil != null && this.time < u.proneUntil && !moving) || !!u.crawl) && !u.dead && u.layAt == null && !u.carriedBy && !u.hands && u.frozenUntil == null;
      if (flat) {
        // flat on the ground under fire: chest down, head toward the threat
        this._e.set(Math.PI / 2, u.rot + Math.PI, 0, 'YXZ');
        this._q.setFromEuler(this._e);
        this._m.compose(this._v.set(u.x, gy + 0.025, u.z), this._q, this._s.setScalar(FIG_SCALE * gs));
        this._m.toArray(this._layer.mesh.instanceMatrix.array as Float32Array, n * 16);
      } else if (u.y > 0.06 && u.def.side === 'raider' && !u.dead && u.layAt == null && !u.carriedBy) {
        // on a ladder's rungs: pitched into the ladder with both arms up (the reach pose), feet on a rung, bobbing a little as he climbs: never upright at the top
        this._e.set(0.32 + (moving ? Math.sin(u.phase + this.time * 7) * 0.05 : 0), u.rot, 0, 'YXZ');
        this._q.setFromEuler(this._e);
        this._m.compose(this._v.set(u.x, gy, u.z), this._q, this._s.setScalar(FIG_SCALE * gs));
        this._m.toArray(this._layer.mesh.instanceMatrix.array as Float32Array, n * 16);
      } else if (u.lean && !(u.duckUntil != null && this.time < u.duckUntil) && !u.dead && u.layAt == null && !u.carriedBy && !moving) {
        // standing back from something tall and leaning out round the edge of it to fire
        this._e.set(0, u.rot, -u.lean * 0.42, 'YXZ');
        this._q.setFromEuler(this._e);
        this._m.compose(this._v.set(u.x + Math.cos(u.rot) * u.lean * 0.04, gy, u.z - Math.sin(u.rot) * u.lean * 0.04), this._q, this._s.setScalar(FIG_SCALE * gs));
        this._m.toArray(this._layer.mesh.instanceMatrix.array as Float32Array, n * 16);
      } else if ((u.crouch || (u.duckUntil != null && this.time < u.duckUntil)) && !moving && !u.hands && !u.dead && u.layAt == null && !u.carriedBy && !(u.lean && !(u.duckUntil != null && this.time < u.duckUntil))) {
        // down on a knee, hunched forward behind the cover (the figure rig's own knee pose only drops the hips; this reads from across a yard)
        this._e.set(0.5, u.rot, 0, 'YXZ');
        this._q.setFromEuler(this._e);
        this._m.compose(this._v.set(u.x, gy, u.z), this._q, this._s.set(FIG_SCALE * gs, FIG_SCALE * gs * 0.78, FIG_SCALE * gs));
        this._m.toArray(this._layer.mesh.instanceMatrix.array as Float32Array, n * 16);
      } else if (down >= 0 && !(u.dead && down === 0 && !u.carriedBy)) {
        // a hit figure staggers back a step, leans, then goes down along its heading (a lifted one lies across the carrier's arms)
        const lean = 0.35, tilt = u.carriedBy ? -Math.PI / 2 : down < 0.3 ? -lean * (down / 0.3) * (2 - down / 0.3) : -lean - (Math.PI / 2 - lean) * ((down - 0.3) / 0.7) ** 2;
        const back = u.carriedBy ? 0 : 0.06 * Math.min(1, down / 0.5);
        this._e.set(tilt, u.rot, 0, 'YXZ');
        this._q.setFromEuler(this._e);
        this._m.compose(this._v.set(u.x - Math.sin(u.rot) * back, gy + (u.carriedBy ? 0.15 : 0.03 * Math.max(0, (down - 0.3) / 0.7)), u.z - Math.cos(u.rot) * back), this._q, this._s.setScalar(FIG_SCALE * gs));
        this._m.toArray(this._layer.mesh.instanceMatrix.array as Float32Array, n * 16);
      }
      n++;
    }
    this._layer.commit(n, true);
    let ri = 0;
    for (const u of this._units.values()) {
      if (u.gone || u.dead || u.def.machine || ri >= 64) continue;
      const gy = this._ground(u.x, u.z) + u.y;
      // from afar the markers grow with the distance (a ring 0.22 wide is under a pixel at 30 units, and a sliver at a low angle)
      const d = this.viewer ? Math.hypot(u.x - this.viewer.x, gy - this.viewer.y, u.z - this.viewer.z) : 0;
      const k = Math.max(1, d / 8);
      const hex = u.def.side === 'raider' ? 0xff3b30 : 0x4aa8ff;
      this._m.compose(this._v.set(u.x, gy + 0.02, u.z), this._q.identity(), this._s.set(k, 1, k));
      this._rings.setMatrixAt(ri, this._m);
      this._rings.setColorAt(ri, this._c.setHex(hex));
      // (a marker only past 30 units, small: the figures themselves are scaled up by then)
      this._m.compose(this._v.set(u.x, gy + 0.36 * u.scale * Math.max(1, d / 16) + 0.1, u.z), this._q.identity(), this._s.setScalar(d > 30 ? Math.min(2.2, d / 30) : 0));
      this._pips.setMatrixAt(ri, this._m);
      this._pips.setColorAt(ri, this._c.setHex(hex));
      ri++;
    }
    // a lantern or a flashlight in the hand of about every other raider at night: a bright pip (no extra draw: it rides the pips' instances) and, for two of them, a small light
    let pn = ri, ln = 0;
    const dark = this.lightNight ?? !!this.battle?.night;
    for (const u of this._units.values()) {
      if (!dark || u.def.side !== 'raider' || u.gone || u.dead || u.def.machine || pn >= 128) continue;
      const lk = u.def.look;
      const hsh = lk ? (lk.torch ? 0 : 3) : hashStr(u.def.id) % 4;   // (0 and 2: a lantern, 1: a flashlight, 3: nothing in hand; a styled raider carries a torch or nothing)
      if (hsh > 2) continue;
      const gy = this._ground(u.x, u.z) + u.y, warm = hsh !== 1;
      const hx = u.x + Math.cos(u.rot) * 0.06 + Math.sin(u.rot) * 0.03, hz = u.z - Math.sin(u.rot) * 0.06 + Math.cos(u.rot) * 0.03, hy = gy + 0.12;
      const d = this.viewer ? Math.hypot(hx - this.viewer.x, hy - this.viewer.y, hz - this.viewer.z) : 0;
      const sc = 0.55 + 0.1 * Math.min(6, d / 5);
      this._m.compose(this._v.set(hx, hy, hz), this._q.identity(), this._s.setScalar(sc));
      this._pips.setMatrixAt(pn, this._m);
      this._pips.setColorAt(pn, this._c.setHex(warm ? 0xffb347 : 0xdff0ff));
      pn++;
      if (warm && ln < this._lanternLights.length) {
        const l = this._lanternLights[ln++];
        l.position.set(hx, hy + 0.04, hz);
        l.intensity = 0.55 + 0.2 * Math.sin(performance.now() / 1000 * 9 + ln * 2.1) + 0.1 * Math.sin(performance.now() / 1000 * 23 + ln);
      }
    }
    for (; ln < this._lanternLights.length; ln++) this._lanternLights[ln].intensity = 0;
    this._rings.count = ri; this._pips.count = pn;
    this._drawBlood();
    for (const m of [this._rings, this._pips]) {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
  }

  /** Pools, spatter, wound patches and bandages, into the one instanced mesh. */
  private _drawBlood(): void {
    const m = this._bloodMesh;
    let k = 0;
    const put = (x: number, y: number, z: number, rx: number, ry: number, color: number, yaw: number, flat: boolean, pitchYaw = 0) => {
      if (k >= m.instanceMatrix.count) return;
      this._e.set(flat ? -Math.PI / 2 : 0, flat ? pitchYaw : yaw, 0, 'YXZ');
      this._q.setFromEuler(this._e);
      this._m.compose(this._v.set(x, y, z), this._q, this._s.set(rx, ry, 1));
      m.setMatrixAt(k, this._m); m.setColorAt(k, this._c.setHex(color)); k++;
    };
    for (const s of this._stains) {
      if (!this._graphic && !s.prop) continue;
      let r = s.born != null ? (this.time < s.born ? 0 : Math.max(0.004, poolRadius(this.time - s.born, s.r1 ?? s.r))) : s.r;
      if (s.clean) r *= Math.max(0, 1 - (this.time - s.clean.t0) / s.clean.secs);
      if (r <= 0.002) continue;
      if (s.wall) put(s.x, s.y, s.z, r, r * s.stretch, s.color, Math.atan2(s.wall.nx, s.wall.nz), false);
      else put(s.x, s.y, s.z, r * s.stretch, r, s.color, 0, true, s.rot);
    }
    if (!this._graphic) { m.count = k; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; return; }
    // on the figures: the wound as a dark patch on the shirt, then a pale bandage with the blood coming through
    const vw = this.viewer;
    for (const u of this._units.values()) {
      if (!u.marks?.length || u.dead || u.gone || u.layAt != null || u.carriedBy || u.def.machine) continue;
      const gs = u.gs ?? u.scale, gy = this._ground(u.x, u.z) + u.y;
      const fx0 = vw ? vw.x - u.x : Math.sin(u.rot), fz0 = vw ? vw.z - u.z : Math.cos(u.rot), fl = Math.hypot(fx0, fz0) || 1, fx = fx0 / fl, fz = fz0 / fl;
      const yaw = Math.atan2(fx, fz);
      u.marks.forEach((mk, i) => {
        const w = woundSpot(mk.part, u.crouch), bandaged = u.bandagedAt != null && this.time >= u.bandagedAt && i === u.marks!.length - 1;
        const x = u.x + fx * 0.04 * gs - fz * 0.035 * gs * w.side, z = u.z + fz * 0.04 * gs + fx * 0.035 * gs * w.side, y = gy + w.h * 0.28 * gs;
        const r = (0.014 + 0.012 * Math.min(1, mk.sev / 70)) * gs;
        if (bandaged) { put(x, y, z, r * 1.5, r * 1.15, 0xe7dfcd, yaw, false); put(x + fx * 0.004, y, z + fz * 0.004, r * 0.7, r * 0.55, 0x8a1212, yaw, false); }
        else put(x, y, z, r, r * 1.2, 0x560808, yaw, false);
      });
    }
    m.count = k;
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }

  /** When the floodlights are shot out (a night breach), and how bright they were. */
  private _floodsOutAt = -1;
  private _lightsSparked = false;
  private _floodBase: number[] = [];
  private _tickFx(dt: number): void {
    if (this._floodsOutAt >= 0 && this.time >= this._floodsOutAt) {
      if (!this._floodBase.length) this._floodBase = this._floods.map(f => f.intensity);
      const k = Math.max(0, 1 - (this.time - this._floodsOutAt) / 0.5);
      this._floods.forEach((f, i) => { f.intensity = (this._floodBase[i] ?? 0) * k; });
      if (k <= 0 && !this._lightsSparked) { this._lightsSparked = true; for (const f of this._floods) this._puff(f.position, 0.02, 0.12, 0.4, 0.05, 0xffd890, 1, true); }
    }
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
    this._bloodMesh.geometry.dispose(); (this._bloodMesh.material as THREE.Material).dispose();
    this._rods.geometry.dispose(); (this._rods.material as THREE.Material).dispose();
    this._rings.geometry.dispose(); (this._rings.material as THREE.Material).dispose();
    this._pips.geometry.dispose(); (this._pips.material as THREE.Material).dispose();
    this._puffGeo.dispose();
    this._scene.remove(this._group);
  }
}
