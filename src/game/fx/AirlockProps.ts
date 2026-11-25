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
const col = (g: THREE.BufferGeometry, hex: number): THREE.BufferGeometry => {
  g = g.index ? g.toNonIndexed() : g; g.deleteAttribute('uv');
  const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
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
  const Cy = (r: number, h: number, dx: number, y: number, t: number, hex: number, sd = 7, alongZ = false): void => {
    if (!hi) { if (alongZ) B(2 * r, 2 * r, h, dx, y - r, t, hex, [3]); else B(2 * r, h, 2 * r, dx, y, t, hex, [3]); return; }      // (a box stands in for a cylinder below High)
    const geo = new THREE.CylinderGeometry(r, r, h, sd); if (alongZ) geo.rotateX(Math.PI / 2); else geo.translate(0, h / 2, 0);
    geo.rotateY(d.fr.rot); const [x, z] = at(dx, t); geo.translate(x, floorY + y, z); out.push(col(geo, hex));
  };
  const L = -X, R = X;            // left (-x) and right (+x) wall faces; props reach inward (+x from L, -x from R). Chamber runs t -0.25 (dome end) to +0.25 (yard end)
  // ── LEFT wall, spares for the yard machinery, the stock nearest the yard end: shelving with filter cartridges, labeled bins, fuses, breakers, gaskets and belts ──
  const rk = 0.115, rl = 0.17;                                                                             // rack center and length along t
  if (hi) for (const t of [rk - rl / 2, rk + rl / 2]) B(0.012, 0.31, 0.012, L + 0.062, 0, t, 0x4a5056, [3, 2]);        // rack posts
  for (const y of hi ? [0.07, 0.15, 0.23] : [0.2]) B(0.1, 0.008, rl, L + 0.056, y, rk, 0x7a8288);         // shelves
  const cart = hi ? 3 : 1;
  for (let k = 0; k < cart; k++) { Cy(0.014, 0.058, L + 0.056, hi ? 0.078 : 0.008, rk - 0.06 + k * 0.032, 0xe6e1cf, hi ? 8 : 6); if (hi) Cy(0.0145, 0.01, L + 0.056, 0.116, rk - 0.06 + k * 0.032, 0x2f7fb5, 8); }   // spare filter cartridges (match the intake filters)
  B(0.08, 0.05, 0.06, L + 0.056, hi ? 0.158 : 0.208, rk + 0.04, 0xe3b92a, [3, 1]); B(0.08, 0.05, 0.06, L + 0.056, hi ? 0.158 : 0.208, rk - 0.03, 0x2f7fb5, [3, 1]);   // bins: fuses and filters
  if (hi) { B(0.08, 0.05, 0.06, L + 0.056, 0.238, rk + 0.04, 0xc7ccd1, [3, 1]); B(0.08, 0.05, 0.06, L + 0.056, 0.238, rk - 0.03, 0xe8801f, [3, 1]); }   // gaskets and belts
  if (hi) { B(0.05, 0.026, 0.04, L + 0.056, 0.078, rk + 0.05, 0x8c9399, [3]); B(0.05, 0.026, 0.04, L + 0.056, 0.104, rk + 0.05, 0x9aa1a7, [3]); }   // boxed breakers
  // pallet with a spare pump motor and a coil of hose, drums of coolant and lube, a wall drawer cabinet of fittings
  if (hi) { B(0.1, 0.014, 0.12, L + 0.054, 0, -0.07, 0x9a7a4a, [3]); Cy(0.028, 0.08, L + 0.054, 0.045, -0.095, 0x2f6fa8, 9, true); } if (hi) B(0.07, 0.014, 0.05, L + 0.054, 0.014, -0.095, 0x3a4147, [3]);   // pallet, motor, its foot
  if (hi) Cy(0.03, 0.022, L + 0.054, 0.014, -0.035, 0x23282d, 9); if (hi) Cy(0.016, 0.024, L + 0.054, 0.014, -0.035, 0x5a6168, 7);   // hose coil
  for (const [t, hex] of hi ? [[-0.205, 0x2f6fa8], [-0.15, 0xe8801f]] as const : []) { Cy(0.026, 0.078, L + 0.04, 0, t, hex, hi ? 9 : 6); if (hi) Cy(0.0275, 0.008, L + 0.04, 0.034, t, 0xe8ecee, 9); }   // coolant and lube drums
  if (hi) B(0.06, 0.07, 0.11, L + 0.034, 0.14, -0.075, 0x7a8288, [3, 1]); if (hi) for (const y of [0.15, 0.178, 0.206]) B(0.004, 0.02, 0.1, L + 0.066, y, -0.075, 0x3a4147, [3, 1, 0]);   // drawer cabinet
  if (hi) B(0.012, 0.012, 0.22, L + 0.006, 0.29, -0.1, 0x4a5056, [0, 3]);                                            // hook rail: spare parts hung up
  if (hi) for (const [t, r] of [[-0.19, 0.05], [-0.12, 0.036]] as const) B(0.008, r, r, L + 0.016, 0.29 - r, t, 0x23282d, [0, 3]);      // a spare belt and a fan blade on the hooks
  if (hi) for (const [t, hex] of [[-0.2, 0xc0392b], [-0.16, 0xc0392b], [-0.02, 0xc7ccd1]] as const) B(0.008, 0.03, 0.03, L + 0.014, 0.25, t, hex, [0, 3]);          // valve handles, a spare flange
  // ── RIGHT wall: a pegboard tool rack, PPE on hooks, an extinguisher, a first-aid box, a hand-wash sink, a ladder stored sideways ──
  B(0.012, 0.16, 0.2, R - 0.006, 0.19, -0.12, 0x56605d, [0, 3, 1]);                                           // pegboard
  if (hi) for (const [t, ww, hh] of [[-0.2, 0.012, 0.1], [-0.16, 0.034, 0.014], [-0.12, 0.012, 0.12], [-0.08, 0.026, 0.02], [-0.04, 0.012, 0.09]] as const) B(0.004, hh, ww, R - 0.014, 0.2, t, 0xd8dcd9, [0, 3, 1]);   // tool outlines
  B(0.1, 0.09, 0.17, R - 0.05, 0, -0.12, 0xa9b3b9, [3]); if (hi) B(0.06, 0.004, 0.11, R - 0.05, 0.091, -0.12, 0x3a4147, [3]); if (hi) Cy(0.005, 0.04, R - 0.09, 0.091, -0.12, 0x8f979d, 6);   // sink counter, basin, tap
  B(0.012, 0.012, 0.16, R - 0.006, 0.3, 0.06, 0x4a5056, [0, 3]);                                             // hook rail
  const suits: Array<[number, number]> = [[0.0, 0xe8801f], [0.06, 0xe9e6dc], [0.12, 0xe3b92a]];
  for (const [t, hex] of hi ? suits : []) { B(0.03, 0.13, 0.05, R - 0.022, 0.17, t, hex, [0, 3]); B(0.026, 0.026, 0.026, R - 0.02, 0.3, t, hex, [0, 3]); }   // hung coveralls and hazmat suits
  if (hi) for (const t of [0.0, 0.06]) B(0.02, 0.026, 0.026, R - 0.016, 0.1, t, 0x5b6770, [0, 3]);              // respirators on the lower hooks
  Cy(0.017, 0.08, R - 0.022, 0.0, 0.18, 0xc0392b, 7); if (hi) B(0.014, 0.012, 0.014, R - 0.022, 0.08, 0.18, 0x2a2f35, [3]);   // fire extinguisher and its valve
  B(0.014, 0.042, 0.05, R - 0.008, 0.2, 0.225, 0xe8ecee, [0, 3]); if (hi) B(0.004, 0.026, 0.008, R - 0.016, 0.208, 0.225, 0xc0392b, [0, 3]); if (hi) B(0.004, 0.008, 0.026, R - 0.016, 0.217, 0.225, 0xc0392b, [0, 3]);   // first-aid box with a red cross
  const lad = [-0.22, 0.2], rg = hi ? 7 : 0;
  for (const y of hi ? [0.375, 0.41] : [0.395]) B(0.006, 0.006, lad[1] - lad[0], R - 0.012, y, (lad[0] + lad[1]) / 2, 0xc9a23a, [3]);   // a ladder stored sideways: two rails
  if (hi) for (let k = 0; k <= rg; k++) B(0.006, 0.04, 0.005, R - 0.012, 0.375, lad[0] + (lad[1] - lad[0]) * k / rg, 0xc9a23a, [3]);   // and its rungs
  if (hi) for (const t of [-0.14, 0.12]) B(0.014, 0.05, 0.014, R - 0.006, 0.37, t, 0x4a5056, [0, 3]);                 // on wall brackets
  // ── ceiling: a cable tray with a conduit and a junction box; floor: lane stripes and a drain ──
  const cy = d.ph - 0.03;
  B(0.07, 0.01, 0.5, -0.11, cy, 0, 0x7a8288, [2]); if (hi) Cy(0.008, 0.5, -0.11, cy - 0.012, 0, 0xd9822b, 6, true); if (hi) B(0.04, 0.036, 0.04, -0.11, cy - 0.046, 0.12, 0x8c9399, [2]);
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
