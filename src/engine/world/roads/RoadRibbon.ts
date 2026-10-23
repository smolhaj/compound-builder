/**
 * RoadRibbon — a road surface draped on the terrain along a centre line:
 * a strip subdivided across its width so it follows cross-slope, lifted a
 * hair above the ground with polygon offset, UVs in world units (u across
 * 0…1, v along the length). Gravel / dirt textures come from roadTextures.
 */
import * as THREE from 'three';

export type Pt = [number, number];

export function buildRibbon(line: readonly Pt[], width: number, ground: (x: number, z: number) => number, lift = 0.018, across = 4): THREE.BufferGeometry {
  const n = line.length;
  const pos = new Float32Array(n * (across + 1) * 3);
  const uv = new Float32Array(n * (across + 1) * 2);
  let v = 0;
  for (let i = 0; i < n; i++) {
    const [x, z] = line[i];
    const [ax, az] = line[Math.max(0, i - 1)], [bx, bz] = line[Math.min(n - 1, i + 1)];
    let tx = bx - ax, tz = bz - az;
    const tl = Math.hypot(tx, tz) || 1;
    tx /= tl; tz /= tl;
    const nx = tz, nz = -tx;           // left normal
    if (i > 0) v += Math.hypot(x - line[i - 1][0], z - line[i - 1][1]);
    for (let k = 0; k <= across; k++) {
      const u = k / across, o = (u - 0.5) * width;
      const px = x + nx * o, pz = z + nz * o;
      const q = i * (across + 1) + k;
      pos[q * 3] = px; pos[q * 3 + 1] = ground(px, pz) + lift; pos[q * 3 + 2] = pz;
      uv[q * 2] = u; uv[q * 2 + 1] = v;
    }
  }
  const idx: number[] = [];
  for (let i = 0; i < n - 1; i++) for (let k = 0; k < across; k++) {
    const a = i * (across + 1) + k, b = a + 1, c = a + across + 1, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}
