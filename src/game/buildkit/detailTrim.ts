/**
 * Additive trim for the gabled shell (buildGabled): fascia, rake boards, gutters and downspouts, a ridge cap, a
 * window head and apron, door threshold and drip cap, a water table, porch posts with bases, caps and railings,
 * crawlspace skirting, a flue and crown on the chimney, and the winter roof (snow slabs and icicles) that the
 * atmosphere shows only while snow lies.
 *
 * Everything is merged into the building's existing layer x material meshes (trim and iron-gray `chimney_cap` in
 * `openings` / `roof`), so it adds triangles but no draw calls, except the winter mesh (`roof|snow`), whose material
 * is invisible (and so not drawn) until it snows. Scale: 1 unit = 6 m, a person 0.28, so a gutter is 0.02 wide and a
 * baluster 0.006 across. Nothing here is built on the Low tier (buildingDetail.detailGeometryOn).
 */
import * as THREE from 'three';
import type { GabledSpec, Parts, WallOpening } from './shell';
import { detailGeometryOn } from './buildingDetail';

const bx = (w: number, h: number, d: number, x: number, y: number, z: number): THREE.BoxGeometry => new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z);

/** Geometry numbers of the shell the trim hangs on (all local, the footprint's frame). */
export interface ShellFrame {
  hw: number; hd: number; y0: number; yE: number; z0: number; z1: number; pz1: number; pitch: number; roofT: number; slopeLen: number;
}

/** Stable 0-1 hash of a place (no Math.random: a rebuilt building keeps its icicles). */
function h01(a: number, b = 0, c = 0): number {
  const s = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453;
  return s - Math.floor(s);
}

/** Does the wall list hold a door-like opening (the water table stops short of it)? */
const hasDoor = (l?: WallOpening[]): boolean => (l ?? []).some(o => o.kind === 'door' || o.kind === 'arch' || o.kind === 'bay');

/** The slab's `aLift` (xyz: the slab's own up vector times its depth, w: 1 on the top face), read by the snow material's vertex patch. */
function withLift(g: THREE.BufferGeometry, ux: number, uy: number, depth: number, topY: number): THREE.BufferGeometry {
  const p = g.getAttribute('position'), a = new Float32Array(p.count * 4);
  for (let i = 0; i < p.count; i++) { a[i * 4] = ux * depth; a[i * 4 + 1] = uy * depth; a[i * 4 + 3] = p.getY(i) > topY ? 1 : 0; }
  g.setAttribute('aLift', new THREE.BufferAttribute(a, 4));
  return g;
}

