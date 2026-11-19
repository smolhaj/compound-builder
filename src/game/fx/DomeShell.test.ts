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
});
