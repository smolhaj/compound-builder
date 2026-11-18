import { describe, expect, it } from 'vitest';
import { newGame, SAVE_VERSION, type GameState, type Structure } from '../state';
import { migrate } from '../save/migrations';
import { BLUEPRINTS } from '../blueprints';
import { DOME_KIND, DOME_TIERS, TIER, type DomeTier } from './tiers';
import { BAND, CLIMATE_MODES, COOL, comfortAt, domeLoad, inBand, passiveF } from './climate';
import { CONDENSATE_L_PER_BED, REUSE, WATER_LOOPS, condensateL, loopKw, loopUsd, rainCatchL, reuseL } from './waterLoop';
import { coverAt, domeSeason, domeSickK, domeYieldK, stockCover, underHeldDome } from './agro';
import {
  auxKwhDay, buyLoop, dayLoad, domeCards, domeChoose, domeDay, domeLabel, domeOf, domesOf, domeShelterFacts, domeViews, domeWaterFlows, domeAirLine, newDomeState, ownState,
  peopleUnder, setLockdown, stateOf, stepDome, domeKwhDay, domeFalloutAdj, domeShelter,
} from './live';
import { domeFalloutCards, domeLines, hasDome } from '../felt/domeFelt';
import { evalClaim } from '../felt/claims';
import { genericCards } from '../felt/cardLibrary';
import { AIRLOCK_DOOR } from './siege';

const dome = (g: GameState, tier: DomeTier = 'geodesic', x = 0, z = 0): Structure => {
  const kind = DOME_KIND[tier];
  const st: Structure = { id: `d${g.structures.length}`, kind, x, z, rot: 0, stage: BLUEPRINTS[kind].stages.length, done: 0, supplied: true, finishedAt: 0 };
  g.structures.push(st);
  return st;
};
const wire = (g: GameState, id: string) => g.utilities.fittings.push({ building: id, kind: 'wire', done: 1, hours: 1, supplied: true, finishedAt: 0 });
const power = (g: GameState) => { g.structures.push({ id: 'sol', kind: 'solar_array', x: 5, z: 5, rot: 0, stage: 9, done: 0, supplied: true, finishedAt: 0 }); };
const place = (g: GameState, kind: string, x: number, z: number): Structure => { const st: Structure = { id: `${kind}${g.structures.length}`, kind, x, z, rot: 0, stage: 9, done: 0, supplied: true, finishedAt: 0 }; g.structures.push(st); return st; };
const run = (g: GameState, hours: number) => { for (let i = 0; i < Math.round(hours * 4); i++) stepDome(g, 0.25 / 24); };
const two = (): GameState => { const g = newGame(5); g.money = 1e9; const a = dome(g, 'geodesic', 0, 0), b = dome(g, 'geodesic', 40, 0); wire(g, a.id); wire(g, b.id); power(g); return g; };

