/**
 * treeGeometry — procedural vegetation meshes for CampusTreeRenderer.
 *
 * Every builder returns ONE merged, non-indexed BufferGeometry per species so a
 * whole tree (trunk + branches + canopy) is a single InstancedMesh draw call.
 *
 * Custom vertex attributes (consumed by the tree material shader):
 *   color  (vec3)  baked ambient occlusion / lobe tint, multiplied into albedo
 *   aLeaf  (float) 1 = foliage (tinted by instanceColor), 0 = bark (uBarkColor)
 *   aLobe  (vec3)  centre of the foliage lobe the vertex belongs to — lets the
 *                  shader thin the canopy toward its branches (winter) and
 *                  flutter lobes independently in the wind
 *
 * Canopies are a single sphere shell wrapped around a cluster of lobe spheres
 * (plus value noise), so the silhouette is clumped without paying for hidden
 * interior faces. Normals blend the surface normal with the direction from
 * the crown centre — the standard stylised-realistic foliage trick: the crown
 * shades as one soft volume while the lobes still catch light.
 *
 * No external assets — all shapes are generated here from seeded noise.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { SEASON_UNIFORMS, SEA_VEG_FRAG_PARS, SEA_VEG_TREE, SEA_VEG_VERT_PARS } from '../season/seasonShader';
import { GROUND_SKY_FILL_GLSL } from '../materials/groundTextures';

export type VegDetail = 'high' | 'medium' | 'low';
/** Distance LOD: 0 = full, 1 = mid (coarser shell, no scaffold branches),
 *  2 = far (coarsest shell, single bole, no conifer undersides). */
export type TreeLod = 0 | 1 | 2;

// ── Deterministic noise ───────────────────────────────────────────────────────

function hash3(x: number, y: number, z: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + z * 1274126177 + seed * 144665) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Trilinear value noise in [0,1]. Continuous in position, so duplicated
 *  vertices of a non-indexed mesh displace identically (no cracks). */
function vnoise(x: number, y: number, z: number, seed: number): number {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = x - ix, fy = y - iy, fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy), sz = fz * fz * (3 - 2 * fz);
  const l = (a: number, b: number, t: number): number => a + (b - a) * t;
  const c = (dx: number, dy: number, dz: number): number => hash3(ix + dx, iy + dy, iz + dz, seed);
  return l(
    l(l(c(0, 0, 0), c(1, 0, 0), sx), l(c(0, 1, 0), c(1, 1, 0), sx), sy),
    l(l(c(0, 0, 1), c(1, 0, 1), sx), l(c(0, 1, 1), c(1, 1, 1), sx), sy),
    sz,
  );
}

function makeRng(seed: number): () => number {
  let s = (seed * 2654435761) >>> 0;
  return (): number => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// ── Attribute helpers ─────────────────────────────────────────────────────────

/** Attach constant-per-part attributes and return a non-indexed geometry. */
function finalize(
  g: THREE.BufferGeometry,
  leaf: number,
  lobe: THREE.Vector3,
  colorFn: (p: THREE.Vector3, i: number) => [number, number, number],
): THREE.BufferGeometry {
  const geo = g.index ? g.toNonIndexed() : g;
  if (geo !== g) g.dispose();
  geo.deleteAttribute('uv');
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const n = pos.count;
  const col = new Float32Array(n * 3);
  const lf = new Float32Array(n);
  const lb = new Float32Array(n * 3);
  const p = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    p.fromBufferAttribute(pos, i);
    const c = colorFn(p, i);
    col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2];
    lf[i] = leaf;
    lb[i * 3] = lobe.x; lb[i * 3 + 1] = lobe.y; lb[i * 3 + 2] = lobe.z;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aLeaf', new THREE.BufferAttribute(lf, 1));
  geo.setAttribute('aLobe', new THREE.BufferAttribute(lb, 3));
  return geo;
}

// ── Close-up foliage: alpha cards (r15) ───────────────────────────────────────
// `aCard` (vec3) = (u, v, kind) on every vegetation vertex:
//   kind 0        solid (bark, far shells, conifer tiers)
//   kind 0.5      near crown shell: a few noise gaps (sky + branches show through)
//   kind [1, 2)   leaf-cluster card; fract = per-card random (leaf drop order)
//   kind [2, 3)   r21 conifer bough: a ragged spray of needle tufts; fract = per-card random
//   kind [3, 4)   palm frond (pinnate leaflets cut by the shader)
//   kind [-2, -1) Spanish moss strand (own grey-green, not the canopy tint)
// The leaf / frond / strand cut-outs are computed in the fragment shader from
// (u, v) — no textures.

export const CARD_SHELL = 0.5;
/** r21: conifer bough / tip-sprig card kinds live in [CARD_BOUGH, CARD_BOUGH + 1). */
export const CARD_BOUGH = 2;

/** Give a part a constant aCard (unless it already has one). */
function ensureCard(g: THREE.BufferGeometry, kind = 0): THREE.BufferGeometry {
  if (g.getAttribute('aCard')) return g;
  const n = (g.getAttribute('position') as THREE.BufferAttribute).count;
  const a = new Float32Array(n * 3);
  if (kind !== 0) for (let i = 0; i < n; i++) a[i * 3 + 2] = kind;
  g.setAttribute('aCard', new THREE.BufferAttribute(a, 3));
  return g;
}

/** Merge vegetation parts (every part gets the aCard attribute first). */
function mergeVeg(parts: THREE.BufferGeometry[], what: string): THREE.BufferGeometry {
  for (const p of parts) ensureCard(p);
  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  if (!merged) throw new Error(`treeGeometry: ${what} merge failed`);
  merged.computeBoundingSphere();
  merged.computeBoundingBox();
  return merged;
}

/** Raw triangle soup builder for cards / strips (non-indexed). */
interface Soup { pos: number[]; nor: number[]; col: number[]; lobe: number[]; card: number[]; leaf: number[] }
const newSoup = (): Soup => ({ pos: [], nor: [], col: [], lobe: [], card: [], leaf: [] });
function soupVert(s: Soup, p: THREE.Vector3, n: THREE.Vector3, c: number, warm: number, lobe: THREE.Vector3, u: number, v: number, k: number, leaf = 1): void {
  s.pos.push(p.x, p.y, p.z);
  s.nor.push(n.x, n.y, n.z);
  s.col.push(c * (1 + warm * 0.9), c * (1 + warm * 0.45), c * (1 - warm * 0.9));
  s.lobe.push(lobe.x, lobe.y, lobe.z);
  s.card.push(u, v, k);
  s.leaf.push(leaf);
}
function soupGeometry(s: Soup): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(s.pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(s.nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(s.col, 3));
  g.setAttribute('aLeaf', new THREE.Float32BufferAttribute(s.leaf, 1));
  g.setAttribute('aLobe', new THREE.Float32BufferAttribute(s.lobe, 3));
  g.setAttribute('aCard', new THREE.Float32BufferAttribute(s.card, 3));
  return g;
}
/** A double-sided quad (both windings, one shading normal) — 4 triangles. */
function soupQuad(s: Soup, q: THREE.Vector3[], uv: Array<[number, number]>, n: THREE.Vector3, c: number[], warm: number, lobe: THREE.Vector3, k: number, leaf = 1): void {
  const tri = (a: number, b: number, d: number): void => {
    soupVert(s, q[a], n, c[a], warm, lobe, uv[a][0], uv[a][1], k, leaf);
    soupVert(s, q[b], n, c[b], warm, lobe, uv[b][0], uv[b][1], k, leaf);
    soupVert(s, q[d], n, c[d], warm, lobe, uv[d][0], uv[d][1], k, leaf);
  };
  tri(0, 1, 2); tri(0, 2, 3);   // front
  tri(0, 2, 1); tri(0, 3, 2);   // back
}

/**
 * Leaf-cluster cards scattered over the outer surface of a crown's lobes:
 * each card is a ragged spray of leaves (cut out in the shader) that breaks
 * the shell's faceted silhouette into foliage at eye level. Cards hidden deep
 * inside another lobe are skipped (they would never be seen). Shading normals
 * follow the crown volume (soft, coherent light across the clusters).
 */
function makeLeafCards(lobes: LobeSpec[], crown: THREE.Vector3, crownR: number, count: number, size: number, rng: () => number, opts: { squashY?: number; under?: number } = {}): THREE.BufferGeometry {
  const s = newSoup();
  let wSum = 0;
  for (const L of lobes) wSum += L.r * L.r;
  let bottom = Infinity, top = -Infinity;
  for (const L of lobes) { bottom = Math.min(bottom, L.c.y - L.r); top = Math.max(top, L.c.y + L.r); }
  const span = Math.max(0.05, top - bottom);
  const d = new THREE.Vector3(), p = new THREE.Vector3(), t = new THREE.Vector3(), b = new THREE.Vector3(), n = new THREE.Vector3(), cn = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const squash = opts.squashY ?? 1;
  let made = 0;
  for (let tries = 0; made < count && tries < count * 4; tries++) {
    // lobe by area
    let pick = rng() * wSum, L = lobes[0];
    for (const l of lobes) { pick -= l.r * l.r; if (pick <= 0) { L = l; break; } }
    d.set(rng() * 2 - 1, rng() * 2 - 1, rng() * 2 - 1);
    if (d.lengthSq() < 0.01 || d.lengthSq() > 1) continue;
    d.normalize();
    // fewer cards on the underside (the crown is open below, sky shows through the top edge)
    if (d.y < -0.35 && rng() > (opts.under ?? 0.45)) continue;
    p.copy(L.c).addScaledVector(d, L.r * (0.86 + rng() * 0.26));
    p.y = L.c.y + (p.y - L.c.y) * squash;
    // buried inside a neighbouring lobe → invisible, skip
    let buried = false;
    for (const o of lobes) if (o !== L && p.distanceTo(o.c) < o.r * 0.72) { buried = true; break; }
    if (buried) continue;
    const sz = size * (0.75 + rng() * 0.5);
    // card plane: facing roughly outward, tilted at random
    n.copy(d).add(t.set(rng() - 0.5, rng() - 0.5, rng() - 0.5).multiplyScalar(1.3)).normalize();
    t.crossVectors(Math.abs(n.y) > 0.9 ? b.set(1, 0, 0) : up, n).normalize();
    const rot = rng() * Math.PI * 2;
    t.applyAxisAngle(n, rot);
    b.crossVectors(n, t).normalize();
    const q = [
      p.clone().addScaledVector(t, -sz).addScaledVector(b, -sz),
      p.clone().addScaledVector(t, sz).addScaledVector(b, -sz),
      p.clone().addScaledVector(t, sz).addScaledVector(b, sz),
      p.clone().addScaledVector(t, -sz).addScaledVector(b, sz),
    ];
    // shading normal: half the crown direction, half the lobe direction
    cn.copy(p).sub(crown); cn.y *= 0.8; cn.normalize();
    const sn = cn.clone().multiplyScalar(0.55).addScaledVector(d, 0.45).normalize();
    const cols = q.map((v) => {
      const h = Math.min(1, Math.max(0, (v.y - bottom) / span));
      const out = Math.min(1, v.distanceTo(crown) / Math.max(0.1, crownR));
      return Math.min(1.15, 0.42 + 0.36 * h + 0.32 * out);
    });
    const warm = (rng() - 0.5) * 0.12 + L.tint;
    soupQuad(s, q, [[0, 0], [1, 0], [1, 1], [0, 1]], sn, cols, warm, L.c, 1 + rng() * 0.999);
    made++;
  }
  return soupGeometry(s);
}

/** How many leaf cards a near (LOD 0) crown gets per detail tier. */
function cardCount(detail: VegDetail, k = 1): number {
  return Math.round((detail === 'high' ? 260 : detail === 'medium' ? 190 : 110) * k);
}

// ── Parts ─────────────────────────────────────────────────────────────────────

interface LobeSpec { c: THREE.Vector3; r: number; tint: number }

