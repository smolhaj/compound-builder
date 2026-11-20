import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { SkirtPlan, SkirtSection } from './DomeSkirtCutaway';
import { SKIRT_NUMBERS, skirtFacts } from '../sim/dome/skirtFacts';
import { DOME_TIERS, TIER } from '../sim/dome/tiers';
import { digStops } from '../sim/dome/crossing';

describe('skirt cutaway', () => {
  it('reads every number off the pure dome model', () => {
    for (const t of DOME_TIERS) {
      const f = skirtFacts(t);
      expect(f.depth).toBe(TIER[t].skirtFt);
      expect(f.plain).toBe(digStops(TIER[t].skirtFt, 0));
      expect(f.learned).toBe(digStops(TIER[t].skirtFt, 1));
    }
    expect(SKIRT_NUMBERS.coverPlain).toBe(17);
    expect(SKIRT_NUMBERS.coverLearned).toBe(29);
  });
  it('tells the story the rules tell: the 4 ft earthen skirt stops nobody, 30 ft (geodesic, glass) and 60 ft (arcology) beat both a plain and a learned crew', () => {
    expect(skirtFacts('geodesic').plain).toBeGreaterThanOrEqual(0.99);
    expect(skirtFacts('geodesic').learned).toBeGreaterThanOrEqual(0.99);
    expect(skirtFacts('glass').learned).toBeGreaterThanOrEqual(0.99);
    expect(skirtFacts('arcology').learned).toBeGreaterThanOrEqual(0.99);
    expect(skirtFacts('earthen').plain).toBe(0);
  });
  it('renders both views as svg with the headline numbers and no metric units', () => {
    const a = renderToStaticMarkup(<SkirtSection />), b = renderToStaticMarkup(<SkirtPlan />);
    for (const svg of [a, b]) { expect(svg.startsWith('<svg')).toBe(true); expect(svg).toMatch(/60 ft/); expect(svg).not.toMatch(/\d\s?(km|cm|meters?|metres?)\b/); }
    expect(a).toMatch(/14 \+ 3 = 17 ft/);
  });
});