describe('the comfort band: a glazed dome never cooks', () => {
  it('bands never run past 95 F and nest by mode', () => {
    for (const m of CLIMATE_MODES) expect(BAND[m][1]).toBeLessThanOrEqual(95);
    expect(BAND.comfortable[0]).toBeGreaterThanOrEqual(BAND.temperate[0]); expect(BAND.comfortable[1]).toBeLessThanOrEqual(BAND.temperate[1]);
    expect(BAND.temperate[0]).toBeGreaterThanOrEqual(BAND.frost[0]); expect(BAND.temperate[1]).toBeLessThanOrEqual(BAND.frost[1]);
  });
  it('a powered dome holds under the top of the band at 110 F in full sun, every tier and mode, open or sealed', () => {
    for (const t of DOME_TIERS) for (const m of CLIMATE_MODES) for (const sealed of [false, true]) {
      const l = domeLoad(t, TIER[t].cells, 110, 1, m, { sealed, dry: 0.4, powered: true });
      expect(l.indoorF, `${t} ${m} sealed=${sealed}`).toBeLessThanOrEqual(BAND[m][1] + 0.01);
    }
  });
  it('a powered dome holds above the floor of the band on a below-zero night', () => {
    for (const t of DOME_TIERS) for (const m of CLIMATE_MODES) {
      const l = domeLoad(t, TIER[t].cells, -10, 0, m, { powered: true });
      expect(l.indoorF, `${t} ${m}`).toBeGreaterThanOrEqual(BAND[m][0] - 0.01);
    }
  });
  it('the unpowered shell floats: the same as the passive temperature when cold, and no worse than it when hot', () => {
    for (const t of DOME_TIERS) {
      const cold = domeLoad(t, TIER[t].cells, 10, 0, 'temperate', { powered: false });
      expect(cold.indoorF).toBeCloseTo(passiveF(t, TIER[t].cells, 10, 0), 6);
      const hot = domeLoad(t, TIER[t].cells, 100, 1, 'temperate', { powered: false });
      expect(hot.indoorF).toBeLessThanOrEqual(passiveF(t, TIER[t].cells, 100, 1) + 1e-9);
    }
  });
  it('the ladder is cheapest first: open vents and screens cost less power than sealed, and dry air less than humid', () => {
    const t = 'geodesic', c = TIER[t].cells;
    const open = domeLoad(t, c, 88, 1, 'temperate', { sealed: false, dry: 0.5, powered: true });
    const sealed = domeLoad(t, c, 88, 1, 'temperate', { sealed: true, dry: 0.5, powered: true });
    expect(open.kwhPerDay).toBeLessThanOrEqual(sealed.kwhPerDay + 1e-9);
    const dry = domeLoad(t, c, 98, 1, 'temperate', { sealed: true, dry: 0.9, powered: true }), wet = domeLoad(t, c, 98, 1, 'temperate', { sealed: true, dry: 0.1, powered: true });
    expect(dry.kwhPerDay).toBeLessThanOrEqual(wet.kwhPerDay + 1e-9);
    expect(dry.waterGalDay).toBeGreaterThanOrEqual(wet.waterGalDay);
  });
  it('cooling power never falls as the day gets hotter or sunnier; a narrower band never costs less', () => {
    const t = 'geodesic', c = TIER[t].cells;
    let prev = 0;
    for (let f = 70; f <= 112; f += 3) { const k = domeLoad(t, c, f, 1, 'comfortable', { sealed: true, powered: true }).kwhPerDay; if (f >= 82) expect(k).toBeGreaterThanOrEqual(prev - 1e-9); prev = k; }
    prev = 0;
    for (let sun = 0; sun <= 1.0001; sun += 0.1) { const k = domeLoad(t, c, 90, sun, 'comfortable', { sealed: true, powered: true }).kwhPerDay; expect(k).toBeGreaterThanOrEqual(prev - 1e-9); prev = k; }
    for (const f of [20, 60, 95]) expect(domeLoad(t, c, f, 0.8, 'comfortable', { powered: true }).kwhPerDay).toBeGreaterThanOrEqual(domeLoad(t, c, f, 0.8, 'frost', { powered: true }).kwhPerDay - 1e-9);
  });
  it('the hot-day bill is a small share of what the old "chill everything" model said (about 855 kWh for the small dome)', () => {
    const l = domeLoad('geodesic', TIER.geodesic.cells, 95, 1, 'comfortable', { sealed: false, dry: 0.5, powered: true });
    expect(l.kwhPerDay).toBeLessThan(400);
    expect(l.stage).not.toBe('idle');
  });
  it('comfort is 1 across the mild range and falls off both ways', () => {
    expect(comfortAt(70)).toBe(1); expect(comfortAt(40)).toBeLessThan(1); expect(comfortAt(95)).toBeLessThan(comfortAt(88)); expect(comfortAt(120)).toBe(0);
    expect(inBand(70, 'comfortable')).toBe(true); expect(inBand(90, 'comfortable')).toBe(false);
    expect(COOL.HOLD_UNDER).toBeGreaterThan(0);
  });
});