/**
 * Crown shell: ONE deformed sphere whose radius in each direction is the far
 * intersection of that ray with the union of the lobe spheres, plus value
 * noise. Compared with merging overlapping lobe meshes this spends no
 * triangles on hidden interior surfaces, yet keeps the lumpy multi-lobe
 * silhouette and gets real creases between lobes (darkened as fake AO).
 */
function makeCrownShell(
  lobes: LobeSpec[],
  crown: THREE.Vector3,
  segW: number,
  segH: number,
  seed: number,
  lumpiness: number,
  flatBase = false,
  near: { shrink?: number; holey?: boolean; squashY?: number } = {},
): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, segW, segH);
  const shrink = near.shrink ?? 1, squashY = near.squashY ?? 1;
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  const n = pos.count;
  const lobeIdx = new Int32Array(n);
  const radii = new Float32Array(n);
  const d = new THREE.Vector3();
  const oc = new THREE.Vector3();
  let rMin = Infinity, rMax = 0;
  for (let i = 0; i < n; i++) {
    d.fromBufferAttribute(pos, i).normalize();
    // Far hit of the ray (crown centre → d) against every lobe sphere
    let best = 0, bi = 0;
    for (let k = 0; k < lobes.length; k++) {
      const L = lobes[k];
      oc.copy(L.c).sub(crown);
      const b = oc.dot(d);
      const disc = b * b - (oc.lengthSq() - L.r * L.r);
      if (disc < 0) continue;
      const t = b + Math.sqrt(disc);
      if (t > best) { best = t; bi = k; }
    }
    // Two octaves of value noise → clumped foliage surface
    const n1 = vnoise(d.x * 2.2 + 3.1, d.y * 2.2, d.z * 2.2, seed);
    const n2 = vnoise(d.x * 5.1, d.y * 5.1 + 7.7, d.z * 5.1, seed + 17);
    let r = Math.max(0.05, best) * (1 + lumpiness * ((n1 - 0.5) * 1.2 + (n2 - 0.5) * 0.7));
    // Slightly flattened underside — real crowns are denser on top
    if (d.y < 0) r *= 1 + d.y * 0.18;
    r *= shrink;
    let y = crown.y + d.y * r * squashY;
    if (flatBase && y < 0.02) y = 0.02;
    pos.setXYZ(i, crown.x + d.x * r, y, crown.z + d.z * r);
    lobeIdx[i] = bi;
    radii[i] = r;
    rMin = Math.min(rMin, r); rMax = Math.max(rMax, r);
  }
  g.computeVertexNormals();
  // Blend the true surface normal with the crown direction so the canopy
  // shades as one soft volume while lobes still catch light individually.
  const nrm = g.getAttribute('normal') as THREE.BufferAttribute;
  const sn = new THREE.Vector3();
  const cn = new THREE.Vector3();
  let bottom = Infinity, top = -Infinity;
  for (let i = 0; i < n; i++) { const y = pos.getY(i); bottom = Math.min(bottom, y); top = Math.max(top, y); }
  const span = Math.max(0.01, top - bottom);
  const col = new Float32Array(n * 3);
  const lb = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    sn.fromBufferAttribute(nrm, i);
    cn.set(pos.getX(i) - crown.x, (pos.getY(i) - crown.y) * 0.8, pos.getZ(i) - crown.z).normalize();
    sn.multiplyScalar(0.5).addScaledVector(cn, 0.5).normalize();
    nrm.setXYZ(i, sn.x, sn.y, sn.z);
    // AO: creases between lobes (small radius) and the underside are dark;
    // the sunlit crown top is bright and slightly warm.
    const h = (pos.getY(i) - bottom) / span;
    const crease = (radii[i] - rMin) / Math.max(0.01, rMax - rMin);
    const ao = Math.min(1.12, 0.36 + 0.30 * crease + 0.44 * h);
    const warm = (h - 0.45) * 0.16 + lobes[lobeIdx[i]].tint;
    col[i * 3] = ao * (1 + warm * 0.9); col[i * 3 + 1] = ao * (1 + warm * 0.45); col[i * 3 + 2] = ao * (1 - warm * 0.9);
    const c = lobes[lobeIdx[i]].c;
    lb[i * 3] = c.x; lb[i * 3 + 1] = c.y; lb[i * 3 + 2] = c.z;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aLeaf', new THREE.BufferAttribute(new Float32Array(n).fill(1), 1));
  g.setAttribute('aLobe', new THREE.BufferAttribute(lb, 3));
  ensureCard(g, near.holey ? CARD_SHELL : 0);
  g.deleteAttribute('uv');
  const out = g.toNonIndexed();
  g.dispose();
  return out;
}

/** Tapered cylinder between two points (trunk segment / branch). */
function makeLimb(
  a: THREE.Vector3,
  b: THREE.Vector3,
  rA: number,
  rB: number,
  sides: number,
  shade: (p: THREE.Vector3) => number,
): THREE.BufferGeometry {
  // r15: each limb starts a little inside its parent so joints never gape
  const back = Math.min(rA * 0.8, a.distanceTo(b) * 0.25);
  const len = a.distanceTo(b) + back;
  const g = new THREE.CylinderGeometry(rB, rA, len, sides, 1, true);
  g.translate(0, len / 2 - back, 0);
  const dir = b.clone().sub(a).normalize();
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir));
  g.translate(a.x, a.y, a.z);
  return finalize(g, 0, b, (p) => { const s = shade(p); return [s, s, s]; });
}

// ── Broadleaf trees ───────────────────────────────────────────────────────────

/**
 * Broadleaf species, told apart by silhouette and branching:
 *   oak     — broad, irregular round crown on a short bole, low spreading limbs
 *   maple   — taller, denser oval crown (also linden / plane street trees)
 *   elm     — American elm vase: a clear bole forking into upswept leaders
 *             that fan out under a wide umbrella crown, open underneath
 *   liveoak — southern live oak: short massive trunk, long near-level
 *             sinuous limbs, a very wide, low, flat-topped crown
 *   liveoak_moss — the same hung with Spanish moss (Deep South)
 * Near (LOD 0) crowns are a slightly shrunk shell with a few gaps plus
 * leaf-cluster cards that make the silhouette (see makeLeafCards); LOD 1 / 2
 * keep the same lobe layout as plain shells so the switch does not pop.
 */
export type BroadleafSpecies = 'oak' | 'maple' | 'elm' | 'liveoak' | 'liveoak_moss';

/** variant 0 = oak (≈ 2.4 tall at scale 1), variant 1 = maple / linden (≈ 2.7). */
export function buildDeciduousTree(variant: 0 | 1, detail: VegDetail, seed: number, lod: TreeLod = 0): THREE.BufferGeometry {
  return buildBroadleafTree(variant === 0 ? 'oak' : 'maple', detail, seed, lod);
}

const SPECIES_SALT: Record<BroadleafSpecies, number> = { oak: 0, maple: 101, elm: 211, liveoak: 307, liveoak_moss: 307 };

