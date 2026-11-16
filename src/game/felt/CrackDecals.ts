/**
 * FL2: ground decals (docs/FELT_LAYER.md 5.2): cracks, slumps, ash drifts, burn scars, mud lines, dead-field patches and dried mud, as ONE
 * InstancedMesh (one draw call) over a single procedural 512 px atlas (256 px on Low is not needed: Low draws no decals). The atlas has four
 * cells (crack, soft dark, ash patch, dried-mud polygons); each instance picks a cell, a tint and an alpha through instance attributes, so
 * nothing is rebuilt but the instance buffers. No shadows, no new lights.
 */
import * as THREE from 'three';
import type { Decal } from './markPlacement';

export const MAX_DECALS = 240;

function atlas(): THREE.CanvasTexture {
  const S = 512, C = S / 2, cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d')!;
  let seed = 11;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  g.clearRect(0, 0, S, S);
  // cell 0 (top left): a branching crack, black on clear
  g.save(); g.translate(0, 0); g.strokeStyle = '#000'; g.lineCap = 'round'; g.lineJoin = 'round';
  const branch = (x: number, y: number, a: number, len: number, w: number, depth: number): void => {
    // one polyline per branch, stroked before its children start (a nested beginPath would throw the parent's path away)
    const pts: Array<[number, number, number]> = [[x, y, a]];
    let cx = x, cy = y, ca = a;
    for (let i = 0; i < 9; i++) { ca += (rnd() - 0.5) * 0.9; cx += Math.cos(ca) * len / 9; cy += Math.sin(ca) * len / 9; pts.push([cx, cy, ca]); }
    g.lineWidth = w; g.beginPath(); g.moveTo(x, y); for (const p of pts.slice(1)) g.lineTo(p[0], p[1]); g.stroke();
    if (depth > 0) for (let i = 2; i < pts.length; i++) if (rnd() < 0.3) branch(pts[i][0], pts[i][1], pts[i][2] + (rnd() < 0.5 ? 1 : -1) * (0.5 + rnd() * 0.7), len * 0.45, w * 0.6, depth - 1);
  };
  branch(24, C / 2 + (rnd() - 0.5) * 40, 0, C - 56, 10, 2);
  branch(C / 2, 20, Math.PI / 2 + 0.2, C * 0.55, 6, 1);
  g.restore();
  // cell 1 (top right): a soft irregular dark blot, white on clear (tinted by the instance)
  g.save(); g.translate(C, 0);
  for (let i = 0; i < 26; i++) { const x = C / 2 + (rnd() - 0.5) * 120, y = C / 2 + (rnd() - 0.5) * 120, r = 26 + rnd() * 52; const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, C, C); }
  g.restore();
  // cell 2 (bottom left): a drifted ash patch: many soft light specks falling off from the middle
  g.save(); g.translate(0, C);
  for (let i = 0; i < 140; i++) { const a = rnd() * 6.28, d = Math.pow(rnd(), 0.7) * C * 0.42, x = C / 2 + Math.cos(a) * d, y = C / 2 + Math.sin(a) * d, r = 6 + rnd() * 20; const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(255,255,255,${0.35 * (1 - d / (C * 0.5))})`); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, C, C); }
  g.restore();
  // cell 3 (bottom right): dried mud polygons: a jittered grid, white plates with black seams, faded at the edge
  g.save(); g.translate(C, C);
  const N = 7, pts: Array<Array<[number, number]>> = [];
  for (let i = 0; i <= N; i++) { pts.push([]); for (let j = 0; j <= N; j++) pts[i].push([(i + (i && i < N ? (rnd() - 0.5) * 0.7 : 0)) * C / N, (j + (j && j < N ? (rnd() - 0.5) * 0.7 : 0)) * C / N]); }
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const q = [pts[i][j], pts[i + 1][j], pts[i + 1][j + 1], pts[i][j + 1]], cx = (q[0][0] + q[2][0]) / 2, cy = (q[0][1] + q[2][1]) / 2;
    g.beginPath(); q.forEach((p, k) => { const x = cx + (p[0] - cx) * 0.9, y = cy + (p[1] - cy) * 0.9; if (k) g.lineTo(x, y); else g.moveTo(x, y); }); g.closePath();
    g.fillStyle = `rgba(255,255,255,${0.6 + rnd() * 0.3})`; g.fill();
  }
  const fade = g.createRadialGradient(C / 2, C / 2, C * 0.18, C / 2, C / 2, C * 0.5); fade.addColorStop(0, 'rgba(0,0,0,1)'); fade.addColorStop(1, 'rgba(0,0,0,0)');
  g.beginPath(); g.rect(0, 0, C, C); g.clip();   // (destination-in clears everything outside the shape: keep it to this cell)
  g.globalCompositeOperation = 'destination-in'; g.fillStyle = fade; g.fillRect(0, 0, C, C); g.restore();
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.needsUpdate = true;
  return t;
}

export class CrackDecals {
  readonly mesh: THREE.InstancedMesh;
  private readonly _cell: THREE.InstancedBufferAttribute;
  private readonly _alpha: THREE.InstancedBufferAttribute;
  private readonly _fade = { value: 1 };
  private _fadeTarget = 1;
  constructor(scene: THREE.Scene) {
    const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    this._cell = new THREE.InstancedBufferAttribute(new Float32Array(MAX_DECALS), 1);
    this._alpha = new THREE.InstancedBufferAttribute(new Float32Array(MAX_DECALS), 1);
    geo.setAttribute('aCell', this._cell); geo.setAttribute('aAlpha', this._alpha);
    const mat = new THREE.MeshStandardMaterial({ map: atlas(), transparent: true, depthWrite: false, roughness: 0.95, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const fade = this._fade;
    mat.onBeforeCompile = sh => {
      sh.uniforms.uFade = fade;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aCell; attribute float aAlpha; varying float vAlpha;')
        .replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_MAP\n vMapUv = (vMapUv + vec2(mod(aCell, 2.0), 1.0 - floor(aCell / 2.0))) * 0.5;\n#endif\n vAlpha = aAlpha;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vAlpha; uniform float uFade;')
        .replace('#include <map_fragment>', '#include <map_fragment>\n diffuseColor.a *= vAlpha * uFade;');
    };
    this.mesh = new THREE.InstancedMesh(geo, mat, MAX_DECALS);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_DECALS * 3), 3);
    this.mesh.count = 0; this.mesh.visible = false; this.mesh.frustumCulled = false; this.mesh.castShadow = false; this.mesh.receiveShadow = false;
    this.mesh.renderOrder = 2; this.mesh.name = 'felt_decals'; this.mesh.userData = { type: 'feltDecals', noSSAO: true };
    scene.add(this.mesh);
  }
  get count(): number { return this.mesh.count; }
  set(list: readonly Decal[], animate = true): void {
    const n = Math.min(MAX_DECALS, list.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      const d = list[i];
      q.setFromEuler(e.set(0, d.rot, 0)); p.set(d.x, d.y, d.z); s.set(d.size, 1, d.size);
      this.mesh.setMatrixAt(i, m.compose(p, q, s));
      this.mesh.setColorAt(i, new THREE.Color(Math.min(1, d.r), Math.min(1, d.g), Math.min(1, d.b)));
      this._cell.setX(i, d.cell); this._alpha.setX(i, d.a);
    }
    this.mesh.count = n; this.mesh.visible = n > 0;
    this.mesh.instanceMatrix.needsUpdate = true; if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this._cell.needsUpdate = true; this._alpha.needsUpdate = true;
    this._fade.value = animate && n ? 0.15 : 1;
    this._fadeTarget = 1;
  }
  frame(dt: number): void { if (this._fade.value < this._fadeTarget) this._fade.value = Math.min(this._fadeTarget, this._fade.value + dt * 0.7); }
  dispose(): void { this.mesh.geometry.dispose(); const mt = this.mesh.material as THREE.MeshStandardMaterial; mt.map?.dispose(); mt.dispose(); this.mesh.dispose(); this.mesh.removeFromParent(); }
}
