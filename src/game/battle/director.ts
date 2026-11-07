/**
 * The cutscene's camera operator (the user: "ground-level/follow shots of the
 * party reacting … cutting between wall, house and raiders"). Pure: it sees where
 * everyone is and what just happened and picks a shot. The frame loop eases to it.
 *
 * Scale: 1 unit = 6 m, a person is 0.28 tall, so a shoulder-height shot is ~0.24
 * and the tower is 0.9. Cuts are hard; inside a shot the camera drifts slowly.
 */
import type { BattleEvent } from '../../sim/battleTypes';
import { mulberry32 } from '../../sim/rng';
import type { Box } from './cameraObstacles';

export type { Box } from './cameraObstacles';
export interface Actor { id: string; side: 'home' | 'raider'; post?: string; x: number; y: number; z: number; dead: boolean; gone: boolean }
export interface V3 { x: number; y: number; z: number }
export type ShotKind = 'establish' | 'wide' | 'wall' | 'house' | 'raiders' | 'close' | 'gate';
export interface Shot { kind: ShotKind; subject?: string; eye: V3; look: V3; fov: number; since: number; hold: number; drift: V3; /** Who the shot is about (ids), and how many of them must be in frame. */ subjects?: string[]; need?: number; /** The fewest pixels tall (on a 720-line picture) the subjects must stand in the picture; unset = any. */ minPx?: number; /** The unit the operator pans after (the look eases to it as it moves). */ track?: string }

const MIN_HOLD = 3.2;
const ORDER: ShotKind[] = ['wall', 'raiders', 'house', 'wide', 'gate', 'raiders'];
/** The lead-in is only 3-9 s of playback: a wide pose, the crew from the side, a low shot out through the gate from the defenders' side (the caption is about the raiders, so never a defender's close-up), each held a few seconds and never twice running. */
const LEAD_ORDER: ShotKind[] = ['wide', 'raiders', 'gate'];
/** The shortest a scheduled shot is held in the lead-in (s). */
const LEAD_HOLD = 3.1;
const EYE_MIN = 0.12;
const POSE_SPAN = 12;
/** An establishing shot (the card between scenes) drifts for longer: the picture is never still while the player reads. */
const spanOf = (s: Pick<Shot, 'kind'>): number => (s.kind === 'establish' ? 30 : POSE_SPAN);
/** A standing figure's height in world units, and the picture height the pixel rule is measured on. */
const FIG_H = 0.28, VIEW_H = 720;

/** The least distance (world units, 1 = 6 m) from the camera to what a shot is about, by shot type. */
export const STANDOFF: Record<ShotKind, number> = { establish: 3, wide: 3, wall: 0.9, house: 2, raiders: 1.6, close: 0.8, gate: 1.2 };
/** The farthest a subject may be before it is a speck. */
export const REACH = 30;
/** The camera stays this far from every wall and roof (the near plane is 0.02, so nothing clips). */
export const CLEAR = 0.3;
/** How far along the view axis nothing solid may sit (a frame filled with shingles). */
export const VIEW_CLEAR = 1.0;
const CHEST = 0.17;
/** The picture area left by the letterbox, as a fraction of the frame's half-extent (vertical, horizontal tangent scale). */
const FRAME = { aspect: 1.78, v: 0.66, h: 0.8 };

const sub = (a: V3, b: V3): V3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const len2 = (a: { x: number; z: number }) => Math.hypot(a.x, a.z) || 1;
const centroid = (xs: Actor[]): V3 => xs.length ? { x: xs.reduce((a, u) => a + u.x, 0) / xs.length, y: xs.reduce((a, u) => a + u.y, 0) / xs.length, z: xs.reduce((a, u) => a + u.z, 0) / xs.length } : { x: 0, y: 0, z: 0 };
type Ground = (x: number, z: number) => number;

/** Distance from a point to a box on the ground plane (0 inside). */
const flatDist = (x: number, z: number, b: Box): number => Math.hypot(Math.max(b.x0 - x, 0, x - b.x1), Math.max(b.z0 - z, 0, z - b.z1));

/** The point where an actor's chest is. */
export const chestOf = (a: Actor, ground: Ground): V3 => ({ x: a.x, y: ground(a.x, a.z) + a.y + CHEST, z: a.z });

/** Is a point (world y) within `m` of a box (the box stands `h` tall from the ground under the point)? */
export function nearBox(p: V3, b: Box, ground: Ground, m: number): boolean {
  if (b.kind === 'brush') return false;   // (ground cover only hides a figure; a camera may stand among it: see `blockedBetween`)
  if (flatDist(p.x, p.z, b) >= m) return false;
  const up = p.y - ground(p.x, p.z);
  return up < b.h + m && up > (b.y0 ?? 0) - m;
}

/** Is a view point (x, z at height y) inside a box, with `m` of margin on the plan? */
const insideBox = (p: V3, b: Box, ground: Ground, m = 0): boolean => b.kind !== 'brush' && insideAny(p, b, ground, m);
const insideAny = (p: V3, b: Box, ground: Ground, m = 0): boolean => flatDist(p.x, p.z, b) <= m && p.y - ground(p.x, p.z) < b.h && p.y - ground(p.x, p.z) >= (b.y0 ?? 0);