export function buildBroadleafTree(species: BroadleafSpecies, detail: VegDetail, seed: number, lod: TreeLod = 0): THREE.BufferGeometry {
  const rng = makeRng(seed + SPECIES_SALT[species]);
  const parts: THREE.BufferGeometry[] = [];
  const hi = detail !== 'low' && lod === 0;
  const near = lod === 0;
  const liveOak = species === 'liveoak' || species === 'liveoak_moss';

  const crown = species === 'oak' ? new THREE.Vector3(0, 1.48, 0)
    : species === 'maple' ? new THREE.Vector3(0, 1.70, 0)
    : species === 'elm' ? new THREE.Vector3(0, 2.02, 0)
    : new THREE.Vector3(0, 1.22, 0);
  const crownR = species === 'oak' ? 0.86 : species === 'maple' ? 0.74 : species === 'elm' ? 1.0 : 1.45;
  const squashY = liveOak ? 0.72 : species === 'elm' ? 0.85 : 1;
  const lean = new THREE.Vector3((rng() - 0.5) * 0.10, 0, (rng() - 0.5) * 0.10);

  // Lobe layout
  const lobes: LobeSpec[] = [];
  if (species === 'oak') {
    lobes.push({ c: crown.clone().add(new THREE.Vector3(0, 0.05, 0)), r: 0.56, tint: 0 });
    const ring = detail === 'high' ? 5 : detail === 'medium' ? 4 : 3;
    for (let i = 0; i < ring; i++) {
      const a = (i / ring) * Math.PI * 2 + rng() * 0.6;
      const rr = 0.42 + rng() * 0.08;
      lobes.push({ c: new THREE.Vector3(Math.cos(a) * rr, crown.y - 0.14 + rng() * 0.26, Math.sin(a) * rr), r: 0.36 + rng() * 0.08, tint: (rng() - 0.5) * 0.12 });
    }
    lobes.push({ c: new THREE.Vector3((rng() - 0.5) * 0.2, crown.y + 0.36, (rng() - 0.5) * 0.2), r: 0.40, tint: 0.05 });
  } else if (species === 'maple') {
    lobes.push({ c: new THREE.Vector3(0, crown.y - 0.34, 0), r: 0.48, tint: -0.04 });
    lobes.push({ c: new THREE.Vector3(0.04, crown.y + 0.06, -0.03), r: 0.52, tint: 0 });
    lobes.push({ c: new THREE.Vector3(-0.03, crown.y + 0.50, 0.04), r: 0.36, tint: 0.06 });
    const ring = detail === 'high' ? 3 : 2;
    for (let i = 0; i < ring; i++) {
      const a = (i / ring) * Math.PI * 2 + rng() * 0.8;
      lobes.push({ c: new THREE.Vector3(Math.cos(a) * 0.34, crown.y - 0.16 + rng() * 0.40, Math.sin(a) * 0.34), r: 0.32 + rng() * 0.06, tint: (rng() - 0.5) * 0.12 });
    }
  } else if (species === 'elm') {
    // umbrella: a ring of clumps on the fanned leaders, a domed top
    lobes.push({ c: new THREE.Vector3(0, crown.y + 0.26, 0), r: 0.50, tint: 0.04 });
    const ring = detail === 'low' ? 5 : 6;
    for (let i = 0; i < ring; i++) {
      const a = (i / ring) * Math.PI * 2 + rng() * 0.5;
      const rr = 0.60 + rng() * 0.12;
      lobes.push({ c: new THREE.Vector3(Math.cos(a) * rr, crown.y - 0.04 + rng() * 0.2, Math.sin(a) * rr), r: 0.36 + rng() * 0.07, tint: (rng() - 0.5) * 0.12 });
    }
  } else {
    // live oak: wide, low, flat-topped
    lobes.push({ c: new THREE.Vector3(0, crown.y + 0.16, 0), r: 0.62, tint: 0.02 });
    const ring = detail === 'low' ? 6 : 7;
    for (let i = 0; i < ring; i++) {
      const a = (i / ring) * Math.PI * 2 + rng() * 0.5;
      const rr = 0.85 + rng() * 0.28;
      lobes.push({ c: new THREE.Vector3(Math.cos(a) * rr, crown.y - 0.12 + rng() * 0.22, Math.sin(a) * rr), r: 0.40 + rng() * 0.09, tint: (rng() - 0.5) * 0.14 });
    }
  }
  // Small outer twig clumps (high only) — break the silhouette
  if (detail === 'high') {
    const nT = liveOak ? 6 : 4;
    for (let i = 0; i < nT; i++) {
      const a = rng() * Math.PI * 2;
      const rr = crownR * (0.78 + rng() * 0.12);
      lobes.push({ c: new THREE.Vector3(Math.cos(a) * rr, crown.y + (rng() - 0.35) * 0.5 * squashY, Math.sin(a) * rr), r: 0.15 + rng() * 0.05, tint: 0.04 });
    }
  }
  for (const l of lobes) l.c.add(lean);
  const crownC = crown.clone().add(lean);
  const bottom = crownC.y - crownR * 0.75 * squashY;
  const seg0: [number, number] = detail === 'high' ? [14, 9] : detail === 'medium' ? [12, 8] : [9, 6];
  // Distance LODs keep the same lobe layout / noise (same silhouette) and only
  // coarsen the shell tessellation, so switching level doesn't visibly pop.
  const seg: [number, number] = lod === 0 ? seg0
    : lod === 1 ? [Math.max(8, Math.round(seg0[0] * 0.64)), Math.max(6, Math.round(seg0[1] * 0.67))]
    : [7, 5];
  // Near: the shell sits a little inside the leaf cards and has a few gaps
  // (flattened crowns need a finer mid shell or they read as slabs)
  if (lod === 1 && squashY < 1) { seg[0] += 3; seg[1] += 2; }
  parts.push(makeCrownShell(lobes, crownC, seg[0], seg[1], seed, detail === 'low' ? 0.14 : 0.2, false,
    near ? { shrink: 0.88, holey: true, squashY } : lod === 1 ? { shrink: 0.93, squashY } : { squashY }));
  // Leaf cards: dense near; a few big soft clusters at mid range so the
  // silhouette doesn't change when the tree switches level
  if (lod < 2) {
    const k = (liveOak ? 1.5 : species === 'elm' ? 1.25 : 1) * (near ? 1 : 0.28);
    parts.push(makeLeafCards(lobes, crownC, crownR, cardCount(detail, k), 0.16 * (liveOak ? 1.1 : 1) * (near ? 1 : 1.7), rng, { squashY, under: species === 'elm' || liveOak ? 0.25 : 0.45 }));
  }

  // Bark: dark at the soil splash line and inside the crown (shadowed)
  const barkShade = (p: THREE.Vector3): number => {
    const ground = Math.min(1, 0.62 + p.y * 0.5);
    const inCrown = p.y > bottom ? 0.62 : 1.0;
    return ground * inCrown;
  };
  const sides = detail === 'low' || lod === 1 ? 5 : 7;
  const limb = (a: THREE.Vector3, b: THREE.Vector3, rA: number, rB: number, s = 4): void => { parts.push(makeLimb(a, b, rA, rB, s, barkShade)); };
  /** r15: fine twigs off the outer part of a limb (near only) — the bare winter crown. */
  const twigs = (a: THREE.Vector3, b: THREE.Vector3, n: number, len: number): void => {
    if (!near || detail === 'low') return;
    const dir = b.clone().sub(a).normalize();
    for (let k = 0; k < n; k++) {
      const s0 = a.clone().lerp(b, 0.45 + 0.55 * rng());
      const out = dir.clone().add(new THREE.Vector3(rng() - 0.5, rng() * 0.9, rng() - 0.5).multiplyScalar(1.4)).normalize();
      const mid = s0.clone().addScaledVector(out, len * (0.5 + 0.3 * rng()));
      limb(s0, mid, 0.012, 0.007, 3);
      const out2 = out.clone().add(new THREE.Vector3(rng() - 0.5, rng() * 0.6, rng() - 0.5)).normalize();
      limb(mid, mid.clone().addScaledVector(out2, len * (0.35 + 0.3 * rng())), 0.007, 0.003, 3);
    }
  };
  /** A swollen joint where big limbs fork (near only). */
  const knuckle = (c: THREE.Vector3, r: number): void => {
    if (!near) return;
    const g = new THREE.IcosahedronGeometry(r, 1);
    g.scale(1, 0.8, 1);
    g.translate(c.x, c.y, c.z);
    parts.push(finalize(g, 0, c, (q) => { const v = barkShade(q); return [v, v, v]; }));
  };
  const trunkR = liveOak ? 0.2 : species === 'elm' ? 0.12 : 0.125;
  if (lod === 2) {
    // Far: one 4-sided tapered bole (the crown hides everything above it)
    const topY = liveOak ? 0.7 : species === 'elm' ? 1.3 : crownC.y + 0.05;
    limb(new THREE.Vector3(0, -0.05, 0), new THREE.Vector3(lean.x, topY, lean.z), trunkR + 0.02, 0.06, 4);
  } else {
    // Root flare: a fluted buttress near the camera, a flared cone further out
    if (near) parts.push(makeButtress(liveOak ? 0.4 : 0.3, trunkR * (liveOak ? 1.55 : 1.85), trunkR, liveOak ? 6 : 5, detail === 'low' ? 8 : 12, rng() * 6, barkShade));
    else limb(new THREE.Vector3(0, -0.05, 0), new THREE.Vector3(0, 0.12, 0), trunkR * 1.5, trunkR, sides);
    const base = new THREE.Vector3(0, near ? (liveOak ? 0.34 : 0.22) : 0.12, 0);
    if (species === 'elm') {
      // clear bole to the fork, then upswept leaders fanning out to the ring
      const fork = new THREE.Vector3(lean.x * 0.4, 0.95, lean.z * 0.4);
      limb(base, fork, trunkR * 0.95, 0.085, sides);
      knuckle(fork, 0.075);
      for (let i = 1; i < lobes.length; i++) {
        const L = lobes[i];
        if (L.r < 0.3) continue;
        // leaders rise steeply first, then arch outward (the vase)
        const mid = new THREE.Vector3(L.c.x * 0.3, fork.y + (L.c.y - fork.y) * 0.6, L.c.z * 0.3);
        limb(fork, mid, 0.045, 0.034, lod === 0 ? 5 : 4);
        if (lod === 0) {
          const tip = new THREE.Vector3(L.c.x * 0.95, L.c.y + 0.02, L.c.z * 0.95);
          limb(mid, tip, 0.034, 0.012, 4);
          twigs(mid, tip, 7, 0.28);
          // a side branch off each leader
          const sb = mid.clone().lerp(tip, 0.4);
          limb(sb, new THREE.Vector3(L.c.x * 0.8 - L.c.z * 0.25, L.c.y + 0.12, L.c.z * 0.8 + L.c.x * 0.25), 0.018, 0.007, 3);
        }
      }
      if (lod === 0) limb(fork, new THREE.Vector3(lean.x, crownC.y + 0.2, lean.z), 0.055, 0.02, 4);
    } else if (liveOak) {
      // short massive trunk, long sinuous near-level limbs
      const fork = new THREE.Vector3(lean.x * 0.3, 0.62, lean.z * 0.3);
      limb(base, fork, trunkR * 0.95, trunkR * 0.8, sides);
      knuckle(fork, trunkR * 0.95);
      for (let i = 1; i < lobes.length; i++) {
        const L = lobes[i];
        if (L.r < 0.3) continue;
        const dir = new THREE.Vector3(L.c.x - fork.x, 0, L.c.z - fork.z);
        const reach = dir.length(); dir.normalize();
        const m1 = fork.clone().addScaledVector(dir, reach * 0.4).setY(fork.y + 0.1 + rng() * 0.08);
        const m2 = fork.clone().addScaledVector(dir, reach * 0.75).setY(fork.y + 0.04 + rng() * 0.18);
        const end = new THREE.Vector3(L.c.x * 1.02, L.c.y - L.r * 0.5, L.c.z * 1.02);
        limb(fork, m1, 0.11, 0.08, lod === 0 ? 7 : 4);
        knuckle(m1, 0.085);
        limb(m1, m2, 0.08, 0.055, lod === 0 ? 6 : 4);
        knuckle(m2, 0.058);
        if (lod === 0) limb(m2, end, 0.055, 0.025, 4);
      }
    } else {
      const trunkTop = new THREE.Vector3(lean.x, crownC.y + 0.05, lean.z);
      const trunkMid = new THREE.Vector3(lean.x * 0.35, bottom * 0.55, lean.z * 0.35);
      limb(base, trunkMid, trunkR, 0.10, sides);
      limb(trunkMid, trunkTop, 0.10, 0.05, sides);
    }
  }

  // Scaffold branches (oak / maple): fork from the upper bole into the main
  // lobes, with a few side branches reaching out to the leaf clusters —
  // seen under the crown and through its gaps, they carry the tree in winter.
  if (hi && (species === 'oak' || species === 'maple')) {
    const forkY = bottom - 0.05;
    const nB = species === 'oak' ? 5 : 4;
    for (let i = 0; i < nB; i++) {
      const target = lobes[1 + (i % Math.max(1, lobes.length - 1))].c;
      const from = new THREE.Vector3(lean.x * (forkY / crownC.y), forkY + i * 0.06, lean.z * (forkY / crownC.y));
      const to = target.clone();
      to.x *= 1.15; to.z *= 1.15; to.y -= 0.05;
      limb(from, to, 0.05, 0.018, 4);
      twigs(from, to, 8, 0.3);
      // side twigs off the outer half of the scaffold
      for (let j = 0; j < 2; j++) {
        const s0 = from.clone().lerp(to, 0.5 + j * 0.25);
        const out = new THREE.Vector3(to.x - from.x, 0, to.z - from.z).normalize();
        const side = new THREE.Vector3(-out.z, 0, out.x).multiplyScalar(j ? -1 : 1);
        const tip = s0.clone().addScaledVector(out, 0.22).addScaledVector(side, 0.2).add(new THREE.Vector3(0, 0.12 + rng() * 0.1, 0));
        limb(s0, tip, 0.022, 0.008, 3);
      }
    }
    if (species === 'oak') {
      // two low, wide-reaching limbs: the open-grown oak's skirt
      for (let i = 0; i < 2; i++) {
        const a = rng() * Math.PI * 2;
        const from = new THREE.Vector3(lean.x * 0.5, bottom * 0.62, lean.z * 0.5);
        const to = new THREE.Vector3(Math.cos(a) * crownR * 0.62, bottom + 0.3, Math.sin(a) * crownR * 0.62);
        limb(from, to, 0.055, 0.02, 4);
      }
    }
  }

  // Spanish moss: grey-green beards hanging from the limbs under the crown.
  // r16: each beard is two crossed cards of different lengths (it reads as a
  // soft hanging mass from every side, not a flat comb), its top edge ragged,
  // its strands gathered into irregular tapering locks in the shader
  if (species === 'liveoak_moss' && lod < 2) {
    const s = newSoup();
    const nPer = lod === 0 ? (detail === 'low' ? 3 : 4) : 2;
    for (let i = 1; i < lobes.length; i++) {
      const L = lobes[i];
      for (let k = 0; k < nPer; k++) {
        const a = rng() * Math.PI * 2, rr = L.r * (0.15 + rng() * 0.6);
        const top = new THREE.Vector3(L.c.x + Math.cos(a) * rr, L.c.y - L.r * squashY * (0.45 + rng() * 0.25), L.c.z + Math.sin(a) * rr);
        const len0 = 0.26 + rng() * 0.34, w = 0.06 + rng() * 0.05;
        const fa = rng() * Math.PI;
        const sway = new THREE.Vector3((rng() - 0.5) * 0.08, 0, (rng() - 0.5) * 0.08);
        const cards = lod === 0 ? 2 : 1;
        for (let c = 0; c < cards; c++) {
          const ang = fa + c * (Math.PI / 2 + (rng() - 0.5) * 0.5);
          const len = len0 * (c ? 0.6 + rng() * 0.35 : 1);
          const ww = w * (c ? 0.75 : 1);
          const t = new THREE.Vector3(Math.cos(ang) * ww, 0, Math.sin(ang) * ww);
          const tl = top.clone().sub(t).setY(top.y + (rng() - 0.5) * 0.05), tr = top.clone().add(t).setY(top.y + (rng() - 0.5) * 0.05);
          // the tip hangs a little narrower than the top and drifts with the sway
          const q = [tl, tr, top.clone().addScaledVector(t, 0.7).add(sway).setY(top.y - len), top.clone().addScaledVector(t, -0.7).add(sway).setY(top.y - len)];
          const n = new THREE.Vector3(-t.z, 0.4, t.x).normalize();
          soupQuad(s, q, [[0, 1], [1, 1], [1, 0], [0, 0]], n, [0.9, 0.9, 0.62, 0.62], 0, L.c, -1.5 + rng() * 0.49);
        }
      }
    }
    parts.push(soupGeometry(s));
  }

  return mergeVeg(parts, 'broadleaf');
}

