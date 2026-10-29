/**
 * TerrainRenderer — one heightfield mesh for the whole world: a fine grid
 * over the site (the homestead parcel) growing geometrically out to the
 * regional landscape ~2 km away, drawn with UE's regional terrain shader
 * (meadow / dry grass, survey-grid farmland, far forest canopy, alpine
 * scree, rock on steep faces, snow line, shore mud, near-camera grass blades,
 * season tints and lying snow).
 *
 * From UE RegionalTerrainRenderer (mesh + material); roads, rail, farmsteads,
 * coast strip and far trees are separate modules here. Terrain-agnostic: it
 * draws any `TerrainSource`.
 */
import * as THREE from 'three';
import { regionLookFor, type RegionKind, type RegionLook } from './regionalLandscape';
import { CROP_SLOTS, cropSlotsFor } from './cropCalendar';
import { applyEdgeHaze } from './edgeHaze';
import { applyGroundSkyFill, ensureGroundTextures, groundUniforms } from '../materials/groundTextures';
import { seasonState } from '../season/seasonState';
import type { Quality } from '../WorldScene';

/** Anything the terrain mesh can draw. */
export interface TerrainSource {
  sample(x: number, z: number): { h: number; forest: number; field: number };
}

export interface TerrainBuildOptions {
  source: TerrainSource;
  kind: RegionKind;
  /** Center and half-size of the fine core (the site plus a margin); per axis or both. */
  cx: number;
  cz: number;
  core: number | { x: number; z: number };
  quality: Quality;
  /** Regional water line (lakes / reservoir) for the shore mud; null = none. */
  waterY?: number | null;
  /** Survey-grid origin for PLSS fields. */
  fieldOrigin?: [number, number];
  /** Grass color override (hex). */
  grass?: number;
}

/** Half-size of the modelled world around the center. */
export const R_MAX = 2000;
/** Fine-core cell size per quality (world units; 1 u ≈ 6 m). */
const CORE_CELL: Record<Quality, number> = { high: 0.35, medium: 0.5, low: 0.8 };
/** Cell growth per step outside the core. */
const GROWTH: Record<Quality, number> = { high: 1.055, medium: 1.07, low: 1.1 };

/** Axis: uniform `cell` within ±core of c, then cells growing by `growth` out to ±R_MAX. */
export function terrainAxis(c: number, core: number, cell: number, growth: number): number[] {
  const n = Math.ceil(core / cell);
  const out: number[] = [];
  for (let i = -n; i <= n; i++) out.push(c + i * cell);
  let d = n * cell, step = cell;
  const right: number[] = [];
  while (d < R_MAX) {
    step *= growth;
    d = Math.min(R_MAX, d + step);
    right.push(d);
  }
  return [...right.slice().reverse().map(v => c - v), ...out, ...right.map(v => c + v)];
}

/** 1×1 "no farmland" mask. */
const EMPTY_FARM = new THREE.DataTexture(new Uint8Array([0]), 1, 1, THREE.RedFormat, THREE.UnsignedByteType);
EMPTY_FARM.needsUpdate = true;

const TERRAIN_PARS = /* glsl */`
uniform sampler2D uGDetail;
uniform vec3 uGrass;
uniform vec3 uDryGrass;
uniform vec3 uForest;
uniform vec3 uRock;
uniform vec3 uScree;
uniform vec3 uSnow;
uniform float uTreeLine;
uniform float uSnowLine;
uniform float uDry;
uniform float uFarm;
uniform float uFieldSize;
uniform float uStoneWalls;
uniform float uWaterY;
uniform float uSeaY;
uniform float uSnowCover;
uniform float uFieldMode;
uniform float uPivot;
uniform float uLongLot;
uniform vec2 uFieldOrigin;
uniform vec3 uRiver;
uniform float uRockSlope;
uniform sampler2D uFarmTex;
uniform vec4 uFarmRect;
uniform vec4 uHoles[4];
varying vec3 vRPos;
varying vec3 vRNrm;
varying float vForest;
varying float vField;
float rHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float rNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(rHash(i), rHash(i + vec2(1.0, 0.0)), u.x), mix(rHash(i + vec2(0.0, 1.0)), rHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float rFbm(vec2 p) { return rNoise(p) * 0.55 + rNoise(p * 2.13 + 7.1) * 0.3 + rNoise(p * 4.7 + 3.3) * 0.15; }
// Triplanar sampling: no stretched streaks down steep faces
float rTri(vec3 p, vec3 w, float s) { return rFbm(p.zy * s) * w.x + rFbm(p.xz * s) * w.y + rFbm(p.xy * s) * w.z; }
float rTriN(vec3 p, vec3 w, float s) { return rNoise(p.zy * s) * w.x + rNoise(p.xz * s) * w.y + rNoise(p.xy * s) * w.z; }
// The region's crop mix on today's date (cropCalendar.ts): slot colors + cumulative shares
uniform vec3 uCropC[6];
uniform float uCropT[6];
vec3 rCrop(float h) {
  for (int i = 0; i < 5; i++) if (h < uCropT[i]) return uCropC[i];
  return uCropC[5];
}
`;

