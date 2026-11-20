/**
 * What a dome's entrance complex shows outside and in (sim/dome/vehiclePort.ts): a smooth poured-concrete apron and inside lane with straight curbed edges (a planar ramp graded to the
 * dome floor, skirted down to the ground, never a draped polygon), painted stripes, stop lines, a drain grate, bollards, a steel-clad gatehouse with a window and a hazard sign, an
 * intercom and keypad post, a camera mast, floodlights, red and green state lamps over the gates, and a landing with a canopy, sign and bollards at every person airlock (the arcology's
 * second entrance too). The gates and the sealed chamber are the dome's own geometry (buildkit/domeBuildings `airlock`). One merged vertex-colored mesh and two instanced lamp sets for every
 * entrance on the place. SCALE v2: 1 unit = 20 ft, a person 0.28, a door 0.37, a truck about 0.75 long.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { APRON_LEN, type InsideLane, type PortFrame } from '../../sim/dome/vehiclePort';
import type { DomeTier } from '../../sim/dome/tiers';
import { vestibuleOf } from '../../sim/dome/vestibule';

/** The stem wall's height under each dome (buildkit/domeBuildings LOOK): the doors' sill height over the dome's pad. */
const STEM: Record<DomeTier, number> = { earthen: 0.04, geodesic: 0.06, glass: 0.08, arcology: 0.14 };

export interface PortInput {
  id: string; tier: DomeTier; frame: PortFrame; lane: InsideLane | null; guarded: boolean;
  /** Every person airlock of the dome: where its door stands (on the shell) and its axis angle (the main one beside the port, and the arcology's second). */
  persons: Array<{ angle: number; x: number; z: number }>;
  /** The height of the dome's group (its pad level): the doors' sill and the state panels are measured from it. */
  baseY: number;
  /** What the gates say: sealed (red), open (green: the outer gate stands open, the inner one shut). */
  state: 'open' | 'sealed';
}
export interface PortFixtures { group: THREE.Group; key: string; dispose(): void }

export const portsKey = (ins: readonly PortInput[]): string => ins.map(i => `${i.id}:${i.tier}:${i.frame.angle.toFixed(3)}:${i.frame.cx.toFixed(2)},${i.frame.cz.toFixed(2)}:${i.frame.r.toFixed(2)}:${i.lane ? 1 : 0}:${i.guarded ? 1 : 0}:${i.persons.length}:${i.state}`).join('|');

const POUR = 0x8f8d86, CURB = 0x6f6d68, PAINT = 0xeae7da, YELLOW = 0xe3b92a, STEEL = 0x8a929a, DARK = 0x262a2f, GLASS = 0x6fa5b8;
const CLAD: Record<DomeTier, number> = { earthen: 0x7a6f5d, geodesic: 0x9aa3ab, glass: 0x56606a, arcology: 0x2a3037 };
const ACCENT: Record<DomeTier, number> = { earthen: 0xffd070, geodesic: 0xffe9b0, glass: 0xdff3ff, arcology: 0x40e0ff };

function paint(g: THREE.BufferGeometry, color: number): THREE.BufferGeometry {
  const ng = g.index ? g.toNonIndexed() : g; ng.deleteAttribute('uv');
  const c = new THREE.Color(color), n = ng.attributes.position.count, col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
  ng.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return ng;
}
function box(w: number, h: number, d: number, x: number, y: number, z: number, yaw: number, color: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d); g.rotateY(yaw); g.translate(x, y, z); return paint(g, color);
}
function cyl(r: number, h: number, x: number, y: number, z: number, color: number): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(r, r, h, 8); g.translate(x, y, z); return paint(g, color);
}

/** Triangles from quads, flat normals computed from the winding the caller keeps facing up (and the double-sided material covers a wrong turn). */
function tris(pos: number[], color: number): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals(); return paint(g, color);
}