// ── Ornamental yard trees (r16) ───────────────────────────────────────────────

/**
 * Regional yard trees, ≈ 1.2–2.6 tall at scale 1:
 *   jacaranda — SoCal: a short trunk forking into a wide, airy, flat-topped
 *               umbrella crown, hung with lavender-purple panicles;
 *   citrus    — SoCal orange / lemon: a low, dense, rounded crown on a short
 *               trunk, dotted with fruit;
 *   crepe     — Deep South crepe myrtle: three to five smooth, pale, leaning
 *               stems in a vase, a light crown topped with pink / white trusses
 *               (they fall with the leaves);
 *   magnolia  — southern magnolia: a dense, glossy, dark pyramidal evergreen
 *               crown down to the ground, a few big white flowers.
 * Blossom / fruit cards keep their own vertex colour (card kinds −3 / −4).
 */
export type OrnamentalSpecies = 'jacaranda' | 'citrus' | 'crepe' | 'magnolia';

const ORN_SALT: Record<OrnamentalSpecies, number> = { jacaranda: 401, citrus: 503, crepe: 601, magnolia: 701 };

/** Small round cards (blossom trusses or fruit) over the outer crown, with their own colours. */
function makeBlossomCards(lobes: LobeSpec[], count: number, size: number, rng: () => number, colors: number[], fruit: boolean, topBias: number): THREE.BufferGeometry {
  const s = newSoup();
  const cols: number[] = [];
  const d = new THREE.Vector3(), t = new THREE.Vector3(), b = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const tmp = new THREE.Color();
  let made = 0;
  for (let tries = 0; made < count && tries < count * 6; tries++) {
    const L = lobes[Math.floor(rng() * lobes.length)];
    d.set(rng() * 2 - 1, rng() * 2 - 1 + topBias, rng() * 2 - 1);
    if (d.lengthSq() < 0.05) continue;
    d.normalize();
    const p = L.c.clone().addScaledVector(d, L.r * (0.92 + rng() * 0.16));
    let buried = false;
    for (const o of lobes) if (o !== L && p.distanceTo(o.c) < o.r * 0.8) { buried = true; break; }
    if (buried) continue;
    const sz = size * (0.7 + rng() * 0.6);
    const n = d.clone().add(new THREE.Vector3(rng() - 0.5, rng() * 0.5, rng() - 0.5)).normalize();
    t.crossVectors(Math.abs(n.y) > 0.9 ? b.set(1, 0, 0) : up, n).normalize();
    b.crossVectors(n, t).normalize();
    const q = [
      p.clone().addScaledVector(t, -sz).addScaledVector(b, -sz), p.clone().addScaledVector(t, sz).addScaledVector(b, -sz),
      p.clone().addScaledVector(t, sz).addScaledVector(b, sz), p.clone().addScaledVector(t, -sz).addScaledVector(b, sz),
    ];
    soupQuad(s, q, [[0, 0], [1, 0], [1, 1], [0, 1]], d, [1, 1, 1, 1], 0, L.c, fruit ? -3.5 : -2.75);
    tmp.setHex(colors[Math.floor(rng() * colors.length)]).multiplyScalar(0.85 + rng() * 0.3);
    for (let v = 0; v < 12; v++) cols.push(tmp.r, tmp.g, tmp.b);
    made++;
  }
  const g = soupGeometry(s);
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  return g;
}

export function buildOrnamentalTree(species: OrnamentalSpecies, detail: VegDetail, seed: number, lod: TreeLod = 0): THREE.BufferGeometry {
  const rng = makeRng(seed + ORN_SALT[species]);
  const parts: THREE.BufferGeometry[] = [];
  const near = lod === 0;
  const lobes: LobeSpec[] = [];
  let crown: THREE.Vector3, crownR: number, squashY = 1, trunkTop: number, trunkR: number;
  if (species === 'jacaranda') {
    crown = new THREE.Vector3(0, 1.55, 0); crownR = 1.05; squashY = 0.62; trunkTop = 0.85; trunkR = 0.08;
    lobes.push({ c: new THREE.Vector3(0, 1.66, 0), r: 0.5, tint: 0.03 });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + rng() * 0.5, rr = 0.62 + rng() * 0.2;
      lobes.push({ c: new THREE.Vector3(Math.cos(a) * rr, 1.48 + rng() * 0.2, Math.sin(a) * rr), r: 0.36 + rng() * 0.08, tint: (rng() - 0.5) * 0.1 });
    }
  } else if (species === 'citrus') {
    crown = new THREE.Vector3(0, 0.78, 0); crownR = 0.58; trunkTop = 0.4; trunkR = 0.05;
    lobes.push({ c: new THREE.Vector3(0, 0.82, 0), r: 0.46, tint: 0 });
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + rng() * 0.6;
      lobes.push({ c: new THREE.Vector3(Math.cos(a) * 0.26, 0.7 + rng() * 0.22, Math.sin(a) * 0.26), r: 0.32 + rng() * 0.05, tint: (rng() - 0.5) * 0.08 });
    }
  } else if (species === 'crepe') {
    crown = new THREE.Vector3(0, 1.3, 0); crownR = 0.62; squashY = 0.85; trunkTop = 1.0; trunkR = 0.03;
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + rng() * 0.6, rr = 0.3 + rng() * 0.14;
      lobes.push({ c: new THREE.Vector3(Math.cos(a) * rr, 1.25 + rng() * 0.25, Math.sin(a) * rr), r: 0.28 + rng() * 0.06, tint: (rng() - 0.5) * 0.1 });
    }
    lobes.push({ c: new THREE.Vector3(0, 1.48, 0), r: 0.3, tint: 0.04 });
  } else {
    // magnolia: a broad cone of dense lobes from near the ground to a rounded top
    crown = new THREE.Vector3(0, 1.25, 0); crownR = 0.85; trunkTop = 0.5; trunkR = 0.08;
    const tiers = [[0.55, 0.62, 5], [1.05, 0.5, 5], [1.5, 0.38, 4], [1.88, 0.24, 1]] as const;
    for (const [y, rr, n] of tiers) {
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + rng() * 0.7;
        const o = n === 1 ? 0 : rr * 0.62;
        lobes.push({ c: new THREE.Vector3(Math.cos(a) * o, y + (rng() - 0.5) * 0.1, Math.sin(a) * o), r: rr * (0.62 + rng() * 0.15) + 0.1, tint: (rng() - 0.5) * 0.08 });
      }
    }
  }
  const seg: [number, number] = lod === 0 ? (detail === 'high' ? [14, 9] : [12, 8]) : lod === 1 ? [9, 6] : [7, 5];
  parts.push(makeCrownShell(lobes, crown, seg[0], seg[1], seed, detail === 'low' ? 0.12 : 0.18, false,
    near ? { shrink: 0.9, holey: species === 'jacaranda' || species === 'crepe', squashY } : { squashY, shrink: lod === 1 ? 0.95 : 1 }));
  if (lod < 2) {
    const k = (species === 'magnolia' ? 1.1 : species === 'citrus' ? 0.7 : 0.9) * (near ? 1 : 0.28);
    parts.push(makeLeafCards(lobes, crown, crownR, cardCount(detail, k), (species === 'jacaranda' ? 0.13 : species === 'magnolia' ? 0.15 : 0.11) * (near ? 1 : 1.7), rng, { squashY, under: 0.3 }));
    const flowers = species === 'jacaranda' ? { n: 70, sz: 0.1, c: [0x8a6ad8, 0x9a7ae0, 0x7a5ac8, 0xa48ae2], fruit: false, top: 0.5 }
      : species === 'crepe' ? { n: 46, sz: 0.09, c: [0xe0508a, 0xd8407a, 0xe878a8, 0xe0508a, 0xf2eef2, 0xc02848], fruit: false, top: 0.9 }
      : species === 'citrus' ? { n: 34, sz: 0.028, c: rng() < 0.7 ? [0xf08a18, 0xe87a10, 0xf49a28] : [0xf0d830, 0xe8cc28], fruit: true, top: 0 }
      : { n: 16, sz: 0.05, c: [0xf4f0e2, 0xece6d4], fruit: true, top: 0.6 };
    parts.push(makeBlossomCards(lobes, Math.round(flowers.n * (near ? 1 : 0.4)), flowers.sz * (near ? 1 : 1.4), rng, flowers.c, flowers.fruit, flowers.top));
  }
  const bottom = crown.y - crownR * 0.7 * squashY;
  const barkShade = (p: THREE.Vector3): number => Math.min(1, 0.62 + p.y * 0.5) * (p.y > bottom ? 0.7 : 1);
  const limb = (a: THREE.Vector3, b: THREE.Vector3, rA: number, rB: number, sd = 5): void => { parts.push(makeLimb(a, b, rA, rB, lod === 2 ? 4 : sd, barkShade)); };
  if (species === 'crepe') {
    // several smooth leaning stems from one clump, fanning into the crown
    const n = lod === 2 ? 2 : 3 + Math.floor(rng() * 3);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rng() * 0.6;
      const b0 = new THREE.Vector3(Math.cos(a) * 0.03, -0.03, Math.sin(a) * 0.03);
      const m = new THREE.Vector3(Math.cos(a) * 0.14, 0.55 + rng() * 0.1, Math.sin(a) * 0.14);
      const top = new THREE.Vector3(Math.cos(a) * 0.3, trunkTop + 0.2, Math.sin(a) * 0.3);
      limb(b0, m, trunkR, trunkR * 0.85, 5);
      limb(m, top, trunkR * 0.85, trunkR * 0.45, 4);
    }
  } else {
    limb(new THREE.Vector3(0, -0.04, 0), new THREE.Vector3(0, trunkTop, 0), trunkR, trunkR * 0.7, 6);
    if (lod < 2 && species !== 'magnolia') {
      const nB = species === 'jacaranda' ? 4 : 3;
      for (let i = 0; i < nB; i++) {
        const a = (i / nB) * Math.PI * 2 + rng() * 0.8;
        const L = lobes[1 + (i % (lobes.length - 1))];
        limb(new THREE.Vector3(0, trunkTop - 0.04, 0), new THREE.Vector3(Math.cos(a) * crownR * 0.45, L.c.y - 0.1, Math.sin(a) * crownR * 0.45), trunkR * 0.6, trunkR * 0.25, 4);
      }
    }
  }
  return mergeVeg(parts, species);
}

// ── Palm ──────────────────────────────────────────────────────────────────────

/**
 * Fan / feather palm (SoCal: Washingtonia, queen and Canary Island palms):
 * a slender, gently curved, ringed trunk (rings baked into the vertex AO)
 * and a crown of arching fronds whose leaflets are cut out in the shader
 * (aCard kind 3), plus a few dead fronds hanging under the crown. ≈ 3.4 tall
 * at scale 1.
 */
