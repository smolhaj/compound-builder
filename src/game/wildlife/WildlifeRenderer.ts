/**
 * WildlifeRenderer — the native wildlife of the land (sim/wildlife.ts) as modelled procedural animals
 * (docs/DECISIONS.md, "Realistic wildlife and dogs"): deer (antlers grow with the season), elk, moose, pronghorn, javelina, turkeys, rabbits,
 * squirrels, grouse, ducks and geese, bears, cougars, wolves and coyotes. Each species is one lofted, skinned model (game/wildlife/models,
 * game/livestock/animalKit) drawn as one InstancedMesh per (model, level of detail) in use; the walk, the head up, the graze, the peck and the
 * flee are all posed in the vertex shader from per-instance numbers, the coats painted in the fragment shader. No shadow-map casters, no SSAO.
 * The animals follow the sim's count and the hour (deer out at dawn and dusk, predators at night);
 * where each stands and what it does is wildlifeAI (graze, wander, lift the head, bolt from people
 * and dogs). Sizes are SCALE v2: a person is 0.28, a deer 0.17 at the shoulder.
 */
import * as THREE from 'three';
import { SPECIES, count, wildlifeView, type SpeciesId } from '../../sim/wildlife';
import { ownedRects } from '../../sim/enclosure';
import type { Rect } from '../../sim/land';
import { calendarOf, dayIndex, hourOf, type GameState } from '../../sim/state';
import { stepBeast, type Beast, type StepCtx } from './wildlifeAI';
import { CROSS_PER_S, deckFrom, planCross, type Bridge } from './wildlifeCrossing';
import { crossingDeck, onRoad, planRoadCrossings, ROAD_CROSSERS, stillDue, type RoadCross } from './roadCrossing';
import { animalRoute } from '../paths/groundMovers';
import { crossesHard } from '../paths/walkRoute';
import { AnimalBatches } from '../livestock/animalBatches';
import { type Quality } from '../livestock/LivestockRenderer';
import { wildModelOf } from './wildModels';
import { antlerGrowth } from './models/hoofed';
import { drawPlan } from './wildlifeLook';

const CAP = 120;

export interface WildlifeCtx {
  ground: (x: number, z: number) => number;
  /** A building, the camp, a gate: animals keep off it. */
  blocked: (x: number, z: number) => boolean;
  /** The creek through the place, if any. */
  creek: { zAt: (x: number) => number; halfWidth: number; waterY: (x: number) => number } | null;
  /** What this species cannot cross on foot: a wall, a building, the creek, ground steeper than it climbs (game/paths/groundMovers CLIMB). Absent: nothing. */
  hard?: (x: number, z: number, sp: SpeciesId) => boolean;
  /** Where people and dogs are (animals bolt from them). */
  threats: ReadonlyArray<readonly [number, number]>;
  /** Tunnel-bridges animals may cross while `bridgesOpen` (doors open by day; game/wildlife/wildlifeCrossing). */
  bridges?: readonly Bridge[];
  bridgesOpen?: boolean;
  /** The county road past the gate: animals cross it at dawn and dusk (game/wildlife/roadCrossing). `y` is the surface; `halfW` half the carriageway; `gateZ` where along it. */
  road?: { x(z: number): number; y(x: number, z: number): number; halfW: number; gateZ: number };
  /** Camera position: animals farther than DRAW_RANGE are not drawn (a deer is 0.17 tall: a speck past that); `y` picks the level of detail. */
  cam?: { x: number; z: number; y?: number };
  /** Day of the year (1..365) as the seasons draw it: the winter coat, the antlers. Absent: the game clock's. */
  doy?: number;
}

/** World units beyond which an animal is not put in the instance buffers. */
export const DRAW_RANGE = 90;

function hashRnd(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}

export class WildlifeRenderer {
  private readonly _batches: AnimalBatches;
  private _region = 'plains';
  private _doy = 180;
  private readonly _beasts = new Map<string, Beast>();
  private _rects: Rect[] = [];
  private _rnd = hashRnd(0x51ed);
  private _viewKey = '';
  private _viewAt = -99;
  private _time = 0;
  private _seed = -1;
  /** Routes still to be searched this frame (a search is the costly part; the rest wait a moment and graze). */
  private _budget = 0;
  /** The day's road crossings and which have started (by id). */
  private _plan: { key: string; list: RoadCross[]; done: Set<string> } = { key: '', list: [], done: new Set() };
  private _roadHalf = 0.5;

  constructor(scene: THREE.Scene) { this._batches = new AnimalBatches(scene, CAP, 'wildlife', wildModelOf); }

  /** The draw detail tier (the meshes are rebuilt lazily at the next draw when it changes). */
  setQuality(q: Quality): void { this._batches.setQuality(q); }
  /** Draw calls of the animals drawn now (QA / tests). */
  drawCalls(): number { return this._batches.drawCalls(); }

