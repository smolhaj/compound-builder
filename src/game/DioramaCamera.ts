import * as THREE from 'three';

/**
 * Diorama orbit camera: drag to rotate (left) or pan (right / shift), wheel to
 * zoom; the arrow keys pan (Shift = faster). State is plain numbers so QA can set it directly.
 */
const ARROWS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];

export class DioramaCamera {
  target = new THREE.Vector3();
  yaw = Math.PI / 4;
  /** Elevation angle above the horizon (radians). */
  pitch = 0.62;
  radius = 90;
  minRadius = 3;
  maxRadius = 420;
  /** Ground height under the target (keeps the camera above the terrain). */
  groundAt: (x: number, z: number) => number = () => 0;

  /** Solid volume test (tree crowns): the camera is pulled in toward the target past it. */
  solidAt: ((x: number, y: number, z: number) => boolean) | null = null;
  /** Input is ignored while another controller (the tour) drives the camera. */
  enabled = true;
  /** A glide to a new view (set by `glideTo`, advanced by `stepGlide`; the player's own drag or wheel cancels it). */
  private _glide: { x: number; z: number; radius: number; pitch: number; t: number; dur: number; from: { x: number; z: number; radius: number; pitch: number } } | null = null;
  private _drag: { x: number; y: number; pan: boolean } | null = null;
  private readonly _off: Array<() => void> = [];
  /** Arrow keys held (pan the view; Shift = faster). */
  private readonly _keys = new Set<string>();

  constructor(el: HTMLElement) {
    const on = <K extends keyof HTMLElementEventMap>(t: K, f: (e: HTMLElementEventMap[K]) => void, o?: AddEventListenerOptions) => {
      el.addEventListener(t, f as EventListener, o);
      this._off.push(() => el.removeEventListener(t, f as EventListener));
    };
    on('contextmenu', e => e.preventDefault());
    on('pointerdown', e => {
      if (!this.enabled) return;
      this._glide = null;
      this._drag = { x: e.clientX, y: e.clientY, pan: e.button === 2 || e.shiftKey };
      el.setPointerCapture(e.pointerId);
    });
    on('pointerup', () => { this._drag = null; });
    on('pointermove', e => {
      const d = this._drag;
      if (!d) return;
      const dx = e.clientX - d.x, dy = e.clientY - d.y;
      d.x = e.clientX; d.y = e.clientY;
      if (d.pan) {
        const k = this.radius * 0.0016;
        const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
        this.target.x += (-dx * c - dy * s) * k;
        this.target.z += (dx * s - dy * c) * k;
      } else {
        this.yaw -= dx * 0.005;
        this.pitch = Math.min(1.45, Math.max(0.05, this.pitch + dy * 0.004));
      }
    });
    const typing = (e: KeyboardEvent) => e.target instanceof HTMLElement && (e.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName));
    const onDown = (e: KeyboardEvent) => {
      if (!ARROWS.includes(e.code) || typing(e) || e.ctrlKey || e.metaKey || e.altKey) return;
      this._keys.add(e.code);
      if (this.enabled) e.preventDefault();
    };
    const onUp = (e: KeyboardEvent) => { this._keys.delete(e.code); };
    const onBlur = () => this._keys.clear();
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    window.addEventListener('blur', onBlur);
    this._off.push(() => { window.removeEventListener('keydown', onDown); window.removeEventListener('keyup', onUp); window.removeEventListener('blur', onBlur); });
    on('wheel', e => {
      if (!this.enabled) return;
      this._glide = null;
      e.preventDefault();
      this.radius = Math.min(this.maxRadius, Math.max(this.minRadius, this.radius * Math.exp(e.deltaY * 0.0012)));
    }, { passive: false });
  }

  /** Ease to a view over `dur` seconds (0: at once). */
  glideTo(x: number, z: number, radius: number, pitch: number, dur = 0.9): void {
    if (dur <= 0) { this.target.set(x, 0, z); this.radius = radius; this.pitch = pitch; this._glide = null; return; }
    this._glide = { x, z, radius, pitch, t: 0, dur, from: { x: this.target.x, z: this.target.z, radius: this.radius, pitch: this.pitch } };
  }

  get gliding(): boolean { return this._glide !== null; }

  stepGlide(dt: number): void {
    const g = this._glide;
    if (!g) return;
    g.t += Math.min(dt, 0.1);
    const k = Math.min(1, g.t / g.dur), e = k * k * (3 - 2 * k);
    this.target.x = g.from.x + (g.x - g.from.x) * e;
    this.target.z = g.from.z + (g.z - g.from.z) * e;
    this.radius = g.from.radius + (g.radius - g.from.radius) * e;
    this.pitch = g.from.pitch + (g.pitch - g.from.pitch) * e;
    if (k >= 1) this._glide = null;
  }

  /** Pan with the arrow keys, relative to where the camera looks (call once a frame). Shift is faster. */
  step(dt: number, fast = false): void {
    if (!this.enabled || !this._keys.size) return;
    const k = this._keys;
    const fwd = (k.has('ArrowUp') ? 1 : 0) - (k.has('ArrowDown') ? 1 : 0);
    const right = (k.has('ArrowRight') ? 1 : 0) - (k.has('ArrowLeft') ? 1 : 0);
    if (!fwd && !right) return;
    const sp = this.radius * (fast ? 1.6 : 0.6) * Math.min(dt, 0.1);
    const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
    this.target.x += (-s * fwd + c * right) * sp;
    this.target.z += (-c * fwd - s * right) * sp;
  }

  /**
   * Eye-level view: stand at (x, z) with the eye `eyeH` above the ground,
   * looking toward (lookX, lookZ). Sets the orbit so `apply` reproduces it.
   */
  placeEye(x: number, z: number, lookX: number, lookZ: number, eyeH = 0.26): void {
    const dx = x - lookX, dz = z - lookZ;
    const d = Math.max(0.5, Math.hypot(dx, dz));
    this.target.set(lookX, 0, lookZ);
    const ty = this.groundAt(lookX, lookZ);
    const ey = this.groundAt(x, z) + eyeH;
    this.yaw = Math.atan2(dx, dz);
    this.pitch = Math.atan2(ey - ty, d);
    this.radius = Math.hypot(d, ey - ty);
  }

  apply(cam: THREE.PerspectiveCamera): void {
    const t = this.target;
    t.y = this.groundAt(t.x, t.z);
    const cp = Math.cos(this.pitch);
    cam.position.set(
      t.x + Math.sin(this.yaw) * cp * this.radius,
      t.y + Math.sin(this.pitch) * this.radius,
      t.z + Math.cos(this.yaw) * cp * this.radius,
    );
    // never inside the ground
    const floor = this.groundAt(cam.position.x, cam.position.z) + 0.25;
    if (cam.position.y < floor) cam.position.y = floor;
    // never inside a crown: step in toward the target until the eye is clear
    if (this.solidAt) {
      const p = cam.position;
      for (let k = 0; k < 40 && this.solidAt(p.x, p.y, p.z); k++) {
        p.lerp(t, 0.06);
        const f = this.groundAt(p.x, p.z) + 0.25;
        if (p.y < f) p.y = f;
      }
    }
    cam.lookAt(t);
  }

  dispose(): void { this._off.forEach(f => f()); }
}
