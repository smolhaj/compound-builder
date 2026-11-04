import { playWith } from './playQa.generic.mjs';
export async function play(A) {
  const policy = { stance: c => c.pendKind === 'arrival' || c.pendKind === 'refugees' || /kin|relative/.test(c.pendKind ?? '') ? [/^Take them in/, /^Build them a place/, /^A month/] : c.pendKind === 'trader' ? [/^Trade/] : [/^Open the house/, /^Defend/, /^Warn off/, /^Take them in/, /^Parley/], shotGate: r => r <= 1 };
  await playWith(A, {
    continues: 6, continueDays: 365 * 3, continueStep: 14,
    name: 'family', policy, winterAt: 340, logEvery: 120,
    wizard: { region: 'Appalachia', difficulty: 'Cozy', lotPick: 'first', mode: 'Surprise', kin: 3 },
    stake: [['timber_cabin', 0, 3], ['guest_house', 8, 4], ['garden', -5, 6], ['field', -11, -6], ['root_cellar', 6, 6], ['chicken_coop', 8, -4], ['outhouse', -4, -3]],
    phases: [
      { name: 'y1', until: s => s.day >= 365, shot: 'y1' },
      { name: 'y3', until: s => s.day >= 365 * 3, shot: 'y3' },
      { name: 'to-hit', until: s => s.day > (s.hit ?? 99999) + 5 || s.day > 2600, shot: 'hit', step: 5 },
      { name: 'after', until: s => s.day > (s.hit ?? 0) + 365 * 6, shot: 'after-6y', step: 14 },
    ],
  });
}
