import { describe, it, expect } from 'vitest';
import { newGame } from './state';
import { plagueOf, biosecurity, exposureChance, plagueChoose, plagueCards, plagueDaily, plagueGoal, plagueVariant, PLAGUES } from './livestockPlague';
import { fxCtxFor, fxMedical, fxCards } from './disasterFx';
import { mulberry32 } from './rng';

const game = (variant = 'fmd', difficulty: 'cozy' | 'standard' | 'hardcore' = 'standard') => {
  const g = newGame(9, 105, 2027, { mode: 'scenario', peace: 'short', kind: 'livestock_plague', variant, difficulty });
  g.clock.t = g.disaster.hitAt + 20; g.disaster.phase = 'impact'; g.disaster.fate = 'full';
  const st = g.stock as unknown as Record<string, number>; st.goat = 4; st.pig = 2; st.steer = 1;
  return g;
};

describe('biosecurity', () => {
  it('measures add up (capped) and cut the chance the disease reaches the place', () => {
    const g = game(); const f = plagueOf(g); f.caseDay = 1; const base = exposureChance(g);
    expect(base).toBeGreaterThan(0);
    for (const m of ['gate', 'footbath', 'boots', 'quarantine'] as const) plagueChoose(g, `lp:m:${m}`);
    expect(biosecurity(g)).toBeCloseTo(0.7); expect(exposureChance(g)).toBeLessThan(base * 0.4);
  });
  it('the net only counts against avian flu; own feed is the whole defense against the prion', () => {
    const f = game('fmd'); plagueOf(f).measures.push('net'); expect(biosecurity(f)).toBe(0);
    const h = game('hpai'); plagueOf(h).measures.push('net'); expect(biosecurity(h)).toBeCloseTo(0.3);
    const b = game('bse_like'); plagueOf(b).measures.push('feed'); expect(biosecurity(b)).toBeCloseTo(0.8);
  });
});

describe('the cull card and its answers', () => {
  const sick = () => { const g = game(); plagueOf(g).onPlace = true; return g; };
  it('a case on the place raises the alarm card with the four answers', () => {
    const g = sick(); const c = fxCards(g).find(x => x.id === 'lp_cull')!; expect(c.tone).toBe('alarm');
    expect(c.acts.map(a => a.choice)).toEqual(['lp:comply', 'lp:selective', 'lp:eat', 'lp:hide']);
  });
  it('comply: the herd is gone, an indemnity is paid on a full fate, nothing on never', () => {
    const g = sick(); const m = g.money; plagueChoose(g, 'lp:comply'); expect((g.stock as unknown as Record<string, number>).goat).toBe(0); expect(g.money).toBeGreaterThan(m);
    const n = sick(); n.disaster.fate = 'never'; const m2 = n.money; plagueChoose(n, 'lp:comply'); expect(n.money).toBe(m2);
  });
  it('selective needs a medic (except against swine fever, where every pig has it)', () => {
    const g = sick(); expect(plagueChoose(g, 'lp:selective')).toMatch(/medic/);
    g.people[0].skills.medic = 4; plagueChoose(g, 'lp:selective'); expect((g.stock as unknown as Record<string, number>).goat).toBeLessThan(4); expect((g.stock as unknown as Record<string, number>).goat).toBeGreaterThan(0);
  });
  it('hiding is found sooner or later: stock taken, a ban, the neighbors turn', () => {
    const g = sick(); plagueChoose(g, 'lp:hide'); const d = g.neighbors[0].disposition;
    let said = '';
    for (let k = 0; k < 200 && !plagueOf(g).found; k++) { const c = fxCtxFor(g, k); c.r = mulberry32(k); said += plagueDaily(g, c).join(' '); }
    expect(plagueOf(g).found).toBe(true); expect(said).toMatch(/state vet/); expect(g.neighbors[0].disposition).toBeLessThan(d);
    expect((g.stock as unknown as Record<string, number>).pig).toBe(0);
  });
  it('the goal chain follows the decision; the zoonotic flu carries a human tail, the others none', () => {
    const g = sick(); expect(plagueGoal(g).steps.filter(s => s.done).length).toBe(0); plagueChoose(g, 'lp:comply'); expect(plagueGoal(g).steps[1].done).toBe(true);
    expect(fxMedical(game('hpai'))).toEqual({ contact: 0, spread: 0 }); expect(fxMedical(game('mixed_zoonotic')).contact).toBeGreaterThan(0);
    expect(Object.keys(PLAGUES).length).toBe(5); expect(plagueVariant(g).id).toBe('fmd'); expect(plagueCards(game()).length).toBeGreaterThan(0);
  });
});
