/**
 * figureKit.ts
 * The one person model every crowd layer draws (UE: campus walkers,
 * townspeople, event-day people; here the family and, later, newcomers):
 * a merged low-poly figure whose vertices carry a part +
 * limb id, and a MeshStandardMaterial patch that colours each part from
 * per-instance attributes, swings arms and legs about the shoulder / hip
 * pivots and poses the figure.
 *
 * Per-instance attributes:
 *   aShirt / aPants / aSkin / aHair / aPack  (vec3 sRGB→linear colours)
 *   aStyle  (pose, hasPack, longHair, shoeTone)
 *   aWear   (coat 0 none / 1 hip / 2 mid-thigh / 3 gown, shorts, hat code, idle phase)
 *   aAnim   (walkPhase, swingAmp)
 *
 * Poses (aStyle.x): 0 stand / walk, 1 bench / chair, 2 sitting on the lawn,
 * 3 bike, 4 scooter, 5 carrying a box in both arms (move-in), 6 one arm
 * raised forward (throwing a frisbee, pointing, busking), 7 kneeling with
 * both hands down (planting on Service Day), 8 sitting cross-legged on the
 * grass (outdoor class: shins tucked, knees out, hands on the knees).
 *
 * Hat code (aWear.z): 0 none (hair), 1…HATS.length knit hat palette index + 1,
 * HAT_MORTARBOARD a graduation cap (black skull cap + square board).
 *
 * Scale (SCALE v2): authored at 2× (0.56 tall); instances draw it at
 * FIG_SCALE = 0.5 → ≈ 0.28 units ≈ 1.7 m. Never cast shadows (CLAUDE.md rule 6).
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { HATS, MORTARBOARD, type Wear } from './crowdWear';

/** Figure geometry is authored 2× (0.56 tall); instances draw it at half size (≈0.28 ≈ 1.7 m). */
export const FIG_SCALE = 0.5;

// Figure dimensions (figure units = 2× world, feet at y = 0, facing +Z)
export const HIP_Y      = 0.265;
export const SHOULDER_Y = 0.438;
/** Seated hip height (authored 2×) — CampusPropsRenderer bench seat top is ≈ 0.075 (= 0.15 × FIG_SCALE). */
export const SEAT_Y     = 0.17;
/** Lawn sitters: hips just above the grass. */
const LAWN_Y     = 0.04;
/** Kneeling: hips over the heels. */
const KNEEL_Y    = 0.13;
/** Bike saddle / scooter deck heights (figure units). */
export const SADDLE_Y   = 0.3;
const DECK_Y     = 0.045;

/** Figure poses (aStyle.x). */
export const FIG_POSE = { STAND: 0, BENCH: 1, LAWN: 2, BIKE: 3, SCOOTER: 4, CARRY: 5, REACH: 6, KNEEL: 7, CROSS: 8 } as const;

/** Hat code for a graduation mortarboard (aWear.z). */
export const HAT_MORTARBOARD = 20;

// Part ids
const P_PACK = 5, P_LONGHAIR = 6;
// Umbrella (collapsed per-instance unless it is raining — see uRain)
const P_UMB_CANOPY = 7, P_UMB_SHAFT = 8;
/** Mortarboard board (collapsed unless the hat code is HAT_MORTARBOARD). */
const P_BOARD = 9;
/** Cardboard box held in both arms (collapsed unless the pose is CARRY). */
const P_BOX = 10;
/** Part / limb packing: aPL = part + (limb + 2) × PL_K. */
const PL_K = 16;
/** Raised arm angle (rad) for walkers holding an umbrella. */
const UMB_ARM = -0.75;
const L_NONE = 0;

/** Shared uniforms: every figure layer puts umbrellas up together and idles on one clock. */
export const FIGURE_UNIFORMS = { uRain: { value: 0 }, uTime: { value: 0 } };

