/**
 * ColorGradingShader
 * Custom Three.js ShaderPass for cinematic color grading.
 *
 * Operates in LINEAR HDR space — must be placed BEFORE OutputPass in the
 * EffectComposer chain (OutputPass applies ACESFilmic + sRGB conversion).
 *
 * Stacked effects:
 *   1. S-curve contrast  — smoothstep-based, symmetric, adjustable strength
 *   2. Saturation boost  — luma-preserving interpolation (not naive RGB shift)
 *   3. Warm highlights   — amber/golden tint applied via luminance gate;
 *                          mimics the warm look of Sims 4 / Two Point Campus
 *   4. Split toning      — faint cool tint in the shadows (sky-lit shade is
 *                          blue in reality; gives the image depth)
 *   5. Night vision      — Purkinje shift: as `uNight` → 1 dark tones lose
 *                          saturation and drift blue (scotopic vision) while
 *                          bright emissives (windows, lamps) keep their warmth
 *   6. Vignette          — soft optical falloff toward the corners
 *
 * All parameters are uniforms → runtime-adjustable per season/time without
 * shader recompile. Costs ~30 ALU ops per pixel on a fullscreen quad.
 */
import type { IUniform } from 'three';

export const ColorGradingShader: {
  uniforms: Record<string, IUniform>;
  vertexShader: string;
  fragmentShader: string;
} = {
  uniforms: {
    /** The EffectComposer render target (set automatically by ShaderPass) */
    tDiffuse: { value: null },

    /**
     * S-curve contrast strength [0, 1].
     * 0 = identity, 0.5 = mild punch (default), 1.0 = full smoothstep contrast.
     */
    uContrast: { value: 0.50 },

    /**
     * Saturation multiplier.
     * 1.0 = unchanged, 1.12 = +12% (default), 0.0 = grayscale.
     */
    uSaturation: { value: 1.12 },

    /**
     * Strength of warm highlight tint [0, 1].
     * 0 = no tint, 0.18 = subtle amber glow (default).
     */
    uWarmStrength: { value: 0.18 },

    /**
     * Linear luminance threshold above which warm tint begins.
     * 0.55 means only bright surfaces (lit by sun) receive the tint.
     */
    uWarmThreshold: { value: 0.55 },

    /**
     * Warm tint color in linear space.
     * Default: amber/golden (1.0, 0.82, 0.50).
     */
    uWarmColor: { value: { r: 1.0, g: 0.82, b: 0.50 } },

    /** Cool shadow tint (linear RGB multiplier applied to dark tones). */
    uShadowTint: { value: { r: 0.90, g: 0.96, b: 1.08 } },
    /** Split-tone strength [0, 1]. */
    uShadowTintStrength: { value: 0.5 },

    /** 0 = day, 1 = full night (Purkinje shift). Driven by CampusScene.updateDayNight. */
    uNight: { value: 0.0 },

    /** Vignette strength [0, 1]: corner darkening fraction. */
    uVignette: { value: 0.22 },
  },

  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,

  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float uContrast;
    uniform float uSaturation;
    uniform float uWarmStrength;
    uniform float uWarmThreshold;
    uniform vec3  uWarmColor;
    uniform vec3  uShadowTint;
    uniform float uShadowTintStrength;
    uniform float uNight;
    uniform float uVignette;

    varying vec2 vUv;

    // ITU-R BT.709 luminance — correct for linear sRGB primaries.
    float luma(vec3 c) {
      return dot(c, vec3(0.2126, 0.7152, 0.0722));
    }

    // S-curve contrast using smoothstep.
    // mix(x, smoothstep(0,1,x), strength):
    //   • At strength=0: identity passthrough
    //   • At strength=1: full smoothstep (compressed shadows/highlights)
    //   • Symmetric around perceptual mid-gray; HDR values above 1.0 pass through
    vec3 sCurve(vec3 color, float strength) {
      // Apply the curve in approximate perceptual (gamma 2.2) space. Running
      // smoothstep directly on linear HDR values crushed every midtone
      // (linear 0.15 → 0.06) and clipped anything above 1.0, which made the
      // whole scene look like dusk at noon. HDR headroom above 1.0 is carried
      // through untouched so bloom and tone mapping still see it.
      vec3 p    = pow(max(color, vec3(0.0)), vec3(1.0 / 2.2));
      vec3 lo   = min(p, vec3(1.0));
      vec3 over = p - lo;
      vec3 curved = mix(lo, smoothstep(vec3(0.0), vec3(1.0), lo), strength * 0.45);
      return pow(curved + over, vec3(2.2));
    }

    // Luma-preserving saturation adjustment.
    // Interpolates toward the grayscale value rather than mixing with (0.5,0.5,0.5),
    // which keeps perceptual brightness constant as saturation changes.
    vec3 adjustSaturation(vec3 color, float saturation) {
      float gray = luma(color);
      return mix(vec3(gray), color, saturation);
    }

    // Warm highlight tint.
    // Applies amber/golden tint to pixels above uWarmThreshold luminance.
    // Uses a smoothstep gate with a 0.25 transition band for a soft blend.
    // The tint multiplies the existing color (not additive) to avoid blowout.
    vec3 warmHighlights(vec3 color, vec3 warmColor, float strength, float threshold) {
      float brightness = luma(color);
      // Gate: 0 below threshold, smoothly 1 above (0.25 unit transition band)
      float gate = smoothstep(threshold, threshold + 0.25, brightness);
      // Hue-shift toward warmColor while preserving luminance, so the tint
      // warms sunlit surfaces instead of darkening them.
      vec3 tinted = color * warmColor;
      tinted *= brightness / max(luma(tinted), 1e-4);
      return mix(color, tinted, gate * strength);
    }

    void main() {
      vec4 texel = texture2D(tDiffuse, vUv);
      vec3 color = texel.rgb;

      // 1. S-curve contrast (perceptual space — symmetric around midtones)
      color = sCurve(color, uContrast);

      // 2. Saturation boost (luma-preserving)
      color = adjustSaturation(color, uSaturation);

      // 3. Warm highlight tint (amber on bright sun-lit surfaces)
      color = warmHighlights(color, uWarmColor, uWarmStrength, uWarmThreshold);

      // 4. Split toning: cool the shadows (luma-preserving tint weight).
      float l = luma(color);
      float shadowW = (1.0 - smoothstep(0.0, 0.18, l)) * uShadowTintStrength;
      color *= mix(vec3(1.0), uShadowTint, shadowW);

      // 5. Night (Purkinje) — rods take over in the dark: desaturate + blue
      //    shift everything below ~0.35 linear; emissive highlights are kept.
      if (uNight > 0.001) {
        float lum = luma(color);
        float scot = uNight * (1.0 - smoothstep(0.03, 0.40, lum));
        vec3 blueShift = vec3(lum) * vec3(0.62, 0.84, 1.45);
        color = mix(color, blueShift, scot * 0.55);
      }

      // 6. Vignette — smooth radial falloff, aspect-agnostic.
      vec2 vc = vUv - 0.5;
      float vig = 1.0 - smoothstep(0.35, 0.95, length(vc) * 1.25);
      color *= mix(1.0, vig, uVignette);

      gl_FragColor = vec4(color, texel.a);
    }
  `,
};

/**
 * Season-aware parameter presets.
 * Call WorldScene.setSeasonGrade(season) to apply.
 */
export const COLOR_GRADING_PRESETS: Record<string, {
  uContrast: number;
  uSaturation: number;
  uWarmStrength: number;
  uWarmThreshold: number;
  uWarmColor: { r: number; g: number; b: number };
}> = {
  spring: {
    uContrast:      0.48,
    uSaturation:    1.07,   // slightly more vivid — fresh growth
    uWarmStrength:  0.14,
    uWarmThreshold: 0.58,
    uWarmColor:     { r: 1.0, g: 0.90, b: 0.60 }, // softer, cooler golden
  },
  summer: {
    uContrast:      0.50,
    uSaturation:    1.04,
    uWarmStrength:  0.18,
    uWarmThreshold: 0.55,
    uWarmColor:     { r: 1.0, g: 0.82, b: 0.50 }, // warm amber
  },
  fall: {
    uContrast:      0.55,
    uSaturation:    1.00,   // slightly muted overall
    uWarmStrength:  0.30,   // stronger amber — autumn golden hour look
    uWarmThreshold: 0.42,   // lower threshold — tints more of the scene
    uWarmColor:     { r: 1.0, g: 0.68, b: 0.32 }, // deep amber/orange
  },
  winter: {
    uContrast:      0.40,
    uSaturation:    0.90,   // desaturated — cold, overcast
    uWarmStrength:  0.05,   // almost no warm tint
    uWarmThreshold: 0.70,
    uWarmColor:     { r: 0.90, g: 0.92, b: 1.00 }, // slight cool blue tint on brights
  },
};
