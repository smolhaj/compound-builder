import { describe, expect, it } from 'vitest';
import { kitMaterial } from '../buildkit/materials';
import { setShellClimate, shellClimateNow } from './DomeShell';

describe('dome shell climate', () => {
  it('the shell materials exist, are their own (not the houses\' glass), and frost and bleach change them', () => {
    expect(kitMaterial('dome_glass')).not.toBe(kitMaterial('glass'));
    expect(kitMaterial('dome_polycarb')).not.toBe(kitMaterial('polycarb'));
    setShellClimate(0, 0);
    const clear = kitMaterial('dome_glass'), c0 = { op: clear.opacity, r: clear.roughness, col: clear.color.getHex() };
    setShellClimate(1, 0);
    expect(shellClimateNow()).toEqual({ frost: 1, bleach: 0 });
    expect(clear.opacity).toBeGreaterThan(c0.op); expect(clear.roughness).toBeGreaterThan(c0.r); expect(clear.color.getHex()).not.toBe(c0.col);
    const frosted = kitMaterial('arcology').opacity;
    setShellClimate(0, 1);
    expect(clear.opacity).toBeGreaterThan(c0.op); expect(clear.opacity).toBeLessThan(0.7);
    expect(kitMaterial('arcology').opacity).toBeLessThan(frosted);
    setShellClimate(0, 0);
    expect(clear.opacity).toBeCloseTo(c0.op, 9); expect(clear.color.getHex()).toBe(c0.col); expect(kitMaterial('glass').opacity).toBeCloseTo(0.28, 9);
  });
  it('ignores bad numbers and keeps house glass untouched', () => {
    const house = kitMaterial('glass').opacity;
    setShellClimate(NaN, Infinity);
    expect(shellClimateNow().frost).toBe(0); expect(kitMaterial('glass').opacity).toBe(house);
  });
  it('the double-sided shells keep their inner skin clear: a back-face branch in the fragment shader, reading the base values', () => {
    setShellClimate(0.5, 0);
    for (const id of ['dome_polycarb', 'arcology'] as const) {
      const m = kitMaterial(id), sh = { uniforms: {} as Record<string, { value: unknown }>, fragmentShader: '#include <color_fragment>\n#include <roughnessmap_fragment>\n#include <metalnessmap_fragment>' };
      m.onBeforeCompile(sh as never, undefined as never);
      expect(sh.fragmentShader).toContain('if ( !gl_FrontFacing ) diffuseColor');
      expect(sh.fragmentShader).toContain('if ( !gl_FrontFacing ) roughnessFactor');
      expect(sh.fragmentShader).toContain('if ( !gl_FrontFacing ) metalnessFactor');
      expect(sh.uniforms.uShellIn).toBeDefined();
    }
    // (dome_glass is front-side only, so its inner skin is never drawn: nothing to patch)
    expect(kitMaterial('dome_glass').customProgramCacheKey()).not.toBe('shell-inner-clear');
  });
});
