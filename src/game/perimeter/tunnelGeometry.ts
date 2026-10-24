/**
 * The escape tunnel (sim/perimeter 'escape_tunnel'; rules in
 * buildkit/underground.ts + tunnelPath.ts). After the user's reference
 * photo: a long poured-concrete vault you walk upright in, whitewashed and
 * board-formed, a damp floor with a drain gutter, cable hooks along one
 * wall, caged bulbs far apart (pools of light, dark between). It follows
 * the land at a gentle grade, from the room's barred blast door to an exit
 * chamber with a ladder up a shaft to the egress hatch.
 *
 * The egress hatch opens only from below: hinges, drop-bolts and a locking
 * wheel on its underside; from above the collar is sunk below grade and
 * buried under soil, leaves, fallen branches, a log and brush.
 *
 * Meshes are tagged userData.part: 'upper' (the vault above waist height,
 * hidden in the underground view so the tunnel shows cut open), 'lower'
 * (floor, lower walls, ladder, the hatch's underside), 'surface'.
 * group.userData.lamps lists the bulbs (world points) for the world's
 * moving pool of point lights.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { kitMaterial, type KitMaterialId } from '../buildkit/materials';
import { worldUV } from '../buildkit/shell';
import { VAULT_CROWN, VAULT_W, VAULT_WALL, type PathSample } from '../buildkit/tunnelPath';

const M = 1 / 6;
type Part = 'upper' | 'lower' | 'surface';
/** Height (above the floor) where the cut-open view slices the vault. */
const CUT = 1.0 * M;
/** A bulb every ≈ 24 m. */
const LAMP_EVERY = 4;

const _twoSided = new Map<KitMaterialId, THREE.MeshStandardMaterial>();
/** Shells seen from inside (walking it) and from outside (cut open): both faces. */
function twoSided(m: KitMaterialId): THREE.MeshStandardMaterial {
  let t = _twoSided.get(m);
  if (!t) { t = (kitMaterial(m) as THREE.MeshStandardMaterial).clone(); t.side = THREE.DoubleSide; _twoSided.set(m, t); }
  return t;
}

/** The vault's inside outline (lateral u, height v), floor edge to floor edge over the arch. */
function profile(): Array<[number, number]> {
  const hw = VAULT_W / 2, out: Array<[number, number]> = [];
  out.push([-hw, 0], [-hw, CUT], [-hw, VAULT_WALL]);
  const rise = VAULT_CROWN - VAULT_WALL;
  for (let k = 1; k < 12; k++) { const a = Math.PI - k * Math.PI / 12; out.push([Math.cos(a) * hw, VAULT_WALL + Math.sin(a) * rise]); }
  out.push([hw, VAULT_WALL], [hw, CUT], [hw, 0]);
  return out;
}

