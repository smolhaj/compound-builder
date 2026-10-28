import { describe, expect, it } from 'vitest';
import { parseLowRender, RenderRequests } from './qaRender';

describe('parseLowRender', () => {
  it('is off without the param', () => { expect(parseLowRender('').on).toBe(false); expect(parseLowRender('?x=1').on).toBe(false); });
  it('is on with the bare param at half resolution', () => { expect(parseLowRender('?lowrender')).toEqual({ on: true, scale: 0.5 }); });
  it('takes a sane scale and ignores junk', () => {
    expect(parseLowRender('?lowrender=0.75').scale).toBe(0.75);
    expect(parseLowRender('?lowrender=abc').scale).toBe(0.5);
    expect(parseLowRender('?lowrender=9').scale).toBe(0.5);
  });
});

describe('RenderRequests', () => {
  it('resolves every request on the next draw and picks the highest quality', async () => {
    const r = new RenderRequests();
    expect(r.pending).toBe(false);
    const a = r.request(), b = r.request('medium'), c = r.request('high');
    expect(r.pending).toBe(true);
    expect(r.quality).toBe('high');
    r.drawn();
    await Promise.all([a, b, c]);
    expect(r.pending).toBe(false);
    expect(r.quality).toBeNull();
  });
});
