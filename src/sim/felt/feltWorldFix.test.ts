import { describe, expect, it } from 'vitest';
import { tracksAt, triggerDisaster, type DisasterKind } from '../disaster';
import { newGame, type GameState } from '../state';
import { near } from '../../game/felt/markPlacement';
import { cropLook, feltMarks, streamDrop } from './marks';
import { feltSpec } from './registry';
import type { FeltKind } from './types';

function at(kind: FeltKind, day: number): GameState {
  const g = newGame(7);
  g.disaster.mode = 'sandbox';
  triggerDisaster(g.disaster, 0, kind as DisasterKind, g.seed, 14);
  g.disaster.kind = kind as DisasterKind; g.disaster.hitAt = 20; g.clock.t = 20 + day;
  g.disaster.tracks = tracksAt(g.disaster, g.clock.t);
  return g;
}
const marks = (k: FeltKind, d: number, tier: 'low' | 'medium' | 'high' = 'high') => feltMarks(at(k, d), d, feltSpec(k), tier);

describe('felt world fixes (FIX-D)', () => {
  it('draws the road marks near: the nearest about 8 to 16 units from the gate, the far ones halved', () => {
    expect(near(-9)).toBeGreaterThanOrEqual(-16); expect(near(-9)).toBeLessThanOrEqual(-8);
    expect(near(-60)).toBeGreaterThan(-60); expect(Math.abs(near(30))).toBeLessThan(30);
    expect(near(-20)).toBeGreaterThan(near(-40));   // still ordered along the road
  });
  it('lowers the creek for drought and water war, and leaves peacetime and a quake alone', () => {
    expect(streamDrop('drought', 0)).toBe(0);
    expect(streamDrop('drought', 20)).toBe(1);
    expect(streamDrop('water_war', 30)).toBeGreaterThan(0.5);
    expect(streamDrop('mega_quake', 20)).toBe(0);
    expect(streamDrop(null, 20)).toBe(0);
    expect(marks('drought', 20).filter(m => m.kind === 'dry_bed').length).toBeGreaterThanOrEqual(10);
  });
  it('kills and empties the home fields for blight, famine and a long drought', () => {
    expect(cropLook('crop_blight', 14).dead).toBe(1);
    expect(cropLook('crop_blight', 60).empty).toBe(true);
    expect(cropLook('global_famine', 40).empty).toBe(true);
    expect(cropLook('drought', 30).dead).toBeGreaterThan(0.5);
    expect(cropLook('lawless', 30)).toEqual({ dead: 0, empty: false });
    expect(cropLook(null, 5).dead).toBe(0);
  });
  it('marks a home field with a dead_field mark on its plot', () => {
    const g = at('crop_blight', 14);
    g.structures.push({ id: 'f1', kind: 'field', unplaced: false, stage: 3 } as never);
    const m = feltMarks(g, 14, null);
    expect(m.some(x => x.kind === 'dead_field' && x.anchor.at === 'structure')).toBe(true);
  });
  it('gives fallout kinds a plume and the flood a residual pool after it drains', () => {
    for (const k of ['nuclear', 'reactor_meltdown'] as const) expect(marks(k, 7).some(m => m.kind === 'plume')).toBe(true);
    expect(marks('asteroid', 7).some(m => m.kind === 'plume')).toBe(false);
    expect(marks('dam_flood', 12).some(m => m.kind === 'flood')).toBe(true);
    expect(marks('dam_flood', 12).some(m => m.kind === 'mud_line')).toBe(true);
  });
  it('puts a crowd at the wall for zombies, a column and camp for the exodus, tithe banners for the cult', () => {
    expect(marks('zombies', 7).some(m => m.kind === 'column' && m.anchor.at === 'compound')).toBe(true);
    expect(marks('mass_exodus', 7).some(m => m.kind === 'column')).toBe(true);
    expect(marks('cult_takeover', 20).filter(m => m.kind === 'banner').length).toBeGreaterThanOrEqual(2);
  });
  it('keeps a readable set at Low: props or decals for the quake, the flood and the wildfire', () => {
    for (const k of ['mega_quake', 'dam_flood', 'wildfire', 'lawless', 'nuclear'] as const) {
      const m = marks(k, 7, 'low');
      expect(m.length, k).toBeGreaterThan(5);
    }
  });
  it('writes red tags and tarps for damage records, and a ruin for a wreck', () => {
    const g = at('mega_quake', 7);
    g.structures.push({ id: 'h1', kind: 'cabin', unplaced: false, stage: 3, x: 50, z: 30 } as never);
    const st = g.structures[g.structures.length - 1]; g.disaster.fx ??= {};
    (g.disaster.fx as Record<string, unknown>).physical = { damage: { [st.id]: { level: 2, hazard: 'quake', t: 20 } } };
    let m = feltMarks(g, 7, null);
    expect(m.some(x => x.kind === 'red_tag')).toBe(true); expect(m.some(x => x.kind === 'tarp')).toBe(true);
    st.stage = 0; st.lost = true;
    (g.disaster.fx.physical as { damage: Record<string, unknown> }).damage[st.id] = { level: 3, hazard: 'quake', t: 20 };
    m = feltMarks(g, 7, null);
    expect(m.some(x => x.kind === 'ruin')).toBe(true);
  });
});
