import { describe, expect, it } from 'vitest';
import { CAP, carryOverhead, flowFrom } from './flow';

const at = (kind: string, x: number, z = 0) => ({ kind, x, z });
describe('flow', () => {
  it('a compact yard costs nothing', () => {
    const f = flowFrom([at('timber_cabin', 0), at('well_hand', 12), at('root_cellar', 8), at('garden', 15)]);
    expect(f.water).toBe(0); expect(f.kitchen).toBe(0);
  });
  it('grows with distance and caps', () => {
    expect(carryOverhead(40)).toBeCloseTo(0.01);
    expect(carryOverhead(70)).toBeCloseTo(0.03);
    expect(carryOverhead(1000)).toBe(CAP);
    expect(flowFrom([at('timber_cabin', 0), at('well_hand', 70)]).water).toBeCloseTo(0.03);
  });
  it('uses the nearest home and target, averages the kitchen legs, ignores unbuilt targets', () => {
    const f = flowFrom([at('timber_cabin', 0), at('cottage', 400), at('well_hand', 390), at('root_cellar', 70), at('garden', 5)]);
    expect(f.water).toBe(0);
    expect(f.kitchen).toBeCloseTo(0.015);
    expect(f.wood).toBeUndefined();
  });
  it('no home, no flow; deterministic', () => {
    expect(flowFrom([at('well_hand', 99)])).toEqual({});
    const a = [at('timber_cabin', 0), at('well_hand', 50)];
    expect(flowFrom(a)).toEqual(flowFrom(a));
  });
});
