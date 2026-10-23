import { describe, expect, it } from 'vitest';
import { CABIN_LAYERS, layerFractions } from './cabinGeometry';

describe('cabin construction layers', () => {
  it('shows only stakes while the site is laid out', () => {
    const r = layerFractions(0, 0.5, true);
    expect(r.stakes).toBe(1);
    for (const l of CABIN_LAYERS) if (l !== 'stakes') expect(r[l]).toBe(0);
  });

  it('grows the foundation only once the stone is on site', () => {
    expect(layerFractions(1, 0.5, false).foundation).toBe(0);
    expect(layerFractions(1, 0.5, true).foundation).toBeCloseTo(0.5);
  });

  it('frames under scaffold, then roofs, then sides', () => {
    const fr = layerFractions(2, 0.4, true);
    expect(fr.frame).toBeCloseTo(0.4);
    expect(fr.scaffold).toBe(1);
    expect(fr.roof).toBe(0);
    const ro = layerFractions(3, 1, true);
    expect(ro.roof).toBe(1);
    expect(ro.walls).toBe(0);
    const fi = layerFractions(4, 0.5, true);
    expect(fi.walls).toBeGreaterThan(0.5);
    expect(fi.frame).toBe(1);
  });

  it('a finished cabin has no stakes, scaffold or bare framing; every stage is monotone', () => {
    const done = layerFractions(5, 0, true);
    expect(done.scaffold + done.stakes + done.frame + done.rafters).toBe(0);
    expect(done.walls + done.roof + done.openings).toBe(3);
    for (const l of ['foundation', 'deck', 'frame', 'rafters', 'roof', 'walls'] as const) {
      let prev = -1;
      for (let st = 0; st <= 4; st++) for (let f = 0; f <= 1.0001; f += 0.1) {
        const v = layerFractions(st, f, true)[l];
        if (l === 'frame' || l === 'rafters') { if (st <= 4) expect(v).toBeGreaterThanOrEqual(prev - 1e-9); }
        else expect(v).toBeGreaterThanOrEqual(prev - 1e-9);
        prev = v;
      }
    }
  });
});
