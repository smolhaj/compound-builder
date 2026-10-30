/**
 * The steel doors of the tunnel-bridge and the rock tunnel, opening and closing (docs/DECISIONS.md, "Tunnel use"): open by day, shut from dusk to dawn
 * and on the alarm; whoever has a key (the family, its dogs, its vehicles) standing at one opens it, and it closes behind them a few seconds later. The
 * door groups are the ones `buildRun` makes (`userData.door`); this moves them. Pure state in `doorTarget` (tested), the meshes in `CorridorDoors`.
 */
import type * as THREE from 'three';
import type { Corridor } from '../../sim/corridors';

/** A keyholder this close to a door (units, about 8 m) opens it. */
export const KEY_REACH = 1.4;
/** How long a door stays open behind the last keyholder (seconds), and how fast it moves (fraction per second). */
export const HOLD_S = 5, SPEED = 0.7;

/** Where a door is heading: 1 open, 0 shut. `near` is whether a keyholder is at it; `held` how long ago the last one left (s). */
export function doorTarget(locked: boolean, near: boolean, heldS: number): number {
  if (!locked) return 1;
  return near || heldS < HOLD_S ? 1 : 0;
}

interface DoorState { open: number; held: number }

export class CorridorDoors {
  private readonly _st = new Map<string, DoorState>();

  private _forced: { id: string; end: 0 | 1; open: boolean } | null = null;
  /** A raid at a door: hold it shut (the crew is working at it) or forced open (they are through); null lets the clock and the keyholders decide again. */
  force(f: { id: string; end: 0 | 1; open: boolean } | null): void { this._forced = f; }

  /** How open a door is (0-1); doors nobody has touched stand as the day decides. */
  openness(id: string, end: 0 | 1): number { return this._st.get(`${id}:${end}`)?.open ?? 1; }

  /**
   * Move every door. `groups` are the corridors' run groups; `keyholders` are the points of whoever has a key (x, z) out and about this frame.
   */
  update(dt: number, corridors: readonly Corridor[], groups: ReadonlyMap<string, THREE.Group>, locked: boolean, keyholders: ReadonlyArray<readonly [number, number]>): void {
    for (const c of corridors) {
      const g = groups.get(c.id);
      if (!g) continue;
      for (const child of g.children) {
        const d = child.userData.door as { end: 0 | 1; lift?: number; swing?: number; base?: number } | undefined;
        if (!d) continue;
        const key = `${c.id}:${d.end}`, p = d.end === 0 ? c.a : c.b;
        let st = this._st.get(key);
        if (!st) this._st.set(key, st = { open: locked ? 0 : 1, held: 99 });
        const near = keyholders.some(k => Math.hypot(k[0] - p[0], k[1] - p[1]) < KEY_REACH);
        st.held = near ? 0 : st.held + dt;
        const f = this._forced && this._forced.id === c.id && this._forced.end === d.end ? this._forced.open : null;
        const to = f !== null ? (f ? 1 : 0) : doorTarget(locked, near, st.held);
        st.open += Math.max(-dt * SPEED, Math.min(dt * SPEED, to - st.open));
        if (d.lift !== undefined) {
          if (child.userData.baseY === undefined) child.userData.baseY = child.position.y;
          child.position.y = (child.userData.baseY as number) + d.lift * st.open;
        } else if (d.swing !== undefined) {
          child.rotation.y = (d.base ?? 0) + d.swing * st.open;
        }
      }
    }
  }
}