type Fr = { cx: number; cz: number; u: [number, number] };
const P = (f: Fr, rho: number, lam: number): [number, number] => [f.cx + f.u[0] * rho + f.u[1] * lam, f.cz + f.u[1] * rho - f.u[0] * lam];

/**
 * A straight-edged slab in the entrance's frame: `rho0..rho1` along the axis and `lam0..lam1` across it, its top a plane (`top(rho)`, linear in rho), skirted down to the ground (`floor`) on
 * every side so no gap shows, however the land lies under it.
 */
function slab(f: Fr, rho0: number, rho1: number, lam0: number, lam1: number, top: (rho: number) => number, floor: (x: number, z: number) => number, color: number): THREE.BufferGeometry {
  const pos: number[] = [], n = Math.max(1, Math.ceil((rho1 - rho0) / 0.3));
  const V = (rho: number, lam: number, y: number): [number, number, number] => { const [x, z] = P(f, rho, lam); return [x, y, z]; };
  const B = (rho: number, lam: number): number => { const [x, z] = P(f, rho, lam); return Math.min(floor(x, z) - 0.04, top(rho) - 0.03); };
  const quad = (a: number[], b: number[], c: number[], d: number[]): void => { pos.push(...a, ...b, ...c, ...a, ...c, ...d); };
  for (let i = 0; i < n; i++) {
    const r0 = rho0 + (rho1 - rho0) * i / n, r1 = rho0 + (rho1 - rho0) * (i + 1) / n;
    quad(V(r0, lam0, top(r0)), V(r1, lam0, top(r1)), V(r1, lam1, top(r1)), V(r0, lam1, top(r0)));                                   // the top
    quad(V(r0, lam0, B(r0, lam0)), V(r1, lam0, B(r1, lam0)), V(r1, lam0, top(r1)), V(r0, lam0, top(r0)));                          // the sides
    quad(V(r0, lam1, top(r0)), V(r1, lam1, top(r1)), V(r1, lam1, B(r1, lam1)), V(r0, lam1, B(r0, lam1)));
  }
  quad(V(rho0, lam0, B(rho0, lam0)), V(rho0, lam0, top(rho0)), V(rho0, lam1, top(rho0)), V(rho0, lam1, B(rho0, lam1)));              // the ends
  quad(V(rho1, lam1, B(rho1, lam1)), V(rho1, lam1, top(rho1)), V(rho1, lam0, top(rho1)), V(rho1, lam0, B(rho1, lam0)));
  return tris(pos, color);
}
/** Paint on a slab: a flat quad just above its top. */
function mark(f: Fr, rho0: number, rho1: number, lam0: number, lam1: number, top: (rho: number) => number, color: number, lift = 0.004): THREE.BufferGeometry {
  const pos: number[] = [], n = Math.max(1, Math.ceil((rho1 - rho0) / 0.3));
  const V = (rho: number, lam: number): [number, number, number] => { const [x, z] = P(f, rho, lam); return [x, top(rho) + lift, z]; };
  for (let i = 0; i < n; i++) {
    const r0 = rho0 + (rho1 - rho0) * i / n, r1 = rho0 + (rho1 - rho0) * (i + 1) / n;
    pos.push(...V(r0, lam0), ...V(r1, lam0), ...V(r1, lam1), ...V(r0, lam0), ...V(r1, lam1), ...V(r0, lam1));
  }
  return tris(pos, color);
}

