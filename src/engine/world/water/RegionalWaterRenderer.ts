/**
 * RegionalWaterRenderer — the regional landscape's open water (lakes,
 * reservoirs, rivers, the sound) as one flat plane at the region's water
 * level, cut to the smooth zero contour of a depth raster (far + near field),
 * with UE's water look, a river flow field near the site and reed fringes on
 * still shallow shores. From UE RegionalTerrainRenderer._buildWater.
 */
import * as THREE from 'three';
import { computeWaterFlow, encodeFlow, flowSpeedAt, type FlowField } from './waterFlow';
import { patchWaterMaterial, WATER_LOOKS, type WaterLook } from './waterShading';
import { WaterEdgeRenderer } from './WaterEdgeRenderer';
import { applyEdgeHaze } from '../terrain/edgeHaze';
import { R_MAX } from '../terrain/TerrainRenderer';
import type { RegionKind } from '../terrain/regionalLandscape';
import type { Quality } from '../WorldScene';

export interface RegionalWaterOptions {
  kind: RegionKind;
  height(x: number, z: number): number;
  waterY: number;
  cx: number;
  cz: number;
  /** Reeds start this far (Chebyshev) from the center. */
  reedInner: number;
  quality: Quality;
  season: string;
}

export class RegionalWaterRenderer {
  private readonly _scene: THREE.Scene;
  private readonly _objs: THREE.Object3D[] = [];
  private readonly _disposables: Array<{ dispose(): void }> = [];
  private readonly _edges: WaterEdgeRenderer;
  private _flow: FlowField | null = null;
  private _flowOrigin: [number, number] = [0, 0];

  constructor(scene: THREE.Scene) {
    this._scene = scene;
    this._edges = new WaterEdgeRenderer(scene);
  }

