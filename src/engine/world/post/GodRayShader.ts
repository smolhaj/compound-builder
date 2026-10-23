/**
 * GodRayShader — screen-space crepuscular rays (light shafts) at golden hour.
 *
 * A radial march from each pixel toward the sun's screen position gathers the
 * bright sky that lies near the sun; where buildings, trees or cloud cover the
 * sun's glow the march finds dark pixels, so the shafts fan out through the
 * gaps between them. Runs in linear HDR before bloom (after the HDR clamp, so
 * the sun disc can't flood it). 24 taps, only enabled while the sun is low,
 * on or near the screen and the sky has broken cloud (skyState.godRayStrength)
 * — the pass is switched off the rest of the time.
 */
import * as THREE from 'three';

export const GodRayShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uSun: { value: new THREE.Vector2(0.5, 0.5) },
    uStrength: { value: 0 },
    uTint: { value: new THREE.Color(1, 0.7, 0.4) },
    uAspect: { value: 1.6 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform vec2 uSun;
    uniform float uStrength;
    uniform vec3 uTint;
    uniform float uAspect;
    varying vec2 vUv;
    void main() {
      vec4 base = texture2D(tDiffuse, vUv);
      vec2 stepv = (vUv - uSun) * (0.9 / 24.0);
      vec2 uv = vUv;
      float illum = 0.0;
      float decay = 1.0;
      for (int i = 0; i < 24; i++) {
        uv -= stepv;
        vec3 c = texture2D(tDiffuse, clamp(uv, 0.0, 1.0)).rgb;
        float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
        vec2 dd = (uv - uSun) * vec2(uAspect, 1.0);
        float near = exp(-dot(dd, dd) * 12.0);
        illum += smoothstep(0.9, 1.7, l) * near * decay;
        decay *= 0.94;
      }
      illum /= 24.0;
      gl_FragColor = vec4(base.rgb + uTint * illum * uStrength * 0.9, base.a);
    }
  `,
};