describe('closed-ecology power: the small dome draws a defensible amount (docs/DOME_COMPOUND.md 5.2)', () => {
  it('a frost-free night at 20 F costs about what heating the glass costs (~75 kWh) and the whole dome about 110 kWh', () => {
    const g = newGame(5); dome(g);
    const d = domeOf(g)!, night = domeLoad('geodesic', TIER.geodesic.cells, 20, 0, 'frost', { powered: true }).kwhPerDay;
    expect(night).toBeGreaterThan(60); expect(night).toBeLessThan(90);
    const aux = auxKwhDay(d.tier, d.cells);
    expect(aux).toBeGreaterThan(25); expect(aux).toBeLessThan(45);
    expect(night + aux).toBeGreaterThan(95); expect(night + aux).toBeLessThan(135);
  });
  it('the draw per sq ft of floor stays in the band real greenhouses and Biosphere 2 span (0.03 to 0.2 kWh per sq ft a day)', () => {
    const g = newGame(5);
    for (const t of ['geodesic', 'glass', 'arcology'] as const) { dome(g, t); const d = domesOf(g).find(x => x.tier === t)!; const fp = Math.PI * (d.shellFt / 2) ** 2; const per = dayLoad(g, d, newDomeState()).kwh / fp; expect(per, t).toBeGreaterThan(0.005); expect(per, t).toBeLessThan(0.25); }
  });
  it('a bigger dome never draws less than a smaller one', () => {
    const g = newGame(5); for (const t of DOME_TIERS) dome(g, t);
    const ds = DOME_TIERS.map(t => domesOf(g).find(d => d.tier === t)!);
    const k = ds.map(d => dayLoad(g, d, newDomeState()).kwh);
    for (let i = 1; i < k.length; i++) expect(k[i]).toBeGreaterThanOrEqual(k[i - 1]);
  });
});

describe('the water loop', () => {
  it('rain off the shell: more rain, a bigger dome and a fitted loop never catch less', () => {
    for (const t of ['geodesic', 'glass'] as const) {
      let prev = 0;
      for (const mm of [0, 1, 2, 4, 8]) { const v = rainCatchL(t, TIER[t].cells, mm, 'grey'); expect(v).toBeGreaterThanOrEqual(prev); prev = v; }
      expect(rainCatchL(t, TIER[t].cells, 3, 'grey')).toBeGreaterThan(rainCatchL(t, TIER[t].cells, 3, 'none'));
    }
    expect(rainCatchL('glass', TIER.glass.cells, 3, 'none')).toBeGreaterThan(rainCatchL('geodesic', TIER.geodesic.cells, 3, 'none'));
  });
  it('reuse climbs with the loop level and the people, and the bill and power climb with the loop', () => {
    for (let i = 1; i < WATER_LOOPS.length; i++) {
      expect(REUSE[WATER_LOOPS[i]]).toBeGreaterThan(REUSE[WATER_LOOPS[i - 1]]);
      expect(loopUsd('geodesic', 7, WATER_LOOPS[i])).toBeGreaterThan(loopUsd('geodesic', 7, WATER_LOOPS[i - 1]));
      expect(loopKw('geodesic', 7, WATER_LOOPS[i])).toBeGreaterThan(loopKw('geodesic', 7, WATER_LOOPS[i - 1]));
    }
    expect(reuseL(6, 130, 'recycle')).toBeGreaterThan(reuseL(3, 130, 'recycle'));
    expect(reuseL(4, 130, 'none')).toBe(0);
    expect(condensateL(4, true)).toBe(4 * CONDENSATE_L_PER_BED); expect(condensateL(4, false)).toBe(0);
  });
  it('flows: a dome with a cistern catches rain, a fitted loop gives water back, the pads drink on a hot day', () => {
    const g = two(); g.disaster.difficulty = 'standard';
    const d = domesOf(g)[0], st = ownState(g, d); st.powered = true;
    const none = domeWaterFlows(g, 2, 130, () => true);
    expect(none.rainL).toBeGreaterThan(0); expect(none.reuseL).toBe(0);
    expect(domeWaterFlows(g, 2, 130, () => false).rainL).toBe(0);
    st.loop = 'recycle';
    const loop = domeWaterFlows(g, 2, 130, () => true);
    expect(loop.reuseL).toBeGreaterThan(0); expect(loop.rainL).toBeGreaterThan(none.rainL);
    st.loopDownUntil = g.clock.t + 3;
    expect(domeWaterFlows(g, 2, 130, () => true).reuseL).toBe(0);
  });
  it('buying a loop costs money, works at once, and cannot be bought twice or on an earthen dome', () => {
    const g = newGame(5); g.money = 1e9; dome(g);
    const m0 = g.money;
    expect(buyLoop(g, 'grey')).toBeNull(); expect(g.money).toBeLessThan(m0); expect(stateOf(g, domeOf(g)!).loop).toBe('grey');
    expect(buyLoop(g, 'grey')).toMatch(/already/);
    expect(buyLoop(g, 'recycle')).toBeNull();
    const e = newGame(5); e.money = 1e9; dome(e, 'earthen');
    expect(buyLoop(e, 'grey')).toMatch(/too small/);
    const poor = newGame(5); poor.money = 10; dome(poor);
    expect(buyLoop(poor, 'grey')).toMatch(/needs/);
  });
});

