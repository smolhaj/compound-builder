/**
 * The stockpile yard: what is in stock, drawn as it would sit on site —
 * banded lumber bundles on stickers, fieldstone on pallets, stacks of
 * roofing sheets, door / window crates, log decks. Rebuilt when counts
 * change (small: one mesh per material).
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { kitMaterial } from '../buildkit/materials';
import type { Stock } from '../../sim/materials';

const box = (w: number, h: number, d: number, x: number, y: number, z: number) => new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z);

/** Local layout (yard frame: rows along x). Capped per kind so a huge order doesn't fill the parcel. */
export function buildStockpile(stock: Stock): THREE.Group {
  const lumber: THREE.BufferGeometry[] = [], frame: THREE.BufferGeometry[] = [], stone: THREE.BufferGeometry[] = [], roof: THREE.BufferGeometry[] = [], crate: THREE.BufferGeometry[] = [], logs: THREE.BufferGeometry[] = [];
  // Lumber: bundles 0.42 long, 4 per layer, stacked on stickers
  const nL = Math.min(stock.lumber, 40);
  for (let i = 0; i < nL; i++) {
    const layer = Math.floor(i / 4), col = i % 4;
    const y = 0.02 + layer * 0.055;
    lumber.push(box(0.42, 0.045, 0.085, -0.5, y, col * 0.095));
    if (col === 0) for (const sx of [-0.15, 0, 0.15]) frame.push(box(0.012, 0.01, 0.38, -0.5 + sx, y - 0.01, 0.14));
  }
  // Fieldstone: a pallet each with a mounded heap, two rows
  const nS = Math.min(stock.fieldstone, 16);
  for (let i = 0; i < nS; i++) {
    const x = 0.05 + (i % 4) * 0.17, z = Math.floor(i / 4) * 0.17;
    frame.push(box(0.15, 0.02, 0.15, x, 0, z));
    for (let k = 0; k < 7; k++) {
      const a = k * 2.4, r = k === 0 ? 0 : 0.04;
      stone.push(new THREE.DodecahedronGeometry(0.03, 0).translate(x + Math.cos(a) * r, 0.045 + (k === 0 ? 0.03 : 0), z + Math.sin(a) * r));
    }
  }
  // Roofing: sheet stacks on blocks
  const nR = Math.min(stock.roofing, 16);
  for (let i = 0; i < nR; i++) roof.push(box(0.5, 0.012, 0.15, 0.85 + 0.0, 0.02 + i * 0.014, 0.05));
  if (nR) frame.push(box(0.03, 0.02, 0.15, 0.68, 0, 0.05), box(0.03, 0.02, 0.15, 1.02, 0, 0.05));
  // Hardware: crates
  const nH = Math.min(stock.hardware, 8);
  for (let i = 0; i < nH; i++) crate.push(box(0.1, 0.08, 0.1, 0.72 + (i % 4) * 0.12, Math.floor(i / 4) * 0.08, 0.32));
  // Logs: a log deck on two skids
  const nG = Math.min(stock.logs, 30);
  for (let i = 0; i < nG; i++) {
    const layer = Math.floor(i / 6), col = i % 6;
    logs.push(new THREE.CylinderGeometry(0.035, 0.04, 0.6, 7).rotateZ(Math.PI / 2).translate(-0.5, 0.04 + layer * 0.065, 0.55 + col * 0.075 + (layer % 2) * 0.035));
  }
  const g = new THREE.Group();
  const add = (list: THREE.BufferGeometry[], mat: THREE.Material) => {
    if (!list.length) return;
    const geo = mergeGeometries(list.map(x => { const n = x.index ? x.toNonIndexed() : x; n.deleteAttribute('uv'); return n; }));
    if (!geo) return;
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true; m.receiveShadow = true;
    g.add(m);
  };
  add(lumber, new THREE.MeshStandardMaterial({ color: 0xd9bd8c, roughness: 0.8 }));
  add(frame, kitMaterial('deck'));
  add(stone, new THREE.MeshStandardMaterial({ color: 0x9a9284, roughness: 0.95 }));
  add(roof, new THREE.MeshStandardMaterial({ color: 0x7a3428, roughness: 0.5, metalness: 0.4 }));
  add(crate, new THREE.MeshStandardMaterial({ color: 0xb08a5a, roughness: 0.85 }));
  add(logs, new THREE.MeshStandardMaterial({ color: 0x6a5038, roughness: 0.9 }));
  g.userData = { type: 'stockpile' };
  return g;
}
