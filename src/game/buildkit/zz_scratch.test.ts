import { it, vi } from 'vitest';
import * as THREE from 'three';
vi.mock('./materials', () => ({ kitMaterial: () => new THREE.MeshStandardMaterial(), setWindowGlow: () => {} }));
import { KIT } from './kit';
import { DOME_BUILDERS } from './domeBuildings';
it('keys', () => {
  const g = DOME_BUILDERS['dome_arcology'](KIT['dome_arcology'], 1, { port: 2.46 });
  let tot = 0; const rows: string[] = [];
  g.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) { const n = (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3; tot += n; rows.push(`${m.name} ${n}`); } });
  console.log(rows.join('\n'), '\nTOTAL', tot, rows.length);
});
