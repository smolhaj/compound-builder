/**
 * The world side of daily life (sim/daily.ts): where the work happens on this
 * place (finished gardens, fields, the coop, the well, the tower, the wall and
 * its gate) for peopleGoals, the watch posts, and the chore yard's string
 * lights and grill smoke. Pure apart from the yard it drives.
 */
import { watchNow } from '../../sim/daily';
import { dailyOf } from '../../sim/daily';
import { PERIMETER } from '../../sim/perimeter';
import { deckHeight, walkRuns } from '../../sim/walkway';
import { inGarage } from '../../sim/garage';
import type { GameState } from '../../sim/state';
import type { Site, WorkSpots, GoalCtx } from './peopleGoals';

export interface BuiltRef { kind: string; site: Site }

/** Point at arc length `d` along a polyline. */
function along(pts: ReadonlyArray<readonly [number, number]>, d: number): [number, number] {
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1], [bx, bz] = pts[i], L = Math.hypot(bx - ax, bz - az);
    if (d <= L) { const u = L > 0 ? d / L : 0; return [ax + (bx - ax) * u, az + (bz - az) * u]; }
    d -= L;
  }
  const [x, z] = pts[pts.length - 1];
  return [x, z];
}

/** The vehicle gate of the main wall (the longest finished run), or null when there is no wall with a gate. */
export function wallGate(game: GameState): { x: number; z: number } | null {
  const runs = game.perimeter.filter(r => r.finishedAt !== null && r.pts.length >= 2 && !PERIMETER[r.kind].wallTop);
  const decks = walkRuns(game);
  const main = decks.length ? decks.sort((a, b) => b.host.pts.length - a.host.pts.length)[0].host : runs.sort((a, b) => b.pts.length - a.pts.length)[0];
  const g = main?.gates[0];
  if (!g || !main) return null;
  const [x, z] = along(main.pts, g.at + g.w / 2);
  return { x, z };
}

export function workSpots(built: readonly BuiltRef[], game: GameState, yard: { x: number; z: number }): WorkSpots {
  const of = (...kinds: string[]) => built.filter(b => kinds.includes(b.kind)).map(b => b.site);
  const water = of('well_hand', 'well_drilled', 'cistern', 'filtration_shed')[0] ?? null;
  const runs = game.perimeter.filter(r => r.finishedAt !== null && r.pts.length >= 2 && !PERIMETER[r.kind].wallTop);
  // the patrol: the longest finished run's corners, with points between long sides (a wall with a walkway on it first: the guards walk the deck)
  const decks = walkRuns(game);
  const main = decks.length ? decks.sort((a, b) => b.host.pts.length - a.host.pts.length)[0].host : runs.sort((a, b) => b.pts.length - a.pts.length)[0];
  const wallY = decks.length && main ? deckHeight(main) : 0;
  const wall: Array<[number, number]> = [];
  if (main) for (let i = 0; i < main.pts.length; i++) {
    const [x, z] = main.pts[i];
    if (i > 0) {
      const [px, pz] = main.pts[i - 1], n = Math.floor(Math.hypot(x - px, z - pz) / 3);
      for (let k = 1; k < n; k++) wall.push([px + (x - px) * k / n, pz + (z - pz) * k / n]);
    }
    wall.push([x, z]);
  }
  const g = main?.gates[0];
  // the deck stops at a gatehouse garage: nobody patrols through it
  if (wallY) for (let i = wall.length - 1; i >= 0; i--) if (inGarage(game, wall[i][0], wall[i][1], 0.12)) wall.splice(i, 1);
  const gate = g && main ? (([x, z]) => ({ x, z }))(along(main.pts, g.at + g.w / 2)) : yard;
  return {
    gardens: of('garden'), fields: of('field'), coops: of('chicken_coop'), barns: of('barn'),
    water: water ? { x: water.x, z: water.z } : null,
    towers: built.filter(b => b.kind.includes('tower')).map(b => ({ x: b.site.x, z: b.site.z })),
    wall, gate, wallY,
  };
}

/** The daily-life extras for the goal context: spots, watch posts, guns, eating outdoors. */
export function dailyCtx(built: readonly BuiltRef[], game: GameState, yard: { x: number; z: number }, warm: boolean): Partial<GoalCtx> {
  const posts = new Map(watchNow(game).map(w => [w.id, w.post]));
  return {
    spots: workSpots(built, game, yard),
    post: i => posts.get(game.people[i]?.id ?? '') ?? 'gate',
    armed: game.armory.guns.some(g => g.model !== 'ruger_1022'),
    outdoors: warm,
  };
}

/** String lights (0–1) and grill smoke (0–1) for the chore yard. */
export function yardFx(game: GameState, hour: number): { lights: number; smoke: number } {
  const g = dailyOf(game).social.active;
  const on = !!g && game.clock.t >= g.at && game.clock.t < g.until;
  const dark = hour >= 19.5 || hour < 5.5;
  const evening = dark && hour >= 19.5 && hour < 22.5 && game.personState.some(ps => ps.task === 'leisure' || ps.task === 'party');
  const cook = on && ['cookout', 'july4', 'neighbors', 'harvest'].includes(g.kind) && hour < 21;
  return { lights: dark && (on || evening) ? 1 : 0, smoke: cook ? 1 : 0 };
}
