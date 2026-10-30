import { describe, expect, it } from 'vitest';
import { newGame, type GameState, type Structure } from './state';
import { BLUEPRINTS, HOME_BEDS, homeBeds, isHome, totalBill, totalHours } from './blueprints';
import { MATERIALS, billCost, type MaterialId } from './materials';
import { REGIONS, type RegionId } from './regions';
import { blueprintOf, burnStructure, isFinished, planStructure } from './construction';
import {
  HOUSING_STYLES, STYLE_KINDS, cellarHouses, coverFactor, emberFactor, fitOf, hasBasement, heatFactor, keepsWalls, stampStyle, styledBlueprint, styleFacts, styleOff, stylePF,
} from './housingStyles';
import { demandNow } from './heating';
import { cellarCapacity, CELLAR_KCAL } from './storage';
import { bestShelter } from './nuclear';
import { hasCoolStore } from './pantry';
import { SAVE_VERSION } from './state';
import { KIT, placementProblem, type SiteQuery } from '../game/buildkit/kit';
import { UTILITY, DRAW_KWH, NODE_R, ROOF_M2, LOAD_PRIORITY } from './utilities';
import { PERMIT_FEE } from './paperwork';
import { PANTRY_ROOM } from './storage';

const cost = (bp = BLUEPRINTS.cottage) => Object.entries(totalBill(bp)).reduce((a, [m, q]) => a + (MATERIALS[m as MaterialId].price ?? 0) * (q as number), 0);
const finish = (s: GameState, kind: string, x = 10, z = 10): Structure => {
  const st: Structure = { id: `t${s.nextId++}`, kind, x, z, rot: 0, stage: BLUEPRINTS[kind].stages.length, done: 0, supplied: true, finishedAt: 0 };
  s.structures.push(st);
  return st;
};
const at = (region: RegionId, timber = 1): GameState => {
  const s = newGame(7);
  s.site = { ...s.site, region, timber, lot: null };
  return s;
};

describe('housing styles: the tables line up', () => {
  it('every style is a home with a blueprint, a kit piece and the per-kind tables', () => {
    for (const k of STYLE_KINDS) {
      expect(isHome(k)).toBe(true);
      expect(BLUEPRINTS[k].stages.map(x => x.id)).toEqual(['site', 'foundation', 'frame', 'roof', 'finish']);
      expect(KIT[k].category).toBe('home');
      expect(KIT[k].sleeps).toBe(HOUSING_STYLES[k].beds);
      expect(HOME_BEDS[k]).toBe(HOUSING_STYLES[k].beds);
      expect(DRAW_KWH[k]).toBeGreaterThan(0);
      expect(NODE_R[k]).toBeGreaterThan(0);
      expect(ROOF_M2[k]).toBeGreaterThan(0);
      expect(LOAD_PRIORITY[k]).toBe(2);
      expect(PERMIT_FEE[k]).toBe(HOUSING_STYLES[k].permit);
      expect(PANTRY_ROOM[k]).toBe(HOUSING_STYLES[k].pantry);
    }
  });
  it('adds no saved state: no save bump, old structures read as the plain bill', () => {
    expect(SAVE_VERSION).toBeGreaterThanOrEqual(69);
    const st: Structure = { id: 'a', kind: 'stone_house', x: 0, z: 0, rot: 0, stage: 0, done: 0, supplied: false, finishedAt: null };
    expect(blueprintOf(st)).toBe(BLUEPRINTS.stone_house);
  });
  it('the solar lodge is a bank: 25 panels, 10 kW', () => {
    expect(UTILITY.lodge_solar.solarKw).toBe(10);
    expect(totalBill(BLUEPRINTS.lodge_solar).solar_panel).toBe(25);
    expect(totalBill(BLUEPRINTS.lodge).solar_panel).toBeUndefined();
  });
});

