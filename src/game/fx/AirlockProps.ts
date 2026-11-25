/**
 * The plant yard's service airlock, fitted out (owner request 2026-11-25): a working lock a household would use, a little cozy. Low-poly vertex-colored boxes merged into the plant's
 * own mesh (fx/DomePlant), nothing here is a separate draw call, plus the label plates (cells of the shared atlas, drawn by buildkit/domeControl's layer `decor`). All of it sits within
 * about 0.12 of a side wall, so a clear lane of 0.15 (3 ft) stays down the middle for a person (0.28 tall) and the door (0.37 high, 0.32 wide) to pass.
 * Left wall: a pegboard with tool outlines, a bench with a clipboard, a shelving unit with labeled bins. Right wall: PPE hooks with hung coveralls and respirators, a fire extinguisher, a
 * first-aid box, a hand-wash and decon sink, a ladder stored sideways on brackets. Ceiling: a cable tray with a conduit and a junction box. Floor: lane stripes and a drain.
 */
import * as THREE from 'three';
import { airlockDims, airlockLoc, type YardGeom } from '../../sim/dome/plantYard';
import type { CtlCell } from '../buildkit/controlScreens';

type Face = 0 | 1 | 2 | 3 | 4 | 5;      // px nx py ny pz nz
/** Vertex colors with a baked light (tops lighter, undersides darker) and a little wear that varies by where the piece stands, so a plain box still has form in the flat-shaded plant mesh. */
const col = (g: THREE.BufferGeometry, hex: number): THREE.BufferGeometry => {
  g = g.index ? g.toNonIndexed() : g; g.deleteAttribute('uv');
  g.computeBoundingBox(); const bb = g.boundingBox!, cx = (bb.min.x + bb.max.x) / 2, cz = (bb.min.z + bb.max.z) / 2, cyy = (bb.min.y + bb.max.y) / 2;
  const h = Math.sin(cx * 91.7 + cz * 57.3 + cyy * 13.1) * 4375.85, wear = 0.93 + 0.14 * (h - Math.floor(h));
  const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3), nm = g.getAttribute('normal');
  for (let i = 0; i < n; i++) {
    const ny = nm ? nm.getY(i) : 0, k = wear * (ny > 0.5 ? 1.16 : ny < -0.5 ? 0.72 : 1 - 0.06 * Math.abs(nm ? nm.getX(i) : 0));
    a[i * 3] = Math.min(1, c.r * k); a[i * 3 + 1] = Math.min(1, c.g * k); a[i * 3 + 2] = Math.min(1, c.b * k);
  }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
};

export interface AirlockSign { cell: CtlCell; w: number; h: number; /** Center in the dome's local frame (x, z) and height above the floor. */ x: number; z: number; y: number; /** Turn about y of the plate's normal (world). */ ry: number }

/** Where things stand along the chamber: the chamber's center `cz` and its half length. */
function frameOf(g: YardGeom): { d: ReturnType<typeof airlockDims>; at: (dx: number, t: number) => [number, number] } {
  const d = airlockDims(g);
  return { d, at: (dx, t) => airlockLoc(d.fr, dx, d.cz + t) };
}