/**
 * Deep South: kudzu blankets the edges of the pine / hardwood woods along
 * roads and old fields (Mississippi / Georgia roadsides) — a smooth sheet of
 * bright yellow-green leaves draped over the edge trees in summer, brown
 * dead vines after the first frost.
 */
function o_kudzu(look: RegionLook): string {
  if (!look.kudzu) return '';
  return /* glsl */`{
          float kEdge = smoothstep(0.12, 0.45, fo) * (1.0 - smoothstep(0.55, 0.9, fo));
          float kPatch = smoothstep(0.45, 0.7, rNoise(xz * 0.018 + 3.7));
          vec3 kCol = mix(vec3(0.27, 0.42, 0.10), vec3(0.36, 0.28, 0.17), clamp(uSeaB.y + uSeaA.y * 0.6, 0.0, 1.0));
          col = mix(col, kCol * (0.85 + 0.3 * nb), kEdge * kPatch * 0.85);
        }`;
}

export function makeTerrainMaterial(look: RegionLook, waterY: number | null): { mat: THREE.MeshStandardMaterial; u: Record<string, THREE.IUniform> } {
  const lin = (hex: number) => new THREE.Color(hex);
  const u: Record<string, THREE.IUniform> = {
    uGrass: { value: lin(0x557a3a) },
    uDryGrass: { value: lin(look.dryGrass ?? 0x8c8152) },
    uForest: { value: lin(look.forest) },
    uRock: { value: lin(look.rock) },
    uScree: { value: lin(0x9a948a) },
    uSnow: { value: new THREE.Color(0.86, 0.89, 0.93) },
    uTreeLine: { value: look.treeLine },
    uSnowLine: { value: look.snowLine },
    uDry: { value: look.dry },
    uFarm: { value: look.farm },
    uFieldSize: { value: look.fieldSize },
    uStoneWalls: { value: look.stoneWalls ? 1 : 0 },
    uWaterY: { value: waterY ?? -1e6 },
    uSeaY: { value: -1e6 },
    uSnowCover: { value: 0 },
    uFieldMode: { value: look.fieldMode === 'plss' ? 0 : look.fieldMode === 'irregular' ? 1 : 2 },
    uPivot: { value: look.pivots ? 1 : 0 },
    uLongLot: { value: look.longLots ? 1 : 0 },
    uFieldOrigin: { value: new THREE.Vector2(0, 0) },
    uRiver: { value: new THREE.Vector3(0, 0, 0) },
    uRockSlope: { value: look.rockSlope },
    uFarmTex: { value: EMPTY_FARM },
    uFarmRect: { value: new THREE.Vector4(0, 0, 1, 0) },
    // openings cut clean through the ground (a floor hatch's stairwell under a house): x0, z0, x1, z1 in world units, up to four
    uHoles: { value: Array.from({ length: 4 }, () => new THREE.Vector4(0, 0, 0, 0)) },
    uCropC: { value: Array.from({ length: CROP_SLOTS }, () => new THREE.Vector3(0.3, 0.4, 0.15)) },
    uCropT: { value: Array.from({ length: CROP_SLOTS }, (_, i) => (i + 1) / CROP_SLOTS) },
  };
  ensureGroundTextures(); // r15: the shared grass-blade texture (sampled near the camera)
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.96, metalness: 0 });
  // the thawed ground goes to mud in mud season (season patch, uSeaD.z)
  mat.defines = { ...mat.defines, SEA_MUD: '' };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.uniforms.uGDetail = groundUniforms.uGDetail;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aForest;\nattribute float aField;\nvarying vec3 vRPos;\nvarying vec3 vRNrm;\nvarying float vForest;\nvarying float vField;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvRPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvRNrm = normalize(mat3(modelMatrix) * objectNormal);\nvForest = aForest;\nvField = aField;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + TERRAIN_PARS)
      .replace('#include <color_fragment>', /* glsl */`#include <color_fragment>
        for (int hi = 0; hi < 4; hi++) { vec4 hh = uHoles[hi]; if (hh.z > hh.x && vRPos.x > hh.x && vRPos.x < hh.z && vRPos.z > hh.y && vRPos.z < hh.w) discard; }
        vec3 N = normalize(vRNrm);
        float slope = 1.0 - N.y;
        float alt = vRPos.y;
        vec2 xz = vRPos.xz;
        vec3 tw = pow(abs(N), vec3(4.0));
        tw /= tw.x + tw.y + tw.z;
        float na = rTri(vRPos, tw, 0.021);
        float nb = rTri(vRPos, tw, 0.11);
        float nc = rTriN(vRPos, tw, 0.6);
        // Meadow: mottled location green, golden dry grass on SoCal-style slopes
        vec3 col = uGrass * (0.78 + 0.4 * na) * (0.92 + 0.16 * nb);
        float dry = uDry * smoothstep(0.25, 0.75, na * 0.8 + slope * 1.4 + 0.15 * nb);
        col = mix(col, uDryGrass * (0.85 + 0.25 * nb), dry);
        // Close-range ground texture (the town ground is this surface too, so
        // no flat untextured sheet shows near the camera): grass clumps, bare
        // soil patches and — on semi-arid ground — dark scrub / chaparral dots
        {
          float camG = length(vRPos - cameraPosition);
          float nearG = 1.0 - smoothstep(70.0, 260.0, camG);
          float flatG = 1.0 - smoothstep(0.25, 0.45, slope);
          if (nearG > 0.0) {
            float g1 = rTri(vRPos, tw, 1.4), g2 = rTri(vRPos, tw, 0.37);
            col *= mix(1.0, 0.8 + 0.34 * g1, nearG);
            col = mix(col, vec3(0.36, 0.29, 0.19) * (0.85 + 0.3 * g1), smoothstep(0.68, 0.8, g2) * 0.45 * nearG * flatG * (0.2 + 0.8 * uDry));
          }
          float sd = smoothstep(0.64, 0.72, rTri(vRPos, tw, 0.28) * 0.75 + rTri(vRPos, tw, 0.9) * 0.25);
          col = mix(col, uForest * (0.7 + 0.35 * nb), sd * uDry * 0.75 * flatG * (1.0 - smoothstep(250.0, 700.0, camG)));
        }
        // Farmland. The layout follows the region's real survey / field pattern:
        //   0 PLSS: N–S / E–W square-mile sections on the town grid, quarter
        //     sections split into 80 / 40-acre fields (center pivots in the West)
        //   1 irregular jittered fields (stone walls / hedgerows), long lots by the river
        //   2 valley orchards and row crops
        // v45: the town apron outside the built town is farmland too
        float fieldK = vField;
        if (uFarmRect.w > 0.5) {
          vec2 fuv = (xz - uFarmRect.xy) * uFarmRect.z;
          if (fuv.x > 0.0 && fuv.y > 0.0 && fuv.x < 1.0 && fuv.y < 1.0) fieldK = max(fieldK, texture2D(uFarmTex, fuv).r);
        }
        if (fieldK > 0.02 && uFarm > 0.0) {
          float camF = length(vRPos - cameraPosition);
          float rowsK = 1.0 - smoothstep(150.0, 520.0, camF);
          vec3 crop; float border; float rowC = 0.0; float hsh; float scrubK = 0.0;
          vec3 bcol = mix(vec3(0.12, 0.2, 0.08), vec3(0.42, 0.41, 0.38), uStoneWalls);
          if (uFieldMode < 0.5) {
            vec2 p = xz - uFieldOrigin;
            vec2 qi = floor(p / 135.0);
            vec2 qf = p - qi * 135.0;
            float hq = rHash(qi + 17.3);
            vec2 sn = hq < 0.3 ? vec2(1.0) : hq < 0.55 ? vec2(2.0, 1.0) : hq < 0.8 ? vec2(1.0, 2.0) : vec2(2.0);
            vec2 cl = 135.0 / sn;
            vec2 ci = floor(qf / cl);
            vec2 cf = qf - ci * cl;
            hsh = rHash(qi * 3.1 + ci + 5.0);
            crop = rCrop(hsh);
            rowC = cl.x >= cl.y ? cf.y : cf.x;
            float e = min(min(cf.x, cl.x - cf.x), min(cf.y, cl.y - cf.y));
            border = 1.0 - smoothstep(0.25, 0.8, e);
            bcol = vec3(0.26, 0.31, 0.15);
            if (uPivot > 0.5 && rHash(qi + 3.7) < 0.5) {
              float rr = length(qf - 67.5);
              float inC = 1.0 - smoothstep(63.0, 64.5, rr);
              vec3 pc = rCrop(rHash(qi + 9.1)) * (0.94 + 0.06 * sin(rr * 0.9) * rowsK);
              crop = mix(uDryGrass * (0.8 + 0.2 * nb), pc, inC);
              border = 0.6 * (1.0 - smoothstep(0.3, 1.0, abs(rr - 64.0)));
              rowC = 0.0;
            }
          } else if (uFieldMode < 1.5) {
            vec2 p = xz / uFieldSize;
            vec2 ip = floor(p), fp = fract(p);
            float d1 = 8.0, d2 = 8.0; vec2 id = ip;
            for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
              vec2 g = vec2(float(i), float(j));
              vec2 o = 0.15 + 0.7 * vec2(rHash(ip + g), rHash(ip + g + 31.7));
              vec2 r = g + o - fp;
              float d = dot(r, r);
              if (d < d1) { d2 = d1; d1 = d; id = ip + g; } else if (d < d2) { d2 = d; }
            }
            hsh = rHash(id);
            // the region's crop mix (hay / pasture are part of it, cropCalendar.ts)
            crop = rCrop(hsh);
            float e = (sqrt(d2) - sqrt(d1)) * 0.5 * uFieldSize;
            border = 1.0 - smoothstep(0.3, 0.9, e);
            if (uStoneWalls > 0.5) {
              // A New England stone wall is ~1 m of gray fieldstone in a strip
              // of scrub / saplings, not a 10 m pale band (it read as a ghost
              // road across the fields)
              border = 1.0 - smoothstep(0.05, 0.2, e);
              scrubK = 1.0 - smoothstep(0.2, 0.75, e);
            }
            float ang = hsh * 6.2832;
            rowC = dot(xz, vec2(cos(ang), sin(ang)));
            if (uLongLot > 0.5) {
              float rx = uRiver.x + uRiver.y * sin((xz.y - uRiver.z) / 300.0);
              float dr = abs(xz.x - rx);
              float ll = smoothstep(45.0, 60.0, dr) * (1.0 - smoothstep(220.0, 250.0, dr));
              if (ll > 0.0) {
                float sid = floor(xz.y / 10.0);
                float sf = xz.y - sid * 10.0;
                float hl = rHash(vec2(sid, sign(xz.x - rx) + 7.0));
                float lb = 1.0 - smoothstep(0.2, 0.6, min(sf, 10.0 - sf));
                crop = mix(crop, rCrop(hl), ll);
                border = mix(border, lb, ll);
                rowC = mix(rowC, sf * 0.9, ll);
              }
            }
          } else {
            vec2 sz = vec2(uFieldSize, uFieldSize * 0.7);
            vec2 ci = floor(xz / sz);
            vec2 cf = xz - ci * sz;
            hsh = rHash(ci + 2.0);
            float e = min(min(cf.x, sz.x - cf.x), min(cf.y, sz.y - cf.y));
            border = 1.0 - smoothstep(0.35, 0.9, e);
            bcol = vec3(0.42, 0.36, 0.26);
            if (hsh < 0.55) {
              // citrus / avocado orchard: tree rows on bare soil
              vec2 g = fract(xz / 1.5) - 0.5;
              float dotv = 1.0 - smoothstep(0.24, 0.38, length(g));
              vec3 soil = vec3(0.42, 0.35, 0.23);
              crop = mix(soil, vec3(0.14, 0.22, 0.09), mix(0.62, dotv, rowsK));
            } else {
              crop = rCrop(hsh);
              rowC = cf.x;
            }
          }
          crop *= 0.82 + 0.24 * nb;
          crop *= 1.0 - 0.08 * rowsK * step(0.001, abs(rowC)) * (0.5 + 0.5 * sin(rowC * 4.0));
          crop = mix(crop, vec3(0.14, 0.2, 0.09) * (0.8 + 0.4 * nb), scrubK * 0.7);
          crop = mix(crop, bcol * (0.75 + 0.5 * nb), border * 0.85);
          col = mix(col, crop, fieldK * uFarm * (1.0 - smoothstep(0.08, 0.2, slope)));
        }
        // r15: the campus lawn's grass-blade texture at eye level (two scales,
        // rotated against tiling) so the town ground never reads as a flat
        // painted sheet up close; fades out long before it could alias
        {
          float camB = length(vRPos - cameraPosition);
          float nearB = (1.0 - smoothstep(18.0, 70.0, camB)) * (1.0 - smoothstep(0.3, 0.5, slope));
          if (nearB > 0.0) {
            vec4 bd1 = texture2D(uGDetail, xz * 0.23);
            vec4 bd2 = texture2D(uGDetail, vec2(xz.x * 0.8 - xz.y * 0.6, xz.x * 0.6 + xz.y * 0.8) * 0.089 + 0.5);
            vec3 bdet = mix(bd1.rgb, bd2.rgb, 0.5) * 2.0;
            col *= mix(vec3(1.0), bdet, 0.75 * nearB);
          }
        }
        // Forest canopy as seen from afar (the instanced trees stand on it nearer in)
        float fo = smoothstep(0.3, 0.65, vForest + (nb - 0.5) * 0.35);
        // Near in, the instanced trees are the canopy and this is the forest
        // floor under them: an even, darker ground with only a subtle seasonal
        // shift — the speckled far-canopy colors there read as camouflage
        // blotches across the hillside (QA, Mega Campus by the station)
        float nearFo = 1.0 - smoothstep(110.0, 340.0, length(vRPos - cameraPosition));
        col = mix(col, uForest * mix((0.7 + 0.55 * nc) * (0.85 + 0.3 * na), 0.8 + 0.12 * nb, nearFo), fo);
        // Seasons: the deciduous share of the far canopy turns, then goes bare
        float decidFo = fo * ${(1 - look.evergreen).toFixed(3)};
        ${o_kudzu(look)}
        col = seaFarCanopy(col, decidFo * (1.0 - 0.85 * nearFo), xz);
        col *= mix(vec3(1.0), vec3(1.07, 0.97, 0.84), decidFo * nearFo * uSeaA.x * uSeaC.y * 0.6);
        // Lying snow mostly falls through the canopy: woods stay dark on white fields
        seaSnowMul = 1.0 - 0.8 * fo;
        // Alpine: scree and tundra above the tree line
        float alpine = smoothstep(uTreeLine - 25.0, uTreeLine + 25.0, alt + (na - 0.5) * 60.0);
        vec3 tundra = mix(vec3(0.20, 0.21, 0.12), uScree * 0.75, smoothstep(0.35, 0.7, na));
        col = mix(col, tundra * (0.8 + 0.3 * nb), alpine);
        // Rock on steep faces (and more of it up high)
        float rk = smoothstep(uRockSlope - 0.12 * alpine, uRockSlope + 0.15 - 0.12 * alpine, slope + (nb - 0.5) * 0.18);
        // rock: mottled, with faint bedding following the altitude
        float camDc = length(vRPos - cameraPosition);
        float nearK = 1.0 - smoothstep(250.0, 500.0, camDc);   // fine detail only where it resolves
        vec3 rockC = uRock * (0.68 + 0.5 * na) * (0.85 + 0.3 * mix(0.5, nc, nearK)) * (1.0 + nearK * 0.1 * sin(alt * 0.55 + na * 7.0));
        col = mix(col, rockC, rk);
        // Snow: above the snow line, sticking to all but the steepest faces
        // (lower on shaded north faces, patchy along its edge, shed only by near-vertical rock)
        // gullies / couloirs hold snow lower than the open faces
        // Continuous snowfields: a low-frequency snow line (no speckle), bare
        // rock only where the face is too steep to hold snow, and soft
        // fingers of snow running down gullies (elongated down-slope noise).
        float nlow = rFbm(xz * 0.004);
        float sl = uSnowLine + (nlow - 0.5) * 70.0 - 25.0 * max(0.0, -N.z);
        // a continuous blanket above the line; rock shows only on faces steeper than ~45°
        // far away the coarse grid exaggerates steepness: let snow hold on steeper faces there
        float sThr = mix(0.36, 0.62, smoothstep(500.0, 1300.0, camDc));
        float snow = smoothstep(sl - 30.0, sl + 30.0, alt) * (1.0 - smoothstep(sThr, sThr + 0.14, slope));
        snow = max(snow, uSnowCover * (1.0 - smoothstep(0.25, 0.55, slope)) * (1.0 - 0.8 * fo));
        col = mix(col, uSnow * (0.9 + 0.1 * nb), snow);
        // Damp shore and wet mud just above the water line
        float shore = 1.0 - smoothstep(0.0, 0.7, alt - uWaterY);
        col = mix(col, vec3(0.20, 0.19, 0.14), shore * 0.7);
        // Seabed (coastal maps): the ground under the ocean is sand fading to
        // dark sediment with depth — never fields or meadow showing through
        // the clear shallow water (eye test: lawn / field "slabs" in the SoCal sea)
        float subSea = smoothstep(uSeaY - 0.3, uSeaY - 1.5, alt);
        vec3 seabed = mix(vec3(0.52, 0.47, 0.36), vec3(0.16, 0.2, 0.22), smoothstep(uSeaY - 1.5, uSeaY - 9.0, alt)) * (0.85 + 0.25 * nb);
        col = mix(col, seabed, subSea);
        diffuseColor.rgb = col;`)
      .replace('#include <normal_fragment_maps>', /* glsl */`#include <normal_fragment_maps>
        {
          // Micro-relief the coarse far grid cannot carry: gullies, buttresses
          // and talus texture on steep ground, gentle undulation elsewhere.
          float camD = length(vRPos - cameraPosition);
          float bk = (0.25 + 1.6 * smoothstep(0.2, 0.5, slope)) * (1.0 - smoothstep(350.0, 900.0, camD)) * (1.0 - 0.85 * snow);
          float e = 1.6;
          #define RH(q) (rTri(q, tw, 0.045) + 0.4 * rTriN(q, tw, 0.17))
          float h0 = RH(vRPos);
          vec3 grad = vec3(RH(vRPos + vec3(e, 0.0, 0.0)) - h0, RH(vRPos + vec3(0.0, e, 0.0)) - h0, RH(vRPos + vec3(0.0, 0.0, e)) - h0) / e;
          vec3 bump = -(grad - N * dot(grad, N)) * bk * 5.0;
          normal = normalize(normal + (viewMatrix * vec4(bump, 0.0)).xyz);
        }`)
      .replace('#include <fog_fragment>', /* glsl */`#ifdef USE_FOG
          // Aerial perspective: thinner fog with distance so the ranges stay legible
          float rk2 = mix(1.0, 0.1, smoothstep(80.0, 420.0, vFogDepth));
          rk2 *= mix(1.0, 0.45, smoothstep(60.0, 300.0, vRPos.y)); // thinner air up high
          float rFog = 1.0 - exp(- fogDensity * fogDensity * rk2 * vFogDepth * vFogDepth);
          gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, rFog);
        #endif`);
  };
  mat.customProgramCacheKey = () => 'regional_terrain_v4_' + look.evergreen + (look.kudzu ? 'k' : '');
  applyGroundSkyFill(mat); // r15 dusk
  return { mat, u };
}