describe('housing styles: price and hours from the one materials table', () => {
  it('real 2025 numbers: the lodge is the dear one, the container house the quick one', () => {
    const c = (k: string) => cost(BLUEPRINTS[k]);
    expect(c('lodge')).toBeGreaterThan(180_000);
    expect(c('lodge')).toBeLessThan(260_000);
    expect(c('stone_house')).toBeGreaterThan(80_000);
    expect(c('stone_house')).toBeLessThan(140_000);
    expect(c('timber_frame')).toBeGreaterThan(80_000);
    expect(c('timber_frame')).toBeLessThan(140_000);
    expect(c('container_house')).toBeGreaterThan(45_000);
    expect(c('container_house')).toBeLessThan(85_000);
    expect(c('adobe_house')).toBeGreaterThan(40_000);
    expect(c('adobe_house')).toBeLessThan(75_000);
    expect(c('lodge_solar') - c('lodge')).toBeGreaterThan(25 * 260);
    expect(totalHours(BLUEPRINTS.lodge)).toBeGreaterThan(6000);
    expect(totalHours(BLUEPRINTS.container_house)).toBeLessThan(totalHours(BLUEPRINTS.stone_house) / 2);
    expect(totalHours(BLUEPRINTS.stone_house)).toBeGreaterThan(totalHours(BLUEPRINTS.timber_frame));
    expect(totalHours(BLUEPRINTS.stone_house)).toBeGreaterThan(totalHours(BLUEPRINTS.log_house));
  });
  it('the lodge needs saw logs from your own woods; the adobe house rams the earth it digs', () => {
    expect(totalBill(BLUEPRINTS.lodge).logs).toBe(90);
    expect(MATERIALS.logs.price).toBeNull();
    const dig = BLUEPRINTS.adobe_house.stages.find(x => x.id === 'foundation')!, ram = BLUEPRINTS.adobe_house.stages.find(x => x.id === 'frame')!;
    expect(dig.yields?.spoil).toBeGreaterThanOrEqual(ram.materials.spoil!);
    expect(MATERIALS.spoil.price).toBeNull();
  });
  it('the lodge is the biggest roof over the most beds', () => {
    expect(HOME_BEDS.lodge).toBeGreaterThan(HOME_BEDS.log_house);
    const s = newGame(7), before = homeBeds(s);
    finish(s, 'lodge');
    expect(homeBeds(s)).toBe(before + 10);
  });
});

describe('housing styles: where the materials are (region-tied)', () => {
  it('adobe only in dry country: free in the desert, extra cement at 650 mm, off in the wet', () => {
    expect(fitOf(at('desert').site, 'adobe_house')).toMatchObject({ off: null, mat: 'local' });
    expect(fitOf(at('mountain_west').site, 'adobe_house').off).toBeNull();
    expect(fitOf(at('plains').site, 'adobe_house')).toMatchObject({ off: null, mat: 'wet' });
    expect(fitOf(at('pnw').site, 'adobe_house').off).toMatch(/dry country/);
    expect(styleOff(at('appalachia').site, 'adobe_house')).toMatch(/rain/);
  });
  it('wet-country adobe costs more cement and more hours than desert adobe', () => {
    const wet = styledBlueprint(BLUEPRINTS.adobe_house, 'wet');
    expect(totalBill(wet).concrete!).toBeGreaterThan(totalBill(BLUEPRINTS.adobe_house).concrete!);
    expect(totalHours(wet)).toBeGreaterThan(totalHours(BLUEPRINTS.adobe_house));
    expect(styledBlueprint(BLUEPRINTS.adobe_house, 'local')).toBe(BLUEPRINTS.adobe_house);
  });
  it('stone is cheaper where there is rock and dearer where it is hauled in', () => {
    expect(fitOf(at('mountain_west').site, 'stone_house').mat).toBe('local');
    expect(fitOf(at('plains').site, 'stone_house').mat).toBe('hauled');
    const local = cost(styledBlueprint(BLUEPRINTS.stone_house, 'local')), plain = cost(BLUEPRINTS.stone_house), hauled = cost(styledBlueprint(BLUEPRINTS.stone_house, 'hauled'));
    expect(local).toBeLessThan(plain);
    expect(hauled).toBeGreaterThan(plain);
    expect(totalHours(styledBlueprint(BLUEPRINTS.stone_house, 'local'))).toBeGreaterThan(totalHours(BLUEPRINTS.stone_house));
  });
  it('the lodge needs timber on the land; timber frame mills your own where the woods are heavy', () => {
    expect(styleOff(at('plains', 0.2).site, 'lodge')).toMatch(/timber/);
    expect(styleOff(at('pnw', 1.4).site, 'lodge')).toBeNull();
    expect(fitOf(at('pnw', 1.4).site, 'timber_frame').mat).toBe('local');
    expect(fitOf(at('plains', 0.2).site, 'timber_frame').mat).toBeNull();
  });
  it('staking stamps the material on the structure so the bill stays what the plan said', () => {
    const s = at('plains');
    const st = planStructure(s, 'stone_house', 5, 5, 0);
    expect(st.mat).toBe('hauled');
    expect(blueprintOf(st)).not.toBe(BLUEPRINTS.stone_house);
    expect(totalBill(blueprintOf(st)).fieldstone!).toBeGreaterThan(totalBill(BLUEPRINTS.stone_house).fieldstone!);
    const cab = planStructure(s, 'timber_cabin', 9, 9, 0);
    expect(cab.mat).toBeUndefined();
    const t: Structure = { id: 'x', kind: 'adobe_house', x: 0, z: 0, rot: 0, stage: 0, done: 0, supplied: false, finishedAt: null };
    stampStyle(at('desert'), t);
    expect(t.mat).toBe('local');
    stampStyle(at('plains'), t);
    expect(t.mat).toBe('wet');
    expect(billCost(totalBill(blueprintOf(t)))).toBeGreaterThan(billCost(totalBill(BLUEPRINTS.adobe_house)));
  });
  it('every region is answered for every style', () => {
    for (const r of Object.keys(REGIONS) as RegionId[]) for (const k of STYLE_KINDS) {
      const f = fitOf(at(r).site, k);
      expect(typeof f.note).toBe('string');
      expect(f.note.length).toBeGreaterThan(5);
    }
  });
});

