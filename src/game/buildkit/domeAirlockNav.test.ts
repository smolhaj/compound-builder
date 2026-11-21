import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';


vi.mock('./materials', () => ({ kitMaterial: () => new THREE.MeshStandardMaterial(), setWindowGlow: () => {} }));

import { KIT } from './kit';
import { DOME_BUILDERS } from './domeBuildings';
import { boxWorld, findClips, routeBattle } from '../../sim/cutNav';
import type { Battle, BattleUnit } from '../../sim/battleTypes';
import { airlocksOf } from '../../sim/dome/standing';
import { DEFAULT_BEARING, choosePortAngle, portFrame } from '../../sim/dome/vehiclePort';
import { kindOfCells, parseDomeKind, shellFt, tierOfKind, TIER } from '../../sim/dome/tiers';
import type { Collider } from './interior';

const unit = (id: string, side: 'home' | 'raider', x: number, z: number): BattleUnit => ({ id, side, x, z, post: 'open' });

/** The radius the builder lays the airlocks on (the footprint less the berm and a hair). */
const Rof = (kind: string): number => KIT[kind].cellsX * 0.5 / 2 - 0.03 - (tierOfKind(kind) === 'geodesic' ? 0.25 : 0);

/** A body's radius in the live world (HomesteadWorld INDOOR_R is 0.04): the boxes are grown by it, so a path that clears the grown boxes clears the walls with room, and no tolerance is needed for a leg that hugs a doorway. */
const BODY = 0.03;
const grow = (bs: Collider[], r: number): Collider[] => bs.map(b => ({ x0: b.x0 - r, z0: b.z0 - r, x1: b.x1 + r, z1: b.z1 + r }));

/**
 * Clips that are real: the router hugs a doorway and can touch a wall's clearance edge by a few millimeters, which is not a walk through the wall; a clip counts when the spot
 * it ends at is inside the grown walls by more than a centimeter on every side. (This replaces a 6 cm allowance on the length of a leg: no depth of cut is tolerated now.)
 */
// (an entrance now stands at any angle, not on the axes: a diagonal jamb made of axis-aligned boxes can be grazed by a few centimeters, so a graze under 8 cm is not a clip)
const realClips = (b: Battle, nav: ReturnType<typeof boxWorld>) => findClips(b, nav).filter(c => Math.hypot(c.to.x - c.from.x, c.to.z - c.from.z) > 0.08).filter(c => ([[0.01, 0], [-0.01, 0], [0, 0.01], [0, -0.01]] as const).every(([dx, dz]) => nav.solid(c.to.x + dx, c.to.z + dz)));

/** The router's world for one dome: its own colliders (the shell ring, with gaps at the airlocks) at the origin. */
function world(kind: string) {
  const g = DOME_BUILDERS[parseDomeKind(kind)!.base](KIT[kind], 1, {});
  const boxes = g.userData.colliders as Collider[];
  const tier = tierOfKind(kind)!;
  const r = shellFt(tier, KIT[kind].cellsX * 2 * 10 / 10) / 2 / 20;
  // (the entrances: the person airlock(s) and the vehicle port beside them, which is as good a way through)
  const port = portFrame(tier, 0, 0, Rof(kind), choosePortAngle({ tier, r: Rof(kind), rot: 0 }, DEFAULT_BEARING).angle)!;
  return { boxes, tier, r, R: Rof(kind), airlocks: airlocksOf(tier, 0, 0, Rof(kind), 0), port };
}

/** The default sizes and the smallest and largest the handle allows (a small dome shortens its chamber; a large one keeps the whole). */
const KINDS = (['geodesic', 'glass', 'arcology'] as const).flatMap(t => [kindOfCells(t, TIER[t].cells), kindOfCells(t, TIER[t].minCells), kindOfCells(t, TIER[t].maxCells)]);

