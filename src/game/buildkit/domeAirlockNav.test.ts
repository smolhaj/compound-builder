import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';

vi.mock('./materials', () => ({ kitMaterial: () => new THREE.MeshStandardMaterial(), setWindowGlow: () => {} }));

import { KIT } from './kit';
import { DOME_BUILDERS } from './domeBuildings';
import { boxWorld, findClips, routeBattle } from '../../sim/cutNav';
import type { Battle, BattleUnit } from '../../sim/battleTypes';
import { airlocksOf } from '../../sim/dome/standing';
import { shellFt } from '../../sim/dome/tiers';
import type { Collider } from './interior';

const unit = (id: string, side: 'home' | 'raider', x: number, z: number): BattleUnit => ({ id, side, x, z, post: 'open' });

/** The router's world for one dome: its own colliders (the shell ring, with gaps at the airlocks) at the origin. */
function world(kind: 'dome_geodesic' | 'dome_glass' | 'dome_arcology') {
  const g = DOME_BUILDERS[kind](KIT[kind], 1, {});
  const boxes = g.userData.colliders as Collider[];
  const tier = kind === 'dome_geodesic' ? 'geodesic' : kind === 'dome_glass' ? 'glass' : 'arcology';
  const r = shellFt(tier, KIT[kind].cellsX * 2 * 10 / 10) / 2 / 20;
  return { boxes, tier, r, airlocks: airlocksOf(tier, 0, 0, KIT[kind].cellsX * 0.5 / 2 - 0.03 - (tier === 'geodesic' ? 0.25 : 0), 0) };
}

describe('people go through the airlocks of a dome, never through the shell', () => {
  for (const kind of ['dome_geodesic', 'dome_glass', 'dome_arcology'] as const) {
    it(`${kind}: a raider outside between two airlocks and a defender inside are routed through an airlock gap, with no clipping`, () => {
      const w = world(kind), nav = boxWorld(w.boxes), R = w.airlocks[0] ? Math.hypot(w.airlocks[0].x, w.airlocks[0].z) : w.r;
      // the raider starts outside on the far side from every airlock (the middle of two neighbors) and is sent to the middle of the dome
      const a0 = w.airlocks[0].angle, a1 = w.airlocks[1].angle, mid = (a0 + a1) / 2, out = R + 2;
      const start = { x: Math.sin(mid) * out, z: Math.cos(mid) * out };
      const b: Battle = {
        night: false, duration: 60, units: [unit('r0', 'raider', start.x, start.z), unit('h0', 'home', 0, 0)],
        events: [{ t: 1, kind: 'move', unit: 'r0', x: 0.2, z: 0.2 }, { t: 60, kind: 'end', result: 'repelled' }],
      };
      expect(findClips(b, nav).length).toBeGreaterThan(0);   // straight through the shell is a clip
      const r = routeBattle(b, nav);
      expect(r.unrouted).toBe(0);
      // (a leg that only grazes the corner of a collider box at the gap edge, under 6 cm, is the router hugging the opening, not a walk through the shell)
      const cl = findClips(r.battle, nav).filter(c => Math.hypot(c.to.x - c.from.x, c.to.z - c.from.z) > 0.06); expect(cl).toEqual([]);
      // every place the walked path crosses the shell ring is at an airlock
      const legs = r.battle.events.filter(e => e.kind === 'move' && e.unit === 'r0').map(e => e as { x: number; z: number });
      let prev = start, crossings = 0;
      for (const p of legs) {
        const steps = 60;
        for (let k = 1; k <= steps; k++) {
          const q = { x: prev.x + (p.x - prev.x) * k / steps, z: prev.z + (p.z - prev.z) * k / steps }, q0 = { x: prev.x + (p.x - prev.x) * (k - 1) / steps, z: prev.z + (p.z - prev.z) * (k - 1) / steps };
          if ((Math.hypot(q0.x, q0.z) - R) * (Math.hypot(q.x, q.z) - R) < 0) {
            crossings++;
            const near = Math.min(...w.airlocks.map(a => Math.hypot(a.x - q.x, a.z - q.z)));
            expect(near).toBeLessThan(0.8);
          }
        }
        prev = { x: p.x, z: p.z };
      }
      expect(crossings).toBeGreaterThan(0);
    });
  }
});