export function buildPalmTree(detail: VegDetail, seed: number, lod: TreeLod = 0): THREE.BufferGeometry {
  const rng = makeRng(seed + 919);
  const parts: THREE.BufferGeometry[] = [];
  const H = 3.2;
  const bend = new THREE.Vector3((rng() - 0.5) * 0.5, 0, (rng() - 0.5) * 0.5);
  const at = (t: number): THREE.Vector3 => new THREE.Vector3(bend.x * t * t, H * t, bend.z * t * t);
  // trunk: stacked short segments, swollen base, ring pattern in the AO
  const nSeg = lod === 2 ? 3 : lod === 1 ? 6 : 12;
  const sides = lod === 2 ? 4 : lod === 1 ? 5 : 7;
  const ring = (p: THREE.Vector3): number => {
    const f = (p.y / H) * nSeg;
    const edge = Math.abs(f - Math.round(f));
    return (lod === 0 ? 0.62 + 0.38 * Math.min(1, edge * 4) : 0.85) * Math.min(1, 0.7 + p.y * 0.15);
  };
  for (let i = 0; i < nSeg; i++) {
    const t0 = i / nSeg, t1 = (i + 1) / nSeg;
    const r0 = 0.085 + 0.035 * Math.pow(1 - t0, 8), r1 = 0.085 + 0.035 * Math.pow(1 - t1, 8);   // r19: a slimmer foot flare
    parts.push(makeLimb(i === 0 ? new THREE.Vector3(0, -0.05, 0) : at(t0), at(t1), r0, r1, sides, ring));
  }
  const top = at(1);
  // crown bud (dark boot of old leaf bases)
  parts.push(makeLimb(top.clone().setY(top.y - 0.18), top.clone().setY(top.y + 0.12), 0.12, 0.05, sides, () => 0.55));
  // fronds
  const s = newSoup();
  const nF = lod === 2 ? 9 : lod === 1 ? 12 : (detail === 'low' ? 13 : 16);
  const segs = lod === 2 ? 2 : lod === 1 ? 3 : 5;
  const shadeOf = (t: number): number => 0.6 + 0.45 * (1 - Math.abs(t - 0.45));
  for (let f = 0; f < nF; f++) {
    const a = (f / nF) * Math.PI * 2 + rng() * 0.3;
    const rise = 0.5 - (f % 3) * 0.35 + rng() * 0.2;    // some up, some level, some drooping
    const len = 1.05 + rng() * 0.25;
    const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    const side = new THREE.Vector3(-dir.z, 0, dir.x);
    let prev = top.clone();
    let prevW = 0.03;
    for (let k = 1; k <= segs; k++) {
      const t = k / segs;
      // arch: rises then droops under its own weight
      const p = top.clone().addScaledVector(dir, len * t).setY(top.y + len * (rise * t - 0.75 * t * t));
      const w = 0.25 * Math.sin(Math.PI * Math.min(1, t * 1.15)) + 0.02;
      const up = new THREE.Vector3(0, 1, 0).addScaledVector(dir, -rise * 0.4).normalize();
      // leaflets droop to both sides of the rachis (a shallow V)
      const sideP = side.clone().multiplyScalar(w).addScaledVector(up, -w * 0.35);
      const sideM = side.clone().multiplyScalar(-w).addScaledVector(up, -w * 0.35);
      const sidePp = side.clone().multiplyScalar(prevW).addScaledVector(up, -prevW * 0.35);
      const sideMp = side.clone().multiplyScalar(-prevW).addScaledVector(up, -prevW * 0.35);
      const t0 = (k - 1) / segs;
      const q = [prev.clone().add(sideMp), prev.clone().add(sidePp), p.clone().add(sideP), p.clone().add(sideM)];
      soupQuad(s, q, [[0, t0], [1, t0], [1, t], [0, t]], up, [shadeOf(t0), shadeOf(t0), shadeOf(t), shadeOf(t)], (rng() - 0.5) * 0.08, top, 3 + rng() * 0.99);
      prev = p; prevW = w;
    }
  }
  // dead fronds hanging under the crown (bark-tinted, brown)
  if (lod < 2) {
    const nD = lod === 0 ? 5 : 3;
    for (let f = 0; f < nD; f++) {
      const a = rng() * Math.PI * 2;
      const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
      const side = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(0.12);
      const p0 = top.clone().addScaledVector(dir, 0.1).setY(top.y - 0.1);
      const p1 = top.clone().addScaledVector(dir, 0.3).setY(top.y - 0.8 - rng() * 0.2);
      soupQuad(s, [p0.clone().sub(side), p0.clone().add(side), p1.clone().add(side), p1.clone().sub(side)], [[0, 0], [1, 0], [1, 1], [0, 1]], dir.clone().setY(1).normalize(), [0.9, 0.9, 0.7, 0.7], 0.1, top, 3.5, 0);
    }
  }
  parts.push(soupGeometry(s));
  return mergeVeg(parts, 'palm');
}

// ── Conifer ───────────────────────────────────────────────────────────────────

/**
 * Layered fir/spruce: stacked jagged skirts (alternating branch tips and
 * notches, tips drooping), each with a dark underside, over a visible trunk.
 * Nominal height ≈ 3.0 at scale 1.
 */
export function buildConiferTree(detail: VegDetail, seed: number, lod: TreeLod = 0): THREE.BufferGeometry {
  const rng = makeRng(seed + 999);
  const parts: THREE.BufferGeometry[] = [];
  // r10: close-up (LOD 0) conifers get many more, shorter whorls with ragged,
  // drooping branch tips and per-whorl colour, so they read as a spruce / fir
  // rather than a stack of low-poly cones; the far LODs stay cheap.
  const tiers = lod === 0
    ? (detail === 'high' ? 8 : detail === 'medium' ? 7 : 6)
    : lod === 1 ? (detail === 'low' ? 3 : 5) : (detail === 'high' ? 4 : 3);
  const k = lod === 0 ? 9 : lod === 1 ? 7 : 6; // branch tips per tier
  const H = 3.0;
  const base = 0.42;            // lowest skirt height — trunk visible below
  const topY = H;
  const maxR = 0.78;
  const ragged = lod === 0 ? 1 : lod === 1 ? 0.6 : 0.3;

  const posArr: number[] = [];
  const nrmArr: number[] = [];
  const colArr: number[] = [];
  const lobeArr: number[] = [];
  let tint = 1, warm = 0;
  const push = (p: THREE.Vector3, n: THREE.Vector3, c: number, cool: number, lobe: THREE.Vector3): void => {
    posArr.push(p.x, p.y, p.z);
    nrmArr.push(n.x, n.y, n.z);
    const cc = c * tint;
    colArr.push(cc * (1 - cool * 0.5) * (1 + warm), cc, cc * (1 + cool * 0.35) * (1 - warm));
    lobeArr.push(lobe.x, lobe.y, lobe.z);
  };

  const sprigs: Array<{ q: THREE.Vector3[]; n: THREE.Vector3; c: number[]; lobe: THREE.Vector3; k: number }> = [];
  for (let t = 0; t < tiers; t++) {
    const f = t / tiers;                                    // 0 bottom → 1 top
    const yBase = base + (topY - base) * f * 0.92;
    const tierH = (topY - base) / tiers * (t === tiers - 1 ? 1.9 : 1.75 + 0.35 * ragged);
    const yApex = Math.min(topY, yBase + tierH);
    // slightly concave profile: the lower whorls spread wide, the top tapers to a leader
    const r = maxR * Math.pow(1 - f * 0.88, 0.92) * (0.9 + rng() * 0.2);
    // per-whorl colour: some branches darker / bluer, some lighter new growth
    tint = 1 + (rng() - 0.5) * 0.22 * ragged;
    warm = (rng() - 0.5) * 0.08 * ragged;
    const apex = new THREE.Vector3((rng() - 0.5) * 0.03, yApex, (rng() - 0.5) * 0.03);
    const hub = new THREE.Vector3(0, yBase + tierH * 0.28, 0);
    const lobe = new THREE.Vector3(0, yBase + tierH * 0.4, 0);
    const rot = rng() * Math.PI * 2;
    const ring: THREE.Vector3[] = [];
    const tipFlag: boolean[] = [];
    for (let i = 0; i < k * 2; i++) {
      const tip = i % 2 === 0;
      const a = rot + (i / (k * 2)) * Math.PI * 2 + (tip ? (rng() - 0.5) * (0.25 + 0.25 * ragged) : (rng() - 0.5) * 0.12 * ragged);
      // ragged whorl: branch lengths vary, some short, a few long
      const rr = r * (tip ? 0.88 + rng() * (0.2 + 0.22 * ragged) : 0.56 + rng() * (0.08 + 0.1 * ragged));
      // branch tips droop under their own weight (more on the long lower limbs)
      const droop = tip ? -(0.10 + rng() * 0.08 + 0.1 * ragged * (1 - f)) : 0.06;
      ring.push(new THREE.Vector3(Math.cos(a) * rr, yBase + droop * (0.5 + r), Math.sin(a) * rr));
      tipFlag.push(tip);
    }
    const shadeTier = 0.74 + 0.26 * f; // lower tiers are shaded by those above
    // r15 near: a feathery sprig (pinnate cut-out) off every branch tip, so
    // the tier edges read as boughs instead of hard-edged flat triangles
    if (lod === 0) {
      for (let i = 0; i < ring.length; i++) {
        if (!tipFlag[i]) continue;
        const tp = ring[i];
        const out = new THREE.Vector3(tp.x, 0, tp.z).normalize();
        const side = new THREE.Vector3(-out.z, 0, out.x);
        const n = out.clone().multiplyScalar(0.5).setY(0.85).normalize();
        const c0 = 0.95 * shadeTier, c1 = 0.8 * shadeTier;
        // a feathery tip sprig hanging past the branch end
        {
          const len = 0.22 + rng() * 0.12, w = 0.1 + rng() * 0.05;
          const a = tp.clone().addScaledVector(out, -len * 0.4).setY(tp.y + 0.03);
          const b = tp.clone().addScaledVector(out, len * 0.6).setY(tp.y - 0.07 - rng() * 0.05);
          sprigs.push({ q: [a.clone().addScaledVector(side, -w), a.clone().addScaledVector(side, w), b.clone().addScaledVector(side, w * 0.55), b.clone().addScaledVector(side, -w * 0.55)], n, c: [c0, c0, c1, c1], lobe, k: CARD_BOUGH + 0.02 + rng() * 0.96 });
        }
        // a layered bough lying just over the tier, hub → tip (breaks the stacked-cone look)
        {
          const w = Math.max(0.08, r * 0.3);
          const a = new THREE.Vector3(tp.x * 0.25, hub.y + (apex.y - hub.y) * 0.35 + 0.03, tp.z * 0.25);
          const b = tp.clone().addScaledVector(out, 0.04).setY(tp.y + 0.02);
          const sd = side.clone().applyAxisAngle(out, (rng() - 0.5) * 0.4);
          sprigs.push({ q: [a.clone().addScaledVector(sd, -w * 0.5), a.clone().addScaledVector(sd, w * 0.5), b.clone().addScaledVector(sd, w), b.clone().addScaledVector(sd, -w)], n, c: [c0 * 0.85, c0 * 0.85, c0, c0], lobe, k: CARD_BOUGH + 0.02 + rng() * 0.96 });
        }
      }
    }
    const n = new THREE.Vector3();
    const slope = Math.atan2(r, tierH);
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length];
      // Upper surface (apex → ring edge)
      const na = new THREE.Vector3(a.x, 0, a.z).normalize().multiplyScalar(Math.cos(slope)).setY(Math.sin(slope) + 0.25).normalize();
      const nb = new THREE.Vector3(b.x, 0, b.z).normalize().multiplyScalar(Math.cos(slope)).setY(Math.sin(slope) + 0.25).normalize();
      n.copy(na).add(nb).normalize();
      // Counter-clockwise seen from outside (apex → b → a): the ring runs
      // clockwise seen from above, and apex → a → b faced the triangle
      // inward — the sunlit upper surface was back-face culled and every
      // conifer showed only its dark underside, i.e. rendered black.
      push(apex, n.clone().setY(n.y + 0.6).normalize(), 1.02 * shadeTier + 0.08, -0.1, lobe);
      push(b, nb, (tipFlag[(i + 1) % ring.length] ? 0.98 : 0.68) * shadeTier, tipFlag[(i + 1) % ring.length] ? 0 : 0.3, lobe);
      push(a, na, (tipFlag[i] ? 0.98 : 0.68) * shadeTier, tipFlag[i] ? 0 : 0.3, lobe);
      // Underside (ring edge → hub), dark and cool. Far LOD: one triangle
      // per branch tip pair (half the fan) — it is only seen as a dark rim.
      const down = new THREE.Vector3(0, -1, 0);
      if (lod === 2) {
        if (!tipFlag[i]) continue;
        const c2 = ring[(i + 2) % ring.length];
        push(hub, down, 0.34, 0.4, lobe);
        push(a, down, 0.48 * shadeTier, 0.3, lobe);
        push(c2, down, 0.48 * shadeTier, 0.3, lobe);
        continue;
      }
      push(hub, down, 0.34, 0.4, lobe);
      push(a, down, 0.48 * shadeTier, 0.3, lobe);
      push(b, down, 0.48 * shadeTier, 0.3, lobe);
    }
  }
  if (sprigs.length) {
    const sp = newSoup();
    for (const g of sprigs) soupQuad(sp, g.q, [[0, 0], [1, 0], [1, 1], [0, 1]], g.n, g.c, 0, g.lobe, g.k);
    parts.push(soupGeometry(sp));
  }
  const foliage = new THREE.BufferGeometry();
  foliage.setAttribute('position', new THREE.Float32BufferAttribute(posArr, 3));
  foliage.setAttribute('normal', new THREE.Float32BufferAttribute(nrmArr, 3));
  foliage.setAttribute('color', new THREE.Float32BufferAttribute(colArr, 3));
  foliage.setAttribute('aLeaf', new THREE.Float32BufferAttribute(new Array(posArr.length / 3).fill(1), 1));
  foliage.setAttribute('aLobe', new THREE.Float32BufferAttribute(lobeArr, 3));
  parts.push(foliage);

  const barkShade = (p: THREE.Vector3): number => Math.min(1, 0.55 + p.y * 0.35);
  if (lod > 0) {
    parts.push(makeLimb(new THREE.Vector3(0, -0.05, 0), new THREE.Vector3(0, 1.6, 0), 0.12, 0.04, lod === 2 ? 4 : 5, barkShade));
  } else {
    // root flare: the trunk widens into the ground under the lowest skirt
    parts.push(makeLimb(new THREE.Vector3(0, -0.05, 0), new THREE.Vector3(0, 0.14, 0), 0.19, 0.1, detail === 'low' ? 6 : 7, (p) => 0.5 + p.y * 0.4));
    parts.push(makeLimb(new THREE.Vector3(0, 0.14, 0), new THREE.Vector3(0, 1.6, 0), 0.1, 0.04, detail === 'low' ? 5 : 6, barkShade));
  }

  return mergeVeg(parts, 'conifer');
}

