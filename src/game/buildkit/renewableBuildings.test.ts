import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';

vi.mock('./materials', () => ({ kitMaterial: () => new THREE.MeshStandardMaterial(), setWindowGlow: () => {} }));
import { KIT } from './kit';
import { buildLayers } from './buildings';

describe('the renewable buildings', () => {
  it('the turbine house keeps its walls once finished: they are the frame layer, which is otherwise the scaffold that comes down', () => {
    const g = buildLayers(KIT.micro_hydro);
    expect(g.userData.keep).toContain('frame');
    expect(g.children.some(c => c.userData.layer === 'frame')).toBe(true);
  });
});