/** Build the merged figure geometry with the aPL (part + limb) vertex attribute. */
export function buildFigureGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const add = (g: THREE.BufferGeometry, part: number, limb: number = L_NONE): void => {
    const ng = g.index ? g.toNonIndexed() : g;
    if (ng !== g) g.dispose();
    ng.deleteAttribute('uv');
    const n = ng.attributes.position.count;
    // part + limb packed into one attribute (vertex attribute slots are scarce: 16 max)
    ng.setAttribute('aPL', new THREE.BufferAttribute(new Float32Array(n).fill(part + (limb + 2) * PL_K), 1));
    parts.push(ng);
  };
  const box = (w: number, h: number, d: number, x: number, y: number, z: number): THREE.BufferGeometry => {
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate(x, y, z);
    return g;
  };
  const P_SKIN = 0, P_HAIR = 1, P_SHIRT = 2, P_PANTS = 3, P_SHOE = 4;

  // Legs (trousers) hanging from the hip pivot, slightly tapered
  for (const side of [1, -1]) {
    const leg = box(0.044, HIP_Y - 0.02, 0.048, side * 0.029, (HIP_Y + 0.02) / 2, 0);
    const lp = leg.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < lp.count; i++) if (lp.getY(i) < 0.1) { lp.setX(i, lp.getX(i) * 0.93 + side * 0.001); lp.setZ(i, lp.getZ(i) * 0.85); }
    add(leg, P_PANTS, side);
    // Shoe: toe pokes forward
    add(box(0.044, 0.022, 0.07, side * 0.029, 0.011, 0.01), P_SHOE, side);
  }
  // Torso: shoulders wider than waist
  const torso = box(0.108, SHOULDER_Y + 0.012 - HIP_Y + 0.012, 0.064, 0, (SHOULDER_Y + 0.012 + HIP_Y - 0.012) / 2, 0);
  const tp = torso.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < tp.count; i++) if (tp.getY(i) < 0.35) tp.setX(i, tp.getX(i) * 0.84);
  add(torso, P_SHIRT);
  // Arms (sleeves) + hands, hinged at the shoulder
  for (const side of [1, -1]) {
    add(box(0.028, 0.15, 0.034, side * 0.071, SHOULDER_Y - 0.075, 0), P_SHIRT, side * 2);
    add(box(0.024, 0.036, 0.028, side * 0.071, SHOULDER_Y - 0.168, 0), P_SKIN, side * 2);
  }
  // Head (elongated low-poly sphere; its lower pole doubles as the neck)
  const head = new THREE.SphereGeometry(0.036, 6, 4);
  head.scale(0.92, 1.22, 1.0);
  head.translate(0, SHOULDER_Y + 0.066, 0.002);
  add(head, P_SKIN);
  // Hair cap (or knit hat): upper/back shell slightly larger than the head
  const hair = new THREE.SphereGeometry(0.0395, 6, 3, 0, Math.PI * 2, 0, Math.PI * 0.52);
  hair.scale(0.95, 1.2, 1.03);
  hair.rotateX(-0.35);
  hair.translate(0, SHOULDER_Y + 0.072, -0.004);
  add(hair, P_HAIR);
  // Long hair (collapsed per-instance when unused)
  add(box(0.066, 0.075, 0.018, 0, SHOULDER_Y + 0.03, -0.034), P_LONGHAIR);
  // Backpack (collapsed per-instance when unused)
  add(box(0.086, 0.12, 0.044, 0, SHOULDER_Y - 0.075, -0.054), P_PACK);
  // Umbrella held in the raised +x hand: slanted shaft + 8-panel canopy
  // over the head. Hand position = shoulder-pivoted hand at UMB_ARM.
  const hy = SHOULDER_Y - 0.168 * Math.cos(UMB_ARM);
  const hz = -0.168 * Math.sin(UMB_ARM);
  const hand = new THREE.Vector3(0.071, hy, hz);
  const top = new THREE.Vector3(0.035, 0.665, 0.055);
  const shaftDir = top.clone().sub(hand);
  const shaft = new THREE.CylinderGeometry(0.006, 0.006, shaftDir.length() + 0.05, 4);
  shaft.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), shaftDir.clone().normalize()));
  shaft.translate((hand.x + top.x) / 2, (hand.y + top.y) / 2, (hand.z + top.z) / 2);
  add(shaft, P_UMB_SHAFT);
  const canopy = new THREE.ConeGeometry(0.17, 0.075, 8, 1, false);
  canopy.translate(top.x, top.y - 0.03, top.z);
  add(canopy, P_UMB_CANOPY);
  // Mortarboard: a 24 cm square board on top of the cap, turned a little
  const board = new THREE.BoxGeometry(0.1, 0.008, 0.1);
  board.rotateY(0.2);
  board.translate(0, SHOULDER_Y + 0.118, -0.004);
  add(board, P_BOARD);
  // Cardboard box held at the chest (arms reach forward round it)
  add(box(0.12, 0.085, 0.09, 0, SHOULDER_Y - 0.13, 0.105), P_BOX);

  const g = mergeGeometries(parts)!;
  parts.forEach(p => p.dispose());
  g.computeBoundingSphere();
  return g;
}

