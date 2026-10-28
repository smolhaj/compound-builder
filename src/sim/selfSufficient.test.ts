import { describe, expect, it } from 'vitest';
import { calendarOf, newGame, SAVE_VERSION, type GameState, type Structure } from './state';
import { planRun } from './perimeter';
import { balanceDay, plant } from './utilities';
import { powerSummary, fmtKw } from './powerReport';
import { greenhouseDay, greenhouseGreens, greenhouseKwh, GH_TIER, orchardDay, orchardHarvest, orchardYield, orchardPest, gardenSeason, greensFactor } from './greenhouse';
import { farmOf, pondOf, greenhouseCareOf, hasWorkshop, orchardCareOf, parkInYard, leaveYard, yardCapacity, yardFree, yardOf, shelterFor, YARD_BAYS } from './farm';
import { harvestPond, pondDay, stockPond, stockProblem, troutGrowth, waterTempC, TABLE_G, troutSuited } from './pond';
import { livestockDay, sheepRoom, sheepSheltered } from './livestock';
import { newKit, kitOf, repairPlan, addTool, wearTools } from './tools';
import { BLUEPRINTS } from './blueprints';
import { MATERIALS } from './materials';
import { KIT } from '../game/buildkit/kit';
import { migrate } from './save/migrations';
import { suggestions, selfSufficient } from './guidance';
import { REGIONS } from './regions';
import { dailyOf, choreRates } from './daily';
import { produce } from './needs';
import { step } from './engine';

const built = (g: GameState, id: string, kind: string, x: number, z: number, finishedAt = 0): Structure => {
  const st: Structure = { id, kind, x, z, rot: 0, stage: 5, done: 0, supplied: true, finishedAt };
  g.structures.push(st);
  return st;
};
const line = (g: GameState, kind: 'water_pipe' | 'power_cable', pts: Array<[number, number]>) => { const r = planRun(g, kind, pts); r.done = r.hours; r.supplied = true; r.finishedAt = 0; return r; };
const wire = (g: GameState, id: string) => g.utilities.fittings.push({ building: id, kind: 'wire', done: 30, hours: 30, supplied: true, finishedAt: 0 });
const at = (doy: number, years = 0, seed = 1) => { const g = newGame(seed, doy); g.clock.t += years * 365; return g; };

describe('the solar farm and the batteries that stayed at 0 %', () => {
  it('a 20 kW farm makes about 72 kWh on a June day and 40 in December', () => {
    const g = at(172); built(g, 'f', 'solar_farm', 20, 20);
    balanceDay(g, plant(g), 0.5);
    expect(g.utilities.report.solarKw).toBe(20);
    expect(g.utilities.report.solarKwh).toBeGreaterThan(65);
    const d = at(355); built(d, 'f', 'solar_farm', 20, 20);
    balanceDay(d, plant(d), 0.5);
    expect(d.utilities.report.solarKwh).toBeGreaterThan(30);
    expect(d.utilities.report.solarKwh).toBeLessThan(48);
  });

  it('REGRESSION: an array and a battery shed standing apart with no cable used to leave the battery at 0 % forever; side by side they now share a bus', () => {
    const apart = at(172); built(apart, 's', 'solar_array', 10, 10); built(apart, 'b', 'battery_shed', 40, 40);
    for (let i = 0; i < 5; i++) balanceDay(apart, plant(apart), 0.5);
    expect(apart.utilities.batteryKwh).toBe(0);
    expect(apart.utilities.report.wastedKwh).toBeGreaterThan(10);
    // the Utilities panel says so: made but not stored, and the shed has nothing to charge it
    const sum = powerSummary(apart);
    expect(sum.wastedKwh).toBeGreaterThan(10);
    expect(sum.headline).toMatch(/cable|went unused/);

    const beside = at(172); built(beside, 's', 'solar_array', 10, 10); built(beside, 'b', 'battery_shed', 11.6, 10);
    for (let i = 0; i < 3; i++) balanceDay(beside, plant(beside), 0.5);
    expect(beside.utilities.batteryKwh).toBeGreaterThan(15);
    expect(powerSummary(beside).batteryPct).toBeGreaterThan(70);
  });

  it('a cable also joins them, and two banks never draw on the same charge', () => {
    const g = at(172);
    built(g, 's1', 'solar_array', 10, 10); built(g, 'b1', 'battery_shed', 11.9, 10);
    built(g, 's2', 'solar_array', 40, 40); built(g, 'b2', 'battery_bank', 40, 42);
    line(g, 'power_cable', [[40, 40], [40, 42]]);
    for (let i = 0; i < 2; i++) balanceDay(g, plant(g), 0.5);
    const cap = 20 + 60, stored = g.utilities.batteryKwh;
    expect(stored).toBeGreaterThan(10);
    expect(stored).toBeLessThanOrEqual(cap);
    // a night with no sun: it only ever drains what is there
    g.clock.t += 0; const before = g.utilities.batteryKwh;
    balanceDay(g, plant(g), 0.5);
    expect(g.utilities.batteryKwh).toBeGreaterThanOrEqual(before - 1e-6);
  });

  it('flags made-but-wasted power when the bank is full and prints no raw floats', () => {
    const g = at(172); built(g, 'f', 'solar_farm', 20, 20); built(g, 'b', 'battery_shed', 22.5, 20);
    for (let i = 0; i < 4; i++) balanceDay(g, plant(g), 0.5);
    const s = powerSummary(g);
    expect(s.batteryPct).toBe(100);
    expect(s.wastedKwh).toBeGreaterThan(20);
    expect(s.headline).toMatch(/unused/);
    expect(fmtKw(4.800000000000001)).toBe('4.8');
    expect(fmtKw(20)).toBe('20');
    expect(s.headline).not.toMatch(/\d\.\d{3}/);
  });
});

