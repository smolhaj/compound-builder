/**
 * FarTreeRenderer — the regional landscape's trees beyond the site: simple
 * vertex-colored species silhouettes (fir, cedar, pine, broadleaf, live oak,
 * cypress, birch / aspen, eucalyptus, shrub, poplar), instanced in two LODs,
 * planted in rings outward from the site where the regional forest density
 * says so, with GPU seasons for the deciduous species.
 *
 * From UE RegionalTerrainRenderer (_buildTrees + speciesGeos).
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { InstancedLodSet } from './instancedLod';
import { applySeasonToFarTrees } from '../season/seasonShader';
import { TOWN_Y, type RegionKind, type RegionLook } from '../terrain/regionalLandscape';
import type { Quality } from '../WorldScene';

function hash(a: number, b: number): number {
  const n = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

const TREES: Record<Quality, number> = { high: 7500, medium: 4800, low: 1400 };

/** Far-tree geometries: [near, far] for conifers and broadleaves (unit height, base at y=0). */
/** Far-landscape tree species (region-appropriate silhouettes). */
export type TreeSpecies = 'fir' | 'cedar' | 'pine' | 'broad' | 'liveoak' | 'cypress' | 'birch' | 'eucalyptus' | 'shrub' | 'poplar' | 'spruce' | 'juniper';

/** Season behaviour per species: deciduous crowns turn and go bare (bald cypress included). */
export const SPECIES_DECIDUOUS: Record<TreeSpecies, boolean> = {
  fir: false, cedar: false, pine: false, broad: true, liveoak: false, cypress: true, birch: true, eucalyptus: false, shrub: false, poplar: true,
  spruce: false, juniper: false,
};

/**
 * Regional species mix [species, weight]. Real analogues: Deep South live
 * oak / loblolly pine / bald cypress; SoCal coast live oak, sycamore,
 * eucalyptus over chaparral; New England maple-oak with white pine /
 * hemlock and birch; PNW Douglas fir, cedar, bigleaf maple; Midwest oak /
 * maple / cottonwood; Mountain West ponderosa, aspen, cottonwood on creeks.
 */
export function speciesMix(kind: RegionKind): Array<[TreeSpecies, number]> {
  switch (kind) {
    case 'bayou': return [['liveoak', 0.35], ['pine', 0.35], ['cypress', 0.12], ['broad', 0.18]];
    case 'coast': return [['shrub', 0.72], ['liveoak', 0.14], ['broad', 0.07], ['eucalyptus', 0.07]];
    case 'drumlin': return [['broad', 0.5], ['fir', 0.28], ['birch', 0.22]];
    case 'sound': return [['fir', 0.68], ['cedar', 0.17], ['broad', 0.15]];
    case 'plains': return [['broad', 0.88], ['fir', 0.04], ['birch', 0.08]];
    case 'mountain': return [['pine', 0.55], ['fir', 0.25], ['birch', 0.2]];
    case 'city': return [['broad', 0.7], ['fir', 0.3]];
    // oak–hickory, tulip poplar and maple; hemlock in the coves, Virginia / white pine on the dry ridges
    case 'appalachia': return [['broad', 0.72], ['fir', 0.1], ['pine', 0.1], ['birch', 0.08]];
    // one-seed juniper and pinyon
    case 'desert': return [['juniper', 0.75], ['shrub', 0.25]];
    // black / white spruce, balsam fir, jack / red pine; paper birch and aspen
    case 'north_woods': return [['spruce', 0.55], ['fir', 0.15], ['pine', 0.1], ['birch', 0.2]];
    // sugar maple, red oak, basswood woodlots; a few white pine
    case 'upper_midwest': return [['broad', 0.82], ['birch', 0.08], ['pine', 0.1]];
  }
}