/** Is `p` inside the picture of a camera at `eye` looking at `look`? Returns the depth too. */
export function inFrame(eye: V3, look: V3, fov: number, p: V3): boolean {
  const f = norm3(sub(look, eye));
  const r = norm3({ x: f.z, y: 0, z: -f.x });          // right = f x up, flattened
  const u = { x: r.y * f.z - r.z * f.y, y: r.z * f.x - r.x * f.z, z: r.x * f.y - r.y * f.x };
  const v = sub(p, eye);
  const z = v.x * f.x + v.y * f.y + v.z * f.z;
  if (z < 0.25) return false;
  const th = Math.tan(fov * Math.PI / 360);
  const x = (v.x * r.x + v.y * r.y + v.z * r.z), y = (v.x * u.x + v.y * u.y + v.z * u.z);
  return Math.abs(x) / z <= th * FRAME.aspect * FRAME.h && Math.abs(y) / z <= th * FRAME.v;
}
function norm3(a: V3): V3 { const l = Math.hypot(a.x, a.y, a.z) || 1; return { x: a.x / l, y: a.y / l, z: a.z / l }; }

/** How close to the subject (units) a bush on the ray counts as hiding it. */
const COVER_NEAR = 0.9;

/** Does something solid stand between the eye and the point? Boxes the point stands in or on (a tower, a wall walk) are skipped. */
export function blockedBetween(eye: V3, p: V3, boxes: readonly Box[], ground: Ground): boolean {
  // (a subject standing on top of a box, on a tower or a wall walk, is not hidden by it; one in its footprint or beside a wall is)
  const up = p.y - ground(p.x, p.z);
  const own = boxes.filter(b => b.kind !== 'brush' && flatDist(p.x, p.z, b) <= 0.02 && up >= b.h - 0.4);
  const len = Math.hypot(p.x - eye.x, p.y - eye.y, p.z - eye.z) || 1;
  let under = 0;
  const buried = up < -0.05;   // (a figure below the surface, as a staged test can have, is not hidden by it)
  const N = 28;
  for (let i = 1; i < N; i++) {
    const t = i / N;
    // the last stretch beside the subject is not tested: a figure at a wall is seen against it, not through it
    const tail = (1 - t) * len < 0.35;
    const q = { x: eye.x + (p.x - eye.x) * t, y: eye.y + (p.y - eye.y) * t, z: eye.z + (p.z - eye.z) * t };
    // ground cover hides a figure only when it stands right in front of it, down to the figure's feet (the renderer moves a crew out of the brush; a bush far down the ray is not in the way)
    if ((1 - t) * len < COVER_NEAR) for (const b of boxes) if (b.kind === 'brush' && insideAny(q, b, ground, 0.04)) return true;
    if (tail) continue;
    // (a rise of the ground between the eye and the subject hides it too)
    // (a hill, not a lip: two samples in a row below the surface; a podium's edge or a kerb a hand high does not hide a chest)
    if (!buried && q.y < ground(q.x, q.z) - 0.03) { if (++under >= 2) return true; } else under = 0;
    // a hand's breadth and a half of margin: eaves, foundation courses, posts and rails stand proud of the box
    for (const b of boxes) if (b.kind !== 'brush' && !own.includes(b) && insideAny(q, b, ground, 0.2)) return true;
  }
  return false;
}

/** How tall (px, on a 720-line picture) a standing figure at `c` (its chest) looks from `eye` with a vertical field of view `fov`. */
export function figurePx(eye: V3, c: V3, fov: number, viewH = VIEW_H): number {
  const d = Math.hypot(c.x - eye.x, c.y - eye.y, c.z - eye.z) || 1e-3;
  return FIG_H * viewH / (2 * d * Math.tan(fov * Math.PI / 360));
}

/** The boxes that can matter to a camera at `eyes` and subjects at `pts` (a box well away from all of them cannot be touched by any ray the checks cast). */
function localBoxes(boxes: readonly Box[], pts: readonly V3[], pad: number): Box[] {
  if (boxes.length < 24) return boxes as Box[];
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const p of pts) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z); }
  return boxes.filter(b => b.x1 >= x0 - pad && b.x0 <= x1 + pad && b.z1 >= z0 - pad && b.z0 <= z1 + pad);
}

const LENS_COLS = Array.from({ length: 15 }, (_, i) => -0.95 + i * (1.9 / 14));
const LENS_ROWS = [-0.7, 0, 0.7];
/** A tree this close to the lens (units) is a trunk across the picture. */
const LENS_NEAR = 2.5;
/** Rays through the picture that may end on a tree or a hillside within LENS_FAR before the frame counts as filled by it. */
const LENS_FAR = 5;
const LENS_FILL = 0.34;

/**
 * What stands in the lens: a tree trunk or crown within 2.5 units, or trees and a rising hillside (more than 1.5 m above the ground
 * the camera stands on) within 5 units across a third of the picture. Casts a grid of rays through the picture; `trees` are the tree
 * boxes near the camera. Returns a message, or null.
 */
