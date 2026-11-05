/**
 * Geometry for the life on the county road (game/RoadTraffic.ts): every kind is ONE merged, vertex-colored geometry (position, normal,
 * color only) so the whole road is a single batched draw. Body panels are baked white where the paint varies per vehicle (the instance
 * color tints them), fixed colors elsewhere. SCALE v2: a car is 0.75 x 0.31, a bus 2.0 long, a person 0.28. Local frame: front toward
 * +z, wheels on y = 0, centered on the middle of the vehicle.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { buildVehicle } from './vehicleGeometry';
import { buildTruck } from './truckGeometry';
import type { MemberKind } from '../../sim/roadTraffic';

type G = THREE.BufferGeometry;
interface Piece { g: G; c: number }
const box = (w: number, h: number, d: number, x: number, y: number, z: number): G => new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z);
const wheel = (r: number, w: number, x: number, z: number): G => new THREE.CylinderGeometry(r, r, w, 12).rotateZ(Math.PI / 2).translate(x, r, z);
const WHITE = 0xffffff, BLACK = 0x26272a, GLASS = 0x28343b, CHROME = 0x9a9ea2, LAMP = 0xf2ecc8;

/** Merge pieces into one vertex-colored, non-indexed geometry. */
function bake(pieces: Piece[]): G {
  const parts = pieces.map(({ g, c }) => {
    const ng = g.index ? g.toNonIndexed() : g.clone();
    for (const k of Object.keys(ng.attributes)) if (k !== 'position' && k !== 'normal') ng.deleteAttribute(k);
    const col = new THREE.Color(c), n = ng.attributes.position.count, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { a[i * 3] = col.r; a[i * 3 + 1] = col.g; a[i * 3 + 2] = col.b; }
    ng.setAttribute('color', new THREE.BufferAttribute(a, 3));
    return ng;
  });
  return mergeGeometries(parts, false)!;
}

/** Flatten a vehicle group (game/props/vehicleGeometry, truckGeometry) to colored pieces, material color per mesh. */
function fromGroup(grp: THREE.Group): Piece[] {
  const out: Piece[] = [];
  grp.updateMatrixWorld(true);
  grp.traverse(o => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const mat = m.material as THREE.MeshStandardMaterial;
    const glass = mat.transparent || (mat.name ?? '').includes('glass');
    out.push({ g: m.geometry.clone().applyMatrix4(m.matrixWorld), c: glass ? GLASS : (mat.color?.getHex() ?? WHITE) });
  });
  return out;
}

function sedan(): Piece[] {
  const W = 0.31, L = 0.75;
  const p: Piece[] = [
    { g: box(W, 0.1, L, 0, 0.055, 0), c: WHITE },
    { g: box(W - 0.03, 0.085, 0.4, 0, 0.155, -0.04), c: WHITE },
    { g: box(W - 0.01, 0.06, 0.38, 0, 0.165, -0.04), c: GLASS },
    { g: box(W + 0.01, 0.03, 0.02, 0, 0.06, L / 2), c: CHROME }, { g: box(W + 0.01, 0.03, 0.02, 0, 0.06, -L / 2), c: CHROME },
    { g: box(0.05, 0.022, 0.01, 0.1, 0.13, L / 2 + 0.003), c: LAMP }, { g: box(0.05, 0.022, 0.01, -0.1, 0.13, L / 2 + 0.003), c: LAMP },
  ];
  for (const z of [0.26, -0.25]) for (const s of [-1, 1]) p.push({ g: wheel(0.058, 0.04, s * (W / 2 - 0.015), z), c: BLACK });
  return p;
}

function van(): Piece[] {
  const W = 0.33, L = 0.85;
  const p: Piece[] = [
    { g: box(W, 0.2, L, 0, 0.07, 0), c: WHITE },
    { g: box(W - 0.02, 0.1, 0.22, 0, 0.27, 0.2), c: WHITE },
    { g: box(W - 0.01, 0.07, 0.2, 0, 0.275, 0.21), c: GLASS },
    { g: box(W + 0.01, 0.03, 0.02, 0, 0.06, L / 2), c: CHROME },
    { g: box(0.05, 0.022, 0.01, 0.11, 0.15, L / 2 + 0.003), c: LAMP }, { g: box(0.05, 0.022, 0.01, -0.11, 0.15, L / 2 + 0.003), c: LAMP },
  ];
  for (const z of [0.28, -0.27]) for (const s of [-1, 1]) p.push({ g: wheel(0.062, 0.045, s * (W / 2 - 0.015), z), c: BLACK });
  return p;
}

