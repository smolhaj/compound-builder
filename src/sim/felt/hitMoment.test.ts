import { describe, expect, it } from 'vitest';
import { DISASTERS } from '../disaster';
import { FELT_KINDS } from './registry';
import { at, duration, genericHit, hitFor, HIT_BY_KIND, MAX_SECONDS, reduceMotion } from './hitMoment';

describe('hit moment', () => {
  const kinds = [...new Set([...FELT_KINDS, ...Object.keys(DISASTERS)])];
  it('every kind has a sequence: 2 to 4 beats, sorted, at most 6 s, with a title', () => {
    for (const k of kinds) {
      const h = hitFor(k)!;
      expect(h, k).toBeTruthy();
      expect(h.beats.length, k).toBeGreaterThanOrEqual(2);
      expect(h.beats.length, k).toBeLessThanOrEqual(4);
      expect(h.title.length, k).toBeGreaterThan(5);
      expect(h.beats[0].at, k).toBe(0);
      h.beats.forEach((b, i) => { if (i) expect(b.at, k).toBeGreaterThan(h.beats[i - 1].at); });
      expect(duration(h), k).toBeLessThanOrEqual(MAX_SECONDS);
      for (const b of h.beats) if (b.caption) expect(b.caption.length, k).toBeLessThan(70);
    }
  });
  it('titles are unique across the table', () => {
    const t = Object.values(HIT_BY_KIND).map(h => h!.title);
    expect(new Set(t).size).toBe(t.length);
  });
  it('reduced motion zeroes shake and caps flash at 0.3', () => {
    for (const k of kinds) for (const b of reduceMotion(hitFor(k)!).beats) { expect(b.shake ?? 0).toBe(0); expect(b.flash ?? 0).toBeLessThanOrEqual(0.3); }
  });
  it('the sampler shows captions in order, fades the flash and ends with the title', () => {
    const h = hitFor('mega_quake')!;
    expect(at(h, 0).caption).toBe(h.beats[0].caption);
    expect(at(h, 0).shake).toBeGreaterThan(0.9);
    expect(at(h, 2.2).caption).toBe(h.beats[1].caption);
    expect(at(h, h.beats[2].at + 0.1).title).toBe(h.title);
    expect(at(h, 0.1).title).toBeNull();
    expect(at(h, duration(h)).done).toBe(true);
    expect(at(hitFor('wildfire')!, 3.7).flash).toBe(0);
  });
  it('the generic hit works for an unknown kind', () => {
    expect(genericHit('nope').beats.length).toBe(3);
    expect(hitFor(null)).toBeNull();
  });
});
