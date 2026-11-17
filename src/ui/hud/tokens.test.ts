import { describe, expect, it } from 'vitest';
import { SCENES, T, applyTokens, clampScale, contrast, cssVars, over, parseColor, removeTokens, roleContrast, tv } from './tokens';

const TEXT_ROLES = ['text', 'dim', 'good', 'warn', 'bad', 'info', 'accent'] as const;

describe('type scale, spacing, layers', () => {
  it('has the five-step scale, ascending, and nothing else', () => {
    expect(Object.values(T.font).filter(v => typeof v === 'number')).toEqual([11, 12.5, 13.5, 15, 20]);
  });
  it('spaces are multiples of the 4 px unit', () => {
    for (const v of Object.values(T.space)) expect(v % 4).toBe(0);
    expect(T.edge % 4).toBe(0);
  });
  it('z layers are strictly ordered hud < drawer < banner < toast < modal < cinematic < blocking', () => {
    const z = Object.values(T.z);
    expect(z).toHaveLength(7);
    for (let i = 1; i < z.length; i++) expect(z[i]).toBeGreaterThan(z[i - 1]);
  });
  it('controls meet the 28 px floor', () => { expect(T.size.control.sm).toBeGreaterThanOrEqual(28); expect(T.size.chip).toBeGreaterThanOrEqual(28); });
});

describe('contrast', () => {
  it('knows the extremes', () => { expect(contrast(parseColor('#000'), parseColor('#fff'))).toBeCloseTo(21, 0); });
  for (const [name, scene] of Object.entries(SCENES)) {
    it(`every text role is at least 4.5:1 on the panel over ${name}, and at least 6.3:1 for the target roles`, () => {
      for (const r of TEXT_ROLES) {
        const c = roleContrast(T.color[r], T.color.panel, scene);
        expect(c, `${r} over ${name}`).toBeGreaterThanOrEqual(6.3);
      }
    });
    it(`the control text on the control fill and the accent button text are readable over ${name}`, () => {
      expect(roleContrast(T.color.text, T.color.control, scene)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(parseColor(T.color.onAccent), parseColor(T.color.accent))).toBeGreaterThanOrEqual(4.5);
    });
    it(`the strong control boundary reaches 3:1 against the panel over ${name}`, () => {
      const panel = over(T.color.panel, scene), edge = over(T.color.lineStrong, `rgb(${panel[0]},${panel[1]},${panel[2]})`);
      expect(contrast(edge, panel)).toBeGreaterThanOrEqual(3);
    });
  }
  it('paper cards read: ink on paper', () => { expect(contrast(parseColor(T.color.ink), parseColor(T.color.paper))).toBeGreaterThanOrEqual(7); });
});

describe('tone glyphs: color is never the only signal', () => {
  it('warn and bad each have a distinct non-empty glyph; good is quiet', () => {
    expect(T.glyph.good).toBe('');
    expect(T.glyph.warn).not.toBe(''); expect(T.glyph.bad).not.toBe(''); expect(T.glyph.warn).not.toBe(T.glyph.bad);
  });
});

describe('css variables', () => {
  it('writes every token as --cb-*', () => {
    const v = cssVars();
    expect(v['--cb-font-sm']).toBe('12.5px');
    expect(v['--cb-color-on-accent']).toBe(T.color.onAccent);
    expect(v['--cb-z-modal']).toBe('50');
    expect(Object.keys(v).every(k => k.startsWith('--cb-'))).toBe(true);
  });
  it('tv reads a variable with the literal as fallback', () => { expect(tv.color('text')).toBe(`var(--cb-color-text, ${T.color.text})`); expect(tv.space(2)).toBe('var(--cb-space-2, 8px)'); });
  it('applyTokens adds the class and variables, removeTokens undoes it', () => {
    const el = { classList: new Set<string>() as unknown as DOMTokenList, style: { m: new Map<string, string>(), setProperty(k: string, v: string) { this.m.set(k, v); }, removeProperty(k: string) { this.m.delete(k); } } };
    (el.classList as unknown as { add: (c: string) => void; remove: (c: string) => void }).add = function (this: Set<string>, c: string) { Set.prototype.add.call(this, c); };
    const set = el.classList as unknown as Set<string> & { remove: (c: string) => void }; set.remove = (c: string) => { set.delete(c); };
    applyTokens(el as unknown as HTMLElement, 1.1);
    expect(set.has('cb-a')).toBe(true); expect(el.style.m.get('--cb-ui-scale')).toBe('1.1'); expect(el.style.m.size).toBeGreaterThan(40);
    removeTokens(el as unknown as HTMLElement);
    expect(set.has('cb-a')).toBe(false); expect(el.style.m.size).toBe(0);
  });
});

describe('UI scale', () => {
  it('clamps to 90 to 125 percent in 5 point steps', () => {
    expect(clampScale(0.5)).toBeCloseTo(0.9); expect(clampScale(2)).toBeCloseTo(1.25); expect(clampScale(1.07)).toBeCloseTo(1.05); expect(clampScale(NaN)).toBe(1);
  });
});
