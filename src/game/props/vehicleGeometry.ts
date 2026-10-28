/**
 * The fleet's vehicles (sim/vehicles.ts), procedural, at real scale
 * (SCALE v2: 1 unit ≈ 6 m): a car is 0.75 long and 0.31 wide, a bus 2.0 long.
 * Local frame: front toward +z, wheels on y = 0, centered on the middle of the
 * wheelbase. One mesh per material (body paint, black trim and tires, glass,
 * chrome, and a few accents), so a fleet is a handful of draw calls.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { kitMaterial } from '../buildkit/materials';
import type { VehicleKind } from '../../sim/vehicles';

/** Length, width, height (world units) of each kind: the scale test reads these. */
export const VEHICLE_SIZE: Record<VehicleKind, { l: number; w: number; h: number }> = {
  pickup: { l: 0.92, w: 0.34, h: 0.33 },
  suv: { l: 0.8, w: 0.335, h: 0.335 },
  old_pickup: { l: 0.89, w: 0.355, h: 0.33 },
  motorhome: { l: 1.56, w: 0.44, h: 0.62 },
  tractor: { l: 0.8, w: 0.305, h: 0.46 },
  atv: { l: 0.34, w: 0.18, h: 0.2 },
  trailer: { l: 0.76, w: 0.365, h: 0.14 },
};

type G = THREE.BufferGeometry;
const box = (w: number, h: number, d: number, x: number, y: number, z: number): G => new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z);
const wheelAt = (r: number, w: number, x: number, z: number): G => new THREE.CylinderGeometry(r, r, w, 14).rotateZ(Math.PI / 2).translate(x, r, z);
const hub = (r: number, w: number, x: number, z: number): G => new THREE.CylinderGeometry(r, r, w, 10).rotateZ(Math.PI / 2).translate(x, r, z);
interface Parts { body: G[]; trim: G[]; glass: G[]; chrome: G[]; accent: G[]; light: G[] }
const parts = (): Parts => ({ body: [], trim: [], glass: [], chrome: [], accent: [], light: [] });

const PAINT: Record<VehicleKind, number[]> = {
  pickup: [0xa23a2f, 0x3d6a9a, 0xc4c3bb, 0x6a6d72, 0x6f8a4a],
  suv: [0x4a6a47, 0x2f4a7a, 0xd2d0c8, 0x70747a, 0x8a3a33],
  old_pickup: [0xc9b377, 0x6d8a73, 0xa4492a, 0xd9d2b8],
  motorhome: [0xe4e0d4, 0xd8cfae],
  tractor: [0x3a7a30, 0xb8321f, 0x2d5fa0],
  atv: [0x2d4a2a, 0xa5322b, 0x2a2a2d],
  trailer: [0x45484c],
};

function pickup(p: Parts, old: boolean): void {
  const W = old ? 0.31 : 0.33, wr = old ? 0.068 : 0.072, L = old ? 0.82 : 0.88;
  p.trim.push(box(W - 0.06, 0.05, L - 0.1, 0, wr * 0.9, 0));                           // frame
  const cabZ = L * 0.12;
  // cab
  p.body.push(box(W, old ? 0.15 : 0.13, 0.3, 0, 0.12, cabZ));                             // lower cab
  p.body.push(box(W - 0.02, 0.095, old ? 0.22 : 0.19, 0, 0.23, cabZ - 0.03));               // cab greenhouse
  p.glass.push(box(W - 0.01, 0.065, old ? 0.215 : 0.185, 0, 0.235, cabZ - 0.03));
  p.body.push(box(W - 0.005, 0.1, old ? 0.28 : 0.26, 0, 0.12, L * 0.38));                 // hood
  p.body.push(box(W, 0.07, 0.4, 0, 0.1, -L * 0.28));                                       // bed floor/sides base
  for (const s of [-1, 1]) p.body.push(box(0.022, 0.085, 0.4, s * (W / 2 - 0.011), 0.14, -L * 0.28));   // bed sides
  p.body.push(box(W - 0.02, 0.085, 0.022, 0, 0.14, -L * 0.28 - 0.2));                      // tailgate
  p.body.push(box(W - 0.02, 0.085, 0.022, 0, 0.14, -L * 0.28 + 0.2));                      // headboard
  p.chrome.push(box(W + 0.01, 0.03, 0.02, 0, 0.065, L / 2 - 0.01));                        // front bumper
  p.chrome.push(box(W + 0.01, 0.03, 0.02, 0, 0.065, -L / 2 + 0.01));
  p.chrome.push(box(0.12, 0.05, 0.01, 0, 0.12, L / 2 - 0.004));                            // grille
  for (const s of [-1, 1]) { p.light.push(box(0.04, 0.025, 0.01, s * (W / 2 - 0.04), 0.14, L / 2 - 0.003)); }
  for (const z of [L * 0.32, -L * 0.3]) for (const s of [-1, 1]) {
    p.trim.push(wheelAt(wr, 0.045, s * (W / 2 - 0.02), z)); p.chrome.push(hub(wr * 0.5, 0.05, s * (W / 2 - 0.02), z));
    if (old) p.body.push(box(0.04, 0.03, 0.17, s * (W / 2 + 0.003), wr * 1.7, z));            // round-ish fender cap
  }
  if (old) p.accent.push(box(W + 0.002, 0.03, 0.3, 0, 0.11, cabZ));                         // two-tone stripe
}

