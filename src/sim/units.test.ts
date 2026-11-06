import { describe, expect, it } from 'vitest';
import * as U from './units';

describe('units', () => {
  it('lengths pick inches, feet or miles', () => {
    expect(U.lengthText(0.15)).toBe('6 in');
    expect(U.lengthText(2.4)).toBe('7.9 ft');
    expect(U.lengthText(60)).toBe('197 ft');
    expect(U.lengthText(828)).toBe('2,717 ft');
    expect(U.lengthText(2190)).toBe('1.4 mi');
    expect(U.feetText(0.3048)).toBe('1 ft');
    expect(U.footprintText(6, 9)).toBe('20 × 30 ft');
    expect(U.kmText(0.05)).toBe('164 ft');
    expect(U.kmText(8)).toBe('5 mi');
  });
  it('area and volume', () => {
    expect(U.sqftText(20)).toBe('215 sq ft');
    expect(U.areaText(100)).toBe('1,076 sq ft');
    expect(U.areaText(161874)).toBe('40 acres');
    expect(U.acresText(1)).toBe('1 acre');
    expect(U.gallonsText(0)).toBe('0 gal');
    expect(U.gallonsText(19)).toBe('5 gal');
    expect(U.gallonsText(10000)).toBe('2,640 gal');
    expect(U.gallonsText(400000)).toBe('106,000 gal');
    expect(U.cuYdText(10)).toBe('13 cu yd');
  });
  it('mass', () => {
    expect(U.poundsText(0.2)).toBe('7 oz');
    expect(U.poundsText(25)).toBe('55 lb');
    expect(U.poundsText(135)).toBe('298 lb');
    expect(U.poundsText(3000)).toBe('3.3 tons');
    expect(U.gramsText(450)).toBe('1 lb');
    expect(U.gramsText(100)).toBe('3.5 oz');
  });
  it('temperature, speed, rain, food', () => {
    expect(U.tempText(0)).toBe('32°F');
    expect(U.tempText(26)).toBe('79°F');
    expect(U.tempDeltaText(5)).toBe('9°F');
    expect(U.mphText(5)).toBe('11 mph');
    expect(U.rainText(1000)).toBe('39 in');
    expect(U.caloriesText(2000)).toBe('2,000 Calories');
    expect(U.caloriesShort(82000)).toBe('82k Calories');
    expect(U.gpmText(20)).toBe('5.3 gpm');
    expect(U.psiText(100)).toBe('15 psi');
  });
  it('per 100 ft cost', () => {
    expect(Math.round(U.perHundredFeet(1000))).toBe(305);
  });
});
