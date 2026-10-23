/**
 * StreamRenderer — a creek whose surface falls along its course (UE's water
 * bodies are flat planes; a mountain creek is not). The surface is a ribbon
 * following the centre line at the water level of each station; the shoreline
 * is the smooth zero contour of a signed-depth raster (no stair-stepped
 * banks), and the UE water look does the rest: bed showing through the
 * shallows, flow-advected ripples and foam from a computed flow field,
 * riffles round mid-stream rocks, sky / sun reflection, rain rings, winter ice
 * (fast water stays open). Reeds, rushes, pebble bars and willows line it
 * (WaterEdgeRenderer.buildShore).
 */
import * as THREE from 'three';
import { computeWaterFlow, encodeFlow, flowSpeedAt, type FlowField } from './waterFlow';
import { patchWaterMaterial, WATER_LOOKS } from './waterShading';
import { WaterEdgeRenderer, type EdgeSite } from './WaterEdgeRenderer';
import type { Quality } from '../WorldScene';

export interface StreamOptions {
  /** Course from x0 to x1 (flows toward +x). */
  x0: number;
  x1: number;
  zAt(x: number): number;
  waterY(x: number): number;
  /** Half-width of the surface ribbon (covers the channel and floodplain lip). */
  band: number;
  site: EdgeSite;
  quality: Quality;
  season: string;
  seed: number;
}

const TEXEL: Record<Quality, number> = { high: 0.12, medium: 0.18, low: 0.3 };
/** Signed depth is stored as (d + DEPTH_OFF) / DEPTH_RANGE in 0..1. */
const DEPTH_OFF = 1, DEPTH_RANGE = 3;

export class StreamRenderer {
  private readonly _scene: THREE.Scene;
  private readonly _edges: WaterEdgeRenderer;
  private _mesh: THREE.Mesh | null = null;
  private readonly _disp: Array<{ dispose(): void }> = [];
  private _flow: FlowField | null = null;
  private _origin: [number, number] = [0, 0];
  private _depth: Float32Array | null = null;
  private _W = 0;
  private _H = 0;
  private _texel = 1;

  constructor(scene: THREE.Scene) {
    this._scene = scene;
    this._edges = new WaterEdgeRenderer(scene);
  }

