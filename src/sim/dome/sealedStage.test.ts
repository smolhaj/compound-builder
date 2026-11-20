import { describe, expect, it } from 'vitest';
import { newGame } from '../state';
import type { EncounterKind, Encounter } from '../encounters';
import { stageRaid } from '../raidCutscene';
import { place } from '../raidTestKit';
import { domesOf } from './standing';
import { homeUnderSealedDome } from './sealed';

const enc = (kind: EncounterKind, o: Partial<Encounter> = {}): Encounter => ({ id: 'e1', kind, day: 5, title: 'A crew', dossier: [], size: 8, armed: true, strength: 100, wants: { canned: 5, fuel: 2 }, stances: ['hide', 'parley', 'defend'], temper: 'hard', ...o });
const home = (tier: string, seed: number) => {
  const g = place(3, 'hardcore', 'armed'); g.seed = seed; void newGame;
  g.structures.push({ id: 'dm', kind: tier, x: 0, z: 0, rot: 0, stage: 99, done: 0, supplied: true, finishedAt: 0 });
  g.perimeter = [];
  g.gate.pending = enc('gang');
  return g;
};

describe('a staged raid on a sealed dome (the arcology)', () => {
  it('leaves nobody hurt on the drive and nothing to decide about, and flags the last fight sealed', () => {
    let fights = 0;
    for (let seed = 1; seed <= 8; seed++) {
      const g = home('dome_arcology', seed);
      expect(domesOf(g).length).toBe(1);
      expect(homeUnderSealedDome(g)).toBe(true);
      const st = stageRaid(g, 'defend');
      const last = st.battles[st.battles.length - 1];
      if (st.plan.scenes[st.plan.scenes.length - 1].kind !== 'assault') continue;   // (a crew that only talks at the gate)
      fights++;
      expect(last.sealed).toBe(true);
      expect(st.staged.gate.aftermath ?? null).toBeNull();
      expect(st.report.raidersWounded).toBe(0); expect(st.report.raidersDead).toBe(0); expect(st.report.aftermath).toBe(false);
      for (const e of last.events) expect(['shot', 'wound', 'death', 'surrender', 'taken']).not.toContain(e.kind);
    }
    expect(fights).toBeGreaterThan(2);
  });
  it('a glass dome is not sealed', () => {
    const g = home('dome_glass', 2);
    expect(homeUnderSealedDome(g)).toBe(false);
  });
});
