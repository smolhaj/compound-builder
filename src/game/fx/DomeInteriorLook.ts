/**
 * The ground under a climate-held dome keeps its normal season look (docs/ux/dome-no-snow): no ice-age snow pack, frost, frozen pond, scorched lawn or
 * ash inside. This reads the live dome state through the pure helper (sim/dome/interiorClimate), eases one 0-1 protection per dome (slowly lost when the plant
 * is dark or the shell is breached, regained when repaired), and writes the footprints into the shared mask block the shaders sample
 * (engine/world/season/domeMask). Called a few times a second by the game canvas, not every frame; nothing here adds a draw call, a pass or a uniform
 * beyond the one block, and nothing is saved.
 *
 * Footprints: each finished dome (a hemisphere at its shell radius, biggest first), then each open covered walkway between two domes (a thin capsule along
 * the run, protected to the lesser of its two domes). A dome's plant yard stands outside the shell in the open air, so it keeps the weather.
 */
import type { GameState } from '../../sim/state';
import { domesOf as standingDomes } from '../../sim/dome/standing';
import { domesOf as liveDomes, stateOf } from '../../sim/dome/live';
import { linkRun, linkState, linksOf } from '../../sim/dome/linkGraph';
import { easeInterior, interiorDormant, interiorTarget } from '../../sim/dome/interiorClimate';
import { DOME_MAX, writeDomeMask, type DomeFootprint } from '../../engine/world/season/domeMask';

/** Half width of a walkway tube (world units) and its soft edge. */
export const TUBE_R = 0.3, TUBE_EDGE = 0.12;

export class DomeInteriorLook {
  private readonly _k = new Map<string, number>();
  private _t = NaN;
  /** The footprints last written (tests, QA). */
  last: DomeFootprint[] = [];

  /** Forget the eased values: the next update lands on the target at once (a loaded save, a QA jump). */
  snap(): void { this._k.clear(); this._t = NaN; }

  /** The eased protection of one dome (0..1), 0 when it is not known. */
  protectionOf(id: string): number { return this._k.get(id) ?? 0; }

  update(game: GameState, ground: (x: number, z: number) => number): number {
    const t = game.clock.t, jump = !Number.isFinite(this._t) || t < this._t || t - this._t > 40;
    const dtDays = jump ? 0 : t - this._t;
    this._t = t;
    const domes = standingDomes(game).slice().sort((a, b) => b.r - a.r);
    const live = liveDomes(game);
    const out: DomeFootprint[] = [];
    const seen = new Set<string>();
    let dormant = 0, dormantK = -1;
    for (const d of domes) {
      const ref = live.find(r => r.st.id === d.id);
      const st = ref ? stateOf(game, ref) : null;
      const target = interiorTarget({ indoorF: st?.indoorF ?? 60, outF: st?.outF ?? 60, powered: st?.powered ?? true, health: d.health });
      const k = jump || !this._k.has(d.id) ? target : easeInterior(this._k.get(d.id)!, target, dtDays);
      this._k.set(d.id, k); seen.add(d.id);
      out.push({ x: d.x, z: d.z, r: d.r, y: ground(d.x, d.z), k });
      if (k > dormantK) { dormantK = k; dormant = interiorDormant(st?.indoorF ?? 60); }
    }
    for (const id of [...this._k.keys()]) if (!seen.has(id)) this._k.delete(id);
    // covered walkways between two protected domes: the tube's floor is inside too
    for (const l of linksOf(game)) {
      if (out.length >= DOME_MAX) break;
      if (l.kind !== 'walkway' || l.ends[0].type !== 'dome' || l.ends[1].type !== 'dome' || linkState(game, l) !== 'open') continue;
      const k = Math.min(this._k.get(l.ends[0].id) ?? 0, this._k.get(l.ends[1].id) ?? 0), run = linkRun(game, l);
      if (k <= 0 || !run || run.pts.length < 2) continue;
      for (let i = 1; i < run.pts.length && out.length < DOME_MAX; i++) {
        const [ax, az] = run.pts[i - 1], [bx, bz] = run.pts[i];
        out.push({ x: ax, z: az, x2: bx, z2: bz, r: TUBE_R, edge: TUBE_EDGE, y: ground((ax + bx) / 2, (az + bz) / 2), k });
      }
    }
    this.last = out.filter(f => f.k > 0.002).slice(0, DOME_MAX);
    return writeDomeMask(this.last, dormant);
  }
}
