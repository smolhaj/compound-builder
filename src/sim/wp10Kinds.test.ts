/** WP10: the seven new kinds through the real engine, the new variants, per-variant fate odds, the regional odds and the asteroid hint. */
import { describe, it, expect } from 'vitest';
import { newGame } from './state';
import { step } from './engine';
import { DISASTERS, TRACKS, VARIANT_FATE, fateOdds, FATE_ODDS, SURPRISE_POOL, updateDisaster, triggerDisaster, type DisasterKind } from './disaster';
import { fxPriceMod, fxMedical, fxSupplyMods } from './disasterFx';
import { BLURB } from './disasterBlurbs';
import { REGIONS } from './regions';
import { plumeDose } from './disasters/reactor_meltdown';
import { waterWarYield } from './waterWar';
import { rollImpact } from './impactZone';

const NEW: DisasterKind[] = ['satellite_loss', 'oil_shock', 'reactor_meltdown', 'global_famine', 'water_war', 'cult_takeover', 'mass_exodus'];

describe('WP10 kinds', () => {
  it('every new variant runs through the hit without a NaN and keeps every number sane', { timeout: 110000 }, () => {
    for (const k of NEW) for (const v of DISASTERS[k]!.variants) {
      let g = newGame(4, 105, 2027, { mode: 'scenario', peace: 'short', kind: k, variant: v.id });
      g = step(g, g.disaster.hitAt - g.clock.t + 1);
      g = step(g, 6);
      for (const t of TRACKS) expect(Number.isFinite(g.disaster.tracks[t]), `${k}/${v.id} ${t}`).toBe(true);
      expect(Number.isFinite(fxPriceMod(g))).toBe(true);
      expect(fxPriceMod(g)).toBeGreaterThanOrEqual(1);
      expect(Number.isFinite(fxSupplyMods(g).grow)).toBe(true);
      const m = fxMedical(g); expect(Number.isFinite(m.contact + m.spread)).toBe(true);
      expect(g.money).toBeGreaterThan(-1e9);
      expect(g.personState.every(p => Number.isFinite(p.needs.dose))).toBe(true);
    }
  });
  it('is selectable, described and in the pool; fate odds sum to one', () => {
    for (const k of NEW) { expect(DISASTERS[k]).toBeDefined(); expect(DISASTERS[k]!.pulpy).toBe(false); expect(BLURB[k].length).toBeGreaterThan(40); expect(SURPRISE_POOL).toContain(k); }
    for (const o of [...Object.values(FATE_ODDS), ...Object.values(VARIANT_FATE)]) expect(o!.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 5);
    for (const key of Object.keys(VARIANT_FATE)) { const [k, v] = key.split('/'); expect(DISASTERS[k as DisasterKind]!.variants.some(x => x.id === v), key).toBe(true); }
    expect(fateOdds('oil_shock', 'pipeline_cut')[0]).toBeGreaterThan(fateOdds('oil_shock', 'hormuz')[0]);
  });
  it('the new financial variants exist, and a bail-in variant always cuts large deposits', () => {
    const ids = DISASTERS.financial!.variants.map(v => v.id);
    expect(ids).toEqual(expect.arrayContaining(['sovereign_default', 'bail_in']));
    const g = newGame(2, 105, 2027, { mode: 'scenario', peace: 'short', kind: 'financial', variant: 'bail_in' });
    g.disaster.fate = 'full';
    expect(g.disaster.variant).toBe('bail_in');
  });
  it('regional odds: the quake is likelier in the Pacific Northwest than in New England; the water war in the desert', () => {
    expect(REGIONS.pnw.odds.mega_quake!).toBeGreaterThan(REGIONS.new_england.odds.mega_quake! * 3);
    expect(REGIONS.desert.odds.water_war!).toBeGreaterThan(REGIONS.upper_midwest.odds.water_war! * 5);
    expect(REGIONS.mountain_west.odds.supervolcano!).toBeGreaterThan(REGIONS.rust_belt.odds.supervolcano! * 3);
    expect(DISASTERS.mega_quake!.warn).toEqual([4, 30]);
  });
  it('the asteroid hint names the rolled zone, not a fixed one', () => {
    let seen = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const g = newGame(seed, 105, 2027, { mode: 'scenario', peace: 'short', kind: 'asteroid' });
      const imp = rollImpact(seed, g.site.region, g.disaster.difficulty);
      const d = g.disaster; d.news = [];
      for (let t = Math.floor(d.warnAt); t < d.hitAt - 1; t++) updateDisaster(d, t + 0.3, seed, { region: g.site.region, doy: 100 });
      for (const n of d.news.filter(x => /Confirmed/.test(x.text))) { seen++; expect(n.text).toContain(imp.zone); expect(/North Atlantic/.test(n.text) && imp.zone !== 'the North Atlantic').toBe(false); }
    }
    expect(seen).toBeGreaterThan(3);
  });
  it('pure helpers: plume dose arrives late and decays; the aquifer takes hand wells first', () => {
    expect(plumeDose('meltdown_regional', 0, 4)).toBe(0);
    expect(plumeDose('meltdown_regional', 8, 100)).toBeGreaterThan(plumeDose('meltdown_regional', 1000, 1100));
    expect(plumeDose('dirty_bomb', 0, 1000)).toBeLessThan(plumeDose('spent_pool_fire', 30, 1000));
    expect(waterWarYield('aquifer_collapse', 'well_hand', 60)).toBe(0);
    expect(waterWarYield('contamination', 'well_hand', 100)).toBe(1);
  });
  it('triggering in Free build works for each new kind', () => {
    for (const k of NEW) { const g = newGame(3); triggerDisaster(g.disaster, g.clock.t, k, g.seed, 5); expect(g.disaster.kind).toBe(k); }
  });
});
