/**
 * The cosy layer of a home: light and decor placed from a per-home plan (where the seats, the stove, the lamps and the free wall
 * spots are). Light: a soft pool on the floor under each lamp, the fire's pool and glow in front of each stove or hearth, candles
 * and jars on the window sills. Decor, by how long the family has lived there and what they own (buildkit/cozy.ts): pillows,
 * a wool throw, a kettle, herbs drying, garlic, a layered rug, preserves, a mantel with candles and photographs.
 * Pools are drawn by materials only when the building's lamp is lit or the fire burns (game/atmosphere/hearth.ts); decor never
 * changes with the compound's safety, only light does. Every piece is placed on a surface the plan names, never in the air.
 */
import * as THREE from 'three';
import { AUDIT, type FurnishCtx } from './shell';
import { M, piece, type Add } from './interior';
import { Clutter } from './clutter';
import { CozyKit } from './cozyKit';
import { COZY_NONE, type Cozy } from './cozy';
import type { KitMaterialId } from './materials';

type At = { x: number; z: number; rot?: number };

export interface CozyPlan {
  /** Sofas and armchairs (placed at the same spot and turn as the furniture): pillows, the throw on the first armchair. */
  seats?: Array<At & { kind: 'sofa' | 'armchair' }>;
  /** A stove, range or fireplace: its place and turn (front toward local +z), the pool's centre `fwd` ahead of it and its size (units). */
  hearth?: At & { fwd: number; w: number; d: number };
  /** The kettle: on the stove top, `topM` metres above the floor. */
  kettle?: At & { topM: number };
  /** Table and bedside lamps: a pool of light on the floor round them. */
  lamps?: Array<{ x: number; z: number; r?: number }>;
  /** Herbs drying on a wall rod: the wall point (back on the wall, turned into the room), the rod's height and length (metres). */
  herbs?: At & { yM: number; lenM: number };
  garlic?: At & { yM: number };
  /** A smaller rug laid over the big one (metres). */
  rug2?: At & { w: number; d: number };
  /** A fireplace mantel: the fireplace's place, its mantel top (m above the floor) and the mantel's depth along its z (m). */
  mantel?: At & { topM: number; zM: number };
}

const TOP = 0.004;

/** Place a decor piece (never solid), recording it for the geometry audit. */
function put(c: FurnishCtx, name: string, p: At & { y?: number }, fn: (a: Add) => void): void {
  const y = p.y ?? c.y0 + TOP;
  const bb = new THREE.Box3();
  let any = false;
  piece(c.parts.sink, 'interior', { x: p.x, z: p.z, rot: p.rot ?? 0, y }, a => fn((m: KitMaterialId, g: THREE.BufferGeometry) => {
    // (the audit wants each piece's box in its own placed frame: measure before it is moved)
    g.computeBoundingBox();
    const b = g.boundingBox!.clone();
    const sn = Math.sin(p.rot ?? 0), cs = Math.cos(p.rot ?? 0);
    for (const [x, z] of [[b.min.x, b.min.z], [b.max.x, b.min.z], [b.min.x, b.max.z], [b.max.x, b.max.z]]) bb.expandByPoint(new THREE.Vector3(p.x + x * cs + z * sn, y + b.min.y, p.z - x * sn + z * cs)).expandByPoint(new THREE.Vector3(p.x + x * cs + z * sn, y + b.max.y, p.z - x * sn + z * cs));
    any = true;
    a(m, g);
  }), false);
  if (AUDIT.on && any) AUDIT.decor.push({ name, box: bb, spec: c.spec, ox: c.parts.ox, oz: c.parts.oz });
}

/**
 * A pool of light on the floor: `mat` spill (lamplight, only while the building's lamp is lit) or the hearth's (while the fire burns).
 * It is pulled inside the room (never through a wall) and shrunk if the room is smaller than it.
 */
function pool(c: FurnishCtx, x: number, z: number, w: number, d: number, rot: number, mat: 'spill_glow' | 'hearth_glow'): void {
  const sn = Math.abs(Math.sin(rot)), cs = Math.abs(Math.cos(rot));
  let ex = (w * cs + d * sn) / 2, ez = (w * sn + d * cs) / 2;
  const L = c.left + 0.004, R = c.right - 0.004, B = c.back + 0.004, F = c.front - 0.004;
  const k = Math.min(1, (R - L) / (2 * ex), (F - B) / (2 * ez));
  ex *= k; ez *= k;
  const px = Math.max(L + ex, Math.min(R - ex, x)), pz = Math.max(B + ez, Math.min(F - ez, z));
  const g = new THREE.PlaneGeometry(w * k, d * k).rotateX(-Math.PI / 2);
  g.userData.keepUV = true;
  g.rotateY(rot).translate(px, c.y0 + TOP + 0.005, pz);
  c.parts.add(mat, g, 'interior');
}

const PILLOWS: KitMaterialId[] = ['quilt_red', 'quilt_blue', 'wool_grey'];

