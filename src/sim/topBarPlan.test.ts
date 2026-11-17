import { describe, expect, it } from 'vitest';
import { BAR, CHIP_ORDER, DESIGN_WIDTHS, speedWidth, topBarPlan, worstTone, type ChipId } from './topBarPlan';

const ALL = CHIP_ORDER.filter(c => c !== 'debt');

describe('the top bar plan at the reference widths (docs/UX_AUDIT.md 11.1)', () => {
  it('1512: every chip, full mode, five speed buttons, nothing in the overflow', () => {
    const p = topBarPlan(1512);
    expect(p.mode).toBe('full'); expect(p.speedButtons).toBe(5); expect(p.shown).toEqual(ALL); expect(p.overflow).toEqual([]); expect(p.showDate).toBe(true);
  });
  it('1280: still all nine, full', () => {
    const p = topBarPlan(1280);
    expect(p.shown).toEqual(ALL); expect(p.mode).toBe('full'); expect(p.speedButtons).toBe(5); expect(p.slack).toBeGreaterThanOrEqual(0);
  });
  it('1100: compact chips, all nine, four speed buttons', () => {
    const p = topBarPlan(1100);
    expect(p.mode).toBe('compact'); expect(p.shown).toEqual(ALL); expect(p.speedButtons).toBe(4); expect(p.slack).toBeGreaterThanOrEqual(0);
  });
  it('900: compact, the last chips (by priority) move into the overflow', () => {
    const p = topBarPlan(900);
    expect(p.mode).toBe('compact'); expect(p.overflow.length).toBeGreaterThan(0);
    expect(p.overflow).toEqual(ALL.slice(ALL.length - p.overflow.length));   // always the tail of the priority list
    expect(p.shown.slice(0, 2)).toEqual(['threat', 'cash']);
    expect(p.overflow).toContain('fuel');
  });
  it('760: three speed buttons, the date still shows, only the top chips stay', () => {
    const p = topBarPlan(760);
    expect(p.speedButtons).toBe(3); expect(p.showDate).toBe(true); expect(p.shown[0]).toBe('threat'); expect(p.overflow).toContain('fuel'); expect(p.slack).toBeGreaterThanOrEqual(0);
  });
  it('the debt chip rides after cash and is dropped only after the chips below it', () => {
    const a = topBarPlan(1100, { present: CHIP_ORDER });
    expect(a.shown.slice(0, 3)).toEqual(['threat', 'cash', 'debt']);
    const b = topBarPlan(900, { present: CHIP_ORDER });
    expect(b.shown).toContain('debt'); expect(b.overflow.length).toBeGreaterThan(topBarPlan(900).overflow.length - 1);
  });
});

describe('invariants over every width', () => {
  const widths = Array.from({ length: (1920 - 700) / 20 + 1 }, (_, i) => 700 + i * 20);
  for (const debt of [false, true]) {
    it(`never wider than the window (edge ${BAR.edge}), shown and overflow partition the chips, in priority order${debt ? ', with the debt chip' : ''}`, () => {
      const present = debt ? CHIP_ORDER : ALL;
      for (const vw of widths) {
        const p = topBarPlan(vw, { present });
        expect(p.width, `width at ${vw}`).toBeLessThanOrEqual(vw - 2 * BAR.edge);
        expect([...p.shown, ...p.overflow]).toEqual(present);
        expect(p.shown.length).toBeGreaterThanOrEqual(2);   // threat and cash never drop at 700 and up
      }
    });
  }
  it('more room never hides more: shown chips only grow as the window widens (same mode or a step up)', () => {
    let prev = 0;
    for (const vw of widths) { const p = topBarPlan(vw); if (p.mode === 'full') expect(p.shown.length).toBeGreaterThanOrEqual(prev); prev = p.shown.length; }
  });
  it('wider measured chips (a long threat line) push the tail into the overflow, never off the bar', () => {
    const fat = DESIGN_WIDTHS.map(w => (w.id === 'threat' ? { ...w, full: w.full + 120, compact: w.compact + 60 } : w));
    for (const vw of [1100, 1280, 1512]) {
      const p = topBarPlan(vw, { widths: fat });
      expect(p.width).toBeLessThanOrEqual(vw - 2 * BAR.edge);
    }
  });
  it('speed group widths are what the bar lays out', () => { expect(speedWidth(5)).toBe(186); expect(speedWidth(4)).toBe(148); expect(speedWidth(3)).toBe(110); });
  it('a UI scale above 100 percent shrinks the room: the bar fits vw / scale', () => {
    const roomy = topBarPlan(1512 / 1.25), plain = topBarPlan(1512);
    expect(roomy.width).toBeLessThanOrEqual(1512 / 1.25 - 2 * BAR.edge);
    expect(roomy.shown.length).toBeLessThanOrEqual(plain.shown.length);
  });
});

describe('overflow tone', () => {
  it('is the worst tone among the hidden chips', () => {
    expect(worstTone(['good', 'warn', 'bad'])).toBe('bad');
    expect(worstTone(['good', 'warn'])).toBe('warn');
    expect(worstTone(['good', 'good'])).toBe('good');
    expect(worstTone([])).toBe('good');
  });
  it('the chip ids are exactly the nine plus owe', () => { expect(new Set<ChipId>(CHIP_ORDER).size).toBe(10); });
});
