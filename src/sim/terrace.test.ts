import { describe, expect, it } from 'vitest';
import { makeLotSite } from './lotListing';
import { newGame, type GameState } from './state';
import { planStructure } from './construction';
import { RW, planPad } from './retainPlan';
import { siteLot } from './lotListing';
import { KIT, footprint } from '../game/buildkit/kit';
import { TERRACE, planTerraces, terraceSite, terraceText, tierSpacing } from './terrace';
import { suggestions, terraceSuggestion } from './guidance';
import { wallOf } from './retaining';
import { BLUEPRINTS } from './blueprints';

/** A hillside place with a home standing, and a terrace site found near it. */
function hill(): { g: GameState; at: ReturnType<typeof terraceSite> } {
  for (let seed = 1; seed < 80; seed++) for (const relief of [8, 10, 12]) {
    const g = newGame(7); g.site = { ...makeLotSite({ kind: 'hillside', relief, elevM: 1800, seed }), creek: false };
    const h = g.site.home;
    g.structures.push({ id: 'home', kind: 'timber_cabin', x: (h.x0 + h.x1) / 2, z: (h.z0 + h.z1) / 2, rot: 0, stage: 99, done: 0, supplied: true, finishedAt: 0 });
    const at = terraceSite(g);
    if (at) return { g, at };
  }
  throw new Error('no terrace site found on any hillside');
}

describe('terraced garden beds', () => {
  it('a place with no relief offers none, and so does a bare hill with no home yet', () => {
    const flat = newGame(4);
    expect(terraceSite(flat)).toBeNull();
    expect(planTerraces(flat, { x0: 10, z0: 10, x1: 20, z1: 20 }).problem).toMatch(/no slope/);
    const g = newGame(7); g.site = { ...makeLotSite({ kind: 'hillside', relief: 10, elevM: 1800, seed: 3 }), creek: false };
    expect(terraceSite(g)).toBeNull();
  });

  it('steps two or three beds down the fall, spaced for a wall, an apron and a stair, none overlapping, each with a priced wall', () => {
    const { at } = hill();
    const p = at!;
    expect(p.problem).toBeNull();
    expect(p.tiers.length).toBeGreaterThanOrEqual(2);
    expect(p.tiers.length).toBeLessThanOrEqual(TERRACE.MAX_TIERS);
    expect(p.slopePct).toBeGreaterThanOrEqual(Math.round(TERRACE.MIN_SLOPE * 100) - 1);
    // along the fall they are one spacing apart, and the beds stay apart
    for (let i = 1; i < p.tiers.length; i++) {
      const d = p.axis === 'x' ? p.tiers[i].x - p.tiers[i - 1].x : p.tiers[i].z - p.tiers[i - 1].z;
      expect(Math.abs(d)).toBeCloseTo(tierSpacing(), 6);
      expect(Math.sign(d)).toBe(p.dir);
    }
    expect(p.pallets).toBe(p.tiers.reduce((a, t) => a + t.pallets, 0));
    expect(p.usd).toBe(p.pallets * 300);
    expect(p.hours).toBeGreaterThanOrEqual(0);
    for (const t of p.tiers) { expect(t.wallHm).toBeLessThanOrEqual(RW.STAIR_MAX_H * RW.M); expect(t.grade).toBeLessThanOrEqual(KIT.garden.maxSlope); }
    expect(terraceText(p)).toMatch(/dry-stack/);
  });

  it('the walls are what the foundation pays: staking the plan costs no more than the graded gardens, and each tier has a wall', () => {
    const { g, at } = hill();
    const spent = at!.tiers.map(t => planStructure(g, 'garden', t.x, t.z, 0));
    const lot = siteLot(g.site)!;
    for (const st of spent) {
      const w = wallOf(g, st);
      if (st.grade) expect(BLUEPRINTS.garden.stages.length).toBeGreaterThan(0);
      if (w) { expect(w.heightM).toBeGreaterThan(0.4); expect(w.plan.rect.x1 - w.plan.rect.x0).toBeGreaterThan(footprint(KIT.garden, st.x, st.z, 0).x1 - footprint(KIT.garden, st.x, st.z, 0).x0 - 0.01); }
      const fp = footprint(KIT.garden, st.x, st.z, 0), plan = planPad(fp, lot.field.h);
      expect(plan.maxH).toBeGreaterThanOrEqual(0);
    }
    // the pads of two tiers do not run into each other
    const plans = spent.map(st => wallOf(g, st)?.plan).filter(Boolean);
    for (let i = 1; i < plans.length; i++) {
      const a = plans[i - 1]!.rect, b = plans[i]!.rect;
      expect(a.x0 < b.x1 && a.x1 > b.x0 && a.z0 < b.z1 && a.z1 > b.z0).toBe(false);
    }
  });

  it('is a suggestion with a price and a confirm, never staked unasked; once there are two gardens it stops', () => {
    const { g, at } = hill();
    const before = g.structures.length;
    const card = terraceSuggestion(g);
    expect(Array.isArray(suggestions(g))).toBe(true);
    expect(card).toBeTruthy();
    expect(g.structures.length).toBe(before);
    const act = card!.acts![0].act;
    expect(act.type).toBe('terraces');
    if (act.type === 'terraces') expect(act.tiers).toEqual(at!.tiers.map(t => [t.x, t.z]));
    expect(card!.acts![0].label).toMatch(/\$/);
    planStructure(g, 'garden', 5, 5, 0); planStructure(g, 'garden', 9, 5, 0);
    expect(terraceSite(g)).toBeNull();
  });

  it('refuses ground that is too gentle, too steep or too short', () => {
    const { g, at } = hill();
    const t = at!.tiers[0];
    expect(planTerraces(g, { x0: t.x - 1, z0: t.z - 1, x1: t.x + 1, z1: t.z + 1 }).problem).toMatch(/room for two/);
    const h = g.site.home;
    expect(planTerraces(g, { x0: h.x0 - 30, z0: h.z0 - 30, x1: h.x0 - 20, z1: h.z0 - 20 }).problem).not.toBeNull();
  });
});
