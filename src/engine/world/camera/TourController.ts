/**
 * TourController — walk / fly / cinematic camera (UE CampusTourController,
 * GDS §6 walk mode + photo mode). A dedicated camera for enjoying the world:
 *
 *   • walk       — first-person at eye height, pointer-lock mouse-look
 *                  + WASD, collides with buildings / water / fences through the
 *                  site's walk blocker and follows the terrain surface.
 *   • fly        — free "drone" camera with smooth acceleration / damping.
 *   • cinematic  — an automatic spline tour visiting notable buildings
 *                  with a caption card naming each one.
 *
 * The controller owns the camera only while active: enter() snapshots the
 * camera, exit() restores it exactly. It adds no geometry and changes no
 * render settings, so the render budget is unchanged.
 *
 * The movement / collision / path helpers are pure functions (no DOM) and are
 * unit-tested in TourController.test.ts.
 */
import * as THREE from 'three';

export type TourMode = 'walk' | 'fly' | 'cinematic';
/** Caption card shown during the cinematic tour. */
export interface TourCaption { title: string; subtitle: string }

// ── Tunables ────────────────────────────────────────────────────────────────

/** Eye height above the ground (≈1.6 m; people are ~0.28 world units tall, 1 unit ≈ 6 m). */
export const TOUR_EYE_HEIGHT = 0.26;
/** Walker collision radius (kept ≥ the camera near plane so walls never clip). */
export const TOUR_BODY_RADIUS = 0.1;
/** Steepest ground grade (rise / run) a walker can climb. */
export const TOUR_MAX_GRADE = 1.6;
/** Walking speed (world units / s) and sprint multiplier. */
export const TOUR_WALK_SPEED = 0.45;   // ≈ 2.7 m/s brisk walk
export const TOUR_SPRINT_MULT = 2.8;

const FLY_ACCEL = 5;          // 1/s — how quickly the drone reaches target velocity
const FLY_BASE_SPEED = 6;     // world units / s
const FLY_MIN_CLEARANCE = 0.3;
const FLY_MAX_HEIGHT = 160;
const LOOK_SENS = 0.0022;     // radians per pixel
const MODE_BLEND_S = 1.1;     // seconds to ease between camera poses
/** Field of view per mode — first person reads better wider than the 45° strategy camera. */
export const TOUR_FOV: Record<TourMode, number> = { walk: 64, fly: 58, cinematic: 50 };

const CINE_DWELL_SPEED = 1.1;   // world units / s while circling a building
const CINE_TRANSIT_SPEED = 5.5; // world units / s between buildings
const CINE_SPEED_RATE = 0.9;    // 1/s — speed easing

export type BlockedFn = (x: number, z: number) => boolean;
export type HeightFn = (x: number, z: number) => number;

// ── Pure helpers (unit-tested) ─────────────────────────────────────────────

/** A site's "is a body of radius r blocked at (x, z)?" test (buildings, water, fences). */
export type SiteBlockedFn = (x: number, z: number, r: number) => boolean;

/** Walker collision test against the site. */
export function walkBlocker(isBlocked: SiteBlockedFn, radius = TOUR_BODY_RADIUS): BlockedFn {
  return (x, z) => isBlocked(x, z, radius);
}

/**
 * Footprint test against building bounds: facades, porticoes, steps and eaves
 * overhang the footprint the site test knows about, so the walker
 * also keeps `pad` clear of every solid building's world box.
 */
export function boxBlocker(boxes: readonly TourBox[], pad = TOUR_BODY_RADIUS): BlockedFn {
  return (x, z) => {
    for (const b of boxes) {
      if (x > b.minX - pad && x < b.maxX + pad && z > b.minZ - pad && z < b.maxZ + pad) return true;
    }
    return false;
  };
}

/** Blocked if any of the tests is. */
export function anyBlocked(...fns: BlockedFn[]): BlockedFn {
  return (x, z) => fns.some(f => f(x, z));
}

/**
 * Move a walker by (dx, dz) with wall sliding: the step is split into short
 * sub-steps; each tries the full move, then the X-only and Z-only components,
 * so walking diagonally into a wall glides along it instead of sticking.
 * A sub-step is also refused when the ground rises more steeply than
 * `maxGrade` (cliff faces, steep banks).
 */
