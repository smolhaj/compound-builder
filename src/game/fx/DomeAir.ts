/**
 * What the dome's air looks like from outside and in (sim/dome/live.ts `domeLook`): a faint inner haze that thickens with CO2 and dust, a cool
 * sealed tint, and a grove of grow-bed plants when the closed ecology runs. Two meshes, no lights; it rides in the dome's own group.
 * SCALE v2: a person 0.28, shrubs 0.05 to 0.12.
 */
import * as THREE from 'three';
import { mulberry32 } from '../../sim/rng';

export interface DomeAirFx { group: THREE.Group; apply(look: { sealed: boolean; haze: number; plants: number; dust: number }): void; dispose(): void }

/** `r`: shell radius in world units; `ground(lx, lz)`: terrain height in the dome's local frame (0 = the shell's base). */
export function makeDomeAir(r: number, ground: (lx: number, lz: number) => number): DomeAirFx {
  const group = new THREE.Group();
  group.name = 'dome_air';
  const hazeGeo = new THREE.SphereGeometry(r * 0.985, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2);
  const hazeMat = new THREE.MeshBasicMaterial({ color: 0xc9c2a4, transparent: true, opacity: 0, side: THREE.BackSide, depthWrite: false, fog: true });
  const haze = new THREE.Mesh(hazeGeo, hazeMat);
  haze.renderOrder = 3; haze.visible = false;
  group.add(haze);

  // grow beds: shrubs on rings, one merged geometry (a blob over a stem), deterministic
  const rnd = mulberry32(Math.round(r * 1000) + 17), blobs: THREE.BufferGeometry[] = [];
  const n = Math.max(24, Math.min(90, Math.round(r * r * 9)));
  for (let i = 0; i < n; i++) {
    const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * r * 0.82, x = Math.sin(a) * d, z = Math.cos(a) * d, s = 0.06 + rnd() * 0.07;
    const g = new THREE.IcosahedronGeometry(s, 0);
    g.scale(1, 0.8 + rnd() * 0.5, 1);
    g.translate(x, ground(x, z) + s * 1.1, z);
    const c = new THREE.Color().setHSL(0.28 + rnd() * 0.06, 0.75, 0.2 + rnd() * 0.1);
    const col = new Float32Array(g.attributes.position.count * 3);
    for (let k = 0; k < col.length; k += 3) { col[k] = c.r; col[k + 1] = c.g; col[k + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    blobs.push(g);
  }
  const merged = mergeBlobs(blobs);
  const plantMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true });
  const plants = new THREE.Mesh(merged, plantMat);
  plants.visible = false;
  group.add(plants);

  return {
    group,
    apply(look) {
      const op = (look.sealed ? 0.05 : 0) + look.haze * 0.75;
      hazeMat.opacity = Math.min(0.72, op);
      hazeMat.color.set(look.dust > look.haze * 0.5 && look.dust > 0.1 ? 0xa8946a : look.sealed ? 0xaec6d6 : 0xc9c2a4);
      haze.visible = op > 0.004;
      plants.visible = look.plants > 0.02;
      plants.scale.setScalar(0.35 + 0.65 * look.plants);
      plantMat.color.setRGB(0.6 + 0.4 * look.plants, 0.75 + 0.25 * look.plants, 0.6 + 0.4 * look.plants);
    },
    dispose() { hazeGeo.dispose(); hazeMat.dispose(); merged.dispose(); plantMat.dispose(); },
  };
}

function mergeBlobs(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const pos: number[] = [], col: number[] = [], nor: number[] = [];
  for (const g of parts) {
    const gg = g.index ? g.toNonIndexed() : g;
    pos.push(...(gg.attributes.position.array as Float32Array)); col.push(...(gg.attributes.color.array as Float32Array));
    gg.computeVertexNormals(); nor.push(...(gg.attributes.normal.array as Float32Array));
    if (gg !== g) gg.dispose();
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return out;
}
