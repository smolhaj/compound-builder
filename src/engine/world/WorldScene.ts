/**
 * WorldScene — renderer, sky, light rig, fog and post-processing.
 *
 * Ported from University Empire's CampusScene (src/three/world/CampusScene.ts)
 * with the campus, era, parcel and city hooks stripped. What stays is the
 * game-agnostic world look: the physically-based light rig with golden hour,
 * the procedural sky dome + PMREM IBL, the moon and stars, camera-following
 * shadows, weather on the sky and lights, seasonal particles, and the
 * SSAO → HDR clamp → god rays → bloom → color grade → output → FXAA chain.
 *
 * The scene knows nothing about the game: callers hand it a site (the area
 * the camera and particles care about), the time of day, weather, season and
 * night-sky inputs through the small setters below.
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { SSAOPass } from 'three/examples/jsm/postprocessing/SSAOPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ColorGradingShader, COLOR_GRADING_PRESETS } from './post/ColorGradingShader';
import { GodRayShader } from './post/GodRayShader';
import {
  ProceduralSky, SKY_PALETTES, blendSkyPalettes, createSkyPalette, type SkyPalette, type SkyWeather,
} from './sky/ProceduralSky';
import { godRayStrength, milkyWayVisibility, moonAngle, moonIllumination, starVisibility } from './sky/skyState';
import { phaseWeights, type DayPhase } from './sky/dayPhase';
import { installSeasonShaderPatch } from './season/seasonShader';

export type Quality = 'high' | 'medium' | 'low';

/** Weather the scene responds to (WeatherRenderer outputs; extras optional). */
export interface SceneWeather {
  cloud: number; fog: number; rain: number; snow: number;
  cumulus?: number; cirrus?: number; storm?: number; distantStorm?: number; wind?: number; haze?: number;
}

/** Sky-only lightning: an in-cloud flash, a visible bolt, and where the storm stands. */
export interface SkyLightning {
  flash: number; bolt: number; boltAz: number; boltSeed: number; stormAz: number;
}

/** The area of interest in world units (particles spawn over it; default camera frames it). */
export interface WorldSite {
  x0: number; z0: number; x1: number; z1: number;
}

/*
 * Aerial perspective for every material: exp² fog thins with distance past
 * ~80 units, so the far landscape keeps a light haze instead of a fog sheet.
 */
THREE.ShaderChunk.fog_fragment = /* glsl */`#ifdef USE_FOG
  #ifdef FOG_EXP2
    float fogThin = mix(1.0, 0.1, smoothstep(80.0, 420.0, vFogDepth));
    float fogFactor = 1.0 - exp(- fogDensity * fogDensity * fogThin * vFogDepth * vFogDepth);
  #else
    float fogFactor = smoothstep(fogNear, fogFar, vFogDepth);
  #endif
  gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, fogFactor);
#endif`;

/** Far plane: the regional landscape (mountain ranges) reaches ~2 km out. */
export const CAMERA_FAR = 2600;

export class WorldScene {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;

  /** Light rig intensities (three.js physically-based units). */
  static readonly LIGHT = {
    DAY_SUN: 2.9,
    DAY_SKY: 1.15,
    DAY_FILL: 0.55,
    NIGHT_SKY: 0.30,
    NIGHT_FILL: 0.08,
  };
  /** Daytime aerial-perspective haze — pale blue-gray that matches the sky horizon. */
  static readonly FOG_DAY = 0xb4c4d4;
  static readonly FOG_FULL_RADIUS = 360;
  static readonly FOG_OVERVIEW_DEPTH = 0.22;
  static readonly FOG_WEATHER_DEPTH = 0.4;

  private _site: WorldSite = { x0: -40, z0: -40, x1: 40, z1: 40 };
  private _sunLight: THREE.DirectionalLight;
  /** Unit vector pointing from the scene toward the sun. */
  private readonly _sunDir = new THREE.Vector3(0.5, 0.8, 0.5).normalize();
  /** World-space point + radius the shadow frustum is fitted around. */
  private readonly _shadowFocus = { x: 0, z: 0, radius: 60 };
  private _hemiLight: THREE.HemisphereLight;
  /**
   * How much outdoor light reaches the camera's surroundings (1 outside; near 0 underground,
   * where rooms are lit only by their own lamps). Scales sun, sky, fill, rim and the environment.
   */
  outdoorLight = 1;
  private _fillLight: THREE.DirectionalLight;
  private _rimLight: THREE.DirectionalLight;
  private _daySkyColor = 0x87ceeb;
  private _fogConfig = { color: WorldScene.FOG_DAY, density: 0.0019 };
  private _composer: EffectComposer | null = null;
  private _fxaaPass: ShaderPass | null = null;
  private _ssaoPass: SSAOPass | null = null;
  private _colorGradingPass: ShaderPass | null = null;
  private _bloomPass: UnrealBloomPass | null = null;
  private _godRayPass: ShaderPass | null = null;
  private _postProcessingEnabled = true;
  private _shadowFrame = 0;
  private _sky: ProceduralSky | null = null;
  private _pmremGenerator: THREE.PMREMGenerator | null = null;
  private _skyEnvRT: THREE.WebGLRenderTarget | null = null;
  private _envScene: THREE.Scene | null = null;
  private _lastEnvUpdateHour = -999;
  private _envBakeCloud = 0;
  private readonly _skyState = createSkyPalette();
  private readonly _phase: DayPhase = { day: 1, golden: 0, night: 0 };
  private _quality: Quality = 'high';
  private readonly _ssaoDir = new THREE.Vector3();
  private readonly _moonDir = new THREE.Vector3(0, 1, 0);
  private readonly _skySunDir = new THREE.Vector3(0, 1, 0);
  private readonly _sunNdc = new THREE.Vector3();
  private _viewRadius = 80;

