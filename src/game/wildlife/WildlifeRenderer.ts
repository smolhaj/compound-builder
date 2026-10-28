/**
 * WildlifeRenderer — the native wildlife of the land (sim/wildlife.ts) as small procedural animals:
 * deer, elk, moose, pronghorn, javelina, turkeys, rabbits, squirrels, grouse, ducks, bears, cougars,
 * wolves and coyotes. One InstancedMesh per body part (body, neck, head, tail, legs, horns: 6 draw
 * calls for every animal on the land), per-instance colors, no shadows and no SSAO (the perf rules).
 * The animals follow the sim's count and the hour (deer out at dawn and dusk, predators at night);
 * where each stands and what it does is wildlifeAI (graze, wander, lift the head, bolt from people
 * and dogs). Sizes are SCALE v2: a person is 0.28, a deer 0.17 at the shoulder.
 */
import * as THREE from 'three';
import { SPECIES, wildlifeView, type SpeciesId } from '../../sim/wildlife';
import { ownedRects } from '../../sim/enclosure';
import type { Rect } from '../../sim/land';
import { hourOf, type GameState } from '../../sim/state';
import { stepBeast, type Beast, type StepCtx } from './wildlifeAI';

const CAP = 120;
const LEG_PER = 4, HORN_PER = 2;

interface Pal { body: number; head: number; leg: number; horn: number }
const PAL: Record<SpeciesId, Pal> = {
  deer: { body: 0xa4825a, head: 0x947050, leg: 0x7e6044, horn: 0xd9cdb0 },
  elk: { body: 0xa07c55, head: 0x4a3524, leg: 0x4f3b28, horn: 0xdacfb2 },
  moose: { body: 0x45352a, head: 0x3b2d24, leg: 0x6b5d50, horn: 0xb8aa88 },
  antelope: { body: 0xb98a55, head: 0xc89c68, leg: 0xe8dcc4, horn: 0x2a2a28 },
  javelina: { body: 0x4a4642, head: 0x413d3a, leg: 0x34312e, horn: 0x34312e },
  turkey: { body: 0x4a3a2a, head: 0xa04545, leg: 0x8b6a55, horn: 0x4a3a2a },
  rabbit: { body: 0x8d7b66, head: 0x8d7b66, leg: 0x7d6b56, horn: 0x8d7b66 },
  squirrel: { body: 0x7e756a, head: 0x7e756a, leg: 0x6a6258, horn: 0x7e756a },
  grouse: { body: 0x7a6347, head: 0x6a5439, leg: 0x6a5439, horn: 0x7a6347 },
  waterfowl: { body: 0x7b6a55, head: 0x2d6a4f, leg: 0xd08a30, horn: 0x7b6a55 },
  bear: { body: 0x2a2420, head: 0x241f1c, leg: 0x1f1b18, horn: 0x2a2420 },
  cougar: { body: 0xb08c5a, head: 0xa98354, leg: 0x9a7848, horn: 0xb08c5a },
  wolf: { body: 0x777570, head: 0x6c6a66, leg: 0x62605c, horn: 0x777570 },
  coyote: { body: 0x9a8468, head: 0x8d7a60, leg: 0x7d6c55, horn: 0x9a8468 },
};

const tmpM = new THREE.Matrix4(), tmpB = new THREE.Matrix4(), tmpL = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpE = new THREE.Euler(),
  tmpV = new THREE.Vector3(), tmpS = new THREE.Vector3(), tmpC = new THREE.Color();

interface Part { mesh: THREE.InstancedMesh; per: number; n: number }

export interface WildlifeCtx {
  ground: (x: number, z: number) => number;
  /** A building, the camp, a gate: animals keep off it. */
  blocked: (x: number, z: number) => boolean;
  /** The creek through the place, if any. */
  creek: { zAt: (x: number) => number; halfWidth: number; waterY: (x: number) => number } | null;
  /** Where people and dogs are (animals bolt from them). */
  threats: ReadonlyArray<readonly [number, number]>;
}

function hashRnd(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}

export class WildlifeRenderer {
  private readonly _parts: Record<'body' | 'neck' | 'head' | 'tail' | 'leg' | 'horn', Part>;
  private readonly _beasts = new Map<string, Beast>();
  private _rects: Rect[] = [];
  private _rnd = hashRnd(0x51ed);
  private _viewKey = '';
  private _viewAt = -99;
  private _time = 0;
  private _seed = -1;