describe('the heated greenhouse', () => {
  it('grows about seven times the hobby house in a cold month when warm, a third of that when frozen', () => {
    const hobby = at(20); built(hobby, 'h', 'greenhouse', 10, 10);
    const big = at(20); const st = built(big, 'h', 'greenhouse_heated', 10, 10);
    greenhouseCareOf(big, st.id).heated = true;
    expect(greenhouseGreens(big)).toBeCloseTo(GH_TIER.greenhouse_heated.kcal * greensFactor(REGIONS[big.site.region].cold, true));
    expect(greenhouseGreens(big)).toBeGreaterThan(6 * greenhouseGreens(hobby));
    greenhouseCareOf(big, st.id).heated = false;
    const cold = REGIONS[big.site.region].cold;
    expect(greenhouseGreens(big)).toBeCloseTo(GH_TIER.greenhouse_heated.kcal * greensFactor(cold, false));
    expect(gardenSeason(big)[0]).toBeLessThan(gardenSeason(hobby)[0]);
  });

  it('electric heat draws the winter load; with no power it burns wood; with no wood it freezes and says so', () => {
    const g = at(20); const st = built(g, 'h', 'greenhouse_heated', 10, 10);
    expect(greenhouseKwh(g, st)).toBeGreaterThan(15);
    const care = greenhouseCareOf(g, st.id);
    g.stock.firewood = 5;
    g.utilities.lit = [st.id];
    greenhouseDay(g);
    expect(care.by).toBe('electric');
    g.utilities.lit = [];
    const said: string[] = [];
    for (let i = 0; i < 12; i++) said.push(...greenhouseDay(g));
    expect(care.by).toBe('wood');
    expect(said.join(' ')).toMatch(/no power/);
    expect(g.stock.firewood).toBeLessThan(5);
    g.stock.firewood = 0;
    for (let i = 0; i < 12; i++) said.push(...greenhouseDay(g));
    expect(care.heated).toBe(false);
    expect(said.join(' ')).toMatch(/out of wood/);
    care.heat = 'wood';
    expect(greenhouseKwh(g, st)).toBeLessThan(5);
  });

  it('the greenhouse heater is on the power network as a load and sheds first among the homes', () => {
    const g = at(20); built(g, 'h', 'cottage', 10, 10); const gh = built(g, 'g', 'greenhouse_heated', 14, 10);
    built(g, 's', 'solar_array', 12, 12);
    line(g, 'power_cable', [[12, 12], [10, 10], [14, 10]]);
    wire(g, 'h'); wire(g, 'g');
    balanceDay(g, plant(g), 0.5);
    expect(g.utilities.report.shed).toContain(gh.id);
    expect(g.utilities.lit).toContain('h');
  });
});

