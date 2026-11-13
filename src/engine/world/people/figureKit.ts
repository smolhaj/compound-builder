/**
 * figureKit.ts
 * The one person model every crowd layer draws (UE: campus walkers,
 * townspeople, event-day people; here the family and, later, newcomers):
 * a merged low-poly figure whose vertices carry a part +
 * limb id, and a MeshStandardMaterial patch that colors each part from
 * per-instance attributes, swings arms and legs about the shoulder / hip
 * pivots and poses the figure.
 *
 * Per-instance attributes (the last, aGear, is the people pass: hair / headwear / gear flags packed in x, build in y, head look yaw in z, ground slope in w):
 *   aShirt / aPants / aSkin / aHair / aPack  (vec3 sRGB→linear colors)
 *   aStyle  (pose, hasPack, longHair, shoeTone)
 *   aWear   (coat 0 none / 1 hip / 2 mid-thigh / 3 gown, shorts, hat code, idle phase)
 *   aAnim   (walkPhase, swingAmp, tool)
 *
 * Poses (aStyle.x): 0 stand / walk, 1 bench / chair, 2 sitting on the lawn,
 * 3 bike, 4 scooter, 5 carrying a box in both arms (move-in), 6 one arm
 * raised forward (throwing a frisbee, pointing, busking), 7 kneeling with
 * both hands down (planting on Service Day), 8 sitting cross-legged on the
 * grass (outdoor class: shins tucked, knees out, hands on the knees).
 *
 * Work poses (homestead chores): 9 chopping (both arms up and down with an
 * axe), 10 hoeing, 11 stirring a pot, 12 both arms up (hanging laundry),
 * 13 a rifle at port arms (patrol), 14 a pail in hand (scattering feed when
 * still). The tool in hand is aAnim.z (FIG_TOOL): axe, hoe, rifle, two
 * buckets, hammer, spoon, one pail; collapsed unless set.
 *
 * Hat code (aWear.z): 0 none (hair), 1…HATS.length knit hat palette index + 1,
 * HAT_MORTARBOARD a graduation cap (black skull cap + square board).
 *
 * Scale (SCALE v2): authored at 2× (0.56 tall); instances draw it at
 * FIG_SCALE = 0.5 → ≈ 0.28 units ≈ 1.7 m. Never cast shadows (CLAUDE.md rule 6).
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { HATS, MORTARBOARD, hatIndex, type Wear } from './crowdWear';

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
export const FIG_POSE = { STAND: 0, BENCH: 1, LAWN: 2, BIKE: 3, SCOOTER: 4, CARRY: 5, REACH: 6, KNEEL: 7, CROSS: 8, CHOP: 9, HOE: 10, STIR: 11, HANG: 12, RIFLE: 13, PAIL: 14,
  /** Digging (a shovel thrust, the body rocking with it). */ DIG: 15,
  /** Asleep (the caller lays the figure down with `pitch`): arms folded, a slow breath. */ SLEEP: 16,
  /** A rifle shouldered and aimed (both arms forward, hands on the weapon), feet apart. */ AIM: 17,
  /** Down behind cover: crouched and hunched, hands over the head. */ COVER: 18,
  /** Going down: `phase` is the fall's progress 0…1 (arms flung up, knees going). */ FALL: 19,
  /** Carrying a person (or a heavy sack) in both arms, leaning back against the load. */ CARRYP: 20,
} as const;

/** Tool in hand (aAnim.z). */
export const FIG_TOOL = { NONE: 0, AXE: 1, HOE: 2, RIFLE: 3, BUCKETS: 4, HAMMER: 5, SPOON: 6, PAIL: 7,
  /** A spade (the hoe's handle with a narrow blade). */ SHOVEL: 8,
  /** An armload of firewood (the carry box, drawn as split logs). */ LOGS: 9 } as const;

/** Hair styles (aGear.x bits 0-2). 0 = by the `longHair` flag. */
export const HAIR = { DEFAULT: 0, BUZZ: 1, BUN: 2, PONYTAIL: 3, BALD: 4, CURLY: 5, LONG: 6 } as const;
/** Headwear worn over the hair (aGear.x bits 5-7). The knit hat is `Wear.hat` alone (aWear.z). */
export const HEADWEAR = { NONE: 0, CAP: 1, BOONIE: 2, HELMET: 3, HOOD: 4 } as const;
/** Body builds (aGear.y). */
export const BUILD = { AVERAGE: 0, CHILD: 1, ELDER: 2, BROAD: 3, SLENDER: 4 } as const;
/** Gear flags (bit set in aGear.x / 256). */
export const GEAR = { APRON: 1, VEST: 2, PLATE: 4, RADIO: 8, BOOTS: 16, GLOVES: 32, SCARF: 64, BELT: 128, SLING: 256, RUCK: 512 } as const;

/** Hat code for a graduation mortarboard (aWear.z). */
export const HAT_MORTARBOARD = 20;