/** `woods` at the exit (0–1): in the trees it hides under leaf litter and deadfall; in open ground under turf, flush with the grass. */
export function buildTunnel(samples: readonly PathSample[], ground: (x: number, z: number) => number, built = 1, woods = 1): THREE.Group {
  const bits = new Map<string, THREE.BufferGeometry[]>();
  const add = (part: Part, m: KitMaterialId, g: THREE.BufferGeometry) => { const k = `${part}|${m}`; let l = bits.get(k); if (!l) bits.set(k, l = []); l.push(g.index ? g.toNonIndexed() : g); };
  const addW = (part: Part, m: KitMaterialId, g: THREE.BufferGeometry) => add(part, m, worldUV(g));
  const lamps: THREE.Vector3[] = [];
  if (samples.length < 2) return new THREE.Group();
  const L = samples[samples.length - 1].s;
  // the vault stops half a chamber short of the exit; the exit chamber (and the shaft above it) is centered on the exit point
  const upTo = built >= 0.999 ? L - VAULT_W / 2 : L * Math.max(0, built);
  // the vault's rings: every sample up to upTo, then one exactly at upTo (so it meets the exit chamber's wall)
  const rows: PathSample[] = samples.filter(p => p.s < upTo - 1e-6);
  const nx = samples.find(p => p.s >= upTo - 1e-6);
  if (nx && rows.length) { const a = rows[rows.length - 1], t = (upTo - a.s) / Math.max(1e-6, nx.s - a.s); rows.push({ x: a.x + (nx.x - a.x) * t, z: a.z + (nx.z - a.z) * t, s: upTo, floor: a.floor + (nx.floor - a.floor) * t }); }
  const prof = profile();
  // arc length along the outline (v texture coordinate: the form-board lines run the tunnel's length)
  const arc: number[] = [0];
  for (let i = 1; i < prof.length; i++) arc.push(arc[i - 1] + Math.hypot(prof[i][0] - prof[i - 1][0], prof[i][1] - prof[i - 1][1]));
  // the vault as strips along the path: lower walls (to the cut height), upper walls and arch
  const strip = (part: Part, from: number, to: number) => {
    const pos: number[] = [], uv: number[] = [], idx: number[] = [];
    let row = 0;
    for (let i = 0; i < rows.length; i++) {
      const p = rows[i];
      const q = rows[Math.min(rows.length - 1, i + 1)], o = rows[Math.max(0, i - 1)];
      const dx = q.x - o.x, dz = q.z - o.z, dl = Math.hypot(dx, dz) || 1, nx = -dz / dl, nz = dx / dl;   // lateral unit
      for (let k = from; k <= to; k++) {
        const [u, v] = prof[k];
        pos.push(p.x + nx * u, p.floor + v, p.z + nz * u);
        uv.push(p.s, arc[k]);
      }
      if (row > 0) {
        const w = to - from + 1, a0 = (row - 1) * w, b0 = row * w;
        for (let k = 0; k < w - 1; k++) idx.push(a0 + k, b0 + k, a0 + k + 1, a0 + k + 1, b0 + k, b0 + k + 1);
      }
      row++;
    }
    if (row < 2) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    add(part, 'whitewash', g);
  };
  const n = prof.length - 1;
  strip('lower', 0, 1);
  strip('upper', 1, n - 1);
  strip('lower', n - 1, n);
  // floor (damp concrete), a drain gutter, cable hooks and a cable run along one wall, caged bulbs on the crown
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1], b = samples[i];
    if (a.s >= upTo) break;
    const l = Math.hypot(b.x - a.x, b.z - a.z), yaw = -Math.atan2(b.z - a.z, b.x - a.x);
    const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2, my = (a.floor + b.floor) / 2, pitch = Math.atan2(b.floor - a.floor, l);
    const seg = (g: THREE.BufferGeometry) => g.rotateZ(pitch).rotateY(yaw).translate(mx, my, mz);
    addW('lower', 'wet_concrete', seg(new THREE.BoxGeometry(l + 0.004, 0.006, VAULT_W).translate(0, -0.003, 0)));
    addW('lower', 'iron', seg(new THREE.BoxGeometry(l + 0.004, 0.003, 0.12 * M).translate(0, 0.001, -(VAULT_W / 2 - 0.12 * M))));
    addW('lower', 'iron', seg(new THREE.BoxGeometry(l + 0.004, 0.04 * M, 0.04 * M).translate(0, 1.85 * M, VAULT_W / 2 - 0.08 * M)));    // cable run
    for (let s = Math.ceil(a.s / 0.5) * 0.5; s < b.s; s += 0.5) {
      const t = (s - a.s) / Math.max(1e-6, b.s - a.s) - 0.5;
      addW('lower', 'iron', seg(new THREE.BoxGeometry(0.025 * M, 0.025 * M, 0.14 * M).translate(t * l, 1.9 * M, VAULT_W / 2 - 0.07 * M)));   // hooks
    }
    for (let s = Math.ceil((a.s - 1) / LAMP_EVERY) * LAMP_EVERY + 1; s < b.s; s += LAMP_EVERY) {
      if (s < a.s) continue;
      const t = (s - a.s) / Math.max(1e-6, b.s - a.s);
      const x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t, y = a.floor + (b.floor - a.floor) * t + VAULT_CROWN;
      add('upper', 'iron', new THREE.CylinderGeometry(0.01, 0.01, 0.2 * M, 5).translate(x, y - 0.1 * M, z));
      add('lower', 'bulb', new THREE.SphereGeometry(0.07 * M, 8, 6).translate(x, y - 0.32 * M, z));
      for (const dy of [0.25, 0.39]) add('lower', 'iron', new THREE.TorusGeometry(0.085 * M, 0.008 * M, 4, 10).rotateX(Math.PI / 2).translate(x, y - dy * M, z));
      lamps.push(new THREE.Vector3(x, y - 0.32 * M, z));
    }
  }
  // the exit chamber: end wall, a shaft up to the hatch, the ladder, the lid's underside; the disguise on top
  if (built >= 0.999) {
    const e = samples[samples.length - 1], o = samples[samples.length - 2];
    const ul = Math.hypot(e.x - o.x, e.z - o.z) || 1, ux = (e.x - o.x) / ul, uz = (e.z - o.z) / ul, yaw = -Math.atan2(uz, ux);
    const ex = e.x, ez = e.z, gy = ground(ex, ez);
    const at = (g: THREE.BufferGeometry) => g.rotateY(yaw).translate(ex, 0, ez);
    // the exit chamber: a square room (local x along the tunnel), its near wall with an arch-shaped opening to the vault
    const hw = VAULT_W / 2, H = VAULT_CROWN, t = 0.04, sh = 0.55 * M;        // shaft: 1.1 m square inside
    const near = new THREE.Shape([new THREE.Vector2(-hw - t, 0), new THREE.Vector2(hw + t, 0), new THREE.Vector2(hw + t, H + t), new THREE.Vector2(-hw - t, H + t)]);
    near.holes.push(new THREE.Path(prof.slice().reverse().map(([u, v]) => new THREE.Vector2(u, v))));
    add('lower', 'whitewash', at(new THREE.ShapeGeometry(near).rotateY(Math.PI / 2).translate(-hw, e.floor, 0)));
    addW('lower', 'whitewash', at(new THREE.BoxGeometry(t, H + t, 2 * hw + 2 * t).translate(hw + t / 2, e.floor + (H + t) / 2, 0)));       // far wall
    for (const sz of [-1, 1]) addW('lower', 'whitewash', at(new THREE.BoxGeometry(2 * hw, H + t, t).translate(0, e.floor + (H + t) / 2, sz * (hw + t / 2))));
    addW('lower', 'wet_concrete', at(new THREE.BoxGeometry(2 * hw, 0.006, 2 * hw).translate(0, e.floor - 0.003, 0)));
    // ceiling slab round the shaft opening
    for (const [w, d, x, z] of [[2 * hw, hw - sh, 0, (hw + sh) / 2], [2 * hw, hw - sh, 0, -(hw + sh) / 2], [hw - sh, 2 * sh, (hw + sh) / 2, 0], [hw - sh, 2 * sh, -(hw + sh) / 2, 0]] as const) {
      addW('upper', 'whitewash', at(new THREE.BoxGeometry(w, t, d).translate(x, e.floor + H + t / 2, z)));
    }
    // the shaft: four walls up to just under the hatch
    const sy0 = e.floor + H, sy1 = gy - 0.05;
    for (const [w, d, x, z] of [[2 * sh + 2 * t, t, 0, sh + t / 2], [2 * sh + 2 * t, t, 0, -sh - t / 2], [t, 2 * sh, sh + t / 2, 0], [t, 2 * sh, -sh - t / 2, 0]] as const) {
      addW('upper', 'concrete', at(new THREE.BoxGeometry(w, sy1 - sy0, d).translate(x, (sy0 + sy1) / 2, z)));
    }
    // fixed ladder on the shaft's far side, from the chamber floor to the lid
    const sr = sh, lx = sh - 0.012, ly0 = e.floor, ly1 = gy - 0.02;
    for (const sz of [-1, 1]) addW('lower', 'steel', at(new THREE.BoxGeometry(0.04 * M, ly1 - ly0, 0.04 * M).translate(lx, (ly0 + ly1) / 2, sz * 0.2 * M)));
    for (let y = ly0 + 0.3 * M; y < ly1 - 0.05; y += 0.3 * M) addW('lower', 'steel', at(new THREE.BoxGeometry(0.03 * M, 0.025 * M, 0.42 * M).translate(lx, y, 0)));
    lamps.push(new THREE.Vector3(ex - ux * 0.08, e.floor + H - 0.15 * M, ez - uz * 0.08));
    add('lower', 'bulb', new THREE.SphereGeometry(0.07 * M, 8, 6).translate(ex - ux * 0.08, e.floor + H - 0.15 * M, ez - uz * 0.08));
    // the lid's underside (only ever seen from below): hinges, two drop-bolts in their keepers, the locking wheel
    const lidY = gy - 0.03;
    addW('lower', 'iron', at(new THREE.BoxGeometry(2 * sr + 0.02, 0.012, 2 * sr + 0.02).translate(0, lidY - 0.012, 0)));
    for (const sz of [-1, 1]) {
      addW('lower', 'steel', at(new THREE.BoxGeometry(0.12 * M, 0.08 * M, 0.1 * M).translate(-sr + 0.01, lidY - 0.025, sz * 0.25 * M)));
      addW('lower', 'steel', at(new THREE.BoxGeometry(0.9 * M, 0.05 * M, 0.05 * M).translate(0.05 * M, lidY - 0.03, sz * 0.3 * M)));
      addW('lower', 'iron', at(new THREE.BoxGeometry(0.1 * M, 0.12 * M, 0.08 * M).translate(sr + 0.005, lidY - 0.035, sz * 0.3 * M)));
    }
    addW('lower', 'steel', at(new THREE.TorusGeometry(0.16 * M, 0.025 * M, 6, 16).rotateX(Math.PI / 2).translate(0, lidY - 0.04, 0)));
    addW('lower', 'concrete', at(new THREE.CylinderGeometry(sr + 0.05, sr + 0.06, 0.05, 18).translate(0, gy - 0.075, 0)));
    // in open ground the lid sits under a hand of turf: nothing shows above the grass
    if (woods >= 0.3) {
      // from above it is woods floor: a low lumpy cap of soil, a thick layer of leaves, fallen branches, a rotting log, brush
      let seed = Math.abs(Math.round(ex * 97 + ez * 131)) || 1;
      const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
      const mound = new THREE.SphereGeometry(1, 20, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(sr + 0.1, 0.014, sr + 0.08);
      const mp = mound.getAttribute('position');
      for (let i = 0; i < mp.count; i++) { const x = mp.getX(i), z = mp.getZ(i); mp.setY(i, mp.getY(i) * (0.7 + 0.6 * (Math.sin(x * 31 + z * 17) * 0.5 + 0.5))); }
      mound.computeVertexNormals();
      addW('surface', 'soil', at(mound.translate(0, gy - 0.012, 0)));
      const leaf: KitMaterialId[] = ['straw', 'earth', 'wood_mid', 'straw', 'soil'];
      // leaf litter: dense over the lid, thinning out into the grass (no hard edge)
      for (let k = 0; k < 420; k++) {
        const a = rnd() * Math.PI * 2, r = (sr + 0.45) * Math.pow(rnd(), 0.8);
        const y = gy + 0.004 + Math.max(0, 0.012 * (1 - r / (sr + 0.1)));
        addW('surface', leaf[k % leaf.length], at(new THREE.CircleGeometry(0.0035 + rnd() * 0.004, 5).rotateX(-Math.PI / 2 + (rnd() - 0.5) * 0.6).rotateY(rnd() * 6).translate(Math.cos(a) * r, y, Math.sin(a) * r)));
      }
      for (let k = 0; k < 9; k++) {
        const a = rnd() * Math.PI, len = 0.12 + rnd() * 0.2, r0 = (rnd() - 0.5) * sr;
        addW('surface', 'wood_dark', at(new THREE.CylinderGeometry(0.004 + rnd() * 0.004, 0.007, len, 5).rotateZ(Math.PI / 2 + (rnd() - 0.5) * 0.3).rotateY(a).translate(r0, gy + 0.03 + k * 0.004, (rnd() - 0.5) * sr)));
      }
      // a fallen trunk across the lid: bark, a broken stub of a branch, a sawn-looking end
      const log = new THREE.CylinderGeometry(0.03, 0.04, 0.55, 12, 6);
      const lp = log.getAttribute('position');
      for (let i = 0; i < lp.count; i++) { const y = lp.getY(i); lp.setX(i, lp.getX(i) + Math.sin(y * 9) * 0.006); lp.setZ(i, lp.getZ(i) * (1 + Math.sin(y * 23) * 0.08)); }
      log.computeVertexNormals();
      const lay = (g: THREE.BufferGeometry) => g.rotateZ(Math.PI / 2 + 0.05).rotateY(0.5).translate(0.02, gy + 0.03, 0.07);
      addW('surface', 'wood_dark', at(lay(log)));
      addW('surface', 'wood_dark', at(lay(new THREE.CylinderGeometry(0.006, 0.012, 0.12, 6).rotateX(0.9).translate(0, 0.08, 0.04))));
      // a few low ferns at the edges
      for (let k = 0; k < 5; k++) {
        const a = rnd() * Math.PI * 2, r = sr + 0.08 + rnd() * 0.12, fx = Math.cos(a) * r, fz = Math.sin(a) * r;
        for (let f = 0; f < 7; f++) addW('surface', 'hedge', at(new THREE.PlaneGeometry(0.012, 0.07).translate(0, 0.035, 0).rotateX(-0.9).rotateY(f / 7 * Math.PI * 2 + rnd()).translate(fx, gy, fz)));
      }
    }
  }
  const group = new THREE.Group();
  for (const [k, list] of bits) {
    const [part, m] = k.split('|') as [Part, KitMaterialId];
    const geo = mergeGeometries(list);
    list.forEach(g => g.dispose());
    if (!geo) continue;
    const mesh = new THREE.Mesh(geo, m === 'whitewash' || m === 'concrete' ? twoSided(m) : kitMaterial(m));
    mesh.castShadow = part === 'surface';
    mesh.receiveShadow = true;
    mesh.userData.part = part;
    group.add(mesh);
  }
  group.userData.type = 'tunnel';
  group.userData.lamps = lamps;
  return group;
}
