import { describe, expect, it, beforeEach } from 'vitest';
import * as THREE from 'three';
import { domeGradeNow, writeDomeGrade, DOME_EDGE, DOME_MAX, DOME_UNIFORMS, DOME_DECL, clearDomeMask, domeMaskAt, domeMaskInfo, seaLocalGlsl, seaLocalize, writeDomeMask } from './domeMask';
import { SEASON_UNIFORMS, installSeasonShaderPatch } from './seasonShader';

beforeEach(() => clearDomeMask());

describe('dome mask (CPU twin of the shader)', () => {
  it('is zero with no dome', () => { expect(domeMaskAt(0, 0, 0)).toBe(0); expect(domeMaskInfo().count).toBe(0); });
  it('a dome: full protection inside, none at and outside the shell, a soft edge about one cell wide', () => {
    writeDomeMask([{ x: 10, z: 10, r: 3.75, y: 2, k: 1 }]);
    expect(domeMaskAt(10, 2, 10)).toBe(1);
    expect(domeMaskAt(10 + 3.75 - DOME_EDGE - 0.01, 2, 10)).toBeCloseTo(1, 2);
    expect(domeMaskAt(10 + 3.75, 2, 10)).toBeLessThan(0.001);
    expect(domeMaskAt(10 + 5, 2, 10)).toBe(0);
    const mid = domeMaskAt(10 + 3.75 - DOME_EDGE / 2, 2, 10);
    expect(mid).toBeGreaterThan(0.3); expect(mid).toBeLessThan(0.7);
  });
  it('monotone from the middle out along the ground', () => {
    writeDomeMask([{ x: 0, z: 0, r: 3, y: 0, k: 0.8 }]);
    let last = 1;
    for (let d = 0; d < 5; d += 0.05) { const v = domeMaskAt(d, 0, 0); expect(v).toBeLessThanOrEqual(last + 1e-9); last = v; }
  });
  it('the shell itself (at distance r above the ground) is outside the mask, so it keeps its snow load; the roof of a house inside is in', () => {
    writeDomeMask([{ x: 0, z: 0, r: 3.75, y: 0, k: 1 }]);
    expect(domeMaskAt(0, 3.75, 0)).toBeLessThan(0.001);                       // the crown of the shell
    expect(domeMaskAt(2.65, 2.65, 0)).toBeLessThan(0.001);                    // the shell at 45 degrees
    expect(domeMaskAt(0.5, 0.9, 0.5)).toBe(1);                                // a roof inside
    expect(domeMaskAt(0, -2, 0)).toBe(1);                                     // below the ground line counts as on it
  });
  it('the protection scales the mask (a dome losing its plant lets the outside back in)', () => {
    writeDomeMask([{ x: 0, z: 0, r: 3, y: 0, k: 0.25 }]);
    expect(domeMaskAt(0, 0, 0)).toBeCloseTo(0.25, 5);
    writeDomeMask([{ x: 0, z: 0, r: 3, y: 0, k: 0 }]);
    expect(domeMaskInfo().count).toBe(0);
  });
  it('a walkway tube is a capsule along its line', () => {
    writeDomeMask([{ x: 0, z: 0, x2: 10, z2: 0, r: 0.3, edge: 0.12, y: 0, k: 1 }]);
    expect(domeMaskAt(5, 0.05, 0.1)).toBe(1);
    expect(domeMaskAt(5, 0, 1)).toBe(0);
    expect(domeMaskAt(-0.5, 0, 0)).toBe(0);
    expect(domeMaskAt(10.1, 0, 0)).toBe(1);
  });
  it('several domes at once, each with its own protection; beyond the cap the rest fall back to the outside look', () => {
    const list = Array.from({ length: DOME_MAX + 3 }, (_, i) => ({ x: i * 20, z: 0, r: 3, y: 0, k: i === 1 ? 0.5 : 1 }));
    expect(writeDomeMask(list)).toBe(DOME_MAX);
    expect(domeMaskAt(0, 0, 0)).toBe(1);
    expect(domeMaskAt(20, 0, 0)).toBeCloseTo(0.5, 5);
    expect(domeMaskAt((DOME_MAX - 1) * 20, 0, 0)).toBe(1);
    expect(domeMaskAt(DOME_MAX * 20, 0, 0)).toBe(0);
  });
  it('skips unprotected, empty and non-finite footprints and keeps the dormant look in range', () => {
    expect(writeDomeMask([{ x: 0, z: 0, r: 3, y: 0, k: 0 }, { x: 0, z: 0, r: 0, y: 0, k: 1 }, { x: NaN, z: 0, r: 3, y: NaN, k: NaN }], 3)).toBe(0);
    expect(domeMaskInfo().dormant).toBe(1);
  });
});

