import { playWith } from './playQa.generic.mjs';
/** Sweep: farmstead. */
export async function play(A) {
  const open = [/^Open the house/, /^Take them in/, /^Build them a place/, /^A month/, /^Trade/, /^Parley/];
  const policy = { stance: c => (c.pendKind === 'trader' ? [/^Trade/, /^Parley/] : [/^Open the house/, /^Take them in/, /^Defend/, /^Warn off/]), shotGate: r => r <= 2 };
  await playWith(A, {
    continues: 2, continueDays: 365, name: 'farmstead', policy, winterAt: 330, logEvery: 90,
    wizard: { region: 'Midwest', difficulty: 'Standard', lotPick: 'first', mode: 'Scenario', scenario: { kind: 'grid_down', peace: '18 months' }, kin: 0, extra: {} },
    stake: [['timber_cabin',0,3],['garden',-5,6],['field',-11,-6],['orchard',-16,6],['greenhouse',-6,12],['barnyard',10,-6],['chicken_coop',8,-4],['sheep_barn',14,-10],['apiary',-14,-4],['root_cellar',6,6],['well_hand',5,3],['outhouse',-4,-3],['wood_oven',3,8]],
    phases: [
      { name: 'peace', until: s => s.day >= (s.warn ?? 540), shot: 'warning' },
      { name: 'hit', until: s => s.day > (s.hit ?? 99999) + 25, step: 3, shot: 'after-hit' },
      { name: 'year-after', until: s => s.day > (s.hit ?? 0) + 380, shot: 'year-after', step: 7 },
    ],
  });
}
