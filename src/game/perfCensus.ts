import * as THREE from 'three';

/**
 * A census of what the scene would ask the GPU to draw, counted from the scene graph (no GL needed, so it runs in CI):
 * draw calls (one per visible mesh / line / points / sprite, per material), triangles, shadow casters and the triangles
 * they put in the shadow pass. It ignores frustum culling (counts everything visible in the graph), so it is an upper bound
 * that does not depend on where the camera looks.
 */
export interface Census {
  drawCalls: number;
  triangles: number;
  meshes: number;
  instancedMeshes: number;
  shadowCasters: number;
  shadowTriangles: number;
  lights: number;
  shadowLights: number;
  /** Top-level groups by draw calls, for finding what to cut. */
  top: Array<{ label: string; calls: number; tris: number; casters: number }>;
}

const triOf = (m: THREE.Mesh): number => {
  const g = m.geometry as THREE.BufferGeometry;
  const n = g.index ? g.index.count : (g.attributes.position?.count ?? 0);
  const dr = g.drawRange, c = Math.min(n - dr.start, dr.count === Infinity ? n : dr.count);
  const per = (m as THREE.InstancedMesh).isInstancedMesh ? Math.max(0, (m as THREE.InstancedMesh).count) : 1;
  return Math.max(0, Math.floor(c / 3)) * per;
};

const visible = (o: THREE.Object3D): boolean => { for (let p: THREE.Object3D | null = o; p; p = p.parent) if (!p.visible) return false; return true; };

export function sceneCensus(scene: THREE.Object3D): Census {
  const out: Census = { drawCalls: 0, triangles: 0, meshes: 0, instancedMeshes: 0, shadowCasters: 0, shadowTriangles: 0, lights: 0, shadowLights: 0, top: [] };
  for (const top of scene.children) {
    let calls = 0, tris = 0, casters = 0;
    top.traverse(o => {
      const l = o as THREE.Light;
      if (l.isLight && visible(o)) { out.lights++; if (l.castShadow) out.shadowLights++; }
      const m = o as THREE.Mesh;
      const drawable = m.isMesh || (o as THREE.Line).isLine || (o as THREE.Points).isPoints || (o as THREE.Sprite).isSprite;
      if (!drawable || !visible(o)) return;
      const nm = Array.isArray(m.material) ? m.material.length : 1;
      calls += nm;
      if (m.isMesh) {
        out.meshes++; if ((m as THREE.InstancedMesh).isInstancedMesh) out.instancedMeshes++;
        const t = triOf(m); tris += t;
        if (m.castShadow) { casters++; out.shadowTriangles += t; }
      }
    });
    out.drawCalls += calls; out.triangles += tris; out.shadowCasters += casters;
    out.top.push({ label: top.name || top.type, calls, tris, casters });
  }
  out.top.sort((a, b) => b.calls - a.calls);
  out.top = out.top.slice(0, 12);
  return out;
}
