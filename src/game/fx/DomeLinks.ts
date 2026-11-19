/**
 * What a dome link shows that its run does not (sim/dome/links.ts): the dedicated link airlock on each dome shell (a steel airlock module with a framed
 * door, a lit window and a status lamp), the tunnel's surface vent stack and manhole, and, in the underground view, the airlock sleeve through each
 * footing with a cable tray and a pipe along the line. The body of the link is the run itself (the covered walkway or the underground vault).
 * One merged vertex-colored mesh for the surface, one for the buried parts (shown in U and in the cutaway and x-ray views), one instanced set of lamp
 * heads: three draw calls for the whole place however many links there are. SCALE v2: a person is 0.28 tall, a door 0.37.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { DomeLink, LinkState } from '../../sim/dome/linkGraph';
import { kitMaterial } from '../buildkit/materials';

export interface LinkFixtureInput {
  link: DomeLink;
  state: LinkState;
  /** Where the airlock module stands for each dome end (the shell's door point and the outward direction), else null for a building or yard end. */
  ends: Array<{ x: number; z: number; angle: number } | null>;
}
export interface LinkFixtures { group: THREE.Group; key: string; setUnder(on: boolean): void; setView(v: 'full' | 'cutaway' | 'xray'): void; dispose(): void }

export const linksKey = (ins: readonly LinkFixtureInput[]): string => ins.map(i => `${i.link.id}:${i.state}:${i.link.kind}:${i.link.depthFt ?? 0}`).join('|');

const STEEL = 0x8a929a, DARK = 0x2a2e33, FRAME = 0x4a5058, GLASS = 0x9fc7d4, CONC = 0x9a968c, LAMP_OK = 0x3fe08a, LAMP_WARN = 0xe0b030, LAMP_BAD = 0xe0503a, TRAY = 0x5a5f66, PIPE = 0x2f7fb5, CABLE = 0xd9822b;

