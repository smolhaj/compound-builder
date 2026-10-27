import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
vi.mock('../buildkit/materials', () => ({ kitMaterial: () => new THREE.MeshBasicMaterial() }));
import { buildTunnel } from './tunnelGeometry';
import { tunnelPath } from '../buildkit/tunnelPath';

describe('underground passage geometry', () => {
  it('draws a vault and a hatch chamber at both ends', () => {
    const ground = () => 1;
    const { samples } = tunnelPath([[24, 37], [44, 37]], -1.2, ground);
    const one = buildTunnel(samples, ground, 1, 0);
    const two = buildTunnel(samples, ground, 1, 0, { woodsStart: 0 });
    const verts = (g: { children: Array<{ geometry?: { getAttribute: (n: string) => { count: number } } }> }) => g.children.reduce((a, c) => a + (c.geometry?.getAttribute('position').count ?? 0), 0);
    expect(two.userData.passage).toBe(true);
    expect(verts(two as never)).toBeGreaterThan(verts(one as never));
    expect(two.children.some(c => c.userData.part === 'lower')).toBe(true);
    expect(two.children.some(c => c.userData.part === 'upper')).toBe(true);
  });
});
