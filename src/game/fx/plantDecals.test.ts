import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { DECAL_CELLS, cellRect, decalBox, decalCylinder, withDecalAttrs } from './plantDecals';
import { plantLayout } from '../../sim/dome/plant';

describe('plant decal atlas', () => {
  it('has sixteen distinct, in-range cell rectangles', () => {
    expect(DECAL_CELLS.length).toBe(16);
    const seen = new Set<string>();
    for (const c of DECAL_CELLS) { const r = cellRect(c); expect(r[0]).toBeGreaterThanOrEqual(0); expect(r[2]).toBeLessThanOrEqual(1); expect(r[1]).toBeGreaterThanOrEqual(0); expect(r[3]).toBeLessThanOrEqual(1); expect(r[2]).toBeGreaterThan(r[0]); seen.add(r.join(',')); }
    expect(seen.size).toBe(16);
  });
  it('points only the chosen faces of a box at a cell, and flags a lit cell 2', () => {
    const g = decalBox(new THREE.BoxGeometry(1, 1, 0.01), 'louver', 'z'), dec = g.getAttribute('aDec');
    expect(Array.from({ length: 24 }, (_, i) => dec.getX(i)).filter(v => v === 1).length).toBe(8);
    const l = decalBox(new THREE.BoxGeometry(1, 0.01, 1), 'light', 'ny'), d2 = l.getAttribute('aDec');
    expect(Array.from({ length: 24 }, (_, i) => d2.getX(i)).filter(v => v === 2).length).toBe(4);
    const [u0, , u1] = cellRect('louver'), uv = g.getAttribute('uv');
    for (let i = 16; i < 24; i++) { expect(uv.getX(i)).toBeGreaterThanOrEqual(u0 - 1e-6); expect(uv.getX(i)).toBeLessThanOrEqual(u1 + 1e-6); }
  });
  it('wraps a cylinder side and gives merge-ready attributes to plain geometry', () => {
    const c = decalCylinder(new THREE.CylinderGeometry(0.1, 0.1, 0.2, 12), 'ribs');
    expect(c.getAttribute('aDec').getX(0)).toBe(1);
    const plain = new THREE.BoxGeometry(1, 1, 1); plain.deleteAttribute('uv'); withDecalAttrs([plain]);
    expect(plain.getAttribute('aDec').count).toBe(24); expect(plain.getAttribute('uv').count).toBe(24);
  });
  it('the arcology yard uses decal plates (louvers, fins, warnings, lit panels) instead of stacked slats', () => {
    const p = plantLayout('arcology', 8.97, 'closed', { rot: 1 });
    const cells = new Set(p.parts.filter(q => q.decal).map(q => q.decal!.cell));
    for (const c of ['louver', 'fins', 'hv', 'danger', 'plate', 'airin', 'light']) expect(cells.has(c)).toBe(true);
    for (const q of p.parts) if (q.decal) expect((DECAL_CELLS as readonly string[]).includes(q.decal.cell)).toBe(true);
    expect(p.parts.some(q => q.soft !== undefined)).toBe(true);
  });
});
