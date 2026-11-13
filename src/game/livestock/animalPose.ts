/** The vertex shader's skeleton maths in plain TS (tests and QA): where a rest-pose point of the model ends up for a given animation state. */
import type { AnimalMaterialSpec } from './animalMaterial';
import type { V3 } from './animalKit';

export interface AnimState { phase: number; gait: number; graze: number; seed: number; time: number }

function rot(v: V3, a: number, ax: number): V3 {
  const c = Math.cos(a), s = Math.sin(a);
  if (ax === 0) return [v[0], v[1] * c + v[2] * s, -v[1] * s + v[2] * c];
  if (ax === 1) return [v[0] * c - v[1] * s, v[0] * s + v[1] * c, v[2]];
  return [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c];
}

export function boneAngle(spec: AnimalMaterialSpec, b: number, st: AnimState): number {
  const bo = spec.bones[b];
  if (!bo) return 0;
  const ph = st.phase + (bo.off ?? 0);
  let a = (bo.bias ?? 0) + st.gait * ((bo.swing ?? 0) * Math.sin(ph) + (bo.flex ?? 0) * Math.max(0, Math.cos(ph)));
  a += st.graze * (bo.graze ?? 0);
  let s = Math.sin(st.time * (bo.idleFreq ?? 1) + st.seed * 6.2831 * (bo.idlePh ?? 0) + st.seed * 11);
  if (bo.pulse) s = Math.sign(s) * Math.pow(Math.abs(s), 9);
  a += (bo.idle ?? 0) * s * (1 - 0.8 * st.gait);
  a += st.graze * (bo.bob ?? 0) * Math.sin(st.time * spec.grazeFreq + st.seed * 7 + (bo.idlePh ?? 0) * 3);
  return a;
}

/** A rest-pose point attached to bone `b` (one bone, no blending), posed. Root bob and pitch included. */
export function posePoint(spec: AnimalMaterialSpec, p: V3, b: number, st: AnimState): V3 {
  let q: V3 = [p[0], p[1], p[2]], bi = b;
  for (let i = 0; i < 6 && bi >= 0; i++) {
    const bo = spec.bones[bi];
    if (!bo) break;
    const d = rot([q[0] - bo.pivot[0], q[1] - bo.pivot[1], q[2] - bo.pivot[2]], boneAngle(spec, bi, st), bo.axis ?? 0);
    q = [d[0] + bo.pivot[0], d[1] + bo.pivot[1], d[2] + bo.pivot[2]];
    bi = bo.parent;
  }
  const r = spec.root, bob = r.hop ? Math.max(0, Math.sin(st.phase)) : Math.abs(Math.sin(st.phase));
  const rp = r.pitch * st.gait * Math.cos(st.phase * (r.hop ? 1 : 2)) + st.graze * (r.grazePitch ?? 0);
  const d = rot([q[0], q[1] - r.cy, q[2] - r.cz], rp, 0);
  return [d[0], d[1] + r.cy + r.bob * st.gait * bob, d[2] + r.cz];
}
