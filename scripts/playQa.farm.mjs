import { playWith } from './playQa.generic.mjs';
export async function play(A) {
  const policy = { stance: c => c.pendKind === 'arrival' || c.pendKind === 'refugees' ? [/^A month/, /^Turn them away/] : c.pendKind === 'trader' ? [/^Trade/] : [/^Open the house/, /^Defend/, /^Warn off/, /^Parley/], shotGate: r => r <= 1 };
  await playWith(A, {
    name: 'farm', policy, winterAt: 330, logEvery: 45,
    wizard: { region: 'Appalachia', difficulty: 'Standard', lotPick: 'first', mode: 'Scenario', scenario: { kind: 'grid_down', peace: '18 months' } },
    stake: [['timber_cabin', 0, 3], ['garden', -5, 6], ['field', -11, -6], ['field', 11, -8], ['greenhouse', -8, 10], ['orchard', 10, 10], ['chicken_coop', 8, -4], ['barnyard', -12, 2], ['root_cellar', 6, 6], ['outhouse', -4, -3], ['apiary', 14, 4]],
    phases: [
      
      
      { name: 'to-warning', until: s => (s.warn != null && s.day >= s.warn) || s.day > 2300, shot: 'warning' },
      { name: 'hit', until: s => s.day > (s.hit ?? 99999) + 30, step: 3, shot: 'after-hit' },
      { name: 'year-after', until: s => s.day > (s.hit ?? 0) + 400, shot: 'a-year-after' },
    ],
  });
}
