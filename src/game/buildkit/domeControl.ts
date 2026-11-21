/**
 * The arcology's control block, drawn (sim/dome/controlBlock.ts is its plan): one armored building with five labeled wings (Power, Water, Climate, Doors and airlocks, Security)
 * round a glass-walled Operations Room with console desks, chairs and a wall of screens. Everything rides the dome's own layer x material merges (no new draw call except the one
 * shared emissive screen sheet and one interior material): panel_steel / panel_dark / panel_light carry their painted-steel textures and normal maps, the screens, nameplates
 * and lamp swatches are cells of the shared atlas (controlScreens.ts). Faces that cannot be seen (a box's underside, the sides that sit against a neighbor) are left out.
 * Block-local frame: x across (the yard side is `yardSide`), y up from the floor, z toward the front (the dome's centre). SCALE v2: a person 0.28, a door 0.37.
 */
import * as THREE from 'three';
import type { BuildLayer, Parts } from './shell';
import type { KitMaterialId } from './materials';
import type { DetailTier } from './buildingDetail';
import { CB_H, type ControlBlockPlan } from '../../sim/dome/controlBlock';
import { CTL_CELLS, type CtlCell } from './controlScreens';

type Face = 'px' | 'nx' | 'py' | 'ny' | 'pz' | 'nz';
const FACE_AT: Record<Face, number> = { px: 0, nx: 1, py: 2, ny: 3, pz: 4, nz: 5 };
/** Longest straight piece of a wall before it is split (the block is curved: each piece is a chord of the arc, so a wall bends in short flat runs). */
let SEG = 0.9;

/** A box standing on y (its bottom) with chosen faces left out (the underside by default); a wide box is split into chords along x so the bend can curve it. */
export function bx(w: number, h: number, d: number, x: number, y: number, z: number, skip: readonly Face[] = ['ny']): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d, Math.max(1, Math.ceil(w / SEG)), 1, 1).translate(x, y + h / 2, z);
  if (!skip.length) return g;
  const idx = g.index!.array as Uint16Array | Uint32Array, drop = new Set(skip.map(f => FACE_AT[f])), keep: number[] = [];
  g.groups.forEach(gr => { if (!drop.has(gr.materialIndex!)) for (let k = gr.start; k < gr.start + gr.count; k++) keep.push(idx[k]); });
  g.clearGroups(); g.setIndex(keep);
  return g;
}
/** A vertical cylinder standing on y. */
const cy = (r: number, h: number, x: number, y: number, z: number, seg = 10, r2 = r): THREE.BufferGeometry => new THREE.CylinderGeometry(r2, r, h, seg).translate(x, y + h / 2, z);

/** A screen face of an atlas cell, turned `ry` about y (0 faces +z), its bottom-centre at (x, y, z); a wide one is split so the bend curves it with the wall. */
function scr(cell: CtlCell, w: number, h: number, x: number, y: number, z: number, ry = 0, rx = 0): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(w, h, Math.max(1, Math.ceil(w / SEG)), 1), [cx, cyy, cw, ch] = CTL_CELLS[cell], uv = g.getAttribute('uv');
  for (let k = 0; k < uv.count; k++) uv.setXY(k, (cx + uv.getX(k) * cw) / 1024, 1 - (cyy + (1 - uv.getY(k)) * ch) / 1024);
  g.translate(0, h / 2, 0);
  if (rx) g.rotateX(rx);
  g.rotateY(ry).translate(x, y, z);
  g.userData.keepUV = true;
  return g;
}
/** A lamp swatch (0 red, 1 amber, 2 green, 3 white) as a small square facing +z turned by ry. */
function lamp(i: number, w: number, h: number, x: number, y: number, z: number, ry = 0, rx = 0): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(w, h), [cx, cyy] = CTL_CELLS.ctl_lamps, uv = g.getAttribute('uv');
  for (let k = 0; k < uv.count; k++) uv.setXY(k, (cx + i * 32 + 4 + uv.getX(k) * 24) / 1024, 1 - (cyy + 4 + (1 - uv.getY(k)) * 24) / 1024);
  if (rx) g.rotateX(rx);
  g.rotateY(ry).translate(x, y + h / 2, z);
  g.userData.keepUV = true;
  return g;
}

