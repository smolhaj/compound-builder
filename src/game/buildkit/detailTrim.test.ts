import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';

// materials paint canvases (no DOM in tests): plain materials stand in
vi.mock('./materials', () => ({ kitMaterial: () => new THREE.MeshStandardMaterial(), setWindowGlow: () => {} }));

import { buildLayers } from './buildings';
import { KIT } from './kit';
import { showStage } from './shell';
import { detailGeometryOn, roomCell, setBuildingWeather, BLDG, setDetailTier, SNOW_MESH, WINTER } from './buildingDetail';

const KINDS = ['timber_cabin', 'log_house', 'cottage', 'barn', 'workshop', 'chicken_coop', 'outhouse'];

function census(kind: string): { names: Set<string>; verts: number; snow: THREE.Mesh | null } {
  const g = buildLayers(KIT[kind]);
  const names = new Set<string>();
  let verts = 0, snow: THREE.Mesh | null = null;
  for (const o of g.children) {
    const m = o as THREE.Mesh;
    names.add(m.name);
    verts += (m.userData.vertexCount as number) ?? 0;
    if (m.name === 'bldg_roof_snow') snow = m;
  }
  return { names, verts, snow };
}

afterEach(() => { setDetailTier('high'); WINTER.on = false; });

describe('building detail trim', () => {
  it('adds triangles but no new meshes except the winter roof (drawn only while it snows)', () => {
    const extra: string[] = [];
    for (const kind of KINDS) {
      setDetailTier('low');
      const lo = census(kind);
      setDetailTier('high');
      const hi = census(kind);
      for (const n of hi.names) if (!lo.names.has(n)) extra.push(`${kind}:${n}`);
      for (const n of lo.names) expect(hi.names.has(n), `${kind} ${n}`).toBe(true);
      expect(hi.verts, kind).toBeGreaterThanOrEqual(lo.verts);
    }
    expect(extra.filter(e => !e.endsWith(':bldg_roof_snow'))).toEqual([]);
  });

  it('Low builds no trim; Medium and High do', () => {
    setDetailTier('low'); expect(detailGeometryOn()).toBe(false);
    setDetailTier('medium'); expect(detailGeometryOn()).toBe(true);
    setDetailTier('high'); expect(detailGeometryOn()).toBe(true);
    expect(BLDG.uBd.value.x).toBe(1);
    setDetailTier('low'); expect(BLDG.uBd.value.x).toBe(0);
  });

  it('a pitched home gets the winter roof: every vertex carries a lift, icicles do not rise', () => {
    const { snow } = census('log_house');
    expect(snow).not.toBeNull();
    const a = snow!.geometry.getAttribute('aLift');
    const p = snow!.geometry.getAttribute('position');
    expect(a.count).toBe(p.count);
    let top = 0;
    for (let i = 0; i < a.count; i++) if (a.getW(i) > 0.5) top++;
    expect(top).toBeGreaterThan(0);
    expect(top).toBeLessThan(a.count);
  });

  it('the winter roof is hidden (not drawn, not counted) until it snows', () => {
    const g = buildLayers(KIT.log_house);
    showStage(g, 5, 0);
    const snow = g.children.find(o => o.name === SNOW_MESH)!;
    expect(snow.visible).toBe(false);
    expect(g.children.find(o => o.name === 'bldg_roof_metal_roof')!.visible).toBe(true);
    WINTER.on = true;
    showStage(g, 5, 0);
    expect(snow.visible).toBe(true);
  });

  it('barn and workshop get gutters and rake boards (roof and openings meshes grow), the cottage a railing', () => {
    for (const kind of ['barn', 'workshop', 'cottage']) {
      setDetailTier('low'); const lo = census(kind);
      setDetailTier('high'); const hi = census(kind);
      expect(hi.verts, kind).toBeGreaterThan(lo.verts + 100);
      expect(hi.snow, kind).not.toBeNull();
    }
  });

  it('the trim stays near the footprint (a gutter is not a wing)', () => {
    for (const kind of ['log_house', 'timber_cabin', 'cottage']) {
      const def = KIT[kind];
      const g = buildLayers(def);
      const box = new THREE.Box3().setFromObject(g);
      expect(box.max.x - box.min.x, kind).toBeLessThan(def.cellsX * 0.5 + 0.9);
      expect(box.max.z - box.min.z, kind).toBeLessThan(def.cellsZ * 0.5 + 1.1);
    }
  });

  it('a window shows one of four rooms, the same one every time', () => {
    const seen = new Set<number>();
    for (let i = 0; i < 40; i++) { const c = roomCell(i * 0.37, 0.2, i * 0.11); expect(c).toBe(roomCell(i * 0.37, 0.2, i * 0.11)); seen.add(c); }
    expect(seen.size).toBe(4);
  });

  it('weather is clamped to 0-1 and the roof snow follows the snow', () => {
    setBuildingWeather(2, -1, 0.5);
    expect(BLDG.uBd.value.y).toBe(1); expect(BLDG.uBd.value.z).toBe(0); expect(BLDG.uBd.value.w).toBe(0.5);
    setBuildingWeather(0, 0.7, 0);
    expect(BLDG.uIce.value.x).toBeCloseTo(0.7);
  });
});