function box(w: number, h: number, d: number, cx: number, cy: number, cz: number, yaw: number, color: number): THREE.BufferGeometry {
  let g: THREE.BufferGeometry = new THREE.BoxGeometry(w, h, d);
  g.rotateY(yaw); g.translate(cx, cy, cz);
  g = g.index ? g.toNonIndexed() : g; g.deleteAttribute('uv');
  const c = new THREE.Color(color), n = g.attributes.position.count, col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
function cyl(r: number, h: number, cx: number, cy: number, cz: number, color: number, tiltZ = 0, yaw = 0): THREE.BufferGeometry {
  let g: THREE.BufferGeometry = new THREE.CylinderGeometry(r, r, h, 10);
  if (tiltZ) g.rotateZ(tiltZ);
  g.rotateY(yaw); g.translate(cx, cy, cz);
  g = g.index ? g.toNonIndexed() : g; g.deleteAttribute('uv');
  const c = new THREE.Color(color), n = g.attributes.position.count, col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

/** World coordinates of the group are the sim's; `ground(x, z)` is the terrain height. */
export function makeLinkFixtures(ins: readonly LinkFixtureInput[], ground: (x: number, z: number) => number): LinkFixtures {
  const group = new THREE.Group(); group.name = 'dome_links';
  const owned: Array<{ dispose(): void }> = [];
  const surface: THREE.BufferGeometry[] = [], buried: THREE.BufferGeometry[] = [], lamps: Array<{ x: number; y: number; z: number; color: number }> = [];
  for (const { link, state, ends } of ins) {
    const lampColor = state === 'open' ? LAMP_OK : state === 'down' ? LAMP_BAD : LAMP_WARN;
    ends.forEach((e, i) => {
      if (!e) return;
      // the airlock module: from the shell's door a short way out. The run's own end (covered walkway or tunnel mouth) meets its far face.
      const s = Math.sin(e.angle), c = Math.cos(e.angle);
      const len = 0.46, w = 0.34, h = 0.42, mx = e.x + s * (len / 2 - 0.04), mz = e.z + c * (len / 2 - 0.04), gy = ground(mx, mz);
      const y = (dy: number): number => gy + dy;
      // a hollow chamber (a person walks through it): two side walls, a roof cap and a deck, a framed door at each end (the shell door and the outer door), a lit window in each side wall
      const side = (dx: number): [number, number] => [mx + c * dx, mz - s * dx];
      for (const sg of [-1, 1]) { const [sx, sz] = side(sg * (w / 2 - 0.01)); surface.push(box(0.02, h, len, sx, y(h / 2), sz, e.angle, STEEL)); const [wx, wz] = side(sg * (w / 2 + 0.002)); surface.push(box(0.008, 0.1, 0.16, wx, y(h * 0.62), wz, e.angle, GLASS)); }
      surface.push(box(w, 0.02, len, mx, y(h + 0.01), mz, e.angle, FRAME));
      surface.push(box(w - 0.05, 0.01, len, mx, y(0.012), mz, e.angle, DARK));
      const door = (cx: number, cz: number): void => {   // jambs and a lintel: an open doorway with its frame
        for (const sg of [-1, 1]) { const [jx, jz] = [cx + c * sg * (w / 2 - 0.045), cz - s * sg * (w / 2 - 0.045)]; surface.push(box(0.035, h, 0.035, jx, y(h / 2), jz, e.angle, FRAME)); }
        surface.push(box(w - 0.04, 0.04, 0.035, cx, y(h - 0.02), cz, e.angle, FRAME));
      };
      door(e.x + s * 0.02, e.z + c * 0.02);
      const ox = e.x + s * (len - 0.05), oz = e.z + c * (len - 0.05);
      door(ox, oz);
      lamps.push({ x: ox + c * (w * 0.32), y: y(h * 0.9), z: oz - s * (w * 0.32), color: lampColor });
      // buried: the sleeve through the footing (a fat concrete tube), a cable tray and a pipe along the line
      const depth = Math.max(4, link.depthFt ?? 8) / 20, sx = e.x + s * 0.0, sz = e.z + c * 0.0;
      const other = ends[1 - i] ?? null, ex = other ? other.x : link.ends[1 - i].x, ez = other ? other.z : link.ends[1 - i].z;
      if (link.kind === 'tunnel') {
        buried.push(cyl(0.2, 0.7, sx - s * 0.1, ground(sx, sz) - depth * 0.6, sz - c * 0.1, CONC, Math.PI / 2, -e.angle + Math.PI / 2));
        if (i === 0) {
          const L = Math.hypot(ex - sx, ez - sz), n = Math.max(1, Math.floor(L / 1.2));
          for (let k = 0; k < n; k++) {
            const u0 = k / n, u1 = (k + 1) / n, ax = sx + (ex - sx) * u0, az = sz + (ez - sz) * u0, bx = sx + (ex - sx) * u1, bz = sz + (ez - sz) * u1;
            const mxx = (ax + bx) / 2, mzz = (az + bz) / 2, ang = Math.atan2(bx - ax, bz - az), seg = Math.hypot(bx - ax, bz - az), dy = ground(mxx, mzz) - depth * 0.6;
            buried.push(box(0.06, 0.012, seg, mxx + Math.cos(ang) * 0.1, dy + 0.12, mzz - Math.sin(ang) * 0.1, ang, TRAY));
            buried.push(cyl(0.016, seg, mxx - Math.cos(ang) * 0.1, dy + 0.14, mzz + Math.sin(ang) * 0.1, PIPE, Math.PI / 2, ang - Math.PI / 2));
            buried.push(cyl(0.008, seg, mxx + Math.cos(ang) * 0.1, dy + 0.14, mzz - Math.sin(ang) * 0.1, CABLE, Math.PI / 2, ang - Math.PI / 2));
          }
        }
      }
    });
    if (link.kind === 'tunnel' && state !== 'building') {
      // at the surface nothing but a vent stack and a manhole, halfway along (and set off the line a little)
      const a = link.ends[0], b = link.ends[1], x = (a.x + b.x) / 2 + 0.12, z = (a.z + b.z) / 2 + 0.12, gy = ground(x, z);
      surface.push(cyl(0.035, 0.2, x, gy + 0.1, z, DARK), cyl(0.05, 0.02, x, gy + 0.21, z, FRAME), cyl(0.07, 0.012, x + 0.16, gy + 0.006, z, TRAY));
    }
  }
  const mk = (geos: THREE.BufferGeometry[], name: string, opts: { transparent?: boolean } = {}): THREE.Mesh | null => {
    if (!geos.length) return null;
    const merged = mergeGeometries(geos, false); geos.forEach(g => g.dispose());
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.65, metalness: 0.35, flatShading: true, ...opts });
    const m = new THREE.Mesh(merged, mat); m.name = name; m.matrixAutoUpdate = false; m.updateMatrix(); m.castShadow = true; m.receiveShadow = false;
    group.add(m); owned.push(merged, mat);
    return m;
  };
  const surf = mk(surface, 'link_airlocks'), bur = mk(buried, 'link_buried', { transparent: true });
  if (bur) { bur.visible = false; bur.castShadow = false; }
  if (lamps.length) {
    const geo = new THREE.SphereGeometry(0.022, 8, 6), heads = new THREE.InstancedMesh(geo, kitMaterial('lamp'), lamps.length), m4 = new THREE.Matrix4();
    lamps.forEach((l, i) => { heads.setMatrixAt(i, m4.makeTranslation(l.x, l.y, l.z)); heads.setColorAt(i, new THREE.Color(l.color)); });
    heads.instanceMatrix.needsUpdate = true; if (heads.instanceColor) heads.instanceColor.needsUpdate = true; heads.frustumCulled = false; heads.castShadow = false;
    group.add(heads); owned.push(geo);
  }
  let under = false, view: 'full' | 'cutaway' | 'xray' = 'full';
  const apply = (): void => { if (bur) bur.visible = under || view !== 'full'; if (surf) { const m = surf.material as THREE.MeshStandardMaterial; m.transparent = under; m.opacity = under ? 0.45 : 1; m.needsUpdate = true; } };
  return { group, key: linksKey(ins), setUnder: on => { under = on; apply(); }, setView: v => { view = v; apply(); }, dispose: () => { for (const o of owned) o.dispose(); } };
}