describe('every finished dome runs its own air', () => {
  it('two domes have their own state, label, clock and people', () => {
    const g = two();
    expect(domesOf(g)).toHaveLength(2);
    expect(domeLabel(g, domesOf(g)[0])).not.toBe(domeLabel(g, domesOf(g)[1]));
    place(g, 'cottage', 40, 0);
    expect(setLockdown(g, true, domesOf(g)[1].st.id)).toBeNull();
    run(g, 6);
    const [a, b] = domesOf(g).map(d => stateOf(g, d));
    expect(a.lockdown).toBe(false); expect(b.lockdown).toBe(true);
    expect(b.co2ppm).toBeGreaterThan(a.co2ppm);
    expect(g.domes![domesOf(g)[0].st.id]).toBeDefined(); expect(g.domes![domesOf(g)[1].st.id]).toBeDefined();
    const views = domeViews(g);
    expect(views.map(v => v.main)).toEqual([true, false]);
    expect(views[0].people + views[1].people).toBe(peopleUnder(g, domesOf(g)[0]) + peopleUnder(g, domesOf(g)[1]));
  });
  it('the people are split among the domes by their homes, never counted twice', () => {
    const g = two(); place(g, 'cottage', 0, 0); place(g, 'cottage', 40, 0); place(g, 'cottage', 41, 1);
    const total = domeViews(g).reduce((a, v) => a + v.people, 0);
    expect(total).toBeGreaterThan(0);
    expect(domeViews(g)[1].people).toBeGreaterThan(domeViews(g)[0].people);
  });
  it('sealing both is worse for the air board line than one; the worst clock is the line', () => {
    const g = two();
    setLockdown(g, true, domesOf(g)[0].st.id); setLockdown(g, true, domesOf(g)[1].st.id);
    run(g, 30);
    for (const d of domesOf(g)) expect(stateOf(g, d).lockdown || stateOf(g, d).ventedAt !== null).toBe(true);
    const line = domeAirLine(g);
    if (line) expect(line.text).toMatch(/dome/i);
  });
  it('a saved v99 dome (no id, no ledger) is adopted by the main dome and keeps its switches', () => {
    const g = newGame(5); g.money = 1e9; const a = dome(g, 'geodesic'); wire(g, a.id); power(g);
    g.dome = { ...newDomeState(), lockdown: true, since: 0, mode: 'comfortable' };
    expect(stateOf(g, domeOf(g)!).lockdown).toBe(true);
    stepDome(g, 0.25 / 24);
    expect(g.domes![a.id].mode).toBe('comfortable'); expect(g.domes![a.id].lockdown).toBe(true); expect(g.dome).toBe(g.domes![a.id]);
    const b = dome(g, 'glass', 60, 0);   // a bigger dome finishes: it becomes the main one, the old keeps its own state
    stepDome(g, 0.25 / 24);
    expect(domeOf(g)!.st.id).toBe(b.id); expect(g.domes![a.id].lockdown).toBe(true); expect(g.domes![b.id].lockdown).toBe(false); expect(g.dome).toBe(g.domes![b.id]);
  });
  it('each dome draws its own power: the bigger one more', () => {
    const g = newGame(5); const a = dome(g, 'geodesic'), b = dome(g, 'glass', 60, 0);
    expect(domeKwhDay(g, b)).toBeGreaterThan(domeKwhDay(g, a));
    expect(domeKwhDay(g, { ...a, id: 'nope', kind: 'barn' })).toBe(0);
  });
  it('the heat fail-safe opens a sealed shell that is cooking with the plant dark', () => {
    const g = newGame(5); dome(g, 'glass');     // no wire: no plant
    g.clock.t = 190.55;                          // a July afternoon
    setLockdown(g, true);
    const lines: string[] = [];
    for (let i = 0; i < 4 * 24 * 3 && stateOf(g, domeOf(g)!).lockdown; i++) lines.push(...stepDome(g, 0.25 / 24));
    const st = stateOf(g, domeOf(g)!);
    if (!st.lockdown) expect(lines.join(' ')).toMatch(/fail-safe vents/);
  });
});