describe('housing styles: heating, fire, cover and fallout through the systems that exist', () => {
  it('the stove burns by the main home: a timber frame sips, a lodge guzzles, a cabin is the baseline', () => {
    const base = at('mountain_west');
    base.clock.t = 15; // mid-January
    const cabin = demandNow(base);
    expect(heatFactor(base)).toBe(1);
    const mk = (kind: string) => { const s = at('mountain_west'); s.clock.t = 15; finish(s, kind); return demandNow(s); };
    finish(base, 'timber_cabin');
    expect(demandNow(base)).toBeCloseTo(cabin, 6);
    expect(mk('timber_frame')).toBeLessThan(cabin * 0.8);
    expect(mk('stone_house')).toBeLessThan(cabin);
    expect(mk('lodge')).toBeGreaterThan(cabin * 1.2);
    expect(mk('container_house')).toBeGreaterThan(cabin);
  });
  it('the biggest home sets the load, and a house under construction does not count', () => {
    const s = at('mountain_west');
    finish(s, 'timber_frame');
    const small = heatFactor(s);
    finish(s, 'lodge');
    expect(heatFactor(s)).toBeGreaterThan(small);
    const t = at('mountain_west');
    const wip = finish(t, 'lodge'); wip.finishedAt = null; wip.stage = 2;
    expect(heatFactor(t)).toBe(1);
  });
  it('adobe suits a mild desert winter better than a hard one', () => {
    const adobe = HOUSING_STYLES.adobe_house;
    expect(adobe.heat(REGIONS.desert.cold)).toBeLessThan(adobe.heat(REGIONS.north_woods.cold));
    expect(adobe.heat(REGIONS.desert.cold)).toBeLessThan(0.7);
  });
  it('wildfire: stone, earth and steel shed embers and keep their walls; wood burns to the ground', () => {
    expect(emberFactor('stone_house')).toBeLessThan(0.4);
    expect(emberFactor('adobe_house')).toBeLessThan(0.4);
    expect(emberFactor('container_house')).toBeLessThan(0.4);
    expect(emberFactor('timber_cabin')).toBe(1);
    expect(emberFactor('log_house')).toBe(1);
    expect(emberFactor('lodge')).toBeLessThan(1);
    const s = at('desert');
    const stone = finish(s, 'stone_house'), cabin = finish(s, 'timber_cabin', 30, 30);
    expect(keepsWalls('stone_house')).toBe(true);
    expect(burnStructure(s, stone)).toBe(true);
    expect(stone.stage).toBe(3);                    // the walls stand; the roof and the finish have to be redone
    expect(stone.roofLost).toBe(true);
    expect(isFinished(stone)).toBe(false);
    expect(burnStructure(s, cabin)).toBe(true);
    expect(cabin.stage).toBe(0);
  });
  it('a raid: thick earth and stone give the most cover, thin timber frame the least', () => {
    const c = (k: string) => coverFactor(k);
    expect(c('timber_cabin')).toBe(1);
    expect(c('stone_house')).toBeLessThan(c('log_house'));
    expect(c('adobe_house')).toBeLessThan(c('container_house'));
    expect(c('container_house')).toBeLessThan(c('timber_cabin'));
    expect(c('timber_frame')).toBeGreaterThan(c('timber_cabin'));
    expect(c('lodge')).toBeLessThan(1);
  });
  it('fallout: a lodge basement is a real shelter, a container is not', () => {
    const s = newGame(7);
    const base = bestShelter(s)[0];
    finish(s, 'container_house');
    expect(bestShelter(s)[0]).toBe(Math.max(base, stylePF('container_house')));
    finish(s, 'lodge');
    const [pf, what] = bestShelter(s);
    expect(pf).toBe(stylePF('lodge'));
    expect(pf).toBeGreaterThan(stylePF('stone_house'));
    expect(what).toMatch(/lodge basement/);
  });
});