  private _moonPhase = 0.5;
  private _skyDark = 0.95;
  private _moonUp = 1;
  /** Floodlit-site glow over the haze (world position + strength). */
  private readonly _groundGlow = { x: 0, y: 0, z: 0, on: 0 };

  private _wetnessTarget = 0;
  private _wetnessCurrent = 0;

  private readonly _weather = {
    cloud: 0, fog: 0, rain: 0, snow: 0, flash: 0,
    cumulus: 0.12, cirrus: 0.2, storm: 0, distantStorm: 0, wind: 0.2, haze: 0.4,
    skyFlash: 0, bolt: 0, boltAz: 0, boltSeed: 0, stormAz: 0.6,
  };
  private readonly _skyWeather: SkyWeather = {
    cumulus: 0.12, cirrus: 0.2, stratus: 0, storm: 0, distant: 0, stormAz: 0.6,
    flash: 0, bolt: 0, boltAz: 0, boltSeed: 0, haze: 0.4, wind: 0.2,
    stars: 1, milky: 0, moonPhase: 0.5, moonBright: 0,
  };

  private _particleSystem: THREE.Points | null = null;
  private _particleVelocities: Float32Array | null = null;

  private readonly _c = { tmp: new THREE.Color(), v: new THREE.Vector3() };
  private readonly _gradeBase = { contrast: 0.5, saturation: 1.04, warm: 0.18, threshold: 0.55 };

  constructor(canvas: HTMLCanvasElement) {
    // Season surface patch must be in place before any standard material compiles.
    installSeasonShaderPatch();
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87ceeb);
    this.scene.fog = new THREE.FogExp2(WorldScene.FOG_DAY, 0.0019);

    this._pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    this._sky = new ProceduralSky();
    this.scene.add(this._sky.mesh);

    this.camera = new THREE.PerspectiveCamera(45, 1, 0.05, CAMERA_FAR);
    this._frameSite();

    this._hemiLight = new THREE.HemisphereLight(0xb0d8ff, 0x4a7c3f, WorldScene.LIGHT.DAY_SKY);
    this.scene.add(this._hemiLight);

    this._sunLight = new THREE.DirectionalLight(0xfffae0, WorldScene.LIGHT.DAY_SUN);
    this._sunLight.castShadow = true;
    this._sunLight.shadow.camera.near = 1;
    this._sunLight.shadow.camera.far = 600;
    this._sunLight.shadow.mapSize.set(1024, 1024);
    this._sunLight.shadow.bias = -0.0004;
    this._sunLight.shadow.normalBias = 0.04;
    this.scene.add(this._sunLight);
    this.scene.add(this._sunLight.target);
    this._applySunTransform();

    this._fillLight = new THREE.DirectionalLight(0xb8d4ff, WorldScene.LIGHT.DAY_FILL);
    this._fillLight.position.set(-60, 35, -60);
    this.scene.add(this._fillLight);