  /** The animals that exist now (QA / camera): id, species, position, mood. */
  animals(): Array<{ id: string; sp: SpeciesId; x: number; z: number; mood: string; vis: number }> {
    return [...this._beasts.values()].map(b => ({ id: b.id, sp: b.sp, x: b.x, z: b.z, mood: b.mood, vis: b.vis }));
  }
  /** Where the animals on (or heading for) a bridge are: they swing the day-open doors the way a keyholder does. */
  crossers(): Array<[number, number]> {
    const out: Array<[number, number]> = [];
    for (const b of this._beasts.values()) if (b.deck || b.cross) out.push([b.x, b.z]);
    return out;
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
      if (c.hard && c.hard(x, z, b.sp)) return false;
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
    this._region = game.site.region;
    this._doy = c.doy ?? calendarOf(game.clock).doy;
    if (game.seed !== this._seed) { this._seed = game.seed; this._beasts.clear(); this._viewKey = ''; }
    this._rects = ownedRects(game);
    const hour = hourOf(clock);
    // who should be out: recomputed twice a real second at most and when the hour turns
    const key = `${Math.floor(hour * 2)}|${game.perimeter.filter(r => r.finishedAt !== null).length}|${game.gate.pending ? 1 : 0}|${Math.floor(game.wild.abundance.big * 40)}|${Math.floor(game.wild.abundance.small * 40)}|${this._rects.length}|${game.site.region}|${game.wildlife ? Object.keys(game.wildlife.gone).length : 0}`;
    if (key !== this._viewKey && this._time - this._viewAt > 0.5) {
      this._viewKey = key; this._viewAt = this._time;
      const want = new Map(wildlifeView(game, hour).slice(0, CAP).map(v => [v.id, v]));
      for (const [id, b] of this._beasts) if (!want.has(id) && !id.startsWith('qa:') && !id.startsWith('road:')) b.want = false;
      for (const [id, v] of want) {
        const have = this._beasts.get(id);
        if (have) { have.want = true; if (have.side !== v.side) { have.side = v.side; this._relocate(have, c); } continue; }
        if (this._beasts.size >= CAP) break;
        const b = this._spawn(id, v.sp, v.side, v.group, v.male, c);
        if (b) this._beasts.set(id, b);
      }
    }
    this._roadCrossings(game, clock, hour, c);
    // step everyone
    this._budget = 3;
    const ctx: StepCtx = {
      threats: c.threats, allowed: this._allowed(c), rnd: this._rnd, speedK,
      // round a wall, a cliff or a building the way a person goes (the same search), never over it
      route: c.hard ? (b, tx, tz) => {
        const h = (x: number, z: number) => c.hard!(x, z, b.sp);
        if (b.sp === 'waterfowl' || !crossesHard(h, [b.x, b.z], [tx, tz], 0.05, 0.25)) return [];
        if (this._budget <= 0) return null;
        this._budget--;
        return animalRoute([b.x, b.z], [tx, tz], h);
      } : undefined,
    };
    for (const [id, b] of this._beasts) {
      this._bridge(b, dt, c, ctx);
      // an animal the wall now keeps out (or in) is somewhere else: put it where it belongs (not one on a deck)
      if (b.id.startsWith('road:') && !b.deck) b.want = false;        // across and off the far verge: it fades into the cover
      if (!b.deck && !b.id.startsWith('qa:') && !b.id.startsWith('road:') && !ctx.allowed(b.x, b.z, b) && b.sp !== 'waterfowl') this._relocate(b, c);
      stepBeast(b, dt, ctx);
      if (!b.want && b.vis < 0.02) this._beasts.delete(id);
    }
    this._draw(c);
  }

  /** Where the animals that are on the county road (or its shoulder) are, along it: vehicles stop for them (game/RoadTraffic). */
  roadCrossers(): Array<{ z: number }> {
    const out: Array<{ z: number }> = [];
    for (const b of this._beasts.values()) if (b.id.startsWith('road:') && b.deck && b.vis > 0.5 && this._roadX && onRoad(b.x - this._roadX(b.z), this._roadHalf)) out.push({ z: b.z });
    return out;
  }
  private _roadX: ((z: number) => number) | null = null;
  private _road: WildlifeCtx['road'] | null = null;
  /** QA shots: a file of `n` animals steps out now and crosses the road at world z (the last update's road). Returns false without a road. */
  qaCross(sp: SpeciesId, n: number, z: number, dir: 1 | -1 = 1): boolean {
    const road = this._road;
    if (!road) return false;
    const ev: RoadCross = { id: `qa${this._beasts.size}`, sp, at: 0, z, dir, n };
    this._launch(ev, 7, 0);
    return true;
  }

  /** The day's crossings: when one is due, a file of animals steps out of the cover on one side and walks across the road (they use the bridge-deck walker). */
  private _roadCrossings(game: GameState, clock: number, hour: number, c: WildlifeCtx): void {
    const road = c.road;
    if (!road) { this._roadX = null; return; }
    this._roadX = road.x; this._roadHalf = road.halfW; this._road = road;
    const day = dayIndex(clock), key = `${game.seed}|${day}|${Math.round(road.gateZ)}`;
    if (this._plan.key !== key) {
      const herds = [...ROAD_CROSSERS].map(sp => ({ sp, n: count(game, sp) }));
      this._plan = { key, list: planRoadCrossings(game.seed, day, herds, road.gateZ), done: new Set() };
    }
    for (const ev of this._plan.list) {
      if (this._plan.done.has(ev.id) || hour < ev.at) continue;
      this._plan.done.add(ev.id);
      if (!stillDue(ev, hour)) continue;
      this._launch(ev, game.seed, day);
    }
  }

