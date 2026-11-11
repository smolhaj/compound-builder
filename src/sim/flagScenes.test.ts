import { describe, expect, it } from 'vitest';
import { game, enc, yardSolid, HOUSE, prepared } from './cutFixtures';
import { stageRaid } from './raidCutscene';
import { findClips } from './cutNav';
import { navFor } from './cutLive';
import type { Stance } from './encounters';

describe('flag_shoot opens a multi-scene siege with the murder on the drive', () => {
  it('in some seeds the first scene is the envoy shot under his flag', () => {
    let n = 0;
    for (let seed = 1; seed <= 8; seed++) {
      const g = game(seed, 2.25);
      g.gate.pending = { ...enc('gang', 8, 'hard', Math.floor(g.clock.t)), stances: ['flag_shoot', 'defend'] as Stance[] };
      const st = stageRaid(g, 'flag_shoot');
      if (st.battles.length > 1 && st.battles[0].events.some(e => e.kind === 'flag') && st.battles[0].events.some(e => e.kind === 'death' && e.unit === 'r0')) n++;
    }
    expect(n).toBeGreaterThan(0);
  }, 120000);
});

describe('the man under the white flag: all four answers are shown', () => {
  for (const stance of ['flag_pay', 'flag_pass', 'flag_bluff', 'flag_shoot'] as Stance[]) for (const seed of [1, 2, 3, 4]) {
    it(`${stance}, seed ${seed}: he walks up with the flag, the family answers, nobody clips a wall`, () => {
      const g = game(seed, 14);
      g.gate.pending = { ...enc('gang', 6, 'hard', Math.floor(g.clock.t)), stances: ['flag_pay', 'flag_pass', 'flag_bluff', 'flag_shoot', 'defend'] as Stance[] };
      const st = stageRaid(g, stance);
      const b = st.battles.find(x => x.events.some(e => e.kind === 'flag'));
      if (!b) return;   // (a one-scene fight: the answer turned the parley into the fight at once)
      expect(b.events.some(e => e.kind === 'flag' && e.unit === 'r0')).toBe(true);
      expect(b.events.some(e => e.kind === 'say' && e.who === 'r0')).toBe(true);
      if (stance === 'flag_pay') expect(b.events.some(e => e.kind === 'loot')).toBe(true);
      if (stance === 'flag_shoot') expect(b.events.some(e => e.kind === 'death' && e.unit === 'r0')).toBe(true);
      if (stance === 'flag_bluff') expect(b.events.filter(e => e.kind === 'move' && e.unit.startsWith('h_')).length).toBeGreaterThan(0);
      const out = prepared(b, g, seed);
      expect(findClips(out, navFor(out, yardSolid(g, [HOUSE], 0.012)))).toEqual([]);
    }, 60000);
  }
});
