import { describe, expect, it } from 'vitest';
import { INTERIOR_HIDE_DIST, LOD_HYSTERESIS, farHiddenLayers, isFar, type LodMesh } from './buildingLod';

const m = (layer: string, material = 'kit_timber_lap'): LodMesh => ({ layer, material });
const house = [m('foundation'), m('frame', 'kit_frame'), m('rafters', 'kit_frame'), m('roof', 'kit_metal_roof'), m('walls'), m('openings', 'kit_glass'), m('decor'), m('interior', 'kit_wood_mid'), m('loft', 'kit_pine_panel')];

describe('far-building layer plan', () => {
  it('hides the studs, rafters, furniture and loft of an enclosed building, nothing else', () => {
    expect(farHiddenLayers(house).sort()).toEqual(['frame', 'interior', 'loft', 'rafters']);
  });
  it('leaves layers a building does not have out of the plan', () => {
    expect(farHiddenLayers([m('roof'), m('walls'), m('interior')])).toEqual(['interior']);
  });
  it('keeps everything on open frames (greenhouse, garden, tower, coop run)', () => {
    expect(farHiddenLayers(house, ['frame', 'rafters'])).toEqual([]);
    expect(farHiddenLayers(house, ['rafters'])).toEqual([]);
  });
  it('keeps everything when the walls are see-through', () => {
    const glassHouse = [m('roof', 'kit_glass'), m('walls', 'kit_polycarb'), m('interior', 'kit_crop')];
    expect(farHiddenLayers(glassHouse)).toEqual([]);
    expect(farHiddenLayers([m('roof'), m('walls', 'kit_wire_mesh'), m('interior')])).toEqual([]);
    // a mix: one opaque, one see-through wall layer is still open
    expect(farHiddenLayers([m('roof'), m('walls'), m('walls', 'kit_glass'), m('interior')])).toEqual([]);
  });
  it('keeps everything with no walls or no roof (a shed on posts, a pit)', () => {
    expect(farHiddenLayers([m('roof'), m('interior')])).toEqual([]);
    expect(farHiddenLayers([m('walls'), m('interior')])).toEqual([]);
  });
});

describe('far distance with hysteresis', () => {
  it('goes far past the limit and near again only well inside it', () => {
    for (const tier of ['high', 'medium', 'low'] as const) {
      const d = INTERIOR_HIDE_DIST[tier];
      expect(isFar(d + LOD_HYSTERESIS + 0.1, false, tier)).toBe(true);
      expect(isFar(d, false, tier)).toBe(false);
      expect(isFar(d, true, tier)).toBe(true);
      expect(isFar(d - LOD_HYSTERESIS - 0.1, true, tier)).toBe(false);
    }
  });
  it('lower tiers go far sooner', () => {
    expect(INTERIOR_HIDE_DIST.low).toBeLessThan(INTERIOR_HIDE_DIST.medium);
    expect(INTERIOR_HIDE_DIST.medium).toBeLessThan(INTERIOR_HIDE_DIST.high);
  });
  it('is stable: no flicker as the camera hovers at the threshold', () => {
    let far = false, flips = 0;
    for (let i = 0; i < 200; i++) { const d = INTERIOR_HIDE_DIST.medium + Math.sin(i / 3) * 0.9; const next = isFar(d, far, 'medium'); if (next !== far) flips++; far = next; }
    expect(flips).toBe(0);
  });
});