/** [near, far] geometry per species, vertex-colored (leaves white: the instance color tints them). */
function speciesGeos(): Record<TreeSpecies, [THREE.BufferGeometry, THREE.BufferGeometry]> {
  const paint = (g: THREE.BufferGeometry, c: THREE.Color): THREE.BufferGeometry => {
    const n = g.getAttribute('position').count;
    const a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    g.deleteAttribute('uv');
    return g;
  };
  const bark = new THREE.Color(0x4a3a2c).multiplyScalar(0.6), pale = new THREE.Color(0xc8c2b4), leaf = new THREE.Color(1, 1, 1);
  const trunk = (r: number, h: number, seg: number, c = bark, y = 0) => paint(new THREE.CylinderGeometry(r * 0.7, r, h, seg, 1, true).translate(0, y + h / 2, 0).toNonIndexed(), c);
  const cone = (r: number, h: number, y: number, seg: number) => paint(new THREE.ConeGeometry(r, h, seg, 1).translate(0, y + h / 2, 0).toNonIndexed(), leaf);
  /** Lumpy crown blob: radii rx / ry / rz centered at (ox, y, oz). */
  const blob = (detail: number, rx = 0.42, ry = 0.33, rz = 0.42, y = 0.62, ox = 0, oz = 0) => {
    const g = new THREE.IcosahedronGeometry(1, detail); // polyhedra are already non-indexed
    const p = g.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const k = 0.88 + 0.24 * hash(Math.round(p.getX(i) * 21 + ox * 50), Math.round(p.getZ(i) * 21 + p.getY(i) * 13 + y * 40));
      p.setXYZ(i, ox + p.getX(i) * rx * k, y + p.getY(i) * ry * k, oz + p.getZ(i) * rz * k);
    }
    return paint(g, leaf);
  };
  const m = (parts: THREE.BufferGeometry[]): THREE.BufferGeometry => { const g = mergeGeometries(parts)!; g.computeVertexNormals(); return g; };
  return {
    // Douglas fir / spruce / hemlock: stacked cones over a short trunk
    fir: [m([trunk(0.04, 0.2, 4), cone(0.26, 0.62, 0.14, 6), cone(0.19, 0.48, 0.5, 6)]), m([cone(0.24, 0.92, 0.08, 4)])],
    // western red cedar: broad drooping skirt, conical
    cedar: [m([trunk(0.05, 0.16, 4), cone(0.34, 0.6, 0.1, 7), cone(0.22, 0.5, 0.5, 6)]), m([cone(0.32, 0.95, 0.06, 5)])],
    // loblolly / ponderosa: tall clear trunk, a rounded open crown in the top third
    pine: [m([trunk(0.04, 0.78, 5), blob(1, 0.27, 0.17, 0.27, 0.86), blob(0, 0.17, 0.11, 0.17, 0.72, 0.12, -0.05)]),
      m([trunk(0.04, 0.72, 3), blob(0, 0.28, 0.17, 0.28, 0.85)])],
    // oak / maple / sycamore / cottonwood: short bole, round crown
    broad: [m([trunk(0.05, 0.36, 4), blob(1)]), m([blob(0)])],
    // live oak: low, very wide, flat-topped spreading crown on a short thick trunk
    // (a stout bole to ~⅓ of the height, then a broad domed crown of several
    // lobes — Lyceum Circle / Oak Alley — never a flat mat on the grass)
    liveoak: [m([trunk(0.07, 0.42, 5), blob(1, 0.56, 0.3, 0.52, 0.66), blob(0, 0.34, 0.22, 0.32, 0.6, 0.34, 0.14), blob(0, 0.32, 0.2, 0.3, 0.62, -0.3, -0.16)]),
      m([trunk(0.06, 0.4, 3), blob(0, 0.6, 0.32, 0.55, 0.64)])],
    // bald cypress: flared buttress, narrow tapering crown with a flat top
    cypress: [m([trunk(0.1, 0.12, 6), trunk(0.04, 0.5, 4, bark, 0.1), cone(0.22, 0.62, 0.36, 6)]), m([cone(0.22, 0.85, 0.12, 4)])],
    // birch / aspen: slender pale trunk, narrow oval crown
    birch: [m([trunk(0.03, 0.62, 4, pale), blob(1, 0.2, 0.32, 0.2, 0.72)]), m([trunk(0.03, 0.5, 3, pale), blob(0, 0.2, 0.32, 0.2, 0.72)])],
    // eucalyptus: tall pale trunk, sparse irregular crown in clumps
    eucalyptus: [m([trunk(0.04, 0.9, 4, pale), blob(0, 0.22, 0.16, 0.2, 0.95, 0.06, 0), blob(0, 0.17, 0.13, 0.17, 0.78, -0.12, 0.08), blob(0, 0.14, 0.12, 0.14, 1.08, 0.02, -0.08)]),
      m([trunk(0.04, 0.85, 3, pale), blob(0, 0.24, 0.24, 0.22, 0.92)])],
    // chaparral shrub (manzanita / chamise / scrub oak): a low dome
    shrub: [m([blob(0, 0.45, 0.3, 0.45, 0.28)]), m([blob(0, 0.45, 0.3, 0.45, 0.28)])],
    // Lombardy poplar (farm windbreak rows in the intermountain West): a tall narrow column
    poplar: [m([trunk(0.03, 0.2, 4), blob(1, 0.12, 0.42, 0.12, 0.56)]), m([blob(0, 0.12, 0.44, 0.12, 0.54)])],
    // black spruce / balsam fir: a narrow spire, short branches to the ground
    spruce: [m([trunk(0.03, 0.12, 4), cone(0.15, 0.62, 0.06, 6), cone(0.11, 0.46, 0.42, 6)]), m([cone(0.15, 0.95, 0.05, 4)])],
    // one-seed juniper / pinyon: a low, ragged, rounded crown on a short twisted trunk
    juniper: [m([trunk(0.05, 0.22, 4), blob(1, 0.42, 0.34, 0.4, 0.5), blob(0, 0.26, 0.22, 0.24, 0.42, 0.2, 0.12)]), m([blob(0, 0.44, 0.38, 0.42, 0.48)])],
  };
}

