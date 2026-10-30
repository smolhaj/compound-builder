/**
 * The corridors of the place as the people, dogs and vehicles use them: the links (centre line with deck heights, mouths), the pieces of ground they
 * join (a flood fill, built when first asked and again when the layout changes), and the routing through them (game/paths/linkRoute). The world gives
 * it the runs, the ground and the `hard` test; with no corridor it costs nothing.
 */
import { standingCorridors, type Corridor } from '../../sim/corridors';
import type { PerimeterRun, Pt } from '../../sim/perimeter';
import { buildReach, doorOf, linkOf, routeLinked, type Link, type Reach, type Wp } from './linkRoute';

/** The floor of a corridor at distance s along it: straight between the ground at its two portals (rock tunnel, tunnel-bridge), or the ground less the sunk depth (slope tunnel). */
export function deckFn(c: Pick<Corridor, 'kind' | 'a' | 'b' | 'lenU'>, ground: (x: number, z: number) => number): (s: number, x: number, z: number) => number {
  const ya = ground(c.a[0], c.a[1]), yb = ground(c.b[0], c.b[1]);
  if (c.kind === 'slope_tunnel') return (_s, x, z) => ground(x, z) - 0.15;
  return s => ya + (yb - ya) * Math.min(1, Math.max(0, s / (c.lenU || 1))) + 0.01;
}

export class CorridorNet {
  corridors: Corridor[] = [];
  links: Link[] = [];
  private _sig = '';
  private _reach: Reach | null = null;
  private _reachKey = '';

  get any(): boolean { return this.links.length > 0; }

  private _dirty = false;

  /** Note the runs (cheap): the links are rebuilt on the next `ensure` when a corridor stands, falls or is cleared. */
  sync(runs: readonly PerimeterRun[]): boolean {
    const cs = standingCorridors({ perimeter: runs as PerimeterRun[] });
    const sig = cs.map(c => `${c.id}:${c.collapsed ? 1 : 0}:${c.a.join(',')}:${c.b.join(',')}`).join('|');
    if (sig === this._sig) return false;
    this._sig = sig;
    this.corridors = cs;
    this._dirty = true;
    if (!cs.length) { this.links = []; this._reach = null; this._dirty = false; }
    return true;
  }

  /** Build the links (deck heights read from the ground now). */
  ensure(ground: (x: number, z: number) => number): void {
    if (!this._dirty) return;
    this._dirty = false;
    this.links = this.corridors.map(c => linkOf(c.id, c.pts, deckFn(c, ground), c.collapsed)).filter((l): l is Link => !!l);
    this.corridors = this.corridors.filter(c => this.links.some(l => l.id === c.id));
    this._reach = null;
  }

  /** The pieces of ground (built on first use for this `key` of the layout). `box` is where people go (the home block, the camp, the yard). */
  reach(key: string, box: { x0: number; z0: number; x1: number; z1: number }, hard: (x: number, z: number) => boolean, joins: ReadonlyArray<readonly [Pt, Pt]> = []): Reach {
    if (!this._reach || this._reachKey !== key) {
      const pad = 10;
      const xs = [box.x0, box.x1, ...this.links.flatMap(l => [l.mouth[0][0], l.mouth[1][0]])], zs = [box.z0, box.z1, ...this.links.flatMap(l => [l.mouth[0][1], l.mouth[1][1]])];
      this._reach = buildReach({ x0: Math.min(...xs) - pad, x1: Math.max(...xs) + pad, z0: Math.min(...zs) - pad, z1: Math.max(...zs) + pad }, hard, 0.6, [...joins, ...this.portalJoins()]);
      this._reachKey = key;
    }
    return this._reach;
  }

  /**
   * A portal is a way in by design: the free ground just outside it, in a fan of about 100 degrees out to 2.6 units (a ledge, a cutting, the court's apron),
   * is one piece with its mouth, and so with whatever doorway the wall opens there.
   */
  portalJoins(): Array<[Pt, Pt]> {
    const out: Array<[Pt, Pt]> = [];
    for (const l of this.links) {
      const first = l.deck[0], last = l.deck[l.deck.length - 1];
      [[l.mouth[0], first], [l.mouth[1], last]].forEach(([m, d]) => {
        const ux = m[0] - d[0], uz = m[1] - d[1], ul = Math.hypot(ux, uz) || 1, base = Math.atan2(uz / ul, ux / ul);
        for (const r of [1.3, 2.6]) for (let k = -2; k <= 2; k++) { const a = base + k * 0.42; out.push([[m[0], m[1]], [d[0] + Math.cos(a) * r, d[1] + Math.sin(a) * r]]); }
      });
    }
    return out;
  }

  /** The route from `from` to `to` through corridors when the goal is on another piece of ground, else null. */
  route(from: Pt, to: Pt, reach: Reach, ordinary: (a: Pt, b: Pt) => readonly Wp[]): Wp[] | null {
    return routeLinked(from, to, { reach, links: this.links, ordinary });
  }

  /** The corridor and end a door tag names. */
  door(tag: number): { corridor: Corridor; end: 0 | 1 } | null {
    const { link, end } = doorOf(tag);
    const l = this.links[link];
    const c = l && this.corridors.find(x => x.id === l.id);
    return c ? { corridor: c, end } : null;
  }
}