function suv(p: Parts): void {
  const W = 0.32, wr = 0.075, L = 0.78;
  p.trim.push(box(W - 0.06, 0.05, L - 0.1, 0, wr * 0.9, 0));
  p.body.push(box(W, 0.13, L, 0, 0.1, 0));                                                // lower body
  p.body.push(box(W - 0.02, 0.095, L * 0.62, 0, 0.23, -L * 0.07));                         // cabin, tall wagon roof
  p.glass.push(box(W - 0.005, 0.065, L * 0.6, 0, 0.235, -L * 0.07));
  p.body.push(box(W - 0.005, 0.03, L * 0.26, 0, 0.225, L * 0.36 - 0.0));                    // hood slope
  p.accent.push(box(W - 0.06, 0.012, L * 0.5, 0, 0.329, -L * 0.07));                        // roof rack
  p.accent.push(box(0.02, 0.025, L * 0.5, -0.09, 0.322, -L * 0.07)); p.accent.push(box(0.02, 0.025, L * 0.5, 0.09, 0.322, -L * 0.07));
  p.chrome.push(box(W + 0.01, 0.03, 0.02, 0, 0.065, L / 2)); p.chrome.push(box(W + 0.01, 0.03, 0.02, 0, 0.065, -L / 2));
  p.trim.push(box(0.04, 0.12, 0.012, 0, 0.14, -L / 2 - 0.004));                            // spare wheel on the back door
  for (const s of [-1, 1]) { p.light.push(box(0.045, 0.025, 0.01, s * (W / 2 - 0.04), 0.14, L / 2 + 0.002)); }
  for (const z of [L * 0.3, -L * 0.28]) for (const s of [-1, 1]) {
    p.trim.push(wheelAt(wr, 0.05, s * (W / 2 - 0.02), z)); p.chrome.push(hub(wr * 0.5, 0.055, s * (W / 2 - 0.02), z));
  }
}

