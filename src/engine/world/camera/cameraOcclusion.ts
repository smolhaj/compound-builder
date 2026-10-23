/**
 * Keeps the orbit camera out of solid geometry.
 *
 * At low pitch / long radius the orbit camera could end up inside a tall
 * building (the view then shows the building's interior faces). After every
 * orbit update the camera is tested against the world AABBs of building
 * groups (userData.type 'building') and any extra boxes (a town); when
 * it is inside one it is pulled in toward the target to just in front of the
 * building (or lifted over a roof right at the target); it keeps looking at
 * the same target, so the framing barely changes. The tour camera is
 * unaffected — it drives the camera itself and has its own collision.
 * (From UE cameraOcclusion.)
 */
import * as THREE from 'three';

export interface OccBox { minX: number; minY: number; minZ: number; maxX: number; maxY: number; maxZ: number }

/**
 * Move `p` out of any box it is inside (boxes grown by `pad`): pull it in
 * along the ray toward the orbit target `t` (ground point) to just before the
 * box it entered — a third-person "camera boom" — or, when the target itself
 * is right at / inside the box, lift it just above the roof. Repeats a few
 * times so a camera moved out of one box into a neighbour also clears that
 * one. Returns true when `p` was moved.
 */
export function pullOutOfBoxes(
  p: { x: number; y: number; z: number }, t: { x: number; z: number; y?: number }, boxes: readonly OccBox[], pad = 0.6,
): boolean {
  const ty = t.y ?? 0;
  let moved = false;
  for (let iter = 0; iter < 4; iter++) {
    let hit = false;
    for (const b of boxes) {
      const x0 = b.minX - pad, x1 = b.maxX + pad, z0 = b.minZ - pad, z1 = b.maxZ + pad;
      const y0 = b.minY - pad, y1 = b.maxY + pad;
      if (p.x <= x0 || p.x >= x1 || p.z <= z0 || p.z >= z1 || p.y >= y1 || p.y < y0) continue;
      hit = moved = true;
      // Slab entry of the ray target → camera into the grown box
      const dx = p.x - t.x, dy = p.y - ty, dz = p.z - t.z;
      let tEnter = 0;
      for (const [o, d, lo, hi] of [[t.x, dx, x0, x1], [ty, dy, y0, y1], [t.z, dz, z0, z1]] as const) {
        if (Math.abs(d) < 1e-9) continue;
        const a = (lo - o) / d, c = (hi - o) / d;
        tEnter = Math.max(tEnter, Math.min(a, c));
      }
      const len = Math.hypot(dx, dy, dz);
      if (tEnter * len > 3) {
        const k = Math.max(0, tEnter - 0.05 / Math.max(len, 1e-6));
        p.x = t.x + dx * k; p.y = ty + dy * k; p.z = t.z + dz * k;
      } else {
        p.y = y1;
      }
    }
    if (!hit) break;
  }
  return moved;
}

/** Building boxes are re-read at most this often (ms) while the camera moves. */
const SITE_REFRESH_MS = 2000;

export class CameraOccluders {
  private _site: OccBox[] = [];
  private _siteAt = -Infinity;
  private readonly _box = new THREE.Box3();
  /** Buildings lower than this are ignored. */
  minHeight = 0.4;

  private readonly _scene: THREE.Scene;
  private readonly _extraBoxes: () => readonly OccBox[];
  private readonly _ground: ((x: number, z: number) => number) | null;

  constructor(scene: THREE.Scene, extraBoxes: () => readonly OccBox[], ground: ((x: number, z: number) => number) | null = null) {
    this._scene = scene;
    this._extraBoxes = extraBoxes;
    this._ground = ground;
  }

  /** Force the building boxes to be re-read on the next call (buildings changed). */
  invalidate(): void { this._siteAt = -Infinity; }

  /** Move `camera` out of any building it is inside, re-aiming it at (tx, ty, tz). */
  keepOut(camera: THREE.Camera, tx: number, tz: number, ty = 0): void {
    const now = performance.now();
    if (now - this._siteAt > SITE_REFRESH_MS) this._collectSite(now);
    const p = camera.position;
    const t = { x: tx, z: tz, y: ty };
    const a = pullOutOfBoxes(p, t, this._site);
    const b = pullOutOfBoxes(p, t, this._extraBoxes());
    // Never dip under the landscape
    let c = false;
    if (this._ground) {
      const g = this._ground(p.x, p.z) + 1.5;
      if (p.y < g) { p.y = g; c = true; }
    }
    if (a || b || c) camera.lookAt(tx, ty, tz);
  }

  /** World bounds of every enclosed building group (tagged userData.type = 'building'). */
  private _collectSite(now: number): void {
    this._siteAt = now;
    this._site = [];
    for (const obj of this._scene.children) {
      if ((obj.userData as { type?: string } | undefined)?.type !== 'building' || !obj.visible) continue;
      this._box.setFromObject(obj);
      if (this._box.isEmpty()) continue;
      const { min, max } = this._box;
      // Low structures (beds, corrals, fences) never trap the camera
      if (max.y - min.y < this.minHeight) continue;
      this._site.push({ minX: min.x, minY: min.y, minZ: min.z, maxX: max.x, maxY: max.y, maxZ: max.z });
    }
  }
}
