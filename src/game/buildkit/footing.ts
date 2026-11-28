/**
 * A footing under a building that stands over ground that falls away from its floor (docs/DECISIONS.md, "Geometry audit"): a building laid on the
 * drive (the gate garage, the motor court) or any pad the road's bed re-grades after it keeps its floor level while the ground drops 2-7 ft under
 * one end. The footing is a thin stem wall round the footprint, from the floor down to the ground at each step, so nothing hovers. Pure geometry.
 */
import * as THREE from 'three';

/** Ground more than this far (u, about 8 in) under the floor gets a footing; less is a graded edge the foundation already covers. */
export const FOOTING_MIN = 0.035;
/** The footing reaches this far (u) below the ground it stands on, so no sliver of daylight shows under it. */
export const FOOTING_BURY = 0.04;
const STEP = 0.125, T = 0.05, OUT = 0.06;

/** The boxes of a stem wall round the rect x in [-hx, hx], z in [-hz, hz1] (hz1 reaches the porch); `ground(lx, lz)` is the ground's height against the floor (0). Null when nothing hovers. */
export function footingGeometry(hx: number, hz: number, ground: (lx: number, lz: number) => number, hz1 = hz): THREE.BufferGeometry | null {
  const parts: THREE.BufferGeometry[] = [];
  const col = (cx: number, cz: number, w: number, d: number, g: number) => {
    const depth = -g + FOOTING_BURY;
    parts.push(new THREE.BoxGeometry(w, depth, d).translate(cx, -depth / 2, cz));
  };
  const edge = (a: [number, number], b: [number, number], along: 'x' | 'z') => {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(L / STEP));
    for (let i = 0; i < n; i++) {
      const t0 = i / n, t1 = (i + 1) / n;
      const x0 = a[0] + (b[0] - a[0]) * t0, z0 = a[1] + (b[1] - a[1]) * t0, x1 = a[0] + (b[0] - a[0]) * t1, z1 = a[1] + (b[1] - a[1]) * t1;
      // the lowest of five points along the column and, a hand's breadth and a stride outside the wall, where a cut bank or a steep drop may fall away faster than under it
      const o = (along === 'x' ? (z0 + z1) / 2 > 0 : (x0 + x1) / 2 > 0) ? 1 : -1;
      let g = Infinity;
      for (let k = 0; k <= 4; k++) {
        const x = x0 + (x1 - x0) * k / 4, z = z0 + (z1 - z0) * k / 4;
        for (const d of [0, OUT, 2 * OUT]) g = Math.min(g, along === 'x' ? ground(x, z + o * d) : ground(x + o * d, z));
      }
      if (g > -FOOTING_MIN) continue;
      const len = L / n;
      col((x0 + x1) / 2, (z0 + z1) / 2, along === 'x' ? len + 0.002 : T, along === 'x' ? T : len + 0.002, g);
    }
  };
  edge([-hx, -hz + T / 2], [hx, -hz + T / 2], 'x'); edge([-hx, hz1 - T / 2], [hx, hz1 - T / 2], 'x');
  edge([-hx + T / 2, -hz], [-hx + T / 2, hz1], 'z'); edge([hx - T / 2, -hz], [hx - T / 2, hz1], 'z');
  if (!parts.length) return null;
  const merged = mergeBoxes(parts);
  return merged;
}

function mergeBoxes(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  let nv = 0, ni = 0;
  for (const g of list) { nv += g.getAttribute('position').count; ni += g.index!.count; }
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), uv = new Float32Array(nv * 2), idx = new Uint32Array(ni);
  let vo = 0, io = 0;
  for (const g of list) {
    const p = g.getAttribute('position'), n = g.getAttribute('normal'), u = g.getAttribute('uv'), ix = g.index!;
    pos.set(p.array as Float32Array, vo * 3); nor.set(n.array as Float32Array, vo * 3); uv.set(u.array as Float32Array, vo * 2);
    for (let i = 0; i < ix.count; i++) idx[io + i] = ix.getX(i) + vo;
    vo += p.count; io += ix.count; g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}

/** A short key of the footing the ground asks for (empty: none), so a building can tell when new ground under it needs another. */
export function footingKey(hx: number, hz: number, ground: (lx: number, lz: number) => number, hz1 = hz): string {
  const g = footingGeometry(hx, hz, ground, hz1);
  if (!g) return '';
  g.computeBoundingBox();
  const k = `${g.getAttribute('position').count}:${g.boundingBox!.min.y.toFixed(2)}`;
  g.dispose();
  return k;
}