export function slideMove(
  x: number, z: number, dx: number, dz: number,
  blocked: BlockedFn, height?: HeightFn, maxGrade = TOUR_MAX_GRADE,
): { x: number; z: number } {
  const len = Math.hypot(dx, dz);
  if (len < 1e-9) return { x, z };
  const steps = Math.max(1, Math.ceil(len / 0.08));
  const sx = dx / steps, sz = dz / steps;
  const ok = (ax: number, az: number, bx: number, bz: number): boolean => {
    if (blocked(bx, bz)) return false;
    if (!height) return true;
    const run = Math.hypot(bx - ax, bz - az);
    return height(bx, bz) - height(ax, az) <= maxGrade * Math.max(run, 1e-6);
  };
  for (let i = 0; i < steps; i++) {
    if (ok(x, z, x + sx, z + sz)) { x += sx; z += sz; }
    else if (sx !== 0 && ok(x, z, x + sx, z)) { x += sx; }
    else if (sz !== 0 && ok(x, z, x, z + sz)) { z += sz; }
    else break;
  }
  return { x, z };
}

/**
 * Ease the eye toward `groundY + eye`: fast when stepping up (never sink into
 * a rise), a little softer when stepping down so kerbs don't jolt.
 */
export function followGround(y: number, groundY: number, dt: number, eye = TOUR_EYE_HEIGHT): number {
  const target = groundY + eye;
  if (!Number.isFinite(y)) return target;
  const rate = target > y ? 18 : 10;
  const next = y + (target - y) * (1 - Math.exp(-rate * Math.max(0, dt)));
  // Never let the eye drop below half its height above the ground
  return Math.max(next, groundY + eye * 0.5);
}

/** Nearest free spot to (x, z), searched in rings; null if none within maxR. */
export function findFreeSpot(x: number, z: number, blocked: BlockedFn, maxR = 60, step = 0.5): { x: number; z: number } | null {
  if (!blocked(x, z)) return { x, z };
  for (let r = step; r <= maxR; r += step) {
    const n = Math.max(8, Math.ceil((2 * Math.PI * r) / step));
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
      if (!blocked(px, pz)) return { x: px, z: pz };
    }
  }
  return null;
}

/** Axis-aligned box in world space (building bounds). */
export interface TourBox { minX: number; minY: number; minZ: number; maxX: number; maxY: number; maxZ: number }

/**
 * Push a point out of any box it is inside (expanded by `pad`), along the
 * axis of least penetration. Used by the drone so it can't fly into walls.
 * Mutates and returns `p`.
 */
export function pushOutOfBoxes<P extends { x: number; y: number; z: number }>(p: P, boxes: readonly TourBox[], pad = 0.35): P {
  for (const b of boxes) {
    const x0 = b.minX - pad, x1 = b.maxX + pad, z0 = b.minZ - pad, z1 = b.maxZ + pad, y1 = b.maxY + pad;
    if (p.x <= x0 || p.x >= x1 || p.z <= z0 || p.z >= z1 || p.y >= y1 || p.y < b.minY - pad) continue;
    const dxl = p.x - x0, dxr = x1 - p.x, dzl = p.z - z0, dzr = z1 - p.z, dy = y1 - p.y;
    const m = Math.min(dxl, dxr, dzl, dzr, dy);
    if (m === dy) p.y = y1;
    else if (m === dxl) p.x = x0;
    else if (m === dxr) p.x = x1;
    else if (m === dzl) p.z = z0;
    else p.z = z1;
  }
  return p;
}

/** A building as the cinematic tour sees it. */
export interface TourBuildingInfo {
  id: string;
  /** Kind of structure (one stop per kind when filling up). */
  defId: string;
  name: string;
  /** Category / type label, e.g. "Cabin". */
  typeName: string;
  tier: number;
  /** Day it was finished (0 = unknown). */
  builtDay: number;
  historic: boolean;
  /** Enclosed building (false for open structures: garden beds, corrals, ponds). */
  solid: boolean;
  box: TourBox;
  /** The game's own reason to visit it first ("The homestead"), if any. */
  highlight?: string;
}

export interface TourStop {
  info: TourBuildingInfo;
  /** Why it is on the tour ("Tallest building on the place", …). */
  reason: string;
}

const boxHeight = (b: TourBox) => b.maxY - b.minY;
const boxArea = (b: TourBox) => (b.maxX - b.minX) * (b.maxZ - b.minZ);

/**
 * Choose the notable buildings the cinematic tour visits, in a pleasant
 * visiting order (greedy nearest-neighbour from the first highlight).
 */
