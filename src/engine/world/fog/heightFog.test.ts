import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { BANK_FALLOFF, HEIGHT_FOG_GLSL, fogOpacity, heightFogOn, heightFogUniforms, installHeightFogPatch, opticalDepthBelow, setHeightFog, NO_HEIGHT_FOG } from './heightFog';
import { ValleyFog, extinctionPerUnit, fogTarget, NO_FOG_TARGET } from './ValleyFog';
import { fogAt, fogDay, fogForMode, fogVisibilityM, type FogPlace } from '../../../sim/fog';
import type { WeatherOutputs } from '../weather/weatherState';

describe('height fog optical depth', () => {
  const k = BANK_FALLOFF;
  it('a ray wholly below the top crosses D per unit; a level ray above it fades exponentially', () => {
    expect(opticalDepthBelow(2, 3, 10, 5, k, 0.2)).toBeCloseTo(2, 6);
    expect(opticalDepthBelow(8, 8, 10, 5, k, 0.2)).toBeCloseTo(0.2 * 10 * Math.exp(-k * 3), 6);
  });
  it('looking down from above the bank: only the part below the top counts, plus the exponential tail above', () => {
    // from y = 10 straight down to y = 0 (L = 10), top at 5: below part is half the ray
    const tau = opticalDepthBelow(10, 0, 10, 5, k, 0.3);
    const tail = (1 - Math.exp(-k * 5)) / (k * 5);   // mean of exp over the 5 units above the top
    expect(tau).toBeCloseTo(0.3 * (5 + 5 * tail), 6);
    expect(tau).toBeGreaterThan(0.3 * 5);
    expect(tau).toBeLessThan(0.3 * 10);
  });
  it('is symmetric in the direction of the ray and grows with length and density', () => {
    expect(opticalDepthBelow(10, 0, 10, 5, k, 0.3)).toBeCloseTo(opticalDepthBelow(0, 10, 10, 5, k, 0.3), 9);
    expect(opticalDepthBelow(10, 0, 20, 5, k, 0.3)).toBeGreaterThan(opticalDepthBelow(10, 0, 10, 5, k, 0.3));
    expect(opticalDepthBelow(10, 0, 10, 5, k, 0.6)).toBeCloseTo(2 * opticalDepthBelow(10, 0, 10, 5, k, 0.3), 9);
  });
  it('a camp above the bank sees the valley floor as a white sea; the same bank seen from the side is thin', () => {
    const above = fogOpacity(opticalDepthBelow(12, 0, 25, 5, k, 0.3));    // looking down at the valley floor 25 units away
    const level = fogOpacity(opticalDepthBelow(12, 11, 25, 5, k, 0.3));   // looking across at a ridge above the bank
    expect(above).toBeGreaterThan(0.9);
    expect(level).toBeLessThan(above);
    expect(level).toBeLessThan(above * 0.3);
  });
  it('the cloud deck is the same integral mirrored: ridges above its base dissolve, ground below it does not', () => {
    const base = 20;
    const intoCloud = opticalDepthBelow(-10, -30, 40, -base, 0.18, 0.1);   // eye at 10, ridge at 30: the ray enters the deck
    const under = opticalDepthBelow(-10, -5, 40, -base, 0.18, 0.1);        // eye at 10, ground at 5: stays under the base
    expect(intoCloud).toBeGreaterThan(under * 3);
  });
});

describe('the shader patch', () => {
  it('registers the shared uniforms on the standard materials and adds the varying to the fog chunks, once', () => {
    installHeightFogPatch(); installHeightFogPatch();
    const SC = THREE.ShaderChunk as unknown as Record<string, string>;
    expect(SC.fog_pars_vertex.match(/varying vec3 vFogV/g)).toHaveLength(1);
    expect(SC.fog_vertex).toContain('vFogV = mvPosition.xyz');
    expect(SC.fog_pars_fragment).toContain('uniform vec4 uHFogA');
    expect(SC.fog_fragment).toContain('hfBelow(');
    expect(HEIGHT_FOG_GLSL).toContain('#ifdef STANDARD');
    const std = THREE.ShaderLib.standard.uniforms as Record<string, THREE.IUniform>;
    expect(std.uHFogA.value).toBe(heightFogUniforms().a);
    // the materials' cloned uniforms keep the shared object
    const cloned = THREE.UniformsUtils.clone(THREE.ShaderLib.standard.uniforms) as Record<string, THREE.IUniform>;
    expect(cloned.uHFogA.value).toBe(heightFogUniforms().a);
  });
  it('writes parameters into the shared uniforms; zero means off', () => {
    setHeightFog({ ...NO_HEIGHT_FOG, bankTop: 8, bankDensity: 0.2, cloudBase: 30, cloudDensity: 0.05, noise: 0.5, time: 12 });
    const u = heightFogUniforms();
    expect([u.a.x, u.a.y, u.b.x, u.b.y, u.b.w, u.a.w]).toEqual([8, 0.2, 30, 0.05, 0.5, 12]);
    expect(heightFogOn()).toBe(true);
    setHeightFog(NO_HEIGHT_FOG);
    expect(heightFogOn()).toBe(false);
  });
});