describe('the lodge basement is a cellar', () => {
  it('only the lodge has one; it adds bin room beside the root cellar and is a cool store', () => {
    expect(hasBasement('lodge')).toBe(true);
    expect(hasBasement('lodge_solar')).toBe(true);
    for (const k of ['stone_house', 'timber_frame', 'container_house', 'adobe_house', 'log_house', 'timber_cabin']) expect(hasBasement(k)).toBe(false);
    const s = newGame(7);
    expect(cellarCapacity(s)).toBe(0);
    expect(hasCoolStore(s)).toBe(false);
    finish(s, 'lodge');
    expect(cellarHouses(s)).toHaveLength(1);
    expect(cellarCapacity(s)).toBe(1_500_000);
    expect(hasCoolStore(s)).toBe(true);
    finish(s, 'root_cellar', 30, 30);
    expect(cellarCapacity(s)).toBe(CELLAR_KCAL + 1_500_000);
  });
  it('an unfinished lodge has no cellar yet', () => {
    const s = newGame(7);
    const st = finish(s, 'lodge'); st.finishedAt = null; st.stage = 1;
    expect(cellarCapacity(s)).toBe(0);
  });
});

describe('the lodge stands on a slope with its back downhill', () => {
  const slope = (fall: number, dir: 'z' | 'x' = 'z'): SiteQuery => ({
    height: (x, z) => (dir === 'z' ? -fall * z : -fall * x), owned: () => true, water: () => false,
  });
  const here = (rot: number, fall: number, dir: 'z' | 'x' = 'z') => placementProblem(KIT.lodge, 20, 20, rot, slope(fall, dir), []);
  it('a level site is refused with a reason, a slope that falls toward the back is fine', () => {
    expect(here(0, 0)).toBe('needs_slope');
    // ground falls toward -z (it is higher at +z): the back (local -z) is downhill
    expect(here(0, -0.15)).toBeNull();
    // falls toward +z: the lodge faces the wrong way until it is turned half way round
    expect(here(0, 0.15)).toBe('needs_slope');
    expect(here(2, 0.15)).toBeNull();
  });
  it('turned a quarter, the same hill works the other way round on the x axis', () => {
    const q = [0, 1, 2, 3].filter(r => here(r, 0.15, 'x') === null);
    expect(q).toHaveLength(1);
  });
  it('too steep a hill is still too steep', () => {
    expect(here(0, -0.6)).toBe('too_steep');
  });
  it('the other styles do not mind a level lot', () => {
    for (const k of ['stone_house', 'timber_frame', 'container_house', 'adobe_house']) expect(placementProblem(KIT[k], 20, 20, 0, slope(0), [])).toBeNull();
  });
  it('a floor hatch goes inside the lodge body, not on its deck', () => {
    expect(KIT.lodge.walkoutFall).toBeGreaterThan(0);
    expect(KIT.lodge.floorY).toBeCloseTo(0.5);
  });
});

describe('the card facts', () => {
  it('say what the style does in plain words', () => {
    expect(styleFacts('timber_frame').join(' ')).toMatch(/less wood/);
    expect(styleFacts('lodge').join(' ')).toMatch(/more wood/);
    expect(styleFacts('stone_house').join(' ')).toMatch(/stop rifle/);
    expect(styleFacts('lodge').join(' ')).toMatch(/cellar/);
    expect(styleFacts('log_house')).toEqual([]);
  });
});
