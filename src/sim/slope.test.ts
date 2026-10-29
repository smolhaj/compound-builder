import { describe, expect, it } from 'vitest';
import { lotPriceFactor, makeLotSite, siteLot } from './lotListing';
import { altitudeClimate, regionFor, REF_ALT_M } from './climate';
import { gradeAt, gradeBucket, gradedBlueprint, gradeNote, powerFactor, responseFactor, roadClosedFor, roadDifficulty, roadFactor, winterRoadLine } from './slope';
import { CLASSIC, type Site } from './site';
import { REGIONS, seasons } from './regions';
import { newGame } from './state';
import { planStructure, blueprintOf } from './construction';
import { BLUEPRINTS, totalBill, totalHours } from './blueprints';
import { driveQuote, powerQuote } from './improvements';
import { weatherDelay } from './upkeep';
import { suggestions, plansNeed } from './guidance';
import { responseMinutes } from './breakins';
import { mulberry32 } from './rng';
import { fleetOf } from './vehicles';

const lot = (kind: Parameters<typeof makeLotSite>[0]['kind'], over: Partial<Parameters<typeof makeLotSite>[0]> = {}): Site => makeLotSite({ kind, ...over });
/** The first seed whose lot meets a test on its stats. */
function find(kind: Parameters<typeof makeLotSite>[0]['kind'], over: Partial<Parameters<typeof makeLotSite>[0]>, ok: (s: Site) => boolean): Site {
  for (let seed = 1; seed < 80; seed++) { const s = lot(kind, { ...over, seed }); if (ok(s)) return s; }
  throw new Error(`no ${kind} lot found`);
}
const stats = (s: Site) => siteLot(s)!.stats;
const steep = () => find('hillside', { relief: 11, elevM: 2500 }, s => stats(s).accessMaxPct > 18);
const easy = () => find('bench', { relief: 6, elevM: 1500 }, s => stats(s).accessMaxPct < 6);

describe('slope-driven costs', () => {
  it('a place with no lot is untouched', () => {
    expect(roadFactor(CLASSIC)).toMatchObject({ lenMul: 1, perFtMul: 1, switchbacks: false });
    expect(powerFactor(CLASSIC)).toBe(1);
    expect(gradeAt(CLASSIC, 30, 30)).toBe(0);
    expect(regionFor(CLASSIC)).toBe(REGIONS.mountain_west);
    expect(roadDifficulty(CLASSIC)).toBe(0);
    expect(driveQuote(CLASSIC.improvements, CLASSIC)).toEqual(driveQuote(CLASSIC.improvements));
  });

  it('a steep road switchbacks: longer, dearer, and the driveway quote follows', () => {
    const st = steep(), f = roadFactor(st), flat = easy(), ff = roadFactor(flat);
    expect(f.switchbacks).toBe(true);
    expect(f.lenMul).toBeGreaterThan(1.8);
    expect(f.perFtMul).toBeGreaterThanOrEqual(1.5);
    expect(ff.lenMul).toBe(1);
    expect(f.text).toMatch(/switchback/);
    // the quote is the planned road (sim/roadPlan.ts): the steep lot's switchbacked, benched, walled road against the flat lot's straight drive
    const imp = { ...st.improvements, driveFt: 800 }, qs = driveQuote(imp, st), qf = driveQuote(imp, flat);
    expect(qs.plan && qf.plan).toBeTruthy();
    expect(qs.usd).toBeGreaterThan(driveQuote(imp).usd * 2.5);
    expect(qs.usd).toBeGreaterThan(qf.usd * 2);
    expect(qf.usd).toBeLessThan(driveQuote(imp).usd * 2);
    expect(qs.days).toBeGreaterThan(driveQuote(imp).days);
    expect(qs.plan!.lengthM).toBeGreaterThan(qf.plan!.lengthM * 1.5);
  });

  it('poles cost more over rough ground, never more than about 2.3 times', () => {
    for (let seed = 1; seed < 20; seed++) for (const k of ['ridge', 'hillside', 'gorge', 'mesa'] as const) {
      const f = powerFactor(lot(k, { seed, relief: k === "gorge" ? 30 : 8, outlier: k === "gorge" }));
      expect(f).toBeGreaterThanOrEqual(1);
      expect(f).toBeLessThan(2.7);
    }
    const imp = { ...steep().improvements, poleFt: 1000 };
    expect(powerQuote(imp, steep()).usd).toBeGreaterThan(powerQuote(imp).usd * 1.4);
  });

  it('grade buckets and the graded blueprint: more time on the pad, more stone behind it', () => {
    expect([0, 0.05, 0.08, 0.15, 0.25, 0.4].map(gradeBucket)).toEqual([0, 0, 1, 2, 3, 4]);
    const bp = BLUEPRINTS.timber_cabin, prev = { hours: totalHours(bp), stone: totalBill(bp).fieldstone ?? 0 };
    let last = prev;
    for (const g of [0.08, 0.15, 0.25, 0.4]) {
      const gb = gradedBlueprint(bp, g), now = { hours: totalHours(gb), stone: totalBill(gb).fieldstone ?? 0 };
      expect(now.hours).toBeGreaterThan(last.hours);
      expect(now.stone).toBeGreaterThan(last.stone);
      last = now;
    }
    expect(gradedBlueprint(bp, 0.02)).toBe(bp);
    const bunker = { kind: 'bunker_dorm', stages: bp.stages };
    expect(gradedBlueprint(bunker, 0.3)).toBe(bunker);
  });

  it('a building staked on a slope is graded; on level ground it is not; the plans count the stone; the guidance says wall', () => {
    const site = find('hillside', { relief: 10 }, s => stats(s).padFrac > 0.06);
    let p: [number, number] | null = null;
    for (let x = site.home.x0 + 2; x < site.home.x1 - 2 && !p; x += 1) for (let z = site.home.z0 + 2; z < site.home.z1 - 2; z += 1) if (gradeAt(site, x, z) < 0.04) { p = [x, z]; break; }
    expect(p).not.toBeNull();
    // find a steep spot and a level one
    let hill: [number, number] | null = null;
    for (let x = site.home.x0 + 4; x < site.home.x1 - 4 && !hill; x += 2) for (let z = site.home.z0 + 4; z < site.home.z1 - 4; z += 2) if (gradeAt(site, x, z) > 0.14 && gradeAt(site, x, z) < 0.3) { hill = [x, z]; break; }
    expect(hill).not.toBeNull();
    const g = newGame(3, 105, 2027, { site });
    const level = planStructure(g, 'timber_cabin', p![0], p![1], 0);
    expect(level.grade).toBeUndefined();
    const up = planStructure(g, 'timber_cabin', hill![0], hill![1], 0);
    expect(up.grade).toBeGreaterThan(0.14);
    expect(gradeBucket(up.grade!)).toBeGreaterThanOrEqual(2);
    expect(totalHours(blueprintOf(up))).toBeGreaterThan(totalHours(blueprintOf(level)));
    expect((totalBill(blueprintOf(up)).fieldstone ?? 0)).toBeGreaterThan(totalBill(blueprintOf(level)).fieldstone ?? 0);
    expect(gradeNote(site, hill![0], hill![1])).toMatch(/retaining wall/);
    expect(plansNeed(g).fieldstone ?? 0).toBeGreaterThanOrEqual(totalBill(blueprintOf(up)).fieldstone ?? 0);
    const card = suggestions(g).find(x => x.id === 'retaining');
    expect(card?.title).toBe('This slope needs a retaining wall');
    expect(card?.why).toMatch(/pallets of fieldstone/);
    // the classic place never grades
    const c = newGame(3);
    expect(planStructure(c, 'timber_cabin', 30, 30, 0).grade).toBeUndefined();
  });
});

