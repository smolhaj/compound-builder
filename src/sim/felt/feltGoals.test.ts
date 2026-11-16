import { describe, expect, it } from 'vitest';
import { newGame, type GameState } from '../state';
import { triggerDisaster, type DisasterKind } from '../disaster';
import { mulberry32 } from '../rng';
import { feltDaily } from './daily';
import { FELT_KINDS, feltSpec } from './registry';
import { feltGoals } from './goals';
import { activeChain, feltChain, CHAIN_DAYS } from './goalLib';
import { chainFor, isFxChain } from './goalChains';
import { feltOf } from './state';
import { suggestions } from '../guidance';
import type { FeltKind } from './types';

function at(kind: FeltKind, days: number, money = 5000): GameState {
  const g = newGame(7);
  triggerDisaster(g.disaster, g.clock.t, 'grid_down', g.seed, 0);
  g.disaster.kind = kind as DisasterKind;
  g.clock.t = g.disaster.hitAt + days;
  g.money = money;
  return g;
}
const ctx = (s: GameState) => ({ day: 0, r: mulberry32(1), once: () => true, ...{ s } });

describe('signature goal chains', () => {
  it('every kind has a real chain of 3 to 5 steps with unique ids, an act and a reward', () => {
    for (const k of FELT_KINDS) {
      const c = chainFor(k, feltSpec(k)?.goals);
      expect(c, k).toBeTruthy();
      expect(c!.steps.length, k).toBeGreaterThanOrEqual(3);
      expect(c!.steps.length, k).toBeLessThanOrEqual(5);
      expect(new Set(c!.steps.map(x => x.id)).size, k).toBe(c!.steps.length);
      const g = at(k, 1);
      for (const st of c!.steps) {
        expect(st.reward.title.length, `${k} ${st.id}`).toBeGreaterThan(3);
        expect(st.reward.line.length, `${k} ${st.id}`).toBeGreaterThan(15);
        expect(st.why(g).length, `${k} ${st.id}`).toBeGreaterThan(20);
        const a = st.act?.(g);
        expect(a, `${k} ${st.id} act`).toBeTruthy();
      }
    }
  });
  it('the generic chains start undone on a fresh place, and each step is done when its state is met', () => {
    const g = at('solar_flare', 1);
    const c = chainFor('solar_flare')!;
    expect(c.steps.every(st => !st.done(g))).toBe(true);
    g.utilities.off.push('house'); expect(c.steps[0].done(g)).toBe(true);
    const f = at('oil_shock', 1); (f.stock as unknown as Record<string, number>).fuel = 5; expect(chainFor('oil_shock')!.steps[0].done(f)).toBe(true);
    
  });
  it('the card is up from the warning to day 14, then the first-hour card returns', () => {
    const g = at('solar_flare', 0); g.clock.t = g.disaster.warnAt;
    expect(activeChain(g)).toBeTruthy(); expect(feltChain(g)!.heading).toBeTruthy();
    g.clock.t = g.disaster.hitAt + CHAIN_DAYS - 0.5; expect(feltChain(g)).toBeTruthy();
    g.clock.t = g.disaster.hitAt + CHAIN_DAYS + 0.5; expect(feltChain(g)).toBeNull();
    g.clock.t = g.disaster.warnAt - 1; expect(feltChain(g)).toBeNull();
  });
  // a kind that has no goals of its own in its spec: the generic chain is in force (kinds that wrote their own are covered by the loops)
  const GEN = (['solar_flare', 'oil_shock', 'drought', 'wildfire', 'emp'] as FeltKind[]).find(k => !feltSpec(k)?.goals)!;
  it('done stays done: a latched step holds after the state falls away, and the reward is logged once', () => {
    const g = at(GEN, 1);
    const c = chainFor(GEN)!, s0 = c.steps[0];
    // make the first step true by the live state, whatever it is
    const mk: Record<string, (x: GameState) => void> = { breakers: x => { x.utilities.off.push('house'); }, fuel: x => { (x.stock as unknown as Record<string, number>).fuel = 9; }, water: x => { (x.stock as unknown as Record<string, number>).water_jugs = 99; }, cage: () => undefined, firebreak: () => undefined, cistern: () => undefined };
    const key = s0.id.split(':')[1];
    if (!mk[key]) return;
    const undo = key === 'breakers' ? (x: GameState) => { x.utilities.off.length = 0; } : (x: GameState) => { (x.stock as unknown as Record<string, number>)[key === 'fuel' ? 'fuel' : 'water_jugs'] = 0; };
    mk[key](g);
    expect(feltGoals(g, ctx(g), feltSpec(GEN)!).some(l => l.startsWith('Goal done:'))).toBe(true);
    undo(g);
    expect(feltOf(g)!.goals.done).toContain(s0.id);
    expect(feltChain(g)!.goals[0].status).toBe('done');
    expect(feltGoals(g, ctx(g), feltSpec(GEN)!)).toEqual([]);
  });
  it('completion: all steps done gives the set-for-now card and one completion line', () => {
    for (const k of FELT_KINDS) {
      const g = at(k, 1), spec = feltSpec(k)!;
      const c = activeChain(g)!; expect(c, k).toBeTruthy();
      const done = (feltOf(g)?.goals.done ?? []); feltGoals(g, ctx(g), spec);
      const f = feltOf(g)!; f.goals.done = [...new Set([...done, ...c.steps.map(x => x.id)])];
      expect(feltChain(g)!.complete, k).toBe(true);
      const lines = feltGoals(g, ctx(g), spec);
      expect(lines.filter(l => l.includes('set for now')), k).toHaveLength(1);
      expect(feltGoals(g, ctx(g), spec), k).toEqual([]);
    }
  });
  it('rich and poor get different acts where cash matters', () => {
    const poor = at('drought', 1, 100), rich = at('drought', 1, 9000);
    const st = chainFor('drought', feltSpec('drought')?.goals)!.steps.find(x => x.pace)!;
    expect(st.act!(poor)!.act).not.toEqual(st.act!(rich)!.act);
    expect(st.pace?.(poor)).toMatch(/Cash is/); expect(st.pace?.(rich)).toBeNull();
  });
  it('the daily dispatcher runs it, and progress survives a save round trip', () => {
    const g = at('grid_down', 1), c = activeChain(g)!;
    feltDaily(g, ctx(g));
    feltOf(g)!.goals.done.push(c.steps[0].id);
    const back = JSON.parse(JSON.stringify(g)) as GameState;
    expect(feltChain(back)!.goals[0].status).toBe('done');
    expect(feltOf(back)!.goals.done).toContain(c.steps[0].id);
  });
  it('the biology kinds route their existing fx chain content through the felt chain, and the Next-steps goal line waits', () => {
    for (const k of ['pandemic', 'bioweapon', 'zombies', 'livestock_plague', 'crop_blight'] as FeltKind[]) {
      expect(isFxChain(k), k).toBe(true);
      const g = at(k, 2);
      const fh = feltChain(g)!; expect(fh, k).toBeTruthy();
      expect(fh.goals[0].title.length).toBeGreaterThan(5);
      expect(suggestions(g, 20).some(x => x.id.startsWith('goal_')), k).toBe(false);
    }
    const g = at('pandemic', 2); expect(feltChain(g)!.done).toBe(0);
    g.clock.t = g.disaster.hitAt + 200; expect(suggestions(g, 20).some(x => x.id.startsWith('goal_'))).toBe(true);
  });
  it('a 365-day run of the goal step stays fast', () => {
    const g = at('mega_quake', 0); const t0 = performance.now();
    for (let d = 0; d < 365; d++) { g.clock.t = g.disaster.hitAt + d; feltGoals(g, ctx(g), feltSpec('mega_quake')!); feltChain(g); }
    expect(performance.now() - t0).toBeLessThan(2000);
  });
});
