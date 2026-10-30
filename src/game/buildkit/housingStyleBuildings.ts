/**
 * Housing styles' geometry (sim/housingStyles.ts): the lodge, the stone house, the timber-frame house, the container house and the
 * adobe house. All use the shared gabled shell (shell.ts) and the furnished-cabin interior kit (interior.ts), so construction stages,
 * the cutaway and x-ray views, evening seats, sick beds and food shelves work as they do for the cabin.
 *
 * Scale (SCALE v2): 1 unit ≈ 6 m; M = 1 m. A storey is 0.5, a door 0.36, a person 0.28.
 */
import * as THREE from 'three';
import type { KitPieceDef } from './kit';
import { Furniture, M, foodSlot, piece, pipe, sickSlot, wallRun, type Add, type Collider } from './interior';
import { Clutter } from './clutter';
import { dressEvenings } from './goodsDress';
import { box, buildGabled, minusHoles, Parts, windowAt, type BuildOpts, type FurnishCtx, type WallOpening } from './shell';
import type { KitMaterialId } from './materials';

type Builder = (def: KitPieceDef, seed?: number, opts?: BuildOpts) => THREE.Group;
type Rect = { x0: number; z0: number; x1: number; z1: number };

const cyl = (r: number, h: number, x: number, y: number, z: number, seg = 8) => new THREE.CylinderGeometry(r, r, h, seg).translate(x, y + h / 2, z);

/** Rounded log posts and rails all round a deck: `pts` is the line of posts (x, z), railing height `h`, a gap where the stair comes down. */
function railing(p: Parts, layer: 'openings' | 'deck', pts: ReadonlyArray<readonly [number, number]>, y: number, h = 0.17, gaps: ReadonlyArray<[number, number, number, number]> = [], mats: [KitMaterialId, KitMaterialId] = ['log_end', 'wood_mid']): void {
  const inGap = (x: number, z: number) => gaps.some(g => x > g[0] - 1e-6 && x < g[1] + 1e-6 && z > g[2] - 1e-6 && z < g[3] + 1e-6);
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(len / 0.28));
    for (let k = 0; k <= n; k++) {
      const x = ax + (bx - ax) * k / n, z = az + (bz - az) * k / n;
      if (inGap(x, z)) continue;
      p.add(mats[0], cyl(0.013, h, x, y, z, 6), layer);
    }
    const mx = (ax + bx) / 2, mz = (az + bz) / 2;
    if (inGap(mx, mz)) {
      // a rail with a gap: two shorter runs either side
      const steps = Math.max(2, Math.round(len / 0.06));
      let run: Array<[number, number]> = [];
      const flush = () => {
        if (run.length > 1) for (const yy of [h - 0.012, h * 0.55]) {
          const [x0, z0] = run[0], [x1, z1] = run[run.length - 1];
          p.add(mats[1], box(Math.hypot(x1 - x0, z1 - z0) + 0.02, 0.014, 0.02, 0, 0, 0).rotateY(-Math.atan2(z1 - z0, x1 - x0)).translate((x0 + x1) / 2, y + yy, (z0 + z1) / 2), layer);
        }
        run = [];
      };
      for (let k = 0; k <= steps; k++) {
        const x = ax + (bx - ax) * k / steps, z = az + (bz - az) * k / steps;
        if (inGap(x, z)) flush(); else run.push([x, z]);
      }
      flush();
      continue;
    }
    for (const yy of [h - 0.012, h * 0.55]) p.add(mats[1], box(len + 0.02, 0.014, 0.02, 0, 0, 0).rotateY(-Math.atan2(bz - az, bx - ax)).translate(mx, y + yy, mz), layer);
  }
}

/** A straight stair down from a deck: `n` treads from (x, zTop) outward along +z (or -z with dir = -1), `w` wide, from `yTop` to `yBot`. */
function deckStair(p: Parts, x: number, zTop: number, dir: 1 | -1, yTop: number, yBot: number, w: number, run = 0.05): void {
  const n = Math.max(3, Math.round((yTop - yBot) / 0.03)), rise = (yTop - yBot) / n;
  for (let i = 0; i < n; i++) {
    p.add('deck', box(w, 0.016, run + 0.008, x, yTop - (i + 1) * rise, zTop + dir * (i + 0.5) * run), 'deck');
    p.add('wood_dark', box(w, rise, 0.012, x, yTop - (i + 1) * rise, zTop + dir * i * run), 'deck');
  }
  for (const sx of [-1, 1]) {
    const len = Math.hypot(n * run, yTop - yBot), ang = Math.atan2(yTop - yBot, n * run);
    p.add('wood_dark', box(0.02, 0.07, len, sx * (w / 2 - 0.01), 0, 0).rotateX(dir * ang).translate(x, (yTop + yBot) / 2 - 0.03, zTop + dir * n * run / 2), 'deck');
    p.add('wood_mid', box(0.016, 0.014, len, sx * (w / 2 - 0.01), 0, 0).rotateX(dir * ang).translate(x, (yTop + yBot) / 2 + 0.15, zTop + dir * n * run / 2), 'openings');
    p.add('log_end', cyl(0.013, 0.17, x + sx * (w / 2 - 0.01), yTop, zTop, 6), 'openings');
    p.add('log_end', cyl(0.013, 0.17, x + sx * (w / 2 - 0.01), yBot, zTop + dir * n * run, 6), 'openings');
  }
}

// ─────────────────────────────────────────────────────────────────────────
// The lodge
// ─────────────────────────────────────────────────────────────────────────

/** The lodge's frame: 12 × 15 m body, the deck takes the rest of the 15 × 18 m footprint. */
const L = { W: 2.0, D: 2.5, T: 0.07, wallH: 0.98, rise: 0.62, eave: 0.1, deck: 0.25, storey: 0.5, chimX: -0.5 };

function lodge(def: KitPieceDef, seed = 1, opts: BuildOpts = {}, solar = false, plinth = false): THREE.Group {
  const { W, D, T, wallH, rise, eave } = L, hw = W / 2, hd = D / 2;
  const y0 = def.floorY, yE = y0 + wallH, f2 = y0 + L.storey, bw = 0.07;
  // floor hatches (bunker_floorhatch) in a lodge open in its basement slab: the main floor stays whole
  const hatches = opts.hatches ?? [];
  const clear: Collider[] = hatches.map(h => ({ x0: h.x0 - 0.05, x1: h.x1 + 0.05, z0: h.z0 - 0.05, z1: h.z1 + 0.05 }));
  const parts = new Parts(seed, { ...opts, hatches: undefined });
  const door: WallOpening = { kind: 'door', at: 0, w: 0.22, h: 0.44 };
  const { group } = buildGabled({
    W, D, floor: y0, wallH, wallT: T, rise, eave, gableOver: 0.08, porch: L.deck,
    foundation: 'none', noSteps: true, floorMat: 'floorboards', outer: 'log_wall', inner: 'pine_panel', roof: 'metal_roof_green', trim: 'wood_dark',
    front: [door,
      { kind: 'window', at: -0.62, w: 0.34, h: 0.4, sill: 0.07 }, { kind: 'window', at: 0.62, w: 0.34, h: 0.4, sill: 0.07 },
      { kind: 'window', at: -0.28, w: 0.22, h: 0.3, sill: 0.62 }, { kind: 'window', at: 0.28, w: 0.22, h: 0.3, sill: 0.62 }],
    back: [{ kind: 'window', at: -0.62, w: 0.4, h: 0.4, sill: 0.07 }, { kind: 'door', at: 0.62, w: 0.22, h: 0.44 }, { kind: 'window', at: 0, w: 0.4, h: 0.3, sill: 0.62 }],
    left: [-0.9, -0.1, 0.7].map(at => ({ kind: 'window' as const, at, w: 0.3, h: 0.4, sill: 0.07 })).concat([-0.5, 0.3, 1.0].map(at => ({ kind: 'window' as const, at, w: 0.24, h: 0.3, sill: 0.62 }))),
    right: [-0.9, -0.1, 0.7].map(at => ({ kind: 'window' as const, at, w: 0.3, h: 0.4, sill: 0.07 })).concat([-0.5, 0.3, 1.0].map(at => ({ kind: 'window' as const, at, w: 0.24, h: 0.3, sill: 0.62 }))),
    gableWindow: { front: true, back: true, w: 1.3, h: 0.5, y: 0.04, rake: true },
    chimney: { kind: 'stone', x: L.chimX },
    tieBeams: [-0.75, -0.1, 0.55], ceiling: 'pine_panel', corners: 'logs', curtains: 'curtain_red',
  }, (c: FurnishCtx) => furnishLodge(c, { y0, f2, clear, plinth }), parts, p => lodgeShell(p, { y0, yE, f2, bw, hw, hd, hatches, solar, plinth }));
  return group;
}

/** The walkout basement of the lodge on a slope. */
function lodgeBasement(p: Parts, o: LodgeShell): void {
  const { y0, bw, hw, hd } = o;
  const top = y0 - 0.004;
  // ── the walkout basement: poured and stone-faced, the pad is its floor; the back (downhill) wall is mostly glass ──
  p.layer = 'foundation';
  const slabRects = minusHoles({ x0: -hw, x1: hw, z0: -hd, z1: hd }, o.hatches);
  for (const r of slabRects) p.add('concrete', box(r.x1 - r.x0, 0.04, r.z1 - r.z0, (r.x0 + r.x1) / 2, -0.04, (r.z0 + r.z1) / 2));
  const wallH = top + 0.03;
  const sink = p.sink;
  // (no colliders: the body's walls above stand on the same line and have the doorways in them)
  const stone = (ax: number, az: number, bx: number, bz: number, ops: Array<{ at: number; w: number; sill: number; h: number }>) => { wallRun(sink, 'foundation', 'fieldstone', { ax, az, bx, bz, y0: -0.03, h: wallH, t: bw, openings: ops }); };
  stone(-hw, hd - bw / 2, hw, hd - bw / 2, [{ at: hw - 0.55, w: 0.3, sill: 0.3, h: 0.14 }, { at: hw + 0.55, w: 0.3, sill: 0.3, h: 0.14 }]);
  // the back wall: four glass door units under the deck, a stone pier between each
  const doors = [-0.66, -0.22, 0.22, 0.66];
  stone(-hw, -hd + bw / 2, hw, -hd + bw / 2, doors.map(x => ({ at: x + hw, w: 0.38, sill: 0, h: 0.4 })));
  stone(-hw + bw / 2, -hd, -hw + bw / 2, hd, [-0.6, 0.55].map(z => ({ at: z + hd, w: 0.26, sill: 0.2, h: 0.2 })));
  stone(hw - bw / 2, -hd, hw - bw / 2, hd, [-0.6, 0.55].map(z => ({ at: z + hd, w: 0.26, sill: 0.2, h: 0.2 })));
  p.layer = 'openings';
  for (const x of doors) {
    windowAt(p, x, -hd, 0.0, 0, -1, bw, 0.38, 0.4, 'wood_dark');
    p.add('wood_dark', box(0.012, 0.4, 0.02, x, 0, -hd - 0.004), 'openings');
  }
  for (const z of [-0.6, 0.55]) for (const sx of [-1, 1]) windowAt(p, sx * hw, z, 0.2, sx, 0, bw, 0.26, 0.2, 'wood_dark');
  for (const x of [-0.55, 0.55]) windowAt(p, x, hd, 0.3, 0, 1, bw, 0.3, 0.14, 'wood_dark');
  // the stone course above the basement wall and the log sill, a drip of fieldstone at each corner
  p.add('fieldstone', box(2 * hw + 0.04, 0.03, 0.04, 0, top - 0.005, hd + 0.005), 'foundation');
  p.add('fieldstone', box(2 * hw + 0.04, 0.03, 0.04, 0, top - 0.005, -hd - 0.005), 'foundation');

}

