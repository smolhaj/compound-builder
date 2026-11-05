import { playWith } from './playQa.generic.mjs';
/** Sweep: clan. */
export async function play(A) {
  const open = [/^Open the house/, /^Take them in/, /^Build them a place/, /^A month/, /^Trade/, /^Parley/];
  const policy = { stance: c => (open), shotGate: r => r <= 2 };
  await playWith(A, {
    continues: 3, continueDays: 365, name: 'clan', policy, winterAt: 330, logEvery: 90,
    wizard: { region: 'Appalachia', difficulty: 'Standard', lotPick: 'first', mode: 'Scenario', scenario: { kind: 'grid_down', peace: '18 months' }, kin: 3, extra: {} },
    stake: [['timber_cabin',0,3],['guest_house',8,4],['travel_trailer',-8,6],['rv_camper',-10,-2],['modular_home',12,-6],['trailer',-12,10],['garden',-5,6],['field',-11,-6],['outhouse',-4,-3],['well_hand',5,3],['root_cellar',6,6]],
    phases: [
      { name: 'peace', until: s => s.day >= (s.warn ?? 540), shot: 'warning' },
      { name: 'hit', until: s => s.day > (s.hit ?? 99999) + 25, step: 3, shot: 'after-hit' },
      { name: 'year-after', until: s => s.day > (s.hit ?? 0) + 380, shot: 'year-after', step: 7 },
    ],
  });
}