    this._rimLight = new THREE.DirectionalLight(0xfff0e0, 0.35);
    this._rimLight.position.set(0, 20, -80);
    this.scene.add(this._rimLight);
  }

  // ── Site ──────────────────────────────────────────────────────────────────

  /** The area of interest (world units). Re-frames the default camera. */
  setSite(site: WorldSite): void {
    this._site = { ...site };
    this._frameSite();
  }

  get site(): Readonly<WorldSite> { return this._site; }

  private _frameSite(): void {
    const s = this._site;
    const cx = (s.x0 + s.x1) / 2, cz = (s.z0 + s.z1) / 2;
    const d = Math.max(s.x1 - s.x0, s.z1 - s.z0) * 0.75;
    this.camera.position.set(cx + d, d * 0.6, cz + d);
    this.camera.lookAt(cx, 0, cz);
  }

  // ── Inputs ────────────────────────────────────────────────────────────────

  /** Manually set wetness level 0–1 (0 = dry, 1 = soaked). Decays over ~45 s. */
  setWetness(value: number): void {
    this._wetnessTarget = Math.max(0, Math.min(1, value));
  }

  /** Event / season wetness (0–1); the weather layer turns it into wet surfaces. */
  get eventWetness(): number { return this._wetnessCurrent; }

  /** Current night weight of the lighting cycle (0 = day … 1 = night). */
  get nightFactor(): number { return this._phase.night; }

  /** Current day / golden / night weights. */
  get phase(): Readonly<DayPhase> { return this._phase; }

  get quality(): Quality { return this._quality; }

  /**
   * Weather hook (WeatherRenderer): overcast sky + dimmer, softer light,
   * thicker fog, lightning flash. Applied by the next updateDayNight().
   * Ignored on Low (no sky dome, no per-frame lighting work).
   */
  setWeather(w: SceneWeather, flash = 0, sky?: SkyLightning): void {
    const x = this._weather;
    if (this._quality === 'low') {
      x.cloud = x.fog = x.rain = x.snow = x.flash = x.storm = x.distantStorm = x.skyFlash = x.bolt = 0;
      return;
    }
    x.cloud = w.cloud; x.fog = w.fog; x.rain = w.rain; x.snow = w.snow; x.flash = flash;
    x.cumulus = w.cumulus ?? 0.12; x.cirrus = w.cirrus ?? 0.2; x.storm = w.storm ?? 0;
    x.distantStorm = w.distantStorm ?? 0; x.wind = w.wind ?? 0.2; x.haze = w.haze ?? 0.4;
    x.skyFlash = sky?.flash ?? flash; x.bolt = sky?.bolt ?? 0; x.boltAz = sky?.boltAz ?? 0;
    x.boltSeed = sky?.boltSeed ?? 0; x.stormAz = sky?.stormAz ?? x.stormAz;
  }

  /**
   * Night sky inputs: moon phase (0 new … 0.5 full, skyState.moonPhase) and
   * how dark the site is (skyState.skyDarkness: the Milky Way at a dark rural
   * site, a washed-out orange glow near a town).
   */
  setNightSky(phase: number, darkness: number): void {
    this._moonPhase = ((phase % 1) + 1) % 1;
    this._skyDark = Math.max(0, Math.min(1, darkness));
  }

  /** A floodlit site lights the haze over it (0 = off). */
  setGroundGlow(x: number, y: number, z: number, strength: number): void {
    Object.assign(this._groundGlow, { x, y, z, on: strength });
  }

  /** Season grade (color grading preset). */
  setSeasonGrade(season: string): void {
    if (!this._colorGradingPass) return;
    const preset = COLOR_GRADING_PRESETS[season] ?? COLOR_GRADING_PRESETS['summer'];
    const g = this._gradeBase;
    g.contrast = preset.uContrast;
    g.saturation = preset.uSaturation;
    g.warm = preset.uWarmStrength;
    g.threshold = preset.uWarmThreshold;
    this._colorGradingPass.uniforms['uWarmColor'].value = preset.uWarmColor;
    this._applyGradeForTime();
  }

  /**
   * Seasonal particles (falling leaves / snow / blossoms) over the site.
   * Pass 'summer' or '' to remove them.
   */
  setSeasonalParticles(season: string): void {
    if (this._particleSystem) {
      this.scene.remove(this._particleSystem);
      this._particleSystem.geometry.dispose();
      const pMat = this._particleSystem.material as THREE.PointsMaterial;
      (pMat.map as THREE.Texture | null)?.dispose();
      pMat.dispose();
      this._particleSystem = null;
      this._particleVelocities = null;
    }
    if (season === 'summer' || !season) return;

    const COUNT = season === 'winter' ? 120 : 80;
    const s = this._site;
    const positions = new Float32Array(COUNT * 3);
    const velocities = new Float32Array(COUNT * 3);
    const rng = (n: number) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
    for (let i = 0; i < COUNT; i++) {
      positions[i * 3] = s.x0 + rng(i * 3) * (s.x1 - s.x0);
      positions[i * 3 + 1] = 4 + rng(i * 3 + 1) * 8;
      positions[i * 3 + 2] = s.z0 + rng(i * 3 + 2) * (s.z1 - s.z0);
      const fallSpeed = season === 'winter' ? 0.8 + rng(i * 7 + 2) * 1.2
        : season === 'spring' ? 0.3 + rng(i * 7 + 2) * 0.5
        : 0.5 + rng(i * 7 + 2) * 0.9;
      velocities[i * 3] = (rng(i * 7 + 3) - 0.5) * 0.6;
      velocities[i * 3 + 1] = -fallSpeed;
      velocities[i * 3 + 2] = (rng(i * 7 + 5) - 0.5) * 0.6;
    }
    this._particleVelocities = velocities;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const colorMap: Record<string, number> = { fall: 0xb85c10, winter: 0xd8eaf5, spring: 0xf0a8c0 };
    const sizeMap: Record<string, number> = { fall: 0.1, winter: 0.12, spring: 0.09 };
    const spriteCanvas = document.createElement('canvas');
    spriteCanvas.width = 32; spriteCanvas.height = 32;
    const sCtx = spriteCanvas.getContext('2d')!;
    const grad = sCtx.createRadialGradient(16, 16, 0, 16, 16, 16);
    grad.addColorStop(0.0, 'rgba(255,255,255,1.0)');
    grad.addColorStop(0.5, 'rgba(255,255,255,0.7)');
    grad.addColorStop(1.0, 'rgba(255,255,255,0.0)');
    sCtx.fillStyle = grad;
    sCtx.fillRect(0, 0, 32, 32);
    const mat = new THREE.PointsMaterial({
      color: colorMap[season] ?? 0xffffff, size: sizeMap[season] ?? 0.5,
      map: new THREE.CanvasTexture(spriteCanvas), sizeAttenuation: true,
      transparent: true, opacity: 0.55, alphaTest: 0.05, depthWrite: false, fog: true,
    });
    mat.onBeforeCompile = (shader) => {
      // Cap the on-screen size so a leaf falling past the eye camera stays a fleck.
      shader.vertexShader = shader.vertexShader.replace(
        '#include <fog_vertex>',
        '#include <fog_vertex>\n  gl_PointSize = min(gl_PointSize, 4.0);',
      );
    };
    this._particleSystem = new THREE.Points(geo, mat);
    this._particleSystem.userData = { type: 'particles' };
    this.scene.add(this._particleSystem);
  }

  /** Per-frame animation tick (real dt, seconds): wetness lerp, cloud drift, particles. */
  tick(dt: number): void {
    const lerpSpeed = 1 - Math.pow(0.04, dt);
    this._wetnessCurrent += (this._wetnessTarget - this._wetnessCurrent) * lerpSpeed;
    if (this._wetnessTarget > 0) this._wetnessTarget = Math.max(0, this._wetnessTarget - dt / 45);

    this._sky?.tick(dt);

    if (this._particleSystem && this._particleVelocities) {
      const s = this._site;
      const sizeW = s.x1 - s.x0, sizeH = s.z1 - s.z0;
      const pos = this._particleSystem.geometry.attributes.position as THREE.BufferAttribute;
      const arr = pos.array as Float32Array;
      const vels = this._particleVelocities;
      const rng = (a: number, b: number) => { const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return x - Math.floor(x); };
      for (let i = 0; i < arr.length / 3; i++) {
        arr[i * 3] += vels[i * 3] * dt;
        arr[i * 3 + 1] += vels[i * 3 + 1] * dt;
        arr[i * 3 + 2] += vels[i * 3 + 2] * dt;
        if (arr[i * 3 + 1] < -0.5) {
          arr[i * 3] = s.x0 + rng(i + arr[i * 3], 0.1) * sizeW * 1.3 - sizeW * 0.15;
          arr[i * 3 + 1] = 24 + rng(i, arr[i * 3 + 2]) * 8;
          arr[i * 3 + 2] = s.z0 + rng(i + arr[i * 3 + 2], 0.2) * sizeH * 1.3 - sizeH * 0.15;
        }
      }
      pos.needsUpdate = true;
    }
  }

  // ── Shadows ───────────────────────────────────────────────────────────────

  /**
   * Fit the sun's shadow frustum around the area the camera is looking at.
   * Call whenever the camera target or zoom changes. Cheap — only updates
   * matrices; the frustum is snapped to coarse steps to limit shimmer.
   */
  setShadowFocus(x: number, z: number, cameraRadius: number): void {
    this._viewRadius = cameraRadius;
    const s = this._site;
    const cap = Math.max(220, Math.max(s.x1 - s.x0, s.z1 - s.z0) * 0.55);
    const radius = Math.min(Math.max(cameraRadius * 1.1, 40), cap);
    const snap = 4;
    const f = this._shadowFocus;
    const nx = Math.round(x / snap) * snap;
    const nz = Math.round(z / snap) * snap;
    const nr = Math.ceil(radius / 10) * 10;
    if (nx === f.x && nz === f.z && nr === f.radius) return;
    f.x = nx; f.z = nz; f.radius = nr;
    this._applySunTransform();
  }

  private _applySunTransform(): void {
    const f = this._shadowFocus;
    const dist = 250;
    this._sunLight.target.position.set(f.x, 0, f.z);
    this._sunLight.position.set(f.x + this._sunDir.x * dist, this._sunDir.y * dist, f.z + this._sunDir.z * dist);
    this._sunLight.target.updateMatrixWorld();
    const cam = this._sunLight.shadow.camera;
    if (cam.right !== f.radius) {
      cam.left = -f.radius; cam.right = f.radius;
      cam.top = f.radius; cam.bottom = -f.radius;
      cam.updateProjectionMatrix();
    }
  }

  // ── Day / night ───────────────────────────────────────────────────────────

  /** Per-regime light rig: sun / sky (hemi) / fill / rim intensities + colors. */
  private static readonly RIG = {
    day: {
      sun: WorldScene.LIGHT.DAY_SUN, hemi: WorldScene.LIGHT.DAY_SKY, fill: WorldScene.LIGHT.DAY_FILL, rim: 0.35,
      hemiSky: new THREE.Color(0xb0d8ff), hemiGround: new THREE.Color(0x4a7c3f),
      fillColor: new THREE.Color(0xb8d4ff), rimColor: new THREE.Color(0xfff0e0),
    },
    golden: {
      sun: 3.4, hemi: 0.80, fill: 0.40, rim: 0.60,
      hemiSky: new THREE.Color(0.92, 0.70, 0.58), hemiGround: new THREE.Color(0.44, 0.31, 0.18),
      fillColor: new THREE.Color(0.60, 0.46, 0.88), rimColor: new THREE.Color(1.0, 0.62, 0.36),
    },
    night: {
      sun: 0.62, hemi: WorldScene.LIGHT.NIGHT_SKY, fill: WorldScene.LIGHT.NIGHT_FILL, rim: 0.0,
      hemiSky: new THREE.Color(0.38, 0.52, 0.92), hemiGround: new THREE.Color(0.08, 0.09, 0.14),
      fillColor: new THREE.Color(0.35, 0.45, 0.78), rimColor: new THREE.Color(0.5, 0.6, 0.9),
    },
  } as const;
  private static readonly MOON_COLOR = new THREE.Color(0.62, 0.74, 1.0);

  /** Sun position and lighting for a time of day (0–24): sky, fog, light rig, PMREM bakes. */
  updateDayNight(timeOfDay: number): void {
    const angle = ((timeOfDay / 24) * Math.PI * 2) - Math.PI / 2;
    const radius = 100;
    const elevation = Math.sin(angle) * 80;
    const sunX = Math.cos(angle) * radius;
    const sunY = Math.max(elevation, -20);

    const ph = this._phase;
    phaseWeights(timeOfDay, ph);
    const { day: wd, golden: wg, night: wn } = ph;
    const isMorning = timeOfDay < 12;

    const sky = blendSkyPalettes(this._skyState, [
      [SKY_PALETTES.day, wd],
      [isMorning ? SKY_PALETTES.dawn : SKY_PALETTES.golden, wg],
      [SKY_PALETTES.night, wn],
    ]);
    const wx = this._weather;
    const overcast = Math.min(1, wx.cloud);
    if (overcast > 0.001 || wx.fog > 0.001 || wx.flash > 0.001) this._applyWeatherToSky(sky, overcast, wx.fog, wx.flash);
    sky.glow.multiplyScalar(0.5 + 1.6 * (1 - this._skyDark));

    // Moon lags the sun by its phase (full = opposite the sun).
    const moonAng = moonAngle(angle, this._moonPhase);
    const mx = Math.cos(moonAng) * 180;
    const myTrue = Math.sin(moonAng) * 120;
    const my = Math.max(myTrue, 15);
    const mz = 45;
    this._moonDir.set(mx, my, mz).normalize();
    const moonIllum = moonIllumination(this._moonPhase);
    this._moonUp = Math.max(0, Math.min(1, myTrue / 25));

    const R = WorldScene.RIG;
    const tmp = this._c.tmp;
    const tmpV = this._c.v;
    if (wn < 0.5) {
      this._sunDir.set(sunX, Math.max(sunY, 16), 50).normalize();
      const k = 1 - wn * 2;
      this._sunLight.intensity = (R.day.sun * wd + R.golden.sun * wg) / Math.max(wd + wg, 1e-4) * k;
      this._sunLight.color.copy(sky.sunColor);
      const m = Math.max(this._sunLight.color.r, this._sunLight.color.g, this._sunLight.color.b, 1e-4);
      this._sunLight.color.multiplyScalar(1 / m);
    } else {
      this._sunDir.copy(this._moonDir);
      this._sunLight.intensity = R.night.sun * (wn * 2 - 1) * (0.8 + 0.3 * moonIllum * this._moonUp);
      this._sunLight.color.copy(WorldScene.MOON_COLOR);
    }
    this._applySunTransform();

    const blend = (out: THREE.Color, a: THREE.Color, b: THREE.Color, c: THREE.Color) =>
      out.setRGB(0, 0, 0).add(tmp.copy(a).multiplyScalar(wd)).add(tmp.copy(b).multiplyScalar(wg)).add(tmp.copy(c).multiplyScalar(wn));
    this._hemiLight.intensity = R.day.hemi * wd + R.golden.hemi * wg + R.night.hemi * wn;
    blend(this._hemiLight.color, R.day.hemiSky, R.golden.hemiSky, R.night.hemiSky);
    blend(this._hemiLight.groundColor, R.day.hemiGround, R.golden.hemiGround, R.night.hemiGround);
    this._fillLight.intensity = R.day.fill * wd + R.golden.fill * wg + R.night.fill * wn;
    blend(this._fillLight.color, R.day.fillColor, R.golden.fillColor, R.night.fillColor);
    this._rimLight.intensity = R.day.rim * wd + R.golden.rim * wg + R.night.rim * wn;
    blend(this._rimLight.color, R.day.rimColor, R.golden.rimColor, R.night.rimColor);

    this._sunLight.shadow.intensity = wn < 0.5 ? 1 : 0.75;

    if (overcast > 0.001 || wx.flash > 0.001) {
      const dim = (1 - overcast * 0.8) * (1 - wx.storm * 0.5);
      this._sunLight.intensity *= dim;
      this._sunLight.shadow.intensity *= 1 - overcast * 0.72;
      this._rimLight.intensity *= dim;
      this._fillLight.intensity *= 1 - overcast * 0.35;
      const lum = (this._hemiLight.color.r + this._hemiLight.color.g + this._hemiLight.color.b) / 3;
      this._hemiLight.color.lerp(tmp.setRGB(lum, lum, lum * 1.04), overcast * 0.7);
      this._hemiLight.intensity *= (1 - overcast * 0.12) * (1 - wx.storm * 0.35);
      if (wx.flash > 0.001) {
        this._hemiLight.intensity += wx.flash * 2.6;
        this._hemiLight.color.lerp(tmp.setRGB(0.85, 0.9, 1.0), wx.flash * 0.8);
      }
    }

    if (this.scene.fog) {
      const fog = this.scene.fog as THREE.FogExp2;
      fog.color.copy(sky.fog);
      fog.density = this._fogConfig.density * (wd + wg * 1.12 + wn * 1.35)
        * (1 + wx.fog * 6.5 + wx.rain * 1.4 + wx.snow * 2.2) * (0.8 + 0.5 * wx.haze);
      const r = this._viewRadius;
      if (r > WorldScene.FOG_FULL_RADIUS) {
        fog.density = Math.min(fog.density * (WorldScene.FOG_FULL_RADIUS / r) ** 2, WorldScene.FOG_OVERVIEW_DEPTH / r);
      }
      fog.density = Math.min(fog.density, WorldScene.FOG_WEATHER_DEPTH / Math.max(1, r));
    }

    this.scene.environmentIntensity = 0.10 + (1 - wn) * 0.24;
    if (this.outdoorLight < 0.999) {
      const k = this.outdoorLight;
      this._sunLight.intensity *= k; this._hemiLight.intensity *= k; this._fillLight.intensity *= k; this._rimLight.intensity *= k;
      this.scene.environmentIntensity *= k;
    }
    if (this._bloomPass) this._bloomPass.threshold = 0.85 + (1 - wn) * 0.75;
    this._applyGradeForTime();

    if (this._particleSystem) this._particleSystem.visible = wn < 0.5 && this._quality !== 'low';

    if (this._sky) {
      this._skySunDir.set(sunX, Math.max(sunY, 10), 50).normalize();
      this._sky.setSunDirection(this._skySunDir);
      tmpV.set(mx, myTrue, mz).normalize();
      this._sky.setMoonDirection(tmpV);
      this._sky.setNight(wn);
      const sw = this._skyWeather;
      const nightSee = Math.max(0, Math.min(1, (wn - 0.35) / 0.65));
      sw.cumulus = wx.cumulus * (1 - overcast * 0.6);
      sw.cirrus = wx.cirrus * (1 - overcast);
      sw.stratus = Math.max(0, Math.min(1, (overcast - 0.15) / 0.7));
      sw.storm = wx.storm;
      sw.distant = wx.distantStorm * (1 - Math.min(1, overcast * 0.9) * 0.6);
      sw.stormAz = wx.stormAz;
      sw.flash = wx.skyFlash;
      sw.bolt = wx.bolt;
      sw.boltAz = wx.boltAz;
      sw.boltSeed = wx.boltSeed;
      sw.haze = wx.haze;
      sw.wind = wx.wind;
      const moonUp = this._moonUp > 0.02;
      sw.stars = nightSee * starVisibility(this._skyDark, moonIllum, moonUp);
      sw.milky = nightSee * milkyWayVisibility(this._skyDark, moonIllum, moonUp, overcast);
      sw.moonPhase = this._moonPhase;
      sw.moonBright = Math.max(0, Math.min(1, (wn - 0.2) / 0.5)) * (moonIllum > 0.02 ? 1 : 0);
      const gg = this._groundGlow;
      if (gg.on > 0.001) {
        tmpV.set(gg.x, gg.y, gg.z).sub(this.camera.position).normalize();
        this._sky.setGroundGlow(tmpV, gg.on);
      } else this._sky.setGroundGlow(null, 0);
      this._sky.setWeatherSky(sw);
      this._updateGodRays(wg, sw.cumulus, overcast);
      tmp.copy(this._hemiLight.groundColor).multiplyScalar(0.18 * this._hemiLight.intensity);
      this._sky.apply(sky, tmp);
      if (this._quality !== 'low') this.scene.background = null;
      else this._applyLowBackground(wd, wg, wn);

      let dh = Math.abs(timeOfDay - this._lastEnvUpdateHour);
      dh = Math.min(dh, 24 - dh);
      const cloudMoved = Math.abs(overcast - this._envBakeCloud) > 0.12;
      if ((dh >= 0.5 || cloudMoved) && this._pmremGenerator && this._quality !== 'low') {
        this._lastEnvUpdateHour = timeOfDay;
        this._envBakeCloud = overcast;
        this._updateEnvMap();
      }
    }
  }

  /** Crepuscular rays at golden hour: sun low, on or near the screen, gaps in the sky. */
  private _updateGodRays(golden: number, cumulus: number, overcast: number): void {
    const pass = this._godRayPass;
    if (!pass) return;
    let strength = 0;
    if (golden > 0.05 && this._quality !== 'low') {
      const p = this._sunNdc.copy(this._skySunDir).multiplyScalar(1000).add(this.camera.position).project(this.camera);
      const behind = this._c.v.copy(this._skySunDir).dot(this.camera.getWorldDirection(this._ssaoDir)) <= 0.05;
      if (!behind) {
        const out = Math.max(0, Math.abs(p.x) - 1, Math.abs(p.y) - 1);
        const onScreen = Math.max(0, 1 - out / 0.6);
        strength = godRayStrength(golden, onScreen, cumulus, overcast) * (this._quality === 'high' ? 1 : 0.8);
        const u = pass.uniforms;
        (u['uSun'].value as THREE.Vector2).set(p.x * 0.5 + 0.5, p.y * 0.5 + 0.5);
        u['uAspect'].value = this.camera.aspect;
        const t = u['uTint'].value as THREE.Color;
        t.copy(this._skyState.sunColor);
        const m = Math.max(t.r, t.g, t.b, 1e-4);
        t.multiplyScalar(1 / m);
      }
    }
    pass.uniforms['uStrength'].value = strength;
    pass.enabled = strength > 0.01;
  }

  /** Overcast grays the gradient and hides the sun; fog washes the dome toward the fog color. */
  private _applyWeatherToSky(sky: SkyPalette, overcast: number, fogAmt: number, flash: number): void {
    const tmp = this._c.tmp;
    const gray = (c: THREE.Color, k: number, amt: number): void => {
      const l = (c.r * 0.3 + c.g * 0.55 + c.b * 0.15) * k;
      c.lerp(tmp.setRGB(l, l * 1.01, l * 1.06), amt);
    };
    const a = overcast * 0.85;
    gray(sky.zenith, 1.9, a);
    gray(sky.horizonSun, 0.95, a);
    gray(sky.horizonAnti, 1.0, a);
    gray(sky.fog, 1.0, overcast * 0.7);
    gray(sky.cloudLit, 0.72, overcast * 0.8);
    gray(sky.cloudShade, 0.9, overcast * 0.6);
    sky.cloudShade.multiplyScalar(1 - overcast * 0.25);
    sky.cloudCover += (0.97 - sky.cloudCover) * overcast;
    sky.sunDisc *= 1 - overcast;
    sky.sunGlow *= 1 - overcast * 0.85;
    if (fogAmt > 0.001) {
      const l = Math.max(sky.fog.r, sky.fog.g, sky.fog.b);
      tmp.setRGB(l * 1.15, l * 1.17, l * 1.2);
      sky.fog.lerp(tmp, fogAmt * 0.6);
      sky.zenith.lerp(sky.fog, fogAmt * 0.45);
      sky.horizonSun.lerp(sky.fog, fogAmt * 0.8);
      sky.horizonAnti.lerp(sky.fog, fogAmt * 0.8);
    }
    if (flash > 0.001) {
      tmp.setRGB(0.6, 0.65, 0.8).multiplyScalar(flash);
      sky.zenith.add(tmp);
      sky.horizonSun.add(tmp);
      sky.horizonAnti.add(tmp);
      sky.cloudShade.add(tmp);
    }
  }

  private _applyLowBackground(wd: number, wg: number, wn: number): void {
    const bg = this.scene.background instanceof THREE.Color ? this.scene.background : new THREE.Color();
    const c = this._c.tmp;
    bg.set(this._daySkyColor).multiplyScalar(wd)
      .add(c.set(0xd98b62).multiplyScalar(wg))
      .add(c.set(0x0a1024).multiplyScalar(wn));
    this.scene.background = bg;
  }

  /** Bake the procedural sky (BAKE variant: bounded terms, NaN-safe) into a PMREM env map. */
  private _updateEnvMap(): void {
    if (!this._pmremGenerator || !this._sky) return;
    if (!this._envScene) {
      this._envScene = new THREE.Scene();
      this._envScene.add(this._sky.bakeMesh);
    }
    const rt = this._pmremGenerator.fromScene(this._envScene, 0.02);
    const prev = this._skyEnvRT;
    this._skyEnvRT = rt;
    this.scene.environment = rt.texture;
    prev?.dispose();
  }

  // ── Quality ───────────────────────────────────────────────────────────────

  /**
   * high   — 1024px shadows, SSAO, all post-processing, 2× pixel ratio
   * medium — 512px shadows, no SSAO, bloom + grade + FXAA, 1.5× pixel ratio
   * low    — no shadows, no post-processing, 1× pixel ratio, no fog, fixed noon
   */
  setGraphicsQuality(tier: Quality): void {
    const disposeShadowMap = () => {
      if (this._sunLight.shadow.map) {
        this._sunLight.shadow.map.dispose();
        (this._sunLight.shadow as THREE.LightShadow & { map: null }).map = null;
      }
      this.renderer.shadowMap.needsUpdate = true;
    };
    this._quality = tier;
    switch (tier) {
      case 'high':
      case 'medium':
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.autoUpdate = false;
        this._sunLight.shadow.mapSize.setScalar(tier === 'high' ? 1024 : 512);
        this._sunLight.shadow.radius = tier === 'high' ? 3 : 2;
        disposeShadowMap();
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, tier === 'high' ? 2 : 1.5));
        this._postProcessingEnabled = true;
        if (this._ssaoPass) this._ssaoPass.enabled = tier === 'high';
        if (this._colorGradingPass) this._colorGradingPass.enabled = true;
        this.scene.fog = new THREE.FogExp2(this._fogConfig.color, this._fogConfig.density);
        this._lastEnvUpdateHour = -999;
        if (this._sky) this._sky.mesh.visible = true;
        this.scene.background = null;
        break;
      case 'low':
        this.setWeather({ cloud: 0, fog: 0, rain: 0, snow: 0 });
        this.updateDayNight(11);
        this.renderer.shadowMap.enabled = false;
        this.renderer.shadowMap.needsUpdate = true;
        this.renderer.setPixelRatio(1);
        this._postProcessingEnabled = false;
        if (this._colorGradingPass) this._colorGradingPass.enabled = false;
        this.scene.fog = null;
        this.scene.environment = null;
        if (this._sky) this._sky.mesh.visible = false;
        this.scene.background = new THREE.Color(this._daySkyColor);
        if (this._particleSystem) this._particleSystem.visible = false;
        break;
    }
  }

  // ── Post-processing ───────────────────────────────────────────────────────

  /**
   * RenderPass → SSAO → HDR clamp → god rays → bloom → color grade → output → FXAA.
   * Grading runs in linear HDR (before OutputPass); FXAA expects sRGB (after it).
   */
  setupPostProcessing(w: number, h: number): void {
    const hdrTarget = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType });
    const composer = new EffectComposer(this.renderer, hdrTarget);
    composer.addPass(new RenderPass(this.scene, this.camera));

    // SSAO at ½ resolution; min/max distances normalised by the far plane
    // (tuned for occluders 0.03–8 units away).
    const ssaoPass = new SSAOPass(this.scene, this.camera, Math.floor(w / 2), Math.floor(h / 2));
    ssaoPass.kernelRadius = 4;
    ssaoPass.minDistance = 0.00003 * 1000 / CAMERA_FAR;
    ssaoPass.maxDistance = 0.008 * 1000 / CAMERA_FAR;
    // Skip the distant backdrop (userData.noSSAO) in the normal/depth pre-pass.
    const ssaoVis = ssaoPass as unknown as { _overrideVisibility: () => void; _visibilityCache: THREE.Object3D[] };
    const baseOverride = ssaoVis._overrideVisibility.bind(ssaoPass);
    ssaoVis._overrideVisibility = () => {
      baseOverride();
      for (const o of this.scene.children) {
        if (o.visible && o.userData.noSSAO) { o.visible = false; ssaoVis._visibilityCache.push(o); }
      }
    };
    composer.addPass(ssaoPass);
    this._ssaoPass = ssaoPass;

    // HDR clamp before bloom: caps the sun disc and zeroes NaN / Inf pixels.
    composer.addPass(new ShaderPass({
      uniforms: { tDiffuse: { value: null }, uMaxLuma: { value: 1.8 } },
      vertexShader: /* glsl */`
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
      `,
      fragmentShader: /* glsl */`
        uniform sampler2D tDiffuse;
        uniform float uMaxLuma;
        varying vec2 vUv;
        void main() {
          vec4 c = texture2D(tDiffuse, vUv);
          if (any(isnan(c)) || any(isinf(c))) c = vec4(0.0, 0.0, 0.0, 1.0);
          c.rgb = max(c.rgb, vec3(0.0));
          float luma = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
          if (luma > uMaxLuma) c.rgb *= uMaxLuma / luma;
          gl_FragColor = c;
        }
      `,
    }));

    const godRayPass = new ShaderPass(GodRayShader);
    godRayPass.enabled = false;
    composer.addPass(godRayPass);
    this._godRayPass = godRayPass;

    const bloomPass = new UnrealBloomPass(new THREE.Vector2(w, h), 0.22, 0.18, 0.85);
    composer.addPass(bloomPass);
    this._bloomPass = bloomPass;

    const colorGradingPass = new ShaderPass(ColorGradingShader);
    composer.addPass(colorGradingPass);
    this._colorGradingPass = colorGradingPass;

    composer.addPass(new OutputPass());

    const fxaaPass = new ShaderPass(FXAAShader);
    fxaaPass.uniforms['resolution'].value.set(1 / w, 1 / h);
    composer.addPass(fxaaPass);

    this._composer = composer;
    this._fxaaPass = fxaaPass;
    this._lastEnvUpdateHour = -999;
  }

  /** Render one frame (EffectComposer when available and enabled). */
  renderFrame(): void {
    // Shadows every other frame (the sun moves slowly).
    if (this.renderer.shadowMap.enabled && !this.renderer.shadowMap.autoUpdate) {
      this._shadowFrame = (this._shadowFrame + 1) % 2;
      if (this._shadowFrame === 0) this.renderer.shadowMap.needsUpdate = true;
    }
    // Normal bias of about one shadow texel (no acne at a grazing sun).
    const sh = this._sunLight.shadow;
    const texel = (sh.camera.right - sh.camera.left) / Math.max(1, sh.mapSize.x);
    sh.normalBias = Math.min(0.25, Math.max(0.04, texel * 1.1));
    if (this._composer && this._postProcessingEnabled) {
      // AO only when looking down on the scene, with a kernel that follows height.
      if (this._ssaoPass) {
        this.camera.getWorldDirection(this._ssaoDir);
        this._ssaoPass.enabled = this._quality === 'high' && this._ssaoDir.y < -0.3;
        this._ssaoPass.kernelRadius = Math.max(0.3, Math.min(4, this.camera.position.y * 0.3));
      }
      this._composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }

  /** Force the next frame to redraw shadows (after the world changed). */
  invalidateShadows(): void {
    this.renderer.shadowMap.needsUpdate = true;
  }

  resize(w: number, h: number): void {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    if (this._composer) {
      this._composer.setSize(w, h);
      this._ssaoPass?.setSize(Math.floor(w / 2), Math.floor(h / 2));
      this._fxaaPass?.uniforms['resolution'].value.set(1 / w, 1 / h);
    }
  }

  private _applyGradeForTime(): void {
    if (!this._colorGradingPass) return;
    const u = this._colorGradingPass.uniforms;
    const g = this._gradeBase;
    const { golden: wg, night: wn } = this._phase;
    u['uContrast'].value = g.contrast + wg * 0.05 - wn * 0.08;
    u['uSaturation'].value = g.saturation + wg * 0.10;
    u['uWarmStrength'].value = g.warm + wg * 0.16;
    u['uWarmThreshold'].value = g.threshold - wg * 0.22;
    u['uNight'].value = wn;
  }

  dispose(): void {
    this._composer?.dispose();
    this._skyEnvRT?.dispose();
    this._pmremGenerator?.dispose();
    if (this._sky) {
      this.scene.remove(this._sky.mesh);
      this._sky.dispose();
      this._sky = null;
    }
    if (this._particleSystem) {
      this.scene.remove(this._particleSystem);
      this._particleSystem.geometry.dispose();
      (this._particleSystem.material as THREE.Material).dispose();
      this._particleSystem = null;
    }
    this.renderer.dispose();
  }
}