function bus(): Piece[] {
  const W = 0.43, L = 2;
  const Y = 0xe6b21c;
  const p: Piece[] = [
    { g: box(W, 0.4, L - 0.2, 0, 0.1, -0.1), c: Y }, { g: box(W - 0.02, 0.18, 0.22, 0, 0.1, L / 2 - 0.1), c: Y },
    { g: box(W + 0.004, 0.025, L - 0.2, 0, 0.27, -0.1), c: BLACK },
    { g: box(W + 0.01, 0.035, 0.02, 0, 0.09, L / 2), c: BLACK }, { g: box(W + 0.01, 0.035, 0.02, 0, 0.09, -L / 2), c: BLACK },
    { g: box(W - 0.04, 0.09, 0.005, 0, 0.38, L / 2 - 0.2), c: GLASS },
    { g: box(0.05, 0.03, 0.01, 0.15, 0.17, L / 2 + 0.003), c: LAMP }, { g: box(0.05, 0.03, 0.01, -0.15, 0.17, L / 2 + 0.003), c: LAMP },
  ];
  for (let i = 0; i < 7; i++) for (const s of [-1, 1]) p.push({ g: box(0.006, 0.075, 0.17, s * (W / 2 + 0.002), 0.36, -0.75 + i * 0.22 + 0.5), c: GLASS });
  for (const z of [0.68, -0.62]) for (const s of [-1, 1]) p.push({ g: wheel(0.075, 0.07, s * (W / 2 - 0.03), z), c: BLACK });
  return p;
}

function semi(): Piece[] {
  const W = 0.4;
  const p: Piece[] = [
    { g: box(W - 0.02, 0.3, 0.45, 0, 0.12, 1.2), c: WHITE }, { g: box(W - 0.06, 0.12, 0.26, 0, 0.42, 1.14), c: WHITE },
    { g: box(W - 0.04, 0.08, 0.005, 0, 0.44, 1.27), c: GLASS },
    { g: box(0.03, 0.4, 0.03, 0.13, 0.12, 1.0), c: CHROME },
    { g: box(0.3, 0.06, 2.5, 0, 0.1, 0), c: BLACK },
    { g: box(W, 0.52, 1.9, 0, 0.16, -0.35), c: 0xd8d6cc },
    { g: box(W + 0.01, 0.025, 1.9, 0, 0.38, -0.35), c: 0x4d6b8a },
    { g: box(0.05, 0.03, 0.01, 0.13, 0.2, 1.435), c: LAMP }, { g: box(0.05, 0.03, 0.01, -0.13, 0.2, 1.435), c: LAMP },
  ];
  for (const z of [1.15, 0.0, -0.18, -1.0, -1.18]) for (const s of [-1, 1]) p.push({ g: wheel(0.075, 0.07, s * (W / 2 - 0.03), z), c: BLACK });
  return p;
}

function military(): Piece[] {
  const W = 0.36, OL = 0x56603f;
  const p: Piece[] = [
    { g: box(0.28, 0.06, 1.3, 0, 0.1, 0), c: BLACK }, { g: box(W - 0.02, 0.22, 0.3, 0, 0.14, 0.5), c: OL }, { g: box(W - 0.04, 0.1, 0.18, 0, 0.36, 0.46), c: OL },
    { g: box(W - 0.06, 0.07, 0.005, 0, 0.375, 0.552), c: GLASS },
    { g: box(W - 0.04, 0.34, 0.8, 0, 0.17, -0.22), c: 0x7a7760 }, { g: box(W - 0.02, 0.04, 0.8, 0, 0.5, -0.22), c: 0x6a6a52 },
    { g: box(0.05, 0.03, 0.01, 0.12, 0.2, 0.655), c: LAMP }, { g: box(0.05, 0.03, 0.01, -0.12, 0.2, 0.655), c: LAMP },
  ];
  for (const z of [0.45, -0.05, -0.38]) for (const s of [-1, 1]) p.push({ g: wheel(0.075, 0.07, s * (W / 2 - 0.03), z), c: BLACK });
  return p;
}