/** The lodge on level ground: a raised fieldstone plinth under the logs, a poured slab on grade inside it, two vented crawl-space grilles, a stone course at the sill. */
function lodgePlinth(p: Parts, o: LodgeShell): void {
  const { y0, hw, hd } = o;
  p.layer = 'foundation';
  for (const r of minusHoles({ x0: -hw, x1: hw, z0: -hd, z1: hd }, o.hatches)) p.add('concrete', box(r.x1 - r.x0, 0.04, r.z1 - r.z0, (r.x0 + r.x1) / 2, -0.04, (r.z0 + r.z1) / 2));
  const courses = 5, ch = (y0 + 0.03) / courses;
  for (let i = 0; i < courses; i++) {
    const inset = i % 2 ? 0.004 : 0;
    for (const sz of [-1, 1]) p.add('fieldstone', box(2 * hw + 0.03 - inset, ch - 0.002, 0.07, 0, -0.03 + i * ch, sz * (hd - 0.035)), 'foundation');
    for (const sx of [-1, 1]) p.add('fieldstone', box(0.07, ch - 0.002, 2 * hd - 0.14, sx * (hw - 0.035), -0.03 + i * ch, 0), 'foundation');
  }
  for (const x of [-0.6, 0.6]) p.add('iron', box(0.14, 0.05, 0.012, x, 0.05, hd + 0.004), 'openings');   // the vents
  p.add('fieldstone', box(2 * hw + 0.04, 0.03, 0.04, 0, y0 - 0.034, hd + 0.005), 'foundation');
  p.add('fieldstone', box(2 * hw + 0.04, 0.03, 0.04, 0, y0 - 0.034, -hd - 0.005), 'foundation');
}

interface LodgeShell { y0: number; yE: number; f2: number; bw: number; hw: number; hd: number; hatches: ReadonlyArray<Rect>; solar: boolean; plinth: boolean }

/** Everything the gabled shell does not make: the walkout basement, the piers, the wraparound deck, the stair, the posts, the panels. */
function lodgeShell(p: Parts, o: LodgeShell): void {
  const { y0, yE, hw, hd } = o;
  if (o.plinth) lodgePlinth(p, o); else lodgeBasement(p, o);

  // ── stone piers under the deck and the beams on them ──
  const dx = hw + L.deck, dz = hd + L.deck;
  const piers: Array<[number, number]> = [];
  for (let x = -dx + 0.06; x <= dx - 0.05; x += (2 * dx - 0.12) / 10) { piers.push([x, dz - 0.06], [x, -dz + 0.06]); }
  for (let z = -dz + 0.5; z <= dz - 0.4; z += (2 * dz - 0.9) / 5) piers.push([-dx + 0.06, z], [dx - 0.06, z]);
  for (const [x, z] of piers) {
    p.add('fieldstone', box(0.09, y0 + 0.22, 0.09, x, -0.22, z), 'foundation');
    p.add('chimney_cap', box(0.105, 0.012, 0.105, x, y0 - 0.04, z), 'foundation');
  }
  // ── the wraparound deck: boards on the beams, the chimney stack and the stair coming through ──
  p.layer = 'deck';
  const deckY = y0 - 0.026;
  const chim = { x0: L.chimX - 0.09, x1: L.chimX + 0.09 };
  const board = (x0: number, x1: number, z0: number, z1: number) => { if (x1 - x0 > 1e-4 && z1 - z0 > 1e-4) p.add('deck', box(x1 - x0, 0.024, z1 - z0, (x0 + x1) / 2, deckY, (z0 + z1) / 2), 'deck'); };
  board(hw, dx, -dz, dz); board(-dx, -hw, -dz, dz);                 // the two sides, full length
  board(-hw, chim.x0, -dz, -hd); board(chim.x1, hw, -dz, -hd);       // the back, round the chimney stack
  board(-hw, hw, hd, dz);                                           // the front (the porch under the roof)
  // fascia and the deck's edge beams
  for (const [x0, z0, x1, z1] of [[-dx, -dz, dx, -dz], [dx, -dz, dx, dz], [-dx, dz, dx, dz], [-dx, -dz, -dx, dz]] as const) {
    p.add('wood_dark', box(Math.abs(x1 - x0) + 0.04, 0.06, Math.abs(z1 - z0) + 0.04, (x0 + x1) / 2, deckY - 0.04, (z0 + z1) / 2).translate(0, 0, 0), 'deck');
  }
  // the front stair comes down the middle to the pad, a stone landing at its foot
  deckStair(p, 0, dz, 1, y0 - 0.003, 0, 0.34, 0.055);
  p.add('pavers', box(0.5, 0.012, 0.3, 0, 0, dz + 18 * 0.055 - 0.02), 'deck');
  // the downhill patio under the back deck
  p.add('pavers', box(2 * dx, 0.012, 0.5, 0, 0, -dz - 0.05), 'deck');

  // ── rails on log posts all round, a gap for the stair; the porch roof's extra posts ──
  const rail: Array<readonly [number, number]> = [[-dx + 0.02, dz - 0.02], [-dx + 0.02, -dz + 0.02], [dx - 0.02, -dz + 0.02], [dx - 0.02, dz - 0.02], [0.17, dz - 0.02]];
  railing(p, 'openings', rail, y0, 0.17);
  railing(p, 'openings', [[-0.17, dz - 0.02], [-dx + 0.02, dz - 0.02]], y0, 0.17);
  for (const x of [-0.5, 0.5]) { p.add('log_end', cyl(0.026, yE - y0 - 0.02, x, y0, dz - 0.03, 8), 'openings'); }
  p.add('wood_dark', box(2 * hw + 0.1, 0.05, 0.05, 0, yE - 0.05, dz - 0.03), 'openings');

  // ── gabled dormers on the long roof slopes (not under the panels) ──
  for (const sx of [-1, 1] as const) {
    if (o.solar && sx === 1) continue;
    for (const z of [-0.55, 0.3]) lodgeDormer(p, sx, z, yE);
  }

  // ── solar: 25 panels (1.13 × 1.72 m) in two rows on the +x roof slope, as the garage's ──
  if (o.solar) lodgePanels(p, yE);
}

/** A gabled dormer on a long roof slope: log cheeks following the pitch, a glazed front, a small green roof running up to the main one. */
function lodgeDormer(p: Parts, sx: 1 | -1, zc: number, yE: number): void {
  const hw = L.W / 2, rise = L.rise, xf = 0.66, xb = 0.18, half = 0.15, ch = 0.2;
  const roofY = (x: number) => yE + rise * (1 - x / hw) + 0.02;
  const topY = roofY(xf) + ch;
  p.layer = 'walls';
  // the two cheeks: prisms from the roof surface up to the dormer's eave
  for (const e of [-1, 1]) {
    const sh = new THREE.Shape();
    sh.moveTo(xf, roofY(xf) - 0.04); sh.lineTo(xb, roofY(xb) - 0.04); sh.lineTo(xb, topY); sh.lineTo(xf, topY); sh.closePath();
    const g = new THREE.ExtrudeGeometry(sh, { depth: 0.03, bevelEnabled: false }).translate(0, 0, -0.015);
    p.add('log_wall', g.translate(0, 0, zc + e * half).applyMatrix4(new THREE.Matrix4().makeScale(sx, 1, 1)), 'walls');
  }
  // the front, with a window, and its gable triangle
  p.add('log_wall', box(0.03, ch + 0.04, 2 * half + 0.03, sx * xf, roofY(xf) - 0.04, zc), 'walls');
  const tri = new THREE.Shape(); tri.moveTo(-half - 0.015, 0); tri.lineTo(half + 0.015, 0); tri.lineTo(0, 0.1); tri.closePath();
  p.add('log_wall', new THREE.ExtrudeGeometry(tri, { depth: 0.03, bevelEnabled: false }).rotateY(Math.PI / 2).translate(sx * xf + 0.015, topY, zc), 'walls');
  // the dormer's roof: two slabs across the gable, running back to the slope
  const len = xf - xb + 0.08, slope = Math.atan2(0.1, half + 0.015), w = Math.hypot(half + 0.03, 0.1);
  for (const e of [-1, 1]) {
    p.add('metal_roof_green', box(len, 0.016, w, 0, 0, 0).rotateX(-e * slope).translate(sx * ((xf + xb) / 2 + 0.03), topY + 0.05, zc + e * (half + 0.015) / 2), 'roof');
  }
  p.layer = 'openings';
  windowAt(p, sx * (xf + 0.015), zc, roofY(xf) + 0.02, sx, 0, 0.03, 0.16, ch - 0.04, 'wood_dark');
}