// ── Tall bole with a crown on top (bald cypress / longleaf pine) ─────────────

/**
 * r9 landscape. `cypress` — bald cypress: buttressed, flared base, a tall
 * straight bole and a flat-topped, wide, feathery crown (a few sparse lower
 * tufts); ≈ 3.1 tall at scale 1. `longleaf` — longleaf pine: a tall bare
 * bole, a few short upturned limbs and rounded needle tufts clustered at
 * the very top ("lollipop" crown); ≈ 3.6 tall.
 */
export function buildTallCrownTree(type: 'cypress' | 'longleaf', detail: VegDetail, seed: number, lod: TreeLod = 0): THREE.BufferGeometry {
  const rng = makeRng(seed + (type === 'cypress' ? 313 : 727));
  const parts: THREE.BufferGeometry[] = [];
  const sides = lod === 2 || detail === 'low' ? 5 : 7;
  const barkShade = (p: THREE.Vector3): number => Math.min(1, 0.5 + p.y * 0.18);
  const lobes: LobeSpec[] = [];
  if (type === 'cypress') {
    // old bald cypress (see buildBaldCypress)
    for (const p of baldCypressParts(false, detail, seed, lod, rng)) parts.push(p);
  } else {
    // r10: a loblolly / mature longleaf crown over the upper ~40 % of the
    // tree (was a small "lollipop" tuft on a 19 m bare pole, which read as
    // fallen poles from above and left the stand floor lit)
    parts.push(makeLimb(new THREE.Vector3(0, -0.05, 0), new THREE.Vector3(0, 3.2, 0), 0.09, 0.035, sides, barkShade));
    const crown = new THREE.Vector3(0, 2.85, 0);
    const n = lod === 2 ? 4 : 6;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rng() * 0.8;
      const y = 2.25 + (i % 3) * 0.32 + rng() * 0.18;
      const rr = 0.38 - (y - 2.25) * 0.12;
      const c = new THREE.Vector3(Math.cos(a) * rr, y, Math.sin(a) * rr);
      lobes.push({ c, r: 0.3 + rng() * 0.08, tint: (rng() - 0.5) * 0.1 });
      if (lod < 2) parts.push(makeLimb(new THREE.Vector3(0, y - 0.25, 0), c, 0.03, 0.015, 4, barkShade));
    }
    lobes.push({ c: new THREE.Vector3(0, 3.3, 0), r: 0.3, tint: 0.05 });
    parts.push(makeCrownShell(lobes, crown, lod === 2 ? 7 : 10, lod === 2 ? 5 : 7, seed, 0.3, false));
  }
  return mergeVeg(parts, 'tall-crown');
}

/**
 * Fluted buttress: a flared cylinder whose radius swells into `flutes` ribs
 * at the ground and relaxes to a round bole at the top.
 */
function makeButtress(h: number, r0: number, r1: number, flutes: number, sides: number, phase: number, shade: (p: THREE.Vector3) => number): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(r1, r0, h, sides, 3, true);
  g.translate(0, h / 2 - 0.05, 0);
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const a = Math.atan2(z, x);
    const f = 1 - Math.min(1, (y + 0.05) / h);          // 1 at the ground → 0 at the top
    const rib = Math.pow(Math.max(0, Math.cos(flutes * a + phase)), 3);
    const k = 1 + f * f * (rib * 0.55 - 0.18);
    p.setXYZ(i, x * k, y, z * k);
  }
  g.computeVertexNormals();
  return finalize(g, 0, new THREE.Vector3(0, h, 0), (q) => { const s = shade(q); return [s, s, s]; });
}

/**
 * r11 bald cypress (Taxodium distichum), two age classes:
 *  - young: a narrow, soft pyramidal crown from low on the bole to a pointed
 *    top (≈ 2.7 at scale 1), a slight flare at the foot;
 *  - old: a fluted, buttressed base, a tall bole and an irregular,
 *    flat-topped crown of separate feathery clumps on near-level limbs, with
 *    sky between them (≈ 3.1 tall) — not one umbrella.
 * Feathery needles: lumpy, high-frequency shells whose normals follow the
 * crown volume (soft shading), slightly yellow-green tips (vertex tint).
 */
export function buildBaldCypress(young: boolean, detail: VegDetail, seed: number, lod: TreeLod = 0): THREE.BufferGeometry {
  const rng = makeRng(seed + (young ? 517 : 313));
  const parts = baldCypressParts(young, detail, seed, lod, rng);
  return mergeVeg(parts, 'bald cypress');
}

function baldCypressParts(young: boolean, detail: VegDetail, seed: number, lod: TreeLod, rng: () => number): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const sides = lod === 2 || detail === 'low' ? 6 : 8;
  const barkShade = (p: THREE.Vector3): number => Math.min(1, 0.48 + p.y * 0.2);
  /** Flatten the top of a clump: needles spray sideways, not up. */
  const flatTop = (g: THREE.BufferGeometry, cy: number, up: number, squash: number) => {
    const sp = g.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < sp.count; i++) {
      let y = cy + (sp.getY(i) - cy) * squash;
      if (y > cy + up) y = cy + up + (y - cy - up) * 0.25;
      sp.setY(i, y);
    }
  };
  if (young) {
    const H = 2.7;
    parts.push(makeButtress(0.3, 0.17, 0.085, lod === 2 ? 3 : 5, lod === 2 ? 6 : 10, rng() * 6, barkShade));
    parts.push(makeLimb(new THREE.Vector3(0, 0.24, 0), new THREE.Vector3(0, H - 0.05, 0), 0.085, 0.025, lod === 2 ? 4 : 5, barkShade));
    // a stack of tufts narrowing to a point: the soft spire of a young tree
    const lobes: LobeSpec[] = [];
    const tiers = lod === 2 ? 4 : 6;
    for (let i = 0; i < tiers; i++) {
      const f = i / (tiers - 1);
      const y = 0.95 + f * (H - 1.15);
      const r = 0.44 * (1 - f * 0.78) * (0.9 + rng() * 0.2);
      const a = rng() * Math.PI * 2, off = r * 0.18 * rng();
      lobes.push({ c: new THREE.Vector3(Math.cos(a) * off, y, Math.sin(a) * off), r, tint: 0.02 + f * 0.06 });
    }
    lobes.push({ c: new THREE.Vector3(0, H - 0.1, 0), r: 0.08, tint: 0.08 });
    const crown = new THREE.Vector3(0, 1.55, 0);
    const shell = makeCrownShell(lobes, crown, lod === 2 ? 8 : 11, lod === 2 ? 6 : 10, seed + 3, detail === 'low' && lod === 2 ? 0.22 : 0.3, false);
    parts.push(shell);
    return parts;
  }
  // ── old tree ──
  parts.push(makeButtress(0.55, 0.32, 0.12, lod === 2 ? 3 : 6, lod === 2 ? 6 : 12, rng() * 6, barkShade));
  const lean = new THREE.Vector3((rng() - 0.5) * 0.12, 0, (rng() - 0.5) * 0.12);
  const top = new THREE.Vector3(lean.x, 2.95, lean.z);
  parts.push(makeLimb(new THREE.Vector3(0, 0.45, 0), top, 0.12, 0.045, sides, barkShade));
  // clumps on near-level limbs: one over the leader, the rest spread out
  const nC = lod === 2 ? 3 : 5;
  const clumps: Array<{ c: THREE.Vector3; r: number }> = [{ c: new THREE.Vector3(lean.x, 2.82, lean.z), r: 0.46 }];
  const a0 = rng() * Math.PI * 2;
  for (let i = 0; i < nC - 1; i++) {
    const a = a0 + (i / (nC - 1)) * Math.PI * 2 + (rng() - 0.5) * 0.9;
    const reach = 0.42 + rng() * 0.3;
    const y = 2.2 + rng() * 0.5;
    const c = new THREE.Vector3(lean.x * (y / 3) + Math.cos(a) * reach, y + 0.08, lean.z * (y / 3) + Math.sin(a) * reach);
    clumps.push({ c, r: 0.3 + rng() * 0.12 });
    if (lod < 2) {
      const from = new THREE.Vector3(lean.x * (y / 3), y - 0.1 - rng() * 0.15, lean.z * (y / 3));
      parts.push(makeLimb(from, c.clone().setY(c.y - 0.04), 0.035, 0.012, 4, barkShade));
    }
  }
  for (let k = 0; k < clumps.length; k++) {
    const { c, r } = clumps[k];
    // two or three overlapping lobes per clump: an irregular, flat-topped spray
    const lobes: LobeSpec[] = [{ c: c.clone(), r, tint: 0.03 }];
    const extra = lod === 2 ? 1 : 3;
    for (let e = 0; e < extra; e++) {
      const a = rng() * Math.PI * 2;
      lobes.push({ c: new THREE.Vector3(c.x + Math.cos(a) * r * 0.62, c.y - r * (0.1 + rng() * 0.35), c.z + Math.sin(a) * r * 0.62), r: r * (0.55 + rng() * 0.25), tint: (rng() - 0.5) * 0.12 });
    }
    const sh = makeCrownShell(lobes, c, lod === 2 ? 7 : 10, lod === 2 ? 4 : 7, seed + 11 * k, 0.42, false);
    flatTop(sh, c.y, r * 0.3, 0.72);
    parts.push(sh);
  }
  if (lod < 2) {
    // a sparse epicormic tuft or two along the bole
    for (let k = 0; k < 2; k++) {
      const a = rng() * Math.PI * 2, y = 1.45 + k * 0.4 + rng() * 0.15;
      const c = new THREE.Vector3(Math.cos(a) * 0.22, y, Math.sin(a) * 0.22);
      const t = makeCrownShell([{ c, r: 0.16, tint: 0.05 }], c, 6, 4, seed + 40 + k, 0.3, false);
      flatTop(t, c.y, 0.04, 0.6);
      parts.push(t);
    }
  }
  return parts;
}

