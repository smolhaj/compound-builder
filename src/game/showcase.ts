/**
 * The mountainside showcase in the running game (see sim/showcase.ts for the design). Open it with
 *
 *   /?clean&seed=7&region=pnw&lot=hillside&lotcut&relief=9&acres=40&lotseed=8&elev=600&showcase=mountain
 *
 * `&showcase=mountain` runs `buildMountainShowcase` once the world is up (add `&lowrender` for the QA harness; scripts/showcase.mjs shoots it). It uses
 * the real build actions a player has: the placement tool (hover + click), the perimeter tool, Fortify my ring, the road hookup, the terrace and
 * drainage cards' own plans. The result lands in `window.__showcase`.
 */
import type { GameState } from '../sim/state';
import type { HomesteadWorld } from './HomesteadWorld';
import type { PlacementTool } from './PlacementTool';
import type { PerimeterTool } from './PerimeterTool';
import type { useGameStore } from '../store/gameStore';
import type { useWorldStore } from '../store/worldStore';
import type { PerimeterKind, Pt } from '../sim/perimeter';
import { buyVehicle, type VehicleKind } from '../sim/vehicles';
import { integrationProblems, runMountainShowcase, type Problem, type ShowcaseIO, type ShowcaseOptions, type ShowcaseReport } from '../sim/showcase';

/** The pieces of the running game the preset drives (what `window.__cb` holds). */
export interface ShowcaseCtx {
  world: HomesteadWorld;
  tool: PlacementTool;
  fence: PerimeterTool;
  game: typeof useGameStore;
  store: typeof useWorldStore;
}

export function buildMountainShowcase(ctx: ShowcaseCtx, opts: ShowcaseOptions = {}): ShowcaseReport & { problems: Problem[] } {
  const G = ctx.game, w = ctx.world;
  const io: ShowcaseIO = {
    game: () => G.getState().game,
    ground: (x, z) => w.parcel.natural(x, z).h,   // (the natural ground: the terrain mesh may not be built yet when this runs)
    camp: [w.camp.x, w.camp.z],
    fall: w.parcel.lot?.fall ?? 0,
    findSpot: (kind, x, z, rot, r) => ctx.tool.findSpot(kind, x, z, rot, r),
    stake: (kind, x, z, rot) => {
      const before = G.getState().game.structures.length;
      ctx.tool.setKind(kind); ctx.tool.hoverAt(x, z, rot); ctx.tool.placeHere(); ctx.tool.setKind(null);
      ctx.store.getState().setUnderground(false);   // (arming an underground piece, the bunker hatch, turns the x-ray view on: the ground goes see-through, the woods and buildings with it)
      return G.getState().game.structures.length > before;
    },
    stakeTerraces: spots => G.getState().stakeTerraces(spots),
    fortify: opts => G.getState().fortifyRing(ctx.store.getState().siteGeo ?? {}, opts),
    razor: id => G.getState().addRazor(id),
    drawRun: (kind, pts: Pt[]) => {
      const before = G.getState().game.perimeter.length;
      ctx.fence.setKind(kind as PerimeterKind);
      for (const p of pts) ctx.fence.addPoint(p[0], p[1]);
      ctx.fence.finish(); ctx.fence.setKind(null);
      const runs = G.getState().game.perimeter;
      return runs.length > before ? runs[runs.length - 1].id : { problem: ctx.game.getState().toolProblem ?? 'the tool laid nothing' };
    },
    road: () => {
      const why = G.getState().hookup('drive');
      if (!why) { G.getState().advance(200); G.setState((s: { game: GameState }) => { const g: GameState = structuredClone(s.game); g.structures = []; g.clock.speed = 0; return { game: g }; }); }
      return why;
    },
    fund: () => G.setState((s: { game: GameState }) => {
      const g: GameState = structuredClone(s.game);
      g.money += 1_500_000;
      for (const k of Object.keys(g.stock) as Array<keyof GameState['stock']>) g.stock[k] = Math.max(g.stock[k], 400);
      g.clock.speed = 0; g.clock.t = 2 * 365 + 120.4; g.clock.ticks = Math.round(g.clock.t / (0.25 / 24));
      return { game: g };
    }),
    buyVehicle: kind => G.getState().money((g: GameState) => buyVehicle(g, kind as VehicleKind)),
    finishAll: () => G.setState((s: { game: GameState }) => {
      const g: GameState = structuredClone(s.game);
      for (const r of g.perimeter) { r.done = r.hours; r.supplied = true; r.finishedAt = 0; }
      for (const st of g.structures) { st.stage = 99; st.done = 0; st.supplied = true; st.finishedAt = 0; st.permit = 'ok'; }
      g.utilities.lit = ['x'];
      return { game: g };
    }),
  };
  const rep = runMountainShowcase(io, opts);
  return { ...rep, problems: integrationProblems(G.getState().game, w.access.drive, io.ground) };
}
