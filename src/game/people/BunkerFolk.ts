/**
 * BunkerFolk: the people who are down in the bunker, in the rooms' seats, beds and at the control room's
 * console (sim/bunkerLife.bunkerOccupants). One small instanced figure layer; nothing is drawn when
 * nobody is below, and the terrain hides it from above ground. The rooms mark where somebody can be
 * (`group.userData.spots`, buildkit/bunkerBuildings.ts); this places each occupant on a free spot of
 * their role. `setDebug` stands people in the rooms for QA shots.
 */
import type * as THREE from 'three';
import { FigureLayer, FIG_POSE } from '../../engine/world/people/figureKit';
import { pickPersonaWear } from '../../engine/world/people/crowdWear';
import type { Person } from '../../sim/family';
import type { Occupant } from '../../sim/bunkerLife';
import type { RoomSpot } from '../buildkit/bunkerBuildings';

/** A room's spot in the world (floor y included). */
export interface WorldSpot extends RoomSpot { wx: number; wy: number; wz: number; room: string }

const rnd = (seed: number) => { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; };

export class BunkerFolk {
  private readonly _layer: FigureLayer;
  private _key = '';
  private _debug: Array<{ room: string; role?: RoomSpot['role'] }> | null = null;

  constructor(scene: THREE.Scene) { this._layer = new FigureLayer(scene, 16, 'bunker-folk'); }

  /** QA: stand a person in each listed room (on its first spot of the role, else any). Null to clear. */
  setDebug(list: Array<{ room: string; role?: RoomSpot['role'] }> | null): void { this._debug = list; this._key = ''; }

  /** Who stands where: `spots` are every finished room's marks in the world. */
  update(people: readonly Person[], occupants: readonly Occupant[], spots: readonly WorldSpot[], season: 'summer' | 'fall' | 'winter' | 'spring'): void {
    const key = JSON.stringify([occupants, spots.map(s => [s.room, s.role, Math.round(s.wx * 100), Math.round(s.wz * 100)]), this._debug, season]);
    if (key === this._key) return;
    this._key = key;
    const used = new Set<WorldSpot>();
    const take = (role: RoomSpot['role'], room?: string): WorldSpot | null => {
      const pool = spots.filter(s => !used.has(s) && (!room || s.room === room));
      const s = pool.find(x => x.role === role) ?? (role === 'console' ? null : pool.find(x => x.role !== 'console'));
      if (s) used.add(s);
      return s ?? null;
    };
    const placed: Array<{ p: Person | null; s: WorldSpot; i: number }> = [];
    let n = 0;
    for (const o of occupants) {
      const p = people.find(x => x.id === o.id); if (!p) continue;
      const s = take(o.role); if (s) placed.push({ p, s, i: n++ });
    }
    for (const d of this._debug ?? []) { const s = take(d.role ?? 'seat', d.room) ?? take('console', d.room) ?? take('bed', d.room); if (s) placed.push({ p: null, s, i: n++ }); }
    const k = Math.min(16, placed.length);
    placed.slice(0, 16).forEach(({ p, s, i }, idx) => {
      const r = rnd(i * 7919 + 13);
      const w = pickPersonaWear(r, p?.kid ? 'kid' : 'resident', { season, team: null });
      w.hasPack = false;
      if (p && !p.kid) { w.shirt = p.shirt; w.shorts = false; }
      this._layer.setWear(idx, w);
      const lying = s.role === 'bed', sitting = !lying;
      this._layer.setPose(idx, {
        x: s.wx, y: s.wy + (lying ? s.y ?? 0.4 / 6 : 0), z: s.wz, rot: s.face, scale: p?.kid ? 0.8 : 1,
        pose: sitting ? FIG_POSE.BENCH : FIG_POSE.LAWN, phase: idx, amp: 0,
      });
    });
    this._layer.commit(k, true);
  }

  dispose(): void { this._layer.dispose(); }
}