/** Per-species shape (height factor, width factor) and leaf tint. */
const SPECIES_SHAPE: Record<TreeSpecies, { h: number; w: number; col: number }> = {
  fir: { h: 1.2, w: 0.9, col: 0x2c4a30 },
  cedar: { h: 1.1, w: 1.05, col: 0x2f4c34 },
  pine: { h: 1.45, w: 1.0, col: 0x3c5832 },
  broad: { h: 1.0, w: 1.05, col: 0x3f6430 },
  liveoak: { h: 0.85, w: 1.25, col: 0x3c4a2c },
  cypress: { h: 1.25, w: 0.85, col: 0x4a5e38 },
  birch: { h: 1.05, w: 0.85, col: 0x5c7e3a },
  eucalyptus: { h: 1.55, w: 1.0, col: 0x66765a },
  shrub: { h: 0.35, w: 0.9, col: 0x4a5430 },
  poplar: { h: 1.3, w: 1.0, col: 0x4c6a32 },
  spruce: { h: 1.25, w: 0.75, col: 0x26402c },
  juniper: { h: 0.45, w: 1.05, col: 0x4c5a40 },
};


export interface FarTreeOptions {
  kind: RegionKind;
  look: RegionLook;
  /** Height / cover of the landscape. */
  sample(x: number, z: number): { h: number; forest: number };
  height(x: number, z: number): number;
  /** Site rectangle the rings start around. */
  cx: number;
  cz: number;
  siteW: number;
  siteH: number;
  /** First ring distance beyond the site edge. */
  r0: number;
  waterY: number | null;
  quality: Quality;
  /** Extra exclusions (roads, farmyards, the site's own trees). */
  blocked?: (x: number, z: number) => boolean;
  /** Placed trees (farm windbreaks, yard trees): base y and height. */
  extra?: ReadonlyArray<{ x: number; y: number; z: number; h: number; sp: TreeSpecies }>;
}

export class FarTreeRenderer {
  private readonly _scene: THREE.Scene;
  private readonly _sets: InstancedLodSet[] = [];
  private readonly _disposables: Array<{ dispose(): void }> = [];

  constructor(scene: THREE.Scene) {
    this._scene = scene;
  }

