/**
 * QA dead ends (docs/DECISIONS.md, "Onboarding fixes"): the starter compound said "Nothing fits the cash yet" with $468k in the bank
 * (the real reason was no room beside a crowded farmstead), and a well pump stayed unpowered for years (no power source on the place, so
 * the "draw the line" step had nothing to draw to). Reproduced over many seeds and lots; the compound must be workable whenever the cash allows.
 */
import { describe, expect, it } from 'vitest';
import { listings } from './site';
import { newGame, type GameState } from './state';
import { siteLot } from './lotListing';
import { planStarter, NO_ROOM } from './starterCompound';
import { planStructure } from './construction';
import { plant, balanceDay } from './utilities';
import { needsHookup, powerOnPlace } from './hookups';
import { suggestions } from './guidance';
import { mulberry32 } from './rng';
import type { RegionId } from './regions';
import type { SiteQuery } from '../game/buildkit/kit';

const REGIONS: RegionId[] = ['mountain_west', 'plains', 'appalachia', 'new_england', 'desert'];

/** A game on a listed lot with what came with the land placed round the camp (as the world does), and pools of water in the way. */
function lotGame(seed: number, region: RegionId, k: number, pools: number) {
  const site = listings(seed, region, undefined as never, 6, 2_000_000)[k];
  const g = newGame(seed, 105, 2027, { site, grid: false });
  g.money = 468_000;
  const h = g.site.home, cx = (h.x0 + h.x1) / 2, cz = (h.z0 + h.z1) / 2, lot = siteLot(g.site), rr = mulberry32(seed * 31 + k);
  g.structures.forEach((z, i) => { if (z.unplaced) { z.unplaced = false; const a = i * 1.9 + seed; z.x = cx + Math.cos(a) * (i === 0 ? 0 : 2.5 + i); z.z = cz + Math.sin(a) * (i === 0 ? 0 : 2.5 + i); } });
  const discs = Array.from({ length: pools }, () => [cx + (rr() - 0.5) * 22, cz + (rr() - 0.5) * 22, 2 + rr() * 4]);
  const query: SiteQuery = { height: lot ? lot.field.h : () => 0, owned: (x, z) => x >= h.x0 && x <= h.x1 && z >= h.z0 && z <= h.z1, water: (x, z) => discs.some(d => Math.hypot(x - d[0], z - d[1]) < d[2]) };
  const geo = { center: [cx, cz] as [number, number], drive: [[h.x1, cz], [cx + 3, cz]] as Array<[number, number]> };
  return { g, query, geo };
}
const finishAll = (g: GameState, p: ReturnType<typeof planStarter>) => { for (const x of p.pieces.filter(y => !y.later)) { const st = planStructure(g, x.kind, x.x, x.z, x.rot); st.stage = 99; st.finishedAt = 0; } };

describe('starter compound dead ends', () => {
  it('with the cash in hand it always lays something, never blames the cash for lack of room, and the pump ends up powered', () => {
    let plans = 0;
    for (let seed = 1; seed <= 3; seed++) for (const region of REGIONS) for (let k = 0; k < 2; k++) for (const pools of [0, 8]) {
      const { g, query, geo } = lotGame(seed, region, k, pools);
      const p = planStarter(g, { query, geo });
      const tag = `${seed}/${region}/${k}/${pools}`;
      plans++;
      expect(p.problem, tag).toBeNull();
      expect(p.pieces.some(x => x.later && x.laterWhy && x.laterWhy !== NO_ROOM && !/to spare|left out/.test(x.laterWhy)), tag).toBe(false);
      // a pump (existing or planned) never ends up with no power source: when the room runs out the solar array is not the piece that is dropped
      const wellPlanned = p.pieces.some(x => x.key === 'well' && !x.later) || g.structures.some(x => x.kind === 'well_drilled');
      if (wellPlanned && !g.utilities.grid) expect(p.pieces.some(x => x.key === 'solar' && !x.later) || g.structures.some(x => x.kind === 'solar_array'), tag).toBe(true);
      finishAll(g, p);
      balanceDay(g, plant(g), 0.9);
      expect(needsHookup(g).filter(n => n.kind === 'pump_power'), tag).toEqual([]);
    }
    expect(plans).toBe(60);
  });

  it('a lot with no room left by the house says so (not "the cash") and the list shows no $0 price', () => {
    const { g, query, geo } = lotGame(2, 'plains', 0, 0);
    const walled: SiteQuery = { ...query, water: (x, z) => { const h = g.site.home; return Math.hypot(x - (h.x0 + h.x1) / 2, z - (h.z0 + h.z1) / 2) > 3.5; } };
    const p = planStarter(g, { query: walled, geo });
    expect(g.money).toBeGreaterThan(400_000);
    expect(p.pieces.filter(x => x.later).every(x => x.laterWhy === NO_ROOM || /left out/.test(x.laterWhy ?? ''))).toBe(true);
    if (p.problem) { expect(p.problem).not.toMatch(/cash/); expect(p.line).not.toMatch(/cash/); expect(p.problem).toMatch(/clear, level ground/); }
  });

  it('a thin purse still says the cash', () => {
    const { g, query, geo } = lotGame(2, 'plains', 0, 0);
    g.money = 4_000;
    expect(planStarter(g, { query, geo }).problem).toMatch(/cash/);
  });
});

describe('the pump next step resolves power', () => {
  const pumpGame = (grid: boolean, gridDown: boolean) => {
    const g = newGame(11); g.structures = []; g.utilities.grid = grid; if (g.site.improvements) g.site.improvements.power = grid;
    if (gridDown) g.disaster.tracks.grid = 0;
    const w = planStructure(g, 'well_drilled', 10, 10, 0); w.stage = 99; w.finishedAt = 0;
    return g;
  };
  it('no source and no grid: the step is to stake solar (nothing to draw a cable to), not to draw a line', () => {
    const g = pumpGame(false, false);
    balanceDay(g, plant(g), 0.9);
    const n = needsHookup(g).find(x => x.kind === 'pump_power')!;
    expect(n.stake).toBe('solar_array');
    expect(n.tool).toBeNull();
    const sug = suggestions(g, 6).find(x => x.id === 'hookup')!;
    expect(sug.acts?.some(a => a.act.type === 'stake' && a.act.kind === 'solar_array')).toBe(true);
    expect(sug.acts?.some(a => a.act.type === 'tool')).toBe(false);
  });
  it('once the array is staked the nag goes quiet, and once it stands the pump runs', () => {
    const g = pumpGame(false, false);
    planStructure(g, 'solar_array', 14, 10, 0);
    expect(needsHookup(g).find(x => x.kind === 'pump_power')).toBeUndefined();
    const s = g.structures.find(x => x.kind === 'solar_array')!; s.stage = 99; s.finishedAt = 0;
    balanceDay(g, plant(g), 0.9);
    expect(g.utilities.lit).toContain(g.structures[0].id);
  });
  it('a grid the disaster took down is not "power on the place", and the step says so', () => {
    const g = pumpGame(true, true);
    expect(powerOnPlace(g)).toBe(false);
    balanceDay(g, plant(g), 0.9);
    expect(needsHookup(g).find(x => x.kind === 'pump_power')?.todo).toMatch(/grid is down/);
    expect(suggestions(g, 8).some(x => x.kind === 'solar_array')).toBe(true);
  });
});