// ── Shrub ─────────────────────────────────────────────────────────────────────

/** Low mounded shrub clump (boxwood / yew / hydrangea mass), ~0.5 tall. */
export function buildShrub(seed: number, cards = false): THREE.BufferGeometry {
  const rng = makeRng(seed + 4242);
  const parts: THREE.BufferGeometry[] = [];
  const crown = new THREE.Vector3(0, 0.18, 0);
  const lobes: LobeSpec[] = [{ c: new THREE.Vector3(0, 0.2, 0), r: 0.27, tint: 0.02 }];
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + rng() * 0.8;
    lobes.push({ c: new THREE.Vector3(Math.cos(a) * 0.22, 0.14 + rng() * 0.05, Math.sin(a) * 0.22), r: 0.2 + rng() * 0.05, tint: (rng() - 0.5) * 0.12 });
  }
  // r15 near shrubs: a shrunk shell inside a skin of small leaf cards (the
  // plain shell read as a faceted green boulder at eye level)
  parts.push(makeCrownShell(lobes, crown, cards ? 10 : 8, cards ? 6 : 5, seed, 0.2, true, cards ? { shrink: 0.86 } : {}));
  if (cards) {
    const lc = makeLeafCards(lobes, crown, 0.45, 70, 0.075, rng, { under: 0.1 });
    // keep the cards above the ground
    const p = lc.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) if (p.getY(i) < 0.01) p.setY(i, 0.01);
    parts.push(lc);
  }
  return mergeVeg(parts, 'shrub');
}

/**
 * r15 hedge sprig: a small clump of leaf cards (≈ unit radius, centred on the
 * origin) laid over the box body of a clipped hedge by HedgeSkin, so a hedge
 * reads as foliage with a broken outline instead of a smooth green slab.
 */
export function buildHedgeSprig(seed: number): THREE.BufferGeometry {
  const rng = makeRng(seed + 777);
  const lobes: LobeSpec[] = [
    { c: new THREE.Vector3(0, 0, 0), r: 0.62, tint: 0 },
    { c: new THREE.Vector3(0.38, 0.05, 0.1), r: 0.42, tint: 0.05 },
    { c: new THREE.Vector3(-0.36, -0.04, -0.08), r: 0.42, tint: -0.04 },
  ];
  const g = makeLeafCards(lobes, new THREE.Vector3(0, -0.2, 0), 0.9, 22, 0.42, rng, { under: 0.6 });
  return mergeVeg([g], 'hedge sprig');
}

// ── Shared vegetation material ────────────────────────────────────────────────
// Every renderer that draws trees (campus trees + shrubs, decorative lot trees,
// off-campus street / park trees) uses these geometries with this material so
// all vegetation shares one look: bark tinted by uBarkColor, foliage by the
// per-instance colour, baked AO, wind sway, leaf flutter and clump speckle.

/** Global wind clock shared by every vegetation material (seconds). */
export const VEG_WIND: { value: number } = { value: 0 };

const VEG_VERT_PARS = /* glsl */`
uniform float uWindTime;
uniform float uLeafFill;
uniform vec3 uBarkColor;
attribute float aLeaf;
attribute vec3 aLobe;
attribute vec3 aCard;
varying float vLeaf;
varying vec3 vLeafP;
varying float vVegUp;
varying vec3 vCard;
varying float vLeafDown;
`;

const VEG_FRAG_PARS = /* glsl */`
uniform float uLeafFill;
varying float vLeaf;
varying vec3 vLeafP;
varying float vVegUp;
varying vec3 vCard;
varying float vLeafDown;
float vegCardShade = 1.0;
// r21: share of the lying snow a card holds (conifer boughs: along the twig only)
float vegCardSnow = 1.0;
float vegHash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float vegNoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(vegHash(i), vegHash(i + vec3(1,0,0)), f.x),
                 mix(vegHash(i + vec3(0,1,0)), vegHash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(vegHash(i + vec3(0,0,1)), vegHash(i + vec3(1,0,1)), f.x),
                 mix(vegHash(i + vec3(0,1,1)), vegHash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
// r15 leaf-cluster card: a ragged spray of pointed leaves (> 0 = leaf).
// Far away (big uv footprint) it relaxes to a soft disc so it never shimmers.
float vegLeafMask(vec2 uv, float sd, float fw) {
  float r = length(uv - 0.5) * 2.0;
  float disc = 0.78 - r;
  if (fw > 0.3) return disc;
  vec2 p = uv * 5.5;
  vec2 ip = floor(p);
  float best = -1.0;
  float shade = 1.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 c = ip + vec2(float(i), float(j));
      vec3 h = fract(sin(vec3(dot(c, vec2(127.1, 311.7)), dot(c, vec2(269.5, 183.3)), dot(c, vec2(419.2, 371.9))) + sd * 13.7) * 43758.5453);
      vec2 d = p - (c + 0.5 + (h.xy - 0.5) * 0.8);
      float a = h.z * 6.2832;
      vec2 q = vec2(cos(a) * d.x + sin(a) * d.y, -sin(a) * d.x + cos(a) * d.y);
      // pointed leaf: wide at the base, tapering to the tip
      float wdt = 0.46 * (1.0 - 0.55 * clamp(q.x / 0.95 + 0.5, 0.0, 1.0));
      float e = length(vec2(q.x / 0.95, q.y / max(0.05, wdt)));
      float m = 1.0 - e;
      if (m > best) { best = m; shade = 0.74 + 0.46 * h.y; }
    }
  }
  vegCardShade = mix(shade, 1.0, smoothstep(0.1, 0.3, fw));
  float m = best - smoothstep(0.62, 1.0, r) * 1.1;
  return mix(m, disc, smoothstep(0.12, 0.3, fw));
}
// Palm frond: a solid rachis with angled leaflets either side
float vegFrondMask(vec2 uv, float fw) {
  float x = abs(uv.x - 0.5) * 2.0;
  if (x < 0.07) return 1.0;
  if (fw > 0.12) return 0.85 - x;
  float l = fract(uv.y * 30.0 - x * 1.6);
  vegCardShade = 0.82 + 0.3 * (1.0 - x);
  return min(0.5 - abs(l - 0.3) * 2.2, 0.98 - x);
}
// r21 conifer bough (card kinds [2, 3)): a tapered spray of needle tufts along
// a twig. The old pinnate frond cut-out put 30 even teeth on every card — at
// eye level a hard comb / moiré, and snow whitened every tooth. Here the
// outline is a few soft tufts with ragged tips and some gaps; the needles are
// shading only (never cut finer than a tuft). Snow lies in clumps along the
// twig and leaves the fringe and the tip green.
float vegBoughMask(vec2 uv, float sd, float fw) {
  float x = abs(uv.x - 0.5) * 2.0;               // 0 on the twig, 1 at the card edge
  float v = uv.y;                                // 0 hub end, 1 tip
  float far = smoothstep(0.06, 0.16, fw);
  // tufts: a lumpy half-width along the bough, thin at the hub, pointed tip
  float tuft = vegNoise(vec3(v * 6.0 + sd * 17.0, sd * 5.0, 1.3));
  float w = (0.6 + 0.4 * tuft) * smoothstep(0.0, 0.18, v) * (1.0 - smoothstep(0.62, 1.0, v) * 0.85);
  // ragged needle ends (tuft-sized, not tooth-sized), fading out with distance
  float rag = vegNoise(vec3(v * 16.0 + sd * 9.0, x * 3.0, sd * 3.0)) - 0.5;
  float m = w * (1.0 - 0.38 * (1.0 - far) * (rag + 0.5)) - x * 0.92;
  // a few soft gaps between tufts (sky / the tier below shows through)
  float gap = vegNoise(vec3(uv.x * 5.0 + sd * 3.0, v * 8.0, sd * 11.0));
  m -= (1.0 - far) * smoothstep(0.66, 0.8, gap) * 0.5 * smoothstep(0.15, 0.5, x);
  float grain = vegNoise(vec3(uv.x * 14.0, v * 22.0, sd * 7.0));
  vegCardShade = mix(0.74 + 0.34 * (1.0 - x) * (0.7 + 0.3 * tuft) + 0.12 * (grain - 0.5), 0.9, far);
  // snow clumps sit on the twig, not on the needle fringe or the drooping tip
  float clump = vegNoise(vec3(v * 4.5 + sd * 23.0, x * 1.5, sd * 13.0));
  vegCardSnow = smoothstep(0.85, 0.3, x + (clump - 0.5) * 0.6) * (1.0 - smoothstep(0.6, 0.92, v)) * smoothstep(0.25, 0.55, clump + 0.15);
  return m;
}
// Spanish moss (r16): soft irregular locks of fine wavy strands hanging from
// a ragged top edge — no even comb of equal teeth. Each card holds three or
// four locks of their own width, length and drift; inside a lock a few
// threads part near the camera; every lock tapers to a wisp.
float vegMossMask(vec2 uv, float sd, float fw) {
  float y = 1.0 - uv.y;                          // 0 at the top edge, 1 at the tip
  float far = smoothstep(0.08, 0.2, fw);
  float best = -1.0;
  float sh = 1.0;
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    float h1 = fract(sin(fi * 12.9898 + sd * 78.233) * 43758.5453);
    float h2 = fract(sin(fi * 39.346 + sd * 11.135) * 24634.6345);
    float h3 = fract(sin(fi * 73.156 + sd * 52.235) * 12345.678);
    float cx = 0.14 + 0.72 * fract(h1 + fi * 0.27);
    float top = 0.18 * h3;
    float len = 0.4 + 0.6 * h2;
    float t = (y - top) / len;
    if (t < 0.0 || t > 1.0) continue;
    // the lock drifts and waves a little as it hangs
    float dx = uv.x - cx - (h1 - 0.5) * 0.18 * t - 0.035 * sin(t * 6.5 + h3 * 9.0) * t;
    float w = (0.07 + 0.09 * h3) * (1.0 - 0.8 * t) * (0.75 + 0.25 * sin(t * 11.0 + h2 * 7.0));
    float m = w - abs(dx);
    // fine threads parting inside the lock (near only), wisps at the tip
    float th = sin(dx * 140.0 + sin(t * 23.0 + h1 * 6.0) * 2.2 + h2 * 20.0);
    m -= (1.0 - far) * step(0.55, th) * w * 0.9;
    m -= smoothstep(0.75, 1.0, t) * step(0.2, th) * w * (1.0 - far);
    if (m > best) { best = m; sh = 0.72 + 0.5 * h2 - 0.18 * t; }
  }
  vegCardShade = mix(sh, 1.0, far * 0.5);
  return best;
}
// r16 ornamental blossoms / fruit (card kinds [-3, -2.5) and [-4, -3)): a disc of
// small round florets (crepe myrtle / jacaranda panicles), or one round fruit
float vegBlossomMask(vec2 uv, bool fruit, float fw) {
  vec2 c = uv - 0.5;
  float r = length(c) * 2.0;
  if (fruit || fw > 0.25) return 0.9 - r;
  vec2 p = uv * 4.0;
  vec2 f = fract(p) - 0.5;
  float h = fract(sin(dot(floor(p), vec2(127.1, 311.7))) * 43758.5453);
  vegCardShade = 0.8 + 0.35 * h;
  return min(0.95 - r, 0.4 - length(f + (h - 0.5) * 0.18));
}
`;

