import { describe, expect, it } from 'vitest';
import { applyDust, dustStorm } from './dustStorm';
import { NO_LOOK } from '../../../sim/collapseLook';

const base = { region: 'desert_southwest', season: 'summer', wind: 0.9, rain: 0, storm: 0, snow: 0, cloud: 0.2, hour: 15 };
describe('dust storm', () => {
  it('rises in a windy dry desert summer and not in a green region', () => {
    expect(dustStorm(base).dust).toBeGreaterThan(0.8);
    expect(dustStorm({ ...base, region: 'new_england' }).dust).toBe(0);
  });
  it('rain and snow settle it; calm air leaves heat haze instead', () => {
    expect(dustStorm({ ...base, rain: 0.8 }).dust).toBe(0);
    const calm = dustStorm({ ...base, wind: 0.2, cloud: 0 });
    expect(calm.dust).toBe(0); expect(calm.heat).toBeGreaterThan(0.5);
    expect(dustStorm({ ...base, wind: 0.2, hour: 3 }).heat).toBe(0);
  });
  it('browns the look, and leaves it alone when there is nothing', () => {
    const l = applyDust(NO_LOOK, dustStorm(base));
    expect(l.ash).toBeGreaterThan(0.5); expect(l.ashColor[0]).toBeGreaterThan(l.ashColor[2]); expect(l.dim).toBeLessThan(1); expect(l.skyAmt).toBeGreaterThan(0.5);
    expect(applyDust(NO_LOOK, { dust: 0, heat: 0 })).toBe(NO_LOOK);
  });
});