export class TerrainRenderer {
  private readonly _scene: THREE.Scene;
  private _mesh: THREE.Mesh | null = null;
  private _u: Record<string, THREE.IUniform> | null = null;
  private _look: RegionLook | null = null;
  private _kind: RegionKind = 'mountain';
  private _cropDoy = -1;
  private _cropEase = 0;
  private _gx: number[] = [];
  private _gz: number[] = [];
  private _gh: Float32Array | null = null;

  constructor(scene: THREE.Scene) {
    this._scene = scene;
  }

  get mesh(): THREE.Mesh | null { return this._mesh; }
  private _holes: Array<[number, number, number, number]> = [];
  /** Cut openings clean through the ground (world rects, at most four): you look down a floor hatch's stairwell through the house's floor. */
  setHoles(rects: ReadonlyArray<readonly [number, number, number, number]>): void {
    this._holes = rects.slice(0, 4).map(r => [r[0], r[1], r[2], r[3]]);
    this._applyHoles();
  }
  private _applyHoles(): void {
    const v = this._u?.['uHoles']?.value as THREE.Vector4[] | undefined;
    if (!v) return;
    v.forEach((q, i) => { const r = this._holes[i]; if (r) q.set(r[0], r[1], r[2], r[3]); else q.set(0, 0, 0, 0); });
  }
  private _opacity = 1;
  /** See-through ground (1 = solid): the underground view looks down through it. */
  setOpacity(k: number): void {
    this._opacity = k;
    const m = this._mesh?.material as THREE.MeshStandardMaterial | undefined;
    if (!m) return;
    const see = k < 0.999;
    if (m.transparent !== see) { m.transparent = see; m.needsUpdate = true; }
    m.opacity = k;
    m.depthWrite = !see;
    this._mesh!.receiveShadow = !see;
    this._mesh!.castShadow = false;
    this._mesh!.renderOrder = see ? 2 : 0;
  }