export function lensProblem(eye: V3, look: V3, fov: number, trees: readonly Box[], ground: Ground): string | null {
  const f = norm3(sub(look, eye));
  const r = norm3({ x: f.z, y: 0, z: -f.x });
  const u = { x: f.y * r.z - f.z * r.y, y: f.z * r.x - f.x * r.z, z: f.x * r.y - f.y * r.x };    // f x r: up
  const th = Math.tan(fov * Math.PI / 360), g0 = ground(eye.x, eye.z);
  let hit = 0, n = 0;
  for (const cx of LENS_COLS) for (const cy of LENS_ROWS) {
    n++;
    const dir = norm3({ x: f.x + r.x * cx * th * FRAME.aspect * FRAME.h + u.x * cy * th * FRAME.v, y: f.y + r.y * cx * th * FRAME.aspect * FRAME.h + u.y * cy * th * FRAME.v, z: f.z + r.z * cx * th * FRAME.aspect * FRAME.h + u.z * cy * th * FRAME.v });
    for (let t = 0.3; t <= LENS_FAR; t += 0.25) {
      const q = { x: eye.x + dir.x * t, y: eye.y + dir.y * t, z: eye.z + dir.z * t };
      const g = ground(q.x, q.z);
      if (t <= LENS_NEAR && trees.some(b => insideBox(q, b, ground, 0.1))) return 'a tree stands in the lens';
      if ((q.y < g && g - g0 > 0.25) || trees.some(b => insideBox(q, b, ground, 0))) { hit++; break; }
    }
  }
  return hit / n >= LENS_FILL ? 'trees or a hillside fill the picture' : null;
}

export interface ShotCtx { boxes: readonly Box[]; ground: Ground; /** Everyone alive, by id. */ actors: ReadonlyMap<string, Actor> }

/** The pose of a shot `t` seconds in. */
const poseOf = (s: Shot, t: number): { eye: V3; look: V3 } => {
  const k = Math.min(t, spanOf(s));
  return { eye: { x: s.eye.x + s.drift.x * k, y: s.eye.y, z: s.eye.z + s.drift.z * k }, look: { x: s.look.x + s.drift.x * k * 0.5, y: s.look.y, z: s.look.z + s.drift.z * k * 0.5 } };
};

/**
 * Everything wrong with a shot, or an empty list: the camera inside or hugging a building or wall (at the cut, mid-hold and
 * at the end of the drift), a solid within a metre dead ahead, the subjects too close or too far, out of the picture,
 * or behind a roof. Pure; the director only cuts to a shot that passes, and the tests run it over thousands.
 */
export function shotProblems(s: Shot, ctx: ShotCtx): string[] {
  const out: string[] = [];
  // (only the boxes near the camera and its subjects can matter: a forest of tree boxes costs nothing at the far end of the yard)
  const subs0 = (s.subjects ?? []).map(id => ctx.actors.get(id)).filter((a): a is Actor => !!a && !a.dead && !a.gone);
  const span = Math.min(s.hold, spanOf(s));
  const keyPts: V3[] = [poseOf(s, 0).eye, poseOf(s, span).eye, ...subs0.map(a => chestOf(a, ctx.ground))];
  const boxes = localBoxes(ctx.boxes, keyPts, LENS_FAR + 1);
  ctx = { ...ctx, boxes };
  const hold = Math.min(s.hold, spanOf(s));
  for (const t of [0, hold / 2, hold]) {
    const { eye, look } = poseOf(s, t);
    if (![eye.x, eye.y, eye.z, look.x, look.y, look.z].every(Number.isFinite)) { out.push('not finite'); break; }
    if (eye.y - ctx.ground(eye.x, eye.z) < EYE_MIN - 1e-6) out.push(`eye on the ground at t=${t.toFixed(1)}`);
    for (const b of ctx.boxes) if (nearBox(eye, b, ctx.ground, CLEAR)) { out.push(`eye ${insideBox(eye, b, ctx.ground) ? 'inside' : 'against'} a ${b.kind} at t=${t.toFixed(1)}`); break; }
    // dead ahead: nothing solid within VIEW_CLEAR (or before the look target, whichever is nearer)
    const f = norm3(sub(look, eye)), dist = Math.hypot(look.x - eye.x, look.y - eye.y, look.z - eye.z);
    for (const d of [0.1, 0.25, 0.5, 0.75, 1]) {
      const dd = d * Math.min(VIEW_CLEAR, dist * 0.9);
      const q = { x: eye.x + f.x * dd, y: eye.y + f.y * dd, z: eye.z + f.z * dd };
      if (ctx.boxes.some(b => insideBox(q, b, ctx.ground, 0.08))) { out.push(`a solid fills the view at t=${t.toFixed(1)}`); break; }
    }
  }
  const subs = (s.subjects ?? []).map(id => ctx.actors.get(id)).filter((a): a is Actor => !!a && !a.dead && !a.gone);
  if ((s.subjects?.length ?? 0) > 0 && !subs.length) out.push('no subject left alive in the shot');
  if (subs.length) {
    const need = Math.max(1, Math.ceil((s.need ?? 1) * subs.length - 0.5));
    // at the cut and at the end of the drift (a subject at the edge of the picture would slide out of it a second later and force a cut)
    for (const t of span > 0 ? [0, span] : [0]) {
      const { eye, look } = poseOf(s, t);
      let seen = 0, big = 0;
      for (const a of subs) {
        const c = chestOf(a, ctx.ground), d = Math.hypot(a.x - eye.x, a.z - eye.z);
        if (d < STANDOFF[s.kind] - 1e-6) out.push(`${s.kind} too close to ${a.id} (${d.toFixed(2)})`);
        if (d > REACH) continue;
        if (inFrame(eye, look, s.fov, c) && !blockedBetween(eye, c, ctx.boxes, ctx.ground)) { seen++; if (!s.minPx || figurePx(eye, c, s.fov) >= s.minPx) big++; }
      }
      if (seen < need) out.push(`only ${seen} of ${subs.length} subjects in frame (need ${need})`);
      else if (big < need) out.push(`only ${big} of ${subs.length} subjects at least ${Math.round(s.minPx ?? 0)} px tall (need ${need})`);
      if (out.length) break;
    }
  }
  // the lens: no tree trunk across it, no hillside or wall of trees filling it (last: the dearest check)
  if (!out.length) {
    const trees = boxes.filter(b => b.kind === 'tree');
    for (const t of [0, span / 2, span]) {
      const { eye, look } = poseOf(s, t);
      const lp = lensProblem(eye, look, s.fov, trees, ctx.ground);
      if (lp) { out.push(`${lp} at t=${t.toFixed(1)}`); break; }
    }
  }
  return out;
}

