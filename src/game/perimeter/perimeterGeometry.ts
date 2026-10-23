/**
 * Perimeter geometry: each run drawn along its polyline, on the ground,
 * built up to its progress (hedges sized by growth), with gates. Berms and
 * ditches are earthworks in the terrain itself (ParcelTerrain.setEarthworks);
 * here they get only their gate posts. Sizes follow scale.test.ts (1 m = 1/6).
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { kitMaterial, type KitMaterialId } from '../buildkit/materials';
import { worldUV } from '../buildkit/shell';
import { PERIMETER, runGrowth, runProgress, wallLength, type PerimeterRun, type Pt } from '../../sim/perimeter';

const M = 1 / 6;
type Ground = (x: number, z: number) => number;

/** Point and unit direction at distance s along a polyline. */
export function along(pts: readonly Pt[], s: number): { x: number; z: number; dx: number; dz: number } {
  let left = Math.max(0, s);
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1], [bx, bz] = pts[i];
    const l = Math.hypot(bx - ax, bz - az);
    if (left <= l || i === pts.length - 1) {
      const t = l > 0 ? Math.min(1, left / l) : 0;
      return { x: ax + (bx - ax) * t, z: az + (bz - az) * t, dx: l ? (bx - ax) / l : 1, dz: l ? (bz - az) / l : 0 };
    }
    left -= l;
  }
  return { x: pts[0][0], z: pts[0][1], dx: 1, dz: 0 };
}

/**
 * Solid intervals of a run (gates removed), cut off at `built` wall length.
 * Pure (tested).
 */
export function solidSpans(run: Pick<PerimeterRun, 'pts' | 'gates'>, built: number): Array<[number, number]> {
  let L = 0;
  for (let i = 1; i < run.pts.length; i++) L += Math.hypot(run.pts[i][0] - run.pts[i - 1][0], run.pts[i][1] - run.pts[i - 1][1]);
  const gaps = run.gates.map(g => [g.at - g.w / 2, g.at + g.w / 2] as const).sort((a, b) => a[0] - b[0]);
  const out: Array<[number, number]> = [];
  let s = 0, left = built;
  for (const [g0, g1] of [...gaps, [L, L] as const]) {
    const e = Math.min(g0, L);
    if (e > s && left > 1e-6) { const take = Math.min(e - s, left); out.push([s, s + take]); left -= take; }
    s = Math.max(s, g1);
  }
  return out;
}