/** The figure's per-instance attribute names and sizes (source order). */
export const FIGURE_ATTRS: ReadonlyArray<readonly [string, number]> = [
  ['aShirt', 3], ['aPants', 3], ['aSkin', 3], ['aHair', 3], ['aPack', 3],
  ['aStyle', 4], ['aWear', 4], ['aAnim', 2],
];

/**
 * Vertex-shader skeleton: limbs rotate about hip / shoulder pivots by the
 * per-instance walk phase; poses (see FIG_POSE). Standing people idle
 * (weight shift, head turns, a hand gesture now and then). Colour is picked
 * per part from the instance palette; coats / gowns / shorts are cut in the
 * fragment shader at a figure height.
 */
export function injectFigureShader(mat: THREE.MeshStandardMaterial): void {
  const f = (v: number) => v.toFixed(3);
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uRain = FIGURE_UNIFORMS.uRain;
    shader.uniforms.uTime = FIGURE_UNIFORMS.uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        uniform float uRain;
        uniform float uTime;
        attribute float aPL;
        attribute vec3 aShirt;
        attribute vec3 aPants;
        attribute vec3 aSkin;
        attribute vec3 aHair;
        attribute vec3 aPack;
        attribute vec4 aStyle;
        attribute vec4 aWear;
        attribute vec2 aAnim;
        varying vec3 vAgCol;
        varying vec3 vAgAlt;
        varying vec2 vAgCut;
        varying float vAgY;
        vec3 agRot(vec3 p, float a) {
          float c = cos(a), s = sin(a);
          return vec3(p.x, p.y * c - p.z * s, p.y * s + p.z * c);
        }
        vec3 agHatColor(float k) {
          ${HATS.map((c, i) => `if (k < ${(i + 1.5).toFixed(1)}) return vec3(${new THREE.Color(c).toArray().map(v => v.toFixed(3)).join(', ')});`).join('\n          ')}
          return vec3(0.025);
        }
        vec3 agYaw(vec3 p, float a) {
          float c = cos(a), s = sin(a);
          return vec3(p.x * c + p.z * s, p.y, -p.x * s + p.z * c);
        }`)
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
        float aLimb = floor(aPL / ${PL_K.toFixed(1)} + 0.001) - 2.0;
        float aPart = aPL - (aLimb + 2.0) * ${PL_K.toFixed(1)};
        float agPose = aStyle.x;
        float agBench = step(0.5, agPose) * step(agPose, 1.5);
        float agLawn = step(1.5, agPose) * step(agPose, 2.5);
        float agBike = step(2.5, agPose) * step(agPose, 3.5);
        float agScoot = step(3.5, agPose) * step(agPose, 4.5);
        float agCarry = step(4.5, agPose) * step(agPose, 5.5);
        float agReach = step(5.5, agPose) * step(agPose, 6.5);
        float agKneel = step(6.5, agPose) * step(agPose, 7.5);
        float agCross = step(7.5, agPose);
        float agSit = agBench + agLawn + agCross;
        float agSide = sign(aLimb);
        float agIsArm = step(1.5, abs(aLimb));
        float agIsLeg = step(0.5, abs(aLimb)) * (1.0 - agIsArm);
        float agSwing = sin(aAnim.x) * aAnim.y;
        float agAng = agIsLeg * agSide * agSwing - agIsArm * agSide * agSwing * 0.85;
        // Joggers (large swing): forearms bent forward
        agAng -= agIsArm * smoothstep(0.6, 0.85, aAnim.y) * 0.55;
        // Idle (standing still): occasional hand gesture with the +x arm
        float agStill = (1.0 - step(0.01, aAnim.y)) * (1.0 - agSit) * (1.0 - agBike - agScoot - agKneel);
        float agT = uTime + aWear.w * 7.0;
        float agGest = pow(max(0.0, sin(agT * 0.55 + aWear.w * 3.1)), 8.0);
        agAng -= agStill * step(1.5, aLimb) * agGest * 0.75 * (1.0 - agReach);
        // Bench / chair: legs forward and down so the feet reach the ground
        // in front of a 45 cm seat (no knee joint: a straight leg at ~48°), forearms on the lap
        agAng = mix(agAng, agIsLeg * -0.85 + agIsArm * -0.55, agBench);
        // Lawn: legs out in front, arms back propping the body up
        agAng = mix(agAng, agIsLeg * -1.45 + agIsArm * 0.55, agLawn);
        // Bike: pedalling legs, hands on the bars
        agAng = mix(agAng, agIsLeg * (-0.95 + agSide * sin(aAnim.x) * 0.45) + agIsArm * -1.0, agBike);
        // Scooter: standing, one foot back, hands on the bar
        agAng = mix(agAng, agIsLeg * (agSide > 0.0 ? 0.0 : 0.28) + agIsArm * -0.92, agScoot);
        // Carrying a box: both forearms forward round it (legs keep walking)
        agAng = mix(agAng, agIsLeg * agAng + agIsArm * -1.12, agCarry);
        // Reach: +x arm swings forward / up (frisbee throw, pointing, strumming), the other hangs
        float agThrow = 0.5 + 0.5 * sin(agT * 1.7);
        agAng = mix(agAng, agIsLeg * agAng + agIsArm * (aLimb > 0.0 ? -0.9 - 0.8 * agThrow : -0.25), agReach);
        // Kneeling: upright thighs, the hips dropped so the shins sink out of
        // sight below the knees (reads as kneeling at any angle); hands down in front
        agAng = mix(agAng, agIsLeg * 0.12 + agIsArm * (-0.7 + 0.25 * sin(agT * 2.1 + agSide)), agKneel);
        // Cross-legged: (tucked, splayed) legs forward along the grass, hands on the knees, a slight lean
        agAng = mix(agAng, agIsLeg * -1.52 + agIsArm * -0.45, agCross);
        // Rain: most walkers put up an umbrella (+x arm raised, held still)
        float agUmbH = fract(dot(aShirt, vec3(7.13, 3.17, 1.71)) + dot(aPants, vec3(2.31, 5.93, 1.13)) + aWear.w * 3.7);
        float agUmb = (1.0 - agSit) * (1.0 - agBike - agScoot - agCarry - agReach - agKneel) * step(0.02, uRain) * step(agUmbH, min(uRain * 1.6, 0.8));
        agAng = mix(agAng, ${f(UMB_ARM)}, agUmb * step(1.5, aLimb));
        float agPivot = agIsArm > 0.5 ? ${f(SHOULDER_Y)} : ${f(HIP_Y)};
        // Head turns while standing / sitting (head = skin / hair above the neck)
        float agBoardPart = step(abs(aPart - ${P_BOARD.toFixed(1)}), 0.5);
        float agHead = step(${f(SHOULDER_Y + 0.02)}, position.y) * max(1.0 - step(6.5, aPart), agBoardPart) * step(abs(aLimb), 0.5);
        float agYawA = agHead * (agStill + agSit) * (sin(agT * 0.37) * 0.55 + sin(agT * 0.91 + 1.3) * 0.2);
        objectNormal = agYaw(agRot(objectNormal, agAng), agYawA);`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vAgY = position.y;
        // cross-legged: shins tucked under (half-length legs), knees out to the sides
        if (agCross > 0.5 && agIsLeg > 0.5) {
          transformed.y = ${f(HIP_Y)} - (${f(HIP_Y)} - transformed.y) * 0.5;
          transformed.x *= 1.9;
        }
        transformed = agRot(transformed - vec3(0.0, agPivot, 0.0), agAng) + vec3(0.0, agPivot, 0.0);
        transformed = agYaw(transformed, agYawA);
        // Collapse optional parts when unused
        if (abs(aPart - ${P_PACK.toFixed(1)}) < 0.5 && aStyle.y < 0.5) transformed = vec3(0.0, 0.35, 0.0);
        if (abs(aPart - ${P_LONGHAIR.toFixed(1)}) < 0.5 && aStyle.z < 0.5) transformed = vec3(0.0, 0.45, 0.0);
        if ((abs(aPart - ${P_UMB_CANOPY.toFixed(1)}) < 0.5 || abs(aPart - ${P_UMB_SHAFT.toFixed(1)}) < 0.5) && agUmb < 0.5) transformed = vec3(0.0, 0.45, 0.0);
        if (agBoardPart > 0.5 && aWear.z < ${(HAT_MORTARBOARD - 0.5).toFixed(1)}) transformed = vec3(0.0, 0.45, 0.0);
        if (abs(aPart - ${P_BOX.toFixed(1)}) < 0.5 && agCarry < 0.5) transformed = vec3(0.0, 0.35, 0.0);
        // Walking bob; seat drops; rider lifts
        transformed.y += abs(cos(aAnim.x)) * aAnim.y * 0.012 * (1.0 - agBike);
        transformed.y -= agBench * ${f(HIP_Y - SEAT_Y)};
        transformed.z -= agBench * 0.02;
        transformed.y -= agLawn * ${f(HIP_Y - LAWN_Y)};
        transformed.z -= agLawn * 0.03;
        transformed.y -= agKneel * ${f(HIP_Y - KNEEL_Y)};
        transformed.y -= agCross * ${f(HIP_Y - LAWN_Y - 0.01)};
        transformed.z -= agCross * 0.015;
        transformed.y += agBike * ${f(SADDLE_Y - HIP_Y)} + agScoot * ${f(DECK_Y)};
        transformed.z -= agBike * 0.07;
        // Weight shift while standing around
        transformed.x += agStill * sin(agT * 0.8) * transformed.y * 0.035;
        // Per-part colour (hat replaces the hair cap)
        vec3 shoeC = mix(vec3(0.08), vec3(0.86), step(0.55, aStyle.w));
        vec3 hairC = aWear.z > 0.5 ? agHatColor(aWear.z) : aHair;
        vAgCol = aPart < 0.5 ? aSkin
               : aPart < 1.5 ? hairC
               : aPart < 2.5 ? aShirt
               : aPart < 3.5 ? aPants
               : aPart < 4.5 ? shoeC
               : aPart < 5.5 ? aPack
               : aPart < 6.5 ? aHair
               : aPart < 7.5 ? (agUmbH < 0.42 ? vec3(0.035)
                              : agUmbH < 0.54 ? vec3(0.05, 0.08, 0.22)
                              : agUmbH < 0.64 ? vec3(0.45, 0.04, 0.05)
                              : agUmbH < 0.72 ? vec3(0.06, 0.2, 0.12)
                              : vec3(0.75, 0.55, 0.06))
               : aPart < 8.5 ? vec3(0.06)
               : aPart < 9.5 ? vec3(0.02)
               : vec3(0.52, 0.38, 0.22);
        // Trousers: coat / gown hem (shirt colour above) / shorts (skin below the knee)
        float agPants = step(2.5, aPart) * step(aPart, 3.5);
        vAgAlt = aWear.x > 0.5 ? aShirt : aSkin;
        vAgCut = agPants > 0.5
          ? vec2(aWear.x > 2.5 ? 0.035 : aWear.x > 1.5 ? 0.16 : aWear.x > 0.5 ? 0.235 : 9.0, aWear.y > 0.5 ? 0.135 : -9.0)
          : vec2(9.0, -9.0);`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vAgCol;
        varying vec3 vAgAlt;
        varying vec2 vAgCut;
        varying float vAgY;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        diffuseColor.rgb *= (vAgY > vAgCut.x || (vAgY < vAgCut.y && vAgY > 0.024)) ? vAgAlt : vAgCol;`);
  };
  mat.customProgramCacheKey = () => 'agent-figure-v5';
}

