import { describe, expect, it } from 'vitest';
import { computeWaterFlow, distanceToBank, encodeFlow, flowSpeedAt } from './waterFlow';

function raster(W: number, H: number, wetAt: (x: number, y: number) => boolean): Uint8Array {
  const a = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) a[y * W + x] = wetAt(x, y) ? 1 : 0;
  return a;
}

const base = { texel: 1, maxRiverHalfWidth: 6, baseSpeed: 0.3, refHalfWidth: 3 };

describe('waterFlow', () => {
  it('distance to bank ignores the raster border', () => {
    const W = 20, H = 10;
    const wet = raster(W, H, (_x, y) => y >= 3 && y <= 6);
    const d = distanceToBank(wet, W, H);
    expect(d[4 * W + 0]).toBeGreaterThan(1);   // left border is not a bank
    expect(d[3 * W + 10]).toBe(1);
    expect(d[0]).toBe(0);
  });

  it('a straight river flows downstream along its channel', () => {
    const W = 60, H = 20;
    const wet = raster(W, H, (_x, y) => y >= 7 && y <= 12);
    const f = computeWaterFlow({ ...base, W, H, wet, downstream: [1, 0] });
    const k = 9 * W + 30;
    expect(f.river[k]).toBe(1);
    expect(f.flow[k * 2]).toBeGreaterThan(0.1);
    expect(Math.abs(f.flow[k * 2 + 1])).toBeLessThan(0.05);
    // Faster mid-channel than at the bank
    expect(flowSpeedAt(f, 30, 9.5)).toBeGreaterThan(flowSpeedAt(f, 30, 7.5));
    // Reversed convention reverses the flow
    const g = computeWaterFlow({ ...base, W, H, wet, downstream: [-1, 0] });
    expect(g.flow[k * 2]).toBeLessThan(-0.1);
  });

  it('narrows run faster than wide reaches', () => {
    const W = 80, H = 30;
    const wet = raster(W, H, (x, y) => (x < 40 ? y >= 9 && y <= 20 : y >= 13 && y <= 16));
    const f = computeWaterFlow({ ...base, W, H, wet, downstream: [1, 0] });
    expect(flowSpeedAt(f, 60, 14.5)).toBeGreaterThan(flowSpeedAt(f, 15, 14.5));
  });

  it('ponds and lakes that never leave the raster stay still', () => {
    const W = 40, H = 40;
    const wet = raster(W, H, (x, y) => Math.hypot(x - 20, y - 20) < 8 || (y >= 30 && y <= 32 && x >= 5 && x <= 35));
    const f = computeWaterFlow({ ...base, W, H, wet, downstream: [1, 0] });
    for (let k = 0; k < W * H; k++) {
      expect(f.river[k]).toBe(0);
      expect(f.flow[k * 2]).toBe(0);
    }
  });

  it('bends and rocks raise foam, and encoding keeps still water neutral', () => {
    const W = 80, H = 60;
    // A river that turns a corner
    const wet = raster(W, H, (x, y) => (y >= 20 && y <= 25 && x <= 45) || (x >= 40 && x <= 45 && y >= 20));
    const f = computeWaterFlow({ ...base, W, H, wet, downstream: [1, 1], rockDensity: 2, seed: 3 });
    let bendFoam = 0, straightFoam = 0;
    for (let y = 20; y <= 25; y++) { bendFoam = Math.max(bendFoam, f.foam[y * W + 42]); straightFoam = Math.max(straightFoam, f.foam[y * W + 10]); }
    expect(bendFoam).toBeGreaterThan(straightFoam);
    expect(f.rocks.length).toBeGreaterThan(0);
    const data = new Uint8Array(W * H * 4);
    const scale = encodeFlow(f, data);
    expect(scale).toBeGreaterThan(0);
    expect(data[0]).toBe(128);
    expect(data[3]).toBe(0);
  });
});