/** The fit-out as colored geometry in the dome's local frame; `floorY` is the height of the chamber's floor in that frame; `hi`: the High detail tier. */
export function airlockPieces(g: YardGeom, floorY: number, hi: boolean): THREE.BufferGeometry[] {
  const { d, at } = frameOf(g), out: THREE.BufferGeometry[] = [], X = d.pw / 2 - 0.006;      // the clear face of a side wall
  /** A box in the airlock's frame: x across, y up from the floor, z along; faces left out by index (px, nx, py, ny, pz, nz in the box's own frame). */
  const B = (w: number, h: number, dp: number, dx: number, y: number, t: number, hex: number, skip: readonly Face[] = [3]): void => {
    const geo = new THREE.BoxGeometry(w, h, dp), idx = geo.index!.array as Uint16Array, keep: number[] = [];
    for (let f = 0; f < 6; f++) if (!skip.includes(f as Face)) for (let k = 0; k < 6; k++) keep.push(idx[f * 6 + k]);
    geo.setIndex(keep); geo.translate(0, h / 2, 0); geo.rotateY(d.fr.rot);
    const [x, z] = at(dx, t); geo.translate(x, floorY + y, z); out.push(col(geo, hex));
  };
  const place = (geo: THREE.BufferGeometry, dx: number, y: number, t: number, hex: number): void => { geo.rotateY(d.fr.rot); const [x, z] = at(dx, t); geo.translate(x, floorY + y, z); out.push(col(geo, hex)); };
  /** A vertical cylinder (or one lying along the chamber with `alongZ`), 8 sides on High, a box below it. */
  const Cy = (r: number, h: number, dx: number, y: number, t: number, hex: number, sd = 8, alongZ = false): void => {
    if (!hi) { if (alongZ) B(2 * r, 2 * r, h, dx, y - r, t, hex, [3]); else B(2 * r, h, 2 * r, dx, y, t, hex, [3]); return; }      // (a box stands in for a cylinder below High)
    const geo = new THREE.CylinderGeometry(r, r, h, sd); if (alongZ) geo.rotateX(Math.PI / 2); else geo.translate(0, h / 2, 0);
    place(geo, dx, y, t, hex);
  };
  /** A galvanized hook: a short peg out from a wall rail and a down-turned tip, brighter than the wall; `sg` is the side (+1 right wall reaching in -x). */
  const GALV = 0xd2d9de;
  const hook = (wallX: number, sg: 1 | -1, y: number, t: number): void => { B(0.016, 0.006, 0.006, wallX - sg * 0.008, y, t, GALV, [0, 1, 3]); B(0.006, 0.018, 0.006, wallX - sg * 0.016, y - 0.014, t, GALV, [3]); };
  const L = -X, R = X;            // left (-x) and right (+x) wall faces; props reach inward (+x from L, -x from R). Chamber runs t -0.25 (dome end) to +0.25 (yard end)
  // ── LEFT wall, spares for the yard machinery, the stock nearest the yard end: shelving with filter cartridges, labeled bins, fuses, breakers, gaskets and belts ──
  const rk = 0.115, rl = 0.17;                                                                             // rack center and length along t
  if (hi) for (const t of [rk - rl / 2, rk + rl / 2]) B(0.012, 0.31, 0.012, L + 0.062, 0, t, GALV, [3, 2]);        // rack posts
  for (const y of hi ? [0.07, 0.15, 0.23] : [0.2]) B(0.1, 0.008, rl, L + 0.056, y, rk, 0xaab2b8);         // shelves
  const cart = hi ? 3 : 1;
  for (let k = 0; k < cart; k++) {
    const t = rk - 0.06 + k * 0.032, y = hi ? 0.078 : 0.008;
    Cy(0.014, 0.058, L + 0.056, y, t, 0xe6e1cf, 8);                                                       // spare filter cartridge (matches the intake filters)
    if (hi) { Cy(0.0148, 0.01, L + 0.056, y, t, 0x2f7fb5, 8); Cy(0.0148, 0.01, L + 0.056, y + 0.048, t, 0x2f7fb5, 8); Cy(0.0152, 0.004, L + 0.056, y + 0.026, t, 0xb9b39c, 8); }   // end caps and a pleat band
  }
  const bin = (y: number, t: number, hex: number): void => { B(0.08, 0.046, 0.06, L + 0.056, y, rk + t, hex, [3, 1]); if (hi) B(0.082, 0.006, 0.062, L + 0.056, y + 0.046, rk + t, 0x2a2f35, [3, 1]); };   // a bin with a dark lid band
  bin(hi ? 0.158 : 0.208, 0.04, 0xe3b92a); bin(hi ? 0.158 : 0.208, -0.03, 0x2f7fb5);               // fuses and filters
  if (hi) { bin(0.238, 0.04, 0xc7ccd1); bin(0.238, -0.03, 0xe8801f); }                              // gaskets and belts
  if (hi) { B(0.05, 0.026, 0.04, L + 0.056, 0.078, rk + 0.05, 0x8c9399, [3]); B(0.05, 0.026, 0.04, L + 0.056, 0.104, rk + 0.05, 0x9aa1a7, [3]); B(0.05, 0.004, 0.012, L + 0.081, 0.09, rk + 0.05, 0xc0392b, [3, 1]); }   // boxed breakers with a red stripe
  if (hi) {
    // pallet with a spare pump motor (round body, cooling fins, end bell, feet) and a coil of hose
    B(0.1, 0.014, 0.12, L + 0.054, 0, -0.07, 0xb08a52, [3]); for (const t of [-0.115, -0.07, -0.025]) B(0.1, 0.004, 0.01, L + 0.054, 0.014, t, 0x8a6a3c, [3]);
    B(0.07, 0.012, 0.05, L + 0.054, 0.014, -0.095, 0x3a4147, [3]);
    Cy(0.026, 0.07, L + 0.054, 0.052, -0.095, 0x2f6fa8, 8, true);
    for (const t of [-0.115, -0.105, -0.095, -0.085, -0.075]) Cy(0.0285, 0.004, L + 0.054, 0.052, t, 0x245a8a, 8, true);
    Cy(0.018, 0.016, L + 0.054, 0.052, -0.052, 0x23282d, 8, true); B(0.02, 0.014, 0.018, L + 0.054, 0.078, -0.095, 0xd8dcd9, [3]);
    const hose = new THREE.TorusGeometry(0.026, 0.009, 4, 9); hose.rotateX(Math.PI / 2); place(hose, L + 0.054, 0.027, -0.03, 0x23282d);
    const hose2 = new THREE.TorusGeometry(0.026, 0.009, 4, 9); hose2.rotateX(Math.PI / 2); place(hose2, L + 0.054, 0.036, -0.03, 0x2c3238);
    for (const [t, hex] of [[-0.205, 0x2f6fa8], [-0.15, 0xe8801f]] as const) { Cy(0.026, 0.078, L + 0.04, 0, t, hex, 8); Cy(0.0272, 0.007, L + 0.04, 0.012, t, 0x23282d, 8); Cy(0.0272, 0.007, L + 0.04, 0.058, t, 0x23282d, 8); Cy(0.0262, 0.012, L + 0.04, 0.031, t, 0xe8ecee, 8); Cy(0.02, 0.006, L + 0.04, 0.078, t, 0x9aa1a7, 8); }   // coolant and lube drums: dark rolling hoops, a white label band, a lid
    B(0.06, 0.07, 0.11, L + 0.034, 0.14, -0.075, 0x9aa1a7, [3, 1]); for (const y of [0.15, 0.178, 0.206]) { B(0.004, 0.022, 0.1, L + 0.066, y, -0.075, 0x4a5056, [3, 1]); B(0.006, 0.004, 0.02, L + 0.069, y + 0.009, -0.075, 0xd2d9de, [3, 1]); }   // drawer cabinet with pulls
    // spare belt, fan blade and valve handles on a galvanized rail and hooks (each touches its hook)
    B(0.014, 0.012, 0.22, L + 0.007, 0.3, -0.1, GALV, [1, 3]);
    for (const [t, w] of [[-0.19, 0.05], [-0.12, 0.036], [-0.06, 0.03]] as const) { hook(L, -1, 0.283, t); const hh = w; B(0.008, hh, w, L + 0.016, 0.283 - 0.014 - hh, t, t > -0.1 ? 0x8f969c : 0x23282d, [1, 3]); B(0.002, hh * 0.9, w * 0.9, L + 0.011, 0.283 - 0.014 - hh * 0.95, t, 0x15181b, [1, 3]); }
    for (const t of [-0.02, 0.0]) { hook(L, -1, 0.283, t); B(0.008, 0.03, 0.012, L + 0.016, 0.283 - 0.014 - 0.03, t, 0xc0392b, [1, 3]); }
  } else {
    B(0.008, 0.03, 0.03, L + 0.014, 0.25, -0.1, 0xc0392b, [1, 3]);
  }
  // ── RIGHT wall: a pegboard tool rack, PPE on hooks, an extinguisher, a first-aid box, a hand-wash sink, a ladder stored sideways ──
  B(0.012, 0.16, 0.2, R - 0.006, 0.19, -0.12, 0xece0bd, [0, 3]);                                           // pegboard (tan)
  if (hi) {
    const DK = 0x23282d, WH = 0xf0f2f2, MT = 0xc9d1d6, tool = (w: number, h: number, t: number, y: number, hex: number): void => B(0.004, h, w, R - 0.014, y, t, hex, [0, 3]);
    // hammer: handle, head, claw; wrench: shaft with a two-jaw head; saw: blade with a handle; each ringed by a white outline strip
    tool(0.012, 0.09, -0.2, 0.2, DK); tool(0.034, 0.016, -0.2, 0.284, DK); tool(0.01, 0.016, -0.179, 0.274, DK);
    tool(0.01, 0.1, -0.15, 0.2, DK); tool(0.03, 0.014, -0.15, 0.292, DK); tool(0.01, 0.026, -0.164, 0.292, 0xe8ecee); tool(0.01, 0.026, -0.136, 0.292, 0xe8ecee);
    tool(0.056, 0.04, -0.09, 0.22, DK); tool(0.01, 0.04, -0.056, 0.26, DK); tool(0.056, 0.006, -0.09, 0.262, MT);
    tool(0.01, 0.06, -0.025, 0.2, DK); tool(0.016, 0.01, -0.025, 0.26, MT);
    for (const t of [-0.222, -0.14, -0.05]) tool(0.002, 0.14, t, 0.2, WH);                                     // outline strips between the silhouettes
    for (const [t, y] of [[-0.2, 0.34], [-0.15, 0.34], [-0.09, 0.34], [-0.025, 0.34]] as const) B(0.01, 0.01, 0.01, R - 0.017, y - 0.002, t, MT, [0, 3]);   // peg heads
  } else B(0.004, 0.1, 0.012, R - 0.014, 0.22, -0.16, 0x23282d, [0, 3]);
  B(0.1, 0.09, 0.17, R - 0.05, 0, -0.12, 0xb8c1c7, [3]); if (hi) { B(0.06, 0.004, 0.11, R - 0.05, 0.091, -0.12, 0x3a4147, [3]); Cy(0.005, 0.04, R - 0.09, 0.091, -0.12, 0xd2d9de, 6); B(0.012, 0.01, 0.012, R - 0.098, 0.128, -0.12, 0xd2d9de, [3]); B(0.01, 0.01, 0.02, R - 0.045, 0.092, -0.17, 0xe8ecee, [3]); }   // sink counter, basin, tap, a soap dispenser
  const rail = 0.34;
  B(0.012, 0.012, 0.16, R - 0.006, rail, 0.06, GALV, [0, 3]);                                                 // galvanized PPE rail
  const suits: Array<[number, number]> = [[0.0, 0xe8801f], [0.06, 0xe9e6dc], [0.12, 0xe3b92a]];
  for (const [t, hex] of hi ? suits : []) { hook(R, 1, rail - 0.002, t); B(0.03, 0.13, 0.05, R - 0.022, rail - 0.016 - 0.13, t, hex, [0, 3]); B(0.026, 0.02, 0.03, R - 0.02, rail - 0.016, t, hex, [0, 3]); B(0.002, 0.13, 0.054, R - 0.009, rail - 0.016 - 0.13, t, 0x15181b, [0, 3]); }   // hung coveralls and hazmat suits with a dark contact mark on the wall behind
  if (hi) for (const t of [0.0, 0.06]) { hook(R, 1, 0.12, t); B(0.02, 0.026, 0.026, R - 0.026, 0.093, t, 0x5b6770, [0, 3]); }   // respirators on hooks of their own
  Cy(0.017, 0.08, R - 0.022, 0.0, 0.18, 0xc0392b, 8); if (hi) { B(0.014, 0.012, 0.014, R - 0.022, 0.08, 0.18, 0x2a2f35, [3]); Cy(0.0175, 0.008, R - 0.022, 0.05, 0.18, 0x23282d, 8); B(0.01, 0.008, 0.01, R - 0.006, 0.07, 0.18, GALV, [3]); }   // fire extinguisher, valve, label band, wall hook
  B(0.014, 0.042, 0.05, R - 0.008, 0.2, 0.225, 0xe8ecee, [0, 3]); if (hi) B(0.004, 0.026, 0.008, R - 0.016, 0.208, 0.225, 0xc0392b, [0, 3]); if (hi) B(0.004, 0.008, 0.026, R - 0.016, 0.217, 0.225, 0xc0392b, [0, 3]);   // first-aid box with a red cross
  const lad = [-0.22, 0.2], rg = hi ? 7 : 0;
  for (const y of hi ? [0.395, 0.43] : [0.41]) B(0.006, 0.006, lad[1] - lad[0], R - 0.016, y, (lad[0] + lad[1]) / 2, 0xe0b53a, [3]);   // a ladder stored sideways: two rails
  if (hi) for (let k = 0; k <= rg; k++) B(0.006, 0.04, 0.005, R - 0.016, 0.395, lad[0] + (lad[1] - lad[0]) * k / rg, 0xe0b53a, [3]);   // and its rungs
  if (hi) for (const t of [-0.14, 0.12]) B(0.014, 0.05, 0.014, R - 0.007, 0.39, t, GALV, [0, 3]);          // on galvanized wall brackets
  // ── ceiling: a cable tray with a conduit and a junction box; floor: lane stripes and a drain ──
  const cy = d.ph - 0.03;
  B(0.07, 0.01, 0.5, -0.11, cy, 0, 0xaab2b8, [2]); if (hi) Cy(0.008, 0.5, -0.11, cy - 0.012, 0, 0xd9822b, 6, true); if (hi) B(0.04, 0.036, 0.04, -0.11, cy - 0.046, 0.12, 0xaab2b8, [2]);
  for (const dx of [-0.085, 0.085]) B(0.008, 0.002, d.cl2 * 0.96, dx, 0.0, 0, 0xe3b92a, [3]);                    // lane stripes
  if (hi) B(0.06, 0.002, 0.06, 0, 0.0, 0.1, 0x30343a, [3]);                                                           // the drain
  return out;
}

