import { describe, it, expect } from 'vitest';
import { placeLabels, labelSize, distanceFade, pipFor, barHeight, type LabelIn } from './nameLabels';

const F = { w: 1280, h: 720, top: barHeight(720), bottom: barHeight(720) };
const L = (o: Partial<LabelIn> & { id: string }): LabelIn => ({ name: 'Ann', sx: 640, sy: 360, depth: 6, front: true, blocked: false, dead: false, deadFor: 0, gone: false, ...o });

describe('placeLabels', () => {
  it('shows a near label, fades and drops far ones', () => {
    expect(placeLabels([L({ id: 'a' })], F)).toHaveLength(1);
    expect(distanceFade(30)).toBeGreaterThan(0); expect(distanceFade(30)).toBeLessThan(1);
    expect(placeLabels([L({ id: 'a', depth: 45 })], F)).toHaveLength(0);
  });
  it('size shrinks with distance within bounds', () => {
    expect(labelSize(1)).toBe(15); expect(labelSize(40)).toBe(10.5); expect(labelSize(8)).toBeLessThan(labelSize(4));
  });
  it('drops behind-camera, blocked, gone and out-of-picture heads', () => {
    expect(placeLabels([L({ id: 'a', front: false }), L({ id: 'b', blocked: true }), L({ id: 'c', gone: true }), L({ id: 'd', sy: 20 }), L({ id: 'e', sy: 715 }), L({ id: 'f', sx: -5 })], F)).toHaveLength(0);
  });
  it('keeps labels out of the bars and caption area', () => {
    const out = placeLabels([L({ id: 'a', sy: F.top + 12 }), L({ id: 'b', sy: 720 - F.bottom - 2, sx: 300 })], F);
    for (const o of out) { expect(o.y - o.size / 2).toBeGreaterThanOrEqual(F.top); expect(o.y + o.size / 2).toBeLessThanOrEqual(720 - F.bottom); }
  });
  it('nudges an overlapping farther label up, never overlapping', () => {
    const out = placeLabels([L({ id: 'a', depth: 5 }), L({ id: 'b', depth: 9, name: 'Beth', sx: 650 })], F);
    expect(out).toHaveLength(2);
    const [a, b] = out; expect(b.y).toBeLessThan(a.y);
    expect(Math.abs(a.y - b.y)).toBeGreaterThanOrEqual(a.size);
  });
  it('drops the farther of a pile when there is no room', () => {
    const ins = Array.from({ length: 8 }, (_, i) => L({ id: `p${i}`, depth: 5 + i, sy: 200 }));
    const out = placeLabels(ins, F);
    expect(out.length).toBeLessThan(8); expect(out[0].id).toBe('p0');
  });
  it('dims the fallen and marks them with a cross when there are no pips', () => {
    const o = placeLabels([L({ id: 'a', dead: true, deadFor: 5 })], F)[0];
    expect(o.dim).toBe(true); expect(o.opacity).toBeLessThan(0.4); expect(o.text).toContain('†');
    expect(placeLabels([L({ id: 'a', dead: true, deadFor: 5, pip: true })], F)[0].text).toBe('Ann');
  });
});

describe('pipFor', () => {
  const s = { wound: 0, dead: false, lying: false, hands: false, carried: false };
  it('maps states', () => {
    expect(pipFor(s).kind).toBe('fine');
    expect(pipFor({ ...s, wound: 0.3 }).kind).toBe('wounded');
    expect(pipFor({ ...s, wound: 0.8 }).kind).toBe('down');
    expect(pipFor({ ...s, wound: 0.3, lying: true }).kind).toBe('down');
    expect(pipFor({ ...s, carried: true, wound: 0.4 }).kind).toBe('down');
    expect(pipFor({ ...s, dead: true, wound: 1 })).toMatchObject({ kind: 'dead', cross: true });
    expect(pipFor({ ...s, hands: true }).kind).toBe('held');
    expect(new Set(['fine', 'wounded', 'down', 'dead', 'held'].map((_, i) => i)).size).toBe(5);
  });
});