// Part ids
const P_PACK = 5, P_LONGHAIR = 6;
/** Look parts added by the people pass (collapsed unless worn): cap visor / boonie brim, bun / ponytail, beard, apron, vest + pouch, radio, scarf, rucksack. */
const P_BRIM = 16, P_BUN = 17, P_BEARD = 18, P_APRON = 19, P_VEST = 20, P_RADIO = 21, P_SCARF = 22, P_RUCK = 23;
// Umbrella (collapsed per-instance unless it is raining — see uRain)
const P_UMB_CANOPY = 7, P_UMB_SHAFT = 8;
/** Mortarboard board (collapsed unless the hat code is HAT_MORTARBOARD). */
const P_BOARD = 9;
/** Cardboard box held in both arms (collapsed unless the pose is CARRY). */
const P_BOX = 10;
/** Tools (collapsed unless aAnim.z says so). */
const P_AXE = 11, P_HOE = 12, P_RIFLE = 13, P_BUCKET = 14, P_HAMMER = 15;
/** Part / limb packing: aPL = part + (limb + 2) × PL_K + metal × PL_METAL. */
const PL_K = 64, PL_METAL = 512;
/** Raised arm angle (rad) for walkers holding an umbrella. */
const UMB_ARM = -0.75;
const L_NONE = 0;

/** Shared uniforms: every figure layer puts umbrellas up together and idles on one clock. */
export const FIGURE_UNIFORMS = { uRain: { value: 0 }, uLod: { value: 24 } };

/**
 * Detail distance (world units from the camera) beyond which the small look parts (hair knots, beard, visor, radio, scarf; the leg lift) are
 * collapsed in the vertex shader: [low, medium, high]. Set from the quality tier (`setFigureDetail`).
 */
const LOD_FAR = { low: 9, medium: 16, high: 28 } as const;
export function setFigureDetail(tier: 'low' | 'medium' | 'high'): void { FIGURE_UNIFORMS.uLod.value = LOD_FAR[tier]; }

/**
 * Walk-cycle phase advance for a figure that moved `dist` world units: one half cycle (π) per step, the step length being the chord the
 * swinging legs span (2 · leg · sin amp), so the planted foot does not slide. `scale` is the instance scale (kids).
 */
export function stridePhase(dist: number, scale: number, amp: number): number {
  const leg = HIP_Y * FIG_SCALE * scale;
  const step = Math.max(0.02, 2 * leg * Math.sin(Math.min(1.2, Math.max(0.2, amp))));
  return dist / step * Math.PI;
}

/** Build the merged figure geometry with the aPL (part + limb) vertex attribute. */
export function buildFigureGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const add = (g: THREE.BufferGeometry, part: number, limb: number = L_NONE, metal = false): void => {
    const ng = g.index ? g.toNonIndexed() : g;
    if (ng !== g) g.dispose();
    ng.deleteAttribute('uv');
    const n = ng.attributes.position.count;
    // part + limb packed into one attribute (vertex attribute slots are scarce: 16 max)
    ng.setAttribute('aPL', new THREE.BufferAttribute(new Float32Array(n).fill(part + (limb + 2) * PL_K + (metal ? PL_METAL : 0)), 1));
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
  // Look parts (people pass; each a single box or two, collapsed unless worn). Head: a cap visor / wide brim, a bun / ponytail knot, a beard.
  add(box(0.05, 0.006, 0.034, 0, SHOULDER_Y + 0.088, 0.04), P_BRIM);
  add(box(0.03, 0.03, 0.03, 0, SHOULDER_Y + 0.1, -0.036), P_BUN);
  add(box(0.052, 0.028, 0.03, 0, SHOULDER_Y + 0.046, 0.022), P_BEARD);
  // Body: an apron over the front, a chest rig (box + pouch strip; a plate carrier scales it), a radio on the strap, a scarf, a rucksack
  add(box(0.1, 0.19, 0.01, 0, 0.3, 0.04), P_APRON);
  const vest = box(0.118, 0.115, 0.074, 0, SHOULDER_Y - 0.075, 0);
  const pouch = box(0.09, 0.03, 0.02, 0, SHOULDER_Y - 0.12, 0.045);
  add(mergeGeometries([vest.toNonIndexed(), pouch.toNonIndexed()])!, P_VEST);
  add(box(0.026, 0.05, 0.016, -0.04, SHOULDER_Y - 0.045, 0.052), P_RADIO);
  add(box(0.075, 0.032, 0.06, 0, SHOULDER_Y + 0.018, 0), P_SCARF);
  add(box(0.1, 0.17, 0.07, 0, SHOULDER_Y - 0.09, -0.06), P_RUCK);
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
  // Tools, authored with the arm hanging (hand at y = HAND_Y) and carried
  // along the arm's line beyond the fist so they swing with it
  const HAND_Y = SHOULDER_Y - 0.168, hx = 0.071;
  const rod = (r: number, len: number, x: number, y0: number, y1: number) => { const g = new THREE.CylinderGeometry(r, r, len, 5); g.translate(x, (y0 + y1) / 2, 0); return g; };
  // axe: an 80 cm haft, the head at its end (edge leading the strike, toward -z)
  add(rod(0.008, 0.25, hx, HAND_Y + 0.02, HAND_Y - 0.23), P_AXE, 2);
  add(box(0.012, 0.035, 0.055, hx, HAND_Y - 0.215, -0.012), P_AXE, 2, true);
  // hoe: a long handle, the blade across the end
  add(rod(0.007, 0.5, hx, HAND_Y + 0.05, HAND_Y - 0.45), P_HOE, 2);
  add(box(0.06, 0.035, 0.008, hx, HAND_Y - 0.45, 0.012), P_HOE, 2, true);
  // rifle at port arms, across the chest (torso), muzzle up and to the left
  const rifle = new THREE.BoxGeometry(0.016, 0.42, 0.024);
  rifle.rotateZ(0.95); rifle.translate(0, SHOULDER_Y - 0.1, 0.1);
  add(rifle, P_RIFLE, L_NONE, true);
  const stock = new THREE.BoxGeometry(0.02, 0.1, 0.032);
  stock.rotateZ(0.95); stock.translate(0.11, SHOULDER_Y - 0.175, 0.1);
  add(stock, P_RIFLE, L_NONE);
  // buckets (one in each hand; a single pail keeps only the +x one)
  for (const side of [1, -1]) {
    const b = new THREE.CylinderGeometry(0.032, 0.026, 0.055, 8);
    b.translate(side * hx, HAND_Y - 0.055, 0);
    add(b, P_BUCKET, side * 2, true);
  }
  // hammer / spoon: a short handle and a head
  add(rod(0.006, 0.11, hx, HAND_Y + 0.01, HAND_Y - 0.1), P_HAMMER, 2);
  add(box(0.018, 0.018, 0.045, hx, HAND_Y - 0.1, 0), P_HAMMER, 2, true);

  const g = mergeGeometries(parts)!;
  parts.forEach(p => p.dispose());
  g.computeBoundingSphere();
  return g;
}

