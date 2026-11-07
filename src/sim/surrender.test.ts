import { describe, expect, it } from 'vitest';
import { KIND_YIELD, crewKindOf, crewSurrenderOdds, crewSurrenders, downedSurrenderOdds, noWayOut, type CrewKind, type CrewSurrenderCtx } from './surrender';
import { mulberry32 } from './rng';

const beaten = (over: Partial<CrewSurrenderCtx> = {}): CrewSurrenderCtx => ({ temper: 'desperate', kind: 'looters', lossShare: 0.6, pinnedShare: 0.7, outnumbered: 1, trapped: false, leaderDown: false, ...over });
const rate = (c: CrewSurrenderCtx, n = 4000) => { const r = mulberry32(7); let k = 0; for (let i = 0; i < n; i++) if (crewSurrenders(c, r)) k++; return k / n; };

describe('a crew surrenders', () => {
  it('only when it has lost heavily and has no way out', () => {
    expect(crewSurrenderOdds(beaten({ lossShare: 0.3 }))).toBe(0);                                  // not heavy losses
    expect(crewSurrenderOdds(beaten({ pinnedShare: 0.1, outnumbered: 1, trapped: false }))).toBe(0); // it can still run
    expect(noWayOut({ trapped: true, pinnedShare: 0, outnumbered: 0 })).toBe(true);
    expect(noWayOut({ trapped: false, pinnedShare: 0.6, outnumbered: 0 })).toBe(true);
    expect(noWayOut({ trapped: false, pinnedShare: 0, outnumbered: 2.5 })).toBe(true);
    expect(crewSurrenderOdds(beaten())).toBeGreaterThan(0.2);
  });
  it('a savage crew almost never does: not under normal conditions, only a last stand at 4 in 100', () => {
    for (const lossShare of [0.4, 0.6, 0.79]) for (const pinned of [0.6, 0.9, 1]) for (const trapped of [false, true]) for (const kind of ['gang', 'looters', 'militia', 'refugees', 'horde'] as CrewKind[]) {
      expect(crewSurrenderOdds(beaten({ temper: 'savage', kind, lossShare, pinnedShare: pinned, trapped }))).toBe(0);
    }
    const lastStand = crewSurrenderOdds(beaten({ temper: 'savage', kind: 'gang', lossShare: 0.9, pinnedShare: 1, trapped: true }));
    expect(lastStand).toBeGreaterThan(0); expect(lastStand).toBeLessThanOrEqual(0.04);
    expect(rate(beaten({ temper: 'savage', kind: 'gang', lossShare: 0.6 }))).toBe(0);
  });
  it('the dead do not surrender', () => {
    expect(crewSurrenderOdds(beaten({ kind: 'horde', lossShare: 1, trapped: true, pinnedShare: 1 }))).toBe(0);
    expect(downedSurrenderOdds('desperate', 'horde', 10)).toBe(0);
  });
  it('desperate crews give up often, hard ones rarely, and by kind', () => {
    const d = rate(beaten({ temper: 'desperate', kind: 'looters', trapped: true })), h = rate(beaten({ temper: 'hard', kind: 'looters', trapped: true }));
    expect(d).toBeGreaterThan(0.35); expect(h).toBeLessThan(d / 2); expect(h).toBeGreaterThan(0);
    const odds = (kind: CrewKind) => crewSurrenderOdds(beaten({ temper: 'hard', kind, trapped: true }));
    expect(odds('patrol')).toBeGreaterThan(odds('militia'));       // (a patrol yields sooner than a militia when outgunned)
    expect(odds('militia')).toBeGreaterThan(odds('gang'));         // a gang does not give up to a family
    expect(odds('requisition')).toBeGreaterThan(odds('gang'));
    expect(crewSurrenderOdds(beaten({ temper: 'desperate', kind: 'refugees', trapped: true }))).toBeGreaterThan(crewSurrenderOdds(beaten({ temper: 'desperate', kind: 'looters', trapped: true })));
    expect(KIND_YIELD.gang).toBeLessThan(KIND_YIELD.looters);
  });
  it('a fallen leader and a trap make it likelier; the odds never pass 0.9', () => {
    const base = crewSurrenderOdds(beaten({ kind: 'militia', temper: 'hard', lossShare: 0.5 }));
    expect(crewSurrenderOdds(beaten({ kind: 'militia', temper: 'hard', lossShare: 0.5, leaderDown: true }))).toBeGreaterThan(base);
    expect(crewSurrenderOdds(beaten({ kind: 'militia', temper: 'hard', lossShare: 0.5, trapped: true }))).toBeGreaterThan(base);
    expect(crewSurrenderOdds(beaten({ kind: 'refugees', trapped: true, leaderDown: true, lossShare: 1 }))).toBeLessThanOrEqual(0.9);
  });
  it('a hurt man who cannot run: hands up for the desperate, rarely the hard, never the savage; a bad wound lies down', () => {
    expect(downedSurrenderOdds('savage', 'gang', 20)).toBe(0);
    expect(downedSurrenderOdds('desperate', 'looters', 30)).toBeGreaterThan(downedSurrenderOdds('hard', 'looters', 30));
    expect(downedSurrenderOdds('desperate', 'looters', 90)).toBeLessThan(downedSurrenderOdds('desperate', 'looters', 30));
    expect(downedSurrenderOdds('hard', 'gang', 30)).toBeLessThan(downedSurrenderOdds('hard', 'patrol', 30));
  });
  it('maps an encounter kind to a crew kind', () => {
    expect(crewKindOf('militia')).toBe('militia'); expect(crewKindOf('trader')).toBe('other'); expect(crewKindOf(undefined)).toBe('other');
  });
});
