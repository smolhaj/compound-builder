import { describe, expect, it } from 'vitest';
import {
  CLIMATES, SeasonController, climateFor, dayOfYear, isSeasonMode, overrideDay,
  seasonState, seasonTargets, visualSeasonForDay,
} from './seasonState';

const at = (loc: string, month: number, day: number) => seasonTargets(climateFor(loc), dayOfYear(month, day));

/** UE term calendar (Summer Jul 1–, Fall Sep 1–, Spring Jan 1–) → day of year, for the ported cases. */
const termDoy = (term: 'summer' | 'fall' | 'spring', day: number): number =>
  ({ summer: dayOfYear(7, 1), fall: dayOfYear(9, 1), spring: 1 })[term] + day - 1;

describe('seasonState calendar', () => {
  it('labels days of the year by visual season', () => {
    expect(visualSeasonForDay(dayOfYear(1, 20))).toBe('winter');
    expect(visualSeasonForDay(dayOfYear(4, 25))).toBe('spring');
    expect(visualSeasonForDay(dayOfYear(10, 15))).toBe('fall');
  });

  it('validates season modes', () => {
    expect(isSeasonMode('winter')).toBe(true);
    expect(isSeasonMode('auto')).toBe(true);
    expect(isSeasonMode('monsoon')).toBe(false);
  });

  it('unknown locations fall back to the Midwest climate', () => {
    expect(climateFor('atlantis').id).toBe('midwest_plains');
    expect(climateFor(null).id).toBe('midwest_plains');
  });
});

describe('regional seasons', () => {
  it('New England: blazing peak in mid-October, bare and snowy in January, frozen ponds', () => {
    const oct = at('new_england', 10, 17);
    expect(oct.fall).toBeGreaterThan(0.9);
    expect(oct.bare).toBeLessThan(0.15);
    expect(oct.snow).toBe(0);
    const jan = at('new_england', 1, 20);
    expect(jan.bare).toBeGreaterThan(0.95);
    expect(jan.snow).toBeGreaterThan(0.85);
    expect(jan.ice).toBeGreaterThan(0.9);
    expect(jan.cold).toBeGreaterThan(0.9);
    expect(CLIMATES.new_england.blaze).toBe(1);
  });

  it('spring: snow gone, trees leafing out with blossom in late April', () => {
    const apr = at('new_england', 4, 26);
    expect(apr.snow).toBe(0);
    expect(apr.fresh).toBeGreaterThan(0.9);
    expect(apr.bloom).toBeGreaterThan(0.5);
    expect(apr.bare).toBeLessThan(0.2);
  });

  it('Deep South and SoCal never get snow; winter lawns go dormant', () => {
    for (const loc of ['deep_south', 'southern_california']) {
      const jan = at(loc, 1, 20);
      expect(jan.snow).toBe(0);
      expect(jan.ice).toBe(0);
      expect(jan.dormant).toBeGreaterThan(0.5);
      expect(climateFor(loc).weatherSnow).toBe(0);
    }
    expect(at('deep_south', 1, 20).bare).toBeLessThanOrEqual(CLIMATES.deep_south.bareMax);
    expect(CLIMATES.deep_south.blaze).toBeLessThan(0.5);
    expect(CLIMATES.southern_california.blaze).toBeLessThan(0.2);
  });

  it('Mountain West aspens go gold; Mountain West and SoCal grass dries in late summer', () => {
    const [r, o, y, b] = CLIMATES.mountain_west.palette;
    expect(y).toBeGreaterThan(r + o + b);
    expect(at('mountain_west', 8, 20).dry).toBeGreaterThan(0.6);
    expect(at('southern_california', 8, 20).dry).toBeGreaterThan(0.7);
    expect(at('new_england', 8, 20).dry).toBe(0);
  });

  it('Pacific Northwest: wet, dull winters with only passing snow', () => {
    const jan = at('pacific_northwest', 1, 20);
    expect(jan.snow).toBe(0);
    expect(jan.wet).toBeGreaterThan(0.4);
    expect(CLIMATES.pacific_northwest.weatherSnow).toBeGreaterThan(0);
    expect(CLIMATES.pacific_northwest.weatherSnow).toBeLessThan(1);
  });

  it('the forced fall season lands on each region\'s peak', () => {
    for (const c of Object.values(CLIMATES)) {
      const p = seasonTargets(c, overrideDay('fall', c));
      expect(p.fall).toBeGreaterThan(0.95);
      expect(p.bare).toBeLessThan(0.1);
    }
  });

  it('leaf litter peaks after the colour and is buried by snow', () => {
    expect(at('new_england', 11, 5).litter).toBeGreaterThan(at('new_england', 10, 1).litter);
    expect(at('new_england', 1, 20).litter).toBeLessThan(0.05);
  });
});