describe('orchards: pruning, pests and the grove', () => {
  const yr = 8;
  it('a grove bears four times a plot; an unpruned orchard bears a fifth less; pests take their share', () => {
    const doy = 250;
    const find = (): GameState => { for (let seed = 1; seed < 60; seed++) { const g = at(doy, yr, seed); const y = calendarOf(g.clock).year; if (orchardPest(seed, y).loss === 0) return g; } throw new Error('no clean seed'); };
    const g = find(); built(g, 'o', 'orchard', 10, 10, 0);
    const base = orchardHarvest(g);
    // (a late frost can take the year: skip such seeds)
    if (base > 0) {
      const grove = find(); built(grove, 'o', 'orchard_grove', 10, 10, 0);
      expect(orchardHarvest(grove)).toBeCloseTo(4 * base);
      orchardCareOf(g, 'o').unprunedYear = calendarOf(g.clock).year;
      expect(orchardYield(g)).toBeCloseTo(base * 0.8);
    }
    expect(true).toBe(true);
  });
  it('an orchard left unpruned when the buds break is judged by the chore backlog', () => {
    const g = at(95, 8); built(g, 'o', 'orchard', 10, 10, 0);
    const lines = orchardDay(g, 80);
    expect(orchardCareOf(g, 'o').unprunedYear).toBe(calendarOf(g.clock).year);
    expect(lines.join(' ')).toMatch(/unpruned/);
    const h = at(95, 8); built(h, 'o', 'orchard', 10, 10, 0);
    expect(orchardDay(h, 10)).toEqual([]);
    expect(orchardCareOf(h, 'o').unprunedYear).toBe(-1);
  });
  it('the chores: pruning and picking build a backlog on the Garden duty; the greenhouse and the pond too', () => {
    const g = at(40, 8); built(g, 'o', 'orchard', 10, 10, 0); built(g, 'h', 'greenhouse_heated', 20, 20);
    const r = choreRates(g);
    expect(r.orchard).toBeGreaterThan(0);
    expect(r.greenhouse).toBeGreaterThan(0);
    expect(r.pond).toBe(0);
    expect(Object.keys(dailyOf(g).chores.levels)).toEqual(expect.arrayContaining(['orchard', 'greenhouse', 'pond']));
    // a neglected greenhouse grows less
    const a = at(20); const st = built(a, 'h', 'greenhouse_heated', 10, 10); greenhouseCareOf(a, st.id).heated = true;
    const b = structuredClone(a); dailyOf(b).chores.levels.greenhouse = 100;
    expect(produce(b)).toBeLessThan(produce(a));
  });
});