  private _launch(ev: RoadCross, seed: number, day: number): void {
    const road = this._road;
    if (!road) return;
    const sd = SPECIES[ev.sp], r = hashRnd(Math.imul(seed + 3, 40503) ^ Math.imul(day + 1, 2654435761) ^ ev.z * 1000);
    for (let i = 0; i < ev.n; i++) {
      const deck = crossingDeck(road.x, road.y, road.halfW, ev, i);
      const [x, z, y] = deck[0];
      const id = `road:${ev.id}:${i}`;
      // (a file: the buck last)
      this._beasts.set(id, { id, sp: ev.sp, x, z, rot: Math.atan2(deck[1][0] - x, deck[1][1] - z), hx: x, hz: z, tx: x, tz: z, mood: 'walk', t: 99, phase: r() * 6, vis: 0.6, want: true, head: 0.2, v: 0, male: sd.kind === 'hoofed' && i === ev.n - 1, side: 'free', group: 99, k: r(), deck: deck.slice(1), y });
    }
  }

  /** Think of a bridge: a grazing crosser near an open bridge's mouth now and then walks to it; at the mouth it steps onto the deck. */
  private _bridge(b: Beast, dt: number, c: WildlifeCtx, ctx: StepCtx): void {
    if (b.deck || !c.bridges?.length) { if (!c.bridges?.length) b.cross = undefined; return; }
    if (b.cross) {
      if (!c.bridgesOpen || b.mood === 'flee') { b.cross = undefined; return; }
      const br = c.bridges.find(x => x.id === b.cross!.bridge);
      if (!br) { b.cross = undefined; return; }
      if (Math.hypot(b.x - b.cross.mouth[0], b.z - b.cross.mouth[1]) < 0.3) { b.deck = deckFrom(br, b.cross.from, c.ground); b.y = c.ground(b.x, b.z); b.cross = undefined; }
      return;
    }
    if (b.mood !== 'graze' || b.side === 'in' || this._rnd() > CROSS_PER_S * dt) return;
    const plan = planCross(b.sp, b.x, b.z, c.bridges, !!c.bridgesOpen);
    if (!plan) return;
    b.cross = { mouth: plan.mouth, bridge: plan.bridge.id, from: plan.from };
    b.tx = plan.mouth[0]; b.tz = plan.mouth[1]; b.mood = 'walk'; b.t = 30; b.via = undefined; b.viaFor = undefined;
    void ctx;
  }

  private _relocate(b: Beast, c: WildlifeCtx): void {
    const nb = this._spawn(b.id, b.sp, b.side, b.group, b.male, c);
    if (nb) { b.x = b.hx = b.tx = nb.x; b.z = b.hz = b.tz = nb.z; b.vis = 0; }
  }

  private _draw(c: WildlifeCtx): void {
    const B = this._batches, tier = B.tier(), cam = c.cam;
    B.begin();
    // nearest first: at the Low tier only the first few animals are drawn
    const order = [...this._beasts.values()];
    if (cam) order.sort((a, b) => Math.abs(a.x - cam.x) + Math.abs(a.z - cam.z) - Math.abs(b.x - cam.x) - Math.abs(b.z - cam.z));
    for (const b of order) {
      if (b.vis < 0.02) continue;
      if (cam && Math.abs(b.x - cam.x) + Math.abs(b.z - cam.z) > DRAW_RANGE * 1.42) continue;
      let gy = b.y ?? c.ground(b.x, b.z);
      const wet = b.sp === 'waterfowl' && c.creek && Math.abs(b.z - c.creek.zAt(b.x)) < c.creek.halfWidth;
      if (wet) gy = Math.max(gy, c.creek!.waterY(b.x)) - 0.004;
      const d = cam ? Math.hypot(b.x - cam.x, gy - (cam.y ?? gy + 8), b.z - cam.z) : 0, li = d < tier.at[0] ? 0 : d < tier.at[1] ? 1 : 2;
      const p = drawPlan(b, this._region, this._doy, antlerGrowth(this._doy), wet ? 1 : 0);
      B.put({
        id: p.model, breed: p.breed, x: b.x, y: gy - (wet ? 0.012 : 0), z: b.z, rot: b.rot, phase: b.phase, gait: p.gait, graze: p.graze, seed: b.k, tone: b.k,
        size: b.vis * p.size, adorn: p.adorn, alert: p.alert, li,
        nx: (c.ground(b.x - 0.05, b.z) - c.ground(b.x + 0.05, b.z)) / 0.1, nz: (c.ground(b.x, b.z - 0.05) - c.ground(b.x, b.z + 0.05)) / 0.1,
      });
    }
    B.flush(this._time);
  }

  dispose(): void { this._batches.dispose(); }
}