describe('the butte', () => {
  it('has no ramp: a cut zigzag, priced down', () => {
    const butte = lot('mesa', { relief: 36, outlier: true, seed: 3 });
    expect(roadFactor(butte).text).toMatch(/butte with no ramp/);
    expect(roadFactor(butte).lenMul).toBe(3.6);
    expect(lotPriceFactor(butte)).toBeLessThan(lotPriceFactor(lot('mesa', { relief: 6, seed: 3 })) * 0.6);
  });
});

describe('altitude climate', () => {
  it('at the region\'s own altitude on level ground nothing moves much; higher is colder with a shorter season and more snow', () => {
    const R = REGIONS.mountain_west;
    const lo = find('hillside', { elevM: REF_ALT_M.mountain_west! }, s => Math.abs(stats(s).standM) < 4 && stats(s).sun > 0.93 && stats(s).sun < 1.08);
    const a0 = altitudeClimate(lo)!;
    expect(a0.season).toBe(a0.seasonRegion);
    expect(regionFor(lo).cold).toBeCloseTo(R.cold, 1);
    const hi = { ...lo, lot: { ...lo.lot!, elevM: 2600 } };
    const a1 = altitudeClimate(hi)!, rf = regionFor(hi);
    expect(a1.dM).toBe(1000);
    expect(a1.season).toBeLessThan(a0.season - 45);
    expect(rf.cold).toBeGreaterThan(R.cold * 1.4);
    expect(rf.snowCm).toBeGreaterThan(R.snowCm * 1.3);
    expect(rf.janLowF).toBeLessThan(R.janLowF - 8);
    expect(rf.frost[0]).toBeGreaterThan(R.frost[0] + 20);
    expect(rf.frost[1]).toBeLessThan(R.frost[1] - 20);
    expect(a1.notes.join(' ')).toMatch(/Higher than the region/);
    // lower than the reference: milder
    const lower = regionFor({ ...lo, lot: { ...lo.lot!, elevM: 1200 } });
    expect(lower.cold).toBeLessThan(R.cold);
  });

  it('a frost pocket loses frost-free days, a south face gains them, and a short season is never under 40 days', () => {
    const pocket = find('saddle', { elevM: 1700 }, s => stats(s).standM <= -4), belt = find('ridge', { elevM: 1700 }, s => stats(s).standM >= 6);
    expect(altitudeClimate(pocket)!.notes.join(' ')).toMatch(/Cold air pools/);
    expect(altitudeClimate(belt)!.notes.join(' ')).toMatch(/thermal belt/);
    expect(altitudeClimate(belt)!.season).toBeGreaterThan(altitudeClimate(pocket)!.season);
    const high = { ...pocket, lot: { ...pocket.lot!, elevM: 2900 } };
    expect(altitudeClimate(high)!.season).toBeGreaterThanOrEqual(40);
    const lake = lot('island', { elevM: 1700 });
    expect(altitudeClimate(lake)!.notes.join(' ')).toMatch(/lake keeps/);
  });

  it('the crops, the stove and the pasture read the place\'s own frost dates and cold', async () => {
    const { sowWindow } = await import('./crops');
    const flat = newGame(3, 105, 2027, { site: { ...CLASSIC } }), high = newGame(3, 105, 2027, { site: { ...find('ridge', { elevM: 2800 }, () => true) } });
    const [a0] = sowWindow(flat), [a1] = sowWindow(high);
    expect(a1).toBeGreaterThan(a0);
    expect(seasons(regionFor(high.site)).harvest[0]).toBeLessThan(seasons(REGIONS.mountain_west).harvest[0]);
  });
});

