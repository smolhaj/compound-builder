/**
 * ProceduralSky
 *
 * Analytic, fully procedural sky dome used as the scene background and as the
 * source for the IBL (PMREM) bake. Replaces three's Preetham `Sky` object,
 * whose horizon band read as a flat white wall from street level and whose
 * ~19000× sun disc overflowed the half-float PMREM targets (NaN → black).
 *
 * Model (all linear HDR, bounded — no term can exceed a few units):
 *   • zenith → horizon gradient; the horizon color is azimuth-dependent so the
 *     sun side of the sky warms at golden hour while the anti-sun side stays
 *     rose/violet (Belt-of-Venus look);
 *   • thin horizon haze band so the skyline dissolves into the sky;
 *   • Mie-style forward-scatter glow + a crisp sun disc;
 *   • two-sample fbm cloud deck projected onto a virtual plane, lit with a
 *     cheap directional self-shadow term and a silver lining toward the sun;
 *   • night: deep-blue gradient, warm city light-pollution glow along the
 *     horizon and a halo around the moon (the moon mesh + star points live in
 *     WorldScene and are drawn in front of the dome).
 *
 * The dome is a unit sphere rotated with the camera but never translated
 * (view-rotation only, z = w), so it always sits at the far plane, needs no
 * frustum culling and costs one fullscreen-ish pass of ALU work. The BAKE
 * variant (no clouds / no disc, ground hemisphere below the horizon) shares
 * the same uniforms and feeds PMREMGenerator for reflections.
 *
 * Procedural only — no textures, no external assets.
 */
import * as THREE from 'three';

export interface SkyPalette {
  zenith: THREE.Color;
  horizonSun: THREE.Color;
  horizonAnti: THREE.Color;
  /** Fog / aerial-perspective color. Matches the horizon so distance dissolves into the sky. */
  fog: THREE.Color;
  sunColor: THREE.Color;
  sunDisc: number;
  sunGlow: number;
  cloudLit: THREE.Color;
  cloudShade: THREE.Color;
  cloudCover: number;
  /** Additive horizon glow (city light pollution at night). */
  glow: THREE.Color;
}

const C = (r: number, g: number, b: number) => new THREE.Color(r, g, b);

/** Palette anchors in linear RGB. Blended by time-of-day weights in WorldScene. */
export const SKY_PALETTES: Record<'day' | 'golden' | 'dawn' | 'night', SkyPalette> = {
  day: {
    zenith:      C(0.040, 0.120, 0.380),
    horizonSun:  C(0.380, 0.480, 0.640),
    horizonAnti: C(0.300, 0.405, 0.590),
    fog:         C(0.300, 0.390, 0.530),
    sunColor:    C(1.000, 0.950, 0.860),
    sunDisc:     14,
    sunGlow:     0.45,
    cloudLit:    C(0.980, 0.980, 1.000),
    cloudShade:  C(0.500, 0.560, 0.680),
    cloudCover:  0.48,
    glow:        C(0, 0, 0),
  },
  golden: {
    zenith:      C(0.055, 0.080, 0.220),
    horizonSun:  C(1.050, 0.480, 0.150),
    horizonAnti: C(0.300, 0.230, 0.340),
    fog:         C(0.460, 0.330, 0.270),
    sunColor:    C(1.000, 0.560, 0.220),
    sunDisc:     10,
    sunGlow:     1.30,
    cloudLit:    C(1.000, 0.560, 0.320),
    cloudShade:  C(0.260, 0.180, 0.240),
    cloudCover:  0.46,
    glow:        C(0, 0, 0),
  },
  dawn: {
    zenith:      C(0.070, 0.110, 0.280),
    horizonSun:  C(1.000, 0.600, 0.330),
    horizonAnti: C(0.360, 0.300, 0.420),
    fog:         C(0.480, 0.400, 0.380),
    sunColor:    C(1.000, 0.700, 0.420),
    sunDisc:     10,
    sunGlow:     1.10,
    cloudLit:    C(1.000, 0.700, 0.560),
    cloudShade:  C(0.300, 0.250, 0.320),
    cloudCover:  0.40,
    glow:        C(0, 0, 0),
  },
  night: {
    zenith:      C(0.0025, 0.0050, 0.0150),
    horizonSun:  C(0.0140, 0.0210, 0.0420),
    horizonAnti: C(0.0140, 0.0210, 0.0420),
    fog:         C(0.0120, 0.0175, 0.0330),
    sunColor:    C(0, 0, 0),
    sunDisc:     0,
    sunGlow:     0,
    cloudLit:    C(0.040, 0.046, 0.066),
    cloudShade:  C(0.010, 0.013, 0.022),
    cloudCover:  0.30,
    glow:        C(0.030, 0.020, 0.011),
  },
};

const VERT = /* glsl */`
  varying vec3 vDir;
  void main() {
    vDir = position;
    // Rotate with the camera but never translate: the dome is always centered
    // on the eye. z = w pins it to the far plane.
    vec4 p = projectionMatrix * vec4(mat3(viewMatrix) * position, 1.0);
    gl_Position = p.xyww;
  }
`;