/** 25 panels in two rows (13 + 12) up the south (+x) slope of the main roof. */
function lodgePanels(p: Parts, yE: number): void {
  const hw = L.W / 2, pitch = Math.atan2(L.rise, hw), cosP = Math.cos(pitch);
  const pw = 1.13 * M, ph = 1.72 * M, gap = 0.02 * M;
  const roofY = (x: number) => yE + L.rise * (1 - x / hw) + 0.034 + 0.016;
  const rows = [13, 12];
  rows.forEach((n, row) => {
    const s = 0.1 + (row + 0.5) * (ph + gap), xc = s * cosP;
    for (let i = 0; i < n; i++) {
      const zc = (i - (n - 1) / 2) * (pw + gap);
      const place = (g: THREE.BufferGeometry, up = 0) => g.rotateZ(-pitch).translate(xc, roofY(xc) + up, zc);
      const cell = new THREE.PlaneGeometry(ph - 0.03 * M, pw - 0.03 * M).rotateX(-Math.PI / 2);
      cell.userData.keepUV = true;
      p.add('solar_cell', place(cell, 0.004), 'openings');
      p.add('steel', place(box(ph, 0.035 * M, pw, 0, -0.03 * M, 0)), 'openings');
    }
  });
  for (const s of [0.14, 0.5]) p.add('steel', box(0.02, 0.012, 13 * (pw + gap), 0, -0.012, 0).rotateZ(-pitch).translate(s * cosP, roofY(s * cosP), 0), 'openings');
  p.add('iron', box(0.012, yE - 0.2, 0.012, hw + 0.01, 0.2, -L.D / 2 + 0.15), 'openings');
}

/** The lodge's rooms. Main floor: the great room with the stone hearth, the kitchen by the glass gable, a master suite; the loft floor: four bedrooms, a bath, a study; the basement: a cold cellar, the mechanical room, a family room. */
function furnishLodge(c: FurnishCtx, o: { y0: number; f2: number; clear: Collider[]; plinth: boolean }): void {
  const { I, left, right, front, back, yE, parts } = c;
  const w = c.parts.opts;
  const bY = 0.004;                                                  // the basement floor (the pad)
  const B = (p: { x: number; z: number; rot?: number }, fn: (a: Add) => void, solid = true) => { const col = piece(parts.sink, 'interior', { ...p, y: bY }, fn, solid, o.clear); if (col) parts.collide(col); };
  const f2y = o.f2 + 0.004;
  const U = (p: { x: number; z: number; rot?: number }, fn: (a: Add) => void) => { piece(parts.sink, 'loft', { ...p, y: f2y }, fn, false); };

  // ── main floor ──
  // the great room at the back: a stone hearth up to the loft, sofa and chairs round it, a rug, books
  I({ x: -0.5, z: back + 0.06 }, a => Furniture.fireplace(a, 3.4));
  I({ x: -0.5, z: -0.7 }, a => Furniture.rug(a, 3.2, 2.4), false);
  I({ x: -0.5, z: -0.52, rot: Math.PI }, a => Furniture.sofa(a, 'quilt_blue'));
  I({ x: -0.82, z: -0.78, rot: Math.PI / 2 + 0.4 }, a => Furniture.armchair(a, 'quilt_red'));
  I({ x: -0.18, z: -0.78, rot: -Math.PI / 2 - 0.4 }, a => Furniture.armchair(a, 'quilt_red'));
  I({ x: left + 0.03, z: -0.2, rot: Math.PI / 2 }, a => Furniture.shelfUnit(a, 1.6, 2.2, 'books'));
  I({ x: -0.85, z: back + 0.06 }, a => Furniture.woodbox(a));
  // the kitchen along the left wall and the dining table at the glass gable
  I({ x: left + 0.05, z: 0.68, rot: Math.PI / 2 }, a => Furniture.counter(a, 4.0, 0.4, !!w.plumbed));
  I({ x: left + 0.06, z: 0.2, rot: Math.PI / 2 }, a => Furniture.cookstove(a));
  if (w.wired) I({ x: left + 0.065, z: 0.02, rot: Math.PI / 2 }, a => Furniture.fridge(a));
  I({ x: -0.42, z: 0.62, rot: Math.PI / 2 }, a => Furniture.island(a, 2.2));
  I({ x: 0.3, z: 0.7, rot: Math.PI / 2 }, a => Furniture.diningTable(a));
  dressEvenings(c, { x: 0.3, z: 0.7, rot: Math.PI / 2 });
  I({ x: left + 0.02, z: 0.9, rot: Math.PI / 2 }, a => Furniture.wallShelf(a, 1.6, 1.5, 2, 'jars'), false);
  I({ x: 0.66, z: front - 0.04, rot: Math.PI }, a => Furniture.shelfUnit(a, 1.2, 1.7, 'food'));
  I({ x: -0.35, z: front - 0.01, rot: Math.PI }, a => Furniture.coatPegs(a, 1.2), false);
  if (w.wired) for (const [x, z] of [[-0.42, 0.62], [0.3, 0.7], [-0.5, -0.5], [0.55, -0.7]] as const) I({ x, z, y: o.f2 - 0.05 }, a => Furniture.pendant(a, 0.5), false);
  // the master suite, back right: partitions, a double bed, nightstands, a dresser; the bath beside it
  c.partition(0.42, back, 0.42, -0.4, [{ at: (-0.4 - back) - 0.25, w: 0.16, sill: 0, h: 0.4 }], 'pine_panel', 0.49);
  c.partition(0.42, -0.4, right, -0.4, [], 'pine_panel', 0.49);
  c.partition(0.42, 0.04, right, 0.04, [{ at: 0.33, w: 0.16, sill: 0, h: 0.4 }], 'pine_panel', 0.49);
  I({ x: 0.68, z: back + 0.22 }, a => { Furniture.bed(a, true, 'quilt_red'); sickSlot(a); });
  I({ x: 0.52, z: back + 0.06 }, a => Furniture.nightstand(a));
  I({ x: right - 0.06, z: back + 0.06 }, a => Furniture.nightstand(a));
  I({ x: right - 0.05, z: -0.62, rot: -Math.PI / 2 }, a => Furniture.dresser(a, 1.4));
  I({ x: 0.7, z: -0.26 }, a => Furniture.tub(a));
  I({ x: right - 0.04, z: -0.02, rot: -Math.PI / 2 }, a => Furniture.washstand(a));
  I({ x: 0.54, z: -0.05 }, a => (w.plumbed && w.septic ? Furniture.flushToilet(a) : Furniture.toilet(a)));
  // the stair up, along the master suite's front wall
  I({ x: 0.08, z: -0.22 }, a => Furniture.stairs(a, 3.0, 3.6, 0.95));
  // lived in
  const tableY = c.y0 + 0.004 + 0.76 * M, counterY = c.y0 + 0.004 + 0.9 * M;
  for (const [z, x, r] of [[0.58, 0.22, 1.57], [0.82, 0.22, 1.57], [0.58, 0.38, -1.57], [0.82, 0.38, -1.57]] as const) c.C({ x, z, y: tableY, rot: r }, a => Clutter.plate(a), 0.7);
  c.C({ x: 0.3, z: 0.7, y: tableY }, a => Clutter.fruitBowl(a), 0.8);
  c.C({ x: left + 0.05, z: 0.74, y: counterY - 0.006 }, a => Clutter.dishes(a), 0.9);
  c.C({ x: left + 0.05, z: 0.45, y: counterY }, a => Clutter.jars(a, 3), 0.8);
  c.C({ x: -0.42, z: 0.55, y: c.y0 + 0.004 + 0.92 * M, rot: Math.PI / 2 }, a => Clutter.bread(a), 0.85);
  c.C({ x: -0.8, z: -0.4 }, a => Clutter.dogBed(a, true), 0.8);
  c.C({ x: -0.55, z: -0.52, y: c.y0 + 0.004 + 0.36 * M, rot: Math.PI }, a => Clutter.cat(a), 0.5);
  c.C({ x: left + 0.002, z: -0.7, y: c.y0 + 1.3 * M, rot: Math.PI / 2 }, a => Clutter.picture(a, 1.0, 0.7, c.rnd() < 0.5 ? 'art_mountains' : 'art_lake'), 1);
  c.C({ x: -0.5, z: back + 0.06 + 0.42 * M, y: c.y0 + 0.004 + 1.47 * M }, a => Clutter.photoFrames(a), 0.95);
  c.C({ x: -0.5, z: back + 0.06 + 0.36 * M, y: c.y0 + 3.2 * M }, a => Clutter.antlers(a), 0.8);
  c.C({ x: 0.1, z: front - 0.06, rot: 0.2 }, a => Clutter.boots(a), 0.95);
  c.C({ x: 0.0, z: front - 0.005, y: c.y0 + 2.1 * M, rot: Math.PI }, a => Clutter.riflePegs(a), 0.6);
  c.C({ x: -0.8, z: L.D / 2 + 0.18, y: c.y0, rot: 0.25 }, a => Clutter.rocker(a), 0.9);
  c.C({ x: -0.6, z: L.D / 2 + 0.18, y: c.y0, rot: -0.3 }, a => Clutter.rocker(a), 0.8);
  c.C({ x: 1.1, z: -0.4, y: c.y0, rot: -Math.PI / 2 }, a => Clutter.woodpile(a, 6.0, 1.4), 1);

  // ── the loft floor: boards over the back, the great room open below the glass gable, a gallery rail round the opening ──
  const open = 0.28;                                                      // the open edge (z) of the loft floor
  parts.add('deck', box(right - left, 0.025, open - back, 0, o.f2 - 0.025, (open + back) / 2), 'loft');
  for (const z of [-0.75, -0.1, 0.55]) parts.add('wood_dark', box(right - left, 0.04, 0.045, 0, o.f2 - 0.07, z), 'loft');
  const gal: Array<readonly [number, number]> = [[left, open], [0.1, open]];
  void gal;
  U({ x: 0, z: open - 0.02 }, a => Furniture.rail(a, ((right - left) - 0.5) / M));
  // rooms: a bunkroom and a study on the left, a bedroom and a bath on the right, a landing between
  const par = (ax: number, az: number, bx: number, bz: number, ops: Array<{ at: number; w: number; sill: number; h: number }> = []) => parts.collide(...wallRun(parts.sink, 'loft', 'pine_panel', { ax, az, bx, bz, y0: o.f2, h: 0.45, t: 0.02, openings: ops }));
  par(-0.28, back, -0.28, 0.2, [{ at: 0.3, w: 0.16, sill: 0, h: 0.38 }, { at: 0.95, w: 0.16, sill: 0, h: 0.38 }]);
  par(0.28, back, 0.28, 0.2, [{ at: 0.3, w: 0.16, sill: 0, h: 0.38 }, { at: 1.0, w: 0.16, sill: 0, h: 0.38 }]);
  par(left, -0.5, -0.28, -0.5);
  par(0.28, -0.5, right, -0.5);
  U({ x: -0.62, z: back + 0.2 }, a => Furniture.bunk(a, 'quilt_red', 'quilt_blue'));
  U({ x: -0.43, z: back + 0.2 }, a => Furniture.single(a, 'quilt_blue'));
  U({ x: -0.76, z: -0.7, rot: Math.PI }, a => Furniture.rug(a, 2.0, 1.4));
  U({ x: 0.62, z: back + 0.22 }, a => Furniture.bed(a, true, 'quilt_blue'));
  U({ x: 0.84, z: back + 0.06 }, a => Furniture.nightstand(a));
  U({ x: right - 0.05, z: -0.78, rot: -Math.PI / 2 }, a => Furniture.dresser(a, 1.2));
  U({ x: 0.62, z: -0.22 }, a => Furniture.tub(a));
  U({ x: right - 0.04, z: -0.02, rot: -Math.PI / 2 }, a => Furniture.washstand(a));
  U({ x: 0.45, z: -0.02 }, a => Furniture.toilet(a));
  U({ x: -0.62, z: -0.15, rot: Math.PI }, a => Furniture.table(a, 1.4, 0.7));
  U({ x: left + 0.06, z: -0.3, rot: Math.PI / 2 }, a => Furniture.shelfUnit(a, 1.4, 1.8, 'books'));
  U({ x: 0, z: -0.05 }, a => Furniture.rug(a, 1.6, 1.0));
  U({ x: -0.76, z: -0.15 }, a => Furniture.chair(a));

  if (!o.plinth) {
  // ── the basement: a cold cellar (food shelves, root bins, crocks, a chest freezer), the mechanical room, a family room on the walkout side ──
  const cold = { x0: left, x1: -0.2, z0: 0.55, z1: front };
  const stone = (ax: number, az: number, bx: number, bz: number, ops: Array<{ at: number; w: number; sill: number; h: number }> = []) => parts.collide(...wallRun(parts.sink, 'interior', 'concrete', { ax, az, bx, bz, y0: 0.0, h: 0.46, t: 0.025, openings: ops }));
  stone(cold.x0, cold.z0, cold.x1, cold.z0, [{ at: 0.6, w: 0.16, sill: 0, h: 0.36 }]);
  stone(cold.x1, cold.z0, cold.x1, cold.z1);
  for (const z of [0.7, 0.98]) B({ x: left + 0.05, z, rot: Math.PI / 2 }, a => Furniture.shelfUnit(a, 1.6, 1.9, 'food'));
  for (const x of [-0.7, -0.45]) B({ x, z: front - 0.04, rot: Math.PI }, a => Furniture.shelfUnit(a, 1.4, 1.9, 'food'));
  B({ x: -0.3, z: 0.7, rot: -Math.PI / 2 }, a => Furniture.shelfUnit(a, 1.6, 1.9, 'food'));
  B({ x: -0.62, z: 0.82 }, a => Furniture.rootBin(a, 'log_end'));
  B({ x: -0.5, z: 0.82 }, a => Furniture.rootBin(a, 'paint_red'));
  B({ x: -0.55, z: 0.95 }, a => Furniture.crocks(a));
  B({ x: -0.35, z: 1.05, rot: Math.PI / 2 }, a => Furniture.chestFreezer(a));
  B({ x: -0.6, z: 0.9 }, a => foodSlot(a, 0.64 * M, 0.64 * M, 0.85 * M, true, 0, 0.004, 0), false);
  const mech = { x0: 0.5, x1: right, z0: 0.62, z1: front };
  stone(mech.x0, mech.z0, mech.x1, mech.z0, [{ at: 0.18, w: 0.16, sill: 0, h: 0.36 }]);
  stone(mech.x0, mech.z0, mech.x0, mech.z1);
  B({ x: right - 0.08, z: 0.82 }, a => Furniture.waterHeater(a));
  B({ x: right - 0.2, z: 1.05 }, a => { a('poly_tank', new THREE.CylinderGeometry(0.05, 0.05, 0.14, 12).translate(0, 0.08, 0)); a('iron', box(0.01, 0.2, 0.01, 0.07, 0, 0)); });
  B({ x: 0.62, z: front - 0.04, rot: Math.PI }, a => { a('steel', box(0.18, 0.28, 0.07, 0, 0.1, 0)); a('led_green', box(0.01, 0.01, 0.01, 0.04, 0.3, 0.04)); });   // the panel board
  B({ x: 0.8, z: 0.9 }, a => Furniture.generator(a));
  B({ x: right - 0.05, z: 0.7 }, a => Furniture.barrel(a));
  B({ x: 0.28, z: front - 0.1, rot: Math.PI }, a => Furniture.workbench(a, 2.4));
  B({ x: 0.28, z: front - 0.04, rot: Math.PI }, a => Furniture.toolWall(a, 2.4, 1.05), false);
  // the family room on the walkout side: a sofa, a table, a rug, the glass doors to the patio
  B({ x: 0.0, z: -0.45 }, a => Furniture.rug(a, 3.2, 2.4), false);
  B({ x: -0.5, z: -0.62, rot: 0 }, a => Furniture.sofa(a, 'quilt_blue'));
  B({ x: 0.45, z: -0.55, rot: Math.PI / 2 }, a => Furniture.table(a, 1.4, 0.8));
  B({ x: left + 0.05, z: -0.1, rot: Math.PI / 2 }, a => Furniture.shelfUnit(a, 1.4, 1.8, 'books'));
  B({ x: 0.75, z: -0.2 }, a => Furniture.stool(a));
  // stairs up from the family room to the kitchen
  B({ x: right - 0.12, z: -0.1, rot: Math.PI }, a => Furniture.stairs(a, 3.0, 3.6, 0.9));
  }
  void yE;
}

