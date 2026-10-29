/**
 * The path layer of the world: keeps the network (pathNet.ts) current with
 * the game, draws it (PathRenderer), answers what is underfoot at a point
 * (the people renderer's walking pace) and the way along the paths between
 * two points (so the family keeps to them and off the walls), and tells the
 * menu what the walks are. Work is throttled and cached: routes are found
 * again only when the layout changes, wear every few days of game time.
 */
import type * as THREE from 'three';
import type { Quality } from '../../engine/world/WorldScene';
import type { Pt } from '../../sim/pathRoute';
import { PATH_WIDTH, pathsOf, type PathExtras, type PathSurface } from '../../sim/paths';
import type { GameState } from '../../sim/state';
import { newNetCache, planNetwork, routeVia, summarize, surfaceIndex, walkGraph, type NetCache, type NetWorld, type PathNetwork, type PathSummary, type WalkGraph } from './pathNet';
import { PathRenderer, type PathLook } from './PathRenderer';

export interface PathHost {
  scene: THREE.Scene;
  groundAt: (x: number, z: number) => number;
  /** A fresh set of tests for this plan (the world's trees and buildings as they are now). */
  makeWorld: () => NetWorld;
  extras: (game: GameState) => PathExtras;
  look: () => PathLook;
  publish: (s: PathSummary) => void;
}

const EMPTY: PathNetwork = { nodes: [], edges: [], trails: [], hub: null };

export class PathLayer {
  readonly renderer = new PathRenderer();
  private _net: PathNetwork = EMPTY;
  private _cache: NetCache = newNetCache();
  private _layoutKey = '';
  private _wearKey = '';
  private _surface: (x: number, z: number) => PathSurface | null = () => null;
  private _graph: WalkGraph | null = null;
  private _quality: Quality = 'high';
  private _last = -1e9;
  private _sumKey = '';
  private _near: (x: number, z: number) => number = () => Infinity;
  /** Counts up whenever the network is planned again (what hangs on it re-plans too). */
  version = 0;
  private readonly _h: PathHost;
  /** QA: off draws nothing. */
  enabled = true;

  constructor(host: PathHost) {
    this._h = host;
    host.scene.add(this.renderer.group);
  }

  get network(): PathNetwork { return this._net; }

  setQuality(q: Quality): void { this._quality = q; this._wearKey += '~'; }

  /** What is underfoot at (x, z): the surface of the path there, or null off the paths. */
  surfaceAt = (x: number, z: number): PathSurface | null => this._surface(x, z);

  /** Distance to the nearest path, worn or not (Infinity when there is none): what is set down in the yard keeps off it. */
  distTo = (x: number, z: number): number => this._near(x, z);

  /** The way along the paths from one point to another ([] = straight). */
  via(fx: number, fz: number, tx: number, tz: number): Pt[] {
    return this._graph ? routeVia(this._graph, fx, fz, tx, tz) : [];
  }

  private static layout(game: GameState): string {
    const st = game.structures.filter(s => !s.unplaced).map(s => `${s.id}${s.kind}${s.x},${s.z},${s.rot}${s.stage}`).join(';');
    const per = game.perimeter.map(r => `${r.id}${r.kind}${r.finishedAt === null ? Math.floor((r.done ?? 0) / 20) : 'f'}`).join(';');
    const laid = pathsOf(game).laid.map(l => `${l.a}~${l.b}${l.kind}`).join(';');
    return `${st}|${per}|${laid}`;
  }

  /** Per frame: cheap unless the game changed enough to matter. `now` in ms. */
  update(game: GameState, now: number): void {
    if (!this.enabled) { this.renderer.group.visible = false; return; }
    this.renderer.group.visible = true;
    if (now - this._last < 250 && this._net !== EMPTY) return;
    this._last = now;
    const layout = PathLayer.layout(game);
    const hh = `${game.people.length}|${Math.floor(game.clock.t / 4)}|${game.stock.goat ?? 0}${game.stock.pig ?? 0}${game.stock.steer ?? 0}|${this._quality}`;
    if (layout === this._layoutKey && `${layout}${hh}` === this._wearKey) return;
    if (layout !== this._layoutKey) { this._layoutKey = layout; this._cache = newNetCache(); }
    this._wearKey = `${layout}${hh}`;
    this._net = planNetwork(game, this._h.extras(game), this._h.makeWorld(), this._cache);
    this._surface = surfaceIndex(this._net, s => PATH_WIDTH[s]);
    this._graph = walkGraph(this._net);
    this._near = nearTrail(this._net);
    this.version++;
    const key = this._net.trails.map(t => `${t.id}${t.laid ?? ''}${Math.round(t.wear * 20)}${t.pts.length}`).join('|');
    this.renderer.update(this._net, this._h.groundAt, this._h.look(), this._quality, key);
    const sum = summarize(this._net);
    if (sum.key !== this._sumKey) { this._sumKey = sum.key; this._h.publish(sum); }
  }

  dispose(): void {
    this._h.scene.remove(this.renderer.group);
    this.renderer.dispose();
  }
}

/** Distance to the nearest trail point (cells of 1; falls back to Infinity far from any). */
function nearTrail(net: Pick<PathNetwork, 'trails'>): (x: number, z: number) => number {
  const grid = new Map<number, Pt[]>(), key = (i: number, j: number) => i * 100003 + j;
  for (const t of net.trails) for (const p of t.pts) { const k = key(Math.floor(p[0]), Math.floor(p[1])); (grid.get(k) ?? grid.set(k, []).get(k)!).push(p); }
  return (x, z) => {
    const ci = Math.floor(x), cj = Math.floor(z);
    let best = Infinity;
    for (let i = ci - 1; i <= ci + 1; i++) for (let j = cj - 1; j <= cj + 1; j++) for (const p of grid.get(key(i, j)) ?? []) best = Math.min(best, Math.hypot(p[0] - x, p[1] - z));
    return best;
  };
}