/** Fascia, rake boards, gutters, downspouts, ridge cap and the winter roof. */
export function addRoofTrim(parts: Parts, s: GabledSpec, f: ShellFrame): void {
  if (!detailGeometryOn()) return;
  const { hw, hd, y0, yE, z0, z1, pitch, roofT, slopeLen } = f;
  const len = z1 - z0, zc = (z0 + z1) / 2;
  const cosP = Math.cos(pitch), sinP = Math.sin(pitch);
  const ridgeY = yE + s.rise + 0.012;
  const pitched = s.rise / hw >= 0.1 && s.eave >= 0.025 && s.D >= 0.3;
  if (!pitched) return;
  const xe = hw + s.eave, yb = ridgeY - xe * s.rise / hw;           // the eave's lower corner
  // ── fascia: a plumb board across the rafter tails, and the gutter hung on it ──
  const fx = xe + 0.0075, gy = yb - 0.03;
  for (const sx of [-1, 1]) {
    parts.add(s.trim, bx(0.007, 0.052, len, sx * (xe + 0.0035), yb - 0.028, zc), 'openings');
    parts.add('chimney_cap', bx(0.021, 0.003, len - 0.01, sx * (fx + 0.0105), gy, zc), 'roof');
    parts.add('chimney_cap', bx(0.003, 0.017, len - 0.01, sx * (fx + 0.0215), gy, zc), 'roof');
    // downspouts: back corner always, front corner when there is no porch; a jog in under the eave, then straight down the wall
    const zs = [-hd + 0.05, ...(s.porch > 0 ? [] : [hd - 0.05])];
    const dx = fx + 0.0105 - (hw + 0.011);
    const yJ = gy - 0.012;
    for (const z of zs) {
      parts.add('chimney_cap', bx(0.01, gy - yJ + 0.002, 0.012, sx * (fx + 0.0105), yJ, z), 'roof');
      if (dx > 0.008) {
        const jog = new THREE.BoxGeometry(0.01, dx * 1.5, 0.012).rotateZ(sx * Math.PI / 4).translate(sx * (hw + 0.011 + dx / 2), yJ - dx / 2, z);
        parts.add('chimney_cap', jog, 'roof');
      }
      const yTop = dx > 0.008 ? yJ - dx : yJ;
      if (yTop - y0 - 0.025 < 0.02) continue;
      parts.add('chimney_cap', bx(0.01, yTop - y0 - 0.025, 0.012, sx * (hw + 0.011), y0 + 0.025, z), 'roof');
      parts.add('chimney_cap', bx(0.022, 0.01, 0.012, sx * (hw + 0.017), y0 + 0.015, z), 'roof');   // the kick-out at the foot
    }
  }
  // ── rake boards along both gable edges ──
  for (const z of [z0 - 0.0035, z1 + 0.0035]) for (const sx of [-1, 1]) {
    const g = new THREE.BoxGeometry(slopeLen + 0.004, 0.04, 0.007).translate(sx * slopeLen / 2, 0.002, 0).rotateZ(sx * -pitch).translate(0, ridgeY, z);
    parts.add(s.trim, g, 'openings');
  }
  // ── ridge cap: two boards over the seam ──
  for (const sx of [-1, 1]) {
    const g = new THREE.BoxGeometry(0.04, 0.005, len + 0.008).translate(sx * 0.0195, roofT + 0.0025, 0).rotateZ(sx * -pitch).translate(0, ridgeY, zc);
    parts.add('chimney_cap', g, 'roof');
  }
  // ── the winter roof: snow slabs that rise with the snow (the atmosphere shows them while it lies), and icicles on the gutters ──
  const th = 0.016, L = slopeLen - 0.03;
  for (const sx of [-1, 1]) {
    // the lift (the slab's own up, its depth) is set on the flat box, before it is turned onto the roof; its rotation follows the geometry's
    const g = withLift(new THREE.BoxGeometry(L, th, len - 0.02).translate(sx * (0.02 + L / 2), roofT + th / 2, 0), 0, 1, th, roofT + th * 0.5);
    const lift = g.getAttribute('aLift') as THREE.BufferAttribute;
    for (let i = 0; i < lift.count; i++) { lift.setXYZ(i, sx * sinP * th, cosP * th, 0); }
    g.rotateZ(sx * -pitch).translate(0, ridgeY, zc);
    parts.add('snow', g, 'roof');
  }
  for (const sx of [-1, 1]) {
    for (let z = z0 + 0.04; z < z1 - 0.03; z += 0.04) {
      const r = h01(sx * 3.1, z * 9.7, s.W);
      if (r < 0.22) continue;
      const l = 0.012 + 0.05 * r * r;
      const g = withLift(new THREE.ConeGeometry(0.0034 + 0.002 * r, l, 5, 1, true).rotateX(Math.PI), 0, 1, 0, 1e9);
      parts.add('snow', g.translate(sx * (fx + 0.0215), gy - l / 2 + 0.006, z + (r - 0.5) * 0.016), 'roof');
    }
  }
}

/** A window's head (drip cap) and apron, in the window's wall frame; called from windowAt. */
export function windowDetail(add: (m: 'trim', g: THREE.BufferGeometry) => void, bx2: (a: number, hh: number, depth: number, oa: number, oy: number, oo: number) => THREE.BufferGeometry, w: number, h: number, y: number, c: number, out: number, t: number): void {
  if (!detailGeometryOn() || w < 0.1) return;
  add('trim', bx2(w + 0.058, 0.01, 0.03, 0, y + h + t, c + out + 0.006));       // the head: a drip cap over the casing
  add('trim', bx2(w + 0.03, 0.01, 0.012, 0, y - t - 0.033, c + out + 0.002));   // the apron under the sill
}

/** A door's threshold and drip cap, in the wall's frame (`onWall` turns it onto the wall; +z is outward). */
export function doorDetail(parts: Parts, trim: GabledSpec['trim'], onWall: (g: THREE.BufferGeometry) => THREE.BufferGeometry, w: number, h: number, y0: number): void {
  if (!detailGeometryOn()) return;
  parts.add(trim, onWall(bx(w + 0.03, 0.007, 0.05, 0, y0 - 0.002, 0.02)));
  parts.add(trim, onWall(bx(w + 0.075, 0.012, 0.03, 0, y0 + h + 0.021, 0.012)));
}

