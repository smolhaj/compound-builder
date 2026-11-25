import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
vi.mock('../buildkit/materials', () => ({ kitMaterial: () => new THREE.MeshStandardMaterial(), setWindowGlow: () => {} }));
import { KIT } from '../buildkit/kit';
import { DOME_BUILDERS } from '../buildkit/domeBuildings';
import { TIER, shellFt } from '../../sim/dome/tiers';
import { airlockDims, yardGeometry } from '../../sim/dome/plantYard';
import { airlockPieces } from './AirlockProps';

const R = shellFt('arcology', TIER.arcology.cells) / 2 / 20 - 0.03;
const yg = yardGeometry('arcology', R, 0)!, d = airlockDims(yg);
/** A point of the dome's local frame in the airlock's own frame (x across, z along). */
const toAir = (x: number, z: number): [number, number] => { const dx = x - d.fr.x, dz = z - d.fr.z, c = Math.cos(d.fr.rot), s = Math.sin(d.fr.rot); return [dx * c - dz * s, dx * s + dz * c]; };

describe('nothing of the dome shell crosses the service airlock', () => {
  const g = DOME_BUILDERS['dome_arcology'](KIT['dome_arcology'], 1, { port: 2.46 });
  it('no shell, glass, band, footing or strut triangle enters the clear passage and chamber volume', () => {
    // the clear volume in the airlock's frame: the whole width, from the dome-side door to the yard door, from just above the floor to just under the ceiling
    const box = new THREE.Box3(new THREE.Vector3(-d.pw / 2 + 0.015, 0.035, d.dzC + 0.03), new THREE.Vector3(d.pw / 2 - 0.015, d.ph - 0.03, 0.1)), bad: string[] = [];
    g.updateMatrixWorld(true);
    g.traverse(o => {
      const m = o as THREE.Mesh; if (!m.isMesh || !m.geometry || m.name === 'bldg_decor_screens') return;      // (the label plates are meant to be there)
      const pos = m.geometry.getAttribute('position'), idx = m.geometry.index, n = idx ? idx.count : pos.count, v = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
      for (let i = 0; i < n; i += 3) {
        for (let k = 0; k < 3; k++) { const j = idx ? idx.getX(i + k) : i + k; v[k].fromBufferAttribute(pos, j).applyMatrix4(m.matrixWorld); const [ax, az] = toAir(v[k].x, v[k].z); v[k].set(ax, v[k].y, az); }
        if (box.intersectsTriangle(new THREE.Triangle(v[0], v[1], v[2]))) { bad.push(m.name + ' ' + v.map(q => `(${q.x.toFixed(2)},${q.y.toFixed(2)},${q.z.toFixed(2)})`).join('')); if (bad.length > 8) return; }
      }
    });
    expect([...new Set(bad)]).toEqual([]);
  });
});

describe('the chamber lining', () => {
  const tris = (hi: boolean): number => airlockPieces(yg, 0.012, hi).reduce((a, p) => a + p.getAttribute('position').count / 3, 0);
  it('stays inside the walls, off the floor lane and under the ceiling, and is cheap', () => {
    for (const hi of [false, true]) for (const p of airlockPieces(yg, 0.012, hi)) {
      p.computeBoundingBox(); const b = p.boundingBox!, pos = p.getAttribute('position');
      for (let i = 0; i < pos.count; i++) { const [ax, az] = toAir(pos.getX(i), pos.getZ(i)); expect(Math.abs(ax)).toBeLessThanOrEqual(d.pw / 2 + 0.001); expect(az).toBeGreaterThan(d.dzC); expect(az).toBeLessThan(0.12); }
      expect(b.min.y).toBeGreaterThanOrEqual(0.012 - 0.001); expect(b.max.y).toBeLessThanOrEqual(d.ph);
    }
    expect(tris(false)).toBeLessThan(140); expect(tris(true)).toBeLessThan(2400);
  });
  it('keeps a lane 0.15 wide clear below head height for a person and the door', () => {
    for (const hi of [false, true]) for (const p of airlockPieces(yg, 0, hi)) {
      p.computeBoundingBox(); if (p.boundingBox!.max.y < 0.01) continue;      // (floor stripes and the drain are flush)
      const pos = p.getAttribute('position');
      for (let i = 0; i < pos.count; i++) { const [ax] = toAir(pos.getX(i), pos.getZ(i)); if (pos.getY(i) < 0.3) expect(Math.abs(ax)).toBeGreaterThanOrEqual(0.075); }
    }
  });
});

describe('the service passage can be walked', () => {
  it('a walker gets from the dome floor, through the chamber and the passage, to the yard', () => {
    const g = DOME_BUILDERS['dome_arcology'](KIT['dome_arcology'], 1, { port: 2.46 }), cs = (g.userData.colliders as Array<{ x0: number; z0: number; x1: number; z1: number }>), rad = 0.05, step = 0.025;
    const hit = (x: number, z: number): boolean => cs.some(c => x > c.x0 - rad && x < c.x1 + rad && z > c.z0 - rad && z < c.z1 + rad);
    const c = Math.cos(d.fr.rot), s = Math.sin(d.fr.rot), W = (ax: number, az: number): [number, number] => [d.fr.x + ax * c + az * s, d.fr.z - ax * s + az * c];
    // a grid in the airlock's own frame (x across, z along), the dome's collider boxes tested at each cell
    const nx = Math.round(2.4 / step), nz = Math.round(3.6 / step), open = (i: number, j: number): boolean => { const [x, z] = W(-1.2 + i * step, d.dzC - 1.0 + j * step); return !hit(x, z); };
    const si = Math.round(1.2 / step), sj = Math.round(0.6 / step), gj = Math.round((0.6 - d.dzC + 1.0) / step);
    expect(open(si, sj)).toBe(true); expect(open(si, gj)).toBe(true);
    const seen = new Set<number>([si * 1000 + sj]), q: Array<[number, number]> = [[si, sj]];
    while (q.length) { const [i, j] = q.shift()!; for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= nx || b >= nz || seen.has(a * 1000 + b) || !open(a, b)) continue; seen.add(a * 1000 + b); q.push([a, b]); } }
    expect(seen.has(si * 1000 + gj)).toBe(true);
  });
  it('and the passage walls still stop a walker beside the lane', () => {
    const g = DOME_BUILDERS['dome_arcology'](KIT['dome_arcology'], 1, { port: 2.46 }), cs = (g.userData.colliders as Array<{ x0: number; z0: number; x1: number; z1: number }>);
    const c = Math.cos(d.fr.rot), s = Math.sin(d.fr.rot), [wx, wz] = [d.fr.x + 0.24 * c + d.cz * s, d.fr.z - 0.24 * s + d.cz * c];
    expect(cs.some(q => wx > q.x0 && wx < q.x1 && wz > q.z0 && wz < q.z1)).toBe(true);
  });
});