export interface PoseAudit {
  /** The kind of solid the eye is inside (never expected), or null. */
  inside: string | null;
  /** Plan distance from the eye to the nearest wall or roof it is low enough to meet. */
  nearest: number;
  /** Eye height above the ground. */
  aboveGround: number;
  /** How far ahead along the view axis the first solid stands (99 = clear to 8 units). */
  ahead: number;
  /** Live actors, those inside the picture, and those inside it with nothing solid in the way. */
  live: number; inPicture: number; visible: number;
  /** The tallest visible raider in the picture, in pixels on a 720-line picture (0 = none). */
  raiderPx: number;
}

/** A measurement of a camera pose against the world, independent of how the shot was chosen (the tests and the screenshot harness use it). */
export function auditPose(eye: V3, look: V3, fov: number, boxes: readonly Box[], actors: readonly Actor[], ground: Ground, viewH = VIEW_H): PoseAudit {
  let inside: string | null = null, nearest = 99;
  for (const b of boxes) {
    if (b.kind === 'brush') continue;   // (ground cover is not solid: a camera may stand in it)
    if (eye.y - ground(eye.x, eye.z) < b.h) nearest = Math.min(nearest, flatDist(eye.x, eye.z, b));
    if (insideBox(eye, b, ground)) inside = b.kind;
  }
  const f = norm3(sub(look, eye));
  let ahead = 99;
  for (let d = 0.05; d <= 8; d += 0.05) {
    const q = { x: eye.x + f.x * d, y: eye.y + f.y * d, z: eye.z + f.z * d };
    if (q.y - ground(q.x, q.z) < 0 || boxes.some(b => insideBox(q, b, ground))) { ahead = d; break; }
  }
  const live = actors.filter(a => !a.dead && !a.gone);
  let inPicture = 0, visible = 0, raiderPx = 0;
  for (const a of live) {
    const c = chestOf(a, ground);
    if (!inFrame(eye, look, fov, c)) continue;
    inPicture++;
    if (!blockedBetween(eye, c, boxes, ground)) { visible++; if (a.side === 'raider') raiderPx = Math.max(raiderPx, figurePx(eye, c, fov, viewH)); }
  }
  return { inside, nearest: Math.round(nearest * 100) / 100, aboveGround: Math.round((eye.y - ground(eye.x, eye.z)) * 100) / 100, ahead: Math.round(ahead * 100) / 100, live: live.length, inPicture, visible, raiderPx: Math.round(raiderPx) };
}

export class Director {
  shot: Shot | null = null;
  private readonly _r: () => number;
  private _cycle = 0;
  private _last = new Map<string, number>();
  private _boxes: readonly Box[] = [];
  private _lastCheck = -99;
  private _t = 0;
  private _g: Ground = () => 0;
  /** The lead-in (the approach, time-lapsed): the camera shows the raiders coming, whatever the caption says is out there. */
  leadIn = false;
  /** Night scene (the loved look: no pixel rule on the crew). Set by the player per scene. */
  night = false;
  /** The scene's index: each scene mirrors and varies its frames so two scenes never open on the same one. */
  variant = 0;
  /** The last few cuts (eye, look): a new cut that repeats one is passed over when another candidate is clean. */
  private _recent: Array<{ eye: V3; look: V3; fov: number }> = [];
  /** The frame each scene opened on (kept for the whole raid: a later scene never opens on one of them again). */
  private _openers: Array<{ eye: V3; look: V3; fov: number }> = [];
  /** Shots that needed the pixel rule relaxed (the crew was too far to be drawn that large from any clean angle). */
  softened = 0;
  /** Shots that could not be made clean (should stay 0; the tests and the harness read it). */
  fallbacks = 0;
  /** What the last few fallbacks looked like (QA). */
  fallbackLog: string[] = [];

  constructor(seed: number) { this._r = mulberry32(seed * 3119 + 11); }

  /** The buildings and walls the camera must keep out of. */
  setObstacles(boxes: readonly Box[]): void { this._boxes = boxes; }