/** Water table on the clapboard walls, crawlspace skirt on piers, post bases / caps / braces and railings on the porch. */
export function addBaseAndPorch(parts: Parts, s: GabledSpec, f: ShellFrame): void {
  if (!detailGeometryOn()) return;
  const { hw, hd, y0, yE, pz1 } = f, W = s.W, D = s.D, T = s.wallT;
  parts.layer = 'openings';
  const lap = s.outer === 'timber_lap' || s.outer === 'lap_white' || s.outer === 'vinyl' || s.outer === 'board_batten' || s.outer === 'plaster';
  if (lap && y0 > 0.015) {
    if (!hasDoor(s.front)) parts.add(s.trim, bx(W + 0.012, 0.022, 0.01, 0, y0, hd + 0.003));
    if (!hasDoor(s.back)) parts.add(s.trim, bx(W + 0.012, 0.022, 0.01, 0, y0, -hd - 0.003));
    if (!hasDoor(s.left)) parts.add(s.trim, bx(0.01, 0.022, D + 0.012, -hw - 0.003, y0, 0));
    if (!hasDoor(s.right)) parts.add(s.trim, bx(0.01, 0.022, D + 0.012, hw + 0.003, y0, 0));
  }
  if (s.foundation === 'piers' && y0 > 0.04) {
    // slatted skirt between the piers, set back a hand's width from the wall line
    parts.add('frame', bx(W - 0.04, y0 - 0.02, 0.008, 0, -0.005, hd - 0.03), 'foundation');
    parts.add('frame', bx(W - 0.04, y0 - 0.02, 0.008, 0, -0.005, -hd + 0.03), 'foundation');
    parts.add('frame', bx(0.008, y0 - 0.02, D - 0.04, hw - 0.03, -0.005, 0), 'foundation');
    parts.add('frame', bx(0.008, y0 - 0.02, D - 0.04, -hw + 0.03, -0.005, 0), 'foundation');
  }
  if (s.porch <= 0) return;
  const door = (s.front ?? []).find(o => o.kind === 'door' || o.kind === 'arch');
  const pzF = pz1 - 0.03, ph = yE - 0.01 - y0;
  for (const sx of [-1, 1]) {
    const px = sx * (hw - 0.03);
    parts.add(s.trim, bx(0.044, 0.018, 0.044, px, y0, pzF));                    // base block
    parts.add(s.trim, bx(0.042, 0.01, 0.042, px, y0 + ph - 0.012, pzF));        // cap under the beam
    // knee braces from the post up to the beam, both ways
    for (const dir of [-1, 1]) {
      const g = new THREE.BoxGeometry(0.075, 0.011, 0.011).rotateZ(dir * Math.PI / 4).translate(px + dir * 0.02, y0 + ph - 0.036, pzF);
      parts.add(s.trim, g);
    }
  }
  // railing: top rail, bottom rail and balusters between the posts, a gap at the steps; return runs on the sides
  const rh = 0.16, gapA = door ? door.at - 0.2 : 9, gapB = door ? door.at + 0.2 : 9;
  const run = (ax: number, az: number, bxx: number, bz: number): void => {
    const dx = bxx - ax, dz = bz - az, L = Math.hypot(dx, dz);
    if (L < 0.05) return;
    const rot = -Math.atan2(dz, dx);
    const place = (g: THREE.BufferGeometry) => g.rotateY(rot).translate(ax + dx / 2, 0, az + dz / 2);
    parts.add(s.trim, place(bx(L, 0.01, 0.014, 0, y0 + rh, 0)));
    parts.add(s.trim, place(bx(L, 0.008, 0.012, 0, y0 + 0.03, 0)));
    const n = Math.max(1, Math.round(L / 0.045));
    for (let i = 0; i <= n; i++) { const u = -L / 2 + L * i / n; parts.add(s.trim, place(bx(0.006, rh - 0.038, 0.006, u, y0 + 0.038, 0))); }
  };
  const xa = -hw + 0.03 + 0.022, xb = hw - 0.03 - 0.022, zf = pz1 - 0.02;
  if (door && gapA > xa && gapB < xb) { run(xa, zf, gapA, zf); run(gapB, zf, xb, zf); } else if (!door) run(xa, zf, xb, zf);
  else { run(Math.max(xa, gapB), zf, xb, zf); run(xa, zf, Math.min(xb, gapA), zf); }
  for (const sx of [-1, 1]) run(sx * (hw - 0.012), hd + 0.01, sx * (hw - 0.012), pzF - 0.022);
  void T;
}

/** Crown slab and flue on the stone chimney. */
export function chimneyDetail(parts: Parts, cx: number, cz: number, chW: number, chTop: number): void {
  if (!detailGeometryOn()) return;
  parts.add('chimney_cap', bx(chW + 0.036, 0.008, chW + 0.036, cx, chTop - 0.012, cz));
  parts.add('chimney_cap', bx(0.058, 0.032, 0.058, cx, chTop - 0.004, cz));
  parts.add('chimney_cap', bx(0.068, 0.006, 0.068, cx, chTop + 0.028, cz));
}

/** Flashing plate and storm collar on a stovepipe where it leaves the roof (`roofY` at the pipe, `slope` the roof's rise per unit run on its side). */
export function pipeDetail(parts: Parts, x: number, z: number, roofY: number, tilt: number): void {
  if (!detailGeometryOn()) return;
  parts.add('iron', new THREE.BoxGeometry(0.07, 0.004, 0.07).rotateZ(tilt).translate(x, roofY + 0.003, z));
  parts.add('iron', new THREE.CylinderGeometry(0.019, 0.019, 0.012, 10).translate(x, roofY + 0.05, z));
}
