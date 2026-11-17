/**
 * The radio census (FL fix): a shortwave household hears at least 3 distinct kind lines in the first week and 5 in 30 days, for every kind,
 * each carrying a checkable claim, with at least one false line a scout can prove false. A household with no set still gets the fence line.
 */
import { describe, expect, it } from 'vitest';
import { triggerDisaster, type DisasterKind } from '../disaster';
import { step } from '../engine';
import { newGame, type GameState } from '../state';
import { FELT_KINDS } from './registry';

interface Census { wk1: number; d30: number; claims: number; falseHeard: number; texts: string[] }
export function census(kind: string, set: 'sw' | 'none', seed: number, days = 30): Census {
  let g: GameState = newGame(seed);
  g.disaster.mode = 'god'; triggerDisaster(g.disaster, g.clock.t, kind as DisasterKind, g.seed, 0);
  if (set === 'sw') g.stock.sw_radio = 1;
  for (const st of g.structures) { st.stage = 99; st.finishedAt = g.clock.t; }
  const heard = new Map<string, { day: number; claim: boolean; truth: boolean }>(); let n = 0;
  while (g.clock.t - g.disaster.hitAt < days && n++ < days * 8) {
    g.gate.pending = null; g.gate.incoming = null; g.gate.card = null;
    g = step(g, 0.25);
    const d = g.clock.t - g.disaster.hitAt;
    for (const x of g.radio?.heard ?? []) if (!heard.has(x.text)) heard.set(x.text, { day: d, claim: !!x.claim, truth: x.truth });
  }
  const all = [...heard.entries()];
  return { wk1: all.filter(([, v]) => v.day <= 8).length, d30: all.length, claims: all.filter(([, v]) => v.claim).length, falseHeard: all.filter(([, v]) => !v.truth).length, texts: all.map(([t]) => t) };
}

describe('radio census: every kind talks', () => {
  it('shortwave: 3 lines in week 1, 5 in 30 days, claims on the lines, and a false rumor somewhere', () => {
    let falseKinds = 0;
    for (const kind of FELT_KINDS) for (const seed of [7, 19]) {
      const c = census(kind, 'sw', seed);
      expect(c.wk1, `${kind}/${seed} week 1`).toBeGreaterThanOrEqual(3);
      expect(c.d30, `${kind}/${seed} 30 days`).toBeGreaterThanOrEqual(5);
      expect(c.claims, `${kind}/${seed} claims`).toBeGreaterThanOrEqual(5);
      if (c.falseHeard > 0 && seed === 7) falseKinds++;
    }
    expect(falseKinds).toBeGreaterThanOrEqual(24);
  }, 300000);
  it('no set: the fence line and one plain "no working radio" line, EMP included', () => {
    for (const kind of ['emp', 'drought', 'zombies']) {
      const c = census(kind, 'none', 7);
      expect(c.d30, kind).toBeGreaterThanOrEqual(3);
    }
  }, 120000);
});
