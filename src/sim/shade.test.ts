import { describe, expect, it } from 'vitest';
import { BARE_LEAF, BoxIndex, buildingHeight, rectShade, shadeAt, shadeGrid, shadeLine, treeBox, winterNoonElevation, REGION_LAT, type ShadeBox, type ShadeScene } from './shade';

const flat = (boxes: ShadeBox[] = [], elevation = 25): ShadeScene => ({ ground: () => 0, boxes, elevation });
const house: ShadeBox = { x0: 0, x1: 2, z0: 10, z1: 12, top: 1.2, opacity: 1, kind: 'building' };

describe('winter noon sun', () => {
  it('is lower farther north and never below 1 degree', () => {
    expect(winterNoonElevation(30)).toBeCloseTo(36.56, 1);
    expect(winterNoonElevation(46.5)).toBeLessThan(winterNoonElevation(34));
    expect(winterNoonElevation(80)).toBe(1);
    for (const lat of Object.values(REGION_LAT)) expect(winterNoonElevation(lat)).toBeGreaterThan(15);
  });
});

describe('shadeAt', () => {
  it('casts a shadow north of a building, as long as height over tan(elevation)', () => {
    const sc = flat([house]), reach = 1.2 / Math.tan(25 * Math.PI / 180);
    expect(shadeAt(sc, 1, 10 - reach * 0.9)).toBe(1);
    expect(shadeAt(sc, 1, 10 - reach * 1.1)).toBe(0);
    expect(shadeAt(sc, 1, 14)).toBe(0);
    expect(shadeAt(sc, 3, 9)).toBe(0);
  });
  it('is longer when the sun is lower', () => {
    const z = 10 - 4;
    expect(shadeAt(flat([house], 40), 1, z)).toBe(0);
    expect(shadeAt(flat([house], 15), 1, z)).toBe(1);
  });
  it('a bare broadleaf only dims; a conifer is dark', () => {
    const c = treeBox({ x: 1, y: 0, z: 10, kind: 'conifer', scale: 1, sy: 1 }), b = treeBox({ x: 1, y: 0, z: 10, kind: 'broad', scale: 1, sy: 1 });
    expect(b.opacity).toBe(BARE_LEAF);
    expect(shadeAt(flat([c]), 1, 8.5)).toBe(1);
    expect(shadeAt(flat([b]), 1, 8.5)).toBeCloseTo(BARE_LEAF, 5);
  });
  it('two trees in line stack', () => {
    const b1 = treeBox({ x: 1, y: 0, z: 10, kind: 'broad', scale: 1, sy: 1 }), b2 = treeBox({ x: 1, y: 0, z: 10.5, kind: 'broad', scale: 1, sy: 1 });
    expect(shadeAt(flat([b1, b2]), 1, 8.8)).toBeCloseTo(1 - (1 - BARE_LEAF) ** 2, 5);
  });
  it('a ridge to the south shades the ground behind it', () => {
    const ground = (_x: number, z: number) => (z > 20 ? (z - 20) * 0.8 : 0);
    const sc: ShadeScene = { ground, boxes: [], elevation: 25 };
    expect(shadeAt(sc, 0, 15)).toBe(1);
    expect(shadeAt({ ...sc, hills: false }, 0, 15)).toBe(0);
  });
  it('indexed and brute-force agree', () => {
    const boxes = [house, treeBox({ x: 5, y: 0, z: 20, kind: 'conifer', scale: 1.2, sy: 1 })];
    const idx = new BoxIndex(boxes);
    for (let x = -2; x < 8; x += 0.7) for (let z = 0; z < 24; z += 0.9) expect(shadeAt(flat(boxes), x, z, idx)).toBe(shadeAt(flat(boxes), x, z));
  });
});

describe('grid and sites', () => {
  it('grid cell matches the point query', () => {
    const sc = flat([house]), g = shadeGrid(sc, { nx: 6, nz: 14, x0: 0, z0: 0, step: 1 });
    expect(g.shade[2 * 6 + 1]).toBe(shadeAt(sc, 1, 2));
    expect(g.shade.length).toBe(84);
  });
  it('a bed north of a house is shaded by buildings; its own building casts nothing on itself', () => {
    const sc = flat([house]);
    const bed = rectShade(sc, { x0: 0.2, x1: 1.8, z0: 8.8, z1: 9.8 }, undefined);
    expect(bed.pct).toBeGreaterThan(60);
    expect(bed.by).toBe('buildings');
    expect(rectShade(sc, { x0: 0, x1: 2, z0: 10, z1: 12 }, house).pct).toBe(0);
    expect(rectShade(sc, { x0: 0, x1: 2, z0: 14, z1: 15 }).pct).toBe(0);
  });
  it('blames the hill and the trees correctly', () => {
    const ground = (_x: number, z: number) => (z > 20 ? (z - 20) * 0.8 : 0);
    expect(rectShade({ ground, boxes: [], elevation: 25 }, { x0: 0, x1: 1, z0: 14, z1: 15 }).by).toBe('hill');
    const t = treeBox({ x: 1, y: 0, z: 12, kind: 'conifer', scale: 1, sy: 1 });
    expect(rectShade(flat([t]), { x0: 0.8, x1: 1.2, z0: 10.8, z1: 11.4 }).by).toBe('trees');
  });
  it('reads in words', () => {
    expect(shadeLine('Solar array', { pct: 0, by: null })).toContain('full sun');
    expect(shadeLine('Garden', { pct: 62, by: 'trees' })).toBe('Garden: 62% shaded at noon on Dec 21 by trees to the south');
  });
  it('heights: underground nothing, towers tall, homes a house', () => {
    expect(buildingHeight('bunker_main')).toBe(0);
    expect(buildingHeight('watchtower_wood')).toBeGreaterThan(buildingHeight('farmhouse', 'home'));
    expect(buildingHeight('solar_array', 'power')).toBeLessThan(buildingHeight('farmhouse', 'home'));
  });
});