/** Evening seats (local x, z and the point the sitter faces): round the hearth, and at the dining table. */
const LODGE_SEATS: Array<[number, number, number, number]> = [[-0.8, -0.78, -0.5, -1.1], [-0.2, -0.78, -0.5, -1.1], [0.22, 0.52, 0.3, 0.7], [0.38, 0.88, 0.3, 0.7]];

// ─────────────────────────────────────────────────────────────────────────
// The two-storey 9 × 12 m houses (stone, timber frame): one plan, two shells
// ─────────────────────────────────────────────────────────────────────────

interface TwoStorey { y0: number; f2: number; open: number | null; hearth: number; rug: KitMaterialId }

/** Rooms of a 9 × 12 m two-storey house: great room with a hearth, kitchen and dining, a bedroom and bath at the back; two bedrooms, a bath and a landing above. */
function furnishTwoStorey(c: FurnishCtx, o: TwoStorey): void {
  const { I, left, right, front, back, parts } = c;
  const w = parts.opts;
  const f2y = o.f2 + 0.004;
  const U = (p: { x: number; z: number; rot?: number }, fn: (a: Add) => void) => { piece(parts.sink, 'loft', { ...p, y: f2y }, fn, false); };
  // great room at the back, round the hearth
  I({ x: -0.3, z: back + 0.06 }, a => Furniture.fireplace(a, o.hearth));
  I({ x: -0.3, z: -0.55 }, a => Furniture.rug(a, 2.8, 2.0), false);
  I({ x: -0.3, z: -0.42, rot: Math.PI }, a => Furniture.sofa(a, 'quilt_blue'));
  I({ x: -0.6, z: -0.66, rot: Math.PI / 2 + 0.4 }, a => Furniture.armchair(a, 'quilt_red'));
  I({ x: 0.0, z: -0.66, rot: -Math.PI / 2 - 0.4 }, a => Furniture.armchair(a, 'quilt_red'));
  I({ x: -0.6, z: back + 0.06 }, a => Furniture.woodbox(a));
  I({ x: left + 0.03, z: -0.2, rot: Math.PI / 2 }, a => Furniture.shelfUnit(a, 1.3, 2.0, 'books'));
  // kitchen along the left wall, dining beyond the island
  I({ x: left + 0.05, z: 0.58, rot: Math.PI / 2 }, a => Furniture.counter(a, 3.2, 0.4, !!w.plumbed));
  I({ x: left + 0.06, z: 0.2, rot: Math.PI / 2 }, a => Furniture.cookstove(a));
  if (w.wired) I({ x: left + 0.065, z: 0.02, rot: Math.PI / 2 }, a => Furniture.fridge(a));
  I({ x: -0.2, z: 0.5, rot: Math.PI / 2 }, a => Furniture.island(a, 1.8));
  I({ x: 0.3, z: 0.62, rot: Math.PI / 2 }, a => Furniture.diningTable(a));
  dressEvenings(c, { x: 0.3, z: 0.62, rot: Math.PI / 2 });
  I({ x: left + 0.02, z: 0.82, rot: Math.PI / 2 }, a => Furniture.wallShelf(a, 1.2, 1.5, 2, 'jars'), false);
  I({ x: 0.5, z: front - 0.04, rot: Math.PI }, a => Furniture.shelfUnit(a, 1.0, 1.6, 'food'));
  I({ x: -0.3, z: front - 0.01, rot: Math.PI }, a => Furniture.coatPegs(a, 1.0), false);
  if (w.wired) for (const [x, z] of [[-0.2, 0.5], [0.3, 0.62], [-0.3, -0.45]] as const) I({ x, z, y: o.f2 - 0.05 }, a => Furniture.pendant(a, 0.5), false);
  // the ground-floor bedroom and bath, back right
  c.partition(0.28, back, 0.28, -0.4, [{ at: (-0.4 - back) - 0.22, w: 0.15, sill: 0, h: 0.38 }], 'pine_panel', 0.44);
  c.partition(0.28, -0.4, right, -0.4, [], 'pine_panel', 0.44);
  c.partition(0.28, 0.0, right, 0.0, [{ at: 0.28, w: 0.15, sill: 0, h: 0.38 }], 'pine_panel', 0.44);
  I({ x: 0.5, z: back + 0.22 }, a => { Furniture.bed(a, true, 'quilt_red'); sickSlot(a); });
  I({ x: 0.36, z: back + 0.06 }, a => Furniture.nightstand(a));
  I({ x: right - 0.06, z: back + 0.06 }, a => Furniture.nightstand(a));
  I({ x: right - 0.05, z: -0.6, rot: -Math.PI / 2 }, a => Furniture.dresser(a, 1.1));
  I({ x: 0.5, z: -0.2 }, a => Furniture.tub(a));
  I({ x: right - 0.04, z: -0.04, rot: -Math.PI / 2 }, a => Furniture.washstand(a));
  I({ x: 0.36, z: -0.05 }, a => (w.plumbed && w.septic ? Furniture.flushToilet(a) : Furniture.toilet(a)));
  I({ x: 0.06, z: -0.2 }, a => Furniture.stairs(a, 2.8, 3.4, 0.9));
  // lived in
  const tableY = c.y0 + 0.004 + 0.76 * M, counterY = c.y0 + 0.004 + 0.9 * M;
  c.C({ x: 0.3, z: 0.62, y: tableY }, a => Clutter.fruitBowl(a), 0.8);
  c.C({ x: 0.22, z: 0.52, y: tableY, rot: 1.57 }, a => Clutter.plate(a), 0.7);
  c.C({ x: 0.38, z: 0.72, y: tableY, rot: -1.57 }, a => Clutter.plate(a), 0.7);
  c.C({ x: left + 0.05, z: 0.7, y: counterY - 0.006 }, a => Clutter.dishes(a), 0.9);
  c.C({ x: left + 0.05, z: 0.42, y: counterY }, a => Clutter.jars(a, 3), 0.8);
  c.C({ x: -0.2, z: 0.45, y: c.y0 + 0.004 + 0.92 * M, rot: Math.PI / 2 }, a => Clutter.bread(a), 0.85);
  c.C({ x: -0.55, z: -0.35 }, a => Clutter.dogBed(a, true), 0.8);
  c.C({ x: -0.45, z: -0.42, y: c.y0 + 0.004 + 0.36 * M, rot: Math.PI }, a => Clutter.cat(a), 0.5);
  c.C({ x: left + 0.002, z: -0.65, y: c.y0 + 1.3 * M, rot: Math.PI / 2 }, a => Clutter.picture(a, 0.8, 0.6, c.rnd() < 0.5 ? 'art_mountains' : 'art_sunset'), 1);
  c.C({ x: 0.1, z: front - 0.06, rot: 0.2 }, a => Clutter.boots(a), 0.95);
  c.C({ x: -0.15, z: front - 0.005, y: c.y0 + 2.1 * M, rot: Math.PI }, a => Clutter.riflePegs(a), 0.6);
  c.C({ x: -0.35, z: c.hd + 0.2, y: c.y0, rot: 0.25 }, a => Clutter.rocker(a), 0.9);
  c.C({ x: c.hw + 0.12, z: -0.5, y: 0.004, rot: -Math.PI / 2 }, a => Clutter.woodpile(a, 5.0, 1.3), 1);
  // the upper floor: boards over the plan, a hole for the stair, a landing between the rooms
  const top = o.open ?? front;
  const floor = minusHoles({ x0: left, x1: right, z0: back, z1: top }, [{ x0: -0.02, x1: 0.18, z0: -0.56, z1: 0.14 }]);
  for (const r of floor) parts.add('deck', box(r.x1 - r.x0, 0.025, r.z1 - r.z0, (r.x0 + r.x1) / 2, o.f2 - 0.025, (r.z0 + r.z1) / 2), 'loft');
  for (const z of [-0.6, 0.0, 0.5]) if (z < top) parts.add('wood_dark', box(right - left, 0.04, 0.045, 0, o.f2 - 0.07, z), 'loft');
  if (o.open !== null) U({ x: 0, z: o.open - 0.02 }, a => Furniture.rail(a, (right - left - 0.4) / M));
  U({ x: 0.34, z: -0.2, rot: 0 }, a => Furniture.rail(a, 0.4 / M));
  const par = (ax: number, az: number, bx: number, bz: number, ops: Array<{ at: number; w: number; sill: number; h: number }> = []) => parts.collide(...wallRun(parts.sink, 'loft', 'pine_panel', { ax, az, bx, bz, y0: o.f2, h: 0.42, t: 0.02, openings: ops }));
  par(-0.22, back, -0.22, -0.12, [{ at: 0.6, w: 0.15, sill: 0, h: 0.36 }]);
  par(left, -0.12, -0.22, -0.12);
  par(0.26, back, 0.26, -0.12, [{ at: 0.6, w: 0.15, sill: 0, h: 0.36 }]);
  par(0.26, -0.12, right, -0.12);
  U({ x: -0.47, z: back + 0.2 }, a => Furniture.bunk(a, 'quilt_red', 'quilt_blue'));
  U({ x: -0.3, z: back + 0.2 }, a => Furniture.single(a, 'quilt_blue'));
  U({ x: -0.45, z: -0.4 }, a => Furniture.rug(a, 1.6, 1.2));
  U({ x: 0.48, z: back + 0.22 }, a => Furniture.bed(a, true, 'quilt_blue'));
  U({ x: 0.36, z: back + 0.06 }, a => Furniture.nightstand(a));
  U({ x: right - 0.05, z: -0.5, rot: -Math.PI / 2 }, a => Furniture.dresser(a, 1.0));
  U({ x: 0.48, z: -0.02 }, a => Furniture.rug(a, 1.4, 1.0));
  U({ x: left + 0.06, z: 0.0, rot: Math.PI / 2 }, a => Furniture.shelfUnit(a, 1.2, 1.8, 'books'));
}