/** Vertex: crown thinning (winter / seasonal leaf drop), wind sway, leaf flutter. */
const VEG_BEGIN_VERTEX = `#include <begin_vertex>
      // Winter / sparse crowns: pull foliage toward its lobe centre
      transformed = mix(transformed, aLobe + (transformed - aLobe) * (uLeafFill * (1.0 - 0.22 * seaBare)), aLeaf);
      float wHash = 0.0;
      #ifdef USE_INSTANCING
        wHash = fract(instanceMatrix[3].x * 0.12731 + instanceMatrix[3].z * 0.25113);
      #endif
      // Wind sway: amplitude proportional to local height, phase per tree
      float windAmp  = 0.030 * max(0.0, position.y);
      float windTime = uWindTime;
      transformed.x += sin(windTime * 1.35 + wHash * 6.28318) * windAmp;
      transformed.z += cos(windTime * 1.10 + wHash * 6.28318 + 1.047) * windAmp * 0.55;
      // Leaf flutter: each lobe shivers on its own phase
      float fl = sin(windTime * 3.1 + dot(aLobe, vec3(7.1, 3.3, 5.7)) + wHash * 6.28318);
      transformed += aLeaf * vec3(fl * 0.012, abs(fl) * 0.006, fl * 0.009);`;

/** Fragment: punch noise holes through thinned crowns (see-through twig shell). */
const VEG_DISCARD = `#include <clipping_planes_fragment>
      // r15 near foliage: shell gaps, leaf-cluster / frond / moss cut-outs
      if (abs(vCard.z) > 0.25) {
        float cfw = length(fwidth(vCard.xy));
        if (vCard.z < -2.5) {
          // blossoms fall with the leaves; fruit stays
          if (vCard.z > -3.0 && vSeaBare > 0.35) discard;
          if (vegBlossomMask(vCard.xy, vCard.z < -3.0, cfw) < 0.0) discard;
        } else if (vCard.z < -0.5) {
          if (vegMossMask(vCard.xy, fract(vCard.z), cfw) < 0.0) discard;
        } else if (vCard.z < 0.75) {
          // near crown shell: a few gaps in leaf; as the leaves fall it thins
          // away to a sparse twig speckle (the bare limbs and twigs show)
          if (vegNoise(vLeafP * 1.25 + 7.0) * 0.72 + vegNoise(vLeafP * 3.4 + 2.0) * 0.28 > 0.73 - 0.5 * vSeaBare) discard;
        } else if (vCard.z < 2.0) {
          // leaves drop card by card as the crown goes bare
          // (once a crown is well bare no leaf card is left hanging in the twigs)
          if (vSeaBare > 0.62 || fract(vCard.z) < vSeaBare * 1.6 - 0.1) discard;
          if (vegLeafMask(vCard.xy, fract(vCard.z), cfw) < 0.0) discard;
        } else if (vCard.z < 3.0) {
          if (vegBoughMask(vCard.xy, fract(vCard.z), cfw) < 0.0) discard;
        } else {
          if (vegFrondMask(vCard.xy, cfw) < 0.0) discard;
        }
      }
      // r10: a bare crown keeps a denser twig haze (grey-brown mass, not a sieve)
      float vegFill = uLeafFill * (1.0 - 0.3 * vSeaBare);
      if (vegFill < 0.999 && vLeaf > 0.5) {
        // Bare crowns: finer holes so what is left reads as a twig lattice
        float wn = mix(vegNoise(vLeafP * 1.7) * 0.65 + vegNoise(vLeafP * 4.1 + 3.0) * 0.35,
                       vegNoise(vLeafP * 3.1) * 0.5 + vegNoise(vLeafP * 9.0 + 3.0) * 0.5, vSeaBare);
        if (wn > vegFill * 0.78) discard;
      }`;

export interface VegetationMaterialOptions {
  detail: VegDetail;
  /** Winter crown thinning (1 = full crown). */
  leafFill: { value: number };
  /** Bark tint uniform (shared so one write retints every tree). */
  barkColor: { value: THREE.Color };
  /** Wind clock; defaults to the global VEG_WIND. */
  wind?: { value: number };
  /** Evergreen foliage (conifers, shrubs): no fall colour / leaf drop. */
  evergreen?: boolean;
}

/**
 * Vegetation material: MeshStandardMaterial + onBeforeCompile injection.
 *   vertex   — wind sway (height-weighted, per-instance phase) + per-lobe
 *              flutter; winter crown thinning toward lobe centres; bark vs
 *              foliage tint selection (foliage = instanceColor)
 *   fragment — leaf-clump speckle (colour + normal jitter), High/Medium only
 *   seasons  — deciduous crowns follow the shared season uniforms
 *              (season/seasonShader.ts): per-tree fall colour + timing,
 *              spring flush / blossom, leaf drop to a see-through twig shell
 */
export function createVegetationMaterial(o: VegetationMaterialOptions): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: 0.88, metalness: 0, vertexColors: true,
  });
  const detail = o.detail;
  const wind = o.wind ?? VEG_WIND;
  const evergreen = !!o.evergreen;
  mat.defines = { SEA_VEG: '', ...(evergreen ? {} : { SEA_DECID: '' }) };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, SEASON_UNIFORMS);
    shader.uniforms['uWindTime'] = wind;
    shader.uniforms['uLeafFill'] = o.leafFill;
    shader.uniforms['uBarkColor'] = o.barkColor;
    // Every uniform must be declared — an undeclared uWindTime previously
    // failed compilation and made every campus canopy silently vanish.
    shader.vertexShader = VEG_VERT_PARS + SEA_VEG_VERT_PARS + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <color_vertex>',
      `${SEA_VEG_TREE}
      vColor = vec4(1.0);
      vColor.rgb *= color;
      #ifdef USE_INSTANCING_COLOR
        #ifdef SEA_DECID
          vColor.rgb *= mix(uBarkColor, seaLeaf(instanceColor.rgb, seaH), aLeaf);
        #else
          vColor.rgb *= mix(uBarkColor, instanceColor.rgb, aLeaf);
        #endif
      #else
        vColor.rgb *= mix(uBarkColor, vec3(1.0), aLeaf);
      #endif
      // Spanish moss keeps its own grey-green (not the canopy tint / fall colour)
      if (aCard.z < -2.5) vColor.rgb = color;   // r16 blossoms / fruit keep their own colour
      else if (aCard.z < -0.5) vColor.rgb = color * vec3(0.16, 0.175, 0.135);
      vCard = aCard;
      vLeafDown = aLeaf * max(0.0, -normalize(normal).y);
      vLeaf = aLeaf;
      // How much a foliage vertex faces the sky (conifer tiers: 1 at the
      // apex of each tier, 0 at the drooping branch tips and undersides)
      vVegUp = aLeaf * smoothstep(0.72, 0.9, normalize(normal).y);
      vLeafP = position * 4.2;
      #ifdef USE_INSTANCING
        vLeafP += instanceMatrix[3].xyz * 0.61;
      #endif`,
    );
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      VEG_BEGIN_VERTEX,
    );
    shader.fragmentShader = VEG_FRAG_PARS + SEA_VEG_FRAG_PARS + shader.fragmentShader;
    // Winter: punch noise holes through thinned crowns so they read as a
    // see-through twig shell (bark + sky showing) rather than a solid blob.
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <clipping_planes_fragment>',
      VEG_DISCARD,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <lights_physical_fragment>',
      `#ifndef SEA_DECID
      // Evergreen foliage holds snow on the upper faces of its tiers only,
      // in soft clumps: green shows on the sides, tips and undersides.
      seaSnowMul = mix(1.0, vVegUp * smoothstep(0.25, 0.75, vegNoise(vLeafP * 0.7) * 0.7 + vVegUp * 0.45), vLeaf) * vegCardSnow;
      #endif
      #include <lights_physical_fragment>`,
    );
    // Foliage scatters light through the crown: lift the sky / ambient fill
    // so an overcast day doesn't crush crowns to near-black blobs.
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <lights_fragment_end>',
      `#include <lights_fragment_end>
      // r15: the underside of a crown is lit by light through the leaves
      // (transmission), not a black cave
      reflectedLight.indirectDiffuse *= 1.0 + 0.32 * vLeaf + 0.7 * vLeafDown;
      // r15 dusk: crowns, shrubs and hedges keep the sky light (no black masses)
      #define GS_ANY_FACE
      ${GROUND_SKY_FILL_GLSL}`,
    );
    if (detail !== 'low') {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        // Leaf-clump speckle: breaks each lobe into sunlit clusters + gaps
        float lnA = vegNoise(vLeafP);
        float lnB = vegNoise(vLeafP * 2.7 + 11.0);
        float leafN = lnA * 0.6 + lnB * 0.4;
        diffuseColor.rgb *= mix(1.0, 0.62 + 0.62 * leafN, vLeaf);
        // r15: each leaf of a card / frond / moss strand gets its own tone
        diffuseColor.rgb *= vegCardShade;
        // r15 bark: vertical furrows and ridges, lichen-grey patches
        if (vLeaf < 0.5) {
          float fur = vegNoise(vec3(vLeafP.x * 4.5, vLeafP.y * 0.55, vLeafP.z * 4.5));
          float fin = vegNoise(vLeafP * vec3(11.0, 2.5, 11.0) + 3.0);
          diffuseColor.rgb *= 0.58 + 0.62 * smoothstep(0.28, 0.72, fur * 0.7 + fin * 0.3);
          float lic = smoothstep(0.62, 0.8, vegNoise(vLeafP * 1.3 + 9.0));
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.20, 0.22, 0.17), lic * 0.35);
        }`,
      );
      if (detail === 'high') {
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <normal_fragment_begin>',
          `#include <normal_fragment_begin>
          // Jitter the shading normal per leaf clump so light catches clusters
          normal = normalize(normal + vLeaf * 0.55 * (vec3(lnA, lnB, vegNoise(vLeafP * 1.9 + 5.0)) - 0.5));`,
        );
      }
    }
  };
  mat.customProgramCacheKey = () => `campus-veg-v8-${detail}-${evergreen ? 'e' : 'd'}`;
  // Shadows follow the cut-outs (leaf cards, shell gaps) — and, deciduous,
  // the seasonal leaf drop
  {
    const depth = createVegetationDepthMaterial(o.leafFill, wind, evergreen);
    mat.userData.depthMaterial = depth;
    mat.addEventListener('dispose', () => depth.dispose());
  }
  mat.needsUpdate = true;
  return mat;
}

/**
 * Shadow-pass material for deciduous vegetation: the same crown thinning,
 * wind sway and seasonal leaf-drop holes as createVegetationMaterial, so bare
 * winter trees cast branch shadows instead of full-crown blobs. Assign as
 * `mesh.customDepthMaterial` (see applyVegetationDepth).
 */
export function createVegetationDepthMaterial(leafFill: { value: number }, wind: { value: number } = VEG_WIND, evergreen = false): THREE.MeshDepthMaterial {
  const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  m.defines = evergreen ? {} : { SEA_DECID: '' };
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, SEASON_UNIFORMS);
    shader.uniforms['uWindTime'] = wind;
    shader.uniforms['uLeafFill'] = leafFill;
    shader.uniforms['uBarkColor'] = { value: new THREE.Color(1, 1, 1) };
    shader.vertexShader = VEG_VERT_PARS + SEA_VEG_VERT_PARS + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `${SEA_VEG_TREE}
      vCard = aCard;
      vLeafDown = 0.0;
      vLeaf = aLeaf;
      vLeafP = position * 4.2;
      #ifdef USE_INSTANCING
        vLeafP += instanceMatrix[3].xyz * 0.61;
      #endif
      ${VEG_BEGIN_VERTEX}`,
    );
    shader.fragmentShader = VEG_FRAG_PARS + SEA_VEG_FRAG_PARS + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <clipping_planes_fragment>', VEG_DISCARD);
  };
  m.customProgramCacheKey = () => `campus-veg-depth-v3-${evergreen ? 'e' : 'd'}`;
  return m;
}

/** Give a deciduous vegetation set's meshes their seasonal shadow material. */
export function applyVegetationDepth(meshes: readonly THREE.Mesh[], mat: THREE.Material): void {
  const depth = mat.userData.depthMaterial as THREE.MeshDepthMaterial | undefined;
  if (!depth) return;
  for (const m of meshes) m.customDepthMaterial = depth;
}
