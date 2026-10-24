/**
 * edgeHaze — the modelled world ends ~2 km out (the regional landscape is a
 * ±R_MAX square). Near that edge the ground and water dissolve into exactly
 * the color the sky dome shows in the same view direction (ProceduralSky
 * SKY_HORIZON_GLSL), so from a high oblique camera the land fades into the
 * distance haze instead of ending in a hard "table edge" over the flat
 * below-horizon sky — also where the camera's far plane would cut it.
 */
import type * as THREE from 'three';
import { SKY_HORIZON_GLSL, skyHorizonUniforms } from '../sky/ProceduralSky';

/**
 * Chain an edge-haze pass onto `mat` (after its own onBeforeCompile, after
 * fog). `center` is the world center of the square; the haze ramps in over
 * [from, to] units of Chebyshev distance from it.
 */
export function applyEdgeHaze(mat: THREE.Material, center: [number, number], from: number, to: number): void {
  const prev = mat.onBeforeCompile;
  const prevKey = mat.customProgramCacheKey?.bind(mat);
  mat.onBeforeCompile = (sh, renderer) => {
    prev.call(mat, sh, renderer);
    const skyU = skyHorizonUniforms();
    if (!skyU) return;
    Object.assign(sh.uniforms, skyU, { uEHCenter: { value: center }, uEHRange: { value: [from, to] } });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vEHPos;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvEHPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vEHPos;\nuniform vec2 uEHCenter;\nuniform vec2 uEHRange;\n' + SKY_HORIZON_GLSL)
      .replace('#include <fog_fragment>', /* glsl */`#include <fog_fragment>
        {
          float ehD = max(abs(vEHPos.x - uEHCenter.x), abs(vEHPos.z - uEHCenter.y));
          // ...and before the camera's far plane (2600) clips it from far-out views
          float ehK = max(smoothstep(uEHRange.x, uEHRange.y, ehD), smoothstep(1750.0, 2560.0, length(vEHPos - cameraPosition)));
          if (ehK > 0.0) gl_FragColor.rgb = mix(gl_FragColor.rgb, skyHorizonColor(normalize(vEHPos - cameraPosition)), ehK);
        }`);
  };
  mat.customProgramCacheKey = () => (prevKey ? prevKey() : '') + '|edgehaze' + (skyHorizonUniforms() ? '1' : '0');
}