  build(o: FarTreeOptions): void {
    this.dispose();
    const budget = TREES[o.quality];
    const geos = speciesGeos();
    const mix = speciesMix(o.kind);
    const look = o.look;
    const blocked = o.blocked ?? (() => false);
    const lists = new Map<TreeSpecies, { m: THREE.Matrix4[]; c: THREE.Color[] }>();
    const add = (sp: TreeSpecies, mat: THREE.Matrix4, c: THREE.Color): void => {
      let l = lists.get(sp); if (!l) lists.set(sp, l = { m: [], c: [] });
      l.m.push(mat); l.c.push(c);
    };
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
    const v = new THREE.Vector3(), s = new THREE.Vector3();
    const broadTint = new THREE.Color(o.kind === 'coast' ? 0x55602f : o.kind === 'bayou' ? 0x46553a : o.kind === 'mountain' || o.kind === 'desert' ? 0x5a7a34 : 0x3f6430);
    const pickSp = (x: number, z: number, h: number, wetK: number): TreeSpecies => {
      if (o.kind === 'bayou' && wetK > 0.5 && hash(z, x * 0.7) < 0.75) return 'cypress';
      if (o.kind === 'mountain' && h > 120 && hash(z * 1.3, x) < 0.7) return 'fir';
      if (o.kind === 'mountain' && h < 20 && wetK > 0.2) return 'broad';
      if (o.kind === 'coast' && wetK > 0.2) return hash(x, z) < 0.7 ? 'broad' : 'liveoak';
      // cottonwoods on the desert washes and the plains creeks; tamarack / cedar round the north-woods lakes
      if ((o.kind === 'desert' || o.kind === 'plains') && wetK > 0.2) return 'broad';
      if (o.kind === 'appalachia' && h > 60 && hash(z, x * 1.7) < 0.35) return 'pine';
      const r = hash(x * 1.3, z);
      let acc = 0;
      for (const [sp, w] of mix) { acc += w; if (r < acc) return sp; }
      return mix[mix.length - 1][0];
    };
    const { cx, cz, siteW, siteH } = o;
    const r1 = 480;
    let n = 0;
    const step = (r: number): number => (r < 260 ? 2.6 : 3.6);
    for (let r = o.r0; r < r1 && n < budget; r += step(r)) {
      const per = Math.floor((2 * Math.PI * (r + Math.max(siteW, siteH) * 0.6)) / step(r));
      for (let k = 0; k < per && n < budget; k++) {
        const a = (k + hash(r, k) * 0.9) / per * Math.PI * 2;
        const rr = r + (hash(k, r) - 0.5) * 4;
        const x = cx + Math.cos(a) * (siteW / 2 + rr), z = cz + Math.sin(a) * (siteH / 2 + rr);
        if (blocked(x, z)) continue;
        const sm = o.sample(x, z);
        if (sm.forest < 0.45 || hash(x, z) > Math.pow(sm.forest, 1.6) * 0.9) continue;
        if (o.waterY !== null && sm.h < o.waterY + 0.25) continue;
        if (sm.h - TOWN_Y > look.treeLine + (hash(z, x) - 0.5) * 40) continue;
        const e = 3;
        const gx = o.height(x + e, z) - o.height(x - e, z), gz = o.height(x, z + e) - o.height(x, z - e);
        if (Math.hypot(gx, gz) / (2 * e) > 0.95) continue;
        const wetK = o.waterY !== null ? 1 - Math.min(1, Math.max(0, (sm.h - o.waterY - 0.3) / 1.2))
          : o.kind === 'coast' ? Math.max(0, 1 - (sm.h - TOWN_Y) / 1.5) * 0.5 : 0;
        const sp = pickSp(x, z, sm.h - TOWN_Y, wetK);
        const sh = SPECIES_SHAPE[sp];
        const hgt = (2.0 + hash(z * 0.7, x) * 1.4) * sh.h;
        const wid = hgt * sh.w * (0.9 + 0.2 * hash(x * 0.9, z * 1.1));
        q.setFromAxisAngle(up, hash(x, z * 3) * Math.PI * 2);
        m.compose(v.set(x, sm.h - 0.1, z), q, s.set(wid, hgt, wid));
        const hc = hash(x * 0.3, z * 0.7);
        const c = (sp === 'broad' ? broadTint.clone() : new THREE.Color(sh.col)).multiplyScalar(0.8 + hc * 0.4);
        if (sp === 'liveoak' && o.kind === 'bayou') c.lerp(new THREE.Color(0x77806a), 0.25 * hc);
        add(sp, m.clone(), c);
        n++;
      }
    }
    for (const t of o.extra ?? []) {
      const sh = SPECIES_SHAPE[t.sp];
      q.setFromAxisAngle(up, hash(t.x, t.z * 3) * Math.PI * 2);
      m.compose(v.set(t.x, t.y, t.z), q, s.set(t.h * sh.w, t.h, t.h * sh.w));
      add(t.sp, m.clone(), new THREE.Color(sh.col).multiplyScalar(0.85 + 0.3 * hash(t.x, t.z)));
    }
    const makeMat = (decid: boolean): THREE.MeshStandardMaterial => {
      const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 });
      mat.onBeforeCompile = (sh) => {
        applySeasonToFarTrees(sh, decid);
        sh.fragmentShader = sh.fragmentShader.replace('#include <fog_fragment>', /* glsl */`#ifdef USE_FOG
            float rk2 = mix(1.0, 0.1, smoothstep(80.0, 420.0, vFogDepth));
            gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, 1.0 - exp(- fogDensity * fogDensity * rk2 * vFogDepth * vFogDepth));
          #endif`);
      };
      mat.customProgramCacheKey = () => `regional_trees_v2_${decid ? 'd' : 'e'}`;
      return mat;
    };
    const conMat = makeMat(false), brMat = makeMat(true);
    this._disposables.push(conMat, brMat);
    for (const sp of Object.keys(geos) as TreeSpecies[]) {
      const [near, far] = geos[sp];
      this._disposables.push(near, far);
      const l = lists.get(sp);
      if (!l || l.m.length === 0) continue;
      const set = new InstancedLodSet(this._scene, [{ geometry: near, maxDist: 180 }, { geometry: far, maxDist: Infinity }], SPECIES_DECIDUOUS[sp] ? brMat : conMat, l.m, {
        name: 'regional_trees', userData: { type: 'regional_trees', species: sp, noSSAO: true }, noSSAOFromLevel: 0, maxDrawDist: 1400,
      });
      l.c.forEach((c, i) => set.setColorAt(i, c));
      this._sets.push(set);
    }
  }

  get count(): number { return this._sets.reduce((a, s) => a + s.count, 0); }

  dispose(): void {
    for (const s of this._sets) s.dispose();
    for (const d of this._disposables) d.dispose();
    this._sets.length = 0;
    this._disposables.length = 0;
  }
}
