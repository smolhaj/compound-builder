/**
 * Headless world harness for geometry audits: builds the real HomesteadWorld (no WebGL: a stub WorldScene and a fake canvas
 * DOM), stakes and finishes a compound on it through the sim's own build functions, syncs the layers as GameCanvas does and
 * returns the scene for the audits in `worldAudit.ts`.
 */
import { installFakeDom } from './fakeDom';
import * as THREE from 'three';
import { HomesteadWorld } from '../HomesteadWorld';
import { newGame, type GameState } from '../../sim/state';
import { homeOutsideForty, type Site } from '../../sim/site';
import { parcelFor, roadPlanFor } from '../../sim/roadState';
import { pickCamp } from '../parcel/campSpot';
import { accessFromPlan, distToLine } from '../region/access';
import { ownsAt } from '../../sim/land';
import { KIT, snapCenter, type SiteQuery } from '../buildkit/kit';
import { siteProblem } from '../buildkit/underground';
import { planStructure, planProblem } from '../../sim/construction';
import { stampHighGround } from '../../sim/towers';
import { applyForPermit } from '../../sim/paperwork';
import { layFortress, planFortress, type FortressOptions } from '../../sim/fortress';
import { cutRoadGates } from '../../sim/roadGate';
import { addRazor } from '../../sim/razor';
import { planRun, type PerimeterKind, type Pt } from '../../sim/perimeter';
import { routeProblem } from '../../sim/terrainFx';
import { runMountainShowcase, type ShowcaseIO, type ShowcaseReport } from '../../sim/showcase';

installFakeDom();

export interface AuditWorld { g: GameState; world: HomesteadWorld; scene: THREE.Scene; report: ShowcaseReport | null; drive: Pt[]; camp: Pt }

function stubScene(): { ws: unknown; scene: THREE.Scene } {
  const scene = new THREE.Scene();
  const ws = { scene, camera: new THREE.PerspectiveCamera(50, 1.6, 0.01, 4000), setSite() {}, invalidateShadows() {}, renderer: { localClippingEnabled: false }, outdoorLight: 1, sunDirection: new THREE.Vector3(0.3, 0.8, 0.2).normalize(), nightFactor: 0, push() {}, quality: 'medium' };
  ws.camera.position.set(-40, 30, -40);   // (far outside the compound, so near-camera detail layers stay quiet)
  return { ws, scene };
}

/** Stake, fortify and finish a compound the way the mountain showcase does, on any site. */
/** The late-game kinds the visual sweep stakes round the camp (offset x, z), for audits of a full homestead. */
export const LATE_KINDS: Array<[string, number, number]> = [['stone_house', -14, 6], ['guest_house', -12, -10], ['workshop', 10, 12], ['metal_garage', 18, 4], ['greenhouse', -4, 14], ['sheep_barn', -18, -2], ['root_cellar', 6, -12], ['water_tower', -22, 12], ['barn', 14, -8], ['chicken_coop', -7, 4], ['cottage', -26, -12], ['equipment_yard', 22, 14], ['apiary', 12, -16]];

