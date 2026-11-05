import { playWith } from './playQa.generic.mjs';
/** Sweep: badstart. */
export async function play(A) {
  const open = [/^Open the house/, /^Take them in/, /^Build them a place/, /^A month/, /^Trade/, /^Parley/];
  const policy = { stance: c => (c.pendKind === 'arrival' || c.pendKind === 'refugees' ? [/^Send them on/, /^Turn them away/, /^Warn off/] : [/^Hide/, /^Parley/, /^Pay/, /^Warn off/, /^Defend/]), shotGate: r => r <= 2 };
  await playWith(A, {
    continues: 0, continueDays: 365, name: 'badstart', policy, winterAt: 330, logEvery: 90,
    wizard: { region: 'Desert Southwest', difficulty: 'Hardcore', lotPick: 'poorest', mode: 'Scenario', scenario: { kind: 'grid_down', peace: '18 months' }, kin: 0, extra: { wish: ["Dry (cheaper)"], maxPrice: 1e9 } },
    stake: [['timber_cabin',0,3],['outhouse',-4,-3]],
    phases: [
      { name: 'peace', until: s => s.day >= (s.warn ?? 540), shot: 'warning' },
      { name: 'hit', until: s => s.day > (s.hit ?? 99999) + 25, step: 3, shot: 'after-hit' },
      { name: 'year-after', until: s => s.day > (s.hit ?? 0) + 380, shot: 'year-after', step: 7 },
    ],
  });
}
