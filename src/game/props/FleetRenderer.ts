/**
 * The fleet in the world (sim/vehicles.ts, sim/garage.ts): each vehicle stands
 * in the bay the parking plan gives it (inside its garage, the roof cut away
 * shows it) or in the yard; one that goes out on a run drives out the gate
 * and back. Visual only; a vehicle that is away is not drawn.
 */
import * as THREE from 'three';
import type { GameState } from '../../sim/state';
import { GARAGES, parkingPlan, type Bay } from '../../sim/garage';
import { startingVehicles, type Vehicle } from '../../sim/vehicles';
import { buildVehicle, paintFor, VEHICLE_SIZE } from './vehicleGeometry';
import { lineLength, pointAt, type Pt } from '../region/access';

/** A placed building the bays are laid out in (world position, rotation about y, structure kind). */
export interface BayHost { x: number; z: number; rot: number; kind: string }
export interface FleetCtx {
  host: (structureId: string) => BayHost | null;
  /** The yard: where vehicles without a roof stand (camp center and rotation). */
  yard: { x: number; z: number; rot: number };
  /** The drive, gate end first (the delivery truck's). */
  drive: readonly Pt[];
  ground: (x: number, z: number) => number;
}

/** Bay spacing inside a garage (world units, ≈ 2.9 m): three across a 9 m building. */
const BAY_DX = 0.48;

interface Item { v: Vehicle; group: THREE.Group; built: string; anim: { phase: 'out' | 'in'; d: number; path: Pt[] } | null; wasAway: boolean; spot: { x: number; z: number; rot: number } | null }

export class FleetRenderer {
  readonly group = new THREE.Group();
  private readonly _items = new Map<string, Item>();
  private _key = '';

  constructor(scene: THREE.Scene) { scene.add(this.group); }

  /** Where each vehicle stands: world x, z and heading (radians about y, front toward +z when 0). */
  spots(game: GameState, ctx: FleetCtx): Map<string, { x: number; z: number; rot: number }> {
    const plan = parkingPlan(game);
    const out = new Map<string, { x: number; z: number; rot: number }>();
    let yardX = 0, yardRow = 0;
    const vs = game.vehicles ?? startingVehicles();
    for (const p of plan.parked) {
      const v = vs.find(x => x.id === p.vehicle);
      if (!v) continue;
      if (p.bay && p.bays.length) {
        const host = ctx.host(p.bay.structure);
        if (host) {
          const gd = GARAGES[host.kind];
          const n = gd?.bays ?? 3;
          const mid = p.bays.reduce((a, b: Bay) => a + b.index, 0) / p.bays.length;
          const lx = (mid - (n - 1) / 2) * BAY_DX * (n === 1 ? 0 : 1);
          const rot = host.rot * Math.PI / 2;
          // local +z is the front (the doors); the vehicle noses toward them
          const dz = v.kind === 'trailer' ? -0.3 : -0.02;
          out.set(v.id, { x: host.x + Math.cos(rot) * lx + Math.sin(rot) * dz, z: host.z - Math.sin(rot) * lx + Math.cos(rot) * dz, rot });
          continue;
        }
      }
      // in the yard: side by side in rows beside the camp, noses out, a gap between (rows of four, the next row behind)
      const y = ctx.yard;
      const w = VEHICLE_SIZE[v.kind].w + 0.2;
      if (yardX + w > 2.4 * 2.6) { yardX = 0; yardRow++; }
      const lx = 2.6 + yardX + w / 2, lz = 1.7 + yardRow * 1.15;
      yardX += w;
      const c = Math.cos(y.rot), s = Math.sin(y.rot);
      out.set(v.id, { x: y.x + c * lx + s * lz, z: y.z - s * lx + c * lz, rot: y.rot + Math.PI });
    }
    return out;
  }

  /** Make, move and hide the vehicles for this frame. */
  update(dt: number, game: GameState, ctx: FleetCtx, speedK: number): void {
    const vs = game.vehicles ?? startingVehicles();
    const key = vs.map(v => `${v.id}${v.kind}${v.fried ? 'f' : ''}`).join();
    if (key !== this._key) {
      this._key = key;
      for (const [id, it] of this._items) if (!vs.some(v => v.id === id)) { this.group.remove(it.group); it.group.traverse(o => (o as THREE.Mesh).geometry?.dispose()); this._items.delete(id); }
    }
    const spots = this.spots(game, ctx);
    for (const v of vs) {
      let it = this._items.get(v.id);
      if (!it) {
        const g = buildVehicle(v.kind, paintFor(v.kind, v.id));
        this.group.add(g);
        it = { v, group: g, built: v.kind, anim: null, wasAway: !!v.away, spot: null };
        this._items.set(v.id, it);
      }
      it.v = v;
      const spot = spots.get(v.id) ?? it.spot;
      if (spot) it.spot = spot;
      // leaving and coming home: drive the road out the gate
      if (!!v.away !== it.wasAway && spot && ctx.drive.length > 1) {
        const drive = [...ctx.drive].reverse() as Pt[];
        const out: Pt[] = [[spot.x, spot.z], ...drive];
        it.anim = v.away ? { phase: 'out', d: 0, path: out } : { phase: 'in', d: 0, path: [...out].reverse() as Pt[] };
        it.wasAway = !!v.away;
      } else if (!!v.away !== it.wasAway) it.wasAway = !!v.away;
      if (it.anim) {
        const len = lineLength(it.anim.path);
        it.anim.d += dt * Math.max(1, Math.min(4, speedK)) * 3;
        const p = pointAt(it.anim.path, Math.min(it.anim.d, len));
        it.group.position.set(p.x, ctx.ground(p.x, p.z), p.z);
        it.group.rotation.y = p.rot;
        it.group.visible = true;
        if (it.anim.d >= len) it.anim = null;
        continue;
      }
      if (v.away || !spot) { it.group.visible = false; continue; }
      it.group.visible = true;
      it.group.position.set(spot.x, ctx.ground(spot.x, spot.z), spot.z);
      it.group.rotation.y = spot.rot;
      // a vehicle that is dead sits a little low and grey
      it.group.scale.setScalar(1);
      it.group.userData.status = v.fried ? 'fried' : v.down ? 'down' : 'ok';
    }
  }

  dispose(): void {
    this.group.parent?.remove(this.group);
    this.group.traverse(o => (o as THREE.Mesh).geometry?.dispose());
    this._items.clear();
  }
}