export function makeVehiclePorts(ins: readonly PortInput[], ground: (x: number, z: number) => number): PortFixtures {
  const group = new THREE.Group(); group.name = 'vehicle_ports';
  const geos: THREE.BufferGeometry[] = [];
  const lamps: Array<{ x: number; y: number; z: number; w: number; h: number; d: number; yaw: number; color: number }> = [];
  for (const { frame: f, lane, tier, persons, state, baseY } of ins) {
    const { u, v } = f, yaw = f.angle, R = f.r, F: Fr = { cx: f.cx, cz: f.cz, u };
    const clad = CLAD[tier], accent = ACCENT[tier];
    const at = (rho: number, lam: number): [number, number] => P(F, rho, lam);
    const lamOf = (pt: [number, number]): number => (pt[0] - f.cx) * u[1] - (pt[1] - f.cz) * u[0];
    const offP = f.person ? lamOf(f.person.outer) : 0;
    const pad = ground(...f.inner), yPad = pad + 0.012;
    // ── the apron: a planar ramp from the sill (at the dome floor's level) out to the road's level, with curbs, stripes and a stop line ──
    const lamA = -(v.dw / 2 + 0.45), lamB = Math.max(offP, 0) + (f.person ? 0.5 : v.dw / 2 + 0.45);
    // the top follows the highest ground under each cross-section (never buried, never stretched over a dip), eased so the ramp stays gentle; the skirts close the sides
    const nS = 8, hs: number[] = [];
    for (let k = 0; k <= nS; k++) { const r = R + APRON_LEN * k / nS; let m = -Infinity; for (const l of [lamA, 0, lamB]) m = Math.max(m, ground(...at(r, l))); hs.push(Math.max(m + 0.012, k === 0 ? yPad : -Infinity)); }
    for (let k = 1; k <= nS; k++) hs[k] = Math.max(hs[k - 1] - 0.05 * APRON_LEN / nS, Math.min(hs[k - 1] + 0.05 * APRON_LEN / nS, hs[k]));   // (at most 5 percent a step)
    const topA = (rho: number): number => { const t = Math.max(0, Math.min(1, (rho - R) / APRON_LEN)) * nS, k = Math.min(nS - 1, Math.floor(t)); return hs[k] + (hs[k + 1] - hs[k]) * (t - k); };
    geos.push(slab(F, R - 0.02, R + APRON_LEN, lamA, lamB, topA, ground, POUR));
    for (const [l0, l1] of [[lamA, lamA + 0.035], [lamB - 0.035, lamB]] as const) geos.push(slab(F, R - 0.02, R + APRON_LEN, l0, l1, r => topA(r) + 0.022, ground, CURB));   // the straight curbs
    geos.push(slab(F, R + APRON_LEN - 0.035, R + APRON_LEN, lamA, lamB, r => topA(r) + 0.012, ground, CURB));                                                                  // and the toe
    geos.push(mark(F, R + 0.05, R + APRON_LEN - 0.12, -0.012, 0.012, topA, YELLOW));                                                    // the center line to the gate
    geos.push(mark(F, R + 0.45, R + 0.5, -v.dw / 2, v.dw / 2, topA, PAINT));                                                           // the stop line before the gate
    for (let k = 0; k < 5; k++) geos.push(mark(F, R + 0.12 + k * 0.1, R + 0.2 + k * 0.1, lamA + 0.05, lamA + 0.09, topA, YELLOW, 0.005));   // hazard chevrons along the curb
    // ── bollards across the apron's mouth, clear of the lanes into the doors ──
    for (const [bx, bz] of f.bollards) {
      const lam = lamOf([bx, bz]);
      if (Math.abs(lam) < v.dw * 0.5 + 0.05 || (f.person && Math.abs(lam - offP) < 0.42)) continue;
      const y = topA(R + APRON_LEN - 0.12);
      geos.push(cyl(0.02, 0.13, bx, y + 0.065, bz, STEEL), cyl(0.023, 0.03, bx, y + 0.1, bz, YELLOW));
    }
    // ── the gatehouse: a steel-clad cabin with a window on the gate and a hazard sign, beside the apron ──
    { const [gx, gz] = at(R + 0.62, lamA - 0.3), y = ground(gx, gz);
      geos.push(box(0.3, 0.012, 0.26, gx, y + 0.006, gz, yaw, CURB), box(0.26, 0.32, 0.22, gx, y + 0.17, gz, yaw, clad), box(0.3, 0.02, 0.27, gx, y + 0.34, gz, yaw, DARK));   // slab, cabin, flat roof
      const [wx, wz] = at(R + 0.62 - 0.115, lamA - 0.3 + 0.0); geos.push(box(0.17, 0.1, 0.012, wx, y + 0.21, wz, yaw, DARK), box(0.15, 0.08, 0.014, wx, y + 0.21, wz - u[1] * 0.0, yaw, GLASS));   // the window toward the gate
      const [sx, sz] = at(R + 0.62 - 0.12, lamA - 0.3 + 0.1); geos.push(box(0.07, 0.07, 0.012, sx, y + 0.1, sz, yaw, YELLOW), box(0.014, 0.07, 0.014, sx, y + 0.1, sz, yaw, DARK));   // the hazard sign
      const [dx, dz] = at(R + 0.62, lamA - 0.3 - 0.115); geos.push(box(0.012, 0.2, 0.09, dx, y + 0.12, dz, yaw, DARK));                                                                 // the door
      geos.push(cyl(0.006, 0.12, gx + 0.05, y + 0.4, gz, DARK));                                                                                                                         // the antenna
      lamps.push({ x: gx, y: y + 0.36, z: gz, w: 0.05, h: 0.02, d: 0.05, yaw, color: accent });
    }
    // ── the intercom and keypad post and the camera mast, at the driver's window; floodlights at the apron corners ──
    { const [x, z] = at(R + APRON_LEN - 0.55, lamA + 0.12), y = topA(R + APRON_LEN - 0.55);
      geos.push(cyl(0.008, 0.2, x, y + 0.1, z, STEEL), box(0.045, 0.07, 0.03, x, y + 0.205, z, yaw, DARK)); lamps.push({ x, y: y + 0.225, z, w: 0.02, h: 0.012, d: 0.012, yaw, color: 0x40ff90 }); lamps.push({ x, y: y + 0.195, z, w: 0.026, h: 0.02, d: 0.012, yaw, color: 0x9fd8ff }); }   // post, panel, status LED, screen
    { const [x, z] = at(R + 0.4, lamA + 0.1), y = topA(R + 0.4); geos.push(cyl(0.01, 0.36, x, y + 0.18, z, DARK), box(0.075, 0.035, 0.05, x, y + 0.37, z, yaw, DARK), box(0.02, 0.02, 0.03, x, y + 0.37, z + u[1] * 0.03, yaw, STEEL)); }
    for (const lam of [lamA + 0.04, lamB - 0.04]) { const [x, z] = at(R + APRON_LEN - 0.2, lam), y = topA(R + APRON_LEN - 0.2); geos.push(cyl(0.011, 0.48, x, y + 0.24, z, STEEL), box(0.12, 0.02, 0.05, x, y + 0.49, z, yaw, DARK)); lamps.push({ x, y: y + 0.475, z, w: 0.1, h: 0.012, d: 0.04, yaw, color: 0xfff4d8 }); }
    // ── state lamps: the lit window of each door's state panel (red sealed, amber cycling, green open), over the outer face of the port and of every person door ──
    const slot = state === 'open' ? 2 : 0, lampColor = state === 'open' ? 0x30ff80 : 0xff3a2a, bigK = tier === 'arcology' ? 1.6 : 1;
    const panelLamp = (cxp: number, czp: number, pu: [number, number], vv: { dh: number; t: number }, ang: number): void => {
      const lat: [number, number] = [pu[1], -pu[0]], rho = R + vv.t / 2 + 0.034, x = cxp + pu[0] * rho + lat[0] * (slot - 1) * 0.04 * bigK, z = czp + pu[1] * rho + lat[1] * (slot - 1) * 0.04 * bigK;
      lamps.push({ x, y: baseY + STEM[tier] + vv.dh + 0.047 * bigK, z, w: 0.026 * bigK, h: 0.026 * bigK, d: 0.012, yaw: ang, color: lampColor });
    };
    panelLamp(f.cx, f.cz, u, v, yaw);
    for (const p of persons) panelLamp(f.cx, f.cz, [Math.sin(p.angle), Math.cos(p.angle)], vestibuleOf(tier, R), p.angle);
    // ── inside: the poured lane from the inner gate to the pad, level with the dome floor, curbed, striped, with a drain grate ──
    if (lane) {
      const rI = R - v.len, rP = R - v.len - Math.hypot(lane.pad[0] - f.inner[0], lane.pad[1] - f.inner[1]), top = (): number => yPad + 0.004;
      geos.push(slab(F, rP - lane.half, rI + 0.02, -lane.w / 2, lane.w / 2, top, ground, POUR));
      geos.push(slab(F, rP - lane.half, rP + lane.half, -lane.half, lane.half, top, ground, POUR));                                                                                 // the turning pad
      for (const s of [-1, 1] as const) geos.push(slab(F, rP, rI, s * lane.w / 2 - 0.018, s * lane.w / 2 + 0.018, () => top() + 0.022, ground, CURB));                                  // the straight curbs
      for (const s of [-1, 1] as const) geos.push(mark(F, rP, rI, s * (lane.w / 2 - 0.05) - 0.008, s * (lane.w / 2 - 0.05) + 0.008, top, YELLOW));                                       // edge lines
      const nD = Math.max(2, Math.floor((rI - rP) / 0.16)); for (let k = 0; k < nD; k++) geos.push(mark(F, rP + 0.04 + k * (rI - rP) / nD, rP + 0.04 + k * (rI - rP) / nD + 0.07, -0.01, 0.01, top, PAINT));   // dashed center
      geos.push(mark(F, rI - 0.2, rI - 0.16, -lane.w / 2 + 0.05, lane.w / 2 - 0.05, top, PAINT));                                                                                    // the stop line at the inner gate
      const rg = (rI + rP) / 2; geos.push(mark(F, rg - 0.05, rg + 0.05, -lane.w / 2 + 0.05, lane.w / 2 - 0.05, top, DARK, 0.005));                                                       // the drain grate
      for (let k = 0; k < 6; k++) geos.push(mark(F, rg - 0.045 + k * 0.018, rg - 0.038 + k * 0.018, -lane.w / 2 + 0.05, lane.w / 2 - 0.05, top, STEEL, 0.007));
      for (const s of [-1, 1] as const) { const [x, z] = at(rI - 0.25, s * (lane.w / 2 + 0.06)); lamps.push({ x, y: yPad + 0.04, z, w: 0.03, h: 0.012, d: 0.03, yaw, color: accent }); }  // lane marker lights
    }
    // ── a landing, canopy, sign and bollards at every person airlock (the main one is on the apron; the arcology's second stands alone) ──
    persons.forEach((p, i) => {
      const a = p.angle, pu: [number, number] = [Math.sin(a), Math.cos(a)], PF: Fr = { cx: f.cx, cz: f.cz, u: pu };
      const w = tier === 'arcology' ? 0.46 : 0.3, dp = tier === 'arcology' ? 1.3 : 0.7;
      const yl = ground(...(([f.cx + pu[0] * (R - 1), f.cz + pu[1] * (R - 1)]) as [number, number])) + 0.012;
      if (!(i === 0 && f.person)) {   // (the main person door's landing is the apron)
        const yEnd = Math.min(yl + 0.06, Math.max(yl - 0.06, ground(f.cx + pu[0] * (R + dp), f.cz + pu[1] * (R + dp)) + 0.02));
        const top = (rho: number): number => yl + (yEnd - yl) * Math.max(0, Math.min(1, (rho - R) / dp));
        geos.push(slab(PF, R - 0.02, R + dp, -w, w, top, ground, POUR));
        for (const [l0, l1] of [[-w, -w + 0.03], [w - 0.03, w]] as const) geos.push(slab(PF, R - 0.02, R + dp, l0, l1, r => top(r) + 0.02, ground, CURB));
        geos.push(mark(PF, R + 0.05, R + dp - 0.1, -0.01, 0.01, top, YELLOW));
        for (const s of [-1, 1] as const) { const [bx, bz] = P(PF, R + dp - 0.1, s * (w - 0.06)); geos.push(cyl(0.018, 0.12, bx, top(R + dp - 0.1) + 0.06, bz, STEEL), cyl(0.021, 0.03, bx, top(R + dp - 0.1) + 0.095, bz, YELLOW)); }
      }
      // the canopy over the door: two posts and a steel roof plate with a lit sign strip, so the door reads from the road
      const cw = (tier === 'arcology' ? 0.9 : 0.5), ch = (tier === 'arcology' ? 0.78 : 0.5), cd = 0.38 * (tier === 'arcology' ? 1.6 : 1);
      for (const s of [-1, 1] as const) { const [qx, qz] = P(PF, R + cd - 0.03, s * (cw / 2 - 0.02)); geos.push(cyl(0.012 * (tier === 'arcology' ? 1.6 : 1), ch, qx, ground(qx, qz) + ch / 2, qz, STEEL)); }
      const [rx, rz] = P(PF, R + cd / 2, 0); geos.push(box(cw, 0.022, cd, rx, ground(rx, rz) + ch, rz, a, clad));
      const [sx, sz] = P(PF, R + cd - 0.005, 0); lamps.push({ x: sx, y: ground(sx, sz) + ch - 0.012, z: sz, w: cw * 0.8, h: 0.012, d: 0.012, yaw: a, color: accent });
      const [cx2, cz2] = P(PF, R + 0.2, w - 0.02); geos.push(cyl(0.008, 0.32, cx2, ground(cx2, cz2) + 0.16, cz2, DARK), box(0.06, 0.03, 0.045, cx2, ground(cx2, cz2) + 0.33, cz2, a, DARK));   // a camera
      const [kx, kz] = P(PF, R + 0.16, -(w - 0.02)); geos.push(cyl(0.007, 0.16, kx, ground(kx, kz) + 0.08, kz, STEEL), box(0.04, 0.05, 0.03, kx, ground(kx, kz) + 0.17, kz, a, DARK)); lamps.push({ x: kx, y: ground(kx, kz) + 0.18, z: kz, w: 0.016, h: 0.012, d: 0.012, yaw: a, color: 0x40ff90 });   // keypad
    });
  }
  const owned: Array<{ dispose(): void }> = [];
  if (geos.length) {
    const merged = mergeGeometries(geos, false); geos.forEach(g => g.dispose());
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0.12, flatShading: true, side: THREE.DoubleSide });
    const m = new THREE.Mesh(merged, mat); m.name = 'vehicle_port_fixtures'; m.matrixAutoUpdate = false; m.updateMatrix(); m.castShadow = true; m.receiveShadow = true;
    group.add(m); owned.push(merged, mat);
  }
  if (lamps.length) {
    // (indicator and flood lamps: one instanced box set, unlit so a red lamp stays red; sizes and turns ride in each instance's matrix)
    const geo = new THREE.BoxGeometry(1, 1, 1), mat = new THREE.MeshBasicMaterial({ toneMapped: false }), heads = new THREE.InstancedMesh(geo, mat, lamps.length), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    lamps.forEach((l, i) => { q.setFromEuler(e.set(0, l.yaw, 0)); heads.setMatrixAt(i, m4.compose(new THREE.Vector3(l.x, l.y, l.z), q, new THREE.Vector3(l.w, l.h, l.d))); heads.setColorAt(i, new THREE.Color(l.color)); });
    heads.instanceMatrix.needsUpdate = true; if (heads.instanceColor) heads.instanceColor.needsUpdate = true; heads.frustumCulled = false; heads.castShadow = false;
    group.add(heads); owned.push(geo, mat);
  }
  return { group, key: portsKey(ins), dispose: () => { for (const o of owned) o.dispose(); } };
}