describe('dome mask uniforms (render smoke)', () => {
  it('the block survives three\'s cloneUniforms by reference, so every material sees the live values', () => {
    // (ShaderMaterial.clone runs three's cloneUniforms, the same copy every compiled material gets)
    const cloned = new THREE.ShaderMaterial({ uniforms: SEASON_UNIFORMS as unknown as Record<string, THREE.IUniform> }).clone().uniforms;
    expect(cloned.uSeaDome.value).toBe(DOME_UNIFORMS.uSeaDome.value);
    expect(cloned.uSeaDomeI.value).toBe(DOME_UNIFORMS.uSeaDomeI.value);
    writeDomeMask([{ x: 1, z: 2, r: 3, y: 4, k: 0.5 }], 0.25);
    expect((cloned.uSeaDome.value as Float32Array)[0]).toBe(1);
    expect((cloned.uSeaDome.value as Float32Array)[3]).toBeCloseTo(0.5, 6);
    expect((cloned.uSeaDomeI.value as { x: number; y: number }).x).toBe(1);
    expect((cloned.uSeaDomeI.value as { x: number; y: number }).y).toBeCloseTo(0.25, 6);
    expect((DOME_UNIFORMS.uSeaDome.value as Float32Array).length).toBe(DOME_MAX * 8);
  });
  it('the shader chunks declare the block, the mask function and the local season copies, and the surface patch masks the season', () => {
    expect(DOME_DECL).toContain(`uniform vec4 uSeaDome[${DOME_MAX * 2}]`);
    expect(DOME_DECL).toContain('float seaDomeK( vec3 p )');
    expect(seaLocalGlsl('p')).toContain('seaDomeK( p )');
    expect(seaLocalize('uSeaB.x + uSeaDomeI.y + uSeaP.x + uSeaD.w')).toBe('seLB.x + uSeaDomeI.y + uSeaP.x + seLD.w');
    installSeasonShaderPatch();
    const SC = THREE.ShaderChunk as unknown as Record<string, string>;
    expect(SC.lights_physical_pars_fragment).toContain('float seaDomeK( vec3 p )');
    expect(SC.season_surface).toContain('seaDomeM = seaDomeK(');
    expect(SC.season_surface).toContain('vec4 seLB = vec4(');
    // the localized block reads the local copies, never the world's snow / ice / frost / rime uniforms
    const block = SC.season_surface.slice(SC.season_surface.indexOf('float seN1'));
    expect(block).not.toMatch(/\buSea[ABCD]\b/);
    const lib = THREE.ShaderLib.standard.uniforms as Record<string, THREE.IUniform>;
    expect(lib.uSeaDome.value).toBe(DOME_UNIFORMS.uSeaDome.value);
  });
});

describe('dome grade compensation', () => {
  it('is the inverse of the frame cast and saturation, clamped, neutral for no grade or bad input', () => {
    writeDomeGrade([0.9, 0.98, 1.1], 0.55);
    const g = domeGradeNow();
    expect(g.x).toBeCloseTo(1 / 0.9, 5); expect(g.z).toBeCloseTo(1 / 1.1, 5); expect(g.w).toBeCloseTo(1 / 0.55, 5);
    writeDomeGrade([1, 1, 1], 1);
    expect(domeGradeNow()).toEqual({ x: 1, y: 1, z: 1, w: 1 });
    writeDomeGrade([0.01, NaN, 9], 0.1);
    const b = domeGradeNow();
    expect(b.x).toBe(1); expect(b.y).toBe(1); expect(b.z).toBeCloseTo(0.6, 5); expect(b.w).toBe(2.2);
    writeDomeGrade([1, 1, 1], 1);
  });
});