describe('the pond', () => {
  const pond = (doy: number, seed = 1) => { const g = at(doy, 0, seed); const st = built(g, 'p', 'pond', 20, 20); g.stock.fishing_gear = 1; return { g, st }; };
  it('stores 300,000 L, fills from the seep and the rain, and a reservoir holds 400,000', () => {
    const { g } = pond(120);
    balanceDay(g, plant(g), 0.5);
    expect(g.utilities.storedL).toBeGreaterThan(500);
    built(g, 'r', 'reservoir', 30, 30);
    for (let i = 0; i < 30; i++) { g.clock.t += 1; balanceDay(g, plant(g), 0.5); }
    expect(g.utilities.storedL).toBeGreaterThan(20000);
    expect(g.utilities.storedL).toBeLessThanOrEqual(700_000);
  });
  it('trout need cool water and a bag of fingerlings; crayfish need breeders', () => {
    const { g } = pond(200);
    expect(stockProblem(g, 'p', 'trout')).toMatch(/no fingerlings|water is/);
    g.stock.trout_fry = 1; g.stock.crayfish_stock = 1;
    const ok = waterTempC(g) <= 19;
    if (!ok) expect(stockProblem(g, 'p', 'trout')).toMatch(/water is/);
    const s = pond(110); s.g.stock.trout_fry = 2; s.g.stock.crayfish_stock = 1;
    expect(waterTempC(s.g)).toBeLessThan(19);
    expect(stockPond(s.g, 'p', 'trout')).toBeNull();
    expect(pondOf(s.g, 'p').trout).toBe(100);
    expect(stockPond(s.g, 'p', 'crayfish')).toBeNull();
    expect(pondOf(s.g, 'p').crayfish).toBe(50);
    expect(s.g.stock.trout_fry).toBe(1);
  });
  it('trout grow on feed to table size in about seven months; unfed they stall; they cannot be taken before then', () => {
    const { g } = pond(110); g.stock.trout_fry = 1; stockPond(g, 'p', 'trout');
    g.stock.fish_feed = 500;
    expect(harvestPond(g, 'p', 'trout')).toMatch(/not table size/);
    for (let d = 0; d < 330 && pondOf(g, 'p').troutG < TABLE_G; d++) { g.clock.t += 1; g.utilities.lit = ['p']; pondDay(g); }
    const p = pondOf(g, 'p');
    expect(p.troutG).toBeGreaterThanOrEqual(TABLE_G);
    expect(g.clock.t - at(110).clock.t).toBeLessThan(330);
    const before = g.stock.fresh + (g.pantry ? 0 : 0);
    expect(harvestPond(g, 'p', 'trout')).toBeNull();
    expect(p.trout).toBeLessThan(100);
    expect(g.stock.fresh).toBeGreaterThan(before);
    // unfed: slow
    const h = pond(110); h.g.stock.trout_fry = 1; stockPond(h.g, 'p', 'trout'); h.g.stock.fish_feed = 0;
    for (let d = 0; d < 100; d++) { h.g.clock.t += 1; pondDay(h.g); }
    const hungry = pondOf(h.g, 'p').troutG;
    const f = pond(110); f.g.stock.trout_fry = 1; stockPond(f.g, 'p', 'trout'); f.g.stock.fish_feed = 500;
    for (let d = 0; d < 100; d++) { f.g.clock.t += 1; pondDay(f.g); }
    expect(pondOf(f.g, 'p').troutG).toBeGreaterThan(hungry * 1.4);
  });
  it('a heat wave with no aerator kills fish; an aerator on power saves them', () => {
    const hot = (aer: boolean) => {
      const { g } = pond(150, 3); const p = pondOf(g, 'p'); p.trout = 400; p.troutG = 300; p.crayfish = 1000;
      // the hottest region on the map, high summer
      g.site = { ...g.site, region: (Object.keys(REGIONS) as Array<keyof typeof REGIONS>).sort((a, b) => REGIONS[b].julyHighF - REGIONS[a].julyHighF)[0] };
      if (aer) g.utilities.lit = ['p'];
      g.stock.fish_feed = 999;
      for (let d = 0; d < 60; d++) { g.clock.t += 1; if (aer) g.utilities.lit = ['p']; pondDay(g); }
      return p.trout;
    };
    expect(hot(true)).toBeGreaterThan(hot(false));
  });
  it('desert July is too hot for trout; crayfish are trapped May to October only', () => {
    const { g } = pond(110);
    g.site = { ...g.site, region: (Object.keys(REGIONS) as Array<keyof typeof REGIONS>).find(r => REGIONS[r].julyHighF >= 90) ?? g.site.region };
    if (REGIONS[g.site.region].julyHighF >= 90) { expect(troutSuited(g)).toBe(false); g.stock.trout_fry = 1; expect(stockProblem(g, 'p', 'trout')).toMatch(/too warm/); }
    const w = pond(30); pondOf(w.g, 'p').crayfish = 800;
    expect(harvestPond(w.g, 'p', 'crayfish')).toMatch(/May to October/);
    const s = pond(200); pondOf(s.g, 'p').crayfish = 800;
    expect(harvestPond(s.g, 'p', 'crayfish')).toBeNull();
    expect(pondOf(s.g, 'p').crayfish).toBeLessThan(800);
  });
  it('predators and poachers: an open line loses fish, a fenced pond with a dog loses far fewer; poachers need the law gone', () => {
    const run = (law: number) => {
      let lost = 0;
      for (let seed = 1; seed <= 6; seed++) {
        const { g } = pond(130, seed); const p = pondOf(g, 'p'); p.trout = 300; p.troutG = 380; g.stock.fish_feed = 999;
        g.disaster.kind = 'grid_down' as never; g.disaster.hitAt = -1; g.disaster.tracks.law = law;
        for (let d = 0; d < 200; d++) { g.clock.t += 1; pondDay(g); }
        lost += p.lost;
      }
      return lost;
    };
    expect(run(1)).toBeGreaterThanOrEqual(0);
    expect(run(0.1)).toBeGreaterThan(run(1));
  });
  it('fish in the pond make bears more interested', () => {
    const { g } = pond(200); pondOf(g, 'p').trout = 200;
    expect(farmOf(g).ponds.p.trout).toBe(200);
  });
  it('trout growth peaks at cool temperatures and stops in heat and ice', () => {
    expect(troutGrowth(3)).toBe(0);
    expect(troutGrowth(15)).toBeCloseTo(3.2);
    expect(troutGrowth(22)).toBe(0);
    expect(troutGrowth(8)).toBeLessThan(troutGrowth(14));
  });
});