export function pickTourStops(infos: readonly TourBuildingInfo[], max = 8): TourStop[] {
  const pool = infos.filter(i => i.solid && boxHeight(i.box) > 0.2);
  if (pool.length === 0) return [];
  const chosen = new Map<string, TourStop>();
  const add = (i: TourBuildingInfo | undefined, reason: string) => {
    if (i && !chosen.has(i.id) && chosen.size < max) chosen.set(i.id, { info: i, reason });
  };
  const by = <T>(arr: readonly T[], key: (t: T) => number) => [...arr].sort((a, b) => key(b) - key(a));

  for (const i of pool) if (i.highlight) add(i, i.highlight);
  add(by(pool, i => boxHeight(i.box))[0], 'Tallest building on the place');
  const dated = pool.filter(i => i.builtDay > 0);
  add(by(dated, i => i.builtDay)[0], 'Newest addition');
  add(by(pool.filter(i => i.historic), i => -i.builtDay)[0], 'The oldest building still standing');
  add(by(pool, i => boxArea(i.box))[0], 'Largest footprint');
  // Fill up with the most imposing remaining buildings, one of each kind
  const kinds = new Set([...chosen.values()].map(s => s.info.defId));
  for (const i of by(pool, i => boxHeight(i.box) * 2 + i.tier)) {
    if (kinds.has(i.defId)) continue;
    kinds.add(i.defId);
    add(i, i.typeName);
  }

  // Visiting order: nearest-neighbour chain from the first highlight
  const rest = [...chosen.values()];
  const out: TourStop[] = [rest.shift()!];
  const cx = (b: TourBox) => (b.minX + b.maxX) / 2, cz = (b: TourBox) => (b.minZ + b.maxZ) / 2;
  while (rest.length) {
    const last = out[out.length - 1].info.box;
    let bi = 0, bd = Infinity;
    rest.forEach((s, k) => {
      const d = Math.hypot(cx(s.info.box) - cx(last), cz(s.info.box) - cz(last));
      if (d < bd) { bd = d; bi = k; }
    });
    out.push(rest.splice(bi, 1)[0]);
  }
  return out;
}

export type CineSegKind = 'dwell' | 'transit';

export interface CinematicPath {
  pos: THREE.CatmullRomCurve3;
  look: THREE.CatmullRomCurve3;
  /** One entry per curve segment (closed curve: count = control points). */
  segs: Array<{ kind: CineSegKind; stop: number; next: number; lift: number }>;
  stops: TourStop[];
}

/**
 * Closed camera spline visiting each stop: three control points sweep an arc
 * in front of the building (dwell), and the segment to the next building
 * (transit) is lifted over the rooftops in between.
 */
/** How badly other buildings block the view from `cam` to `target` (0 = clear). */
export function occlusionScore(
  cam: { x: number; y: number; z: number }, target: { x: number; y: number; z: number },
  obstacles: readonly TourBox[], self?: TourBox, samples = 12,
): number {
  let score = 0;
  for (const o of obstacles) {
    if (o === self) continue;
    // Camera inside (or hugging) another building is the worst case
    if (cam.x > o.minX - 1 && cam.x < o.maxX + 1 && cam.z > o.minZ - 1 && cam.z < o.maxZ + 1 && cam.y < o.maxY + 1) score += samples;
    for (let k = 1; k < samples; k++) {
      const t = k / samples;
      const x = cam.x + (target.x - cam.x) * t, y = cam.y + (target.y - cam.y) * t, z = cam.z + (target.z - cam.z) * t;
      if (x > o.minX && x < o.maxX && z > o.minZ && z < o.maxZ && y < o.maxY) score += 1;
    }
  }
  return score;
}

/**
 * Closed camera spline visiting each stop: three control points sweep an arc
 * in front of the building (dwell), and the segment to the next building
 * (transit) is lifted over the rooftops in between. The viewing side of each
 * building is the one (of 16 candidates) with the clearest sight lines,
 * preferring the site-centre side so the site fills the background.
 */
export function buildCinematicPath(
  stops: readonly TourStop[], center: { x: number; z: number }, heightAt: HeightFn,
  obstacles: readonly TourBox[] = [],
): CinematicPath | null {
  if (stops.length === 0) return null;
  const pts: THREE.Vector3[] = [];
  const looks: THREE.Vector3[] = [];
  const segs: CinematicPath['segs'] = [];
  const n = stops.length;
  let tallest = 0;
  for (const s of stops) tallest = Math.max(tallest, boxHeight(s.info.box));
  const SWEEP = 0.45;
  for (let i = 0; i < n; i++) {
    const b = stops[i].info.box;
    const bx = (b.minX + b.maxX) / 2, bz = (b.minZ + b.maxZ) / 2;
    const h = boxHeight(b);
    const half = Math.max(b.maxX - b.minX, b.maxZ - b.minZ) / 2;
    const R = half * 1.25 + 5 + h * 0.5;
    const g = Math.max(b.minY, heightAt(bx, bz));
    const lookY = g + h * 0.4;
    const camY = g + Math.max(3, h * 0.75 + 1.5);
    const look = { x: bx, y: lookY, z: bz };
    const camAt = (ang: number) => {
      const px = bx + Math.cos(ang) * R, pz = bz + Math.sin(ang) * R;
      return { x: px, y: Math.max(camY, heightAt(px, pz) + 1.4), z: pz };
    };
    const toCentre = Math.hypot(center.x - bx, center.z - bz) < 1 ? Math.PI * 0.25 : Math.atan2(center.z - bz, center.x - bx);
    let a = toCentre, best = Infinity;
    for (let c = 0; c < 16; c++) {
      const ang = toCentre + (c / 16) * Math.PI * 2;
      let sc = 0;
      for (const k of [-1, 0, 1]) sc += occlusionScore(camAt(ang + SWEEP * k), look, obstacles, b);
      // Mild preference for the site-centre side
      const off = Math.abs(Math.atan2(Math.sin(ang - toCentre), Math.cos(ang - toCentre)));
      sc += off * 0.8;
      if (sc < best) { best = sc; a = ang; }
    }
    const sweep = SWEEP * (i % 2 === 0 ? 1 : -1);
    for (let k = 0; k < 3; k++) {
      const c = camAt(a + sweep * (k - 1));
      pts.push(new THREE.Vector3(c.x, c.y, c.z));
      looks.push(new THREE.Vector3(look.x, look.y, look.z));
      segs.push(k < 2
        ? { kind: 'dwell', stop: i, next: i, lift: 0 }
        : { kind: 'transit', stop: i, next: (i + 1) % n, lift: n > 1 ? tallest * 0.55 + 3 : 0 });
    }
  }
  const pos = new THREE.CatmullRomCurve3(pts, true, 'centripetal');
  const look = new THREE.CatmullRomCurve3(looks, true, 'centripetal');
  return { pos, look, segs, stops: [...stops] };
}

