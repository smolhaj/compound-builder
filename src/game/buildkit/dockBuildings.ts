/**
 * The dock and the marina (sim/waterfront.ts) and the boats that lie at them. Procedural, layered for construction, merged per layer x
 * material. SCALE v2 (1 unit = 6 m, M = 1 m). The pier runs along the local z axis with the deck 0.5 m above the water; the world turns it so
 * its water end is at -z (HomesteadWorld `_waterside`), and stands it on the water level, not on a graded pad.
 *
 * Boats are groups in `userData.boats` (not meshes, so showStage leaves them): one per slip, `kind` jon_boat or skiff; the world shows as
 * many of each as the stockpile holds (`boatsAtDock`).
 */
import * as THREE from 'three';
import { CELL, type KitPieceDef } from './kit';
import { M, pipe } from './interior';
import { box, Parts, type BuildOpts } from './shell';
import { kitMaterial } from './materials';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const cylY = (r: number, h: number, x: number, y: number, z: number, seg = 8) => new THREE.CylinderGeometry(r, r, h, seg).translate(x, y + h / 2, z);
const DECK = 0.5 * M;

/** A boat seen from above: a pointed bow at +x, a flat transom at -x; length L, beam B (local, centered). */
function hull(L: number, B: number, D: number, inset = 0): THREE.BufferGeometry {
  const hl = L / 2 - inset, hb = B / 2 - inset;
  const sh = new THREE.Shape([new THREE.Vector2(-hl, -hb * 0.85), new THREE.Vector2(hl * 0.45, -hb), new THREE.Vector2(hl, 0), new THREE.Vector2(hl * 0.45, hb), new THREE.Vector2(-hl, hb * 0.85)]);
  return new THREE.ExtrudeGeometry(sh, { depth: D, bevelEnabled: false, curveSegments: 1 }).rotateX(-Math.PI / 2);
}

/** A boat group: kind 'jon_boat' (3.7 m, oars) or 'skiff' (4.9 m, outboard on the transom). Local origin at the waterline, bow at +x. */
export function boatGroup(kind: 'jon_boat' | 'skiff'): THREE.Group {
  const g = new THREE.Group();
  const L = (kind === 'skiff' ? 4.9 : 3.7) * M, B = (kind === 'skiff' ? 1.9 : 1.3) * M, D = 0.45 * M;
  const parts: Array<[THREE.BufferGeometry, Parameters<typeof kitMaterial>[0]]> = [];
  parts.push([hull(L, B, D).translate(0, -0.1 * M, 0), 'aluminum']);
  parts.push([hull(L, B, 0.02 * M, 0.06 * M).translate(0, D - 0.12 * M, 0), 'enamel']);          // the inside, lighter
  for (const x of kind === 'skiff' ? [-0.3, 0.9] : [-0.1, 0.8]) parts.push([box(0.2 * M, 0.04 * M, B * 0.9, x * M, D - 0.2 * M, 0), 'wood_mid']);   // thwarts
  if (kind === 'skiff') {
    parts.push([box(0.3 * M, 0.45 * M, 0.35 * M, -L / 2 - 0.05 * M, D - 0.3 * M, 0), 'iron']);   // the 25 hp outboard on the transom
    parts.push([box(0.12 * M, 0.5 * M, 0.12 * M, -L / 2 - 0.05 * M, -0.35 * M, 0), 'iron']);
    parts.push([box(0.4 * M, 0.5 * M, 0.04 * M, -L / 2 + 0.55 * M, D - 0.2 * M, 0), 'glass']);   // a small windscreen
  } else {
    for (const sz of [-1, 1]) parts.push([pipe([0.1 * M, D - 0.1 * M, sz * B * 0.5], [0.1 * M, D - 0.05 * M, sz * (B * 0.5 + 0.9 * M)], 0.015 * M, 4), 'wood_dark']);   // oars shipped
  }
  const byMat = new Map<string, THREE.BufferGeometry[]>();
  for (const [geo, m] of parts) { const l = byMat.get(m) ?? []; l.push(geo); byMat.set(m, l); }
  for (const [m, list] of byMat) {
    const merged = mergeGeometries(list.map(x => (x.index ? x.toNonIndexed() : x)));
    list.forEach(x => x.dispose());
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, kitMaterial(m as Parameters<typeof kitMaterial>[0]));
    mesh.castShadow = true; mesh.receiveShadow = true;
    g.add(mesh);
  }
  g.userData.kind = kind;
  return g;
}