export function makeFigureMaterial(): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.82, metalness: 0 });
  injectFigureShader(m);
  return m;
}

/** One person to draw (world space). */
export interface FigurePose {
  x: number; y: number; z: number;
  rot: number;
  scale: number;
  pose: number;
  /** Walk phase (rad). */
  phase: number;
  /** Limb swing amplitude (0 still, 0.5 walking). */
  amp: number;
}

/**
 * A fixed-capacity instanced layer of figures, written directly per instance
 * (no frustum compaction: event and town layers are small). One draw call.
 * Each layer owns its figure geometry (instanced attributes live on the
 * geometry); the shader program is shared through the material cache key.
 */
export class FigureLayer {
  readonly mesh: THREE.InstancedMesh;
  private readonly _geo: THREE.BufferGeometry;
  private readonly _mat: THREE.MeshStandardMaterial;
  private readonly _attrs: Record<string, THREE.InstancedBufferAttribute> = {};
  private readonly _m = new THREE.Matrix4();
  private readonly _p = new THREE.Vector3();
  private readonly _q = new THREE.Quaternion();
  private readonly _s = new THREE.Vector3();
  private readonly _up = new THREE.Vector3(0, 1, 0);
  private readonly _c = new THREE.Color();
  private _scene: THREE.Scene | null;
  readonly capacity: number;

