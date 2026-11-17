/** WP4 + WP7 through the real engine: each kind runs from the warning into the aftermath, and is felt (log, prices, radio, cards). */
import { describe, it, expect } from 'vitest';
import { newGame } from './state';
import { step } from './engine';
import { suggestions } from './guidance';
import type { DisasterKind } from './disaster';
import { fxPriceMod } from './disasterFx';
import { zombiesOf } from './walkers';
import { outbreakOf } from './outbreak';
import { feltChain } from './felt/goalLib';
import { FX_CHAIN_DAYS } from './felt/goalWindow';

const run = (kind: DisasterKind, variant: string, days: number, seed = 3) => {
  let g = newGame(seed, 105, 2027, { mode: 'scenario', peace: 'short', kind, variant });
  g = step(g, g.disaster.hitAt - g.clock.t + 1);
  g = step(g, days);
  return g;
};

describe('through the engine', () => {
  it('zombies: a month in, the crowd, the night reports and the radio are real', () => {
    const g = run('zombies', 'outbreak', 30);
    const z = zombiesOf(g);
    expect(z.nights).toBeGreaterThanOrEqual(25);
    expect(g.log.some(l => /Walkers at the wall/.test(l.text ?? String(l)))).toBe(true);
    expect(g.disaster.news.length).toBeGreaterThan(0);
    expect(suggestions(g, 20).some(c => c.id === 'zb_policy' || c.id === 'zb_dark')).toBe(true);
  });
  it('pandemic and bioweapon: the wave runs, prices rise, the seal card is on the board', { timeout: 120000 }, () => {
    for (const [k, v] of [['pandemic', 'flu_1918'], ['bioweapon', 'hemorrhagic']] as Array<[DisasterKind, string]>) {
      const g = run(k, v, 8);
      expect(outbreakOf(g).v).toBe(v);
      expect(fxPriceMod(g)).toBeGreaterThan(1);
      expect(suggestions(g, 20).some(c => c.id === 'ob_seal')).toBe(true);
    }
  });
  it('crop blight and the livestock plague: the goal chain is the felt chain through the window, then the Next-steps card carries it', () => {
    // inside the window the felt goal chain owns the goal (the Next-steps line waits: felt/feltGoals.test.ts); after it the card returns
    for (const [k, v, id] of [['crop_blight', 'rust', 'goal_blight'], ['livestock_plague', 'hpai', 'goal_livestock']] as Array<[DisasterKind, string, string]>) {
      const early = run(k, v, 20);
      expect(feltChain(early)?.goals.length, k).toBeGreaterThan(0);
      expect(suggestions(early, 20).some(c => c.id === id), k).toBe(false);
      const late = run(k, v, FX_CHAIN_DAYS + 4);
      expect(suggestions(late, 20).some(c => c.id === id), k).toBe(true);
    }
  });
});
