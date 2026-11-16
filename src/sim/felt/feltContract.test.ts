import { describe, expect, it } from 'vitest';
import { DISASTERS, type DisasterKind } from '../disaster';
import { FX } from '../disasterFx';
import { FELT, FELT_KINDS, feltSpec } from './registry';
import { PLANNED_KINDS } from './types';
import { emptyFelt, ensureFelt, feltCardPending, feltOf, feltPhase, hitMomentUp } from './state';
import { feltDaily } from './daily';
import { triggerChoices, untriggerable } from './triggerMenu';
import { newGame } from '../state';
import { triggerDisaster } from '../disaster';
import { decisionOpen, resumeSpeed } from '../clockResume';

const fresh = () => newGame(7);

describe('felt registry', () => {
  it('has a spec for every kind in the DisasterKind union (via FX) and every planned kind', () => {
    for (const k of Object.keys(FX)) expect(feltSpec(k), k).not.toBeNull();
    for (const k of PLANNED_KINDS) expect(feltSpec(k), k).not.toBeNull();
    expect(FELT_KINDS.length).toBe(Object.keys(FX).length + PLANNED_KINDS.length);
  });
  it('every member is optional: a stub spec is a valid spec', () => {
    for (const k of FELT_KINDS) expect(typeof FELT[k]).toBe('object');
  });
  it('an unknown kind has no spec', () => { expect(feltSpec('nope')).toBeNull(); expect(feltSpec(null)).toBeNull(); });
});

describe('felt state', () => {
  it('is never made by reading, only by ensureFelt', () => {
    const g = fresh();
    expect(feltOf(g)).toBeUndefined();
    expect(feltCardPending(g)).toBe(false);
    ensureFelt(g);
    expect(feltOf(g)).toEqual(emptyFelt());
  });
  it('round-trips through JSON (the save)', () => {
    const g = fresh();
    const f = ensureFelt(g);
    f.cards.pending = { id: 'c', since: 3 }; f.cards.done.x = 'a'; f.goals.done.push('s1');
    const back = JSON.parse(JSON.stringify(g.disaster)) as typeof g.disaster;
    expect(feltOf({ disaster: back })).toEqual(f);
  });
  it('an old save with no fx.felt reads as empty', () => { const g = fresh(); delete g.disaster.fx; expect(feltOf(g)).toBeUndefined(); });
  it('phases follow the warning and the days since the hit', () => {
    const g = fresh();
    triggerDisaster(g.disaster, g.clock.t, 'grid_down', g.seed, 10);
    expect(feltPhase(g)).toBe('warning');
    for (const [d, p] of [[0, 'hit'], [7, 'hit'], [8, 'month'], [35, 'month'], [36, 'season'], [120, 'season'], [121, 'year']] as const) {
      g.clock.t = g.disaster.hitAt + d; expect(feltPhase(g), `day ${d}`).toBe(p);
    }
  });
  it('the hit moment waits for a day card, a kind with a hit sequence and no skip', () => {
    expect(hitMomentUp(5, -1, false, true)).toBe(true);
    expect(hitMomentUp(null, -1, false, true)).toBe(false);
    expect(hitMomentUp(5, 5, false, true)).toBe(false);
    expect(hitMomentUp(5, -1, true, true)).toBe(false);
    expect(hitMomentUp(5, -1, false, false)).toBe(false);
  });
});

describe('felt daily dispatcher', () => {
  it('is the identity for stub specs, before the hit and with no disaster, and never makes fx.felt', () => {
    const g = fresh();
    const ctx = { day: 0, r: () => 0.5, once: () => true };
    expect(feltDaily(g, ctx)).toEqual([]);
    for (const k of Object.keys(DISASTERS) as DisasterKind[]) {
      const h = fresh(); triggerDisaster(h.disaster, h.clock.t, k, h.seed, 0); h.clock.t += 1;
      // FL4: decision cards come from the generic library now, so a hit day may raise one; the other steps stay silent for a stub
      expect(feltDaily(h, ctx).filter(l => !l.startsWith('Decision:')), k).toEqual([]);
    }
  });
});

describe('clock: a pending felt card holds it like a gate card', () => {
  it('decisionOpen is true while a felt card is pending, and the speed comes back after', () => {
    const g = fresh();
    expect(decisionOpen(g, null)).toBe(false);
    ensureFelt(g).cards.pending = { id: 'c', since: 1 };
    expect(decisionOpen(g, null)).toBe(true);
    expect(resumeSpeed(2, 0, decisionOpen(g, null))).toBeNull();
    delete ensureFelt(g).cards.pending;
    expect(decisionOpen(g, null)).toBe(false);
    expect(resumeSpeed(2, 0, decisionOpen(g, null))).toBe(2);
  });
});

describe('Free build / God Mode trigger menu', () => {
  it('lists every defined kind once, each with its variants', () => {
    const c = triggerChoices();
    expect(c.map(x => x.kind).sort()).toEqual((Object.keys(DISASTERS) as DisasterKind[]).sort());
    for (const x of c) expect(x.variants.length, x.kind).toBeGreaterThan(0);
  });
  it('every kind and variant can be triggered and lands on that variant', () => {
    for (const c of triggerChoices()) for (const v of c.variants) {
      const g = fresh(); triggerDisaster(g.disaster, g.clock.t, c.kind, g.seed, 7, v.id);
      expect(g.disaster.kind).toBe(c.kind); expect(g.disaster.variant, `${c.kind}/${v.id}`).toBe(v.id);
    }
  });
  it('the planned kinds join the menu when WP10 gives them a definition (until then they are listed here)', () => {
    expect(untriggerable().sort()).toEqual([...PLANNED_KINDS].sort());
  });
});
