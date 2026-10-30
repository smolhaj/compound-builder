import { describe, expect, it } from 'vitest';
import { newGame, type GameState } from './state';
import { makeLotSite } from './lotListing';
import { parcelFor, roadPlanFor } from './roadState';
import { pickCamp } from '../game/parcel/campSpot';
import { accessFromPlan, distToLine } from '../game/region/access';
import { ownsAt } from './land';
import { KIT, footprint, snapCenter, type SiteQuery } from '../game/buildkit/kit';
import { siteProblem } from '../game/buildkit/underground';
import { planStructure, planProblem } from './construction';
import { stampHighGround } from './towers';
import { applyForPermit } from './paperwork';
import { layFortress, planFortress, type FortressOptions } from './fortress';
import { cutRoadGates } from './roadGate';
import { addRazor } from './razor';
import { planRun, type PerimeterKind, type Pt } from './perimeter';
import { routeProblem } from './terrainFx';
import { orderHookup } from './improvements';
import { step } from './engine';
import { buyVehicle, type VehicleKind } from './vehicles';
import { runMountainShowcase, integrationProblems, reachability, SHOWCASE_LOT, type ShowcaseIO } from './showcase';

/** The showcase headless: the same design the browser runs, driven through the sim functions the store actions call. */
function headless(): { io: ShowcaseIO; g: () => GameState; drive: Pt[]; camp: Pt } {
  const site = makeLotSite({ kind: 'hillside', region: 'pnw', relief: 9, acres: 40, seed: 8, cutbank: true, elevM: 600 });
  let g = newGame(7, undefined, undefined, { site });
  const parcel = parcelFor(g.site, g.seed), plan = roadPlanFor(g.site, g.seed, parcel), access = accessFromPlan(plan), camp = pickCamp(parcel, g.site.home);
  const q: SiteQuery = {
    height: (x, z) => parcel.natural(x, z).h,
    owned: (x, z) => ownsAt(g, x, z),
    water: (x, z) => parcel.isCreek(x, z),
    blocked: (x, z) => Math.hypot(x - camp.x, z - camp.z) < 1.1 || distToLine(access.driveQ, x, z) < 0.375 || Math.hypot(x - access.yard.x, z - access.yard.z) < 0.9,
  };
  const geo = { creekZ: (x: number) => parcel.creek.zAt(x), creekHalf: parcel.creek.halfWidth, roadGate: [access.gate.x, access.gate.z] as Pt, drive: access.drive, center: [camp.x, camp.z] as Pt, ground: (x: number, z: number) => parcel.natural(x, z).h };
  const io: ShowcaseIO = {
    game: () => g,
    ground: (x, z) => parcel.natural(x, z).h,
    camp: [camp.x, camp.z],
    fall: parcel.lot!.fall,
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
    fortify: opts => { const n = layFortress(g, planFortress(g, geo, opts as Partial<FortressOptions>)); cutRoadGates(g, geo.drive); return n; },
    razor: id => addRazor(g, id),
    drawRun: (kind, pts) => { const why = routeProblem(g, kind as PerimeterKind, pts); if (why) return { problem: why }; return planRun(g, kind as PerimeterKind, pts, []).id; },
    road: () => { const why = orderHookup(g, 'drive'); if (!why) { g = step(g, 200); g.structures = []; g.clock.speed = 0; } return why; },
    fund: () => { g.money += 1_500_000; for (const k of Object.keys(g.stock) as Array<keyof GameState['stock']>) g.stock[k] = Math.max(g.stock[k], 400); g.clock.speed = 0; g.clock.t = 2 * 365 + 120.4; g.clock.ticks = Math.round(g.clock.t / (0.25 / 24)); },
    buyVehicle: kind => buyVehicle(g, kind as VehicleKind),
    finishAll: () => { for (const r of g.perimeter) { r.done = r.hours; r.supplied = true; r.finishedAt = 0; } for (const st of g.structures) { st.stage = 99; st.done = 0; st.supplied = true; st.finishedAt = 0; st.permit = 'ok'; } g.utilities.lit = ['x']; },
  };
  return { io, g: () => g, drive: access.drive, camp: [camp.x, camp.z] };
}

import { parkingPlan } from './parking';
import { fogNow, solarFogK, fogPlaceOf } from './fogFx';