  constructor(scene: THREE.Scene, capacity: number, name: string) {
    this._scene = scene;
    this.capacity = Math.max(1, capacity);
    this._geo = buildFigureGeometry();
    for (const [n, size] of FIGURE_ATTRS) {
      const a = new THREE.InstancedBufferAttribute(new Float32Array(this.capacity * size), size);
      a.setUsage(THREE.DynamicDrawUsage);
      this._geo.setAttribute(n, a);
      this._attrs[n] = a;
    }
    this._mat = makeFigureMaterial();
    this.mesh = new THREE.InstancedMesh(this._geo, this._mat, this.capacity);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.castShadow = false;   // perf rule: never cast agent shadows
    this.mesh.receiveShadow = false;
    this.mesh.frustumCulled = false;
    this.mesh.name = name;
    this.mesh.userData = { type: name, noSSAO: true };
    scene.add(this.mesh);
  }

  /** Dress instance i. */
  setWear(i: number, w: Wear): void {
    const A = this._attrs;
    this._col(A.aShirt, i, w.shirt); this._col(A.aPants, i, w.pants); this._col(A.aSkin, i, w.skin);
    this._col(A.aHair, i, w.hair); this._col(A.aPack, i, w.pack);
    const st = A.aStyle.array as Float32Array;
    st[i * 4 + 1] = w.hasPack ? 1 : 0; st[i * 4 + 2] = w.longHair ? 1 : 0; st[i * 4 + 3] = w.shoe;
    const we = A.aWear.array as Float32Array;
    we[i * 4] = w.coat;
    we[i * 4 + 1] = w.shorts ? 1 : 0;
    we[i * 4 + 2] = w.hat === HAT_MORTARBOARD_HEX ? HAT_MORTARBOARD : w.hat >= 0 ? HATS.indexOf(w.hat) + 1 : 0;
    we[i * 4 + 3] = (i * 0.6180339) % 1;
  }

