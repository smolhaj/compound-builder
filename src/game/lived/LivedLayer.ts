/**
 * The lived-in layer of the world: keeps the plan (livedPlan.ts) current with
 * the game (what stands and for how long, who lives there, the season, the
 * quality tier, the paths), draws it (LivedRenderer) and lights the lanterns
 * at night unless the lights are out. Work is throttled: a re-plan only when
 * the key changes (a day or two of building age at first, then monthly).
 */
import type * as THREE from 'three';
import type { Quality } from '../../engine/world/WorldScene';
import { dogCount } from '../../sim/pets';
import { householdOf, structureSince } from '../../sim/paths';
import type { GameState } from '../../sim/state';
import { isFinished } from '../../sim/construction';
import { KIT } from '../buildkit/kit';
import { planLived, type Apron, type LivedBuilding, type LivedCtx, type LivedFolks, type LivedPlan, type Mode } from './livedPlan';
import { LivedRenderer, yardLamp } from './LivedRenderer';
import type { Season } from './propGeometry';

export interface LivedHost {
  scene: THREE.Scene;
  groundAt: (x: number, z: number) => number;
  /** Walking height (the porch floor, the ground elsewhere). */
  floorAt: (x: number, z: number) => number;
  blocked: (x: number, z: number, r: number, self: string, mode: Mode) => boolean;
  pathDist: (x: number, z: number) => number;
  /** Bumps whenever the path network is planned again. */
  pathVersion: () => number;
  doors: () => ReadonlyArray<readonly [number, number]>;
  gate: () => LivedCtx['gate'];
  landing: (game: GameState) => LivedCtx['landing'];
  look: () => { season: Season; snow: boolean; mud: boolean; quality: Quality };
  aprons: (list: readonly Apron[], key: string) => void;
}

/** Age steps that matter: every day for the first two months, then every ten days. */
const bucket = (d: number): number => (d < 60 ? Math.floor(d) : 60 + Math.floor((d - 60) / 10));

export class LivedLayer {
  readonly renderer = new LivedRenderer();
  private _key = '';
  private _last = -1e9;
  private _plan: LivedPlan = { props: [], aprons: [], key: '' };
  private readonly _h: LivedHost;
  enabled = true;
  /** QA: draw as this tier whatever the quality setting is (?lowrender draws everything on Low). */
  qaTier: 0 | 1 | 2 | null = null;

  constructor(host: LivedHost) {
    this._h = host;
    host.scene.add(this.renderer.group);
  }

  get plan(): LivedPlan { return this._plan; }

  /** Per frame: the lantern glass every frame (one color write); the plan only when it changed. `now` in ms. */
  update(game: GameState, now: number, frame: { night: number; lightsOut: boolean }): void {
    this.renderer.group.visible = this.enabled;
    if (!this.enabled) return;
    this.renderer.setLamp(yardLamp(frame.night, frame.lightsOut));
    if (now - this._last < 300 && this._key) return;
    this._last = now;
    const look = this._h.look(), tier: 0 | 1 | 2 = this.qaTier ?? (look.quality === 'low' ? 0 : look.quality === 'medium' ? 1 : 2);
    const buildings: LivedBuilding[] = [];
    for (const st of game.structures) {
      if (st.unplaced || !isFinished(st) || !KIT[st.kind] || KIT[st.kind].level === 'underground') continue;
      const since = structureSince(game, st);
      if (since === null) continue;
      buildings.push({ id: st.id, kind: st.kind, x: st.x, z: st.z, rot: st.rot, ageDays: Math.max(0, game.clock.t - since) });
    }
    const h = householdOf(game);
    const kids = game.people.filter((p, i) => p.kid && game.personState[i]?.needs?.died == null);
    const folks: LivedFolks = {
      kids: kids.length, youngKids: kids.filter(p => p.age < 13).length, adults: h.adults, dogs: dogCount(game), animals: h.animals,
      hay: Math.floor(game.stock.hay ?? 0), growing: h.growing,
    };
    const placeAge = buildings.reduce((a, b) => Math.max(a, b.ageDays), 0);
    const key = [
      buildings.map(b => `${b.id}${b.kind}${b.x},${b.z},${b.rot}:${bucket(b.ageDays)}`).join(';'),
      `${folks.kids}${folks.youngKids}${folks.dogs}${folks.animals}${Math.min(14, Math.round(folks.hay / 3))}${folks.growing ? 1 : 0}`,
      look.season, look.snow ? 's' : '', look.mud ? 'm' : '', tier, this._h.pathVersion(), bucket(placeAge),
    ].join('|');
    if (key === this._key) return;
    this._key = key;
    const ctx: LivedCtx = {
      seed: game.seed, buildings, folks, season: look.season, snow: look.snow, mud: look.mud, tier, placeAge,
      gate: this._h.gate(), landing: this._h.landing(game),
      blocked: this._h.blocked, pathDist: this._h.pathDist, doors: this._h.doors(),
    };
    this._plan = planLived(ctx);
    this.renderer.update(this._plan, { ground: this._h.groundAt, floor: this._h.floorAt, season: look.season, quality: look.quality, key: this._plan.key + look.season });
    this._h.aprons(this._plan.aprons, this._plan.aprons.map(a => `${a.x.toFixed(2)},${a.z.toFixed(2)}`).join('|'));
  }

  dispose(): void {
    this._h.scene.remove(this.renderer.group);
    this.renderer.dispose();
  }
}