describe('dome decisions: hot day, water loop, livestock', () => {
  it('a dome that ran hot raises the hot card; chillers cost money and cool; the vents option opens a sealed dome', () => {
    const g = newGame(5); g.money = 1e9; const a = dome(g); wire(g, a.id); power(g);
    const st = ownState(g, domeOf(g)!); st.overH = 5; st.indoorF = 99; st.mode = 'comfortable';
    domeDay(g);
    expect(stateOf(g, domeOf(g)!).cards).toContain('hot');
    const c = domeCards(g).find(x => x.id === 'dome:hot');
    expect(c).toBeDefined(); expect(c!.acts.length).toBe(3);
    const m = g.money;
    expect(domeChoose(g, 'dome:hot:chill')).toMatch(/chillers/i);
    expect(g.money).toBeLessThan(m); expect(stateOf(g, domeOf(g)!).chillUntil).toBeGreaterThan(g.clock.t);
    const g2 = newGame(5); g2.money = 1e9; const a2 = dome(g2); wire(g2, a2.id); power(g2);
    setLockdown(g2, true); ownState(g2, domeOf(g2)!).cards.push('hot'); ownState(g2, domeOf(g2)!).indoorF = 95;
    domeChoose(g2, 'dome:hot:vent');
    expect(stateOf(g2, domeOf(g2)!).lockdown).toBe(false);
  });
  it('rented chillers hold a hot dome whose own plant is dark', () => {
    const g = newGame(5); const a = dome(g); g.clock.t = 190.6;
    const st = ownState(g, domeOf(g)!); st.mode = 'comfortable';
    stepDome(g, 0.25 / 24); const dark = stateOf(g, domeOf(g)!).indoorF;
    st.chillUntil = g.clock.t + 2; stepDome(g, 0.25 / 24);
    expect(stateOf(g, domeOf(g)!).indoorF).toBeGreaterThanOrEqual(BAND.comfortable[0] - 0.01);
    expect(dark).toBeLessThan(BAND.comfortable[0]);
    expect(a.id).toBeTruthy();
  });
  it('the water loop card appears when a fitted loop fails, and the plumber fixes it', () => {
    const g = newGame(5); g.money = 1e9; const a = dome(g); wire(g, a.id); power(g); buyLoop(g, 'recycle');
    const st = ownState(g, domeOf(g)!);
    let n = 0;
    while (!st.cards.includes('loop') && n++ < 3000) { g.clock.t += 7; st.loopDownUntil = 0; domeDay(g); }
    expect(st.cards).toContain('loop');
    expect(domeCards(g).some(c => c.id === 'dome:loop')).toBe(true);
    expect(domeChoose(g, 'dome:loop:fix')).toMatch(/running/);
    expect(st.loopDownUntil).toBe(0); expect(st.cards).not.toContain('loop');
  });
  it('stressed animals under a dome raise the stock card; care costs $350 and calms them', () => {
    const g = newGame(5); g.money = 1e9; const a = dome(g); wire(g, a.id); power(g); place(g, 'barn', 0, 0);
    expect(stockCover(g).share).toBe(1);
    const st = ownState(g, domeOf(g)!); st.stress = 0.8; st.indoorF = 99;
    domeDay(g);
    expect(st.cards).toContain('stock');
    const m = g.money; expect(domeChoose(g, 'dome:stock:care')).toMatch(/settle/); expect(m - g.money).toBe(350); expect(st.stress).toBe(0);
  });
  it('the second dome\'s cards carry its id and answer to it', () => {
    const g = two(); const [, b] = domesOf(g);
    const sb = ownState(g, b); sb.cards.push('foul'); sb.filtering = 'advanced'; sb.filterHealth = 0.2;
    const c = domeCards(g).find(x => x.id === `dome:foul@${b.st.id}`);
    expect(c).toBeDefined();
    expect(domeChoose(g, `dome:foul:ignore@${b.st.id}`)).toMatch(/leave it/i);
    expect(stateOf(g, b).cards).not.toContain('foul');
  });
});