  /** Place instance i. */
  setPose(i: number, p: FigurePose): void {
    this._q.setFromAxisAngle(this._up, p.rot);
    this._m.compose(this._p.set(p.x, p.y, p.z), this._q, this._s.setScalar(p.scale * FIG_SCALE));
    this._m.toArray(this.mesh.instanceMatrix.array as Float32Array, i * 16);
    const st = this._attrs.aStyle.array as Float32Array;
    st[i * 4] = p.pose;
    const an = this._attrs.aAnim.array as Float32Array;
    an[i * 2] = p.phase; an[i * 2 + 1] = p.amp;
  }

  /** Draw the first n instances; flag what changed for upload. */
  commit(n: number, wearChanged: boolean): void {
    const k = Math.max(0, Math.min(this.capacity, n));
    this.mesh.count = k;
    this.mesh.visible = k > 0;
    const im = this.mesh.instanceMatrix;
    im.clearUpdateRanges(); im.addUpdateRange(0, k * 16); im.needsUpdate = true;
    for (const name of ['aStyle', 'aAnim'] as const) {
      const a = this._attrs[name];
      a.clearUpdateRanges(); a.addUpdateRange(0, k * a.itemSize); a.needsUpdate = true;
    }
    if (wearChanged) {
      for (const name of ['aShirt', 'aPants', 'aSkin', 'aHair', 'aPack', 'aWear'] as const) {
        const a = this._attrs[name];
        a.clearUpdateRanges(); a.addUpdateRange(0, k * a.itemSize); a.needsUpdate = true;
      }
    }
  }

  dispose(): void {
    this._scene?.remove(this.mesh);
    this._scene = null;
    this._geo.dispose();
    this._mat.dispose();
    this.mesh.dispose();
  }

  private _col(a: THREE.InstancedBufferAttribute, i: number, hex: number): void {
    this._c.setHex(hex);
    a.setXYZ(i, this._c.r, this._c.g, this._c.b);
  }
}

/** Sentinel `Wear.hat` value for a mortarboard (crowdWear persona 'graduate'). */
export const HAT_MORTARBOARD_HEX = MORTARBOARD;