function rv(): Piece[] {
  const W = 0.36, L = 1.4;
  const p: Piece[] = [
    { g: box(W, 0.36, L - 0.4, 0, 0.1, -0.2), c: 0xece8dc }, { g: box(W - 0.04, 0.2, 0.34, 0, 0.1, L / 2 - 0.2), c: 0xece8dc }, { g: box(W - 0.06, 0.08, 0.1, 0, 0.3, L / 2 - 0.12), c: GLASS },
    { g: box(W + 0.004, 0.025, L - 0.4, 0, 0.3, -0.2), c: 0x3f6a8c },
    { g: box(0.05, 0.03, 0.01, 0.12, 0.17, L / 2 + 0.003), c: LAMP }, { g: box(0.05, 0.03, 0.01, -0.12, 0.17, L / 2 + 0.003), c: LAMP },
  ];
  for (const z of [0.45, -0.4]) for (const s of [-1, 1]) p.push({ g: wheel(0.075, 0.06, s * (W / 2 - 0.03), z), c: BLACK });
  return p;
}

function motorcycle(): Piece[] {
  const p: Piece[] = [
    { g: wheel(0.055, 0.025, 0, 0.14).rotateY(0), c: BLACK }, { g: wheel(0.055, 0.025, 0, -0.14), c: BLACK },
    { g: box(0.07, 0.07, 0.2, 0, 0.09, 0), c: WHITE }, { g: box(0.05, 0.05, 0.1, 0, 0.16, 0.03), c: WHITE },
    { g: box(0.16, 0.012, 0.012, 0, 0.21, 0.1), c: CHROME }, { g: box(0.025, 0.1, 0.025, 0, 0.1, 0.13), c: CHROME },
    { g: box(0.03, 0.02, 0.01, 0, 0.17, 0.17), c: LAMP },
  ];
  // the rider
  p.push({ g: box(0.07, 0.1, 0.06, 0, 0.17, -0.04), c: 0x3a3a3e }, { g: box(0.05, 0.05, 0.05, 0, 0.27, -0.02), c: 0xc8a888 }, { g: box(0.035, 0.07, 0.12, 0.05, 0.1, 0.0), c: 0x2e3340 }, { g: box(0.035, 0.07, 0.12, -0.05, 0.1, 0.0), c: 0x2e3340 });
  return p;
}

function bicycle(): Piece[] {
  const p: Piece[] = [
    { g: wheel(0.055, 0.012, 0, 0.115), c: BLACK }, { g: wheel(0.055, 0.012, 0, -0.115), c: BLACK },
    { g: box(0.014, 0.014, 0.23, 0, 0.1, 0), c: WHITE }, { g: box(0.012, 0.08, 0.012, 0, 0.1, -0.05), c: WHITE }, { g: box(0.1, 0.01, 0.01, 0, 0.19, 0.1), c: CHROME },
    { g: box(0.075, 0.1, 0.05, 0, 0.14, -0.045), c: 0x4a5a6a }, { g: box(0.045, 0.045, 0.045, 0, 0.25, -0.025), c: 0xc8a888 },
    { g: box(0.028, 0.012, 0.12, 0.035, 0.115, 0.03), c: 0x2e3340 }, { g: box(0.028, 0.012, 0.12, -0.035, 0.115, 0.03), c: 0x2e3340 },
  ];
  return p;
}

/** The raiders' truck: an old pickup with a bull bar, plates on the bed sides, roof lamps and a whip antenna with a rag on it. */
function raider(): Piece[] {
  const base = fromGroup(buildVehicle('old_pickup', WHITE));
  const RUST = 0x6a3d2a, STEEL = 0x4a4c4e;
  return [
    ...base,
    { g: box(0.34, 0.12, 0.03, 0, 0.04, 0.48), c: STEEL }, { g: box(0.03, 0.14, 0.03, 0.12, 0.04, 0.5), c: STEEL }, { g: box(0.03, 0.14, 0.03, -0.12, 0.04, 0.5), c: STEEL },
    { g: box(0.015, 0.08, 0.3, 0.17, 0.12, -0.25), c: RUST }, { g: box(0.015, 0.08, 0.3, -0.17, 0.12, -0.25), c: RUST },
    { g: box(0.2, 0.025, 0.04, 0, 0.36, 0.06), c: STEEL }, { g: box(0.03, 0.025, 0.02, 0.06, 0.385, 0.06), c: LAMP }, { g: box(0.03, 0.025, 0.02, -0.06, 0.385, 0.06), c: LAMP },
    { g: box(0.006, 0.34, 0.006, 0.15, 0.2, -0.43), c: BLACK }, { g: box(0.002, 0.05, 0.08, 0.15, 0.5, -0.47), c: 0x9a2a22 },
  ];
}

