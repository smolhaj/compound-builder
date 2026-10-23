import { describe, expect, it } from 'vitest';
import { CROPS, CROP_SLOTS, cropColor, cropSlotsFor, REGION_CROPS, type Rgb } from './cropCalendar';

const green = (c: Rgb) => c[1] > c[0] + 0.05 && c[1] > c[2] + 0.1;
const tan = (c: Rgb) => c[0] > 0.42 && c[0] >= c[1] - 0.02;
const white = (c: Rgb) => Math.min(...c) > 0.6;

describe('cropCalendar', () => {
  it('every region fills the shader slots with cumulative shares ending at 1', () => {
    for (const kind of Object.keys(REGION_CROPS) as Array<keyof typeof REGION_CROPS>) {
      const s = cropSlotsFor(kind, 200);
      expect(s.colors).toHaveLength(CROP_SLOTS);
      expect(s.cum).toHaveLength(CROP_SLOTS);
      expect(s.cum[CROP_SLOTS - 1]).toBe(1);
      for (let i = 1; i < CROP_SLOTS; i++) expect(s.cum[i]).toBeGreaterThanOrEqual(s.cum[i - 1]);
    }
  });

  it('corn belt: green canopy in July, dry tan at harvest, black soil at planting', () => {
    expect(green(cropColor(CROPS.corn, 205))).toBe(true);
    expect(tan(cropColor(CROPS.corn, 280))).toBe(true);
    const plant = cropColor(CROPS.corn, 122);
    expect(Math.max(...plant)).toBeLessThan(0.25);
    expect(green(cropColor(CROPS.soy, 215))).toBe(true);
    // soybeans turn yellow before the corn is dry
    const soySep = cropColor(CROPS.soy, 256);
    expect(soySep[0]).toBeGreaterThan(0.45);
  });

  it('regional signatures: cotton white in early October, grass seed gold in July and green in January', () => {
    expect(white(cropColor(CROPS.cotton, 280))).toBe(true);
    expect(tan(cropColor(CROPS.grassSeed, 185))).toBe(true);
    expect(green(cropColor(CROPS.grassSeed, 15))).toBe(true);
    expect(green(cropColor(CROPS.alfalfa, 190))).toBe(true);
    expect(tan(cropColor(CROPS.rangePasture, 230))).toBe(true);
  });

  it('wraps smoothly round the new year', () => {
    for (const keys of Object.values(CROPS)) {
      const a = cropColor(keys, 365), b = cropColor(keys, 1);
      for (let i = 0; i < 3; i++) expect(Math.abs(a[i] - b[i])).toBeLessThan(0.05);
    }
  });
});