describe('winter access', () => {
  const winterGame = (site: Site, plow = 0) => {
    const g = newGame(5, 330, 2027, { site });
    g.stock.plow = plow;
    return g;
  };
  const closedDays = (g: ReturnType<typeof winterGame>) => { let n = 0; for (let d = 0; d < 365; d++) if (roadClosedFor(g, d) > 0) n++; return n; };

  it('is open on every place with an easy road, and on the classic ground', () => {
    expect(closedDays(winterGame(CLASSIC))).toBe(0);
    expect(closedDays(winterGame(easy()))).toBe(0);
  });

  it('a steep, high road closes on heavy-snow days in the cold season only; a plow blade cuts it; a better truck helps; it is deterministic', () => {
    const site = steep(), g = winterGame(site), p = winterGame(site, 1);
    const n = closedDays(g);
    expect(roadDifficulty(site)).toBeGreaterThan(1);
    expect(n).toBeGreaterThan(5);
    expect(n).toBeLessThan(90);
    expect(closedDays(p)).toBeLessThan(n * 0.75);
    expect(closedDays(winterGame(site))).toBe(n);
    // no closures in high summer: start day 330 + day offsets 170..250 are summer
    for (let d = 170; d <= 250; d++) expect(roadClosedFor(g, d)).toBe(0);
    // a motorhome (0.85) gets up where a pickup (0.6) does not
    const m = winterGame(site);
    fleetOf(m).push({ id: 'v9', kind: 'motorhome', mileage: 1000, condition: 1, fuel: 100, oilAt: 0, serviceAt: 0 });
    expect(closedDays(m)).toBeLessThanOrEqual(n);
    expect(winterRoadLine(g)).toMatch(/closes about/);
    expect(winterRoadLine(p)).toMatch(/fewer with the plow|a truck gets up it in snow/);   // (a plowed switchback road is often open all winter)
  });

  it('holds up deliveries, slows the deputy, and says so', () => {
    const site = steep(), g = winterGame(site);
    let day = -1;
    for (let d = 0; d < 365; d++) if (roadClosedFor(g, d) > 0) { day = d; break; }
    expect(day).toBeGreaterThanOrEqual(0);
    g.clock.t = day + 0.2;
    expect(roadClosedFor(g)).toBeGreaterThan(0);
    const wd = weatherDelay(g, ['lumber']);
    expect(wd.days).toBeGreaterThan(0);
    expect(wd.why).toMatch(/drifted shut/);
    const r = mulberry32(1);
    const open = winterGame(site); open.clock.t = 0.2;
    expect(responseMinutes(g, mulberry32(1))).toBeGreaterThanOrEqual(responseMinutes(open, r));
    expect(responseFactor(g)).toBeGreaterThan(1.4);
    expect(g.stock.plow).toBe(0);
  });

  it('the plow card shows in the autumn on a place that needs it, and goes with the blade', () => {
    const site = steep();
    const settled = (st: Site) => {
      const g = newGame(5, 290, 2027, { site: st });
      g.stock.firewood = 30;
      for (const kind of ['timber_cabin', 'well_hand', 'garden', 'outhouse', 'solar_array', 'root_cellar']) g.structures.push({ id: `t-${kind}`, kind, x: 30, z: 30, rot: 0, stage: BLUEPRINTS[kind].stages.length, done: 0, supplied: false, finishedAt: 0 });
      return g;
    };
    const g = settled(site);
    expect(suggestions(g).some(x => x.id === 'plow')).toBe(true);
    g.stock.plow = 1;
    expect(suggestions(g).some(x => x.id === 'plow')).toBe(false);
    expect(suggestions(settled(easy())).some(x => x.id === 'plow')).toBe(false);
  });
});