const SEATS_2S: Array<[number, number, number, number]> = [[-0.6, -0.66, -0.3, -1.0], [0.0, -0.66, -0.3, -1.0], [0.22, 0.5, 0.3, 0.62], [0.38, 0.78, 0.3, 0.62]];

/** Window pairs down the long walls of a two-storey house: lower and upper rows that never share a column (the shell checks). */
const rowsOf = (lower: number[], upper: number[], wl: number, wu: number, o: { sill: number; sillU: number; h: number; hU: number }): WallOpening[] =>
  [...lower.map(at => ({ kind: 'window' as const, at, w: wl, h: o.h, sill: o.sill })), ...upper.map(at => ({ kind: 'window' as const, at, w: wu, h: o.hU, sill: o.sillU }))];

/** Painted shutters, a pair at each window of the front and the long walls. */
function shutters(p: Parts, hw: number, hd: number, ops: Array<{ side: 'front' | 'left' | 'right'; at: number; w: number; sill: number; h: number }>, y0: number, mat: KitMaterialId = 'paint_green'): void {
  for (const o of ops) for (const e of [-1, 1]) {
    const off = o.w / 2 + 0.028;
    if (o.side === 'front') p.add(mat, box(0.045, o.h, 0.012, o.at + e * off, y0 + o.sill, hd + 0.008), 'openings');
    else p.add(mat, box(0.012, o.h, 0.045, (o.side === 'left' ? -1 : 1) * (hw + 0.008), y0 + o.sill, o.at + e * off), 'openings');
  }
}

// ─────────────────────────────────────────────────────────────────────────
// The stone house
// ─────────────────────────────────────────────────────────────────────────

function stoneHouse(def: KitPieceDef, seed = 1, opts: BuildOpts = {}): THREE.Group {
  const W = def.cellsX * 0.5, D = def.cellsZ * 0.5, hw = W / 2, hd = D / 2, T = 0.075;
  const y0 = def.floorY, wallH = 0.95, rise = 0.5, f2 = y0 + 0.47;
  const lower = [-0.62, 0.05, 0.62], upper = [-0.3, 0.35];
  const side = rowsOf(lower, upper, 0.24, 0.2, { sill: 0.07, sillU: 0.55, h: 0.34, hU: 0.3 });
  const front: WallOpening[] = [{ kind: 'door', at: 0, w: 0.18, h: 0.4 }, { kind: 'window', at: -0.48, w: 0.3, h: 0.34, sill: 0.07 }, { kind: 'window', at: 0.48, w: 0.3, h: 0.34, sill: 0.07 },
    { kind: 'window', at: -0.22, w: 0.15, h: 0.3, sill: 0.55 }, { kind: 'window', at: 0.22, w: 0.15, h: 0.3, sill: 0.55 }];
  const { group } = buildGabled({
    W, D, floor: y0, wallH, wallT: T, rise, eave: 0.1, gableOver: 0.06, porch: def.porch,
    foundation: 'fieldstone', floorMat: 'floorboards', outer: 'fieldstone', inner: 'plaster', roof: 'metal_roof_grey', trim: 'wood_dark',
    front, back: [{ kind: 'window', at: -0.4, w: 0.3, h: 0.34, sill: 0.07 }, { kind: 'door', at: 0.45, w: 0.18, h: 0.4 }, { kind: 'window', at: 0.0, w: 0.2, h: 0.3, sill: 0.55 }],
    left: side, right: side,
    gableWindow: { front: true, back: true, w: 0.34, h: 0.22, y: 0.06 },
    chimney: { kind: 'stone', x: -0.3 }, tieBeams: [-0.5, 0.1, 0.7], ceiling: 'pine_panel', corners: 'none', curtains: 'curtain',
  }, (c: FurnishCtx) => furnishTwoStorey(c, { y0, f2, open: null, hearth: 5.2, rug: 'rug' }), new Parts(seed, opts), p => {
    // dressed quoins at the corners (long and short stones alternately), a stone lintel over every opening, shutters, a stone step at the porch
    p.layer = 'walls';
    const courses = 18, ch = wallH / courses;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (let i = 0; i < courses; i++) {
      const long = i % 2 === 0;
      p.add('concrete', box(long ? 0.1 : 0.06, ch - 0.004, long ? 0.06 : 0.1, sx * (hw - (long ? 0.04 : 0.02)), y0 + i * ch, sz * (hd - (long ? 0.02 : 0.04))), 'walls');
    }
    for (const o of front) p.add('concrete', box((o.w ?? 0.18) + 0.08, 0.035, 0.1, o.at, y0 + (o.kind === 'window' ? (o.sill ?? 0) + (o.h ?? 0.3) + 0.012 : (o.h ?? 0.4)), hd), 'openings');
    shutters(p, hw, hd, [-0.48, 0.48].map(at => ({ side: 'front' as const, at, w: 0.3, sill: 0.07, h: 0.34 })), y0);
    shutters(p, hw, hd, [-0.22, 0.22].map(at => ({ side: 'front' as const, at, w: 0.15, sill: 0.55, h: 0.3 })), y0);
    p.add('fieldstone', box(0.4, 0.05, 0.14, 0, 0, hd + def.porch + 0.07), 'foundation');
    p.add('fieldstone', box(0.34, 0.05, 0.1, 0, 0.05, hd + def.porch + 0.04), 'foundation');
  });
  return group;
}