const env = (k: string): string | undefined => (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env[k];

for (const rings of [1, 2]) describe(`the mountain showcase, headless, ${rings} ring${rings > 1 ? 's' : ''}`, () => {
  const h = headless();
  const rep = runMountainShowcase(h.io, { rings });
  const g = h.g();
  if (env('SHOW') && rings === (Number(env('SHOW')) || 1)) { console.log(JSON.stringify(rep.frame), JSON.stringify(rep.notes), JSON.stringify(rep.steps)); console.log(asciiMap(g, h.drive, h.camp, h.io.ground)); }

  it(`lays out on the lot ${SHOWCASE_LOT}`, () => {
    // what the land and the rules refuse is a finding, not a failure: this shelf is level, so no 10-26 % fall for terraced beds beside the compound
    // (the only ones on the lot are far up above the face), and a patrol deck on the wall leaves no room for razor wire (docs/DECISIONS.md, #116)
    const bad = rep.steps.filter(s => !s.ok && s.step !== 'Terraced garden beds' && !/Razor wire/.test(s.step));
    expect(bad, JSON.stringify(bad)).toEqual([]);
    const razor = rep.steps.find(s => /Razor wire/.test(s.step));
    expect(razor?.ok || /patrol walkway/.test(razor?.note ?? '')).toBe(true);
    expect(g.structures.some(st => st.kind === 'gate_garage')).toBe(true);
    expect(g.structures.some(st => st.kind === 'motor_court')).toBe(true);
    expect(g.perimeter.some(r => r.kind === 'drain_channel')).toBe(true);
  });

  it('nothing clashes: no wall through a building, buildings on each other, wall on the rock face or ungated crossing of the drive', () => {
    expect(integrationProblems(g, h.drive, h.io.ground)).toEqual([]);
  });

  it('people can walk from the camp to every post, the court and the road outside the gate', { timeout: 60000 }, () => {
    const reach = reachability(g, h.io.ground, [h.camp[0], h.camp[1]], [{ post: 'road outside the gate', at: h.drive[Math.floor(h.drive.length * 0.4)] }]);
    expect(reach.filter(r => !r.ok)).toEqual([]);
  });

  it('the fleet parks: the garage first, then the court, none left standing in the open', { timeout: 30000 }, () => {
    const plan = parkingPlan(g);
    expect(plan.yardSlots).toBeGreaterThanOrEqual(6);
    expect(plan.parked.length).toBeGreaterThanOrEqual(5);
    expect(plan.inYard.length).toBeGreaterThan(0);
    expect(plan.outside.filter(id => !plan.inYard.includes(id) && plan.parked.find(p => p.vehicle === id && p.bay === null))).toEqual([]);
  });


  it('misty days: the solar farm above the fog bank keeps a sane share of the sun, the watch and the cameras see through a thinner fog than clear air', () => {
    const run = structuredClone(g);
    const ks: number[] = [];
    for (let d = 0; d < 120; d++) { run.clock.t = 2 * 365 + 250 + d + 0.35; ks.push(solarFogK(run)); const f = fogNow(run); expect(Number.isFinite(f.sightM)).toBe(true); expect(f.sightM).toBeGreaterThan(0); }
    for (const k of ks) { expect(k).toBeGreaterThanOrEqual(0.18); expect(k).toBeLessThanOrEqual(1); }
    expect(Math.min(...ks), 'a PNW fall has cloudy days').toBeLessThan(1);
    expect(fogPlaceOf(run).campAboveFloorM, 'the camp stands high over the valley floor').toBeGreaterThan(40);
  });

  it('a season runs on it: no NaN in the stockpile, the family lives', { timeout: 60000 }, () => {
    const run = step(structuredClone(g), 60);
    for (const [k, v] of Object.entries(run.stock)) expect(Number.isFinite(v as number), k).toBe(true);
    expect(Number.isFinite(run.money)).toBe(true);
    expect(run.personState.some(ps => ps.needs.died == null)).toBe(true);
  });
});

/** Debug: the scene as text (x across, z down), one character per 1 unit. SHOW=1. */
export function asciiMap(g: GameState, drive: readonly Pt[], camp: Pt, ground: (x: number, z: number) => number, box = { x0: 14, z0: 8, x1: 62, z1: 66 }): string {
  const rows: string[] = [];
  const tag = (k: string) => k === 'lodge' ? 'L' : k === 'greenhouse_heated' ? 'G' : k === 'orchard' ? 'O' : k === 'solar_farm' ? 'S' : k === 'battery_bank' ? 'B' : k === 'motor_court' ? 'C' : k === 'gate_garage' ? 'A' : k.startsWith('watchtower') || k === 'rise_lookout' ? 'T' : k === 'garden' ? 'g' : k.startsWith('bunker') ? 'b' : k[0].toUpperCase();
  const fps = g.structures.filter(st => KIT[st.kind]).map(st => ({ st, r: footprint(KIT[st.kind], st.x, st.z, st.rot) }));
  const walls = g.perimeter.filter(r => r.kind === 'stone_wall' || r.kind === 'bar_fence' || r.kind === 'drain_channel');
  const segs = walls.flatMap(w => solidSegments(w).map(([a, b]) => ({ k: w.kind, a, b })));
  for (let z = box.z0; z <= box.z1; z++) {
    let row = String(z).padStart(3) + ' ';
    for (let x = box.x0; x <= box.x1; x++) {
      let c = ground(x, z) > 0 ? String(Math.min(9, Math.max(0, Math.floor(ground(x, z) - 6)))) : ' ';
      c = c === ' ' ? ' ' : c;
      if (Math.hypot(x - camp[0], z - camp[1]) < 1.1) c = '+';
      if (distToPolyline(drive, x, z) < 0.5) c = '.';
      for (const { st, r } of fps) if (x + 0.5 > r.x0 && x - 0.5 < r.x1 && z + 0.5 > r.z0 && z - 0.5 < r.z1) c = tag(st.kind);
      for (const s of segs) { const d = distToPolyline([s.a, s.b], x, z); if (d < 0.45) c = s.k === 'stone_wall' ? '#' : s.k === 'bar_fence' ? '|' : '~'; }
      row += c;
    }
    rows.push(row);
  }
  return `x ${box.x0}..${box.x1}\n` + rows.join('\n');
}
import { distToPolyline, solidSegments } from './showcase';