function buildOut(g0: GameState, rings: number, late: boolean): { g: GameState; drive: Pt[]; camp: Pt; report: ShowcaseReport | null } {
  const g = g0;
  const parcel = parcelFor(g.site, g.seed), plan = roadPlanFor(g.site, g.seed, parcel), access = accessFromPlan(plan), camp = pickCamp(parcel, g.site.home);
  const q: SiteQuery = {
    height: (x, z) => parcel.natural(x, z).h, owned: (x, z) => ownsAt(g, x, z), water: (x, z) => parcel.isCreek(x, z),
    blocked: (x, z) => Math.hypot(x - camp.x, z - camp.z) < 1.1 || distToLine(access.driveQ, x, z) < 0.375 || Math.hypot(x - access.yard.x, z - access.yard.z) < 0.9,
  };
  const geo = { creekZ: (x: number) => parcel.creek.zAt(x), creekHalf: parcel.creek.halfWidth, roadGate: [access.gate.x, access.gate.z] as Pt, drive: access.drive, center: [camp.x, camp.z] as Pt, ground: (x: number, z: number) => parcel.natural(x, z).h };
  const io: ShowcaseIO = {
    game: () => g, ground: (x, z) => parcel.natural(x, z).h, camp: [camp.x, camp.z], fall: parcel.lot?.fall ?? 0,
    findSpot: (kind, x, z, rot, maxR) => {
      const def = KIT[kind];
      for (let r = 0; r <= maxR; r += 0.5) {
        const n = Math.max(1, Math.ceil(2 * Math.PI * r / 0.5));
        for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2, [sx, sz] = snapCenter(def, x + Math.cos(a) * r, z + Math.sin(a) * r, rot); if (siteProblem(def, sx, sz, rot, q, g.structures) === null) return [sx, sz]; }
      }
      return null;
    },
    stake: (kind, x, z, rot) => { if (planProblem(g, kind)) return false; const st = planStructure(g, kind, x, z, rot); stampHighGround(st); applyForPermit(g, st); return true; },
    stakeTerraces: spots => { const why = planProblem(g, 'garden'); if (why) return why; for (const [x, z] of spots) applyForPermit(g, planStructure(g, 'garden', x, z, 0)); return null; },
    fortify: (opts, center) => { const gg = { ...geo, ...(center ? { center } : {}) }; const n = layFortress(g, planFortress(g, gg, opts as Partial<FortressOptions>)); cutRoadGates(g, geo.drive); return n; },
    razor: id => addRazor(g, id),
    drawRun: (kind, pts) => { const why = routeProblem(g, kind as PerimeterKind, pts); if (why) return { problem: why }; return planRun(g, kind as PerimeterKind, pts, []).id; },
    road: () => null,
    fund: () => { g.money += 1_500_000; for (const k of Object.keys(g.stock) as Array<keyof GameState['stock']>) g.stock[k] = Math.max(g.stock[k], 400); g.clock.speed = 0; },
    buyVehicle: () => 'not in the audit',
    finishAll: () => { for (const r of g.perimeter) { r.done = r.hours; r.supplied = true; r.finishedAt = 0; } for (const st of g.structures) { st.stage = 99; st.done = 0; st.supplied = true; st.finishedAt = 0; st.permit = 'ok'; } g.utilities.lit = ['x']; },
  };
  let report: ShowcaseReport | null = null;
  try { report = runMountainShowcase(io, { rings, wall: 'stone' }); } catch { report = null; io.finishAll(); }
  if (late) { 
    for (const [k, dx, dz] of LATE_KINDS) { const sp = io.findSpot(k, camp.x + dx, camp.z + dz, 0, 10); const ok = sp ? io.stake(k, sp[0], sp[1], 0) : null; void ok; }
    io.finishAll();
  }
  return { g, drive: access.drive, camp: [camp.x, camp.z], report };
}

export function buildAuditWorld(site0: Site, seed: number, mode: 'bare' | 'built' = 'built', rings = 1, quality: 'low' | 'medium' | 'high' = 'medium', late = false): AuditWorld {
  const site: Site = { ...site0, improvements: { ...site0.improvements, drive: true } };   // (a built-up place has its drive: the road bed is benched into the ground)
  let g = newGame(seed, undefined, undefined, { site });
  let drive: Pt[] = [], camp: Pt = [0, 0], report: ShowcaseReport | null = null;
  if (mode === 'built') { const r = buildOut(g, rings, late); g = r.g; drive = r.drive; camp = r.camp; report = r.report; }
  const { ws, scene } = stubScene();
  const world = new HomesteadWorld(ws as never, g.seed, g.site);
  world.setQuality(quality);
  world.setOwnedLand([...homeOutsideForty(g.site), ...g.land.parcels.filter(p => p.owner === 'you').map(p => p.rect)]);
  world.syncStructures(g.structures.filter(x => !x.unplaced));
  world.syncProgress(g.structures);
  world.syncPerimeter(g.perimeter, g.clock.t);
  world.syncServices(g);
  world.simTime = g.clock.t;
  for (let i = 0; i < 3; i++) world.tick(0.1, 120, 200, 'auto' as never, undefined, 0);
  scene.updateMatrixWorld(true);
  return { g, world, scene, report, drive, camp };
}
