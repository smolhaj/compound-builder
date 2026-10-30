import { describe, expect, it } from 'vitest';
import { capGapMs, FrameBudget, isStrongGpu, lowerTier, pickStartTier } from './qualityAuto';

describe('pickStartTier', () => {
  it('software GL starts on Low', () => { expect(pickStartTier({ gpu: 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device), SwiftShader driver)', cores: 16, memoryGB: 8 })).toBe('low'); });
  it('a 2-core or 2 GB device starts on Low', () => { expect(pickStartTier({ cores: 2, gpu: 'x' })).toBe('low'); expect(pickStartTier({ memoryGB: 2, gpu: 'x' })).toBe('low'); });
  it('integrated Intel and phones start on Medium', () => {
    expect(pickStartTier({ gpu: 'ANGLE (Intel, Intel(R) UHD Graphics 630)', cores: 12, memoryGB: 8 })).toBe('medium');
    expect(pickStartTier({ gpu: 'Adreno (TM) 650', cores: 8, memoryGB: 8 })).toBe('medium');
  });
  it('recognises Apple M1 / M2 / M3 Pro / Max / Ultra (ANGLE Metal and Safari strings) and discrete GPUs as strong', () => {
    for (const g of ['ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Pro, Unspecified Version)', 'ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Max, Unspecified Version)', 'ANGLE (Apple, ANGLE Metal Renderer: Apple M2 Ultra, Unspecified Version)', 'ANGLE (Apple, ANGLE Metal Renderer: Apple M3 Pro, Unspecified Version)', 'Apple GPU', 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060)']) expect(isStrongGpu(g)).toBe(true);
    expect(isStrongGpu('ANGLE (Intel, Intel(R) UHD Graphics 630)')).toBe(false);
  });
  it('an M1 Pro (10 cores) starts on Medium, not Low; on High only when auto-High is on', () => {
    const m1 = { gpu: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Pro, Unspecified Version)', cores: 10, memoryGB: 8 };
    expect(pickStartTier(m1)).toBe('medium');
    expect(pickStartTier(m1, true)).toBe('high');
  });
  it('a strong GPU on a 4-core machine, or an unknown GPU, is Medium', () => {
    expect(pickStartTier({ gpu: 'NVIDIA GeForce RTX 3060', cores: 4, memoryGB: 8 })).toBe('medium');
    expect(pickStartTier({ gpu: '', cores: 16, memoryGB: 8 })).toBe('medium');
  });
});

describe('lowerTier', () => { it('steps down and stops', () => { expect(lowerTier('high')).toBe('medium'); expect(lowerTier('medium')).toBe('low'); expect(lowerTier('low')).toBeNull(); }); });

describe('FrameBudget', () => {
  const run = (b: FrameBudget, ms: number, seconds: number) => { let tripped = false; for (let t = 0; t < seconds * 1000; t += ms) tripped = b.push(ms) || tripped; return tripped; };
  it('trips after 3 s of 50 ms frames', () => { const b = new FrameBudget(); expect(run(b, 50, 2.5)).toBe(false); expect(run(b, 50, 1)).toBe(true); });
  it('does not trip on steady 30 fps', () => { expect(run(new FrameBudget(), 33, 30)).toBe(false); });
  it('a brief hitch drains away', () => { const b = new FrameBudget(); expect(run(b, 80, 1.5)).toBe(false); expect(run(b, 16, 5)).toBe(false); expect(run(b, 80, 1.5)).toBe(false); });
  it('ignores a load hitch or tab switch', () => { const b = new FrameBudget(); for (let i = 0; i < 20; i++) expect(b.push(5000)).toBe(false); });
  it('smooths the average for the readout', () => { const b = new FrameBudget(); run(b, 20, 3); expect(b.avgMs).toBeCloseTo(20, 0); });
});

describe('capGapMs', () => { it('60 fps leaves a 120 Hz display every second frame, a 60 Hz one every frame', () => { expect(capGapMs(60)).toBeCloseTo(15.17, 1); expect(capGapMs(0)).toBe(0); }); });