  /**
   * The establishing shot for the lead-in, the gaps and the tails: from the yard, toward the road (or at `focus`), high enough
   * to read the ground, never against the house.
   */
  establish(time: number, house: V3, roadDir: { x: number; z: number }, ground: Ground, focus?: V3, variant = 0): Shot {
    const px = -roadDir.z, pz = roadDir.x;
    const target = focus ?? { x: house.x + roadDir.x * 12, y: 0, z: house.z + roadDir.z * 12 };
    const ctx: ShotCtx = { boxes: this._boxes, ground, actors: new Map() };
    const mk = (rot: number, k: number, hb: number): Shot => {
      // (each scene's establishing pose takes the other side of the road and another height, so two scenes never open on the same frame)
      const side = variant % 2 ? -1.6 : 1.6, reach = 4.2 + (variant % 3) * 0.8, lift = [0.9, 0.45, 1.3][variant % 3];
      const o = rotate({ x: roadDir.x * reach + px * side, z: roadDir.z * reach + pz * side }, rot, k);
      const ex = house.x + o.x, ez = house.z + o.z;
      return { kind: 'establish', since: time, hold: 99, fov: 54 - (variant % 2) * 6, eye: { x: ex, y: ground(ex, ez) + lift + hb, z: ez }, look: { x: target.x, y: ground(target.x, target.z) + 0.15, z: target.z }, drift: { x: -px * 0.03, y: 0, z: -pz * 0.03 } };
    };
    const s = this._search(mk, ctx) ?? mk(0, 1, 2);
    this.shot = s;
    this._recent.push({ eye: s.eye, look: s.look, fov: s.fov });
    if (this._recent.length > 6) this._recent.shift();
    return s;
  }

  /** Standing inside a building's walls (not on top of it, not on its porch). */
  private _indoors(a: Actor, _ground: Ground): boolean {
    return this._boxes.some(b => b.kind !== 'tree' && flatDist(a.x, a.z, b) <= 0.02 && a.y < b.h - 0.4 - 0.17 && b.h > 0.5);
  }

  /** Pick the shot for `time`. `fresh` are the events applied since the last call. */
  update(time: number, actors: Actor[], fresh: BattleEvent[], house: V3, ground: Ground): Shot {
    // someone inside a building cannot be shown: the camera picks from those out of doors
    const live = actors.filter(a => !a.dead && !a.gone && !this._indoors(a, ground));
    const home = live.filter(a => a.side === 'home'), raiders = live.filter(a => a.side === 'raider');
    const hc = home.length ? centroid(home) : house, rc = raiders.length ? centroid(raiders) : { x: house.x, y: 0, z: house.z + 20 };
    const road = (() => { const d = sub(rc, house); const l = len2(d); return { x: d.x / l, z: d.z / l }; })();
    const byId = new Map(actors.map(a => [a.id, a]));
    // something happened that the camera should see
    let want: { kind: ShotKind; subject?: string; hold: number } | null = null;
    for (const e of fresh) {
      if ((e.kind === 'wound' && !e.stopped) || e.kind === 'death' || e.kind === 'aid') { const u = byId.get(e.unit); if (u && (u.side === 'home' || this._r() < 0.5)) want = { kind: 'close', subject: e.unit, hold: 3.6 }; }
      else if (e.kind === 'breach' || e.kind === 'fallback' || e.kind === 'explosion' || e.kind === 'mine') want = { kind: 'wide', hold: 4.2 };
      else if (e.kind === 'alarm' && !this.shot) want = { kind: 'house', hold: 5 };
      else if (e.kind === 'say' && e.who && !want) {
        const u = byId.get(e.who); const lastSaid = this._last.get(e.who) ?? -99;
        if (u && !u.dead && !u.gone && time - lastSaid > 9 && (this.shot?.subject !== e.who)) { want = { kind: 'close', subject: e.who, hold: 3.4 }; this._last.set(e.who, time); }
      }
    }
    const cur = this.shot;
    // the same cut twice running (a second close-up of the same person, a second wide) is no cut at all
    if (want && cur && want.kind === cur.kind && want.subject === cur.subject) want = null;
    // the operator pans after the unit the shot is about (the eye stays where it was cut)
    if (cur?.track) {
      const a = byId.get(cur.track);
      if (a && !a.dead && !a.gone) {
        const c = chestOf(a, ground), k = Math.min(1, Math.max(0, time - this._t) * 3);
        cur.look = { x: cur.look.x + (c.x - cur.look.x) * k, y: cur.look.y + (c.y - cur.look.y) * k, z: cur.look.z + (c.z - cur.look.z) * k };
      }
    }
    this._t = time;
    const held = cur ? time - cur.since : 99;
    let due = !cur || held >= cur.hold || (cur.kind === 'close' && cur.subject !== undefined && (byId.get(cur.subject)?.gone || false));
    // the subject walked behind a wall or out of the picture: cut early
    if (!due && cur && held >= 1.2 && time - this._lastCheck >= 0.5) {
      this._lastCheck = time;
      const ctx: ShotCtx = { boxes: this._boxes, ground, actors: new Map(live.map(a => [a.id, a])) };
      const now: Shot = { ...cur, since: 0, hold: 0, drift: { x: 0, y: 0, z: 0 }, ...poseAt(cur, time), minPx: cur.minPx ? cur.minPx * 0.5 : undefined };
      if (cur.subjects?.length && shotProblems(now, ctx).length) due = true;   // (a subject that fell or left counts: nobody left to show)
    }
    if (want && (!cur || held >= MIN_HOLD || (want.kind === 'wide' && held >= 2))) return this._cut(time, want.kind, want.subject, want.hold, home, raiders, hc, rc, road, house, ground);
    if (due) {
      // next in the rotation that has something to show
      const order = this.leadIn && raiders.length ? LEAD_ORDER : ORDER;
      for (let k = 0; k < order.length; k++) {
        const kind = order[(this._cycle + k) % order.length];
        if (kind === cur?.kind) continue;
        if ((kind === 'wall' && !home.length) || ((kind === 'raiders' || kind === 'gate') && !raiders.length) || (kind === 'house' && !home.length)) continue;
        this._cycle = (this._cycle + k + 1) % order.length;
        return this._cut(time, kind, undefined, this.leadIn ? LEAD_HOLD + this._r() * 0.6 : 5 + this._r() * 4, home, raiders, hc, rc, road, house, ground);
      }
    }
    return cur ?? this._cut(time, 'wide', undefined, 6, home, raiders, hc, rc, road, house, ground);
  }

