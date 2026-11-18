import { describe, expect, it } from 'vitest';
import { plantLayout, plantScale } from './plant';
import { FILTERING } from './air';

describe('dome plant layout', () => {
  it('shows more machinery as the ecology gets fuller, never less', () => {
    for (const [tier, r] of [['glass', 6], ['arcology', 15]] as const) {
      let last = 0, lastLamps = 0;
      for (const f of FILTERING) { const p = plantLayout(tier, r, f); expect(p.parts.length).toBeGreaterThanOrEqual(last); expect(p.lamps.length).toBeGreaterThanOrEqual(lastLamps); last = p.parts.length; lastLamps = p.lamps.length; }
    }
  });
  it('a plain dome shows almost nothing and the closed ecology the whole set', () => {
    expect(plantLayout('glass', 6, 'none').parts.length).toBeLessThan(10);
    expect(plantLayout('glass', 6, 'closed').parts.length).toBeGreaterThan(50);
  });
  it('machinery grows with the dome but is capped, and a bigger dome never gets a smaller plant', () => {
    let last = 0;
    for (const r of [3, 6, 9, 12, 15, 18]) { const s = plantScale(r); expect(s).toBeGreaterThanOrEqual(last); last = s; }
    expect(plantScale(100)).toBeLessThanOrEqual(1.5);
  });
  it('keeps the glass dome ground machinery inside the shell and the roof parts on it', () => {
    const r = 6, p = plantLayout('glass', r, 'closed');
    for (const q of p.parts) {
      if (q.onShell) { const rad = Math.hypot(q.x, q.z, q.y0); expect(Math.abs(rad - r)).toBeLessThan(0.05); }
      else if (!q.high) expect(Math.hypot(q.x, q.z)).toBeLessThan(r + 0.01);
    }
  });
  it('is deterministic and lamps line the airlock approaches', () => {
    expect(plantLayout('glass', 6, 'closed')).toEqual(plantLayout('glass', 6, 'closed'));
    const lamps = plantLayout('glass', 6, 'none').lamps;
    expect(lamps.length).toBeGreaterThan(5);
    for (const l of lamps) expect(Math.hypot(l.x, l.z)).toBeLessThan(6);
  });
});

describe('arcology service yard', () => {
  it('stands outside the armored band, where it can be seen, and every part is within the pad margin', () => {
    const r = 15, p = plantLayout('arcology', r, 'closed');
    const ground = p.parts.filter(q => !q.onShell && !q.high && !q.lie);
    expect(ground.some(q => Math.hypot(q.x, q.z) > r)).toBe(true);
    for (const q of ground) expect(Math.hypot(q.x, q.z)).toBeLessThan(r + 9);
  });
});