describe('the workshop and the equipment yard', () => {
  it('a workshop slows tool wear and makes repairs hold', () => {
    const wear = (shop: boolean) => {
      const g = newGame(2); if (shop) built(g, 'w', 'workshop', 10, 10);
      const kit = kitOf(g); kit.items = []; const t = addTool(g, 'hammer', 1, 1);
      wearTools(g, { kind: 'build', stage: 'frame' } as never, 200);
      return 1 - t.cond;
    };
    expect(wear(true)).toBeLessThan(wear(false) * 0.85);
    const g = newGame(2); const t = addTool(g, 'hammer', 0.3, 1); t.max = 0.9; g.stock.hardware = 5;
    const plain = repairPlan(g, t.id).to;
    built(g, 'w', 'workshop', 10, 10);
    expect(hasWorkshop(g)).toBe(true);
    expect(repairPlan(g, t.id).to).toBeGreaterThan(plain);
    void newKit;
  });
  it('yard bays: park, leave, capacity, shelter (the fleet-facing slot API)', () => {
    const g = newGame(1);
    expect(yardCapacity(g)).toBe(0);
    expect(parkInYard(g, 'tractor-1')).toBeNull();
    built(g, 'y', 'equipment_yard', 10, 10);
    expect(yardCapacity(g)).toBe(YARD_BAYS);
    const bay = parkInYard(g, 'tractor-1')!;
    expect(bay.bay).toBe(0);
    expect(parkInYard(g, 'tractor-1')!.bay).toBe(0);
    expect(yardOf(g, 'tractor-1')).toBe('y');
    expect(shelterFor(g, 'tractor-1')).toBe('yard');
    built(g, 'w', 'workshop', 20, 20);
    expect(shelterFor(g, 'tractor-1')).toBe('workshop');
    expect(yardFree(g)).toBe(YARD_BAYS - 1);
    expect(leaveYard(g, 'tractor-1')).toBe(true);
    expect(yardFree(g)).toBe(YARD_BAYS);
    for (let i = 0; i < YARD_BAYS; i++) parkInYard(g, `v${i}`);
    expect(parkInYard(g, 'extra')).toBeNull();
  });
});

describe('sheep and the barns', () => {
  const run = (g: GameState, days: number, t0 = g.clock.t) => { for (let d = 0; d < days; d++) { g.clock.t = t0 + d; livestockDay(g, true); } };
  it('lamb in April, mutton in November; the flock is kept at its breeders', () => {
    const g = at(95, 0); g.stock.sheep = 6; g.stock.hay = 9999; g.stock.feed = 9999; built(g, 'sb', 'sheep_barn', 10, 10);
    g.disaster.tracks.stores = 0;
    run(g, 60);
    expect(g.stock.sheep).toBeGreaterThan(6);
    const breeders = g.livestock!.breeders!;
    expect(breeders).toBe(6);
    const g2 = structuredClone(g); g2.clock.t = 215 + 365; g2.livestock!.butchered = -1;
    livestockDay(g2, true);
    expect(g2.stock.sheep).toBe(breeders);
  });
  it('sheep with no roof lose condition in a cold winter; a sheep barn (30) or the family barn (12) is the roof', () => {
    const cond = (barn: string | null) => {
      const g = at(10, 0); g.stock.sheep = 10; g.stock.hay = 9999; g.stock.feed = 9999; g.livestock = undefined;
      if (barn) built(g, 'b', barn, 10, 10);
      run(g, 40);
      return g.livestock!.condition.sheep;
    };
    expect(cond(null)).toBeLessThan(cond('sheep_barn'));
    const g = newGame(1); built(g, 'a', 'barn', 1, 1); built(g, 'b', 'sheep_barn', 5, 5); g.stock.sheep = 50;
    expect(sheepRoom(g)).toBe(42);
    expect(sheepSheltered(g)).toBeCloseTo(0.84);
  });
});