/** The figure's per-instance attribute names and sizes (source order). */
export const FIGURE_ATTRS: ReadonlyArray<readonly [string, number]> = [
  ['aShirt', 3], ['aPants', 3], ['aSkin', 3], ['aHair', 3], ['aPack', 3],
  ['aStyle', 4], ['aWear', 4], ['aAnim', 3], ['aGear', 4],
];

/** GLSL: one 0/1 float per gear flag (agGApron, agGVest, …) from the packed flags `agGf`. */
const GEAR_DECODE = Object.entries(GEAR).map(([k, v]) => `        float agG${k[0]}${k.slice(1).toLowerCase()} = mod(floor(agGf / ${v}.0), 2.0);`).join('\n');

/**
 * Vertex-shader skeleton: limbs rotate about hip / shoulder pivots by the
 * per-instance walk phase; poses (see FIG_POSE). Standing people idle
 * (weight shift, head turns, a hand gesture now and then). Color is picked
 * per part from the instance palette; coats / gowns / shorts are cut in the
 * fragment shader at a figure height.
 */
export function injectFigureShader(mat: THREE.MeshStandardMaterial): void {
  const f = (v: number) => v.toFixed(3);
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uRain = FIGURE_UNIFORMS.uRain;
    shader.uniforms.uLod = FIGURE_UNIFORMS.uLod;
    shader.uniforms.uTime = (mat.userData.time ??= { value: 0 });
    // (a rim of light along the silhouette, per material: colour x strength, zero unless a layer asks for it, so crowds are untouched)
    shader.uniforms.uRim = (mat.userData.rim ??= { value: new THREE.Vector3(0, 0, 0) });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        uniform float uRain;
        uniform float uTime;
        uniform float uLod;
        attribute vec4 aGear;
        varying float vAgBelt;
        attribute float aPL;
        attribute vec3 aShirt;
        attribute vec3 aPants;
        attribute vec3 aSkin;
        attribute vec3 aHair;
        attribute vec3 aPack;
        attribute vec4 aStyle;
        attribute vec4 aWear;
        attribute vec3 aAnim;
        varying vec3 vAgCol;
        varying vec3 vAgAlt;
        varying vec2 vAgCut;
        varying float vAgY;
        varying float vAgHash;
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
        float agMetal = step(${(PL_METAL - 0.5).toFixed(1)}, aPL);
        float agPL = aPL - agMetal * ${PL_METAL.toFixed(1)};
        float aLimb = floor(agPL / ${PL_K.toFixed(1)} + 0.001) - 2.0;
        float aPart = agPL - (aLimb + 2.0) * ${PL_K.toFixed(1)};
        float agTool = aAnim.z;
        float agPose = aStyle.x;
        float agBench = step(0.5, agPose) * step(agPose, 1.5);
        float agLawn = step(1.5, agPose) * step(agPose, 2.5);
        float agBike = step(2.5, agPose) * step(agPose, 3.5);
        float agScoot = step(3.5, agPose) * step(agPose, 4.5);
        float agCarry = step(4.5, agPose) * step(agPose, 5.5);
        float agReach = step(5.5, agPose) * step(agPose, 6.5);
        float agKneel = step(6.5, agPose) * step(agPose, 7.5);
        float agCross = step(7.5, agPose) * step(agPose, 8.5);
        float agChop = step(8.5, agPose) * step(agPose, 9.5);
        float agHoe = step(9.5, agPose) * step(agPose, 10.5);
        float agStir = step(10.5, agPose) * step(agPose, 11.5);
        float agHang = step(11.5, agPose) * step(agPose, 12.5);
        float agRifle = step(12.5, agPose) * step(agPose, 13.5);
        float agPail = step(13.5, agPose) * step(agPose, 14.5);
        float agDig = step(14.5, agPose) * step(agPose, 15.5);
        float agSleep = step(15.5, agPose) * step(agPose, 16.5);
        float agAim = step(16.5, agPose) * step(agPose, 17.5);
        float agCover = step(17.5, agPose) * step(agPose, 18.5);
        float agFall = step(18.5, agPose) * step(agPose, 19.5);
        float agCarryP = step(19.5, agPose) * step(agPose, 20.5);
        // gear / look (aGear): hair, beard, headwear, flags; build; head look; ground slope
        float agGp = aGear.x;
        float agHairS = mod(agGp, 8.0);
        float agBeardK = mod(floor(agGp / 8.0), 4.0);
        float agHeadW = mod(floor(agGp / 32.0), 8.0);
        float agGf = floor(agGp / 256.0);
${GEAR_DECODE}
        float agBuild = aGear.y;
        float agChild = step(0.5, agBuild) * step(agBuild, 1.5);
        float agElder = step(1.5, agBuild) * step(agBuild, 2.5);
        float agBroad = step(2.5, agBuild) * step(agBuild, 3.5);
        float agSlender = step(3.5, agBuild);
        float agDist = length((modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz);
        float agNear = 1.0 - step(uLod, agDist);
        float agGone = 0.0;
        float agSit = agBench + agLawn + agCross;
        float agSide = sign(aLimb);
        float agIsArm = step(1.5, abs(aLimb));
        float agIsLeg = step(0.5, abs(aLimb)) * (1.0 - agIsArm);
        float agSwing = sin(aAnim.x) * aAnim.y;
        float agAng = agIsLeg * agSide * agSwing - agIsArm * agSide * agSwing * 0.85;
        // Joggers (large swing): forearms bent forward
        agAng -= agIsArm * smoothstep(0.6, 0.85, aAnim.y) * 0.55;
        // Idle (standing still): occasional hand gesture with the +x arm
        float agStill = (1.0 - step(0.01, aAnim.y)) * (1.0 - agSit) * (1.0 - agBike - agScoot - agKneel - agSleep - agFall - agCover - agAim - agDig);
        float agT = uTime + aWear.w * 7.0;
        float agGest = pow(max(0.0, sin(agT * 0.55 + aWear.w * 3.1)), 8.0);
        // (what the idle hand does, by person: a wave of the hand, a hand to the head, arms folded, hands behind the back)
        float agGk = floor(fract(aWear.w * 13.7) * 4.0);
        agAng -= agStill * agGest * (1.0 - agReach) * (agGk < 0.5 ? step(1.5, aLimb) * 0.75 : agGk < 1.5 ? step(1.5, aLimb) * 2.3 : agGk < 2.5 ? agIsArm * 0.95 : -agIsArm * 0.3);
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
        // Chopping: a slow lift overhead, a fast strike down to the block; feet apart
        float agCp = fract(agT * 0.55);
        float agChopA = agCp < 0.75 ? mix(-0.8, -2.9, smoothstep(0.0, 0.75, agCp)) : mix(-2.9, -0.8, (agCp - 0.75) / 0.25);
        agAng = mix(agAng, agIsLeg * agSide * 0.16 + agIsArm * agChopA, agChop);
        // Hoeing: both arms forward, the blade drawn back and lifted
        agAng = mix(agAng, agIsLeg * agSide * 0.2 + agIsArm * (-0.72 + 0.28 * sin(agT * 2.2)), agHoe);
        // Stirring: the +x arm in the pot, small circles; the other steadies it
        agAng = mix(agAng, agIsArm * (aLimb > 0.0 ? -0.85 + 0.14 * sin(agT * 3.4) : -0.45), agStir);
        // Hanging laundry: both arms up at the line
        agAng = mix(agAng, agIsArm * (-2.7 + 0.12 * sin(agT * 1.3 + agSide)), agHang);
        // Rifle at port arms: arms hold it across the chest, legs keep walking
        agAng = mix(agAng, agIsLeg * agAng + agIsArm * -0.72, agRifle);
        // A pail: carried low; standing still the +x hand scatters feed
        agAng = mix(agAng, agIsLeg * agAng + agIsArm * (aLimb > 0.0 ? -0.12 - agStill * 0.75 * (0.5 + 0.5 * sin(agT * 2.4)) : -0.08), agPail);
        // Digging: both arms forward on the spade, thrusting with the body
        agAng = mix(agAng, agIsLeg * agSide * 0.2 + agIsArm * (-0.95 + 0.45 * sin(agT * 2.4)), agDig);
        // Asleep: arms folded on the chest, one knee bent
        agAng = mix(agAng, agIsLeg * (agSide > 0.0 ? 0.1 : -0.3) + agIsArm * -0.95, agSleep);
        // Aiming: both arms out along the rifle, feet apart, a tiny sway of the muzzle
        agAng = mix(agAng, agIsLeg * agSide * 0.22 + agIsArm * (-1.42 + 0.015 * sin(agT * 1.9)), agAim);
        // Under cover: hands over the head, knees down
        agAng = mix(agAng, agIsLeg * 0.12 + agIsArm * -2.35, agCover);
        // Falling (aAnim.x is the progress): arms flung up and out, a knee going
        agAng = mix(agAng, agIsLeg * (agSide > 0.0 ? -0.55 : 0.25) * aAnim.x + agIsArm * mix(-0.35, -2.5, aAnim.x), agFall);
        // Carrying a person: both forearms under the load (legs keep walking)
        agAng = mix(agAng, agIsLeg * agAng + agIsArm * -1.2, agCarryP);
        // Rain: most walkers put up an umbrella (+x arm raised, held still)
        float agUmbH = fract(dot(aShirt, vec3(7.13, 3.17, 1.71)) + dot(aPants, vec3(2.31, 5.93, 1.13)) + aWear.w * 3.7);
        float agUmb = (1.0 - agSit) * (1.0 - agBike - agScoot - agCarry - agReach - agKneel) * (1.0 - step(8.5, agPose)) * (1.0 - step(0.5, agTool)) * step(0.02, uRain) * step(agUmbH, min(uRain * 1.6, 0.8));
        agAng = mix(agAng, ${f(UMB_ARM)}, agUmb * step(1.5, aLimb));
        float agPivot = agIsArm > 0.5 ? ${f(SHOULDER_Y)} : ${f(HIP_Y)};
        // Head turns while standing / sitting (head = skin / hair above the neck)
        float agBoardPart = step(abs(aPart - ${P_BOARD.toFixed(1)}), 0.5);
        float agHeadX = step(15.5, aPart) * step(aPart, 18.5);
        float agHead = step(${f(SHOULDER_Y + 0.02)}, position.y) * max(1.0 - step(6.5, aPart), max(agBoardPart, agHeadX)) * step(abs(aLimb), 0.5);
        float agLook = step(0.001, abs(aGear.z));
        float agYawA = agHead * ((agStill + agSit) * (1.0 - agLook) * (sin(agT * 0.37) * 0.55 + sin(agT * 0.91 + 1.3) * 0.2) + aGear.z);
        // (leaning: runners pitch forward, the old stoop, the dig, the crouch under cover; weighted up the body from the hips)
        float agRunK = smoothstep(0.58, 0.9, aAnim.y) * (1.0 - agSit - agBike - agScoot);
        float agLeanA = agRunK * 0.2 + agElder * 0.17 + agAim * 0.08 + agCover * 0.6 + agDig * (0.28 + 0.12 * sin(agT * 2.4 + 1.0)) - agCarryP * 0.2 + agHoe * 0.22 + agKneel * 0.1 + agFall * aAnim.x * -0.3;
        float agLeanW = smoothstep(0.2, 0.3, position.y);
        objectNormal = agRot(objectNormal, agLeanA * agLeanW);
        objectNormal = agYaw(agRot(objectNormal, agAng), agYawA);`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vAgY = position.y;
        vAgHash = fract(aWear.w * 5.31 + dot(aShirt, vec3(3.1, 1.7, 2.3)));
        vAgBelt = agGBelt * step(abs(aPart - 2.0), 0.5) * step(abs(aLimb), 0.5);
        // Rest-pose shape of the look parts (before any posing)
        {
          vec3 hc = vec3(0.0, ${f(SHOULDER_Y + 0.066)}, 0.0);
          float hairOn = step(abs(aPart - 1.0), 0.5);
          // hair shell: a buzz cut hugs the skull, curls stand off it; headwear (helmet, hood) sits proud
          float hairK = 1.0 - 0.04 * step(0.5, agHairS) * step(agHairS, 1.5) + 0.22 * step(4.5, agHairS) * step(agHairS, 5.5)
                      + 0.16 * step(2.5, agHeadW) * step(agHeadW, 3.5) + 0.13 * step(3.5, agHeadW) * step(agHeadW, 4.5);
          transformed = mix(transformed, hc + (transformed - hc) * hairK, hairOn);
          // a boonie's brim is wide and low; a ponytail hangs where the bun sits; a plate carrier is deeper; boots are tall
          if (abs(aPart - ${P_BRIM.toFixed(1)}) < 0.5 && abs(agHeadW - 2.0) < 0.5) { transformed.x *= 2.0; transformed.z = (transformed.z - 0.04) * 3.2; transformed.y -= 0.012; }
          if (abs(aPart - ${P_BUN.toFixed(1)}) < 0.5 && abs(agHairS - 3.0) < 0.5) { transformed.y = ${f(SHOULDER_Y + 0.1)} + (transformed.y - ${f(SHOULDER_Y + 0.1)}) * 2.6 - 0.04; transformed.x *= 0.6; transformed.z -= 0.012; }
          if (abs(aPart - ${P_VEST.toFixed(1)}) < 0.5 && agGPlate > 0.5) { transformed.z *= 1.28; transformed.x *= 1.04; }
          if (abs(aPart - 4.0) < 0.5 && agGBoots > 0.5) { transformed.y *= 3.5; transformed.x *= 1.12; transformed.z = (transformed.z - 0.01) * 1.1 + 0.01; }
          // a child's head is big for the body, an elder's shoulders narrower
          float inHead = step(${f(SHOULDER_Y + 0.02)}, position.y) * step(abs(aLimb), 0.5) * (step(aPart, 1.5) + step(abs(aPart - 9.0), 0.5) + step(15.5, aPart) * step(aPart, 18.5));
          transformed = mix(transformed, vec3(0.0, ${f(SHOULDER_Y + 0.03)}, 0.0) + (transformed - vec3(0.0, ${f(SHOULDER_Y + 0.03)}, 0.0)) * 1.3, agChild * inHead);
        }
        // cross-legged: shins tucked under (half-length legs), knees out to the sides
        if (agCross > 0.5 && agIsLeg > 0.5) {
          transformed.y = ${f(HIP_Y)} - (${f(HIP_Y)} - transformed.y) * 0.5;
          transformed.x *= 1.9;
        }
        transformed = agRot(transformed - vec3(0.0, agPivot, 0.0), agAng) + vec3(0.0, agPivot, 0.0);
        // aiming: the hands come in to the rifle
        if (agAim > 0.5 && agIsArm > 0.5) { float sx = agSide * 0.071; vec3 q = agYaw(vec3(transformed.x - sx, transformed.y, transformed.z), -agSide * (agSide > 0.0 ? 0.34 : 0.47)); transformed.x = sx + q.x; transformed.z = q.z; }
        // lean about the hips, weighted up the body
        transformed = agRot(transformed - vec3(0.0, ${f(HIP_Y)}, 0.0), agLeanA * agLeanW) + vec3(0.0, ${f(HIP_Y)}, 0.0);
        // build: broad / slender below the head
        float agBodyW = 1.0 + agBroad * 0.14 - agSlender * 0.1 - agElder * 0.05;
        transformed.x *= mix(agBodyW, 1.0, step(${f(SHOULDER_Y + 0.02)}, position.y) * step(abs(aLimb), 0.5));
        transformed.z *= 1.0 + agBroad * 0.08;
        transformed = agYaw(transformed, agYawA);
        // Collapse optional parts when unused (flagged here, collapsed at the end so the whole part goes to one point)
        float agTl = floor(agTool + 0.5);
        if (abs(aPart - ${P_PACK.toFixed(1)}) < 0.5 && (aStyle.y < 0.5 || agGRuck > 0.5)) agGone = 1.0;
        if (abs(aPart - ${P_LONGHAIR.toFixed(1)}) < 0.5 && (!((aStyle.z > 0.5 && agHairS < 0.5) || abs(agHairS - 6.0) < 0.5) || agHeadW > 2.5 || agNear < 0.5)) agGone = 1.0;
        if ((abs(aPart - ${P_UMB_CANOPY.toFixed(1)}) < 0.5 || abs(aPart - ${P_UMB_SHAFT.toFixed(1)}) < 0.5) && agUmb < 0.5) agGone = 1.0;
        if (agBoardPart > 0.5 && aWear.z < ${(HAT_MORTARBOARD - 0.5).toFixed(1)}) agGone = 1.0;
        if (abs(aPart - ${P_BOX.toFixed(1)}) < 0.5 && !(agCarry > 0.5 || (agTl == 9.0 && agCarryP + agCarry > 0.5))) agGone = 1.0;
        if (abs(aPart - ${P_AXE.toFixed(1)}) < 0.5 && agTl != 1.0) agGone = 1.0;
        if (abs(aPart - ${P_HOE.toFixed(1)}) < 0.5 && agTl != 2.0 && agTl != 8.0) agGone = 1.0;
        if (abs(aPart - ${P_BUCKET.toFixed(1)}) < 0.5 && !(agTl == 4.0 || (agTl == 7.0 && aLimb > 0.0))) agGone = 1.0;
        if (abs(aPart - ${P_HAMMER.toFixed(1)}) < 0.5 && !(agTl == 5.0 || agTl == 6.0)) agGone = 1.0;
        // a spade is the hoe's handle with a narrow, long blade
        if (abs(aPart - ${P_HOE.toFixed(1)}) < 0.5 && agTl == 8.0 && agMetal > 0.5) { vec3 bc = vec3(0.071, ${f(SHOULDER_Y - 0.168 - 0.45)}, 0.0); transformed = bc + (transformed - bc) * vec3(0.55, 1.0, 5.0); }
        // the rifle: shouldered to aim, across the chest at port arms, or slung diagonally on the back
        if (abs(aPart - ${P_RIFLE.toFixed(1)}) < 0.5) {
          vec3 rc = vec3(0.0, ${f(SHOULDER_Y - 0.1)}, 0.1);
          if (agTl == 3.0 && agAim > 0.5) { vec3 q = transformed - rc; float cz = cos(-0.95), sz = sin(-0.95); q = vec3(q.x * cz - q.y * sz, q.x * sz + q.y * cz, q.z); q = agRot(q, 1.5708); transformed = q + vec3(0.012, ${f(SHOULDER_Y - 0.035)}, 0.25); }
          else if (agTl != 3.0) { if (agGSling > 0.5) transformed.z -= 0.185; else agGone = 1.0; }
        }
        if (abs(aPart - 1.0) < 0.5 && abs(agHairS - 4.0) < 0.5 && aWear.z < 0.5 && agHeadW < 0.5) agGone = 1.0;
        // small look parts: only when worn, and only near the camera
        if (abs(aPart - ${P_BRIM.toFixed(1)}) < 0.5 && !(abs(agHeadW - 1.0) < 0.5 || abs(agHeadW - 2.0) < 0.5)) agGone = 1.0;
        if (abs(aPart - ${P_BRIM.toFixed(1)}) < 0.5 && agNear < 0.5) agGone = 1.0;
        if (abs(aPart - ${P_BUN.toFixed(1)}) < 0.5 && (!(abs(agHairS - 2.0) < 0.5 || abs(agHairS - 3.0) < 0.5) || agHeadW > 2.5 || aWear.z > 0.5 || agNear < 0.5)) agGone = 1.0;
        if (abs(aPart - ${P_BEARD.toFixed(1)}) < 0.5 && (agBeardK < 0.5 || agNear < 0.5)) agGone = 1.0;
        if (abs(aPart - ${P_APRON.toFixed(1)}) < 0.5 && agGApron < 0.5) agGone = 1.0;
        if (abs(aPart - ${P_VEST.toFixed(1)}) < 0.5 && agGVest + agGPlate < 0.5) agGone = 1.0;
        if (abs(aPart - ${P_RADIO.toFixed(1)}) < 0.5 && (agGRadio < 0.5 || agNear < 0.5)) agGone = 1.0;
        if (abs(aPart - ${P_SCARF.toFixed(1)}) < 0.5 && (agGScarf < 0.5 || agNear < 0.5)) agGone = 1.0;
        if (abs(aPart - ${P_RUCK.toFixed(1)}) < 0.5 && agGRuck < 0.5) agGone = 1.0;
        // a carried load rides the arms; an unused wear flag on a sleeper or a faller is not drawn differently
        // Walking bob; seat drops; rider lifts
        // Foot planting: the pelvis drops as the legs spread so both feet stay on the ground, and the swinging foot lifts to clear it; runners bounce
        float agMove = step(0.01, aAnim.y) * (1.0 - agSit - agBike - agScoot - agKneel - agCover - agSleep - agFall - agCross);
        float agSw = abs(agSwing);
        transformed.y -= agMove * (1.0 - agRunK) * ${f(HIP_Y)} * (1.0 - cos(min(agSw, 1.0)));
        transformed.y += agMove * agRunK * abs(cos(aAnim.x)) * 0.045;
        float agFoot = (1.0 - smoothstep(0.0, ${f(HIP_Y * 0.9)}, position.y)) * agIsLeg * agMove * agNear;
        transformed.y += agFoot * max(0.0, -agSide * cos(aAnim.x)) * (0.03 + 0.04 * agRunK) * aAnim.y * 2.0;
        // Feet on the slope: the legs follow the ground plane under the figure (rise per unit along the facing)
        transformed.y += aGear.w * transformed.z * (1.0 - smoothstep(0.0, ${f(HIP_Y)}, position.y)) * agIsLeg;
        // A slow breath (more when asleep)
        transformed.z *= 1.0 + (0.03 + 0.04 * agSleep) * sin(agT * 1.9) * (1.0 - agMove) * step(abs(aPart - 2.0), 0.5) * step(abs(aLimb), 0.5);
        transformed.y -= agBench * ${f(HIP_Y - SEAT_Y)};
        transformed.z -= agBench * 0.02;
        transformed.y -= agLawn * ${f(HIP_Y - LAWN_Y)};
        transformed.z -= agLawn * 0.03;
        transformed.y -= (agKneel + agCover) * ${f(HIP_Y - KNEEL_Y)};
        transformed.y -= agCross * ${f(HIP_Y - LAWN_Y - 0.01)};
        transformed.z -= agCross * 0.015;
        transformed.y += agBike * ${f(SADDLE_Y - HIP_Y)} + agScoot * ${f(DECK_Y)};
        transformed.z -= agBike * 0.07;
        // Weight shift while standing around
        transformed.x += agStill * sin(agT * 0.8) * transformed.y * 0.035;
        if (agGone > 0.5) transformed = vec3(0.0, 0.35, 0.0);
        // Per-part color (hat replaces the hair cap)
        vec3 shoeC = mix(vec3(0.08), vec3(0.86), step(0.55, aStyle.w));
        vec3 hatC = aWear.z > 0.5 ? agHatColor(aWear.z) : aPack;
        vec3 hairC = aWear.z > 0.5 ? agHatColor(aWear.z) : agHeadW > 3.5 ? aShirt : agHeadW > 0.5 ? hatC : aHair;
        // clean-shaven, stubble (halfway to the skin), full beard; accessory tint from the person
        vec3 beardC = agBeardK < 1.5 ? mix(aSkin, aHair, 0.45) : aHair;
        float agAcc = fract(vAgHash * 7.7);
        vec3 accC = agAcc < 0.2 ? vec3(0.62, 0.12, 0.1) : agAcc < 0.4 ? vec3(0.1, 0.2, 0.4) : agAcc < 0.6 ? vec3(0.78, 0.74, 0.62) : agAcc < 0.8 ? vec3(0.2, 0.32, 0.2) : vec3(0.55, 0.38, 0.12);
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
               : aPart < 10.5 ? vec3(0.52, 0.38, 0.22)
               : abs(aPart - ${P_RIFLE.toFixed(1)}) < 0.5 ? (agMetal > 0.5 ? vec3(0.06) : vec3(0.3, 0.18, 0.09))
               : abs(aPart - ${P_BUCKET.toFixed(1)}) < 0.5 ? vec3(0.52, 0.54, 0.55)
               : agMetal > 0.5 ? vec3(0.3, 0.31, 0.33)
               : vec3(0.45, 0.3, 0.15);
        if (aPart > 15.5) {
          vAgCol = aPart < 16.5 ? hatC : aPart < 17.5 ? aHair : aPart < 18.5 ? beardC : aPart < 19.5 ? aPack : aPart < 20.5 ? aPack * 0.9 : aPart < 21.5 ? vec3(0.04) : aPart < 22.5 ? accC : aPack * 0.8;
        }
        if (abs(aPart - ${P_BOX.toFixed(1)}) < 0.5 && agTl == 9.0) vAgCol = vec3(0.3, 0.19, 0.1);
        // leather work gloves on the hands
        if (aPart < 0.5 && agIsArm > 0.5 && position.y < ${f(SHOULDER_Y - 0.145)} && agGGloves > 0.5) vAgCol = vec3(0.2, 0.13, 0.08);
        // boots are the dark brown of the shoes' tone, laced work boots
        if (abs(aPart - 4.0) < 0.5 && agGBoots > 0.5) vAgCol = mix(vec3(0.07, 0.05, 0.04), vec3(0.2, 0.14, 0.1), step(0.55, aStyle.w));
        // Trousers: coat / gown hem (shirt color above) / shorts (skin below the knee)
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
        varying float vAgY;
        varying float vAgHash;
        varying float vAgBelt;
        uniform vec3 uRim;`)
      .replace('#include <opaque_fragment>', `
        {
          float agRimF = pow(1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0), 2.2);
          outgoingLight += uRim * agRimF * (0.65 + 0.7 * vAgHash);
        }
        #include <opaque_fragment>`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        diffuseColor.rgb *= (vAgY > vAgCut.x || (vAgY < vAgCut.y && vAgY > 0.024)) ? vAgAlt : vAgCol;
        // a belt: a dark leather band at the waist
        if (vAgBelt > 0.5 && vAgY < 0.31) diffuseColor.rgb = vec3(0.06, 0.045, 0.035);`);
  };
  mat.customProgramCacheKey = () => 'agent-figure-v8';
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
  /** Tool in hand (FIG_TOOL; default none). */
  tool?: number;
  /** Head turn from the body's heading, radians (+ to the figure's left): toward a point of interest. 0 = idle glances. */
  look?: number;
  /** Ground rise per unit along the facing (feet follow the slope plane); clamp ±0.8. */
  slope?: number;
  /** Gear flags (GEAR bits) for this frame, replacing the wear's own (an apron for the cook, a radio for the watch). */
  gear?: number;
  /** Pitch about the figure's own x axis, radians, applied before the turn: -PI / 2 lays it on its back (head toward -z). Default 0. */
  pitch?: number;
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
  private readonly _right = new THREE.Vector3(1, 0, 0);
  private readonly _pq = new THREE.Quaternion();
  private readonly _c = new THREE.Color();
  private _scene: THREE.Scene | null;
  readonly capacity: number;
  /** Per instance: hair / beard / headwear bits and the wear's own gear flags (setPose adds the flags to aGear.x). */
  private readonly _gearBase: Float32Array;
  private readonly _gearFlags: Uint16Array;
  private _timeSet = false;
  private _t0 = typeof performance !== 'undefined' ? performance.now() : 0;

  constructor(scene: THREE.Scene, capacity: number, name: string) {
    this._scene = scene;
    this.capacity = Math.max(1, capacity);
    this._gearBase = new Float32Array(this.capacity);
    this._gearFlags = new Uint16Array(this.capacity);
    this._geo = buildFigureGeometry();
    for (const [n, size] of FIGURE_ATTRS) {
      const a = new THREE.InstancedBufferAttribute(new Float32Array(this.capacity * size), size);
      a.setUsage(THREE.DynamicDrawUsage);
      this._geo.setAttribute(n, a);
      this._attrs[n] = a;
    }
    this._mat = makeFigureMaterial();
    this._mat.userData.time = { value: 0 };
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

  /** A rim of light along every figure's edge, colour x strength (sRGB hex scaled; strength 0 turns it off). Per layer: other layers keep their look. */
  setRim(hex: number, strength: number): void {
    const u = (this._mat.userData.rim ??= { value: new THREE.Vector3(0, 0, 0) }) as { value: THREE.Vector3 };
    this._c.setHex(hex);
    u.value.set(this._c.r * strength, this._c.g * strength, this._c.b * strength);
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
    we[i * 4 + 2] = w.hat === HAT_MORTARBOARD_HEX ? HAT_MORTARBOARD : w.hat >= 0 ? hatIndex(w.hat) + 1 : 0;
    we[i * 4 + 3] = (i * 0.6180339) % 1;
    // the look: hair style, beard, headwear (bits 0-7), gear flags (from bit 8); the build
    this._gearBase[i] = (w.hairStyle ?? 0) + (w.beard ?? 0) * 8 + (w.headwear ?? 0) * 32;
    this._gearFlags[i] = w.gear ?? 0;
    (A.aGear.array as Float32Array)[i * 4 + 1] = w.build ?? 0;
  }

  /** Drive the idle / work animations from a clock the caller owns (a scrubbed cutscene); otherwise they run on real time. */
  setTime(t: number): void {
    this._timeSet = true;
    (this._mat.userData.time as { value: number }).value = t % 6283;
  }

  /** Place instance i. */
  setPose(i: number, p: FigurePose): void {
    this._q.setFromAxisAngle(this._up, p.rot);
    if (p.pitch) this._q.multiply(this._pq.setFromAxisAngle(this._right, p.pitch));
    this._m.compose(this._p.set(p.x, p.y, p.z), this._q, this._s.setScalar(p.scale * FIG_SCALE));
    this._m.toArray(this.mesh.instanceMatrix.array as Float32Array, i * 16);
    const st = this._attrs.aStyle.array as Float32Array;
    st[i * 4] = p.pose;
    const an = this._attrs.aAnim.array as Float32Array;
    an[i * 3] = p.phase; an[i * 3 + 1] = p.amp; an[i * 3 + 2] = p.tool ?? 0;
    const gr = this._attrs.aGear.array as Float32Array;
    gr[i * 4] = this._gearBase[i] + (p.gear ?? this._gearFlags[i]) * 256;
    gr[i * 4 + 2] = Math.max(-1.1, Math.min(1.1, p.look ?? 0));
    gr[i * 4 + 3] = Math.max(-0.8, Math.min(0.8, p.slope ?? 0));
  }

  /** Draw the first n instances; flag what changed for upload. */
  commit(n: number, wearChanged: boolean): void {
    const k = Math.max(0, Math.min(this.capacity, n));
    this.mesh.count = k;
    this.mesh.visible = k > 0;
    const im = this.mesh.instanceMatrix;
    im.clearUpdateRanges(); im.addUpdateRange(0, k * 16); im.needsUpdate = true;
    if (!this._timeSet) (this._mat.userData.time as { value: number }).value = ((performance.now() - this._t0) / 1000) % 6283;
    for (const name of ['aStyle', 'aAnim', 'aGear'] as const) {
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