/** Which caption the tour shows at segment `seg`, fraction `f` through it. */
export function captionStopAt(path: CinematicPath, seg: number, f: number): number | null {
  const s = path.segs[seg];
  if (!s) return null;
  if (s.kind === 'dwell') return s.stop;
  if (f < 0.3) return s.stop;
  if (f > 0.75) return s.next;
  return null;
}

// ── Virtual (touch) input shared with the overlay's joystick ───────────────

/** Written by an on-screen joystick (touch); read every frame. */
export const tourVirtualInput = { moveX: 0, moveY: 0, up: 0 };

// ── Controller ─────────────────────────────────────────────────────────────

export interface TourContext {
  camera: THREE.PerspectiveCamera;
  dom: HTMLElement;
  scene: THREE.Scene;
  /** The site's walk test (null = nothing blocks). */
  getBlocked: () => SiteBlockedFn | null;
  heightAt: HeightFn;
  /**
   * After each walk step: a place the walker is carried to instead (a ladder
   * down a hatch, back up), or null. Lets the site keep levels (a bunker).
   */
  portal?: (x: number, z: number) => { x: number; z: number } | null;
  /** Current buildings (name / age) keyed by id — boxes come from the scene. */
  describeBuildings: () => Array<Omit<TourBuildingInfo, 'box'>>;
  /** Fly bounds: the site rectangle (the drone may roam 70 units beyond it). */
  siteBounds: () => { w: number; h: number };
  onCaption: (c: TourCaption | null) => void;
}

interface CameraSnapshot {
  pos: THREE.Vector3;
  quat: THREE.Quaternion;
  fov: number;
  near: number;
  far: number;
}

export class TourController {
  private _ctx: TourContext;
  private _mode: TourMode | null = null;
  private _snap: CameraSnapshot | null = null;
  private _pos = new THREE.Vector3();
  private _vel = new THREE.Vector3();
  private _yaw = 0;
  private _pitch = 0;
  private _keys = new Set<string>();
  private _boxes: TourBox[] = [];
  private _dragging = false;
  private _lastPtr = { x: 0, y: 0 };
  private _flySpeedMult = 1;
  // Pose blend (entry / mode switch)
  private _blendT = 1;
  private _fromPos = new THREE.Vector3();
  private _fromQuat = new THREE.Quaternion();
  // Cinematic
  private _path: CinematicPath | null = null;
  private _cineS = 0;
  private _cineSpeed = CINE_DWELL_SPEED;
  private _cineLen = 0;
  private _cineSegLen: number[] = [];
  private _lastCaptionStop: number | null | undefined = undefined;
  private _focus = new THREE.Vector3();
  private _tmpV = new THREE.Vector3();
  private _tmpQ = new THREE.Quaternion();
  private _tmpE = new THREE.Euler(0, 0, 0, 'YXZ');
  private _listening = false;

  constructor(ctx: TourContext) {
    this._ctx = ctx;
  }

  get active(): boolean { return this._mode !== null; }
  get mode(): TourMode | null { return this._mode; }