export function dressCozy(c: FurnishCtx, plan: CozyPlan): void {
  const cozy: Cozy = c.parts.opts.cozy ?? COZY_NONE;
  const base = c.y0 + TOP;

  // ── light (always: it is what makes a lit window read as a warm room) ──
  for (const l of plan.lamps ?? []) { const r = l.r ?? 0.3; pool(c, l.x, l.z, r * 2, r * 1.7, 0, 'spill_glow'); }
  if (plan.hearth) {
    const h = plan.hearth, rot = h.rot ?? 0;
    pool(c, h.x + Math.sin(rot) * h.fwd, h.z + Math.cos(rot) * h.fwd, h.w, h.d, rot, 'hearth_glow');
  }

  // ── decor by how long they have lived here ──
  if (plan.kettle && cozy.kettle) put(c, 'kettle', { ...plan.kettle, y: base + plan.kettle.topM * M }, a => CozyKit.kettle(a));
  (plan.seats ?? []).forEach((s, i) => {
    if (cozy.pillows <= 0) return;
    const spots = s.kind === 'sofa' ? [[-0.72, 0.36], [0.78, 0.41], [-0.2, 0.36]] : [[-0.0, 0.36]];
    const n = s.kind === 'sofa' ? Math.min(cozy.pillows, 3) : i >= 1 && cozy.pillows >= 2 ? 1 : 0;
    for (let k = 0; k < n; k++) {
      const [x, y] = spots[k];
      put(c, 'pillow', { x: s.x, z: s.z, rot: s.rot, y: base }, a => CozyKit.pillow((m, g) => a(m, g.translate(x * M, y * M, (s.kind === 'sofa' ? -0.1 : -0.06) * M)), PILLOWS[(i + k) % 3], s.kind === 'sofa' ? 0.4 : 0.32));
    }
    if (s.kind === 'armchair' && i === 0 && cozy.throwBlanket) put(c, 'throw', { x: s.x, z: s.z, rot: s.rot, y: base }, a => CozyKit.throwOnArmchair(a));
  });
  if (plan.rug2 && cozy.rug2) put(c, 'rug2', { ...plan.rug2, y: base + 0.008 * M }, a => CozyKit.rugLayer(a, plan.rug2!.w, plan.rug2!.d, 'quilt_blue'));
  if (plan.herbs && cozy.herbs) put(c, 'herbs', { ...plan.herbs, y: base + plan.herbs.yM * M }, a => CozyKit.herbRack(a, plan.herbs!.lenM));
  if (plan.garlic && cozy.garlic) put(c, 'garlic', { ...plan.garlic, y: base + plan.garlic.yM * M }, a => CozyKit.garlicBraid(a));
  if (plan.mantel) {
    const m = plan.mantel, y = base + m.topM * M, rot = m.rot ?? 0;
    const at = (u: number) => ({ x: m.x + Math.cos(rot) * u * M, z: m.z - Math.sin(rot) * u * M });
    const zz = (m.zM) * M, off = (a: Add, x: number): Add => (mm, g) => a(mm, g.translate(x * M, 0, zz));
    // candles and a trio of jars; the fireplace's own vase and lamp stand at ±0.6 m
    if (cozy.candles > 0) put(c, 'candle', { x: m.x, z: m.z, rot, y }, a => { for (let i = 0; i < Math.min(2, cozy.candles); i++) Clutter.candle(off(a, -0.42 + i * 0.1)); });
    if (cozy.preserves > 0) put(c, 'jars', { x: m.x, z: m.z, rot, y }, a => CozyKit.preserves(off(a, 0.85), Math.min(3, cozy.preserves)));
    if (cozy.photos) put(c, 'frames', { x: m.x, z: m.z, rot, y }, a => Clutter.photoFrames(off(a, 0.05)));
    void at;
  }

  // ── window sills: a candle in the window, jars, a pot of herbs (only on sills with nothing solid in front of them) ──
  const free = c.parts.sills.filter(s => s.y - c.y0 < 0.5 && !c.parts.furniture.some(f => s.x > f.x0 - 0.03 && s.x < f.x1 + 0.03 && s.z > f.z0 - 0.03 && s.z < f.z1 + 0.03)).sort((a, b) => a.z - b.z || a.x - b.x);
  const items: Array<['candle' | 'jars' | 'pot', (a: Add) => void]> = [];
  for (let i = 0; i < cozy.candles; i++) items.push(['candle', a => Clutter.candle(a)]);
  for (let i = 0; i < Math.min(2, cozy.preserves); i++) items.push(['jars', a => CozyKit.preserves(a, 3)]);
  if (cozy.plant) items.push(['pot', a => CozyKit.sillPot(a)]);
  // spread over the free sills, one item to a sill (the first items go to the sills best placed: candles in the front windows)
  const n = Math.min(items.length, free.length);
  for (let i = 0; i < n; i++) {
    const s = free[Math.min(free.length - 1, Math.floor((i + 0.5) * free.length / n))];
    put(c, 'sill-' + items[i][0], { x: s.x, z: s.z, rot: s.rot, y: s.y }, items[i][1]);
  }
}