export function addControlBlock(p: Parts, plan: ControlBlockPlan, detail: DetailTier): void {
  const hi = detail === 'high', mid = detail !== 'low';
  SEG = hi ? 0.9 : 1.2;
  const { w, d, yardSide: s } = plan, hw = w / 2, hd = d / 2, e = 0.95, FY = 0.01, zo = -0.25, z0 = -0.05;
  // the bend: the block's frame (x along the arc of the middle radius, z in toward the dome's centre) becomes the curved block: radius rho - z, angle angle - x / rho, so the back and front
  // walls are arcs concentric with the shell and the end caps are radial
  const place = (g: THREE.BufferGeometry): THREE.BufferGeometry => {
    const pos = g.getAttribute('position');
    for (let i = 0; i < pos.count; i++) { const lx = pos.getX(i), lz = pos.getZ(i), rr = plan.rho - lz, th = plan.angle - lx / plan.rho; pos.setXYZ(i, rr * Math.sin(th), pos.getY(i) + FY, rr * Math.cos(th)); }
    pos.needsUpdate = true; g.deleteAttribute('normal');
    return g;
  };
  const A = (layer: BuildLayer, m: KitMaterialId, g: THREE.BufferGeometry): void => p.add(m, place(g), layer);
  const yardCol = (a: number, b: number): [number, number] => (s > 0 ? [a, b] : [-b, -a]), gateCol = (a: number, b: number): [number, number] => (s > 0 ? [-b, -a] : [a, b]);
  const boxXZ = (x0: number, x1: number, zz0: number, zz1: number, h: number, y = 0, skip: readonly Face[] = ['ny']): THREE.BufferGeometry => bx(x1 - x0, h, zz1 - zz0, (x0 + x1) / 2, y, (zz0 + zz1) / 2, skip);
  const wings: Array<{ x: [number, number]; z: [number, number]; h: number; out: 1 | -1; band: KitMaterialId; name: string }> = [
    { x: yardCol(e, hw), z: [-hd, z0], h: CB_H.tall, out: s, band: 'paint_yellow', name: 'power' },
    { x: yardCol(e, hw), z: [z0, hd], h: 0.58, out: s, band: 'panel_light', name: 'water' },
    { x: [-e, e], z: [-hd, zo], h: 0.7, out: s, band: 'paint_green', name: 'air' },
    { x: gateCol(e, hw), z: [-hd, z0], h: 0.66, out: (-s) as 1 | -1, band: 'paint_red', name: 'sec' },
    { x: gateCol(e, hw), z: [z0, hd], h: 0.52, out: (-s) as 1 | -1, band: 'paint_yellow', name: 'doors' },
  ];

  // ── the pad: a plinth under the whole footprint and the landing in front of the door ──
  A('walls', 'concrete', bx(w + 0.12, 0.034, d + 0.12, 0, -0.02, 0, ['ny']));
  A('walls', 'concrete', bx(0.62, 0.02, 0.26, 0, -0.02, hd + 0.2, ['ny']));
  // ── the wings' armored shells (in the layer that casts shadows: the block throws a real shadow), a dark base skirt, an accent band and a parapet cap ──
  for (const wg of wings) {
    const [x0, x1] = wg.x, [za, zb] = wg.z;
    A('openings', 'panel_steel', boxXZ(x0, x1, za, zb, wg.h, 0.014));
    A('walls', 'panel_dark', boxXZ(x0 - 0.008, x1 + 0.008, za - 0.008, zb + 0.008, 0.07, 0.014, ['ny', 'py']));             // the base skirt
    A('openings', wg.band, boxXZ(x0 - 0.006, x1 + 0.006, za - 0.006, zb + 0.006, 0.026, wg.h - (wg.name === 'sec' ? 0.2 : 0.1), ['ny', 'py']));              // the accent band under the parapet
    const pt = wg.h + 0.014, pw = 0.03;      // the parapet: a raised rim of four bars round the roof edge (the roof itself stays a plain slab)
    A('walls', 'panel_light', boxXZ(x0 - 0.012, x1 + 0.012, za - 0.012, za + pw, 0.03, pt - 0.004, ['ny']));
    A('walls', 'panel_light', boxXZ(x0 - 0.012, x1 + 0.012, zb - pw, zb + 0.012, 0.03, pt - 0.004, ['ny']));
    A('walls', 'panel_light', boxXZ(x0 - 0.012, x0 + pw, za + pw, zb - pw, 0.03, pt - 0.004, ['ny']));
    A('walls', 'panel_light', boxXZ(x1 - pw, x1 + 0.012, za + pw, zb - pw, 0.03, pt - 0.004, ['ny']));
  }
  // pilasters: a rib every few inches on the outer faces (the painted panels' own relief reads at a distance; the ribs add depth up close)
  if (hi) for (const wg of wings) {
    if (wg.name === 'power' || wg.name === 'sec' || wg.name === 'doors') continue;      // (their outer faces carry louvers, signs and slits)
    const [x0, x1] = wg.x, [za, zb] = wg.z, ox = wg.out > 0 ? x1 : x0;
    for (let z = za + 0.12; z < zb - 0.05; z += 0.2) A('walls', 'panel_dark', bx(0.014, wg.h - 0.2, 0.026, ox + wg.out * 0.006, 0.09, z, ['ny', 'nx', 'px'].filter(f => f !== (wg.out > 0 ? 'px' : 'nx')) as Face[]));
    if (wg.name !== 'air') for (const xx of [(x0 + x1) / 2]) A('walls', 'panel_dark', bx(0.03, wg.h - 0.2, 0.014, xx, 0.09, wg.z[0] - 0.004, ['ny', 'pz']));
  }

  // ── the Operations Room: glass front on a dark sill, mullions, a header with its nameplate, a glazed roof strip, a canopy over the door ──
  const ox0 = -e, ox1 = e;
  A('openings', 'panel_dark', bx(2 * e, 0.07, 0.03, 0, 0.014, hd, ['ny']));                           // the sill band
  A('openings', 'panel_dark', bx(2 * e, 0.075, 0.03, 0, 0.455, hd, ['ny']));                           // the header band
  A('openings', 'glass', bx(2 * e - 0.04, 0.36, 0.01, 0, 0.088, hd - 0.004, ['ny', 'py', 'px', 'nx']));  // the glass
  const nm = Math.max(4, Math.round(2 * e / 0.3));
  for (let k = 0; k <= nm; k++) { const x = ox0 + 0.02 + (2 * e - 0.04) * k / nm; if (Math.abs(x) < 0.22 && Math.abs(x) > 0.01) continue; A('openings', 'panel_steel', bx(0.014, 0.4, 0.026, x, 0.07, hd + 0.004, ['ny'])); }
  A('openings', 'panel_steel', bx(0.016, 0.4, 0.03, -0.17, 0.07, hd + 0.006, ['ny'])); A('openings', 'panel_steel', bx(0.016, 0.4, 0.03, 0.17, 0.07, hd + 0.006, ['ny']));
  A('openings', 'panel_dark', bx(0.36, 0.022, 0.04, 0, 0.35, hd + 0.006, ['ny']));                         // the door's head
  for (const sx of [-0.04, 0.04]) A('openings', 'panel_light', bx(0.008, 0.05, 0.012, sx, 0.17, hd + 0.03, ['ny']));      // pull bars
  A('openings', 'panel_dark', bx(0.012, 0.34, 0.02, 0, 0.014, hd + 0.01, ['ny']));                              // the door's centre stile
  // the canopy over the door, on two posts, with a lamp under it
  A('openings', 'panel_dark', bx(0.46, 0.018, 0.2, 0, 0.395, hd + 0.11, ['ny']));
  for (const sx of [-0.2, 0.2]) A('openings', 'panel_dark', bx(0.014, 0.38, 0.014, sx, 0.014, hd + 0.19, ['ny']));
  A('walls', 'lamp', bx(0.14, 0.005, 0.02, 0, 0.39, hd + 0.13, ['py']));
  // the roof: rear strip, front strip and two side strips round a glazed skylight over the consoles
  const rt = CB_H.ops;
  A('openings', 'panel_steel', boxXZ(ox0, ox1, zo, zo + 0.26, 0.026, rt - 0.012, ['ny']));
  A('openings', 'panel_steel', boxXZ(ox0, ox1, hd - 0.2, hd + 0.02, 0.026, rt - 0.012, ['ny']));
  for (const side of [-1, 1]) A('openings', 'panel_steel', boxXZ(side < 0 ? ox0 : 0.75, side < 0 ? -0.75 : ox1, zo + 0.26, hd - 0.2, 0.026, rt - 0.012, ['ny']));
  A('openings', 'glass', bx(1.5, 0.008, hd - 0.2 - (zo + 0.26), 0, rt, (hd - 0.2 + zo + 0.26) / 2, ['ny']));
  for (let k = 0; k <= 4; k++) A('openings', 'panel_dark', bx(0.014, 0.014, hd - 0.2 - (zo + 0.26), -0.75 + k * 0.375, rt + 0.004, (hd - 0.2 + zo + 0.26) / 2, ['ny']));
  A('walls', 'panel_light', boxXZ(ox0, ox1, hd - 0.02, hd + 0.03, 0.026, rt + 0.016, ['ny']));            // the front parapet
  // the DOME CONTROL gantry on the roof's front edge (a lit board on two posts) and the OPERATIONS plate on the header
  for (const sx of [-0.42, 0.42]) A('openings', 'panel_dark', bx(0.02, 0.2, 0.02, sx, rt + 0.04, hd - 0.05, ['ny']));
  A('openings', 'panel_dark', bx(0.96, 0.17, 0.02, 0, rt + 0.12, hd - 0.05, ['ny']));
  A('decor', 'screens', scr('sign_ctl', 0.9, 0.169, 0, rt + 0.125, hd - 0.036));
  A('decor', 'screens', scr('sign_ops', 0.46, 0.086, 0, 0.452, hd + 0.017));

  // ── the interior (layer `interior`: it stays in the cutaway view): floor, desks, chairs, consoles ──
  A('interior', 'concrete', bx(2 * e - 0.02, 0.01, hd - zo - 0.02, 0, -0.012, (hd + zo) / 2 + 0.0, ['ny']));
  const desk = (x: number, z: number): void => {
    A('interior', 'panel_dark', bx(0.5, 0.11, 0.12, x, 0, z, ['ny']));
    A('interior', 'panel_dark', bx(0.52, 0.012, 0.15, x, 0.11, z + 0.01, ['ny']));
    if (mid) { A('interior', 'panel_dark', bx(0.16, 0.014, 0.04, x - 0.1, 0.123, z + 0.045, ['ny'])); A('interior', 'panel_dark', bx(0.03, 0.03, 0.02, x + 0.13, 0.123, z - 0.01, ['ny'])); }
    for (const dx of [-0.13, 0.13]) { A('interior', 'panel_dark', bx(0.012, 0.02, 0.012, x + dx, 0.123, z - 0.03, ['ny'])); A('interior', 'screens', scr(((dx < 0) ? 'ctl_mon_a' : 'ctl_mon_b'), 0.125, 0.1, x + dx, 0.14, z - 0.025, 0)); A('interior', 'panel_dark', bx(0.135, 0.11, 0.012, x + dx, 0.13, z - 0.034, ['ny', 'pz'])); }
  };
  const chair = (x: number, z: number): void => {
    A('interior', 'panel_dark', bx(0.085, 0.012, 0.085, x, 0.065, z, ['ny']));
    A('interior', 'panel_dark', bx(0.085, 0.07, 0.01, x, 0.077, z + 0.046, ['ny']));
    A('interior', 'panel_dark', bx(0.014, 0.065, 0.014, x, 0, z, ['ny', 'py']));
    if (hi) A('interior', 'panel_dark', bx(0.1, 0.008, 0.1, x, 0, z, ['ny']));
  };
  const rows: Array<[number, number[]]> = [[-0.04, [-0.62, 0, 0.62]], [0.42, [-0.56, 0.56]]];
  for (const [z, xs] of rows) for (const x of xs) { desk(x, z); chair(x, z + 0.17); }
  // the wall of screens on the Climate wing's front face: four system boards over a security board and the dome overview
  const wz = zo + 0.012;
  const board: Array<[CtlCell, number, number, number, number]> = [['ctl_power', -0.69, 0.3, 0.38, 0.19], ['ctl_water', -0.23, 0.3, 0.38, 0.19], ['ctl_air', 0.23, 0.3, 0.38, 0.19], ['ctl_doors', 0.69, 0.3, 0.38, 0.19], ['ctl_sec', -0.6, 0.06, 0.36, 0.18], ['ctl_map', 0.22, 0.04, 0.78, 0.26]];
  for (const [c, x, y, ww, hh] of board) { A('openings', 'panel_dark', bx(ww + 0.02, hh + 0.02, 0.012, x, y - 0.01, zo + 0.002, ['ny', 'nz'])); A('decor', 'screens', scr(c, ww, hh, x, y, wz + 0.002)); }
  A('openings', 'panel_dark', bx(2 * e - 0.04, 0.04, 0.03, 0, 0, zo + 0.014, ['ny']));       // the console rail under the board
  for (const sx of [-0.55, 0.55]) A('decor', 'screens', lamp(3, 0.9, 0.03, sx, rt - 0.03, 0.12, 0, Math.PI / 2));         // the ceiling light strips (white swatch, facing down)
  for (const sx of [-0.55, 0.55]) A('decor', 'screens', lamp(3, 0.9, 0.03, sx, rt - 0.03, 0.5, 0, Math.PI / 2));

  const ch = 0.7;
  A('decor', 'screens', scr('sign_air', 0.5, 0.094, 0, 0.585, zo + 0.006));
  for (const ax of [-0.45, 0.45]) { A('walls', 'panel_light', bx(0.62, 0.15, 0.36, ax, ch + 0.014, -hd + 0.4, ['ny'])); A('walls', 'panel_dark', bx(0.64, 0.02, 0.38, ax, ch + 0.14, -hd + 0.4, ['ny'])); A('walls', 'panel_dark', cy(0.1, 0.03, ax, ch + 0.16, -hd + 0.4, hi ? 14 : 8)); A('walls', 'panel_light', cy(0.012, 0.02, ax, ch + 0.19, -hd + 0.4, 6)); }
  A('walls', 'panel_light', bx(0.13, 0.13, 1.0, 0, ch + 0.014, -hd + 0.2, ['ny']));      // the duct trunk

  // ── Power (yard side, back row): the tallest wing: cooling fans on the roof, louvers and a heavy cable entry on the yard-side face, a warning sign ──
  { const [x0, x1] = wings[0].x, xc = (x0 + x1) / 2, ox = s * hw, wh = wings[0].h;
    A('decor', 'screens', scr('sign_power', 0.5, 0.094, xc, wh - 0.195, z0 + 0.006));
    A('decor', 'screens', scr('sign_power', 0.5, 0.094, ox + s * 0.006, 0.58, -0.45, s > 0 ? Math.PI / 2 : -Math.PI / 2));
    A('decor', 'screens', scr('sign_hv', 0.34, 0.064, ox + s * 0.006, 0.42, -0.45, s > 0 ? Math.PI / 2 : -Math.PI / 2));
    for (let k = 0; k < (hi ? 6 : 2); k++) A('walls', 'panel_dark', bx(0.012, hi ? 0.016 : 0.1, 0.34, ox + s * 0.006, 0.14 + k * (hi ? 0.04 : 0.12), -0.22, ['ny', s > 0 ? 'nx' : 'px']));
    A('walls', 'panel_dark', bx(0.05, 0.12, 0.12, ox + s * 0.025, 0.014, -0.6, ['ny'])); A('walls', 'panel_light', bx(0.02, 0.07, 0.07, ox + s * 0.056, 0.04, -0.6, ['ny']));       // the cable entry flange
    A('walls', 'panel_dark', bx(0.05, 0.12, 0.12, ox + s * 0.025, 0.1, -0.12, ['ny'])); A('walls', 'panel_light', bx(0.02, 0.08, 0.08, ox + s * 0.056, 0.12, -0.12, ['ny']));       // the chilled-water duct's flange
    for (const fz of [-0.3, -0.7]) { A('walls', 'panel_dark', cy(0.09, 0.04, xc, wh + 0.016, fz, hi ? 14 : 8)); A('walls', 'panel_light', bx(0.2, 0.05, 0.2, xc, wh + 0.016, fz, ['ny', 'py'])); }
    A('walls', 'panel_light', bx(0.5, 0.012, 0.012, xc, wh + 0.1, -0.5)); }

  // ── Water (yard side, front row): two treatment tanks on the roof with risers, a pipe entry on the yard-side face, the personnel door ──
  { const [x0, x1] = wings[1].x, xc = (x0 + x1) / 2, ox = s * hw, wh = wings[1].h;
    A('decor', 'screens', scr('sign_water', 0.5, 0.094, xc, 0.4, hd + 0.006));
    A('walls', 'panel_dark', bx(0.16, 0.34, 0.016, xc + s * 0.1, 0.014, hd + 0.008, ['ny'])); A('openings', 'paint_yellow', bx(0.16, 0.03, 0.02, xc + s * 0.1, 0.014, hd + 0.011, ['ny']));
    A('walls', 'panel_dark', bx(0.05, 0.12, 0.12, ox + s * 0.025, 0.014, 0.42, ['ny'])); A('walls', 'panel_light', bx(0.02, 0.07, 0.07, ox + s * 0.056, 0.04, 0.42, ['ny']));
    for (const tz of [0.22, 0.7]) { A('walls', 'panel_light', cy(0.1, 0.32, xc - s * 0.12 + s * 0.04, wh + 0.016, tz, hi ? 16 : 8)); A('walls', 'panel_dark', cy(0.104, 0.014, xc - s * 0.08, wh + 0.33, tz, hi ? 16 : 8)); A('walls', 'panel_dark', cy(0.016, 0.1, xc - s * 0.08, wh + 0.34, tz, 6)); A('walls', 'panel_dark', cy(0.012, 0.3, xc + s * 0.25, wh + 0.016, tz, 6)); }
    A('walls', 'panel_dark', bx(0.012, 0.012, 0.52, xc + s * 0.25, wh + 0.28, 0.46, ['ny'])); }

  // ── Security (gate side, back row): slit windows, a mast with a lit tip, camera heads on the corners ──
  { const [x0, x1] = wings[3].x, xc = (x0 + x1) / 2, ox = -s * hw, wh = wings[3].h, t = -s;
    A('decor', 'screens', scr('sign_sec', 0.5, 0.094, xc, wh - 0.115, z0 + 0.006));
    A('decor', 'screens', scr('sign_sec', 0.5, 0.094, ox + t * 0.006, 0.5, -0.45, t > 0 ? Math.PI / 2 : -Math.PI / 2));
    for (const sz of [-0.8, -0.45, -0.1]) A('walls', 'panel_dark', bx(0.012, 0.045, 0.2, ox + t * 0.005, 0.3, sz, ['ny', t > 0 ? 'nx' : 'px']));
    A('walls', 'panel_dark', cy(0.014, 0.4, xc, wh + 0.016, -0.6, 6)); A('walls', 'lamp', new THREE.SphereGeometry(0.02, 8, 6).translate(xc, wh + 0.43, -0.6));
    if (mid) for (const cz of [-hd + 0.02, z0 - 0.02]) { A('walls', 'panel_light', new THREE.SphereGeometry(0.03, hi ? 10 : 6, 5).translate(ox + t * 0.02, wh - 0.13, cz)); A('walls', 'panel_dark', bx(0.02, 0.04, 0.02, ox + t * 0.012, wh - 0.18, cz, ['ny'])); }
    if (hi) { A('walls', 'panel_light', new THREE.CylinderGeometry(0.1, 0.01, 0.05, 12, 1, true).rotateX(-0.9).translate(xc + t * 0.2, wh + 0.1, -0.2)); A('openings', 'paint_red', bx(0.04, 0.04, 0.04, xc - t * 0.2, wh + 0.016, -0.2, ['ny'])); } }

  // ── Doors and airlocks (gate side, front row): the door board seen through a window on the gate-side face, a state lamp stack, the personnel door ──
  { const [x0, x1] = wings[4].x, xc = (x0 + x1) / 2, ox = -s * hw, t = -s, ry = t > 0 ? Math.PI / 2 : -Math.PI / 2;
    A('decor', 'screens', scr('sign_doors', 0.5, 0.094, xc, 0.4, hd + 0.006));
    for (const [fy, fh, fz, fd] of [[0.115, 0.03, 0.45, 0.62], [0.385, 0.03, 0.45, 0.62], [0.115, 0.3, 0.14, 0.03], [0.115, 0.3, 0.76, 0.03]] as const) A('openings', 'panel_dark', bx(0.02, fh, fd, ox + t * 0.01, fy, fz, ['ny']));        // the window's frame (four bars: the board shows through)
    A('openings', 'glass', bx(0.008, 0.26, 0.56, ox + t * 0.014, 0.14, 0.45, ['ny', 'py', 'pz', 'nz', t > 0 ? 'nx' : 'px']));
    A('decor', 'screens', scr('ctl_doors', 0.46, 0.23, ox + t * 0.003, 0.155, 0.45, ry));
    // the state lamp stack: three lamps matching the entrance's (red sealed, amber cycling, green open) on a post by the wing's front corner
    A('walls', 'panel_dark', bx(0.016, 0.34, 0.016, xc + t * 0.22, 0.014, hd + 0.12, ['ny'])); A('walls', 'panel_dark', bx(0.07, 0.19, 0.022, xc + t * 0.22, 0.16, hd + 0.12, ['ny']));
    [0, 1, 2].forEach(i => A('decor', 'screens', lamp(i, 0.04, 0.04, xc + t * 0.22, 0.17 + i * 0.058, hd + 0.133)));
    A('walls', 'panel_dark', bx(0.16, 0.34, 0.016, xc - t * 0.12, 0.014, hd + 0.008, ['ny'])); A('openings', 'paint_yellow', bx(0.16, 0.03, 0.02, xc - t * 0.12, 0.014, hd + 0.011, ['ny'])); }

  // ── the front corners' lamps and the base of the whole block darkened (contact shade) ──
  for (const sx of [-hw, hw]) { A('walls', 'panel_dark', bx(0.03, 0.2, 0.03, sx, 0.014, hd + 0.01, ['ny'])); A('walls', 'lamp', bx(0.02, 0.025, 0.02, sx, 0.25, hd + 0.01, ['ny'])); }
  p.collide(...plan.colliders);
}
