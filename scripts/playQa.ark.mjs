import { playWith } from './playQa.generic.mjs';
/** Sweep: ark. */
export async function play(A) {
  const open = [/^Open the house/, /^Take them in/, /^Build them a place/, /^A month/, /^Trade/, /^Parley/];
  const policy = { stance: c => (c.pendKind === 'trader' ? [/^Trade/, /^Parley/] : [/^Hide/, /^Parley/, /^Warn off/, /^Send them on/, /^Turn them away/]), shotGate: r => r <= 2 };
  await playWith(A, {
    continues: 0, continueDays: 365, name: 'ark', policy, winterAt: 330, logEvery: 90,
    wizard: { region: 'Mountain West', difficulty: 'Standard', lotPick: 'first', mode: 'Scenario', scenario: { kind: 'grid_down', peace: '18 months' }, kin: 0, extra: {} },
    stake: [['timber_cabin',0,3],['garden',-5,6],['outhouse',-4,-3],['root_cellar',6,6],['bunker_hatch',6,0],['bunker_stairs',8,0],['bunker_corridor',10,0],['bunker_dorm',12,4],['bunker_galley',12,-4],['bunker_stores',14,0],['bunker_plant',16,4],['bunker_medical',16,-4],['bunker_comms',18,0]],
    phases: [
      { name: 'peace', until: s => s.day >= (s.warn ?? 540), shot: 'warning' },
      { name: 'hit', until: s => s.day > (s.hit ?? 99999) + 25, step: 3, shot: 'after-hit', act: async (A2) => { await A2.page.evaluate(() => window.__cb.game.setState(s => { const g = structuredClone(s.game); g.disaster.tracks.law = 0.05; g.gate.next = Math.floor(g.clock.t) + 3; return { game: g }; })); } },
      { name: 'year-after', until: s => s.day > (s.hit ?? 0) + 380, shot: 'year-after', step: 7 },
    ],
  });
}