describe('SeasonController', () => {
  const frame = (o: Partial<Parameters<SeasonController['update']>[0]> = {}) => ({
    locationId: 'new_england', doy: termDoy('fall', 45), totalDays: 1000, mode: 'auto' as const, dt: 1 / 60, ...o,
  });

  it('snaps on the first frame, then eases over a few game days', () => {
    const c = new SeasonController();
    const p = c.update(frame());
    const oct = at('new_england', 10, 15);
    expect(p.fall).toBeCloseTo(oct.fall, 5);
    // Spring term → Summer term (Apr 30 → Jul 1): the target flips, the drawn state eases
    c.update(frame({ doy: termDoy('spring', 120), totalDays: 1200 })); // big jump → snap
    const before = c.params.bloom;
    expect(before).toBeGreaterThan(0.5);
    c.update(frame({ doy: termDoy('summer', 1), totalDays: 1201 }));
    expect(c.params.bloom).toBeLessThan(before);
    expect(c.params.bloom).toBeGreaterThan(0.2);
    for (let d = 1; d <= 12; d++) c.update(frame({ doy: termDoy('summer', 1) + d, totalDays: 1201 + d }));
    expect(c.params.bloom).toBeLessThan(0.02);
  });

  it('does not move while paused (no game days pass)', () => {
    const c = new SeasonController();
    c.update(frame({ doy: termDoy('summer', 60), totalDays: 500 }));
    const v = c.params.fall;
    for (let i = 0; i < 100; i++) c.update(frame({ doy: termDoy('summer', 60), totalDays: 500 }));
    expect(c.params.fall).toBe(v);
  });

  it('a Settings override converges in real time, even at a few frames per second', () => {
    const c = new SeasonController();
    c.update(frame({ doy: termDoy('summer', 20), totalDays: 300 }));
    for (let i = 0; i < 50; i++) c.update(frame({ doy: termDoy('summer', 20), totalDays: 300, mode: 'winter', dt: 0.1 }));
    expect(c.params.snow).toBeGreaterThan(0.85);
    expect(c.params.bare).toBeGreaterThan(0.9);
    expect(seasonState.visual).toBe('winter');
  });

  it('Auto follows the calendar through years of fast play and after a load (no lag of a term)', () => {
    const c = new SeasonController();
    const terms = [['spring', 120], ['summer', 60], ['fall', 120]] as const;
    let total = 0;
    const checks: string[] = [];
    for (let year = 0; year < 4; year++) {
      for (const [season, len] of terms) {
        // 5× speed on a slow machine: several game days per frame
        for (let day = 1; day <= len; day += 3) {
          total += 3;
          const p = c.update(frame({ doy: termDoy(season, day), totalDays: total, dt: 0.5 }));
          if (season === 'spring' && day === 19) { if (!(p.snow > 0.8 && p.bare > 0.85)) checks.push(`late Jan y${year} snow ${p.snow.toFixed(2)} bare ${p.bare.toFixed(2)}`); }
          if (season === 'summer' && day === 31) { if (!(p.snow < 0.02 && p.bare < 0.05)) checks.push(`Aug y${year} snow ${p.snow.toFixed(2)} bare ${p.bare.toFixed(2)}`); }
          if (season === 'fall' && day === 43) { if (!(p.fall > 0.5 && p.snow < 0.05)) checks.push(`mid Oct y${year} fall ${p.fall.toFixed(2)} snow ${p.snow.toFixed(2)}`); }
        }
      }
    }
    expect(checks).toEqual([]);
    // Loading a save: its day count jumps (back, or > 40 days on), which snaps to the save's date
    const p = c.update(frame({ doy: termDoy('summer', 30), totalDays: 5 }));
    expect(p.snow).toBe(0);
    expect(p.bare).toBeLessThan(0.05);
    expect(seasonState.visual).toBe('summer');
  });

  it('a location change snaps to the new climate', () => {
    const c = new SeasonController();
    c.update(frame({ locationId: 'new_england', doy: termDoy('spring', 20), totalDays: 700 }));
    expect(c.params.snow).toBeGreaterThan(0.8);
    c.update(frame({ locationId: 'deep_south', doy: termDoy('spring', 20), totalDays: 701 }));
    expect(c.params.snow).toBe(0);
    expect(seasonState.climate.id).toBe('deep_south');
  });
});

describe('shore plants (willows, reeds) follow the trees', () => {
  it('stay summer-green on 1 September and turn with the trees in October', () => {
    for (const id of Object.keys(CLIMATES)) {
      const c = new SeasonController();
      c.update({ locationId: id, doy: termDoy('fall', 1), totalDays: 2000, mode: 'auto', dt: 1 / 60 });
      expect(seasonState.visual, id).toBe('fall');
      expect(seasonState.plants, id).toBe('summer');
    }
    const c = new SeasonController();
    c.update({ locationId: 'new_england', doy: termDoy('fall', 45), totalDays: 3000, mode: 'auto', dt: 1 / 60 });
    expect(seasonState.plants).toBe('fall');
  });
});

describe('no lying snow from May to October (QA: snow reported on 1 September)', () => {
  it('every climate has zero ground snow and no frozen ponds May 1 – Oct 31', () => {
    for (const id of Object.keys(CLIMATES)) {
      const c = climateFor(id);
      for (let d = dayOfYear(5, 1); d <= dayOfYear(10, 31); d++) {
        const p = seasonTargets(c, d);
        expect(p.snow, `${id} day ${d}`).toBe(0);
        expect(p.ice, `${id} day ${d}`).toBe(0);
      }
    }
  });

  it('in Auto, the fall term start (Sept 1) is snow-free everywhere, even right after a winter override', () => {
    for (const id of Object.keys(CLIMATES)) {
      const c = new SeasonController();
      c.update({ locationId: id, doy: termDoy('fall', 1), totalDays: 900, mode: 'winter', dt: 1 / 60 });
      for (let i = 0; i < 60; i++) c.update({ locationId: id, doy: termDoy('fall', 1), totalDays: 900, mode: 'auto', dt: 0.1 });
      expect(c.params.snow, id).toBeLessThan(0.01);
    }
  });
});
