/** The world side of the shade overlay: occluders from what stands (sim/shade.ts is the math). Built once when the mode is picked or the compound changes. */
import { KIT, footprint } from '../buildkit/kit';
import { buildingHeight, rectShade, REGION_LAT, treeBox, winterNoonElevation, type ShadeBox, type ShadeScene, type ShadeTree, shadeLine } from '../../sim/shade';
import type { GameState } from '../../sim/state';

const WATCHED = /solar|garden|greenhouse|polytunnel|high_tunnel|orchard|field/;

export function shadeSceneOf(g: GameState, ground: (x: number, z: number) => number, trees: readonly ShadeTree[]): { sc: ShadeScene; own: Map<string, ShadeBox> } {
  const boxes: ShadeBox[] = [], own = new Map<string, ShadeBox>();
  for (const t of trees) boxes.push(treeBox(t));
  for (const st of g.structures) {
    const def = KIT[st.kind];
    if (!def || def.level === 'underground') continue;
    const h = buildingHeight(st.kind, def.category);
    if (h <= 0) continue;
    const f = footprint(def, st.x, st.z, st.rot, false);
    const b: ShadeBox = { x0: f.x0, x1: f.x1, z0: f.z0, z1: f.z1, top: ground(st.x, st.z) + h, opacity: 1, kind: 'building' };
    boxes.push(b); own.set(st.id, b);
  }
  return { sc: { ground, boxes, elevation: winterNoonElevation(REGION_LAT[g.site.region] ?? 40) }, own };
}

/** One line per solar array / bed / greenhouse: how much of it the noon winter sun misses. Worst first, at most 6. */
export function shadeReadout(g: GameState, sc: ShadeScene, own: Map<string, ShadeBox>): string[] {
  const rows: Array<{ pct: number; line: string }> = [];
  for (const st of g.structures) {
    const def = KIT[st.kind];
    if (!def || !WATCHED.test(st.kind)) continue;
    const f = footprint(def, st.x, st.z, st.rot, false), r = rectShade(sc, f, own.get(st.id));
    rows.push({ pct: r.pct, line: shadeLine(def.name, r) });
  }
  return rows.sort((a, b) => b.pct - a.pct).slice(0, 6).map(r => r.line);
}