/** The label plates (atlas cells) for the chamber's walls. */
export function airlockSigns(g: YardGeom, hi: boolean): AirlockSign[] {
  const { d, at } = frameOf(g), X = d.pw / 2 - 0.004, rot = d.fr.rot, rk = 0.115;
  const mk = (cell: CtlCell, w: number, h: number, dx: number, t: number, y: number, facing: 1 | -1): AirlockSign => { const [x, z] = at(dx, t); return { cell, w, h, x, z, y, ry: (facing > 0 ? Math.PI / 2 : -Math.PI / 2) + rot }; };
  const bx = -X + 0.056 + 0.041;                        // the front face of a bin on the rack
  return [
    mk('lbl_filters', 0.045, 0.015, bx, rk - 0.03, hi ? 0.183 : 0.233, 1), mk('lbl_fuses', 0.045, 0.015, bx, rk + 0.04, hi ? 0.183 : 0.233, 1),
    ...(hi ? [mk('lbl_gaskets', 0.045, 0.015, bx, rk + 0.04, 0.263, 1), mk('lbl_belts', 0.045, 0.015, bx, rk - 0.03, 0.263, 1)] : []),
    mk('sign_doors', 0.14, 0.026, X, -0.12, 0.44, -1), mk('sign_hv', 0.1, 0.02, -X, 0.0, 0.42, 1),
  ];
}
