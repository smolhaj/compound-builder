import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';

vi.mock('./materials', () => ({ kitMaterial: (m: string) => { const x = new THREE.MeshStandardMaterial(); x.name = `kit_${m}`; return x; }, setWindowGlow: () => {} }));

import { BUNKER_BUILDERS, VAULT_H, type RoomSpot } from './bunkerBuildings';
import { KIT } from './kit';
import { CELLS, ATLAS_H, ATLAS_W, screenPlane } from './screenFeeds';
import { archY } from './bunkerFurniture';
import { M } from './interior';

const build = (kind: string, opts = {}) => BUNKER_BUILDERS[kind](KIT[kind], 7, { doors: { front: 0 }, depth: 0.8, ...opts });
const meshes = (g: THREE.Group) => g.children as THREE.Mesh[];
const has = (g: THREE.Group, layer: string, mat: string) => meshes(g).some(m => m.userData.layer === layer && (m.material as THREE.Material).name === `kit_${mat}`);
const spots = (g: THREE.Group) => g.userData.spots as RoomSpot[];

describe('bunker interiors', () => {
  it('the tunnel is arched and lined in boards: ribs and planks up in the roof layer, board lining on the walls, a wood floor', () => {
    const g = build('bunker_corridor');
    expect(has(g, 'roof', 'pine_panel')).toBe(true);
    expect(has(g, 'roof', 'wood_dark')).toBe(true);
    expect(has(g, 'walls', 'pine_panel')).toBe(true);
    expect(has(g, 'deck', 'deck')).toBe(true);
    // the crown clears a person (and the shelves along the walls), and it springs from the walls lower than it crowns
    const a = 0.2, crown = VAULT_H - 0.006, spring = 1.72 * M;
    expect(archY(0, -a, a, spring, crown)).toBeCloseTo(crown, 5);
    expect(archY(-a, -a, a, spring, crown)).toBeCloseTo(spring, 5);
    expect(spring).toBeGreaterThan(1.5 * M);
  });

  it('ducts show only once the bunker has a plant room (opts.air); the air handler lamp is green with it, red without', () => {
    const no = build('bunker_dorm'), yes = build('bunker_dorm', { air: true });
    expect(has(no, 'roof', 'aluminum')).toBe(false);
    expect(has(yes, 'roof', 'aluminum')).toBe(true);
    expect(has(build('bunker_plant', { air: true }), 'interior', 'led_green')).toBe(true);
    expect(has(build('bunker_plant'), 'interior', 'led_red')).toBe(true);
  });

  it('the control room has the wall of screens on the shared atlas, the site plan, a cot, a rifle rack and a console chair spot', () => {
    const g = build('bunker_comms', { power: true });
    expect(has(g, 'interior', 'screens')).toBe(true);
    expect(has(g, 'interior', 'sitemap')).toBe(true);
    expect(has(g, 'interior', 'paint_green')).toBe(true);
    expect(spots(g).some(s => s.role === 'console')).toBe(true);
    expect(spots(g).some(s => s.role === 'bed')).toBe(true);
  });

  it('the bunkroom has a TV on the atlas, a game shelf that reflects what the family owns, bunk and seat spots', () => {
    const g = build('bunker_dorm', { morale: { games: true, music: false, books: true } });
    expect(has(g, 'interior', 'screens')).toBe(true);
    expect(has(g, 'interior', 'books')).toBe(true);
    expect(spots(g).filter(s => s.role === 'bed').length).toBeGreaterThan(0);
    expect(spots(g).filter(s => s.role === 'seat').length).toBeGreaterThanOrEqual(2);
  });

  it('every room keeps its draw calls bounded: one mesh per layer x material, screens and ducts add none per screen', () => {
    for (const kind of ['bunker_corridor', 'bunker_dorm', 'bunker_stores', 'bunker_plant', 'bunker_medical', 'bunker_comms', 'bunker_galley']) {
      const g = build(kind, { air: true, power: true });
      const keys = meshes(g).map(m => `${m.userData.layer}|${(m.material as THREE.Material).name}`);
      expect(new Set(keys).size).toBe(keys.length);
      expect(keys.length).toBeLessThanOrEqual(75);
    }
  });

  it('screen planes read their own cell of the atlas', () => {
    for (const [id, [x, y, w, h]] of Object.entries(CELLS)) {
      expect(x + w).toBeLessThanOrEqual(ATLAS_W); expect(y + h).toBeLessThanOrEqual(ATLAS_H);
      const g = screenPlane(1, 1, id as keyof typeof CELLS, 0, 0, 0), uv = g.getAttribute('uv');
      const us = Array.from({ length: uv.count }, (_, i) => uv.getX(i)), vs = Array.from({ length: uv.count }, (_, i) => uv.getY(i));
      expect(Math.min(...us)).toBeCloseTo(x / ATLAS_W, 5); expect(Math.max(...us)).toBeCloseTo((x + w) / ATLAS_W, 5);
      expect(Math.min(...vs)).toBeCloseTo(1 - (y + h) / ATLAS_H, 5); expect(Math.max(...vs)).toBeCloseTo(1 - y / ATLAS_H, 5);
    }
    // no two cells overlap
    const c = Object.values(CELLS);
    for (let i = 0; i < c.length; i++) for (let j = i + 1; j < c.length; j++) {
      const [a, b] = [c[i], c[j]];
      expect(a[0] < b[0] + b[2] && a[0] + a[2] > b[0] && a[1] < b[1] + b[3] && a[1] + a[3] > b[1]).toBe(false);
    }
  });
});
