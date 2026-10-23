import * as THREE from 'three';

/**
 * Diorama orbit camera: drag to rotate (left) or pan (right / shift), wheel to
 * zoom. State is plain numbers so QA can set it directly.
 */
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
  private _drag: { x: number; y: number; pan: boolean } | null = null;
  private readonly _off: Array<() => void> = [];

  constructor(el: HTMLElement) {
    const on = <K extends keyof HTMLElementEventMap>(t: K, f: (e: HTMLElementEventMap[K]) => void, o?: AddEventListenerOptions) => {
      el.addEventListener(t, f as EventListener, o);
      this._off.push(() => el.removeEventListener(t, f as EventListener));
    };
    on('contextmenu', e => e.preventDefault());
    on('pointerdown', e => {
      if (!this.enabled) return;
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
    on('wheel', e => {
      if (!this.enabled) return;
      e.preventDefault();
      this.radius = Math.min(this.maxRadius, Math.max(this.minRadius, this.radius * Math.exp(e.deltaY * 0.0012)));
    }, { passive: false });
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