const FRAG = /* glsl */`
  uniform vec3  uSunDir;
  uniform vec3  uMoonDir;
  uniform vec3  uZenith;
  uniform vec3  uHorizonSun;
  uniform vec3  uHorizonAnti;
  uniform vec3  uGround;
  uniform vec3  uSunColor;
  uniform vec3  uGlow;
  uniform vec3  uCloudLit;
  uniform vec3  uCloudShade;
  uniform float uSunDisc;
  uniform float uSunGlow;
  uniform float uCloudCover;
  uniform float uNight;
  uniform float uTime;
  // Weather layers (WorldScene.setWeather)
  uniform float uCumulus;
  uniform float uCirrus;
  uniform float uStratus;
  uniform float uStorm;
  uniform float uDistant;
  uniform vec2  uStormAz;
  uniform float uFlash;
  uniform float uBolt;
  uniform vec2  uBoltAz;
  uniform float uBoltSeed;
  uniform float uHaze;
  uniform vec2  uWind;
  // Night sky
  uniform float uStars;
  uniform float uMilky;
  uniform float uMoonPhase;
  uniform float uMoonBright;
  uniform vec3  uStadDir;
  uniform float uStadGlow;
  uniform float uSmoke;
  // Events on the skyline (sim/collapseLook.ts): x the far town's lights, y distant gunfire, z the far road's headlights, w fires in an arc
  uniform vec4  uSkyA;
  // x a convoy on the road, y twilight (the golden / dawn weight), z an aurora, w a comet
  uniform vec4  uSkyB;
  // bearings (radians) of the town, the far road, the fires, the fighting
  uniform vec4  uAz;
  varying vec3 vDir;

  float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }
  float hash13(vec3 p3) {
    p3 = fract(p3 * 0.1031);
    p3 += dot(p3, p3.zyx + 31.32);
    return fract((p3.x + p3.y) * p3.z);
  }
  float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = hash12(i);
    float b = hash12(i + vec2(1.0, 0.0));
    float c = hash12(i + vec2(0.0, 1.0));
    float d = hash12(i + vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }
  const mat2 FBM_M = mat2(1.6, 1.2, -1.2, 1.6);
  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 5; i++) { v += a * vnoise(p); p = FBM_M * p; a *= 0.5; }
    return v;
  }
  float fbm3(vec2 p) {
    float v = 0.5 * vnoise(p); p = FBM_M * p;
    v += 0.25 * vnoise(p); p = FBM_M * p;
    v += 0.125 * vnoise(p);
    return v / 0.875;
  }
  float fbm4(vec2 p) {
    float v = 0.5 * vnoise(p); p = FBM_M * p;
    v += 0.25 * vnoise(p); p = FBM_M * p;
    v += 0.125 * vnoise(p); p = FBM_M * p;
    v += 0.0625 * vnoise(p);
    return v / 0.9375;
  }

  // One layer of stars: a jittered point per occupied cell of a 3D grid around
  // the unit sphere, drawn as a ~1.5 px Gaussian (px = angular pixel size).
  float starLayer(vec3 d, float scale, float prob, float px) {
    vec3 c = floor(d * scale);
    if (hash13(c) > prob) return 0.0;
    vec3 o = vec3(hash13(c + 11.1), hash13(c + 23.7), hash13(c + 37.3)) * 0.4 + 0.3;
    vec3 sp = normalize(c + o);
    float a = length(cross(d, sp));
    float mag = pow(hash13(c + 5.3), 5.0);
    float tw = 0.75 + 0.25 * sin(uTime * (2.0 + 3.0 * hash13(c + 9.1)) + hash13(c + 2.2) * 40.0);
    // pinpoints: a ~1 px core whose peak stays under the night bloom threshold
    // (only the few brightest stars glint), most stars faint
    return (0.015 + 0.55 * mag) * tw * exp(-a * a / (px * px * 0.35));
  }

  void main() {
    vec3 d = normalize(vDir);
    float h  = d.y;
    float hp = max(h, 0.0);

    // Azimuth relative to the sun: 1 = facing the sun, 0 = facing away.
    vec2 dxz = normalize(d.xz + vec2(1e-5));
    vec2 sxz = normalize(uSunDir.xz + vec2(1e-5));
    float az = clamp(dot(dxz, sxz) * 0.5 + 0.5, 0.0, 1.0);
    vec3 horizon = mix(uHorizonAnti, uHorizonSun, az * az);

    // Zenith gradient — horizon color dominates the lowest ~15° (optical depth).
    float g = 1.0 - exp(-hp * 3.2);
    vec3 sky = mix(horizon, uZenith, g);
    // Haze band hugging the horizon: thick in a humid Gulf summer, thin in crisp fall air.
    sky += horizon * (0.06 + 0.2 * uHaze) * exp(-hp * 24.0);
    // City light pollution / residual twilight glow.
    sky += uGlow * exp(-hp * 7.0);
    // Twilight (dawn and dusk): layered bands instead of one wash. Toward the sun yellow at the horizon, orange, rose, then violet; away from it a
    // pink belt over the Earth's blue shadow. Fades to nothing by day and by night (uSkyB.y is the golden weight).
    if (uSkyB.y > 0.001) {
      float tw = uSkyB.y;
      vec3 ramp = mix(vec3(1.0, 0.70, 0.28), vec3(1.0, 0.40, 0.14), smoothstep(0.0, 0.07, hp));
      ramp = mix(ramp, vec3(0.78, 0.30, 0.40), smoothstep(0.06, 0.18, hp));
      ramp = mix(ramp, vec3(0.30, 0.22, 0.50), smoothstep(0.16, 0.42, hp));
      ramp *= 1.0 - 0.7 * smoothstep(0.0, 0.5, hp);
      sky = mix(sky, ramp, clamp(tw * az * az * exp(-hp * 4.5) * 0.7, 0.0, 0.85));
      float away = 1.0 - az;
      float bq = (hp - 0.075) / 0.06;
      float beltW = exp(-bq * bq);
      sky = mix(sky, vec3(0.50, 0.27, 0.33), tw * away * 0.5 * beltW);
      sky = mix(sky, vec3(0.10, 0.14, 0.34), tw * away * 0.38 * smoothstep(0.1, 0.3, hp) * (1.0 - smoothstep(0.4, 0.9, hp)));
    }
    // Columns of smoke on the skyline (lawless towns, a war, a wildfire): dark leaning plumes that widen as they rise, lit orange from below at night.
    if (uSmoke > 0.001) {
      float azs = atan(d.x, d.z);
      float dens = 0.0, root = 0.0;
      for (int i = 0; i < 7; i++) {
        float fi = float(i);
        // (clusters round the compass: a few columns are always somewhere in view)
        float a0 = 0.5 + fi * 0.9 + 0.55 * sin(fi * 2.3);
        float da = azs - a0; da = atan(sin(da), cos(da));
        float top = 0.30 + 0.16 * fract(fi * 0.618);
        float lean = hp * (0.7 + 0.15 * fi) * (mod(fi, 2.0) < 1.0 ? 1.0 : -0.8);
        float wid = 0.016 + hp * 0.34;
        float x = (da - lean) / wid;
        float col = exp(-x * x) * smoothstep(0.0, 0.010, h) * (1.0 - smoothstep(top * 0.5, top, h));
        col *= 0.6 + 0.8 * fbm3(vec2(da * 48.0 + fi * 9.0, h * 22.0 - uTime * 0.05));
        dens += col;
        root += exp(-x * x * 0.4) * exp(-hp * 40.0);
      }
      dens = clamp(dens, 0.0, 1.0) * uSmoke;
      vec3 smokeCol = mix(horizon, vec3(0.13, 0.095, 0.07), 0.82) * (0.5 + 0.35 * (1.0 - uNight));
      sky = mix(sky, smokeCol, dens * 0.92);
      // the fires underneath light the plumes' bellies and the horizon at their feet
      sky += vec3(1.0, 0.40, 0.09) * dens * exp(-hp * 11.0) * uNight * 0.30;
      sky += vec3(1.0, 0.42, 0.10) * root * uSmoke * (0.07 + 0.30 * uNight);
    }

    // Mie forward scatter around the sun.
    float cosS = dot(d, uSunDir);
    float mu   = max(cosS, 0.0);
    sky += uSunColor * uSunGlow * (0.30 * pow(mu, 10.0) + 0.90 * pow(mu, 160.0));

  #ifndef BAKE
    float cloudOcc = 0.0;
    float px = max(length(fwidth(d)), 1e-5);
    if (h > -0.02) {
      // Aerial perspective: distant clouds melt into the horizon haze.
      float fade = smoothstep(0.0, 0.11, hp);
      vec2 wind = uWind;   // drift offset, accumulated on the CPU (ProceduralSky.tick)

      // ── Cirrus: high, thin, wind-streaked; glows pink after sunset ────────
      if (uCirrus > 0.01) {
        vec2 cu = d.xz / (hp + 0.03) * 0.2 + wind * 0.25;
        cu = vec2(cu.x * 0.35 + cu.y * 0.25, cu.y * 1.9 - cu.x * 0.4);
        float cn = fbm(cu);
        float ci = smoothstep(0.52, 0.86, cn) * uCirrus * 0.6 * fade;
        vec3 cc = mix(uCloudLit, uSunColor, 0.25 * min(1.0, uSunGlow)) * (0.85 + 0.5 * pow(mu, 4.0));
        sky = mix(sky, cc, ci);
        cloudOcc = max(cloudOcc, ci * 0.5);
      }

      // ── Cumulus: puffy low layer, domain-warped billows, self-shadowed,
      //    dark flat bases overhead, rim-lit edges toward a low sun ──────────
      if (uCumulus > 0.01) {
        vec2 uv = d.xz / (hp + 0.05) * 0.7 + wind;
        vec2 wp = vec2(fbm3(uv * 0.45), fbm3(uv * 0.45 + 7.3));
        vec2 uvw = uv + (wp - 0.5) * 1.1;
        float base = fbm4(uvw * 0.9);
        float det = fbm3(uvw * 3.4 + base * 2.0);
        float n = base * 0.74 + det * 0.26;
        float thr = 0.78 - uCumulus * 0.3;
        float dens = smoothstep(thr, thr + 0.07 + 0.06 * uCumulus, n);
        if (dens > 0.001) {
          float n2 = fbm4((uvw + sxz * 0.12) * 0.9) * 0.74 + det * 0.26;
          float thick = smoothstep(thr, thr + 0.3, n);
          float shade = clamp((n - n2) * 7.0 + 0.55, 0.0, 1.0);
          float lit = mix(0.3, 1.0, shade) * (1.0 - 0.5 * thick);
          vec3 cc = mix(uCloudShade, uCloudLit, lit);
          // Seen from beneath, big cumulus have dark, flat bases.
          cc *= 1.0 - 0.3 * thick * smoothstep(0.2, 0.75, hp);
          // Silver lining / sunset rim on the thin edges toward the sun.
          float edge = dens * (1.0 - thick);
          cc += uSunColor * uSunGlow * edge * (0.25 + 2.4 * pow(mu, 5.0));
          cc *= 1.0 - 0.55 * uStorm;
          cc += uGlow * 1.2;
          float a = dens * fade * 0.97;
          sky = mix(sky, mix(horizon, cc, 0.35 + 0.65 * fade), a);
          cloudOcc = max(cloudOcc, a);
        }
      }

      // ── Stratus deck: overcast gray, darker scud racing under it in rain,
      //    near-black slate under a thunderstorm ───────────────────────────
      if (uStratus > 0.01) {
        vec2 su = d.xz / (hp + 0.04) * 0.32 + wind * 0.6;
        float sn = fbm4(su);
        float scud = fbm3(su * 2.4 + wind * 2.5);
        vec3 sc = mix(uCloudShade, uCloudLit, clamp(0.45 + 0.95 * (sn - 0.5), 0.0, 1.0));
        // cloud-base texture: stratocumulus rolls (soft banding across the
        // wind) and darker undersides overhead, lighter toward the horizon
        float roll = 0.5 + 0.5 * sin(dot(su, vec2(2.1, 0.8)) * 2.6 + sn * 5.0);
        // (under overcast the palette's lit / shade grays nearly meet, so the
        // texture is a brightness modulation of its own)
        float base2 = fbm3(su * 4.3 - wind * 1.5);
        sc *= 0.72 + 0.22 * roll + 0.22 * (sn - 0.5) * 2.0 + 0.1 * (base2 - 0.5) * 2.0;
        sc *= 1.0 - 0.26 * smoothstep(0.12, 0.8, hp);
        sc *= 1.0 - 0.22 * smoothstep(0.48, 0.74, scud) * (0.35 + uStorm);
        sc = mix(sc, sc * vec3(0.36, 0.40, 0.45), uStorm * 0.9);
        sc += vec3(0.6, 0.65, 0.85) * uFlash * (0.5 + 0.5 * sn) * 0.9;
        // a low deck over a town glows with its lights at night
        sc += uGlow * 2.2;
        float a = smoothstep(0.0, 1.0, uStratus) * smoothstep(-0.02, 0.04, h);
        sky = mix(sky, mix(horizon, sc, 0.25 + 0.75 * smoothstep(0.0, 0.14, hp)), a);
        cloudOcc = max(cloudOcc, a);
      }

      // ── A thunderstorm on the horizon: tower + anvil, rain shaft below,
      //    lightning flickering inside, sunlit top at golden hour ──────────
      if (uDistant > 0.01) {
        vec2 saz = normalize(uStormAz + vec2(1e-5));
        float off = acos(clamp(dot(dxz, saz), -1.0, 1.0));
        float ang = atan(d.z, d.x);
        float en = fbm3(vec2(ang * 7.0 + uTime * 0.004, hp * 16.0));
        // billowed (cauliflower) edges: noise in the cell's own (bearing, height) frame
        vec2 cq = vec2(off * 16.0 + uTime * 0.003, hp * 22.0);
        float bl = fbm3(cq) * 0.65 + fbm3(cq * 2.7 + 4.1) * 0.35;
        float top = 0.26 * (0.55 + 0.45 * uDistant);
        float colW = 0.3, anvW = 0.85;
        float towerH = top * (0.8 + 0.2 * smoothstep(colW, 0.0, off)) * (0.92 + 0.08 * bl);
        float inTower = smoothstep(colW, colW * 0.6, off + (en - 0.5) * 0.14 + (bl - 0.5) * 0.1)
                      * smoothstep(towerH + 0.012, towerH - 0.02, hp + (en - 0.5) * 0.04);
        float plate = smoothstep(anvW, anvW * 0.55, off + (en - 0.5) * 0.2)
                    * smoothstep(top * 0.7, top * 0.8, hp + (en - 0.5) * 0.02)
                    * smoothstep(top + 0.014, top - 0.006, hp + (en - 0.5) * 0.025);
        float m = max(inTower, plate) * smoothstep(-0.015, 0.008, h);
        float sideSun = clamp(dot(saz, sxz) * 0.5 + 0.5, 0.0, 1.0);
        vec3 body = mix(uCloudShade * 0.45, uCloudShade * 0.95, smoothstep(0.0, top, hp) * (0.6 + 0.4 * en)) * (0.85 + 0.3 * bl);
        // lit face when the sun is behind the viewer; backlit (dark, rim-lit) when the storm stands in front of the sun
        body += uSunColor * uSunGlow * 0.55 * smoothstep(top * 0.55, top, hp) * (1.0 - sideSun);
        body += uSunColor * uSunGlow * 1.4 * sideSun * (1.0 - smoothstep(0.0, 0.6, max(inTower, plate))) * smoothstep(top * 0.3, top, hp);
        body += vec3(0.7, 0.75, 1.0) * uFlash * (0.3 + 0.7 * en) * 1.5;
        body = mix(horizon, body, 0.8);
        float shaft = smoothstep(colW * 0.95, colW * 0.25, off) * (1.0 - smoothstep(0.0, 0.035, hp))
                    * (0.55 + 0.45 * fbm3(vec2(ang * 50.0, hp * 3.0 + uTime * 0.05)));
        float k = uDistant;
        sky = mix(sky, body, m * k);
        sky = mix(sky, body * 0.85, shaft * 0.6 * k * (1.0 - m));
        cloudOcc = max(cloudOcc, m * k);
      }

      // ── Lightning bolt: jagged channel from the cloud base to the ground ──
      if (uBolt > 0.01 && hp < 0.2) {
        vec2 baz = normalize(uBoltAz + vec2(1e-5));
        float da = atan(dxz.y, dxz.x) - atan(baz.y, baz.x);
        da = mod(da + 3.14159265, 6.2831853) - 3.14159265;
        if (abs(da) < 0.2) {
          float t = hp / 0.16;
          float jag = (vnoise(vec2(t * 8.0, uBoltSeed)) - 0.5) * 0.05 + (vnoise(vec2(t * 29.0, uBoltSeed + 3.0)) - 0.5) * 0.016;
          float apx = max(fwidth(da), 1e-4);
          float core = exp(-pow((da - jag) / (apx * 1.3), 2.0)) * step(t, 1.0);
          float fork = t > 0.45 && t < 1.0 ? exp(-pow((da - jag - (t - 0.45) * 0.09) / (apx * 1.1), 2.0)) * 0.6 : 0.0;
          float glow = exp(-abs(da - jag) / 0.03) * step(t, 1.15);
          sky += vec3(0.85, 0.9, 1.0) * uBolt * (5.0 * max(core, fork) + 0.25 * glow);
        }
      }
    }
    // Sun disc (limb-darkened), hidden behind cloud.
    float disc = smoothstep(0.99962, 0.99985, cosS);
    sky += uSunColor * uSunDisc * disc * (1.0 - cloudOcc * 0.95);

    // ── Night: stars, the Milky Way (dark sites), the moon with its phase ──
    if (uNight > 0.01) {
      float clearSky = (1.0 - cloudOcc) * smoothstep(0.0, 0.1, h) * uNight;
      if (clearSky > 0.001) {
        float st = starLayer(d, 150.0, 0.05, px) + starLayer(d, 70.0, 0.03, px) * 1.5;
        // Milky Way: a band round a great circle, dust lanes, a warmer core.
        vec3 gp = normalize(vec3(0.35, 0.42, -0.84));
        vec3 gx = normalize(cross(gp, vec3(0.0, 1.0, 0.0)));
        vec3 gy = cross(gp, gx);
        float gb = dot(d, gp);
        float gl = atan(dot(d, gy), dot(d, gx));
        vec2 guv = vec2(gl * 4.0, gb * 14.0);
        float band = exp(-gb * gb / 0.03);
        float mw = fbm(guv * 1.2);
        float rift = exp(-pow((gb + 0.015 - (mw - 0.5) * 0.06) / 0.03, 2.0)) * smoothstep(0.35, 0.7, fbm3(guv * 2.2 + 3.0));
        float core = smoothstep(-0.2, 1.0, cos(gl - 0.8));
        vec3 mwCol = mix(vec3(0.5, 0.56, 0.72), vec3(0.85, 0.76, 0.62), core * 0.7);
        float mwI = band * (0.3 + 0.9 * mw) * (1.0 - 0.75 * rift) * (0.6 + 0.6 * core) * uMilky;
        // Clusters of faint stars inside the band.
        st += starLayer(d, 260.0, 0.12 * band * uMilky, px) * 0.5;
        sky += vec3(0.9, 0.93, 1.0) * st * uStars * clearSky;
        sky += mwCol * mwI * 0.045 * clearSky;
      }
      // Aurora (a solar storm): green curtains of vertical rays with a red crown, rippling slowly
      if (uSkyB.z > 0.001) {
        float az3 = atan(d.x, d.z);
        float wob = fbm3(vec2(az3 * 2.5 + uTime * 0.02, hp * 2.0));
        float rays = 0.45 + 0.55 * sin(az3 * 46.0 + 7.0 * wob + uTime * 0.5);
        float bq = (hp - (0.26 + 0.14 * sin(az3 * 1.7 + uTime * 0.04))) / 0.15;
        float band = exp(-bq * bq);
        vec3 ac = mix(vec3(0.12, 1.0, 0.42), vec3(0.85, 0.12, 0.38), smoothstep(0.32, 0.62, hp));
        sky += ac * rays * band * (0.3 + 0.7 * wob) * uSkyB.z * 0.38 * (1.0 - cloudOcc) * smoothstep(0.0, 0.12, h) * (0.35 + 0.65 * uNight);
      }
      // Moon disc: lit from the sun's side, phase from the terminator, maria.
      vec3 md = normalize(uMoonDir);
      float mR = 0.0125;
      float cm = dot(d, md);
      if (uMoonBright > 0.001 && cm > 0.9995) {
        vec3 right = normalize(cross(md, vec3(0.0, 1.0, 0.0)) + vec3(1e-5));
        vec3 upv = cross(right, md);
        vec2 q = vec2(dot(d, right), dot(d, upv)) / mR;
        float r = length(q);
        float disc2 = smoothstep(1.0, 1.0 - 2.0 * px / mR, r);
        if (disc2 > 0.0) {
          vec3 n = vec3(q, sqrt(max(0.0, 1.0 - r * r)));
          vec2 sp = normalize(vec2(dot(uSunDir, right), dot(uSunDir, upv)) + vec2(1e-5));
          float ph = 6.2831853 * uMoonPhase;
          vec3 L = vec3(sp * sin(ph), -cos(ph));
          float lit = smoothstep(-0.04, 0.1, dot(n, L));
          float maria = 0.68 + 0.32 * smoothstep(0.38, 0.62, vnoise(q * 2.1 + 3.0) * 0.6 + vnoise(q * 5.3 + 1.0) * 0.4);
          // crisp disc just over the bloom threshold: a faint halo, not a glow ball
          vec3 mc = vec3(1.0, 0.97, 0.9) * (lit * maria * 0.95 + 0.02) * uMoonBright;
          sky = mix(sky, mc, disc2 * (1.0 - cloudOcc * 0.9) * smoothstep(-0.004, 0.015, h));
        }
      }
    }
    // A floodlit site lights the haze over it
    if (uStadGlow > 0.001) {
      float sg = max(dot(d, uStadDir), 0.0);
      sky += vec3(1.0, 0.86, 0.62) * uStadGlow * (0.05 * pow(sg, 90.0) + 0.02 * pow(sg, 12.0)) * smoothstep(-0.02, 0.03, h) * (1.0 + cloudOcc);
    }
    // A comet (an asteroid on its way): a hard bright head with a long tail pointing away from the sun
    if (uSkyB.w > 0.001) {
      vec3 cd = normalize(vec3(-0.38, 0.5, 0.78));
      float cc = dot(d, cd);
      vec3 tdir = normalize(cd + vec3(0.0, 0.5, 0.0) - uSunDir * 0.25);
      float along = dot(d - cd * cc, tdir);
      float tl = length(d - cd * cc - tdir * max(along, 0.0)) / (0.004 + 0.02 * max(along, 0.0));
      float tail = exp(-tl * tl) * smoothstep(0.0, 0.01, along) * exp(-max(along, 0.0) * 9.0);
      float head = pow(max(cc, 0.0), 2500.0) * 3.0 + pow(max(cc, 0.0), 300.0) * 0.4;
      sky += vec3(0.85, 0.95, 1.0) * (head + 0.35 * tail) * uSkyB.w * (1.0 - cloudOcc) * (0.25 + 0.75 * clamp(uNight + 0.6 * uSkyB.y, 0.0, 1.0));
    }
    // Events on the skyline: fires in an arc, gunfire flashes, the far town's lights going out one by one, the far road's headlights.
    // (Trees and ridges hide the first degree of sky, so the town sits on a far slope and the road climbs it.)
    if (h > -0.02 && h < 0.5 && uSkyA.x + uSkyA.y + uSkyA.z + uSkyA.w + uSkyB.x > 0.001) {
      float az2 = atan(d.x, d.z);
      float vis = 1.0 - 0.7 * cloudOcc;
      float dusk = 0.2 + 0.8 * clamp(uNight + 0.7 * uSkyB.y, 0.0, 1.0);
      float topFade = 1.0 - smoothstep(0.15, 0.5, h);   // (the block ends at 0.5: nothing may be left over at its edge)
      if (uSkyA.w > 0.001) {
        float arc = 0.0;
        for (int i = 0; i < 3; i++) {
          float fi = float(i);
          float sgn = mod(fi, 2.0) < 1.0 ? 1.0 : -1.0;
          float da = atan(sin(az2 - uAz.z - fi * 1.45 * sgn), cos(az2 - uAz.z - fi * 1.45 * sgn));
          arc += exp(-da * da / (0.2 + 0.12 * fi)) * (1.0 - 0.3 * fi);
        }
        arc *= 0.78 + 0.22 * sin(uTime * 1.9 + az2 * 11.0);
        sky += vec3(1.0, 0.36, 0.08) * uSkyA.w * arc * exp(-hp * 8.0) * (0.06 + 0.9 * dusk) * topFade;
      }
      if (uSkyA.y > 0.001) {
        float slot = floor(uTime * 1.0), ph = fract(uTime * 1.0), fl = 0.0, wash = 0.0;
        for (int i = 0; i < 3; i++) {
          float fi = float(i);
          if (hash12(vec2(slot, fi + 3.1)) > uSkyA.y) continue;
          float da = atan(sin(az2 - uAz.w), cos(az2 - uAz.w));
          float a0 = (hash12(vec2(slot, fi + 9.7)) - 0.5) * 1.3;
          float hh = 0.01 + 0.07 * hash12(vec2(slot, fi + 5.5));
          float dd = length(vec2(da - a0, (h - hh) * 2.0));
          float amp = exp(-ph * 4.0) * (0.6 + 0.8 * hash12(vec2(slot + 1.0, fi)));
          fl += amp * (exp(-dd * dd / 0.0008) + 0.5 * exp(-dd * dd / 0.02));
          wash += amp * exp(-(da - a0) * (da - a0) / 0.1) * exp(-hp * 5.0);
        }
        sky += vec3(1.0, 0.74, 0.42) * (fl * 0.9 + wash * 0.12) * vis * (0.3 + 0.7 * dusk) * topFade;
      }
      if (uSkyA.x > 0.001 && h > 0.003 && h < 0.08) {
        float da = atan(sin(az2 - uAz.x), cos(az2 - uAz.x));
        if (abs(da) < 0.45) {
          vec2 g = vec2(da * 180.0, h * 170.0);
          vec2 ci = floor(g), f = fract(g) - 0.5;
          float r = hash12(ci), life = hash12(ci + 1.7);
          float dens = exp(-da * da / 0.05) * (1.0 - h * 11.0);
          if (r < 0.55 * dens && life < uSkyA.x) {
            vec2 off = (vec2(hash12(ci + 7.7), hash12(ci + 3.3)) - 0.5) * 0.6;
            vec2 q = (f - off) * vec2(0.0055, 0.0059);
            float sg = max(0.0009, px * 1.0);
            sky += vec3(1.0, 0.74, 0.4) * exp(-dot(q, q) / (sg * sg)) * (0.6 + 0.4 * sin(uTime * (1.2 + 3.0 * r) + r * 60.0)) * vis * dusk * 1.2;
          }
        }
      }
      if ((uSkyA.z + uSkyB.x) > 0.001 && h > 0.002 && h < 0.07) {
        float da = atan(sin(az2 - uAz.y), cos(az2 - uAz.y));
        float db = atan(sin(az2 - 3.14159265 + uAz.y), cos(az2 - 3.14159265 + uAz.y));
        if (abs(db) < abs(da)) da = db;   // (the road's other end, to the south)
        if (abs(da) < 0.6) {
          float sg = max(0.0008, px * 1.0);
          vec3 lc = vec3(0.0);
          for (int i = 0; i < 6; i++) {
            float fi = float(i);
            if (fi / 6.0 >= uSkyA.z) break;
            float dir = mod(fi, 2.0) < 1.0 ? 1.0 : -1.0;
            float pos = (fract(uTime * 0.0045 * dir * (1.0 + 0.3 * fract(fi * 0.618)) + fi * 0.37) - 0.5) * 1.1;
            float hh = 0.014 + 0.004 * fi + 0.012 * sin(pos * 7.0);
            float dd = length(vec2(da - pos, h - hh));
            float e = exp(-dd * dd / (sg * sg));
            lc += e * (dir > 0.0 ? vec3(1.0, 0.95, 0.8) : vec3(1.0, 0.18, 0.1));
          }
          // a convoy: a tight string of lights one behind another, creeping the same way
          for (int i = 0; i < 8; i++) {
            float fi = float(i);
            if (fi / 8.0 >= uSkyB.x) break;
            float pos = (fract(uTime * 0.0026 + 0.15) - 0.5) * 1.1 - fi * 0.024;
            float dd = length(vec2(da - pos, h - (0.03 + 0.012 * sin(pos * 6.0))));
            float e = exp(-dd * dd / (sg * sg * 1.3));
            lc += e * vec3(1.0, 0.9, 0.65);
          }
          sky += lc * vis * (0.15 + 0.85 * dusk) * 1.1;
        }
      }
    }
    // Moon halo (thin cloud and haze scatter it), by illumination.
    float mm = max(dot(d, uMoonDir), 0.0);
    float illum = 0.5 - 0.5 * cos(6.2831853 * uMoonPhase);
    sky += vec3(0.55, 0.65, 0.85) * uNight * uMoonBright * illum * (0.012 * pow(mm, 900.0) + (0.006 + 0.025 * cloudOcc) * pow(mm, 12.0));
  #endif

    // Below the horizon: fade into the ground / fog color.
    sky = mix(sky, uGround, smoothstep(0.0, 0.08, -h));

    gl_FragColor = vec4(max(sky, vec3(0.0)), 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/**
 * The live sky dome's uniforms (set when the dome is created), so far
 * surfaces such as the open ocean can dissolve into exactly the color the
 * dome shows just below the horizon — no visible water edge or pale band.
 */
export const SKY_SHARED: { uniforms: Record<string, THREE.IUniform> | null } = { uniforms: null };

/** GLSL: the dome color for a direction just at / below the horizon (matches FRAG, no clouds). */
export const SKY_HORIZON_GLSL = /* glsl */`
uniform vec3 uSkyHS; uniform vec3 uSkyHA; uniform vec3 uSkyGround; uniform vec3 uSkyGlow;
uniform vec3 uSkySunDir; uniform vec3 uSkySunColor; uniform float uSkySunGlow;
vec3 skyHorizonColor(vec3 d) {
  vec2 dxz = normalize(d.xz + vec2(1e-5));
  vec2 sxz = normalize(uSkySunDir.xz + vec2(1e-5));
  float az = clamp(dot(dxz, sxz) * 0.5 + 0.5, 0.0, 1.0);
  vec3 horizon = mix(uSkyHA, uSkyHS, az * az);
  vec3 sky = horizon * 1.14 + uSkyGlow;
  float mu = max(dot(d, uSkySunDir), 0.0);
  sky += uSkySunColor * uSkySunGlow * (0.30 * pow(mu, 10.0) + 0.90 * pow(mu, 160.0));
  return mix(sky, uSkyGround, smoothstep(0.0, 0.08, -d.y));
}`;

/** Uniform refs for SKY_HORIZON_GLSL (null before the dome exists). */
export function skyHorizonUniforms(): Record<string, THREE.IUniform> | null {
  const u = SKY_SHARED.uniforms;
  if (!u) return null;
  return {
    uSkyHS: u['uHorizonSun'], uSkyHA: u['uHorizonAnti'], uSkyGround: u['uGround'], uSkyGlow: u['uGlow'],
    uSkySunDir: u['uSunDir'], uSkySunColor: u['uSunColor'], uSkySunGlow: u['uSunGlow'],
  };
}

/** Weather + night-sky state of the dome (all 0–1 unless noted). */
export interface SkyWeather {
  cumulus: number; cirrus: number; stratus: number; storm: number;
  /** Storm cell on the horizon and its azimuth (radians, world x→z). */
  distant: number; stormAz: number;
  /** In-cloud lightning flash; a visible bolt (0–1) at an azimuth with a shape seed. */
  flash: number; bolt: number; boltAz: number; boltSeed: number;
  haze: number; wind: number;
  stars: number; milky: number;
  /** 0 new … 0.5 full. */
  moonPhase: number;
  /** Moon disc brightness (0 below the horizon / by day). */
  moonBright: number;
}

export class ProceduralSky {
  readonly mesh: THREE.Mesh;
  /** Same uniforms, BAKE variant (no clouds / sun disc) for PMREM IBL. */
  readonly bakeMesh: THREE.Mesh;
  readonly uniforms: Record<string, THREE.IUniform>;
  private readonly _geo: THREE.SphereGeometry;
  private readonly _mat: THREE.ShaderMaterial;
  private readonly _bakeMat: THREE.ShaderMaterial;
  private readonly _bakeUniforms: Record<string, THREE.IUniform>;

  constructor() {
    this.uniforms = {
      uSunDir:      { value: new THREE.Vector3(0.3, 0.8, 0.5).normalize() },
      uMoonDir:     { value: new THREE.Vector3(-0.3, 0.8, -0.5).normalize() },
      uZenith:      { value: new THREE.Color() },
      uHorizonSun:  { value: new THREE.Color() },
      uHorizonAnti: { value: new THREE.Color() },
      uGround:      { value: new THREE.Color() },
      uSunColor:    { value: new THREE.Color() },
      uGlow:        { value: new THREE.Color() },
      uCloudLit:    { value: new THREE.Color() },
      uCloudShade:  { value: new THREE.Color() },
      uSunDisc:     { value: 0 },
      uSunGlow:     { value: 0 },
      uCloudCover:  { value: 0 },
      uNight:       { value: 0 },
      uTime:        { value: 0 },
      uCumulus:     { value: 0.15 },
      uCirrus:      { value: 0.2 },
      uStratus:     { value: 0 },
      uStorm:       { value: 0 },
      uDistant:     { value: 0 },
      uStormAz:     { value: new THREE.Vector2(1, 0) },
      uFlash:       { value: 0 },
      uBolt:        { value: 0 },
      uBoltAz:      { value: new THREE.Vector2(1, 0) },
      uBoltSeed:    { value: 0 },
      uHaze:        { value: 0.4 },
      uWind:        { value: new THREE.Vector2(0, 0) },
      uStars:       { value: 1 },
      uMilky:       { value: 0 },
      uMoonPhase:   { value: 0.5 },
      uMoonBright:  { value: 0 },
      uStadDir:     { value: new THREE.Vector3(0, 1, 0) },
      uStadGlow:    { value: 0 },
      uSmoke:       { value: 0 },
      uSkyA:        { value: new THREE.Vector4() },
      uSkyB:        { value: new THREE.Vector4() },
      uAz:          { value: new THREE.Vector4(3.14, 3.09, 3.14, 3.14) },
    };
    SKY_SHARED.uniforms = this.uniforms;
    this._geo = new THREE.SphereGeometry(1, 48, 24);
    this._mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: VERT,
      fragmentShader: FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.mesh = new THREE.Mesh(this._geo, this._mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1000;
    this.mesh.userData = { type: 'sky' };

    // The bake variant shares every uniform except the ground color (IBL wants
    // a dark ground bounce below the horizon, the visible dome wants fog).
    this._bakeUniforms = { ...this.uniforms, uGround: { value: new THREE.Color() } };
    this._bakeMat = new THREE.ShaderMaterial({
      uniforms: this._bakeUniforms,
      vertexShader: VERT,
      fragmentShader: FRAG,
      defines: { BAKE: 1 },
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      fog: false,
      toneMapped: false,
    });
    this.bakeMesh = new THREE.Mesh(this._geo, this._bakeMat);
    this.bakeMesh.frustumCulled = false;
  }

  /** Copy a blended palette into the uniforms. `ground` = fog color for the visible dome. */
  apply(p: SkyPalette, bakeGround: THREE.Color): void {
    const u = this.uniforms;
    (u['uZenith'].value as THREE.Color).copy(p.zenith);
    (u['uHorizonSun'].value as THREE.Color).copy(p.horizonSun);
    (u['uHorizonAnti'].value as THREE.Color).copy(p.horizonAnti);
    (u['uGround'].value as THREE.Color).copy(p.fog);
    (u['uSunColor'].value as THREE.Color).copy(p.sunColor);
    (u['uGlow'].value as THREE.Color).copy(p.glow);
    (u['uCloudLit'].value as THREE.Color).copy(p.cloudLit);
    (u['uCloudShade'].value as THREE.Color).copy(p.cloudShade);
    u['uSunDisc'].value = p.sunDisc;
    u['uSunGlow'].value = p.sunGlow;
    u['uCloudCover'].value = p.cloudCover;
    (this._bakeUniforms['uGround'].value as THREE.Color).copy(bakeGround);
  }

  setSunDirection(dir: THREE.Vector3): void {
    (this.uniforms['uSunDir'].value as THREE.Vector3).copy(dir);
  }

  setMoonDirection(dir: THREE.Vector3): void {
    (this.uniforms['uMoonDir'].value as THREE.Vector3).copy(dir);
  }

  /** Columns of smoke on the skyline (0 = none). */
  setSmoke(k: number): void { this.uniforms['uSmoke'].value = k; }

  /**
   * Events on the skyline (sim/collapseLook.ts): the far town's lights, distant gunfire, the far road's headlights, fires, a convoy,
   * the twilight weight, and the bearings of town / road / fires / fighting. All 0 = nothing drawn (the peacetime sky).
   */
  setSkyline(l: { town: number; flashes: number; traffic: number; fire: number; convoy: number; twilight: number; aurora: number; comet: number; az: { town: number; road: number; fire: number; war: number } }): void {
    const u = this.uniforms;
    (u['uSkyA'].value as THREE.Vector4).set(l.town, l.flashes, l.traffic, l.fire);
    (u['uSkyB'].value as THREE.Vector4).set(l.convoy, l.twilight, l.aurora, l.comet);
    (u['uAz'].value as THREE.Vector4).set(l.az.town, l.az.road, l.az.fire, l.az.war);
  }

  setNight(v: number): void {
    this.uniforms['uNight'].value = v;
  }

  /** Glow over a floodlit site (a lit compound, a town): direction from the eye, strength (0 = none). */
  setGroundGlow(dir: THREE.Vector3 | null, k: number): void {
    if (dir) (this.uniforms['uStadDir'].value as THREE.Vector3).copy(dir);
    this.uniforms['uStadGlow'].value = k;
  }

  /** Weather layers + night sky (WorldScene.updateDayNight). */
  setWeatherSky(w: SkyWeather): void {
    const u = this.uniforms;
    u['uCumulus'].value = w.cumulus;
    u['uCirrus'].value = w.cirrus;
    u['uStratus'].value = w.stratus;
    u['uStorm'].value = w.storm;
    u['uDistant'].value = w.distant;
    u['uFlash'].value = w.flash;
    u['uBolt'].value = w.bolt;
    u['uBoltSeed'].value = w.boltSeed;
    u['uHaze'].value = w.haze;
    u['uStars'].value = w.stars;
    u['uMilky'].value = w.milky;
    u['uMoonPhase'].value = w.moonPhase;
    u['uMoonBright'].value = w.moonBright;
    (u['uStormAz'].value as THREE.Vector2).set(Math.cos(w.stormAz), Math.sin(w.stormAz));
    (u['uBoltAz'].value as THREE.Vector2).set(Math.cos(w.boltAz), Math.sin(w.boltAz));
    // Clouds race in a gale and idle on a calm day
    const k = 0.4 + 1.6 * w.wind;
    this._windK = k;
  }

  /** Advance cloud drift (seconds). */
  tick(dt: number): void {
    this.uniforms['uTime'].value = ((this.uniforms['uTime'].value as number) + dt) % 100000;
    // Cloud drift: integrate the wind so a change of wind speed never jumps the deck
    const w = this.uniforms['uWind'].value as THREE.Vector2;
    w.x = (w.x + 0.010 * this._windK * dt) % 1000;
    w.y = (w.y + 0.004 * this._windK * dt) % 1000;
  }
  private _windK = 1;

  dispose(): void {
    this._geo.dispose();
    this._mat.dispose();
    this._bakeMat.dispose();
  }
}

/** Blend palettes by weights (weights need not be normalised). Writes into `out`. */
export function blendSkyPalettes(
  out: SkyPalette,
  entries: Array<[SkyPalette, number]>,
): SkyPalette {
  let total = 0;
  for (const [, w] of entries) total += Math.max(0, w);
  if (total <= 0) total = 1;
  const colorKeys = ['zenith', 'horizonSun', 'horizonAnti', 'fog', 'sunColor', 'cloudLit', 'cloudShade', 'glow'] as const;
  for (const k of colorKeys) out[k].setRGB(0, 0, 0);
  out.sunDisc = 0; out.sunGlow = 0; out.cloudCover = 0;
  for (const [p, wRaw] of entries) {
    const w = Math.max(0, wRaw) / total;
    if (w === 0) continue;
    for (const k of colorKeys) {
      out[k].r += p[k].r * w;
      out[k].g += p[k].g * w;
      out[k].b += p[k].b * w;
    }
    out.sunDisc += p.sunDisc * w;
    out.sunGlow += p.sunGlow * w;
    out.cloudCover += p.cloudCover * w;
  }
  return out;
}

/** Fresh zeroed palette (scratch target for blendSkyPalettes). */
export function createSkyPalette(): SkyPalette {
  return {
    zenith: new THREE.Color(), horizonSun: new THREE.Color(), horizonAnti: new THREE.Color(),
    fog: new THREE.Color(), sunColor: new THREE.Color(), sunDisc: 0, sunGlow: 0,
    cloudLit: new THREE.Color(), cloudShade: new THREE.Color(), cloudCover: 0, glow: new THREE.Color(),
  };
}