/** A person on foot, 0.28 tall; the pack variant carries a bedroll and rucksack. White torso so the instance color is the clothes. */
function walker(pack: boolean): Piece[] {
  const p: Piece[] = [
    { g: box(0.045, 0.125, 0.045, 0.026, 0, 0), c: 0x6a6a72 }, { g: box(0.045, 0.125, 0.045, -0.026, 0, 0), c: 0x6a6a72 },
    { g: box(0.11, 0.115, 0.06, 0, 0.12, 0), c: WHITE },
    { g: box(0.03, 0.1, 0.035, 0.07, 0.125, 0), c: WHITE }, { g: box(0.03, 0.1, 0.035, -0.07, 0.125, 0), c: WHITE },
    { g: box(0.05, 0.055, 0.05, 0, 0.235, 0), c: 0xc8a888 },
  ];
  if (pack) p.push({ g: box(0.1, 0.12, 0.07, 0, 0.12, -0.06), c: 0x6a5a40 }, { g: box(0.12, 0.04, 0.04, 0, 0.245, -0.06).rotateX(0), c: 0x59603e });
  return p;
}

/** A handcart: a box bed with a tarp over the load, two wheels, a pull handle. */
function cart(): Piece[] {
  return [
    { g: box(0.2, 0.04, 0.3, 0, 0.07, 0), c: 0x6a5238 }, { g: box(0.2, 0.05, 0.012, 0, 0.11, 0.15), c: 0x5a452f }, { g: box(0.2, 0.05, 0.012, 0, 0.11, -0.15), c: 0x5a452f },
    { g: box(0.012, 0.05, 0.3, 0.1, 0.11, 0), c: 0x5a452f }, { g: box(0.012, 0.05, 0.3, -0.1, 0.11, 0), c: 0x5a452f },
    { g: box(0.17, 0.07, 0.24, 0, 0.11, 0), c: 0x7b8068 },
    { g: wheel(0.06, 0.02, 0.115, 0), c: BLACK }, { g: wheel(0.06, 0.02, -0.115, 0), c: BLACK },
    { g: box(0.16, 0.012, 0.012, 0, 0.085, 0.3), c: 0x5a452f }, { g: box(0.012, 0.012, 0.16, 0.08, 0.085, 0.22), c: 0x5a452f }, { g: box(0.012, 0.012, 0.16, -0.08, 0.085, 0.22), c: 0x5a452f },
  ];
}

const BUILD: Record<MemberKind, () => Piece[]> = {
  sedan, van, bus, semi, military, rv, motorcycle, bicycle, raider, cart,
  pickup: () => fromGroup(buildVehicle('pickup', WHITE)),
  suv: () => fromGroup(buildVehicle('suv', WHITE)),
  tractor: () => fromGroup(buildVehicle('tractor', WHITE)),
  flatbed: () => fromGroup(buildTruck(WHITE)),
  walker: () => walker(false),
};

/** Kinds whose instance color tints the whole thing (paint / clothes); the rest are drawn as baked. */
export const TINTED: ReadonlySet<MemberKind> = new Set<MemberKind>(['sedan', 'pickup', 'suv', 'van', 'tractor', 'motorcycle', 'bicycle', 'walker', 'flatbed', 'raider', 'rv']);

export const PAINT = [0xc84a3a, 0x5b8fc4, 0xdedbd0, 0x9a9ea4, 0x86a85c, 0x2f3a4a, 0xd8c070, 0x6b3a3a, 0xb8b0a0];
export const CLOTHES = [0x9aa57a, 0xb08a6a, 0x6f8fb5, 0xc2b898, 0xa08aa0, 0xd09a5a, 0x8a9095, 0xd8cba8];
export const RAIDER_PAINT = [0x6a4a3a, 0x4a4a46, 0x5e3a2a, 0x3e4038];

/** Baked geometry for each kind, plus the walker with a pack. */
export function buildTrafficGeometries(): Record<MemberKind | 'walkerPack', G> {
  const out = {} as Record<MemberKind | 'walkerPack', G>;
  for (const k of Object.keys(BUILD) as MemberKind[]) out[k] = bake(BUILD[k]());
  out.walkerPack = bake(walker(true));
  return out;
}