  build(o: RegionalWaterOptions): void {
    this.dispose();
    const { cx, cz, quality: q } = o;
    const wy = o.waterY;
    const field = { height: o.height, kind: o.kind };
    // Far depth map (0 = shore … 1 = ≥ 4 units deep) for shallow / deep tint
    const NT = q === 'low' ? 128 : 256, half = R_MAX * 0.75;
    const data = new Uint8Array(NT * NT * 4);
    for (let j = 0; j < NT; j++) for (let i = 0; i < NT; i++) {
      const x = cx - half + (i + 0.5) / NT * half * 2, z = cz - half + (j + 0.5) / NT * half * 2;
      const dep = Math.min(1, Math.max(0, (wy - field.height(x, z) + 1) / 5));
      const k = (j * NT + i) * 4;
      data[k] = Math.round(dep * 255); data[k + 3] = 255;
    }
    const tex = new THREE.DataTexture(data, NT, NT);
    tex.magFilter = tex.minFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
    // Near field round the town: finer depth (true shoreline / lapping edge)
    // + the river flow field
    const NN = q === 'low' ? 160 : q === 'medium' ? 280 : 340, nh = 560;
    const tx0 = cx - nh, tz0 = cz - nh, tex1 = (nh * 2) / NN;
    const wet = new Uint8Array(NN * NN);
    const ndep = new Float32Array(NN * NN);
    const ndata = new Uint8Array(NN * NN * 4);
    for (let j = 0; j < NN; j++) for (let i = 0; i < NN; i++) {
      const x = tx0 + (i + 0.5) * tex1, z = tz0 + (j + 0.5) * tex1;
      const d = wy - field.height(x, z);
      const k = j * NN + i;
      if (d > 0) wet[k] = 1;
      ndep[k] = d;
      ndata[k * 4] = Math.round(Math.min(1, Math.max(0, (d + 1) / 5)) * 255);
      ndata[k * 4 + 3] = 255;
    }
    const ntex = new THREE.DataTexture(ndata, NN, NN);
    ntex.magFilter = ntex.minFilter = THREE.LinearFilter;
    ntex.needsUpdate = true;
    const down: Record<RegionKind, [number, number]> = {
      drumlin: [0, 1], bayou: [0, 1], plains: [1, 0], mountain: [1, 0.3], sound: [0, 1], coast: [-1, 0], city: [1, 0],
      appalachia: [1, 0], desert: [1, 0], north_woods: [1, 0], upper_midwest: [1, 0], ozarks: [1, 0], hill_country: [1, 0], rust_belt: [1, 0],
    };
    const flow = computeWaterFlow({
      W: NN, H: NN, wet, texel: tex1, downstream: down[field.kind],
      maxRiverHalfWidth: field.kind === 'bayou' ? 30 : 16, baseSpeed: 0.45, refHalfWidth: field.kind === 'bayou' ? 20 : 7,
      rockDensity: q === 'low' ? 0 : 0.15, seed: 5,
    });
    this._flow = flow;
    this._flowOrigin = [tx0, tz0];
    const fdata = new Uint8Array(NN * NN * 4);
    const fscale = encodeFlow(flow, fdata);
    const ftex = new THREE.DataTexture(fdata, NN, NN);
    ftex.magFilter = ftex.minFilter = THREE.LinearFilter;
    ftex.needsUpdate = true;
    const flowU = {
      tex: { value: ftex as THREE.Texture | null },
      rect: { value: new THREE.Vector4(tx0, tz0, 1 / (nh * 2), 1 / (nh * 2)) },
      scale: { value: fscale },
    };
    const looks: Record<RegionKind, WaterLook> = {
      drumlin: WATER_LOOKS.river, plains: WATER_LOOKS.river, bayou: WATER_LOOKS.bayou, sound: WATER_LOOKS.sound,
      mountain: WATER_LOOKS.campus, coast: WATER_LOOKS.campus, city: WATER_LOOKS.campus,
      appalachia: WATER_LOOKS.river, desert: WATER_LOOKS.campus, north_woods: WATER_LOOKS.pond, upper_midwest: WATER_LOOKS.pond,
      ozarks: WATER_LOOKS.pond, hill_country: WATER_LOOKS.pond, rust_belt: WATER_LOOKS.river,
    };
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff });
    patchWaterMaterial(mat, {
      key: 'regional',
      look: looks[field.kind],
      pars: 'uniform sampler2D uDepthFar;\nuniform vec4 uFarRect;\nuniform sampler2D uDepthNear;',
      uniforms: { uDepthFar: { value: tex }, uFarRect: { value: new THREE.Vector4(cx - half, cz - half, 1 / (half * 2), 1 / (half * 2)) }, uDepthNear: { value: ntex } },
      depthGLSL: /* glsl */`
        vec2 nUv = (vWPos.xz - uFlowRect.xy) * uFlowRect.zw;
        float inN = step(0.0, nUv.x) * step(nUv.x, 1.0) * step(0.0, nUv.y) * step(nUv.y, 1.0);
        float dFar = texture2D(uDepthFar, (vWPos.xz - uFarRect.xy) * uFarRect.zw).r;
        // signed depth in units (−1 dry … +4): the shoreline is the smooth
        // zero contour of the field, not the coarse terrain triangles that
        // happen to dip under the water plane (no stair-stepped shores)
        float sd = mix(dFar, texture2D(uDepthNear, clamp(nUv, 0.0, 1.0)).r, inN) * 5.0 - 1.0;
        if (sd < 0.0) discard;
        float dm = sd / 4.0;
        wDepth = smoothstep(0.0, 0.6, dm);
        wEdge = (1.0 - smoothstep(0.0, 0.05, dm)) * inN;`,
      flow: flowU,
      rippleScale: 0.7,
      detailFade: [90, 650],
    });
    applyEdgeHaze(mat, [cx, cz], R_MAX * 0.72, R_MAX * 0.995);
    const geo = new THREE.PlaneGeometry(R_MAX * 2, R_MAX * 2).rotateX(-Math.PI / 2).translate(cx, wy, cz);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'regional_water';
    mesh.userData = { type: 'regional_water', noSSAO: true };
    mesh.frustumCulled = false;
    this._scene.add(mesh);
    this._objs.push(mesh);
    this._disposables.push(geo, mat);
    this._disposables.push(tex, ntex, ftex);
    // Reed stands on the still / slow shallows near the town
        this._edges.buildRegional({
      cx, cz, radius: 420, inner: o.reedInner,
      height: (x, z) => {
        // bilinear in the near depth raster (cheaper than re-sampling the field)
        const fx = (x - tx0) / tex1 - 0.5, fz = (z - tz0) / tex1 - 0.5;
        const i = Math.floor(fx), j = Math.floor(fz);
        if (i < 0 || j < 0 || i >= NN - 1 || j >= NN - 1) return wy + 1;
        const u = fx - i, v = fz - j, k = j * NN + i;
        const d = (ndep[k] * (1 - u) + ndep[k + 1] * u) * (1 - v) + (ndep[k + NN] * (1 - u) + ndep[k + NN + 1] * u) * v;
        return wy - d;
      },
      waterY: wy,
      speed: (x, z) => this.flowSpeedAt(x, z),
      quality: q, season: o.season,
    });
  }

  /** River surface speed (units / s) at (x, z); 0 on still water / outside the near field. */
  flowSpeedAt(x: number, z: number): number {
    const f = this._flow;
    if (!f) return 0;
    return flowSpeedAt(f, (x - this._flowOrigin[0]) / f.texel, (z - this._flowOrigin[1]) / f.texel);
  }

  setSeason(season: string): void { this._edges.setSeason(season); }

  dispose(): void {
    for (const o of this._objs) this._scene.remove(o);
    for (const d of this._disposables) d.dispose();
    this._objs.length = 0;
    this._disposables.length = 0;
    this._edges.clear();
    this._flow = null;
  }
}
