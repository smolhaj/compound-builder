import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { interiorPieces } from './DomeInterior';
import { interiorPlan } from './domeInteriorPlan';
import { controlBlockPlan } from '../../sim/dome/controlBlock';
import { shellFt, TIER } from '../../sim/dome/tiers';
import { setDetailTier, type DetailTier } from '../buildkit/buildingDetail';
import type { Obstacle } from './domeInteriorPlan';

/** Nothing in the dome's floor dressing levitates: every piece either rests on the level pad or on another piece that touches it (a stack, a post, a footing). */
const PAD = 1.5, TOL = 0.011;
interface BB { x0: number; x1: number; y0: number; y1: number; z0: number; z1: number }
const boxes = (gs: THREE.BufferGeometry[]): BB[] => gs.map(g => { g.computeBoundingBox(); const b = g.boundingBox!; return { x0: b.min.x, x1: b.max.x, y0: b.min.y, y1: b.max.y, z0: b.min.z, z1: b.max.z }; });
const overlapXZ = (a: BB, b: BB): boolean => a.x0 < b.x1 + 0.005 && b.x0 < a.x1 + 0.005 && a.z0 < b.z1 + 0.005 && b.z0 < a.z1 + 0.005;

function floaters(tier: 'glass' | 'arcology' | 'geodesic', detail: DetailTier): number[] {
  setDetailTier(detail);
  const r = tier === 'arcology' ? shellFt('arcology', TIER.arcology.cells) / 2 / 20 - 0.03 : tier === 'glass' ? 6 : 4.5, angles = [0.4, 2.5, 4.4];
  const control = tier === 'arcology' ? controlBlockPlan('arcology', r, 1.2) : null;
  const obs: Obstacle[] = [{ x: -1.5, z: 1.2, hx: 0.6, hz: 0.5, home: true }];
  const plan = interiorPlan(tier, r, angles, obs, 3, [], control);
  const bs = boxes(interiorPieces(plan, () => PAD));
  const bad: number[] = [];
  bs.forEach((b, i) => {
    if (b.y0 <= PAD + TOL) return;                                  // on the pad
    const held = bs.some((o, j) => j !== i && overlapXZ(b, o) && o.y1 >= b.y0 - TOL && o.y0 <= b.y0 + TOL);     // resting on, or fixed to, a piece that reaches it
    if (!held) bad.push(i);
  });
  return bad;
}

describe('dome interior dressing is grounded (no levitating pieces)', () => {
  for (const tier of ['arcology', 'glass', 'geodesic'] as const) for (const detail of ['high', 'medium', 'low'] as const) {
    it(`${tier} / ${detail}: every floor piece rests on the pad or on a piece that touches it`, () => { expect(floaters(tier, detail)).toEqual([]); });
  }
});
