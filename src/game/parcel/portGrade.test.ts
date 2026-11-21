/**
 * The road meets the sally port's apron level, in the heights the world really draws: the terrain's sample (ParcelTerrain with the planned road's bed cut into it: the function the
 * terrain mesh is built from), the gravel ribbon from buildRoadWorks and the apron slab from makeVehiclePorts, read by rays straight down. No step, no lip, no bank across the road.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { PARCEL_SIZE, ParcelTerrain } from './parcelTerrain';
import { planToPort } from '../../sim/dome/portRoad';
import { APRON_LEN, GRADE_BATTER, GRADE_LEN, apronSpan, portGrade } from '../../sim/dome/vehiclePort';
import { DOME_KIND, type DomeTier } from '../../sim/dome/tiers';
import { domeFrom } from '../../sim/dome/standing';
import { roadBedOf, type RoadPlan } from '../../sim/roadPlan';
import { BED } from '../../sim/roadBed';
import { buildRoadWorks } from '../region/roadWorks';
import { makeVehiclePorts, type PortInput } from '../fx/VehiclePorts';
import { roadYAlong } from '../paths/driveHeight';

const SEED = 7, CX = 38, CZ = 30;

function scene(tier: DomeTier, portAngle: number) {
  const t = new ParcelTerrain(SEED);
  // a drive from the east edge toward the dome, level-ish on the natural ground
  const pts = Array.from({ length: 53 }, (_, i) => { const x = CX + 26 - i * 0.5, z = CZ + 8 - i * 0.12; return { x, z, y: t.natural(x, z).h, s: i * 0.5, bank: 0 }; });
  const base = { region: 'mountain_west', style: 'gravel', pts, gateAt: 2, gate: { x: pts[0].x, z: pts[0].z, rot: 0 }, yard: [CX, CZ] as [number, number], structures: [], walls: [], rails: [], hairpins: [], lengthU: 26, lengthM: 156, lengthFt: 520 } as unknown as RoadPlan;
  const d = domeFrom({ id: 'd', kind: DOME_KIND[tier], x: CX, z: CZ, rot: 1, stage: 99, done: 0, supplied: true, finishedAt: 0, portAngle })!;
  // the dome's pad: level with the natural ground at its middle, a skirt easing out to the hill (as sitePad grades a dome)
  const lvl = t.natural(CX, CZ).h - 0.25;
  t.setPads([{ x0: CX - d.r, z0: CZ - d.r, x1: CX + d.r, z1: CZ + d.r, y: lvl, skirt: 0.9 }]);
  const pr = planToPort(base, [d], (x, z) => t.height(x, z))!;
  expect(pr).not.toBeNull();
  t.setRoadBed(roadBedOf(pr.plan));
  return { t, pr, d };
}

describe('the road is level with the sally port', () => {
  for (const tier of ['glass', 'arcology', 'geodesic'] as const) for (const ang of [1.2, 1.5]) it(`${tier} (port at ${ang}): the ground, the gravel and the apron agree along the road, across the apron and in front of it`, () => {
    const { t, pr, d } = scene(tier, ang), f = pr.frame, R = f.r, span = apronSpan(f);
    const at = (rho: number, lam: number): [number, number] => [f.cx + f.u[0] * rho + f.u[1] * lam, f.cz + f.u[1] * rho - f.u[0] * lam];
    const ground = (x: number, z: number): number => t.height(x, z);
    const planY = (rho: number): number => roadYAlong(pr.plan.pts.slice(-40), [{ s0: -Infinity, s1: Infinity }], ...at(R + rho, 0), 0.6) as number;
    // the ground: the road's own height on the axis and the full apron width across (the road bed is cut level, no bank beside the apron), out to the end of the graded stretch
    for (let rho = 0.3; rho <= 3.9; rho += 0.25) {   // (the straight run: the road is on the axis)
      const half = portGrade(R + rho - R, span, BED)!.half;   // (rho from the gate plane)
      expect(Math.abs(ground(...at(R + rho, 0)) - planY(rho)), `axis ${rho}`).toBeLessThan(0.015);
      if (rho <= APRON_LEN + 0.4) for (const lam of [span.lamA, span.lamA / 2, span.lamB / 2, span.lamB]) expect(Math.abs(ground(...at(R + rho, lam)) - planY(rho)), `apron ${rho} ${lam}`).toBeLessThan(0.015);
      else expect(Math.abs(ground(...at(R + rho, half * 0.95)) - planY(rho)), `bench ${rho}`).toBeLessThan(0.02);
    }
    const bed = t.roadBed, pre = (x: number, z: number): number => { t.setRoadBed(null); const h = t.height(x, z); t.setRoadBed(bed); return h; };   // (the ground before the road is cut: the pads and the hill)
    // the shoulders slope no steeper than the batter (3 : 1) across the graded stretch: no bank in front of the road
    for (let rho = 0.5; rho <= 2.5; rho += 0.5) for (let lam = -3.4; lam < 3.4; lam += 0.1) {   // (the straight run in front of the apron; farther out the road may bend and its inside banks meet)
      const a = ground(...at(R + rho, lam)), b = ground(...at(R + rho, lam + 0.1)), na = pre(...at(R + rho, lam)), nb = pre(...at(R + rho, lam + 0.1));
      // (never steeper than the batter, unless the hill itself is: the corridor adds no bank of its own)
      expect(Math.abs(b - a) / 0.1, `shoulder ${rho} ${lam.toFixed(1)}`).toBeLessThan(Math.max(1 / GRADE_BATTER, Math.abs(nb - na) / 0.1) + 0.1);
    }
    // the gravel ribbon (as drawn) and the apron slab (as drawn), read by rays straight down
    const roads = buildRoadWorks(pr.drawn, ground, { built: true, surface: new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), track: new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), driveW: 0.55, natural: (x, z) => t.natural(x, z).h });
    const rib = roads.children[0] as THREE.Mesh; rib.updateMatrixWorld(true);
    const ins: PortInput = { id: 'd', tier, frame: f, lane: null, guarded: false, persons: [], baseY: ground(f.cx, f.cz), state: 'open', roadY: (x, z) => roadYAlong(pr.plan.pts.slice(-40), [{ s0: -Infinity, s1: Infinity }], x, z, 0.6) };
    const ports = makeVehiclePorts([ins], ground), slab = ports.group.getObjectByName('vehicle_port_fixtures') as THREE.Mesh;
    const rc = new THREE.Raycaster(), down = new THREE.Vector3(0, -1, 0);
    const top = (m: THREE.Object3D, x: number, z: number): number | null => { rc.set(new THREE.Vector3(x, 30, z), down); const h = rc.intersectObject(m, false); return h.length ? h[0].point.y : null; };
    // along the axis (a hair to the side of the center line paint and the bollards): the slab is never under the gravel, never more than a few inches over it, and meets it at the toe
    let worstUnder = Infinity, worstOver = 0;
    for (let rho = 1.0; rho <= APRON_LEN - 0.02; rho += 0.1) {
      const y = top(slab, ...at(R + rho, 0.17)), g = top(rib, ...at(R + rho, 0.17));
      expect(y, `slab ${rho}`).not.toBeNull();
      if (g !== null) { worstUnder = Math.min(worstUnder, y! - g); worstOver = Math.max(worstOver, y! - g); }
    }
    expect(worstUnder).toBeGreaterThanOrEqual(-0.0005);
    const toeSlab = top(slab, ...at(R + APRON_LEN - 0.02, 0.17))!, toeRoad = top(rib, ...at(R + APRON_LEN + 0.02, 0.17))!;
    expect(Math.abs(toeSlab - toeRoad), 'step at the toe').toBeLessThan(0.014);   // under 3.5 inches (1 unit = 20 ft)
    expect(worstOver).toBeLessThan(0.014);
    // and the ground beside the road, past the toe, is level with the gravel: no lip
    for (const lam of [-0.9, 0.9]) expect(Math.abs(ground(...at(R + APRON_LEN + 0.1, lam)) + 0.024 - toeRoad), `beside ${lam}`).toBeLessThan(0.03);
    void d; void PARCEL_SIZE;
  });
});