// ─────────────────────────────────────────────────────────────────────────
// The timber-frame house
// ─────────────────────────────────────────────────────────────────────────

function timberFrameHouse(def: KitPieceDef, seed = 1, opts: BuildOpts = {}): THREE.Group {
  const W = def.cellsX * 0.5, D = def.cellsZ * 0.5, hw = W / 2, hd = D / 2, T = 0.06;
  const y0 = def.floorY, wallH = 0.95, rise = 0.55, f2 = y0 + 0.47, yE = y0 + wallH;
  // two-storey windows between the posts: one tall opening per bay, the girt at the floor line crosses it
  const tall = (at: number, w = 0.34): WallOpening => ({ kind: 'window', at, w, h: 0.8, sill: 0.07 });
  const { group } = buildGabled({
    W, D, floor: y0, wallH, wallT: T, rise, eave: 0.12, gableOver: 0.07, porch: def.porch,
    foundation: 'fieldstone', floorMat: 'floorboards', outer: 'plaster', inner: 'pine_panel', roof: 'metal_roof_green', trim: 'wood_dark',
    front: [{ kind: 'door', at: 0, w: 0.18, h: 0.4 }, tall(-0.5, 0.3), tall(0.5, 0.3)],
    back: [tall(-0.5, 0.3), { kind: 'door', at: 0.5, w: 0.18, h: 0.4 }],
    left: [tall(-0.62, 0.3), tall(0.05, 0.3), tall(0.62, 0.3)],
    right: [tall(-0.62, 0.3), tall(0.05, 0.3), tall(0.62, 0.3)],
    gableWindow: { front: true, back: true, w: 1.0, h: 0.5, y: 0.04, rake: true },
    chimney: { kind: 'pipe', x: -0.3, z: -0.45 }, tieBeams: [-0.5, 0.1, 0.7], ceiling: 'pine_panel', corners: 'none', curtains: 'curtain',
  }, (c: FurnishCtx) => furnishTwoStorey(c, { y0, f2, open: 0.2, hearth: 3.0, rug: 'rug' }), new Parts(seed, opts), p => {
    // the frame outside, standing proud of the plaster: corner and bay posts, a sill, the floor girt and the plate, knee braces at every post
    p.layer = 'deck';
    const tm: KitMaterialId = 'wood_dark', pr = 0.024;
    const tim = (w: number, h: number, d: number, x: number, y: number, z: number) => p.add(tm, box(w, h, d, x, y, z), 'deck');
    for (const [wall, len, sgn] of [['front', hw, 1], ['back', hw, -1]] as const) {
      void wall;
      const z = sgn * (hd + pr / 2 - 0.004);
      for (const x of [-len, -0.75, -0.25, 0.25, len, 0.75]) if (Math.abs(x) <= len) tim(0.045, wallH, pr, x, y0, z);
      for (const y of [y0 - 0.004, f2 - 0.03, yE - 0.045]) tim(2 * len + 0.04, 0.045, pr, 0, y, z);
      for (const x of [-0.75, -0.25, 0.25, 0.75]) for (const e of [-1, 1]) {
        const g = box(0.12, 0.024, pr, 0, 0, 0).rotateZ(e * 0.8).translate(x + e * 0.07, yE - 0.1, z);
        p.add(tm, g, 'deck');
      }
    }
    for (const sx of [-1, 1]) {
      const x = sx * (hw + pr / 2 - 0.004);
      for (const z of [-hd, -0.62, 0.05, 0.62, hd]) tim(pr, wallH, 0.045, x, y0, z);
      for (const y of [y0 - 0.004, f2 - 0.03, yE - 0.045]) tim(pr, 0.045, 2 * hd + 0.04, x, y, 0);
      for (const z of [-0.62, 0.05, 0.62]) for (const e of [-1, 1]) p.add(tm, box(pr, 0.024, 0.12, 0, 0, 0).rotateX(-e * 0.8).translate(x, yE - 0.1, z + e * 0.07), 'deck');
    }
    // the gable's frame: a king post and two struts under the glass
    p.add(tm, box(0.04, rise * 0.55, 0.026, 0, yE, hd + 0.01), 'deck');
    // a stone stem wall's cap and the porch's deck are the shell's; add a gabled hood over the door
    p.add('wood_dark', box(0.3, 0.02, 0.2, 0, y0 + 0.42, hd + def.porch * 0.4), 'openings');
    void yE;
  });
  return group;
}

// ─────────────────────────────────────────────────────────────────────────
// The container house
// ─────────────────────────────────────────────────────────────────────────

const CONTAINERS: KitMaterialId[] = ['shell_blue', 'shell_rust', 'shell_tan', 'shell_green'];

/** Three 40 ft containers: two side by side below (each 2.44 × 12.2 m), one across the right one above, set forward over the deck, the left roof a terrace. */
function containerHouse(def: KitPieceDef, seed = 1, opts: BuildOpts = {}): THREE.Group {
  const cw = 2.44 / 6, W = 2 * cw, D = 12.2 / 6, hw = W / 2, hd = D / 2, T = 0.02;
  const y0 = def.floorY, wallH = 2.59 / 6, yE = y0 + wallH, rise = 0.012, f2 = yE + 0.03;
  const colA = CONTAINERS[seed % CONTAINERS.length], colB = CONTAINERS[(seed % CONTAINERS.length + 1 + (seed >> 3) % 3) % CONTAINERS.length];
  const up = { x0: 0.0, x1: W / 2, z0: -hd + 0.36, z1: hd + 0.36 };   // the upper container, over the right one, 2 m forward
  const { group } = buildGabled({
    W, D, floor: y0, wallH, wallT: T, rise, eave: 0.03, gableOver: 0.02, porch: 0,
    foundation: 'piers', noSteps: true, floorMat: 'floorboards', outer: colA, inner: 'pine_panel', roof: 'metal_roof_grey', trim: 'iron',
    front: [{ kind: 'door', at: -0.2, w: 0.16, h: 0.36 }, { kind: 'window', at: 0.18, w: 0.3, h: 0.34, sill: 0.04 }],
    back: [{ kind: 'window', at: -0.2, w: 0.2, h: 0.28, sill: 0.1 }, { kind: 'window', at: 0.2, w: 0.2, h: 0.28, sill: 0.1 }],
    left: [-0.75, -0.25, 0.25, 0.75].map(at => ({ kind: 'window' as const, at, w: 0.34, h: 0.3, sill: 0.08 })),
    right: [{ kind: 'window', at: -0.7, w: 0.34, h: 0.3, sill: 0.08 }, { kind: 'window', at: -0.1, w: 0.34, h: 0.3, sill: 0.08 }, { kind: 'door', at: 0.55, w: 0.16, h: 0.36 }],
    corners: 'none', curtains: 'curtain_red',
  }, (c: FurnishCtx) => furnishContainer(c, { f2, up }), new Parts(seed, opts), p => {
    // corner castings and the ribbed doors' end frames, the weld seams and the steel grade beam on the piers
    p.layer = 'walls';
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (const y of [y0, yE - 0.03]) p.add('iron', box(0.045, 0.03, 0.045, sx * (hw + 0.006), y, sz * (hd + 0.006)), 'walls');
    p.add('steel', box(0.01, wallH, 0.012, 0, y0, -hd - 0.004), 'walls');
    p.add('iron', box(W + 0.03, 0.04, D + 0.03, 0, y0 - 0.045, 0), 'foundation');
    // the roof deck terrace over the left container: boards, rails, the stair up from the ground
    p.layer = 'roof';
    p.add('deck', box(hw - 0.02, 0.014, D - 0.08, -hw / 2, yE + rise + 0.02, 0), 'roof');
    railing(p, 'openings', [[-hw + 0.01, hd - 0.03], [-hw + 0.01, -hd + 0.03], [-0.01, -hd + 0.03]], yE + rise + 0.034, 0.17, [], ['steel', 'steel']);
    railing(p, 'openings', [[-hw + 0.01, hd - 0.03], [-0.01, hd - 0.03]], yE + rise + 0.034, 0.17, [], ['steel', 'steel']);
    // an outside stair along the left wall up to the terrace
    const n = Math.round((yE + 0.03 - 0.0) / 0.03), rs = (yE + 0.03) / n;
    for (let i = 0; i < n; i++) {
      p.add('steel', box(0.08, 0.012, 0.06, -hw - 0.07, (i + 1) * rs - 0.006, -0.55 + i * 0.045), 'openings');
    }
    // the upper container: walls with windows both sides, a flat roof, a cantilever over the front deck
    const L2 = up.z1 - up.z0, W2 = up.x1 - up.x0, cx = (up.x0 + up.x1) / 2, cz = (up.z0 + up.z1) / 2, h2 = wallH;
    const wallRect = (mat: KitMaterialId, ax: number, az: number, bx: number, bz: number, ops: Array<{ at: number; w: number; sill: number; h: number }>) => p.collide(...wallRun(p.sink, 'walls', mat, { ax, az, bx, bz, y0: f2, h: h2, t: T, openings: ops }));
    const zl = [-0.3, 0.2, 0.7, 1.15], zr = [-0.3, 0.3, 0.9];
    wallRect(colB, up.x0, up.z1 - T / 2, up.x1, up.z1 - T / 2, [{ at: W2 / 2, w: 0.3, sill: 0.06, h: 0.34 }]);
    wallRect(colB, up.x0, up.z0 + T / 2, up.x1, up.z0 + T / 2, [{ at: W2 / 2, w: 0.2, sill: 0.1, h: 0.28 }]);
    wallRect(colB, up.x0 + T / 2, up.z0, up.x0 + T / 2, up.z1, zl.map(z => ({ at: z - up.z0, w: 0.3, sill: 0.08, h: 0.3 })));
    wallRect(colB, up.x1 - T / 2, up.z0, up.x1 - T / 2, up.z1, zr.map(z => ({ at: z - up.z0, w: 0.34, sill: 0.08, h: 0.3 })));
    p.add('metal_roof_grey', box(W2 + 0.04, 0.025, L2 + 0.04, cx, f2 + h2, cz), 'roof');
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (const y of [f2, f2 + h2 - 0.03]) p.add('iron', box(0.045, 0.03, 0.045, cx + sx * (W2 / 2 + 0.004), y, cz + sz * (L2 / 2 + 0.004)), 'walls');
    // the glass in the upper container's openings
    p.layer = 'openings';
    for (const z of zl) windowAt(p, up.x0, z, f2 + 0.08, -1, 0, T, 0.3, 0.3, 'iron');
    for (const z of zr) windowAt(p, up.x1, z, f2 + 0.08, 1, 0, T, 0.34, 0.3, 'iron');
    windowAt(p, cx, up.z1, f2 + 0.06, 0, 1, T, 0.3, 0.34, 'iron');
    windowAt(p, cx, up.z0, f2 + 0.1, 0, -1, T, 0.2, 0.28, 'iron');
    // the deck at the front: boards under and in front of the cantilever, a rail, the stair down
    p.layer = 'deck';
    const dz = hd + 0.3;
    p.add('deck', box(W + 0.1, 0.02, 0.3, 0, y0 - 0.022, hd + 0.15), 'deck');
    railing(p, 'openings', [[-hw - 0.04, hd + 0.3], [hw + 0.04, hd + 0.3], [hw + 0.04, hd]], y0, 0.17, [], ['steel', 'steel']);
    railing(p, 'openings', [[-hw - 0.04, hd], [-hw - 0.04, hd + 0.3]], y0, 0.17, [], ['steel', 'steel']);
    deckStair(p, -0.2, dz, 1, y0 - 0.003, 0, 0.3, 0.05);
    void dz;
  });
  void yE;
  return group;
}