function motorhome(p: Parts): void {
  const W = 0.42, wr = 0.1, L = 1.5;
  p.trim.push(box(W - 0.1, 0.08, L - 0.15, 0, wr * 0.9, 0));                              // ladder frame, high
  // cab (truck cab, nose forward)
  p.body.push(box(W - 0.02, 0.2, 0.36, 0, 0.2, L / 2 - 0.2));
  p.body.push(box(W - 0.06, 0.12, 0.25, 0, 0.4, L / 2 - 0.23));
  p.glass.push(box(W - 0.05, 0.085, 0.24, 0, 0.405, L / 2 - 0.225));
  p.body.push(box(W - 0.02, 0.14, 0.14, 0, 0.2, L / 2 - 0.02));                            // hood
  // box camper
  p.body.push(box(W, 0.4, L - 0.44, 0, 0.2, -0.22));
  p.accent.push(box(W + 0.004, 0.025, L - 0.44, 0, 0.34, -0.22));                          // stripe
  for (const s of [-1, 1]) {
    p.glass.push(box(0.006, 0.09, 0.28, s * (W / 2 + 0.002), 0.43, -0.12));
    p.glass.push(box(0.006, 0.09, 0.2, s * (W / 2 + 0.002), 0.43, -0.5));
    p.accent.push(box(0.006, 0.2, 0.1, s * (W / 2 + 0.003), 0.28, -0.7));                  // locker door
  }
  p.accent.push(box(0.2, 0.025, 0.32, 0, 0.6, -0.2));                                      // roof vent / solar
  p.accent.push(box(0.3, 0.02, 0.5, 0, 0.605, -0.45));
  p.trim.push(box(0.03, 0.2, 0.03, W / 2 - 0.03, 0.4, -L / 2 + 0.02));                     // rear ladder
  p.trim.push(box(0.02, 0.4, 0.02, -0.12, 0.2, L / 2 + 0.0));                              // snorkel pipe
  p.chrome.push(box(W, 0.04, 0.025, 0, 0.1, L / 2)); p.chrome.push(box(W, 0.04, 0.025, 0, 0.1, -L / 2));
  p.light.push(box(0.05, 0.03, 0.01, W / 2 - 0.05, 0.22, L / 2 + 0.012)); p.light.push(box(0.05, 0.03, 0.01, -W / 2 + 0.05, 0.22, L / 2 + 0.012));
  for (const z of [L * 0.32, -L * 0.28, -L * 0.4]) for (const s of [-1, 1]) {
    p.trim.push(wheelAt(wr, 0.075, s * (W / 2 - 0.03), z)); p.chrome.push(hub(wr * 0.5, 0.08, s * (W / 2 - 0.03), z));
  }
}

function tractor(p: Parts): void {
  const W = 0.3, L = 0.56;
  p.trim.push(box(0.14, 0.05, L - 0.08, 0, 0.09, 0));
  p.body.push(box(0.15, 0.13, 0.3, 0, 0.12, 0.12));                                         // hood
  p.body.push(box(0.2, 0.2, 0.2, 0, 0.1, -0.1));                                            // transmission / body
  p.trim.push(box(0.1, 0.02, 0.12, 0, 0.3, -0.12));                                         // seat
  for (const s of [-1, 1]) p.accent.push(box(0.014, 0.17, 0.014, s * 0.085, 0.3, -0.06));  // ROPS arch posts
  p.accent.push(box(0.185, 0.014, 0.014, 0, 0.47 - 0.14, -0.06));
  p.chrome.push(box(0.02, 0.1, 0.02, 0.05, 0.27, 0.2));                                     // exhaust
  const rr = 0.12, fr = 0.07;
  for (const s of [-1, 1]) {
    p.trim.push(wheelAt(rr, 0.09, s * (W / 2 - 0.045), -0.13)); p.accent.push(hub(rr * 0.5, 0.095, s * (W / 2 - 0.045), -0.13));
    p.trim.push(wheelAt(fr, 0.05, s * 0.1, 0.2)); p.accent.push(hub(fr * 0.5, 0.055, s * 0.1, 0.2));
  }
  // front loader: two arms and a bucket
  for (const s of [-1, 1]) p.accent.push(box(0.014, 0.014, 0.28, s * 0.115, 0.2, 0.33));
  p.accent.push(box(0.26, 0.05, 0.04, 0, 0.1, 0.5));
  p.accent.push(box(0.26, 0.012, 0.07, 0, 0.1, 0.52));
}

