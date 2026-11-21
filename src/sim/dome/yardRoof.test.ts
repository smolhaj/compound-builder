import { describe, expect, it } from 'vitest';
import { ROOF_SLIDE, ROOF_STATES, effectiveRoof, roofHazard, roofRefusal, type RoofCtx } from './yardRoof';

const calm: RoofCtx = { lockdown: false, dirt: 0, hazard: false, serviceLocked: true };

describe('the plant yard roof interlocks', () => {
  it('defaults closed and opens only when everything is calm', () => {
    expect(effectiveRoof(undefined, calm)).toBe('closed');
    expect(effectiveRoof('vent', calm)).toBe('vent');
    expect(effectiveRoof('open', calm)).toBe('open');
    expect(roofRefusal(calm)).toBeNull();
  });
  it('is forced shut in lockdown, in fallout, ash or smoke, in a hazard, and with the service airlock unlocked', () => {
    for (const bad of [{ lockdown: true }, { dirt: 0.7 }, { hazard: true }, { serviceLocked: false }]) {
      const ctx = { ...calm, ...bad };
      expect(roofRefusal(ctx)).not.toBeNull();
      for (const w of ['vent', 'open'] as const) expect(effectiveRoof(w, ctx)).toBe('closed');
      expect(effectiveRoof('closed', ctx)).toBe('closed');
    }
  });
  it('names the hazards that shut it', () => {
    for (const k of ['dam_flood', 'ice_age', 'runaway_heat', 'mega_quake']) expect(roofHazard(k), k).toBe(true);
    for (const k of ['pandemic', 'financial', null, undefined]) expect(roofHazard(k as string | null | undefined)).toBe(false);
  });
  it('slides further as it opens, and never overlaps itself when closed', () => {
    expect(ROOF_SLIDE.closed).toBe(0);
    expect(ROOF_SLIDE.vent).toBeGreaterThan(0);
    expect(ROOF_SLIDE.open).toBeGreaterThan(ROOF_SLIDE.vent);
    expect(ROOF_STATES).toEqual(['closed', 'vent', 'open']);
  });
});
