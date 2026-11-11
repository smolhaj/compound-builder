/**
 * Tilt-shift diorama look (docs/DECISIONS.md, "Tilt-shift diorama"): a band of the picture stays sharp and the top and bottom fall away into
 * blur, with a touch more color and contrast, so the compound reads like a model on a table. Two small full-screen passes (a horizontal and a
 * vertical 9-tap blur whose radius grows with the distance from the band), added after tone mapping and before FXAA. Optional: High quality
 * only, off by default, a toggle in the View panel; the passes are disabled (skipped, no cost) otherwise. It also fades out as the camera comes
 * down to eye level, where a model look would only blur the people. The math below is mirrored by the shader and tested.
 */
import * as THREE from 'three';

/** Screen-space look: the sharp band is centered at `FOCUS` (0 bottom, 1 top), `BAND` either side stays sharp, the blur ramps up over `FEATHER` more. */
export const TILT = { FOCUS: 0.47, BAND: 0.14, FEATHER: 0.32, MAX_BLUR: 0.0105, SAT: 1.16, CONTRAST: 1.07 } as const;

const smooth = (a: number, b: number, x: number): number => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** 0..1: how much of the look to apply for a camera whose look direction has vertical component `dirY` (-1 straight down). Nothing below about 17 degrees down, all of it from 37. */
export const tiltStrength = (dirY: number): number => smooth(0.3, 0.6, -dirY);

/** 0..1: the blur at screen height `y` (0..1), zero inside the sharp band. */
export const tiltBlur = (y: number, focus: number = TILT.FOCUS, band: number = TILT.BAND, feather: number = TILT.FEATHER): number => smooth(band, band + feather, Math.abs(y - focus));

/** Nine gaussian taps (sigma about 2), offsets -4..4, weights summing to 1. */
export const TAPS = [0.0276, 0.0663, 0.1238, 0.1801, 0.2045, 0.1801, 0.1238, 0.0663, 0.0276] as const;

const SHADER_COMMON = /* glsl */`
  uniform sampler2D tDiffuse;
  uniform float uStrength;
  uniform float uFocus;
  uniform float uBand;
  uniform float uFeather;
  uniform float uMaxBlur;
  uniform float uAspect;
  varying vec2 vUv;
  float blurAt(float y) {
    float d = abs(y - uFocus);
    float t = clamp((d - uBand) / uFeather, 0.0, 1.0);
    return t * t * (3.0 - 2.0 * t);
  }
`;
const VERT = /* glsl */`varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

function blurShader(horizontal: boolean) {
  return {
    uniforms: {
      tDiffuse: { value: null as THREE.Texture | null },
      uStrength: { value: 0 },
      uFocus: { value: TILT.FOCUS },
      uBand: { value: TILT.BAND },
      uFeather: { value: TILT.FEATHER },
      uMaxBlur: { value: TILT.MAX_BLUR },
      uAspect: { value: 1.6 },
      uSat: { value: TILT.SAT },
      uContrast: { value: TILT.CONTRAST },
    },
    vertexShader: VERT,
    fragmentShader: /* glsl */`
      ${SHADER_COMMON}
      uniform float uSat;
      uniform float uContrast;
      void main() {
        float b = blurAt(vUv.y) * uStrength;
        // the radius is a share of the screen height; the horizontal pass divides by the aspect so the blur is round
        vec2 axis = ${horizontal ? 'vec2(1.0 / uAspect, 0.0)' : 'vec2(0.0, 1.0)'};
        vec2 stepv = axis * (uMaxBlur * b * 0.25);
        float w[9];
        w[0] = 0.0276; w[1] = 0.0663; w[2] = 0.1238; w[3] = 0.1801; w[4] = 0.2045; w[5] = 0.1801; w[6] = 0.1238; w[7] = 0.0663; w[8] = 0.0276;
        vec4 sum = vec4(0.0);
        for (int i = 0; i < 9; i++) sum += texture2D(tDiffuse, vUv + stepv * float(i - 4)) * w[i];
        ${horizontal ? '' : `
        // the model look: a little more color and contrast, in the same strength
        float l = dot(sum.rgb, vec3(0.2126, 0.7152, 0.0722));
        vec3 c = mix(vec3(l), sum.rgb, mix(1.0, uSat, uStrength));
        c = (c - 0.5) * mix(1.0, uContrast, uStrength) + 0.5;
        sum.rgb = clamp(c, 0.0, 1.0);`}
        gl_FragColor = sum;
      }
    `,
  };
}

export const TiltShiftH = blurShader(true);
export const TiltShiftV = blurShader(false);