/** Inside the containers: a long narrow great room and kitchen in the left one, bedrooms and a bath in the right, the upper one a bedroom suite. */
function furnishContainer(c: FurnishCtx, o: { f2: number; up: Rect }): void {
  const { I, left, right, front, back, parts } = c;
  const w = parts.opts;
  const f2y = o.f2 + 0.004;
  // the party wall between the containers, cut through in three places
  c.partition(0, back, 0, front, [{ at: 0.5, w: 0.3, sill: 0, h: 0.38 }, { at: 1.1, w: 0.2, sill: 0, h: 0.38 }, { at: 1.7, w: 0.2, sill: 0, h: 0.38 }], 'pine_panel');
  // left container: the kitchen at the front, then the living area with a wood stove, a sofa, the dining table
  I({ x: left + 0.05, z: front - 0.45, rot: Math.PI / 2 }, a => Furniture.counter(a, 3.2, 0.5, !!w.plumbed));
  if (w.wired) I({ x: left + 0.065, z: front - 0.9, rot: Math.PI / 2 }, a => Furniture.fridge(a));
  I({ x: -0.12, z: front - 0.4, rot: Math.PI / 2 }, a => Furniture.island(a, 1.5));
  I({ x: -0.2, z: 0.62, rot: Math.PI / 2 }, a => Furniture.diningTable(a));
  dressEvenings(c, { x: -0.2, z: 0.62, rot: Math.PI / 2 });
  I({ x: -0.2, z: 0.1, rot: Math.PI }, a => Furniture.sofa(a, 'quilt_blue'));
  I({ x: -0.2, z: -0.1, rot: Math.PI }, a => Furniture.rug(a, 2.0, 2.0), false);
  I({ x: -0.18, z: back + 0.1 }, a => Furniture.woodStove(a, 1.6, 0.0));
  I({ x: -0.3, z: back + 0.1 }, a => Furniture.woodbox(a));
  I({ x: left + 0.03, z: -0.3, rot: Math.PI / 2 }, a => Furniture.shelfUnit(a, 1.4, 2.0, 'books'));
  I({ x: left + 0.03, z: -0.75, rot: Math.PI / 2 }, a => Furniture.shelfUnit(a, 1.0, 1.7, 'food'));
  I({ x: -0.3, z: front - 0.01, rot: Math.PI }, a => Furniture.coatPegs(a, 0.8), false);
  // right container: a bedroom at the back, a bath, a bunk room at the front; the stair up between
  c.partition(0, -0.45, right, -0.45, [{ at: 0.1, w: 0.15, sill: 0, h: 0.36 }], 'pine_panel');
  c.partition(0, 0.2, right, 0.2, [{ at: 0.2, w: 0.15, sill: 0, h: 0.36 }], 'pine_panel');
  I({ x: 0.18, z: back + 0.22 }, a => { Furniture.bed(a, true, 'quilt_red'); sickSlot(a); });
  I({ x: right - 0.06, z: back + 0.06 }, a => Furniture.nightstand(a));
  I({ x: 0.14, z: -0.18 }, a => Furniture.shower(a));
  I({ x: right - 0.06, z: -0.05, rot: -Math.PI / 2 }, a => Furniture.washstand(a));
  I({ x: 0.3, z: -0.1 }, a => (w.plumbed && w.septic ? Furniture.flushToilet(a) : Furniture.toilet(a)));
  I({ x: 0.12, z: 0.5 }, a => Furniture.bunk(a, 'quilt_red', 'quilt_blue'));
  I({ x: 0.3, z: 0.5 }, a => Furniture.single(a, 'quilt_blue'));
  I({ x: 0.18, z: 0.95, rot: Math.PI }, a => Furniture.dresser(a, 1.0));
  if (w.wired) for (const [x, z] of [[-0.2, 0.62], [-0.12, front - 0.4], [0.2, 0.1]] as const) I({ x, z, y: c.yE - 0.05 }, a => Furniture.pendant(a, 0.4), false);
  const tableY = c.y0 + 0.004 + 0.76 * M, counterY = c.y0 + 0.004 + 0.9 * M;
  c.C({ x: -0.2, z: 0.62, y: tableY }, a => Clutter.fruitBowl(a), 0.8);
  c.C({ x: left + 0.05, z: front - 0.5, y: counterY - 0.006 }, a => Clutter.dishes(a), 0.9);
  c.C({ x: left + 0.05, z: front - 0.3, y: counterY }, a => Clutter.jars(a, 3), 0.8);
  c.C({ x: -0.3, z: 0.02, y: c.y0 + 0.004 + 0.36 * M, rot: Math.PI }, a => Clutter.cat(a), 0.5);
  c.C({ x: 0.0, z: front - 0.06, rot: 0.3 }, a => Clutter.boots(a), 0.9);
  c.C({ x: left + 0.002, z: -0.1, y: c.y0 + 1.4 * M, rot: Math.PI / 2 }, a => Clutter.picture(a, 0.9, 0.6, 'art_mountains'), 1);
  // the upper container: a main bedroom with a desk, reached by the stair from the front deck? no, by the ladder-stair inside the right container
  const up = o.up, cx = (up.x0 + up.x1) / 2, U = (p: { x: number; z: number; rot?: number }, fn: (a: Add) => void) => piece(parts.sink, 'loft', { ...p, y: f2y }, fn, false);
  parts.add('deck', box(up.x1 - up.x0, 0.025, up.z1 - up.z0, cx, o.f2 - 0.025, (up.z0 + up.z1) / 2), 'loft');
  U({ x: cx, z: up.z0 + 0.22 }, a => Furniture.bed(a, true, 'quilt_blue'));
  U({ x: cx - 0.14, z: up.z0 + 0.06 }, a => Furniture.nightstand(a));
  U({ x: up.x1 - 0.1, z: 0.3, rot: -Math.PI / 2 }, a => Furniture.workbench(a, 1.4));
  U({ x: cx, z: 0.15 }, a => Furniture.chair(a));
  U({ x: cx, z: 0.7 }, a => Furniture.rug(a, 1.6, 1.4));
  U({ x: up.x0 + 0.08, z: 1.0, rot: Math.PI / 2 }, a => Furniture.shelfUnit(a, 1.0, 1.6, 'books'));
  U({ x: cx - 0.1, z: 1.2 }, a => Furniture.ladder(a, 2.7));
}

const SEATS_CONTAINER: Array<[number, number, number, number]> = [[-0.2, 0.46, -0.2, 0.62], [-0.2, 0.78, -0.2, 0.62], [-0.2, 0.18, -0.2, 0.0]];

// ─────────────────────────────────────────────────────────────────────────
// The adobe house
// ─────────────────────────────────────────────────────────────────────────