  /**
   * Start touring. `orbit` is the gameplay camera's view (target + heading),
   * used to place the walker / drone where the player was looking.
   */
  enter(mode: TourMode, orbit: { x: number; z: number; theta: number; phi: number }): void {
    const cam = this._ctx.camera;
    if (!this._snap) {
      this._snap = { pos: cam.position.clone(), quat: cam.quaternion.clone(), fov: cam.fov, near: cam.near, far: cam.far };
    }
    this._addListeners();
    this._collectBoxes();
    this._yaw = orbit.theta;
    this._pitch = -Math.min(0.35, orbit.phi * 0.5);
    this._pos.copy(cam.position);
    this._mode = null;
    this._setModeInternal(mode, orbit);
  }

  /** Switch between walk / fly / cinematic while touring. */
  setMode(mode: TourMode): void {
    if (!this._mode || mode === this._mode) return;
    this._collectBoxes(); // buildings may have changed while touring with the sim running
    this._setModeInternal(mode, null);
  }

  /** Leave the tour and restore the gameplay camera exactly. */
  exit(): void {
    this._removeListeners();
    if (document.pointerLockElement === this._ctx.dom) document.exitPointerLock?.();
    const cam = this._ctx.camera;
    if (this._snap) {
      cam.position.copy(this._snap.pos);
      cam.quaternion.copy(this._snap.quat);
      cam.fov = this._snap.fov; cam.near = this._snap.near; cam.far = this._snap.far;
      cam.updateProjectionMatrix();
      cam.updateMatrixWorld();
    }
    this._snap = null;
    this._mode = null;
    this._path = null;
    this._keys.clear();
    this._vel.set(0, 0, 0);
    tourVirtualInput.moveX = tourVirtualInput.moveY = tourVirtualInput.up = 0;
    this._emitCaption(null);
  }

  dispose(): void {
    if (this._mode) this.exit();
    this._removeListeners();
  }

  /** Advance the tour camera. Returns the point the shadow frustum should follow. */
  update(dt: number): THREE.Vector3 {
    const cam = this._ctx.camera;
    dt = Math.min(Math.max(dt, 0), 0.1);
    if (this._mode === 'walk') this._updateWalk(dt);
    else if (this._mode === 'fly') this._updateFly(dt);
    else if (this._mode === 'cinematic') this._updateCinematic(dt);

    // Target pose → camera, eased from the previous pose after a mode switch
    if (this._mode !== 'cinematic') {
      this._tmpE.set(this._pitch, this._yaw, 0, 'YXZ');
      this._tmpQ.setFromEuler(this._tmpE);
      this._tmpV.copy(this._pos);
    }
    if (this._blendT < 1) {
      this._blendT = Math.min(1, this._blendT + dt / MODE_BLEND_S);
      const e = this._blendT * this._blendT * (3 - 2 * this._blendT);
      cam.position.lerpVectors(this._fromPos, this._tmpV, e);
      cam.quaternion.slerpQuaternions(this._fromQuat, this._tmpQ, e);
    } else {
      cam.position.copy(this._tmpV);
      cam.quaternion.copy(this._tmpQ);
    }
    // Ease the field of view toward the mode's
    if (this._mode) {
      const target = TOUR_FOV[this._mode];
      if (Math.abs(cam.fov - target) > 0.05) {
        cam.fov += (target - cam.fov) * (1 - Math.exp(-4 * dt));
        cam.updateProjectionMatrix();
      }
    }
    cam.updateMatrixWorld();

    // Shadow focus: a little ahead of the eye, so the shadowed area is what you see
    cam.getWorldDirection(this._focus);
    this._focus.y = 0;
    if (this._focus.lengthSq() > 1e-6) this._focus.normalize();
    const ahead = Math.min(24, 8 + cam.position.y * 0.6);
    this._focus.multiplyScalar(ahead).add(cam.position);
    return this._focus;
  }

  // ── Modes ───────────────────────────────────────────────────────────────

  private _setModeInternal(mode: TourMode, orbit: { x: number; z: number; theta: number; phi: number } | null): void {
    const cam = this._ctx.camera;
    const prev = this._mode;
    this._fromPos.copy(cam.position);
    this._fromQuat.copy(cam.quaternion);
    this._blendT = 0;
    this._vel.set(0, 0, 0);
    this._mode = mode;
    if (mode !== 'cinematic') this._emitCaption(null);
    if (document.pointerLockElement === this._ctx.dom && mode === 'cinematic') document.exitPointerLock?.();

    // Heading from the current camera orientation
    this._tmpE.setFromQuaternion(cam.quaternion, 'YXZ');
    this._yaw = this._tmpE.y;
    this._pitch = THREE.MathUtils.clamp(this._tmpE.x, -1.2, 1.2);

    if (mode === 'walk') {
      // Drop to the ground where the camera was looking (entry) or right below the drone
      const sx = orbit ? orbit.x : cam.position.x;
      const sz = orbit ? orbit.z : cam.position.z;
      const p = this._walkStart(sx, sz, orbit ? orbit.theta : this._yaw);
      this._pos.set(p.x, this._ctx.heightAt(p.x, p.z) + TOUR_EYE_HEIGHT, p.z);
      this._pitch = 0.02;
    } else if (mode === 'fly') {
      this._pos.copy(cam.position);
      if (prev === 'walk') this._pos.y += 3; // lift off
      this._clampFly(this._pos);
      if (orbit) this._pitch = -Math.min(0.5, orbit.phi * 0.7);
    } else {
      this._buildCinematic();
    }
  }