  build(o: StreamOptions): void {
    this.clear();
    const texel = TEXEL[o.quality];
    // Raster over the course's bounding box
    let zMin = Infinity, zMax = -Infinity;
    for (let x = o.x0; x <= o.x1; x += 0.5) { const z = o.zAt(x); zMin = Math.min(zMin, z); zMax = Math.max(zMax, z); }
    const ox = o.x0, oz = zMin - o.band - 1;
    const W = Math.ceil((o.x1 - o.x0) / texel), H = Math.ceil((zMax - zMin + 2 * o.band + 2) / texel);
    const depth = new Float32Array(W * H);
    const wet = new Uint8Array(W * H);
    const data = new Uint8Array(W * H * 4);
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const x = ox + (i + 0.5) * texel, z = oz + (j + 0.5) * texel;
      const k = j * W + i;
      const d = Math.abs(z - o.zAt(x)) > o.band ? -1 : o.waterY(x) - o.site.ground(x, z);
      depth[k] = d;
      if (d > 0) wet[k] = 1;
      data[k * 4] = Math.round(Math.min(1, Math.max(0, (d + DEPTH_OFF) / DEPTH_RANGE)) * 255);
      data[k * 4 + 3] = 255;
    }
    this._depth = depth; this._W = W; this._H = H; this._texel = texel; this._origin = [ox, oz];
    const dtex = new THREE.DataTexture(data, W, H);
    dtex.magFilter = dtex.minFilter = THREE.LinearFilter;
    dtex.needsUpdate = true;
    const flow = computeWaterFlow({
      W, H, wet, texel, downstream: [1, 0],
      maxRiverHalfWidth: 3, baseSpeed: 0.45, refHalfWidth: 0.7,
      rockDensity: o.quality === 'low' ? 0 : 0.6, seed: o.seed,
    });
    this._flow = flow;
    const fdata = new Uint8Array(W * H * 4);
    const fscale = encodeFlow(flow, fdata);
    const ftex = new THREE.DataTexture(fdata, W, H);
    ftex.magFilter = ftex.minFilter = THREE.LinearFilter;
    ftex.needsUpdate = true;
    const rect = new THREE.Vector4(ox, oz, 1 / (W * texel), 1 / (H * texel));
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff });
    patchWaterMaterial(mat, {
      key: 'stream',
      look: WATER_LOOKS.river,
      pars: 'uniform sampler2D uDepthTex;',
      uniforms: { uDepthTex: { value: dtex } },
      depthGLSL: /* glsl */`
        vec2 sUv = (vWPos.xz - uFlowRect.xy) * uFlowRect.zw;
        float sd = texture2D(uDepthTex, clamp(sUv, 0.0, 1.0)).r * ${DEPTH_RANGE.toFixed(1)} - ${DEPTH_OFF.toFixed(1)};
        if (sd < 0.0) discard;
        wDepth = smoothstep(0.0, 0.45, sd);
        wEdge = 1.0 - smoothstep(0.0, 0.05, sd);`,
      flow: { tex: { value: ftex }, rect: { value: rect }, scale: { value: fscale } },
      rippleScale: 0.45,
      detailFade: [40, 260],
    });
    // Ribbon: stations along x, a strip across the course at each station's water level
    const step = o.quality === 'low' ? 0.5 : 0.25;
    const across = 8;
    const nx = Math.ceil((o.x1 - o.x0) / step) + 1;
    const pos = new Float32Array(nx * (across + 1) * 3);
    for (let i = 0; i < nx; i++) {
      const x = Math.min(o.x1, o.x0 + i * step);
      const zc = o.zAt(x), y = o.waterY(x) + 0.004;
      for (let k = 0; k <= across; k++) {
        const q = (i * (across + 1) + k) * 3;
        pos[q] = x; pos[q + 1] = y; pos[q + 2] = zc - o.band + (2 * o.band * k) / across;
      }
    }
    const idx: number[] = [];
    for (let i = 0; i < nx - 1; i++) for (let k = 0; k < across; k++) {
      const a = i * (across + 1) + k, b = a + 1, c = a + across + 1, d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    // normals straight up (the water shader perturbs them); the slope is a few per cent
    const nrm = geo.getAttribute('normal') as THREE.BufferAttribute;
    for (let i = 0; i < nrm.count; i++) nrm.setXYZ(i, 0, 1, 0);
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'stream';
    mesh.userData = { type: 'stream' };
    mesh.receiveShadow = true;
    this._scene.add(mesh);
    this._mesh = mesh;
    this._disp.push(geo, mat, dtex, ftex);

    // Shore planting (shore 0.5 = waterline; > 0.5 water)
    this._edges.buildShore({
      bounds: { x0: o.x0 + 1, z0: oz, x1: o.x1 - 1, z1: oz + H * texel },
      shore: (x, z) => Math.min(1, Math.max(0, 0.5 + this.depthAt(x, z) / 0.6)),
      depth: (x, z) => Math.min(1, Math.max(0, this.depthAt(x, z) / 0.4)),
      speed: (x, z) => this.speedAt(x, z),
      rocks: flow.rocks.map(r => ({ x: ox + r.x * texel, z: oz + r.y * texel, r: Math.max(0.06, r.r * texel) })),
      site: o.site,
      waterY: o.waterY((o.x0 + o.x1) / 2),
      quality: o.quality,
      season: o.season,
      seed: o.seed,
    });
  }

  /** Signed water depth at (x, z) (bilinear in the raster; −1 outside). */
  depthAt(x: number, z: number): number {
    const D = this._depth;
    if (!D) return -1;
    const fx = (x - this._origin[0]) / this._texel - 0.5, fz = (z - this._origin[1]) / this._texel - 0.5;
    const i = Math.floor(fx), j = Math.floor(fz);
    if (i < 0 || j < 0 || i >= this._W - 1 || j >= this._H - 1) return -1;
    const u = fx - i, v = fz - j, k = j * this._W + i;
    return (D[k] * (1 - u) + D[k + 1] * u) * (1 - v) + (D[k + this._W] * (1 - u) + D[k + this._W + 1] * u) * v;
  }

  /** Surface current (world units / s). */
  speedAt(x: number, z: number): number {
    const f = this._flow;
    if (!f) return 0;
    return flowSpeedAt(f, (x - this._origin[0]) / f.texel, (z - this._origin[1]) / f.texel);
  }

  setSeason(season: string): void { this._edges.setSeason(season); }

  clear(): void {
    if (this._mesh) this._scene.remove(this._mesh);
    this._mesh = null;
    for (const d of this._disp) d.dispose();
    this._disp.length = 0;
    this._edges.clear();
    this._flow = null;
    this._depth = null;
  }

  dispose(): void {
    this.clear();
    this._edges.dispose();
  }
}