  /**
   * Try the shot as designed, then the same shot swung round its subject, then pulled back, then raised, and take the first that
   * passes. When nothing does, the least bad is used and `fallbacks` counts it.
   */
  private _search(mk: (rot: number, k: number, hb: number) => Shot, ctx: ShotCtx, strict = false, freshOnly = false): Shot | null {
    let best: Shot | null = null, bestN = Infinity;
    const swing = this.variant % 2 ? SWING.map(a => (a === Math.PI ? a : -a)) : SWING;
    // 1 the whole group in frame, a different frame from the last cuts; 2 the same, repeats allowed; 3 only the one the shot is about
    // (when the crowd cannot all be framed); then the same with the pixel rule at half and at nothing (the crew cannot be drawn that large)
    const P = (relax: boolean, px: number, fresh: boolean, trees = true) => ({ relax, px, fresh, trees });
    const passes = [
      P(false, 1, true), P(false, 1, false), P(true, 1, false), P(false, 0.55, false), P(true, 0.55, false), P(false, 0, false), P(true, 0, false),
      // a forest lot: when no angle is clear of the trees, the trees stop counting (trunks may stand in the lens, crowns may hide a figure)
      P(false, 1, false, false), P(true, 1, false, false), P(false, 0.55, false, false), P(true, 0.55, false, false), P(false, 0, false, false), P(true, 0, false, false),
    ];
    const bare: ShotCtx = { ...ctx, boxes: ctx.boxes.filter(b => b.kind !== 'tree' && b.kind !== 'brush') };
    for (const pass of freshOnly ? passes.slice(0, 1) : passes) {
      const c = pass.trees ? ctx : bare;
      if (!pass.trees && (strict || bare.boxes.length === ctx.boxes.length)) break;   // (no trees to drop: the same passes again; a strict search tries the next candidate subject first)
      for (const hb of [0, 0.3, 0.8, 1.6, 2.6]) for (const k of [1, 1.4, 2, 2.8]) for (const rot of swing) {
        const s = mk(rot, k, hb);
        if (pass.px < 1) { if (!s.minPx) continue; s.minPx = pass.px > 0 ? s.minPx * pass.px : undefined; }
        if (pass.relax) { if ((s.subjects?.length ?? 0) < 2) continue; s.need = 0; }
        if (pass.fresh && this._repeats(s)) continue;
        const n = shotProblems(s, c).length;
        if (n === 0) { if (pass.px < 1 || !pass.trees) this.softened++; return s; }
        if (n < bestN) { best = s; bestN = n; }
      }
    }
    if (strict) return null;
    this.fallbacks++;
    if (best) this.fallbackLog.push(`${best.kind}@${best.since.toFixed(1)}: ${shotProblems(best, ctx).join('; ')}`.slice(0, 300));
    return best;
  }

  /** Is the shot nearly the same frame as one of the last few cuts (the eye within a few metres, looking the same way)? */
  private _repeats(s: Shot): boolean {
    const yaw = (e: V3, l: V3) => Math.atan2(l.x - e.x, l.z - e.z);
    return [...this._recent, ...this._openers].some(r => Math.abs(r.fov - s.fov) < 3 && Math.hypot(r.eye.x - s.eye.x, r.eye.z - s.eye.z) < 1.8 && Math.abs(Math.atan2(Math.sin(yaw(r.eye, r.look) - yaw(s.eye, s.look)), Math.cos(yaw(r.eye, r.look) - yaw(s.eye, s.look)))) < 0.45);
  }