  /** A clear spot near the view target, stepped back so the view opens up in front. */
  private _walkStart(x: number, z: number, theta: number): { x: number; z: number } {
    const site = this._ctx.getBlocked();
    if (!site) return { x, z };
    const blocked = anyBlocked(walkBlocker(site, TOUR_BODY_RADIUS * 2), boxBlocker(this._boxes, 0.6));
    // Back off toward where the orbit camera was, so buildings are ahead of us
    const bx = x + Math.sin(theta) * 6, bz = z + Math.cos(theta) * 6;
    return findFreeSpot(bx, bz, blocked) ?? findFreeSpot(x, z, blocked) ?? { x, z };
  }

  private _moveInput(): { f: number; r: number; u: number } {
    const k = this._keys;
    let f = 0, r = 0, u = 0;
    if (k.has('KeyW') || k.has('ArrowUp')) f += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) f -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) r += 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) r -= 1;
    if (k.has('Space') || k.has('KeyE')) u += 1;
    if (k.has('KeyC') || k.has('KeyQ')) u -= 1;
    f += -tourVirtualInput.moveY;
    r += tourVirtualInput.moveX;
    u += tourVirtualInput.up;
    const m = Math.hypot(f, r);
    if (m > 1) { f /= m; r /= m; }
    return { f, r, u: THREE.MathUtils.clamp(u, -1, 1) };
  }

  private _updateWalk(dt: number): void {
    const { f, r } = this._moveInput();
    const sprint = this._keys.has('ShiftLeft') || this._keys.has('ShiftRight');
    const speed = TOUR_WALK_SPEED * (sprint ? TOUR_SPRINT_MULT : 1);
    // Smooth start / stop
    const fx = -Math.sin(this._yaw), fz = -Math.cos(this._yaw);
    const rx = Math.cos(this._yaw), rz = -Math.sin(this._yaw);
    const tx = (fx * f + rx * r) * speed, tz = (fz * f + rz * r) * speed;
    const k = 1 - Math.exp(-12 * dt);
    this._vel.x += (tx - this._vel.x) * k;
    this._vel.z += (tz - this._vel.z) * k;
    const site = this._ctx.getBlocked();
    const h = this._ctx.heightAt;
    if (site) {
      const blocked = anyBlocked(walkBlocker(site), boxBlocker(this._boxes, 0.2));
      if (blocked(this._pos.x, this._pos.z)) {
        // Stuck inside something (e.g. a building finished around us) — step out
        const free = findFreeSpot(this._pos.x, this._pos.z, blocked, 30, 0.25);
        if (free) { this._pos.x = free.x; this._pos.z = free.z; }
      }
      const p = slideMove(this._pos.x, this._pos.z, this._vel.x * dt, this._vel.z * dt, blocked, h);
      // Kill velocity into walls so we don't "stick" and then lurch
      if (dt > 0) { this._vel.x = (p.x - this._pos.x) / dt; this._vel.z = (p.z - this._pos.z) / dt; }
      this._pos.x = p.x; this._pos.z = p.z;
      const to = this._ctx.portal?.(p.x, p.z);
      if (to) { this._pos.x = to.x; this._pos.z = to.z; this._vel.set(0, 0, 0); }
    } else {
      this._pos.x += this._vel.x * dt; this._pos.z += this._vel.z * dt;
    }
    this._pos.y = followGround(this._pos.y, h(this._pos.x, this._pos.z), dt);
  }

  private _updateFly(dt: number): void {
    const { f, r, u } = this._moveInput();
    const boost = (this._keys.has('ShiftLeft') || this._keys.has('ShiftRight')) ? 3 : 1;
    // Faster when high up, gentle near the ground
    const alt = this._pos.y - this._ctx.heightAt(this._pos.x, this._pos.z);
    const speed = FLY_BASE_SPEED * this._flySpeedMult * boost * THREE.MathUtils.clamp(0.35 + alt / 25, 0.35, 3);
    const cp = Math.cos(this._pitch);
    const fwd = this._tmpV.set(-Math.sin(this._yaw) * cp, Math.sin(this._pitch), -Math.cos(this._yaw) * cp);
    const rx = Math.cos(this._yaw), rz = -Math.sin(this._yaw);
    const target = new THREE.Vector3(
      (fwd.x * f + rx * r) * speed,
      (fwd.y * f + u) * speed,
      (fwd.z * f + rz * r) * speed,
    );
    this._vel.lerp(target, 1 - Math.exp(-FLY_ACCEL * dt));
    this._pos.addScaledVector(this._vel, dt);
    this._clampFly(this._pos);
  }

  private _clampFly(p: THREE.Vector3): void {
    const { w, h } = this._ctx.siteBounds();
    const M = 70;
    p.x = THREE.MathUtils.clamp(p.x, -M, w + M);
    p.z = THREE.MathUtils.clamp(p.z, -M, h + M);
    pushOutOfBoxes(p, this._boxes);
    const g = this._ctx.heightAt(p.x, p.z);
    p.y = THREE.MathUtils.clamp(p.y, g + FLY_MIN_CLEARANCE, FLY_MAX_HEIGHT);
  }

  private _buildCinematic(): void {
    const described = this._ctx.describeBuildings();
    const byId = new Map(described.map(d => [d.id, d]));
    const infos: TourBuildingInfo[] = [];
    for (const [id, box] of this._boxById) {
      const d = byId.get(id);
      if (d) infos.push({ ...d, box });
    }
    const { w, h } = this._ctx.siteBounds();
    const stops = pickTourStops(infos);
    const path = buildCinematicPath(stops, { x: w / 2, z: h / 2 }, this._ctx.heightAt, this._boxes);
    this._path = path;
    this._lastCaptionStop = undefined;
    if (!path) {
      // Nothing built yet — slow orbit over the lot instead
      this._cineLen = 0;
      return;
    }
    const N = path.segs.length;
    const DIV = 24;
    const lengths = path.pos.getLengths(N * DIV);
    this._cineSegLen = [];
    for (let k = 0; k <= N; k++) this._cineSegLen.push(lengths[k * DIV]);
    this._cineLen = lengths[lengths.length - 1];
    this._cineS = 0;
    this._cineSpeed = CINE_DWELL_SPEED;
  }

  private _updateCinematic(dt: number): void {
    const path = this._path;
    if (!path || this._cineLen <= 0) {
      // Empty lot: gentle orbit around the centre
      const { w, h } = this._ctx.siteBounds();
      this._cineS += dt * 0.08;
      const R = Math.max(w, h) * 0.55 + 10;
      this._tmpV.set(w / 2 + Math.cos(this._cineS) * R, 18, h / 2 + Math.sin(this._cineS) * R);
      this._lookAtQuat(this._tmpV, this._tmpQ, w / 2, 0, h / 2);
      return;
    }
    const N = path.segs.length;
    // Locate the current segment by arc length
    let seg = 0;
    while (seg < N - 1 && this._cineSegLen[seg + 1] <= this._cineS) seg++;
    const s0 = this._cineSegLen[seg], s1 = this._cineSegLen[seg + 1];
    const f = s1 > s0 ? (this._cineS - s0) / (s1 - s0) : 0;
    const kind = path.segs[seg].kind;
    const want = kind === 'dwell' ? CINE_DWELL_SPEED : CINE_TRANSIT_SPEED;
    // Ease toward the segment's speed; start slowing ahead of each building
    const approaching = kind === 'transit' && f > 0.6;
    const targetSpeed = approaching ? THREE.MathUtils.lerp(want, CINE_DWELL_SPEED, (f - 0.6) / 0.4) : want;
    this._cineSpeed += (targetSpeed - this._cineSpeed) * (1 - Math.exp(-CINE_SPEED_RATE * 2 * dt));
    this._cineS = (this._cineS + this._cineSpeed * dt) % this._cineLen;

    const u = this._cineS / this._cineLen;
    const t = path.pos.getUtoTmapping(u, 0);
    path.pos.getPoint(t, this._tmpV);
    const lift = path.segs[seg].lift * Math.sin(Math.PI * f);
    this._tmpV.y += lift;
    // Safety: never under the ground or inside a building
    pushOutOfBoxes(this._tmpV, this._boxes, 0.8);
    this._tmpV.y = Math.max(this._tmpV.y, this._ctx.heightAt(this._tmpV.x, this._tmpV.z) + 1.2);
    const look = path.look.getPoint(t);
    this._lookAtQuat(this._tmpV, this._tmpQ, look.x, look.y, look.z);

    const stop = captionStopAt(path, seg, f);
    if (stop !== this._lastCaptionStop) {
      this._lastCaptionStop = stop;
      const s = stop === null ? null : path.stops[stop];
      this._emitCaption(s ? {
        title: s.info.name,
        subtitle: s.info.name === s.info.typeName ? s.reason : `${s.reason} · ${s.info.typeName}`,
      } : null);
    }
  }

  private _lookAtQuat(from: THREE.Vector3, out: THREE.Quaternion, x: number, y: number, z: number): void {
    const m = new THREE.Matrix4().lookAt(from, new THREE.Vector3(x, y, z), THREE.Object3D.DEFAULT_UP);
    out.setFromRotationMatrix(m);
  }

  private _emitCaption(c: TourCaption | null): void {
    this._ctx.onCaption(c);
  }

  // ── Scene queries ─────────────────────────────────────────────────────────

  private _boxById = new Map<string, TourBox>();

  /** World bounds of every building group (BuildingRenderer tags them userData.type = 'building'). */
  private _collectBoxes(): void {
    this._boxes = [];
    this._boxById.clear();
    const solid = new Map(this._ctx.describeBuildings().map(d => [d.id, d.solid]));
    const box = new THREE.Box3();
    for (const obj of this._ctx.scene.children) {
      const ud = obj.userData as { type?: string; buildingId?: string } | undefined;
      if (ud?.type !== 'building' || !obj.visible) continue;
      box.setFromObject(obj);
      if (box.isEmpty()) continue;
      const b: TourBox = { minX: box.min.x, minY: box.min.y, minZ: box.min.z, maxX: box.max.x, maxY: box.max.y, maxZ: box.max.z };
      // Open lots (parks, ponds, parking) stay flyable; their trees are not walls
      if (ud.buildingId && solid.get(ud.buildingId) !== false) this._boxes.push(b);
      if (ud.buildingId) this._boxById.set(ud.buildingId, b);
    }
  }

  // ── Input ─────────────────────────────────────────────────────────────────

  private _onKeyDown = (e: KeyboardEvent): void => {
    const t = e.target;
    if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement) return;
    this._keys.add(e.code);
    if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
  };
  private _onKeyUp = (e: KeyboardEvent): void => { this._keys.delete(e.code); };
  private _onBlur = (): void => { this._keys.clear(); };

  private _onPointerDown = (e: PointerEvent): void => {
    if (this._mode !== 'walk' && this._mode !== 'fly') return;
    this._dragging = true;
    this._lastPtr = { x: e.clientX, y: e.clientY };
    // Mouse: capture the pointer for FPS-style look. Touch / pen: drag to look.
    if (e.pointerType === 'mouse' && e.button === 0 && document.pointerLockElement !== this._ctx.dom) {
      try {
        const r = this._ctx.dom.requestPointerLock?.() as unknown;
        if (r instanceof Promise) r.catch(() => { /* drag-look fallback */ });
      } catch { /* drag-look fallback */ }
    }
  };
  private _onPointerMove = (e: PointerEvent): void => {
    if (this._mode !== 'walk' && this._mode !== 'fly') return;
    let dx: number, dy: number;
    if (document.pointerLockElement === this._ctx.dom) {
      dx = e.movementX; dy = e.movementY;
      // Some browsers report a bogus jump on the first event after locking
      if (Math.abs(dx) > 300 || Math.abs(dy) > 300) return;
    } else if (this._dragging) {
      dx = e.clientX - this._lastPtr.x; dy = e.clientY - this._lastPtr.y;
      this._lastPtr = { x: e.clientX, y: e.clientY };
      // Touch drags feel better a little faster
      if (e.pointerType !== 'mouse') { dx *= 1.6; dy *= 1.6; }
    } else return;
    this._yaw -= dx * LOOK_SENS;
    this._pitch = THREE.MathUtils.clamp(this._pitch - dy * LOOK_SENS, -1.45, 1.45);
  };
  private _onPointerUp = (): void => { this._dragging = false; };
  private _onWheel = (e: WheelEvent): void => {
    if (this._mode !== 'fly') return;
    e.preventDefault();
    this._flySpeedMult = THREE.MathUtils.clamp(this._flySpeedMult * (e.deltaY > 0 ? 0.85 : 1.18), 0.2, 5);
  };

  private _addListeners(): void {
    if (this._listening) return;
    this._listening = true;
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('blur', this._onBlur);
    const d = this._ctx.dom;
    d.addEventListener('pointerdown', this._onPointerDown);
    window.addEventListener('pointermove', this._onPointerMove);
    window.addEventListener('pointerup', this._onPointerUp);
    window.addEventListener('pointercancel', this._onPointerUp);
    d.addEventListener('wheel', this._onWheel, { passive: false });
  }

  private _removeListeners(): void {
    if (!this._listening) return;
    this._listening = false;
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('blur', this._onBlur);
    const d = this._ctx.dom;
    d.removeEventListener('pointerdown', this._onPointerDown);
    window.removeEventListener('pointermove', this._onPointerMove);
    window.removeEventListener('pointerup', this._onPointerUp);
    window.removeEventListener('pointercancel', this._onPointerUp);
    d.removeEventListener('wheel', this._onWheel);
  }
}