/** 9 × 12 m rammed-earth house, one storey: a flat roof behind a parapet, vigas through the front wall, buttresses, a portal on peeled posts, a corner fireplace. */
function adobeHouse(def: KitPieceDef, seed = 1, opts: BuildOpts = {}): THREE.Group {
  const W = def.cellsX * 0.5, D = def.cellsZ * 0.5, hw = W / 2, hd = D / 2, T = 0.075;
  const y0 = def.floorY, wallH = 0.5, rise = 0.04, yE = y0 + wallH;
  const win = (at: number, w = 0.2): WallOpening => ({ kind: 'window', at, w, h: 0.26, sill: 0.14 });
  const { group, chimneyTop } = buildGabled({
    W, D, floor: y0, wallH, wallT: T, rise, eave: 0.05, gableOver: 0.03, porch: def.porch,
    foundation: 'concrete', floorMat: 'pavers', outer: 'adobe', inner: 'plaster', roof: 'gravel', trim: 'wood_dark',
    front: [{ kind: 'door', at: 0.05, w: 0.18, h: 0.38 }, win(-0.48, 0.24), win(0.48, 0.24)],
    back: [win(-0.5), win(0.2), { kind: 'door', at: 0.5, w: 0.16, h: 0.36 }],
    left: [win(-0.65), win(-0.1), win(0.5, 0.24)],
    right: [win(-0.65), win(-0.1), win(0.5, 0.24)],
    ceiling: 'pine_panel', corners: 'none', curtains: 'curtain_red',
  }, (c: FurnishCtx) => furnishAdobe(c), new Parts(seed, opts), p => {
    // the parapet all round the roof with a rounded coping, canales (scuppers) at the corners, vigas through the front and back walls
    p.layer = 'walls';
    const par = 0.09, pt = T * 0.9;
    for (const sz of [-1, 1]) p.add('adobe', box(W + 0.1, par, pt, 0, yE + 0.006, sz * (hd - pt / 2 + 0.02)), 'walls');
    for (const sx of [-1, 1]) p.add('adobe', box(pt, par, D - 2 * pt + 0.1, sx * (hw - pt / 2 + 0.02), yE + 0.006, 0), 'walls');
    for (const sz of [-1, 1]) p.add('adobe', box(W + 0.12, 0.012, pt + 0.025, 0, yE + 0.006 + par, sz * (hd - pt / 2 + 0.02)), 'walls');
    for (const sx of [-1, 1]) p.add('adobe', box(pt + 0.025, 0.012, D - 2 * pt + 0.12, sx * (hw - pt / 2 + 0.02), yE + 0.006 + par, 0), 'walls');
    for (const sx of [-1, 1]) p.add('wood_dark', box(0.04, 0.02, 0.1, sx * (hw - 0.1), yE + 0.012, hd + 0.045), 'walls');
    for (let x = -hw + 0.12; x <= hw - 0.1; x += 0.17) {
      p.add('wood_mid', cyl(0.02, 0.17, 0, 0, 0, 8).rotateX(Math.PI / 2).translate(x, yE - 0.05, hd + 0.02), 'openings');
      p.add('wood_mid', cyl(0.02, 0.1, 0, 0, 0, 8).rotateX(Math.PI / 2).translate(x, yE - 0.05, -hd - 0.012), 'openings');
    }
    // the portal's peeled-log posts and the header, the latillas (small poles) over it
    const pz = hd + def.porch - 0.03;
    for (const x of [-hw + 0.1, -0.5, 0.5, hw - 0.1]) p.add('log_end', cyl(0.024, wallH - 0.03, x, y0, pz, 8), 'openings');
    p.add('wood_dark', box(W + 0.04, 0.05, 0.06, 0, yE - 0.07, pz), 'openings');
    // buttresses: stepped, battered earth ribs at the corners and midway down the long walls
    for (const sx of [-1, 1]) for (const z of [-hd + 0.02, -0.4, 0.4, hd - 0.02]) {
      p.add('adobe', box(0.09, 0.36, 0.11, sx * (hw + 0.04), y0, z), 'walls');
      p.add('adobe', box(0.07, 0.12, 0.09, sx * (hw + 0.03), y0 + 0.36, z), 'walls');
    }
    // a kiva fireplace's stack, back left: an earth chimney with a clay cap
    p.add('adobe', box(0.16, 0.2, 0.16, -hw + 0.28, yE + 0.01, -hd + 0.28), 'walls');
    p.add('chimney_cap', box(0.19, 0.016, 0.19, -hw + 0.28, yE + 0.21, -hd + 0.28), 'walls');
    // a low wall and a bench at the portal; a ristra of chiles by the door
    p.layer = 'openings';
    for (const c of [0.15, 0.22, 0.29]) p.add('paint_red', new THREE.ConeGeometry(0.012, 0.07, 6).rotateX(Math.PI).translate(0.15, y0 + 0.36 - c * 0.5, hd + 0.01), 'openings');
  });
  void chimneyTop;
  group.userData.chimneyTop = new THREE.Vector3(-hw + 0.28, yE + 0.28, -hd + 0.28);
  return group;
}

function furnishAdobe(c: FurnishCtx): void {
  const { I, left, right, front, back, parts } = c;
  const w = parts.opts;
  // a kiva (corner) fireplace of plastered earth: a beehive hearth in the back left corner
  I({ x: left + 0.1, z: back + 0.1, rot: Math.PI / 4 }, a => {
    a('adobe', new THREE.SphereGeometry(0.11, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 1.2, 1).translate(0, 0.0, 0));
    a('iron', box(0.1, 0.012, 0.02, 0, 0.04, 0.1));
    a('lamp', box(0.07, 0.05, 0.01, 0, 0.05, 0.095));
    a('adobe', box(0.14, 0.03, 0.2, 0, 0, 0.12));
  });
  I({ x: -0.1, z: -0.5, rot: Math.PI / 4 + Math.PI / 2 }, a => Furniture.rug(a, 2.4, 2.4), false);
  I({ x: -0.15, z: -0.32, rot: Math.PI - 0.5 }, a => Furniture.sofa(a, 'quilt_red'));
  I({ x: -0.5, z: -0.5, rot: Math.PI / 2 + 0.8 }, a => Furniture.armchair(a, 'quilt_blue'));
  I({ x: left + 0.03, z: -0.1, rot: Math.PI / 2 }, a => Furniture.shelfUnit(a, 1.2, 1.9, 'books'));
  // kitchen and dining at the front
  I({ x: left + 0.05, z: 0.56, rot: Math.PI / 2 }, a => Furniture.counter(a, 3.0, 0.4, !!w.plumbed));
  I({ x: left + 0.06, z: 0.22, rot: Math.PI / 2 }, a => Furniture.cookstove(a));
  if (w.wired) I({ x: left + 0.065, z: 0.04, rot: Math.PI / 2 }, a => Furniture.fridge(a));
  I({ x: -0.18, z: 0.5, rot: Math.PI / 2 }, a => Furniture.island(a, 1.6));
  I({ x: 0.3, z: 0.62, rot: Math.PI / 2 }, a => Furniture.diningTable(a));
  dressEvenings(c, { x: 0.3, z: 0.62, rot: Math.PI / 2 });
  I({ x: 0.5, z: front - 0.04, rot: Math.PI }, a => Furniture.shelfUnit(a, 1.0, 1.6, 'food'));
  I({ x: -0.3, z: front - 0.01, rot: Math.PI }, a => Furniture.coatPegs(a, 1.0), false);
  // two bedrooms and a bath along the back right
  c.partition(0.12, back, 0.12, -0.28, [{ at: 0.3, w: 0.15, sill: 0, h: 0.36 }], 'plaster', 0.46);
  c.partition(0.12, -0.28, right, -0.28, [], 'plaster', 0.46);
  c.partition(0.12, 0.08, right, 0.08, [{ at: 0.3, w: 0.15, sill: 0, h: 0.36 }], 'plaster', 0.46);
  I({ x: 0.4, z: back + 0.22 }, a => { Furniture.bed(a, true, 'quilt_red'); sickSlot(a); });
  I({ x: 0.24, z: back + 0.06 }, a => Furniture.nightstand(a));
  I({ x: right - 0.06, z: back + 0.06 }, a => Furniture.nightstand(a));
  I({ x: right - 0.05, z: -0.5, rot: -Math.PI / 2 }, a => Furniture.dresser(a, 1.0));
  I({ x: 0.5, z: -0.12 }, a => Furniture.shower(a));
  I({ x: right - 0.04, z: 0.02, rot: -Math.PI / 2 }, a => Furniture.washstand(a));
  I({ x: 0.28, z: -0.1 }, a => (w.plumbed && w.septic ? Furniture.flushToilet(a) : Furniture.toilet(a)));
  I({ x: -0.55, z: back + 0.22 }, a => Furniture.bunk(a, 'quilt_red', 'quilt_blue'));
  I({ x: -0.38, z: back + 0.22 }, a => Furniture.single(a, 'quilt_blue'));
  if (w.wired) for (const [x, z] of [[-0.18, 0.5], [0.3, 0.62], [-0.2, -0.4]] as const) I({ x, z, y: c.yE - 0.03 }, a => Furniture.pendant(a, 0.3), false);
  // the vigas run across the ceiling, bare round logs
  for (let z = back + 0.1; z < front; z += 0.17) parts.add('wood_mid', box(right - left, 0.03, 0.035, 0, c.yE - 0.035, z), 'decor');
  const tableY = c.y0 + 0.004 + 0.76 * M, counterY = c.y0 + 0.004 + 0.9 * M;
  c.C({ x: 0.3, z: 0.62, y: tableY }, a => Clutter.fruitBowl(a), 0.8);
  c.C({ x: 0.22, z: 0.52, y: tableY, rot: 1.57 }, a => Clutter.plate(a), 0.7);
  c.C({ x: left + 0.05, z: 0.7, y: counterY - 0.006 }, a => Clutter.dishes(a), 0.9);
  c.C({ x: left + 0.05, z: 0.44, y: counterY }, a => Clutter.jars(a, 3), 0.8);
  c.C({ x: -0.5, z: -0.2 }, a => Clutter.dogBed(a, true), 0.8);
  c.C({ x: 0.1, z: front - 0.06, rot: 0.2 }, a => Clutter.boots(a), 0.95);
  c.C({ x: left + 0.002, z: 0.1, y: c.y0 + 1.3 * M, rot: Math.PI / 2 }, a => Clutter.picture(a, 0.8, 0.6, 'art_sunset'), 1);
  c.C({ x: -0.3, z: c.hd + 0.2, y: c.y0, rot: 0.25 }, a => Clutter.rocker(a), 0.9);
  c.C({ x: 0.3, z: c.hd + 0.2, y: c.y0, rot: -0.3 }, a => Clutter.plant(a), 0.8);
}

const SEATS_ADOBE: Array<[number, number, number, number]> = [[-0.15, -0.2, -0.1, -0.5], [-0.5, -0.4, -0.1, -0.5], [0.22, 0.5, 0.3, 0.62], [0.38, 0.78, 0.3, 0.62]];

export const HOUSING_BUILDERS: Record<string, Builder> = {
  lodge: (def, seed, opts) => lodge(def, seed, opts, false),
  lodge_plinth: (def, seed, opts) => lodge(def, seed, opts, false, true),
  lodge_solar: (def, seed, opts) => lodge(def, seed, opts, true),
  stone_house: stoneHouse,
  timber_frame: timberFrameHouse,
  container_house: containerHouse,
  adobe_house: adobeHouse,
};
export const HOUSING_SEATS: Record<string, Array<[number, number, number, number]>> = {
  lodge: LODGE_SEATS, lodge_plinth: LODGE_SEATS, lodge_solar: LODGE_SEATS, stone_house: SEATS_2S, timber_frame: SEATS_2S, container_house: SEATS_CONTAINER, adobe_house: SEATS_ADOBE,
};

void pipe; void cyl;