  constructor(scene: THREE.Scene) {
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, metalness: 0 });
    const mk = (name: string, g: THREE.BufferGeometry, per: number): Part => {
      const mesh = new THREE.InstancedMesh(g, mat, CAP * per);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(CAP * per * 3), 3);
      mesh.count = 0; mesh.castShadow = false; mesh.receiveShadow = false; mesh.frustumCulled = false;
      mesh.name = `wild_${name}`; mesh.userData = { type: 'wildlife', noSSAO: true };
      scene.add(mesh);
      return { mesh, per, n: 0 };
    };
    const ball = new THREE.SphereGeometry(1, 10, 7);
    // (a leg hangs from its hip; a horn rises from its base)
    const leg = new THREE.CylinderGeometry(1, 0.7, 1, 6).translate(0, -0.5, 0);
    const horn = new THREE.ConeGeometry(1, 1, 5).translate(0, 0.5, 0);
    this._parts = { body: mk('body', ball, 1), neck: mk('neck', ball, 1), head: mk('head', ball, 1), tail: mk('tail', ball, 1), leg: mk('leg', leg, LEG_PER), horn: mk('horn', horn, HORN_PER) };
  }

  /** The animals that exist now (QA / camera): id, species, position, mood. */
  animals(): Array<{ id: string; sp: SpeciesId; x: number; z: number; mood: string; vis: number }> {
    return [...this._beasts.values()].map(b => ({ id: b.id, sp: b.sp, x: b.x, z: b.z, mood: b.mood, vis: b.vis }));
  }
  /** Put an animal somewhere (QA shots): returns false if there is none of that species. */
  place(sp: SpeciesId, x: number, z: number, rot = 0, index = 0): boolean {
    const l = [...this._beasts.values()].filter(b => b.sp === sp);
    const b = l[index];
    if (!b) return false;
    b.x = b.tx = b.hx = x; b.z = b.tz = b.hz = z; b.rot = rot; b.vis = 1; b.mood = 'graze'; b.t = 99;
    return true;
  }

  /** QA shots: put an animal exactly here (it stays until `clearDebug`). */
  spawnDebug(sp: SpeciesId, x: number, z: number, rot = 0, male = true, side: Beast['side'] = 'free'): void {
    const id = `qa:${sp}${this._beasts.size}`;
    this._beasts.set(id, { id, sp, x, z, rot, hx: x, hz: z, tx: x, tz: z, mood: 'graze', t: 9999, phase: 0, vis: 1, want: true, head: 0, v: 0, male, side, group: 99, k: 0.4 });
  }
  clearDebug(): void { for (const id of [...this._beasts.keys()]) if (id.startsWith('qa:')) this._beasts.delete(id); }

  private _inRects(x: number, z: number, pad: number): boolean {
    return this._rects.some(r => x > r.x0 + pad && x < r.x1 - pad && z > r.z0 + pad && z < r.z1 - pad);
  }
  private _nearRects(x: number, z: number, reach: number): boolean {
    return this._rects.some(r => x > r.x0 - reach && x < r.x1 + reach && z > r.z0 - reach && z < r.z1 + reach);
  }

  private _allowed(c: WildlifeCtx) {
    return (x: number, z: number, b: Beast): boolean => {
      const sd = SPECIES[b.sp];
      if (b.sp === 'waterfowl' && c.creek) return Math.abs(z - c.creek.zAt(x)) < c.creek.halfWidth * 0.8 && this._nearRects(x, z, 2);
      if (c.blocked(x, z)) return false;
      if (c.creek && sd.kind !== 'bird' && Math.abs(z - c.creek.zAt(x)) < c.creek.halfWidth * 0.9) return false;
      if (b.side === 'in') return this._inRects(x, z, 0.5);
      if (b.side === 'out') return !this._inRects(x, z, -0.4) && this._nearRects(x, z, 10);
      return this._nearRects(x, z, 12);
    };
  }

  /** Spawn an animal at a spot it may stand on, near its herd. */
  private _spawn(id: string, sp: SpeciesId, side: Beast['side'], group: number, male: boolean, c: WildlifeCtx): Beast | null {
    const r = hashRnd(Math.imul(this._seed + 7, 2654435761) ^ [...id].reduce((a, ch) => Math.imul(a, 31) + ch.charCodeAt(0) | 0, 7));
    const probe: Beast = { id, sp, x: 0, z: 0, rot: r() * 6.28, hx: 0, hz: 0, tx: 0, tz: 0, mood: 'graze', t: 2 + r() * 8, phase: r() * 6, vis: 0, want: true, head: 0, v: 0, male, side, group, k: r() };
    const ok = this._allowed(c), rects = this._rects;
    // the herd's anchor is the same for every member (by group)
    const gr = hashRnd(Math.imul(this._seed + 13, 40503) ^ (group * 977 + sp.charCodeAt(0) * 131 + sp.length));
    for (let i = 0; i < 60; i++) {
      const rc = rects[Math.floor(gr() * rects.length) % rects.length];
      const reach = side === 'out' ? 8 : side === 'in' ? 0 : 6;
      let ax = rc.x0 - reach + gr() * (rc.x1 - rc.x0 + reach * 2), az = rc.z0 - reach + gr() * (rc.z1 - rc.z0 + reach * 2);
      if (sp === 'waterfowl' && c.creek) { ax = rc.x0 + gr() * (rc.x1 - rc.x0); az = c.creek.zAt(ax) + (gr() - 0.5) * c.creek.halfWidth; }
      const x = ax + (r() - 0.5) * 1.2, z = az + (r() - 0.5) * 1.2;
      if (ok(x, z, probe)) { probe.x = probe.hx = probe.tx = x; probe.z = probe.hz = probe.tz = z; return probe; }
    }
    return null;
  }

  update(dt: number, game: GameState, clock: number, c: WildlifeCtx, speedK: number): void {
    this._time += dt;
    if (game.seed !== this._seed) { this._seed = game.seed; this._beasts.clear(); this._viewKey = ''; }
    this._rects = ownedRects(game);
    const hour = hourOf(clock);
    // who should be out: recomputed twice a real second at most and when the hour turns
    const key = `${Math.floor(hour * 2)}|${game.perimeter.filter(r => r.finishedAt !== null).length}|${game.gate.pending ? 1 : 0}|${Math.floor(game.wild.abundance.big * 40)}|${Math.floor(game.wild.abundance.small * 40)}|${this._rects.length}|${game.site.region}|${game.wildlife ? Object.keys(game.wildlife.gone).length : 0}`;
    if (key !== this._viewKey && this._time - this._viewAt > 0.5) {
      this._viewKey = key; this._viewAt = this._time;
      const want = new Map(wildlifeView(game, hour).slice(0, CAP).map(v => [v.id, v]));
      for (const [id, b] of this._beasts) if (!want.has(id) && !id.startsWith('qa:')) b.want = false;
      for (const [id, v] of want) {
        const have = this._beasts.get(id);
        if (have) { have.want = true; if (have.side !== v.side) { have.side = v.side; this._relocate(have, c); } continue; }
        if (this._beasts.size >= CAP) break;
        const b = this._spawn(id, v.sp, v.side, v.group, v.male, c);
        if (b) this._beasts.set(id, b);
      }
    }
    // step everyone
    const ctx: StepCtx = { threats: c.threats, allowed: this._allowed(c), rnd: this._rnd, speedK };
    for (const [id, b] of this._beasts) {
      // an animal the wall now keeps out (or in) is somewhere else: put it where it belongs
      if (!b.id.startsWith('qa:') && !ctx.allowed(b.x, b.z, b) && b.sp !== 'waterfowl') this._relocate(b, c);
      stepBeast(b, dt, ctx);
      if (!b.want && b.vis < 0.02) this._beasts.delete(id);
    }
    this._draw(c);
  }

  private _relocate(b: Beast, c: WildlifeCtx): void {
    const nb = this._spawn(b.id, b.sp, b.side, b.group, b.male, c);
    if (nb) { b.x = b.hx = b.tx = nb.x; b.z = b.hz = b.tz = nb.z; b.vis = 0; }
  }

  private _put(part: Part, m: THREE.Matrix4, color: number, tone: number): void {
    const i = part.n++;
    part.mesh.setMatrixAt(i, m);
    tmpC.setHex(color); tmpC.multiplyScalar(0.88 + tone * 0.24);
    part.mesh.setColorAt(i, tmpC);
  }
  /** local → matrix: position, euler (x pitch, y yaw, z roll) and a non-uniform scale, on the animal's base. */
  private _loc(x: number, y: number, z: number, rx: number, ry: number, rz: number, sx: number, sy: number, sz: number): THREE.Matrix4 {
    tmpQ.setFromEuler(tmpE.set(rx, ry, rz));
    tmpL.compose(tmpV.set(x, y, z), tmpQ, tmpS.set(sx, sy, sz));
    return tmpM.multiplyMatrices(tmpB, tmpL);
  }

  private _draw(c: WildlifeCtx): void {
    for (const p of Object.values(this._parts)) p.n = 0;
    for (const b of this._beasts.values()) {
      if (b.vis < 0.02) continue;
      const sd = SPECIES[b.sp], pal = PAL[b.sp], size = b.vis * (b.sp === 'moose' || b.sp === 'elk' ? 0.94 + b.k * 0.1 : 0.94 + b.k * 0.12);
      let gy = c.ground(b.x, b.z);
      if (b.sp === 'waterfowl' && c.creek && Math.abs(b.z - c.creek.zAt(b.x)) < c.creek.halfWidth) gy = Math.max(gy, c.creek.waterY(b.x)) - 0.004;
      tmpB.compose(tmpV.set(b.x, gy, b.z), tmpQ.setFromEuler(tmpE.set(0, b.rot, 0)), tmpS.set(size, size, size));
      const base = tmpB.clone();
      tmpB.copy(base);
      const H = sd.h, L = sd.len, swing = Math.sin(b.phase) * Math.min(0.7, b.v * 0.7 + 0.05) * (b.v > 0.01 ? 1 : 0);
      const bird = sd.kind === 'bird';
      const graze = b.mood === 'graze' ? 1 - b.head : 0;
      const bounce = b.v > 0.4 && (b.sp === 'rabbit' || b.sp === 'squirrel') ? Math.abs(Math.sin(b.phase * 0.7)) * H * 0.6 : b.v > 0.4 ? Math.abs(Math.sin(b.phase)) * H * 0.04 : 0;
      const tone = b.k;
      if (!bird) {
        const legLen = H * (b.sp === 'rabbit' || b.sp === 'squirrel' ? 0.35 : b.sp === 'javelina' || b.sp === 'bear' ? 0.42 : 0.52);
        const by = legLen + H * 0.2 + bounce, bw = H * (b.sp === 'bear' ? 0.27 : b.sp === 'javelina' ? 0.24 : 0.2), bh = H * (b.sp === 'bear' ? 0.31 : 0.26), bl = L * 0.37;
        this._put(this._parts.body, this._loc(0, by, 0, 0, 0, 0, bw, bh, bl), pal.body, tone);
        // legs: front pair and hind pair swing in opposition
        for (let i = 0; i < 4; i++) {
          const fz = i < 2 ? bl * 0.62 : -bl * 0.62, fx = (i % 2 ? 1 : -1) * bw * 0.6, sw = swing * ((i < 2) === (i % 2 === 0) ? 1 : -1);
          const lr = H * (b.sp === 'bear' ? 0.085 : b.sp === 'rabbit' || b.sp === 'squirrel' ? 0.09 : 0.05);
          this._put(this._parts.leg, this._loc(fx, by - bh * 0.2, fz, sw, 0, 0, lr, legLen + bh * 0.2, lr), pal.leg, tone);
        }
        // neck and head: down to graze, up to look
        const neckLen = H * (b.sp === 'moose' ? 0.5 : b.sp === 'bear' ? 0.22 : b.sp === 'rabbit' || b.sp === 'squirrel' ? 0.1 : 0.42);
        const pitch = (b.sp === 'rabbit' || b.sp === 'squirrel') ? 0.15 + b.head * 0.5 : (-0.75 + b.head * 1.45 + (b.mood === 'walk' ? -0.15 : 0)) * (b.sp === 'bear' || b.sp === 'cougar' || b.sp === 'wolf' || b.sp === 'coyote' ? 0.55 : 1) + (graze > 0.5 ? -0.1 : 0);
        const sy = by + bh * 0.35, sz = bl * 0.8;
        const dy = Math.sin(pitch), dz = Math.cos(pitch);
        const nr = H * (b.sp === 'bear' ? 0.17 : 0.085);
        // the neck is a stretched ball along (0, dy, dz): rotate about x by -(pitch)
        this._put(this._parts.neck, this._loc(0, sy + dy * neckLen * 0.5, sz + dz * neckLen * 0.5, -pitch, 0, 0, nr, nr, neckLen * 0.62), pal.body, tone);
        const hr = H * (b.sp === 'bear' ? 0.15 : b.sp === 'moose' ? 0.11 : 0.075), hl = hr * (b.sp === 'rabbit' ? 1.5 : 1.9);
        const hy = sy + dy * neckLen, hz = sz + dz * neckLen;
        const headPitch = -pitch * 0.35 + 0.35 * (1 - b.head);
        this._put(this._parts.head, this._loc(0, hy, hz + hl * 0.35, -headPitch - (graze > 0.5 ? 0.35 : 0), 0, 0, hr, hr * 0.9, hl), pal.head, tone);
        // tail
        const tl = b.sp === 'rabbit' ? 0.025 : H * 0.06;
        this._put(this._parts.tail, this._loc(0, by + bh * 0.4, -bl * 0.95, 0.5, 0, 0, tl, tl, b.sp === 'coyote' || b.sp === 'wolf' ? H * 0.28 : tl * 1.5), b.sp === 'rabbit' ? 0xe8e0d4 : b.sp === 'bear' ? pal.body : b.sp === 'deer' ? 0xeee8dd : pal.body, tone);
        // antlers on the bucks and bulls; the rabbit's ears
        const antler = b.male && (b.sp === 'deer' || b.sp === 'elk' || b.sp === 'moose');
        if (antler) {
          const al = H * (b.sp === 'elk' ? 0.62 : b.sp === 'moose' ? 0.5 : 0.4);
          for (let i = 0; i < 2; i++) {
            const side = i ? 1 : -1;
            this._put(this._parts.horn, this._loc(side * hr * 0.55, hy + hr * 0.5, hz + hl * 0.1, -0.5 + (b.sp === 'moose' ? 0.9 : 0), 0, -side * 0.55, hr * 0.28, al, hr * 0.28), pal.horn, tone);
          }
        } else if (b.sp === 'rabbit') {
          for (let i = 0; i < 2; i++) this._put(this._parts.horn, this._loc((i ? 1 : -1) * 0.006, hy + 0.01, hz, -0.1, 0, (i ? -1 : 1) * 0.15, 0.007, 0.05, 0.004), pal.body, tone);
        } else if (b.sp === 'deer' || b.sp === 'elk' || b.sp === 'antelope' || b.sp === 'javelina' || b.sp === 'cougar' || b.sp === 'wolf' || b.sp === 'coyote' || b.sp === 'bear') {
          // ears
          for (let i = 0; i < 2; i++) this._put(this._parts.horn, this._loc((i ? 1 : -1) * hr * 0.75, hy + hr * 0.55, hz - hl * 0.05, -0.2, 0, (i ? -1 : 1) * 0.7, hr * 0.38, hr * 1.0, hr * 0.2), pal.head, tone);
        }
      } else {
        // birds: a leaning body, a neck and small head on top, two legs, a tail
        const legLen = H * 0.42, by = legLen + H * 0.2 + (b.sp === 'waterfowl' ? -legLen * 0.8 : 0), lean = -0.25;
        this._put(this._parts.body, this._loc(0, by, 0, lean, 0, 0, H * 0.24, H * 0.24, L * 0.4), pal.body, tone);
        if (b.sp !== 'waterfowl') for (let i = 0; i < 2; i++) this._put(this._parts.leg, this._loc((i ? 1 : -1) * H * 0.07, by - H * 0.1, 0, swing * (i ? 1 : -1), 0, 0, H * 0.018, legLen + H * 0.1, H * 0.018), pal.leg, tone);
        else for (let i = 0; i < 2; i++) this._put(this._parts.leg, this._loc((i ? 1 : -1) * H * 0.07, by - H * 0.1, 0, 0, 0, 0, 0.001, 0.001, 0.001), pal.leg, tone);
        const nl = H * (b.sp === 'turkey' ? 0.55 : 0.4) * (b.mood === 'graze' ? 0.55 : 1);
        const np = b.mood === 'graze' ? 0.55 : 1.15;
        this._put(this._parts.neck, this._loc(0, by + H * 0.1 + Math.sin(np) * nl * 0.5, L * 0.3 + Math.cos(np) * nl * 0.5, -np, 0, 0, H * 0.05, H * 0.05, nl * 0.55), b.sp === 'turkey' ? pal.head : pal.head, tone);
        this._put(this._parts.head, this._loc(0, by + H * 0.1 + Math.sin(np) * nl, L * 0.3 + Math.cos(np) * nl + H * 0.04, 0, 0, 0, H * 0.055, H * 0.05, H * 0.08), pal.head, tone);
        const fan = b.sp === 'turkey' ? (b.male ? H * 0.5 : H * 0.3) : H * 0.18;
        this._put(this._parts.tail, this._loc(0, by + H * 0.1, -L * 0.42, 0.5, 0, 0, fan * (b.sp === 'turkey' && b.male ? 0.9 : 0.4), fan * 0.7, H * 0.03), b.sp === 'turkey' ? 0x6a4a2c : pal.body, tone);
      }
    }
    for (const p of Object.values(this._parts)) {
      p.mesh.count = p.n;
      p.mesh.instanceMatrix.needsUpdate = true;
      if (p.mesh.instanceColor) p.mesh.instanceColor.needsUpdate = true;
    }
  }

  dispose(): void {
    for (const p of Object.values(this._parts)) { p.mesh.removeFromParent(); p.mesh.geometry.dispose(); }
    (this._parts.body.mesh.material as THREE.Material).dispose();
  }
}