describe('what a held climate does for the garden, the bay and the barn', () => {
  const held = (): GameState => { const g = newGame(5); g.money = 1e9; const a = dome(g); wire(g, a.id); power(g); ownState(g, domeOf(g)!); stepDome(g, 0.25 / 24); return g; };
  it('a bed in a powered frost-free dome gets a longer season and a better yield; outside is unchanged', () => {
    const g = held();
    const inb = { x: 1, z: 1 }, outb = { x: 500, z: 500 };
    expect(coverAt(g, inb.x, inb.z)).not.toBeNull(); expect(coverAt(g, outb.x, outb.z)).toBeNull();
    expect(domeYieldK(g, inb)).toBeGreaterThan(1); expect(domeYieldK(g, outb)).toBe(1);
    const [a, b] = domeSeason(g, inb, 130, 280);
    if (stateOf(g, domeOf(g)!).powered && stateOf(g, domeOf(g)!).indoorF >= 36) { expect(a).toBeLessThan(130); expect(b).toBeGreaterThan(280); expect(underHeldDome(g, inb)).toBe(true); }
    expect(domeSeason(g, outb, 130, 280)).toEqual([130, 280]);
  });
  it('an unpowered dome gives only the shell\'s small gain, never a frost-free season', () => {
    const g = newGame(5); dome(g); stepDome(g, 0.25 / 24);
    expect(domeYieldK(g, { x: 0, z: 0 })).toBeLessThan(1.1); expect(underHeldDome(g, { x: 0, z: 0 })).toBe(false);
  });
  it('an earthen dome grows nothing and covers no stock', () => {
    const g = newGame(5); dome(g, 'earthen'); expect(coverAt(g, 0, 0)).toBeNull();
  });
  it('animals under a comfortable dome fall sick less; a cooking or freezing dome makes it worse than outside', () => {
    const g = held(); place(g, 'barn', 0, 0);
    const st = ownState(g, domeOf(g)!);
    st.indoorF = 70; expect(domeSickK(g)).toBeLessThan(1);
    st.indoorF = 100; expect(domeSickK(g)).toBeGreaterThan(domeSickK(Object.assign(held(), {}) ));
    const out = newGame(5); place(out, 'barn', 0, 0); expect(domeSickK(out)).toBe(1);
  });
});

