import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';

vi.mock('./materials', () => ({ kitMaterial: () => new THREE.MeshStandardMaterial(), setWindowGlow: () => {} }));

import { KIT, type Placed } from './kit';
import { DEPTH, MIN_COVER, tunnelDoorsOf, tunnelStart } from './underground';
import { TUNNEL_GRADE, tunnelPath, tunnelProblem, VAULT_TOP } from './tunnelPath';
import { buildLayers } from './buildings';
import { hitsColliders, type Collider } from './interior';
import { canEnter, PERIMETER, planRun, runBill, type PerimeterKind } from '../../sim/perimeter';
import { newGame } from '../../sim/state';
import { buildTunnel } from '../perimeter/tunnelGeometry';

const P = (id: string, kind: string, x: number, z: number, rot = 0): Placed => ({ id, kind, x, z, rot });
const hatch = P('s1', 'bunker_hatch', 10.25, 10.25), dorm = P('s2', 'bunker_dorm', 11, 10.5);
const flat = () => 1, dry = () => false;
const datum = 1 - DEPTH;

describe('escape tunnel: a way out, never a way in', () => {
  it('only the family, from inside, can use it; nothing from outside ever can', () => {
    expect(canEnter({ kind: 'escape_tunnel' }, 'inside')).toBe(true);
    expect(canEnter({ kind: 'escape_tunnel' }, 'outside')).toBe(false);
    // no other run is a way in from either side
    for (const k of Object.keys(PERIMETER) as PerimeterKind[]) if (k !== 'escape_tunnel' && k !== 'underground_passage') expect(canEnter({ kind: k }, 'outside')).toBe(false);   // (the passage is two-way: its hatches are the guarded weak points, sim/compounds.ts)
  });

  it('is built with its two locks: a blast door at the bunker, an egress hatch at the exit', () => {
    const bill = runBill('escape_tunnel', 8);
    expect(bill.blast_door).toBe(1);
    expect(bill.egress_hatch).toBe(1);
    expect(bill.culvert).toBe(8);
    const g = newGame(1);
    const r = planRun(g, 'escape_tunnel', [[11.5, 10.5], [14, 10.5]], []);
    expect(r.gates).toEqual([]);
  });

  it('the exit hatch shows nothing to grab from outside: no handle, hinge or bolt above the ground', () => {
    const g = buildTunnel(tunnelPath([[11.5, 10.5], [12, 10.5], [23, 10.5]], datum, flat).samples, flat);
    const box = new THREE.Box3();
    for (const m of g.children) {
      if (m.userData.part !== 'surface') continue;
      // the surface set is only the flush collar, earth, leaf litter, a log and brush: nothing sunk below to pry at
      box.setFromObject(m);
      expect(box.min.y).toBeGreaterThan(flat() - 0.06);
    }
    // the bolts, hinges and wheel are all under the lid
    const under = g.children.filter(m => m.userData.part === 'lower');
    expect(under.some(m => { box.setFromObject(m); return box.max.y > flat() - 0.05 && box.max.y < flat(); })).toBe(true);
  });
});

describe('escape tunnel rules', () => {
  it('starts at a free wall of a bunker room, snapped to a cell', () => {
    expect(tunnelStart(5, 5, [hatch, dorm])).toBeNull();
    const s = tunnelStart(11.4, 10.6, [hatch, dorm])!;
    expect(s.room.id).toBe('s2');
    expect(s.side).not.toBe('left');           // the left wall faces the hatch (a doorway already)
    expect(s.pt[0]).toBeCloseTo(11.5);
  });

  it('gives the room a doorway where it leaves', () => {
    const s = tunnelStart(11.4, 10.6, [hatch, dorm])!;
    const d = tunnelDoorsOf(dorm, [s.pt]);
    expect(Object.keys(d)).toEqual([s.side]);
    const cs = buildLayers(KIT.bunker_dorm, 2, { doors: d, depth: 0.9, blast: [s.side] }).userData.colliders as Collider[];
    // walk out through it (local frame: the dorm is unrotated)
    const [lx, lz] = [s.pt[0] - dorm.x, s.pt[1] - dorm.z];
    expect(hitsColliders(cs, lx - Math.sign(lx) * 0.03, lz, 0.03)).toBe(false);
  });

  it('runs far out, not under the creek, through rooms, or up a too-deep shaft; dips the land are followed down', () => {
    const start: [number, number] = [11.5, 10.5], far: [number, number] = [23, 10.5];
    expect(tunnelProblem([start, [14, 10.5]], datum, flat, dry, [hatch, dorm])).toBe('too_short');
    expect(tunnelProblem([start, far], datum, flat, dry, [hatch, dorm])).toBeNull();
    // it has to come up well away from every building
    expect(tunnelProblem([start, far], datum, flat, dry, [hatch, dorm, P('s9', 'outhouse', 20, 10.5)])).toBe('too_close');
    expect(tunnelProblem([start, far], datum, flat, (x: number) => x > 15 && x < 16, [hatch, dorm])).toBe('water');
    // the ground falls away right outside the room: no room to tunnel
    expect(tunnelProblem([start, far], datum, (x: number) => (x > 11.6 ? 0.5 : 1), dry, [hatch, dorm])).toBe('start_too_shallow');
    expect(tunnelProblem([start, far], datum, (x: number) => (x > 22 ? 2.6 : 1), dry, [hatch, dorm])).toBe('exit_too_deep');
    const well = P('s3', 'well_hand', 13, 10.5);
    expect(tunnelProblem([start, far], datum, flat, dry, [hatch, dorm, well])).toBe('through_room');
  });

  it('follows a dip in the land down at a walkable grade, always under enough earth', () => {
    const dip = (x: number) => 1 - 0.35 * Math.exp(-(((x - 17) / 1.5) ** 2));
    const { samples, problem } = tunnelPath([[11.5, 10.5], [23, 10.5]], datum, dip);
    expect(problem).toBeNull();
    expect(samples[0].floor).toBeCloseTo(datum);
    for (let i = 1; i < samples.length; i++) {
      const a = samples[i - 1], b = samples[i];
      expect(Math.abs(b.floor - a.floor) / (b.s - a.s)).toBeLessThanOrEqual(TUNNEL_GRADE + 1e-9);
      expect(dip(b.x) - b.floor - VAULT_TOP).toBeGreaterThanOrEqual(MIN_COVER - 1e-9);
    }
  });
});