  build(o: TerrainBuildOptions): void {
    this.dispose();
    const look = regionLookFor(o.kind);
    this._look = look;
    this._kind = o.kind;
    this._cropDoy = -1;
    const core = typeof o.core === 'number' ? { x: o.core, z: o.core } : o.core;
    const xs = terrainAxis(o.cx, core.x, CORE_CELL[o.quality], GROWTH[o.quality]);
    const zs = terrainAxis(o.cz, core.z, CORE_CELL[o.quality], GROWTH[o.quality]);
    const NX = xs.length, NZ = zs.length;
    const pos = new Float32Array(NX * NZ * 3);
    const aF = new Float32Array(NX * NZ);
    const aD = new Float32Array(NX * NZ);
    for (let j = 0; j < NZ; j++) {
      for (let i = 0; i < NX; i++) {
        const x = xs[i], z = zs[j];
        const s = o.source.sample(x, z);
        const k = j * NX + i;
        pos[k * 3] = x; pos[k * 3 + 1] = s.h; pos[k * 3 + 2] = z;
        aF[k] = s.forest; aD[k] = s.field;
      }
    }
    this._gx = xs; this._gz = zs;
    this._gh = new Float32Array(NX * NZ);
    for (let k = 0; k < NX * NZ; k++) this._gh[k] = pos[k * 3 + 1];
    const idx = new Uint32Array((NX - 1) * (NZ - 1) * 6);
    let q = 0;
    for (let j = 0; j < NZ - 1; j++) {
      for (let i = 0; i < NX - 1; i++) {
        const a = j * NX + i, b = a + 1, c = a + NX, d = c + 1;
        const ya = pos[a * 3 + 1], yb = pos[b * 3 + 1], yc = pos[c * 3 + 1], yd = pos[d * 3 + 1];
        if (Math.abs(ya - yd) <= Math.abs(yb - yc)) { idx[q++] = a; idx[q++] = c; idx[q++] = d; idx[q++] = a; idx[q++] = d; idx[q++] = b; }
        else { idx[q++] = a; idx[q++] = c; idx[q++] = b; idx[q++] = b; idx[q++] = c; idx[q++] = d; }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aForest', new THREE.BufferAttribute(aF, 1));
    geo.setAttribute('aField', new THREE.BufferAttribute(aD, 1));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    const { mat, u } = makeTerrainMaterial(look, o.waterY ?? null);
    const [fox, foz] = o.fieldOrigin ?? [o.cx, o.cz];
    (u['uFieldOrigin'].value as THREE.Vector2).set(fox, foz);
    this._u = u;
    this._applyHoles();
    const g = (u['uGrass'].value as THREE.Color).setHex(o.grass ?? look.grass ?? 0x557a3a);
    const gray = (g.r + g.g + g.b) / 3;
    g.lerp(new THREE.Color(gray, gray, gray), 0.18).multiplyScalar(0.8);
    applyEdgeHaze(mat, [o.cx, o.cz], R_MAX * 0.72, R_MAX * 0.995);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'terrain';
    mesh.userData = { type: 'terrain' };
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    this._scene.add(mesh);
    this._mesh = mesh;
    if (this._opacity < 1) this.setOpacity(this._opacity);
    this.update();
  }

  /**
   * Re-sample the mesh inside a world rect (after the ground was graded under
   * a new building): positions, cover attributes, normals and surfaceAt.
   */
  refresh(source: TerrainSource, x0: number, z0: number, x1: number, z1: number): void {
    const mesh = this._mesh, H = this._gh;
    if (!mesh || !H) return;
    const geo = mesh.geometry;
    const pos = geo.getAttribute('position') as THREE.BufferAttribute;
    const aF = geo.getAttribute('aForest') as THREE.BufferAttribute;
    const aD = geo.getAttribute('aField') as THREE.BufferAttribute;
    const xs = this._gx, zs = this._gz, NX = xs.length;
    const i0 = Math.max(0, xs.findIndex(v => v >= x0) - 1), i1 = xs.findIndex(v => v > x1);
    const j0 = Math.max(0, zs.findIndex(v => v >= z0) - 1), j1 = zs.findIndex(v => v > z1);
    for (let j = j0; j <= (j1 < 0 ? zs.length - 1 : j1); j++) {
      for (let i = i0; i <= (i1 < 0 ? NX - 1 : i1); i++) {
        const k = j * NX + i;
        const sm = source.sample(xs[i], zs[j]);
        pos.setY(k, sm.h);
        aF.setX(k, sm.forest); aD.setX(k, sm.field);
        H[k] = sm.h;
      }
    }
    pos.needsUpdate = aF.needsUpdate = aD.needsUpdate = true;
    geo.computeVertexNormals();
  }

  /**
   * Height of the drawn surface at (x, z): the same two triangles per cell
   * the mesh uses, so anything draped on it sits exactly on the ground.
   */
  surfaceAt(x: number, z: number): number {
    const xs = this._gx, zs = this._gz, H = this._gh;
    if (!H || xs.length < 2) return 0;
    const find = (a: number[], v: number): number => {
      let lo = 0, hi = a.length - 2;
      if (v <= a[0]) return 0;
      if (v >= a[a.length - 1]) return a.length - 2;
      while (lo < hi) { const m = (lo + hi + 1) >> 1; if (a[m] <= v) lo = m; else hi = m - 1; }
      return lo;
    };
    const i = find(xs, x), j = find(zs, z), NX = xs.length;
    const u = Math.max(0, Math.min(1, (x - xs[i]) / (xs[i + 1] - xs[i])));
    const v = Math.max(0, Math.min(1, (z - zs[j]) / (zs[j + 1] - zs[j])));
    const ya = H[j * NX + i], yb = H[j * NX + i + 1], yc = H[(j + 1) * NX + i], yd = H[(j + 1) * NX + i + 1];
    if (Math.abs(ya - yd) <= Math.abs(yb - yc)) {
      return v >= u ? ya + v * (yc - ya) + u * (yd - yc) : ya + u * (yb - ya) + v * (yd - yb);
    }
    return u + v <= 1 ? ya + u * (yb - ya) + v * (yc - ya) : yd + (1 - u) * (yc - yd) + (1 - v) * (yb - yd);
  }

  /**
   * Seasons (seasonState, eased per frame): the snow line drops toward the
   * winter line as it gets cold, open ground takes the season's snow cover
   * where the region gets lying snow, and crops follow the crop calendar.
   */
  update(): void {
    const u = this._u, look = this._look;
    if (!u || !look) return;
    const p = seasonState.params;
    const hi = Math.min(look.snowLine, 2000);
    const lo = Math.min(look.snowLineWinter, 2000);
    u['uSnowLine'].value = hi + (lo - hi) * p.cold;
    u['uSnowCover'].value = look.snowLineWinter < 20 ? Math.min(0.9, p.snow) : 0;
    const doy = Math.round(seasonState.doy);
    const cc = u['uCropC'].value as THREE.Vector3[], ct = u['uCropT'].value as number[];
    if (doy !== this._cropDoy || this._cropEase > 0) {
      const snap = this._cropDoy < 0;
      if (doy !== this._cropDoy) this._cropEase = 40;
      this._cropDoy = doy;
      this._cropEase--;
      const slots = cropSlotsFor(this._kind, doy);
      const k = snap ? 1 : 0.12;
      for (let i = 0; i < CROP_SLOTS; i++) {
        const [r, g, b] = slots.colors[i];
        cc[i].x += (r - cc[i].x) * k; cc[i].y += (g - cc[i].y) * k; cc[i].z += (b - cc[i].z) * k;
        ct[i] = slots.cum[i];
      }
    }
  }

  dispose(): void {
    if (this._mesh) {
      this._scene.remove(this._mesh);
      this._mesh.geometry.dispose();
      (this._mesh.material as THREE.Material).dispose();
      this._mesh = null;
    }
    this._u = null;
    this._gh = null;
  }
}