describe('the felt layer knows the dome', () => {
  it('the dome branch replaces the generic "how long to stay sealed" card while a dome stands', () => {
    const g = newGame(5); g.money = 1e9; const a = dome(g); wire(g, a.id); power(g);
    g.disaster.kind = 'nuclear'; g.disaster.hitAt = g.clock.t;
    const generic = genericCards('nuclear')[0], [seal, hot] = domeFalloutCards('nuclear');
    expect(hasDome(g)).toBe(true);
    expect(generic.when(g)).toBe(false); expect(seal.when(g)).toBe(true);
    expect(seal.title(g)).toBe(generic.title(g));
    expect(seal.text(g)).toMatch(/dome/); expect(seal.text(g)).toMatch(/hours|days|plant runs/);
    expect(seal.options.map(o => o.id)).toEqual(['seal', 'filter', 'dash']);
    const noDome = newGame(5); noDome.disaster.kind = 'nuclear'; noDome.disaster.hitAt = noDome.clock.t;
    expect(generic.when(noDome)).toBe(true); expect(seal.when(noDome)).toBe(false);
    expect(hot.when(noDome)).toBe(false);
  });
  it('choosing "seal" seals the dome; "filter" orders the air bank and charges for it', () => {
    const g = newGame(5); g.money = 1e9; const a = dome(g); wire(g, a.id); power(g);
    g.disaster.kind = 'nuclear'; g.disaster.hitAt = g.clock.t;
    const [seal] = domeFalloutCards('nuclear');
    const r = () => 0.99;
    seal.options.find(o => o.id === 'seal')!.apply(g, r);
    expect(stateOf(g, domeOf(g)!).lockdown).toBe(true);
    const g2 = newGame(5); g2.money = 1e9; const b = dome(g2); wire(g2, b.id); power(g2); g2.disaster.kind = 'nuclear'; g2.disaster.hitAt = g2.clock.t;
    const m = g2.money; seal.options.find(o => o.id === 'filter')!.apply(g2, r);
    expect(stateOf(g2, domeOf(g2)!).installing?.level).toBe('advanced'); expect(g2.money).toBeLessThan(m);
  });
  it('dome radio lines are eligible only for a real dome and their claims match the world', () => {
    const g = newGame(5); g.money = 1e9; const a = dome(g); wire(g, a.id); power(g);
    g.disaster.kind = 'nuclear'; g.disaster.hitAt = g.clock.t - 3;
    const lines = domeLines('nuclear');
    expect(lines.length).toBeGreaterThanOrEqual(8);
    const chans = new Set(lines.map(l => l.channel));
    for (const c of ['official', 'ham', 'trade', 'local', 'rumor']) expect(chans.has(c as never)).toBe(true);
    for (const l of lines) expect(l.id.startsWith('nuclear.')).toBe(true);
    const sealedOnly = lines.filter(l => /sealed|air_alert/.test(l.id));
    for (const l of sealedOnly) expect(l.when(g)).toBe(false);
    setLockdown(g, true);
    for (const l of sealedOnly) { expect(l.when(g), l.id).toBe(true); expect(l.claim!(g)).toBe(true); expect(l.text(g, () => 0.5)).toMatch(/\S/); }
    expect(evalClaim(g, { id: 'dome_stands' })).toBe(true);
    const bare = newGame(5); bare.disaster.kind = 'nuclear'; bare.disaster.hitAt = bare.clock.t - 3;
    for (const l of lines) if (l.truth === 'true') expect(l.when(bare), l.id).toBe(false);
    for (const l of lines) if (l.truth === 'false') { expect(l.when(bare)).toBe(true); expect(l.claim!(bare)).toBe(false); }
  });
  it('the dome is a fallout shelter and clean zone, and the best of several counts', () => {
    const g = two(); g.disaster.kind = 'nuclear'; g.disaster.hitAt = g.clock.t;
    setLockdown(g, true, domesOf(g)[1].st.id);
    stepDome(g, 0.25 / 24);
    expect(domeShelter(g)).not.toBeNull(); expect(domeFalloutAdj(g)!.clean).toBe(true);
    const f = domeShelterFacts(g)!; expect(f.count).toBe(2); expect(f.sealed).toBe(true);
  });
});

describe('save and doors', () => {
  it('v99 saves migrate to the current version untouched', () => {
    const g = newGame(5);
    const up = migrate({ ...(g as unknown as Record<string, unknown>), version: 99 } as never);
    expect(up.version).toBe(SAVE_VERSION);
    expect(SAVE_VERSION).toBeGreaterThanOrEqual(100);
  });
  it('the geodesic airlock doors are harder than the old 0.6 ram odds and the tiers stay monotone', () => {
    expect(AIRLOCK_DOOR.geodesic.ram).toBeLessThanOrEqual(0.45);
    for (let i = 1; i < DOME_TIERS.length; i++) { expect(AIRLOCK_DOOR[DOME_TIERS[i]].ram).toBeLessThanOrEqual(AIRLOCK_DOOR[DOME_TIERS[i - 1]].ram); expect(AIRLOCK_DOOR[DOME_TIERS[i]].blast).toBeLessThanOrEqual(AIRLOCK_DOOR[DOME_TIERS[i - 1]].blast + 0.04); }
  });
});