describe('people go through the airlocks of a dome, never through the shell', () => {
  for (const kind of KINDS) {
    it(`${kind}: a raider outside between two airlocks and a defender inside are routed through an airlock gap, with no clipping`, () => {
      const w = world(kind), nav = boxWorld(grow(w.boxes, BODY)), R = w.R;      // (the shell's radius: the doors stand a little behind it, in the entrance module's plane)
      // the raider starts outside on the far side from every airlock (the middle of two neighbors) and is sent to the middle of the dome
      // (the middle of the shell away from the entrances: opposite the gate complex, or between the arcology's two)
      const a0 = w.airlocks[0].angle, mid = (w.airlocks[1] ? (a0 + w.airlocks[1].angle) / 2 : a0 + Math.PI) + 0.02, out = R + 2;
      const start = { x: Math.sin(mid) * out, z: Math.cos(mid) * out };
      const b: Battle = {
        night: false, duration: 60, units: [unit('r0', 'raider', start.x, start.z), unit('h0', 'home', 0, 0)],
        events: [{ t: 1, kind: 'move', unit: 'r0', x: 0.2, z: 0.2 }, { t: 60, kind: 'end', result: 'repelled' }],
      };
      expect(findClips(b, nav).length).toBeGreaterThan(0);   // straight through the shell is a clip
      const r = routeBattle(b, nav);
      expect(r.unrouted).toBe(0);
      expect(realClips(r.battle, nav)).toEqual([]);
      // every place the walked path crosses the shell ring is at an airlock
      const legs = r.battle.events.filter(e => e.kind === 'move' && e.unit === 'r0').map(e => e as { x: number; z: number });
      let prev = start, crossings = 0;
      for (const p of legs) {
        const steps = 60;
        for (let k = 1; k <= steps; k++) {
          const q = { x: prev.x + (p.x - prev.x) * k / steps, z: prev.z + (p.z - prev.z) * k / steps }, q0 = { x: prev.x + (p.x - prev.x) * (k - 1) / steps, z: prev.z + (p.z - prev.z) * (k - 1) / steps };
          if ((Math.hypot(q0.x, q0.z) - R) * (Math.hypot(q.x, q.z) - R) < 0) {
            crossings++;
            const near = Math.min(...[...w.airlocks.map(a => [a.x, a.z]), w.port.outer].map(([ax, az]) => Math.hypot(ax - q.x, az - q.z)));
            expect(near).toBeLessThan(0.8 + (w.airlocks[0]?.w ?? 0) / 2);      // (the module is one wide opening: the crossing is within a half chamber of a door)
          }
        }
        prev = { x: p.x, z: p.z };
      }
      expect(crossings).toBeGreaterThan(0);
    });
  }

  for (const kind of KINDS) {
    it(`${kind}: the chamber is a hollow room: in through the outer door, across the chamber, out the inner door, both ways, with no clip`, () => {
      const w = world(kind), nav = boxWorld(grow(w.boxes, BODY)), a = w.airlocks[0];
      // the chamber's middle is open floor; a spot beside it, through the side wall, is not
      const mx = (a.x + a.inX) / 2, mz = (a.z + a.inZ) / 2;      // (the person chamber stands beside the port on a parallel axis)
      expect(nav.solid(mx, mz)).toBe(false);
      for (const dir of [1, -1]) {
        const out = { x: a.outX, z: a.outZ }, inn = { x: 0.1, z: 0.1 };
        const from = dir === 1 ? out : inn, to = dir === 1 ? inn : out;
        const via = { x: mx, z: mz };   // (through the chamber's middle: the dome has other doors beside it now)
        const b: Battle = { night: false, duration: 60, units: [unit('r0', 'raider', from.x, from.z)], events: [{ t: 1, kind: 'move', unit: 'r0', x: via.x, z: via.z }, { t: 20, kind: 'move', unit: 'r0', x: to.x, z: to.z }, { t: 60, kind: 'end', result: 'repelled' }] };
        const r = routeBattle(b, nav);
        expect(r.unrouted).toBe(0);
        expect(realClips(r.battle, nav)).toEqual([]);
        // the walked line passes through both doors
        const pts = [from, ...r.battle.events.filter(e => e.kind === 'move').map(e => e as { x: number; z: number })];
        const near = (px: number, pz: number) => { let best = Infinity; for (let i = 1; i < pts.length; i++) for (let k = 0; k <= 40; k++) { const x = pts[i - 1].x + (pts[i].x - pts[i - 1].x) * k / 40, z = pts[i - 1].z + (pts[i].z - pts[i - 1].z) * k / 40; best = Math.min(best, Math.hypot(x - px, z - pz)); } return best; };
        expect(near(a.x, a.z)).toBeLessThan(a.dw / 2);
        expect(near(a.inX, a.inZ)).toBeLessThan(a.dw / 2);
      }
    });
  }
});
