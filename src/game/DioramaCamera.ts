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

  private _drag: { x: number; y: number; pan: boolean } | null = null;
  private readonly _off: Array<() => void> = [];

  constructor(el: HTMLElement) {
    const on = <K extends keyof HTMLElementEventMap>(t: K, f: (e: HTMLElementEventMap[K]) => void, o?: AddEventListenerOptions) => {
      el.addEventListener(t, f as EventListener, o);
      this._off.push(() => el.removeEventListener(t, f as EventListener));
    };
    on('contextmenu', e => e.preventDefault());
    on('pointerdown', e => {
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
      e.preventDefault();
      this.radius = Math.min(this.maxRadius, Math.max(this.minRadius, this.radius * Math.exp(e.deltaY * 0.0012)));
    }, { passive: false });
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
    cam.lookAt(t);
  }

  dispose(): void { this._off.forEach(f => f()); }
}