function atv(p: Parts): void {
  const W = 0.17, L = 0.3, r = 0.04;
  p.body.push(box(W - 0.06, 0.05, L - 0.06, 0, 0.07, 0));
  p.body.push(box(W - 0.06, 0.04, 0.1, 0, 0.1, 0.08));                                      // tank cover
  p.trim.push(box(W - 0.08, 0.025, 0.11, 0, 0.14, -0.04));                                  // seat
  p.trim.push(box(W - 0.02, 0.012, 0.012, 0, 0.19, 0.08));                                  // handlebars
  p.trim.push(box(0.012, 0.06, 0.012, 0, 0.14, 0.08));
  p.trim.push(box(W - 0.05, 0.012, 0.09, 0, 0.115, 0.12));                                  // front rack
  p.trim.push(box(W - 0.05, 0.012, 0.09, 0, 0.115, -0.13));                                 // rear rack
  for (const z of [0.1, -0.1]) for (const s of [-1, 1]) p.trim.push(wheelAt(r, 0.05, s * (W / 2 - 0.02), z));
}

function trailer(p: Parts): void {
  const W = 0.3, L = 0.52, r = 0.055;
  p.body.push(box(W, 0.012, L, 0, 0.1, -0.02));                                              // deck
  for (const s of [-1, 1]) p.trim.push(box(0.012, 0.04, L, s * (W / 2 - 0.006), 0.1, -0.02));  // side rails
  p.trim.push(box(W, 0.04, 0.012, 0, 0.1, -0.02 - L / 2)); p.trim.push(box(W, 0.04, 0.012, 0, 0.1, -0.02 + L / 2));
  p.trim.push(box(0.03, 0.03, 0.15, 0, 0.09, 0.5 - 0.1));                                    // tongue (A-frame)
  p.chrome.push(box(0.03, 0.03, 0.03, 0, 0.09, 0.32));
  for (const s of [-1, 1]) { p.trim.push(wheelAt(r, 0.04, s * (W / 2 + 0.01), -0.08)); p.chrome.push(hub(r * 0.5, 0.045, s * (W / 2 + 0.01), -0.08)); }
}

const matCache = new Map<number, THREE.MeshStandardMaterial>();
const paint = (c: number) => { let m = matCache.get(c); if (!m) { m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.42, metalness: 0.35 }); matCache.set(c, m); } return m; };
let _trim: THREE.MeshStandardMaterial | null = null, _chrome: THREE.MeshStandardMaterial | null = null, _light: THREE.MeshStandardMaterial | null = null;
const trimMat = () => (_trim ??= new THREE.MeshStandardMaterial({ color: 0x1d1e20, roughness: 0.85 }));
const chromeMat = () => (_chrome ??= new THREE.MeshStandardMaterial({ color: 0xb8bcc0, roughness: 0.28, metalness: 0.9 }));
const lightMat = () => (_light ??= new THREE.MeshStandardMaterial({ color: 0xf2ecc8, emissive: 0x222010, roughness: 0.3 }));

/** The paint color for a vehicle (stable per id). */
export function paintFor(kind: VehicleKind, id: string): number {
  const list = PAINT[kind];
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return list[h % list.length];
}

/** A vehicle of this kind, front toward +z, wheels on y = 0. `fried`: dull and dead. */
export function buildVehicle(kind: VehicleKind, color = PAINT[kind][0]): THREE.Group {
  const p = parts();
  switch (kind) {
    case 'pickup': pickup(p, false); break;
    case 'old_pickup': pickup(p, true); break;
    case 'suv': suv(p); break;
    case 'motorhome': motorhome(p); break;
    case 'tractor': tractor(p); break;
    case 'atv': atv(p); break;
    case 'trailer': trailer(p); break;
  }
  const g = new THREE.Group();
  const add = (list: G[], mat: THREE.Material) => {
    if (!list.length) return;
    const geo = mergeGeometries(list.map(x => x.toNonIndexed()));
    if (!geo) return;
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true; m.receiveShadow = true;
    g.add(m);
  };
  const accentColor = kind === 'tractor' || kind === 'atv' ? 0xd8d4c8 : kind === 'motorhome' ? 0x3f6a8c : kind === 'old_pickup' ? 0xf0ead2 : 0x303236;
  add(p.body, paint(color));
  add(p.trim, trimMat());
  add(p.glass, kitMaterial('glass'));
  add(p.chrome, chromeMat());
  add(p.accent, paint(accentColor));
  add(p.light, lightMat());
  g.userData = { type: 'vehicle', kind };
  return g;
}