  private _cut(time: number, kind: ShotKind, subject: string | undefined, hold: number, home: Actor[], raiders: Actor[], hc: V3, rc: V3, road: { x: number; z: number }, house: V3, ground: Ground): Shot {
    const px = -road.z, pz = road.x, r = this._r;
    this._g = ground;
    const everyone = [...home, ...raiders];
    const ctx: ShotCtx = { boxes: this._boxes, ground, actors: new Map(everyone.map(a => [a.id, a])) };
    const at = (x: number, z: number, h: number): V3 => ({ x, y: ground(x, z) + h, z });
    const chest = (a: Actor): V3 => chestOf(a, ground);
    const base = { since: time, hold };
    if (kind === 'close' && subject) {
      const u = everyone.find(a => a.id === subject);
      if (u) {
        const side = u.side === 'home' ? 1 : -1;
        const dir = norm3({ x: -road.x * 0.4 * side + px * 0.42, y: 0, z: -road.z * 0.4 * side + pz * 0.42 });
        const c = chest(u);
        return this._set(this._search((rot, k, hb) => {
          const o = rotate({ x: dir.x * 0.95, z: dir.z * 0.95 }, rot, k);
          return { ...base, kind: 'close', subject, subjects: [subject], track: subject, need: 1, eye: at(u.x + o.x, u.z + o.z, u.y + 0.2 + hb), look: c, fov: 38, drift: { x: road.x * 0.02, y: 0, z: road.z * 0.02 } };
        }, ctx));
      }
      kind = 'wall';
    }
    if (kind === 'wall' && home.length) {
      const posted = home.filter(h => h.post && h.post !== 'open');
      const pool = posted.length ? posted : home;
      const first = Math.floor(r() * pool.length);
      // the defender the shot is about: the one drawn, or (when no angle shows that one) the next, and so on
      let shot: Shot | null = null;
      for (let i = 0; i < Math.min(pool.length, 5) && !shot; i++) {
        const u = pool[(first + i) % pool.length];
        shot = this._search(this._wallShot(u, raiders, road, base, at), ctx, true);
      }
      // (defenders huddled against a wall of the house leave no clean over-the-shoulder angle: show the yard from a step back instead of a bad frame)
      if (shot) return this._set(shot);
      kind = 'house';
    }
    if (kind === 'raiders' && raiders.length) {
      // from the side of the approach, low: the crew coming on with the compound beyond
      const front = raiders.reduce((a, b) => (Math.hypot(b.x - house.x, b.z - house.z) < Math.hypot(a.x - house.x, a.z - house.z) ? b : a));
      const crew = raiders.filter(a => Math.hypot(a.x - front.x, a.z - front.z) < 5).slice(0, 6);
      const look = at(front.x - road.x * 0.8, front.z - road.z * 0.8, front.y + CHEST);
      return this._set(this._search((rot, k, hb) => {
        const o = rotate({ x: road.x * 1.6 + px * 1.5, z: road.z * 1.6 + pz * 1.5 }, rot, k);
        return { ...base, kind: 'raiders', subject: front.id, track: front.id, subjects: crew.map(a => a.id), need: 0.6, minPx: this.night ? undefined : DAY_PX.raiders, eye: at(front.x + o.x, front.z + o.z, 0.5 + hb), look, fov: 56, drift: { x: -px * 0.03, y: 0, z: -pz * 0.03 } };
      }, ctx));
    }
    if (kind === 'gate' && raiders.length) {
      // low, on the defenders' side of the gate, looking out at the crew against the sky: silhouettes, lanterns, the road beyond
      const front = raiders.reduce((a, b) => (Math.hypot(b.x - house.x, b.z - house.z) < Math.hypot(a.x - house.x, a.z - house.z) ? b : a));
      const crew = raiders.filter(a => Math.hypot(a.x - front.x, a.z - front.z) < 5).slice(0, 6);
      const cc = centroid(crew);
      const look = at(cc.x, cc.z, cc.y + 0.2);
      return this._set(this._search((rot, k, hb) => {
        const o = rotate({ x: -road.x * 1.7 + px * 0.55, z: -road.z * 1.7 + pz * 0.55 }, rot, k);
        return { ...base, kind: 'gate', subject: front.id, subjects: crew.map(a => a.id), need: 0.5, minPx: this.night ? undefined : DAY_PX.gate, eye: at(cc.x + o.x, cc.z + o.z, 0.15 + hb * 0.6), look, fov: 46, drift: { x: road.x * 0.03, y: 0, z: road.z * 0.03 } };
      }, ctx));
    }
    if (kind === 'house' && home.length) {
      // the yard in front of the door: who falls back, who runs the kids inside
      const lead = home.reduce((a, b) => (Math.hypot(b.x - house.x, b.z - house.z) < Math.hypot(a.x - house.x, a.z - house.z) ? b : a));
      const who = home.filter(a => Math.hypot(a.x - lead.x, a.z - lead.z) < 3).slice(0, 6);
      const c = centroid(who);
      const look = at(c.x, c.z, 0.2);
      return this._set(this._search((rot, k, hb) => {
        const o = rotate({ x: road.x * 2.6 + px * 0.9, z: road.z * 2.6 + pz * 0.9 }, rot, k);
        return { ...base, kind: 'house', subjects: who.map(a => a.id), need: 0.7, eye: at(c.x + o.x, c.z + o.z, 0.35 + hb), look, fov: 58, drift: { x: -road.x * 0.025, y: 0, z: -road.z * 0.025 } };
      }, ctx));
    }
    // the daylight lead-in, and a fight still far from the house: the crew itself is the picture (a field of specks tells nothing),
    // from beyond them looking back at the compound, from the flank, or from the house side coming on; each scene takes the next style
    // and the other side
    if (kind === 'wide' && !this.night && raiders.length && (this.leadIn || Math.hypot(rc.x - hc.x, rc.z - hc.z) > 9)) {
      const cc = centroid(raiders);
      const crew = raiders.filter(a => Math.hypot(a.x - cc.x, a.z - cc.z) < 7).slice(0, 8);
      const mkStyle = (style: number, flip: number) => {
        const off = style === 0 ? { x: road.x * 5.5 + px * 3 * flip, z: road.z * 5.5 + pz * 3 * flip }
          : style === 1 ? { x: -road.x * 1 + px * 8.5 * flip, z: -road.z * 1 + pz * 8.5 * flip }
          : { x: -road.x * 9 + px * 2.5 * flip, z: -road.z * 9 + pz * 2.5 * flip };
        const aim = style === 0 ? { x: cc.x - road.x * 9, z: cc.z - road.z * 9 } : style === 1 ? { x: cc.x - road.x * 2, z: cc.z - road.z * 2 } : { x: cc.x + road.x * 0.5, z: cc.z + road.z * 0.5 };
        const look = at(aim.x, aim.z, 0.3);
        return (rot: number, k: number, hb: number): Shot => {
          const o = rotate(off, rot, k);
          return { ...base, kind: 'wide', subjects: crew.map(a => a.id), need: 0.6, minPx: DAY_PX.wide, eye: at(cc.x + o.x, cc.z + o.z, 0.5 + hb * 0.7), look, fov: (style === 1 ? 40 : 44) + [0, -4, 3][this.variant % 3], drift: { x: px * 0.04 * flip, y: 0, z: pz * 0.04 * flip } };
        };
      };
      // this scene's style and side first; when every angle of it repeats an earlier frame, the next style, then the other side
      const side = (i: number) => ((this.variant + Math.floor(i / 3)) % 2 ? -1 : 1);
      for (let i = 0; i < 6; i++) {
        const shot = this._search(mkStyle((this.variant + i) % 3, side(i)), ctx, true, true);
        if (shot) return this._set(shot);
      }
      return this._set(this._search(mkStyle(this.variant % 3, side(0)), ctx));
    }
    // wide: up behind the house, the whole fight in frame
    const mid = { x: (hc.x + rc.x) / 2, z: (hc.z + rc.z) / 2 };
    const span = Math.hypot(rc.x - hc.x, rc.z - hc.z);
    // (in the lead-in the camera sits lower and nearer, so the crew coming on stands against the horizon instead of being a speck on a field seen from above)
    const back = this.leadIn ? 2 + Math.min(6, span * 0.18) : 2.4 + Math.min(10, span * 0.25);
    const height = this.leadIn ? 0.6 + Math.min(1.4, span * 0.04) : 1.0 + Math.min(2.8, span * 0.07);
    const look = at(mid.x, mid.z, 0.3);
    const subjects = everyone.filter(a => Math.hypot(a.x - mid.x, a.z - mid.z) < span / 2 + 6).map(a => a.id);
    return this._set(this._search((rot, k, hb) => {
      const o = rotate({ x: -road.x * back + px * 1.5, z: -road.z * back + pz * 1.5 }, rot, k);
      return { ...base, kind: 'wide', subjects, need: 0.5, eye: at(hc.x + o.x, hc.z + o.z, height + hb), look, fov: 52, drift: { x: px * 0.04, y: 0, z: pz * 0.04 } };
    }, ctx));
  }

