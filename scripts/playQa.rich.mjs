import { playWith } from './playQa.generic.mjs';
/** Sweep 8: financially independent, rich and idle: spending guard, money sinks. */
export async function play(A) {
  const { note, click, issue } = A;
  const policy = { stance: c => c.pendKind === 'arrival' || c.pendKind === 'refugees' ? [/^Take them in/, /^Open the house/] : [/^Open the house/, /^Defend/, /^Parley/, /^Warn off/], shotGate: r => r <= 1 };
  let dia = 0;
  await playWith(A, {
    continues: 0, name: 'rich', policy, winterAt: 330, logEvery: 60,
    wizard: { region: 'Pacific Northwest', difficulty: 'Cozy', lotPick: 'priciest', mode: 'Scenario', scenario: { kind: 'grid_down', peace: '18 months' }, extra: { lifestyle: 'Financially independent' } },
    stake: [['lodge', 0, 3], ['stone_house', 12, 4], ['guest_house', -12, 6], ['solar_farm', -20, -4], ['battery_bank', -14, -8], ['reservoir', 18, -12], ['greenhouse_heated', -6, 12], ['orchard_grove', -22, 10], ['helipad', 24, 0], ['marina', 26, 8], ['equipment_yard', 8, -14], ['metal_garage', 14, -8]],
    each: async (s) => { if (await click(/^Do it anyway$/)) { dia++; if (dia < 4) note('spend guard "Do it anyway" clicked at $' + s.money); } if (s.money < 0) issue('negative money ' + s.money + ' at day ' + s.day); },
    phases: [
      { name: 'peace', until: s => s.day >= (s.warn ?? 540), shot: 'warning' },
      { name: 'hit', until: s => s.day > (s.hit ?? 99999) + 25, step: 3, shot: 'after-hit' },
      { name: 'year-after', until: s => s.day > (s.hit ?? 0) + 380, shot: 'year-after', step: 7 },
    ],
  });
}