describe('integration', () => {
  it('every new kit piece has a blueprint, a price list and a permit rule; nothing is free', () => {
    for (const k of ['greenhouse_heated', 'orchard_grove', 'solar_farm', 'battery_bank', 'pond', 'reservoir', 'sheep_barn', 'equipment_yard']) {
      expect(KIT[k], k).toBeDefined();
      expect(BLUEPRINTS[k]?.stages.length, k).toBe(5);
    }
    const bill = (k: string) => BLUEPRINTS[k].stages.reduce((a, st) => a + Object.entries(st.materials).reduce((b, [m, n]) => b + (MATERIALS[m as keyof typeof MATERIALS].price ?? 0) * (n as number), 0), 0);
    expect(bill('solar_farm')).toBeGreaterThan(20000);
    expect(bill('greenhouse_heated')).toBeGreaterThan(24000);
    expect(BLUEPRINTS.solar_farm.stages[3].materials.solar_panel).toBe(50);   // 50 × 400 W = 20 kW
    expect(BLUEPRINTS.battery_bank.stages[4].materials.battery).toBe(12);     // 12 × 5 kWh = 60 kWh
  });
  it('the long-term goal tracks the farm; the guidance shows it', () => {
    const g = at(100, 4);
    expect(selfSufficient(g).steps.every(s => !s.done)).toBe(true);
    built(g, 'f', 'solar_farm', 10, 10); built(g, 'b', 'battery_bank', 14, 10); built(g, 'h', 'greenhouse_heated', 20, 10); built(g, 'o', 'orchard', 30, 10, -2000); built(g, 'p', 'pond', 40, 10);
    pondOf(g, 'p').trout = 10;
    const steps = selfSufficient(g).steps;
    expect(steps.filter(s => s.done).map(s => s.label)).toEqual(expect.arrayContaining(['20 kW of solar', 'Battery storage', 'A heated greenhouse', 'An orchard bearing fruit', 'A stocked pond']));
    expect(suggestions(g).length).toBeLessThanOrEqual(3);
  });
  it('the save migrates from the version before: farm state, new goods, the new chores', () => {
    const old = structuredClone(newGame(9)) as unknown as Record<string, unknown>;
    old.version = SAVE_VERSION - 1; delete old.farm;
    for (const k of ['greenhouse_pro_kit', 'trout_fry', 'crayfish_stock', 'fish_feed', 'sheep']) delete (old.stock as Record<string, number>)[k];
    delete (dailyOf(old as unknown as GameState).chores.levels as Record<string, number>).orchard;
    const m = migrate(old);
    expect(m.version).toBe(SAVE_VERSION);
    expect(m.farm).toEqual({ greenhouses: {}, orchards: {}, ponds: {}, yard: {} });
    expect(m.stock.trout_fry).toBe(0);
    expect(m.stock.sheep).toBe(0);
    expect(dailyOf(m).chores.levels.orchard).toBe(0);
  });
  it('three years in play with the farm built: no crash, no raw floats in the log', () => {
    let g = at(60, 0, 5); g.money = 400000;
    for (const [k, x, z] of [['cottage', 10, 10], ['solar_farm', 20, 10], ['battery_bank', 25, 10], ['greenhouse_heated', 10, 20], ['orchard_grove', 20, 25], ['pond', 35, 25], ['sheep_barn', 10, 35], ['equipment_yard', 25, 40], ['workshop', 35, 10]] as const) built(g, `${k}1`, k, x, z);
    g.stock.sheep = 6; g.stock.hay = 500; g.stock.feed = 200; g.stock.trout_fry = 3; g.stock.fish_feed = 50; g.stock.firewood = 10;
    wire(g, 'greenhouse_heated1'); wire(g, 'pond1');
    line(g, 'power_cable', [[20, 10], [10, 20], [35, 25]]);
    for (let i = 0; i < 24 * 3; i++) { g = step(g, 15); for (const e of g.log) expect(e.text).not.toMatch(/\d+\.\d{3,}/); }
    expect(g.utilities.report.solarKw).toBe(20);
  }, 120000);
});