describe('valley fog target', () => {
  const place: FogPlace = { campAboveFloorM: 73, ridgeAboveCampM: 120, mountain: true };
  const ground = { campY: 12.2, floorY: 12.2 - 73 / 6 };
  const dense = (() => { for (let s = 1; s < 80; s++) for (let d = 244; d < 334; d++) { const x = fogDay(s, d, 'pnw'); if (x.valley > 0.8 && x.depth > 0.6 && x.depth < 0.9) return fogAt(x, 6.5, place); } throw new Error('none'); })();
  it('puts the bank top where the sim says: N m below the camp', () => {
    const t = fogTarget(dense, ground);
    expect(dense.belowCampM).toBeGreaterThan(-100);
    expect(t.bankTopY).toBeCloseTo(ground.campY - dense.belowCampM / 6, 6);
    expect(t.bankDensity).toBeGreaterThan(0.05);
  });
  it('draws the density that gives the sim\'s sight range (Koschmieder)', () => {
    expect(extinctionPerUnit(40)).toBeCloseTo(0.5868, 3);
    // sight range at the bank's own density is the extinction's inverse
    const t = fogTarget(dense, ground);
    expect(3.912 * 6 / t.bankDensity).toBeCloseTo(fogVisibilityM(dense.density), 0);
  });
  it('no fog, no bank, no cloud, no overcast', () => {
    expect(fogTarget(null, ground)).toEqual(NO_FOG_TARGET);
    const clear = fogTarget(fogAt(fogDay(1, 200, 'desert'), 12, place), ground);
    expect(clear.bankDensity).toBe(0);
    expect(clear.cloudDensity).toBe(0);
    expect(clear.overcast).toBe(0);
  });
  it('a drizzling overcast day lowers a cloud deck onto the ridges', () => {
    const rain = fogForMode('rain', place)!;
    const t = fogTarget(rain, ground);
    expect(t.cloudDensity).toBeGreaterThan(0.05);
    expect(t.cloudBaseY).toBeGreaterThan(ground.campY);
    expect(t.cloudBaseY).toBeLessThan(ground.campY + 40);
    expect(t.drizzle).toBeGreaterThan(0.5);
    expect(t.overcast).toBeGreaterThan(0.8);
  });
  it('forced modes: clear has no fog; fog is a bank under the camp; the rest are overcast', () => {
    expect(fogForMode('clear', place)).toBeNull();
    expect(fogForMode('partly', place)).toBeNull();
    const f = fogForMode('fog', place)!;
    expect(f.bankM).toBeGreaterThan(30);
    expect(f.belowCampM).toBeGreaterThan(0);
    expect(fogForMode('overcast', place)!.overcast).toBeGreaterThan(0.8);
  });
});

describe('ValleyFog easing', () => {
  const t = { ...NO_FOG_TARGET, bankTopY: 8, bankDensity: 0.3, overcast: 0.8, mist: 0.2, drizzle: 0.5 };
  it('rolls in and out instead of popping, and a bank that forms appears at its height', () => {
    const v = new ValleyFog();
    v.update(0.1, t);
    expect(v.cur.bankTopY).toBe(8);
    expect(v.cur.bankDensity).toBeGreaterThan(0);
    expect(v.cur.bankDensity).toBeLessThan(0.3);
    for (let i = 0; i < 400; i++) v.update(0.1, t);
    expect(v.cur.bankDensity).toBeCloseTo(0.3, 2);
    for (let i = 0; i < 800; i++) v.update(0.1, NO_FOG_TARGET);
    expect(v.cur.bankDensity).toBe(0);
    expect(v.cur.overcast).toBeLessThan(0.01);
  });
  it('snap jumps to the target; params carry the quality noise', () => {
    const v = new ValleyFog();
    v.update(0.016, t); v.snap();
    expect(v.cur.bankDensity).toBe(0.3);
    expect(v.params(0.8).noise).toBe(0.8);
    expect(v.params(0.4).bankTop).toBe(8);
  });
  it('mist drifts past a camera that stands in the bank or the cloud, not one above them', () => {
    const v = new ValleyFog();
    v.update(0.1, { ...NO_FOG_TARGET, bankTopY: 8, bankDensity: 0.3, cloudBaseY: 40, cloudDensity: 0.08 }); v.snap();
    expect(v.nearMist(3)).toBeGreaterThan(0.5);      // in the bank
    expect(v.nearMist(20)).toBe(0);                  // between the bank and the cloud
    expect(v.nearMist(60)).toBeGreaterThan(0.3);     // in the cloud
    expect(new ValleyFog().nearMist(3)).toBe(0);
  });
  const wx = (): WeatherOutputs => ({ cloud: 0.8, cumulus: 0.2, cirrus: 0, rain: 0, snow: 0, fog: 0.9, storm: 0, distantStorm: 0, wind: 0.3, haze: 0.4, wetness: 0, snowCover: 0 });
  it('in auto the sim\'s sky replaces the weather layer\'s own overcast and fog, and drizzle becomes fine rain and damp ground', () => {
    const v = new ValleyFog(); v.update(0.1, t); v.snap();
    const o = wx(); v.applyTo(o, true);
    expect(o.cloud).toBeCloseTo(0.8, 2);   // from the sim (0.8), not the spell's own
    const o2 = { ...wx(), cloud: 0.95 }; v.applyTo(o2, true);
    expect(o2.cloud).toBeLessThanOrEqual(0.8 + 1e-9);   // an overcast spell with no precipitation does not keep its cloud
    expect(o.fog).toBeLessThan(0.9);
    expect(o.rain).toBeGreaterThan(0.05);
    expect(o.wetness).toBeGreaterThan(0.2);
    const clear = new ValleyFog(); clear.update(1, NO_FOG_TARGET);
    const o3 = { ...wx(), cloud: 0.8, rain: 0.6 }; clear.applyTo(o3, true);
    expect(o3.cloud).toBeGreaterThan(0.5);   // a real rain spell keeps its clouds
    const o4 = { ...wx(), cloud: 0.8 }; clear.applyTo(o4, true);
    expect(o4.cloud).toBe(0);                 // the sim says a clear day: no overcast
  });
});
