import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';

vi.mock('./materials', () => ({ kitMaterial: () => new THREE.MeshStandardMaterial(), setWindowGlow: () => {} }));

import { KIT } from './kit';
import { DOME_BUILDERS } from './domeBuildings';
import { boxWorld } from '../../sim/cutNav';
import { kindOfCells, parseDomeKind, tierOfKind, TIER } from '../../sim/dome/tiers';
import { choosePortAngle, portFrame, portVestibule, TRUCK } from '../../sim/dome/vehiclePort';
import type { Collider } from './interior';

const BODY = 0.03;
const grow = (bs: Collider[], r: number): Collider[] => bs.map(b => ({ x0: b.x0 - r, z0: b.z0 - r, x1: b.x1 + r, z1: b.z1 + r }));
const Rof = (kind: string): number => KIT[kind].cellsX * 0.5 / 2 - 0.03 - (tierOfKind(kind) === 'geodesic' ? 0.25 : 0);

describe('the vehicle port is a real opening in the dome the nav colliders honor', () => {
  for (const t of ['geodesic', 'glass', 'arcology'] as const) {
    for (const want of [0.9, 2.5, 4.4]) {
      const kind = kindOfCells(t, TIER[t].cells), angle = choosePortAngle({ tier: t, r: Rof(kind), rot: 0 }, want).angle;
      it(`${kind} facing ${want}: a truck's width passes the outer gate, the chamber and the inner gate; the shell beside the port is solid`, () => {
        const R = Rof(kind), g = DOME_BUILDERS[parseDomeKind(kind)!.base](KIT[kind], 1, { port: angle }), nav = boxWorld(grow(g.userData.colliders as Collider[], BODY));
        const f = portFrame(t, 0, 0, R, angle)!, v = portVestibule(t, R)!, Rd = f.r;      // (the doors stand in the entrance module's plane Rd, a little behind the skin)
        const half = TRUCK.WIDTH / 2;
        const P = (rho: number, lam: number): [number, number] => [f.u[0] * rho + f.u[1] * lam, f.u[1] * rho - f.u[0] * lam];
        // down the axis from the apron to the inner gate and a little beyond, with the truck's two sides
        for (let rho = Rd + 1.0; rho >= Rd - v.len - 0.2; rho -= 0.05) for (const lam of [-half, 0, half]) { const [x, z] = P(rho, lam); expect(nav.solid(x, z), `rho ${rho.toFixed(2)} lam ${lam}`).toBe(false); }
        // the wall of the dome beside the chamber, and the chamber's side walls, are solid
        // (the person chamber stands touching the port on its +lam side: there the shared wall is solid, and on the -lam side the shell beside the chamber is)
        { const [x, z] = P(Rd - 0.02, -(v.cw / 2 + v.t + 0.25)); expect(nav.solid(x, z)).toBe(true); }
        for (const s of [-1, 1]) { const [x2, z2] = P(Rd - v.len / 2, s * (v.cw / 2 + v.t / 2)); expect(nav.solid(x2, z2)).toBe(true); }
      });
    }
  }
});