function pier(def: KitPieceDef, seed: number, marina: boolean): THREE.Group {
  const p = new Parts(seed);
  const W = (marina ? 4.5 : 3) * M, D = def.cellsZ * CELL, hw = W / 2, hd = D / 2;
  p.layer = 'stakes';
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.add('trim', box(0.012, 0.09, 0.012, sx * (def.cellsX * CELL / 2 - 0.03), -0.02, sz * (hd - 0.03)));
  // foundation: the piles, in pairs every 2.5 m, driven to the bed
  p.layer = 'foundation';
  const rows = Math.floor(D / (2.5 * M));
  for (let i = 0; i <= rows; i++) { const z = -hd + 0.25 * M + i * (D - 0.5 * M) / rows; for (const sx of [-1, 1]) p.add('wood_dark', cylY(0.14 * M, 2.4 * M, sx * (hw - 0.2 * M), -1.8 * M, z, 8)); }
  // frame: the stringers and cross beams under the deck
  p.layer = 'frame';
  for (const sx of [-1, 0, 1]) p.add('wood_mid', box(0.15 * M, 0.25 * M, D - 0.2 * M, sx * (hw - 0.25 * M), DECK - 0.3 * M, 0));
  for (let i = 0; i <= rows; i++) { const z = -hd + 0.25 * M + i * (D - 0.5 * M) / rows; p.add('wood_mid', box(W, 0.15 * M, 0.15 * M, 0, DECK - 0.36 * M, z)); }
  // deck: boards across, a hand's width apart
  p.layer = 'deck';
  const n = Math.floor(D / (0.28 * M));
  for (let i = 0; i < n; i++) p.add('deck', box(W, 0.06 * M, 0.2 * M, 0, DECK - 0.08 * M, -hd + 0.14 * M + i * 0.28 * M));
  // the marina's T-head at the water end (-z): a cross pier 9 m wide
  if (marina) {
    const tw = 9 * M, td = 3 * M, z0 = -hd + td / 2;
    for (let i = 0; i < Math.floor(tw / (0.28 * M)); i++) p.add('deck', box(0.2 * M, 0.06 * M, td, -tw / 2 + 0.14 * M + i * 0.28 * M, DECK - 0.08 * M, z0));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.add('wood_dark', cylY(0.14 * M, 2.4 * M, sx * (tw / 2 - 0.2 * M), -1.8 * M, z0 + sz * (td / 2 - 0.2 * M), 8));
    p.add('wood_mid', box(tw, 0.25 * M, 0.15 * M, 0, DECK - 0.3 * M, z0));
  }
  // roof: the marina's boat shed on the shore end, open on the water side (a gabled roof on posts, boats haul out under it)
  p.layer = 'roof';
  if (marina) {
    const sz = hd - 3.2 * M, L = 6 * M;
    for (const sx of [-1, 1]) for (const k of [0, 1, 2]) p.add('wood_dark', cylY(0.1 * M, 2.8 * M, sx * (hw - 0.1 * M), DECK, sz - L / 2 + k * L / 2, 6));
    p.add('metal_roof', box(W + 0.6 * M, 0.06 * M, L + 0.6 * M, 0, 0, 0).rotateX(0.0).translate(0, DECK + 2.9 * M, sz));
    p.add('board_batten', box(W, 1.9 * M, 0.08 * M, 0, DECK + 0.8 * M, sz + L / 2));
  }
  // openings: cleats, rubber bumpers, the ladder, the lamp, the fuel pump
  p.layer = 'openings';
  for (let i = 0; i < Math.floor(D / (1.6 * M)); i++) { const z = -hd + 0.5 * M + i * 1.6 * M; for (const sx of [-1, 1]) { p.add('iron', box(0.18 * M, 0.06 * M, 0.05 * M, sx * (hw - 0.12 * M), DECK, z)); p.add('rubber', box(0.08 * M, 0.3 * M, 0.35 * M, sx * (hw + 0.02 * M), DECK - 0.3 * M, z)); } }
  const ladderZ = -hd + 0.4 * M;
  for (const sx of [-0.18, 0.18]) p.add('steel', pipe([sx * M + hw - 0.5 * M, DECK, ladderZ], [sx * M + hw - 0.5 * M, -0.7 * M, ladderZ - 0.05 * M], 0.02 * M, 5));
  for (let k = 0; k < 4; k++) p.add('steel', box(0.36 * M, 0.025 * M, 0.025 * M, hw - 0.5 * M, DECK - 0.15 * M - k * 0.3 * M, ladderZ - 0.02 * M));
  p.add('wood_dark', cylY(0.06 * M, 2.4 * M, -hw + 0.2 * M, DECK, hd - 0.3 * M, 6));
  p.add('lamp', box(0.25 * M, 0.08 * M, 0.25 * M, -hw + 0.2 * M, DECK + 2.35 * M, hd - 0.3 * M));
  if (marina) {
    p.add('paint_red', box(0.45 * M, 1.3 * M, 0.35 * M, hw - 0.3 * M, DECK, hd - 5.5 * M));   // the fuel pump
    p.add('steel', pipe([hw - 0.3 * M, DECK + 1.1 * M, hd - 5.5 * M], [hw + 0.2 * M, DECK + 0.6 * M, hd - 5.2 * M], 0.025 * M, 5));
    p.add('rubber', pipe([-hw + 0.3 * M, DECK - 0.5 * M, hd - 6 * M], [-hw + 0.3 * M, -1.0 * M, -hd + 4 * M], 0.025 * M, 5));       // the bubbler's air line down to the diffusers
  }
  p.layer = 'interior';
  p.add('rubber', box(0.3 * M, 0.3 * M, 0.3 * M, -hw + 0.4 * M, DECK, hd - 1.2 * M));   // a coil of dock line by the lamp post
  p.collide({ x0: -hw, z0: -hd, x1: -hw + 0.04, z1: hd }, { x0: hw - 0.04, z0: -hd, x1: hw, z1: hd }, { x0: -hw, z0: hd - 0.04, x1: hw, z1: hd }, { x0: -hw, z0: -hd, x1: hw, z1: -hd + 0.04 });
  const g = p.finish();
  g.userData.chimneyTop = null;
  g.userData.keep = ['frame', 'foundation', 'deck'];
  // boats: one per slip, alongside the deck on both sides near the water end (the marina's along the finger berths, bigger ones on the T-head)
  const boats: Array<{ g: THREE.Group; kind: 'jon_boat' | 'skiff' }> = [];
  const slips = marina ? 6 : 2;
  for (let i = 0; i < slips; i++) {
    const side = i % 2 === 0 ? -1 : 1, kind = i < slips / 2 ? 'skiff' : 'jon_boat';
    const b = boatGroup(kind);
    const z = -hd + (marina ? 4.2 * M : 2.2 * M) + Math.floor(i / 2) * (marina ? 5 * M : 5 * M);
    b.position.set(side * (hw + (kind === 'skiff' ? 1.1 : 0.85) * M), -0.15 * M, z);
    b.rotation.y = Math.PI / 2;
    b.visible = false;
    g.add(b);
    boats.push({ g: b, kind });
  }
  g.userData.boats = boats;
  return g;
}

export const DOCK_BUILDERS: Record<string, (def: KitPieceDef, seed?: number, opts?: BuildOpts) => THREE.Group> = {
  boat_dock: (def, seed = 1) => pier(def, seed, false),
  marina: (def, seed = 1) => pier(def, seed, true),
};