/** Geometry of one run (merged per material), in world coordinates. */
export function buildRun(run: PerimeterRun, ground: Ground, t: number): THREE.Group {
  const bits = new Map<KitMaterialId, THREE.BufferGeometry[]>();
  const add = (m: KitMaterialId, g: THREE.BufferGeometry) => { let l = bits.get(m); if (!l) bits.set(m, l = []); l.push(worldUV(g)); };
  const def = PERIMETER[run.kind];
  const wl = wallLength(run);
  const built = run.finishedAt !== null ? wl : wl * runProgress(run);
  const spans = solidSpans(run, built);
  const growth = runGrowth(run, t);
  /** A box from a to b (centre line) at height y0..y0+h, thickness th. */
  const beam = (ax: number, az: number, bx: number, bz: number, y0: number, h: number, th: number, m: KitMaterialId, sag = 0) => {
    const l = Math.hypot(bx - ax, bz - az);
    if (l < 1e-4) return;
    const ya = ground(ax, az), yb = ground(bx, bz);
    const g = new THREE.BoxGeometry(l, h, th).translate(0, h / 2, 0);
    g.rotateZ(Math.atan2(yb - ya, l)).rotateY(-Math.atan2(bz - az, bx - ax)).translate((ax + bx) / 2, (ya + yb) / 2 + y0 - sag, (az + bz) / 2);
    add(m, g);
  };
  const post = (x: number, z: number, h: number, r: number, m: KitMaterialId, round = false) => {
    const y = ground(x, z) - 0.02;
    add(m, round ? new THREE.CylinderGeometry(r, r * 1.1, h + 0.02, 7).translate(x, y + (h + 0.02) / 2, z) : new THREE.BoxGeometry(r * 2, h + 0.02, r * 2).translate(x, y + (h + 0.02) / 2, z));
  };
  /** Bays along the spans at a spacing: f(a, b) for each bay, posts at both ends. */
  const bays = (spacing: number, f: (a: ReturnType<typeof along>, b: ReturnType<typeof along>, i: number) => void) => {
    for (const [s0, s1] of spans) {
      const n = Math.max(1, Math.round((s1 - s0) / spacing));
      for (let i = 0; i < n; i++) f(along(run.pts, s0 + (s1 - s0) * i / n), along(run.pts, s0 + (s1 - s0) * (i + 1) / n), i);
    }
  };
  const spanEnds = () => spans.flatMap(([a, b]) => [along(run.pts, a), along(run.pts, b)]);

  switch (run.kind) {
    case 'split_rail':
      bays(2.4 * M, (a, b) => {
        post(a.x, a.z, 1.2 * M, 0.06 * M, 'wood_mid');
        for (const y of [0.35, 0.7, 1.05]) beam(a.x, a.z, b.x, b.z, y * M, 0.1 * M, 0.08 * M, 'wood_mid');
      });
      for (const e of spanEnds()) post(e.x, e.z, 1.2 * M, 0.06 * M, 'wood_mid');
      break;
    case 'barbed_wire':
      bays(3 * M, (a, b, i) => {
        post(a.x, a.z, 1.3 * M, i % 4 === 0 ? 0.07 * M : 0.025 * M, i % 4 === 0 ? 'wood_dark' : 'paint_green', i % 4 === 0);
        for (const y of [0.35, 0.65, 0.95, 1.22]) beam(a.x, a.z, b.x, b.z, y * M, 0.012 * M, 0.012 * M, 'iron', 0.02 * M);
      });
      for (const e of spanEnds()) post(e.x, e.z, 1.35 * M, 0.08 * M, 'wood_dark', true);
      break;
    case 'woven_wire':
      bays(3.6 * M, (a, b) => {
        post(a.x, a.z, 2.45 * M, 0.08 * M, 'wood_dark', true);
        beam(a.x, a.z, b.x, b.z, 0.05 * M, 2.3 * M, 0.01 * M, 'wire_mesh');
        beam(a.x, a.z, b.x, b.z, 2.32 * M, 0.02 * M, 0.02 * M, 'iron');
      });
      for (const e of spanEnds()) post(e.x, e.z, 2.45 * M, 0.09 * M, 'wood_dark', true);
      break;
    case 'thorn_hedge': {
      const g = Math.max(0.04, growth), h = def.height * g, w = (0.4 + 1.6 * g) * M;
      let k = 0;
      for (const [s0, s1] of spans) for (let s = s0; s < s1; s += 0.32 * M + 0.25 * M * g) {
        const p = along(run.pts, s), side = (k % 2 ? 1 : -1) * 0.25 * M, jitter = Math.sin(k * 12.9898) * 0.5 + 0.5;
        const x = p.x - p.dz * side, z = p.z + p.dx * side, y = ground(x, z);
        const r = w * (0.8 + 0.4 * jitter);
        add(k % 3 === 0 ? 'hedge2' : 'hedge', new THREE.SphereGeometry(r, 10, 7).scale(1, Math.max(0.6, h / r) * (0.85 + 0.3 * jitter), 1).rotateY(jitter * 6).translate(x, y + h * 0.5, z));
        add('wood_dark', new THREE.CylinderGeometry(0.02 * M, 0.03 * M, h * 0.5, 4).translate(x, y + h * 0.25, z));
        if (g > 0.5 && k % 3 === 0) add('hedge_berry', new THREE.IcosahedronGeometry(0.05 * M, 0).translate(x + p.dz * r * 0.9, y + h * (0.4 + 0.4 * jitter), z - p.dx * r * 0.9));
        k++;
      }
      break;
    }
    case 'log_palisade': {
      const d = 0.28 * M;
      for (const [s0, s1] of spans) for (let s = s0 + d / 2; s < s1; s += d) {
        const p = along(run.pts, s), y = ground(p.x, p.z) - 0.04;
        const hh = def.height + 0.04 + Math.sin(s * 97.1) * 0.01;
        add('log_end', new THREE.CylinderGeometry(d / 2, d / 2, hh, 7).translate(p.x, y + hh / 2, p.z));
        add('log_end', new THREE.ConeGeometry(d / 2, 0.35 * M, 7).translate(p.x, y + hh + 0.175 * M, p.z));
      }
      // walkway rail on the inside (left of the run direction)
      bays(2.5 * M, (a, b) => {
        const o = 0.25 * M;
        beam(a.x - a.dz * o, a.z + a.dx * o, b.x - b.dz * o, b.z + b.dx * o, 1.9 * M, 0.15 * M, 0.12 * M, 'wood_dark');
        post(a.x - a.dz * o, a.z + a.dx * o, 1.9 * M, 0.06 * M, 'wood_dark');
      });
      break;
    }
    case 'container_wall': {
      const cols: KitMaterialId[] = ['container_red', 'container_blue', 'container_green', 'container_tan'];
      const L = 12.2 * M, W = 2.44 * M, H = 2.6 * M;
      let k = Math.abs(Math.round(run.pts[0][0] * 7 + run.pts[0][1] * 13));
      for (const [s0, s1] of spans) for (let s = s0; s < s1 - 0.3 * M; s += L) {
        const e = Math.min(s1, s + L);
        const a = along(run.pts, s), b = along(run.pts, e);
        const m = cols[k++ % cols.length];
        // set level on concrete piers at the high point (containers don't bend to the ground)
        const len = Math.hypot(b.x - a.x, b.z - a.z);
        const samples = [0, 0.25, 0.5, 0.75, 1].map(f => ground(a.x + (b.x - a.x) * f, a.z + (b.z - a.z) * f));
        const y = Math.max(...samples) + 0.015;
        for (const f of [0.03, 0.5, 0.97]) for (const side of [-1, 1]) {
          const px = a.x + (b.x - a.x) * f - a.dz * side * W * 0.42, pz = a.z + (b.z - a.z) * f + a.dx * side * W * 0.42, gy = ground(px, pz) - 0.02;
          if (y - gy > 0.005) add('concrete', new THREE.BoxGeometry(0.06, y - gy, 0.06).translate(px, gy + (y - gy) / 2, pz));
        }
        const g = new THREE.BoxGeometry(len - 0.02 * M, H, W).translate(0, H / 2, 0).rotateY(-Math.atan2(b.z - a.z, b.x - a.x)).translate((a.x + b.x) / 2, y, (a.z + b.z) / 2);
        add(m, g);
        // corner castings and the door end
        for (const c of [a, b]) add('iron', new THREE.BoxGeometry(0.2 * M, H + 0.02 * M, W + 0.02 * M).rotateY(-Math.atan2(c.dz, c.dx)).translate(c.x, y + H / 2, c.z));
      }
      break;
    }
    case 'water_pipe': case 'power_cable': {
      // an open trench while it's being laid, then a backfilled strip that greens over; marker posts at the bends
      const open = run.finishedAt === null, age = open ? 0 : Math.min(1, (t - run.finishedAt!) / 120);
      const w = (open ? 0.5 : 0.7) * M, mat: KitMaterialId = open ? 'soil' : age < 0.6 ? 'soil' : 'earth';
      if (!(age >= 1)) for (const [s0, s1] of spans) {
        const n = Math.max(1, Math.ceil((s1 - s0) / 0.4));
        for (let i = 0; i < n; i++) {
          const a = along(run.pts, s0 + (s1 - s0) * i / n), b = along(run.pts, s0 + (s1 - s0) * (i + 1) / n);
          beam(a.x, a.z, b.x, b.z, -0.004, 0.008, w, mat);
          if (open) { const o = w * 0.9; beam(a.x - a.dz * o, a.z + a.dx * o, b.x - b.dz * o, b.z + b.dx * o, 0, 0.025, 0.25 * M, 'soil'); }
        }
      }
      for (const p of run.pts) post(p[0], p[1], 0.9 * M, 0.04 * M, run.kind === 'water_pipe' ? 'blue_tank' : 'paint_red');
      break;
    }
    default: break;  // berm, ditch: earthworks in the terrain
  }
  // gates: posts each side and a leaf swung open (wire / rail fences: tube gate; walls: plank or steel gates)
  if (run.finishedAt !== null && run.kind !== 'ditch') {
    for (const g of run.gates) {
      const p0 = along(run.pts, g.at - g.w / 2), p1 = along(run.pts, g.at + g.w / 2);
      const tall = Math.max(1.4 * M, Math.abs(def.height) + 0.05 * M);
      for (const p of [p0, p1]) post(p.x, p.z, tall, 0.1 * M, 'wood_dark', true);
      const wall = run.kind === 'log_palisade' || run.kind === 'container_wall';
      const leafH = wall ? Math.abs(def.height) * 0.95 : 1.3 * M;
      const ang = -Math.atan2(p0.dz, p0.dx);
      /** A gate leaf, hinged at (hx, hz), `w` wide, swung open by `open` radians. */
      const leaf = (hx: number, hz: number, w: number, open: number, mirror: number) => {
        const parts: Array<[KitMaterialId, THREE.BufferGeometry]> = [];
        const fm: KitMaterialId = run.kind === 'log_palisade' ? 'wood_dark' : 'steel';
        const bar = (x: number, y: number, bw: number, bh: number, m: KitMaterialId = fm) => parts.push([m, new THREE.BoxGeometry(bw, bh, 0.02 * M).translate(x, y, 0)]);
        // frame
        bar(w / 2, 0.08 * M, w, 0.06 * M); bar(w / 2, leafH - 0.04 * M, w, 0.06 * M);
        bar(0.03 * M, leafH / 2, 0.06 * M, leafH); bar(w - 0.03 * M, leafH / 2, 0.06 * M, leafH);
        if (run.kind === 'log_palisade') {
          // planks with a Z brace
          for (let x = 0.12 * M; x < w - 0.06 * M; x += 0.16 * M) bar(x, leafH / 2, 0.14 * M, leafH - 0.06 * M, 'wood_mid');
          parts.push(['wood_dark', new THREE.BoxGeometry(Math.hypot(w, leafH) * 0.9, 0.08 * M, 0.03 * M).rotateZ(Math.atan2(leafH, w)).translate(w / 2, leafH / 2, 0.02 * M)]);
        } else if (wall) {
          // steel bars
          for (let x = 0.1 * M; x < w - 0.05 * M; x += 0.12 * M) bar(x, leafH / 2, 0.025 * M, leafH - 0.1 * M);
          bar(w / 2, leafH * 0.5, w, 0.05 * M);
        } else {
          // tube farm gate: five rails and a diagonal
          for (const f of [0.3, 0.5, 0.7]) bar(w / 2, leafH * f, w, 0.035 * M, 'scaffold');
          parts.push(['scaffold', new THREE.BoxGeometry(Math.hypot(w, leafH) * 0.92, 0.03 * M, 0.02 * M).rotateZ(Math.atan2(leafH, w)).translate(w / 2, leafH / 2, 0)]);
        }
        const gy = ground(hx, hz) + 0.01;
        for (const [m, g] of parts) add(m, g.scale(mirror, 1, 1).rotateY(ang + mirror * open).translate(hx, gy, hz));
      };
      if (wall) { leaf(p0.x, p0.z, g.w / 2 - 0.01, 1.3, 1); leaf(p1.x, p1.z, g.w / 2 - 0.01, -1.3, -1); }
      else leaf(p0.x, p0.z, g.w * 0.96, 1.35, 1);
    }
  }

  const group = new THREE.Group();
  for (const [m, list] of bits) {
    const geo = mergeGeometries(list);
    list.forEach(x => x.dispose());
    if (!geo) continue;
    const mesh = new THREE.Mesh(geo, kitMaterial(m));
    mesh.castShadow = m !== 'wire_mesh';
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  group.userData = { type: 'perimeter', runId: run.id };
  return group;
}