  /** A wall shot over a defender's shoulder toward the nearest raider, as a candidate maker for `_search`. */
  private _wallShot(u: Actor, raiders: Actor[], road: { x: number; z: number }, base: { since: number; hold: number }, at: (x: number, z: number, h: number) => V3): (rot: number, k: number, hb: number) => Shot {
    const px = -road.z, pz = road.x;
    const near = raiders.length ? raiders.reduce((a, b) => (Math.hypot(b.x - u.x, b.z - u.z) < Math.hypot(a.x - u.x, a.z - u.z) ? b : a)) : null;
    const dx = near ? near.x - u.x : road.x, dz = near ? near.z - u.z : road.z, l = len2({ x: dx, z: dz });
    const tower = u.post === 'tower';
    // the defender in the shoulder of the frame, the threat beyond: a metre behind and a little to the side
    const look = near ? { x: near.x, y: this._g(near.x, near.z) + near.y + (tower ? 0.2 : 0.17), z: near.z } : at(u.x + road.x * 14, u.z + road.z * 14, tower ? 0.2 : 0.17);
    return (rot, k, hb) => {
      const o = rotate({ x: -dx / l * 1.0 + px * 0.25, z: -dz / l * 1.0 + pz * 0.25 }, rot, k);
      return { ...base, kind: 'wall', subject: u.id, subjects: [u.id], need: 1, eye: at(u.x + o.x, u.z + o.z, u.y + 0.27 + (tower ? 0.1 : 0) + hb), look, fov: 50, drift: { x: px * 0.03, y: 0, z: pz * 0.03 } };
    };
  }

  private _set(s: Shot | null): Shot {
    if (!s) throw new Error('no shot');
    if (this.shot === null) this._openers.push({ eye: s.eye, look: s.look, fov: s.fov });
    this.shot = s;
    this._recent.push({ eye: s.eye, look: s.look, fov: s.fov });
    if (this._recent.length > 6) this._recent.shift();
    return s;
  }
}

/** Swings tried round the subject, nearest the designed angle first (radians). */
/** By day the crew must be drawn at least this tall (px on a 720-line picture) in the shots about it: a speck is not a raid. */
const DAY_PX = { raiders: 26, gate: 24, wide: 24 };

const SWING = [0, 0.45, -0.45, 0.95, -0.95, 1.6, -1.6, 2.3, -2.3, Math.PI];
const rotate = (o: { x: number; z: number }, a: number, k: number): { x: number; z: number } => ({ x: (o.x * Math.cos(a) - o.z * Math.sin(a)) * k, z: (o.x * Math.sin(a) + o.z * Math.cos(a)) * k });

/** The eye and look of a shot `t` seconds in (it drifts slowly). */
export function poseAt(s: Shot, time: number): { eye: V3; look: V3; fov: number } {
  const t = Math.min(time - s.since, spanOf(s));
  return {
    eye: { x: s.eye.x + s.drift.x * t, y: s.eye.y, z: s.eye.z + s.drift.z * t },
    look: { x: s.look.x + s.drift.x * t * 0.5, y: s.look.y, z: s.look.z + s.drift.z * t * 0.5 },
    fov: s.fov,
  };
}
