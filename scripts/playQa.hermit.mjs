import { playWith } from './playQa.generic.mjs';
/** Sweep 1: Hermit. Tiny, off-grid, self-sufficient, minimal defense: say no to everyone, hide when they come. */
export async function play(A) {
  const policy = { stance: c => c.pendKind === 'arrival' || c.pendKind === 'refugees' || /kin/.test(c.pendKind ?? '') || c.pendKind === 'shelter' ? [/^Send them on/, /^Turn them away/, /^Warn off/] : c.pendKind === 'trader' ? [/^Trade/, /^Parley/] : [/^Hide/, /^Parley/, /^Warn off/, /^Pay/, /^Defend/], shotGate: r => r <= 2 };
  await playWith(A, {
    continues: 0, name: 'hermit',
    each: async (s) => { if (s.alive < (globalThis.__lastAlive ?? 99)) { globalThis.__lastAlive = s.alive; const d = await A.page.evaluate(() => { const g = window.__cb.game.getState().game; return { ending: g.ending ?? null, ppl: g.personState.map(p => ({ died: p.needs.died, left: p.needs.left, taken: p.needs.taken, h: Math.round(p.needs.health), hu: Math.round(p.needs.hunger) })), log: (g.log ?? []).slice(-6).map(l => l.text) }; }); A.note('ALIVE DROP ' + s.alive + ' day ' + s.day + ' ' + JSON.stringify(d).slice(0, 900)); } }, policy, winterAt: 330, logEvery: 90,
    wizard: { region: 'Appalachia', difficulty: 'Standard', lotPick: 'first', mode: 'Scenario', scenario: { kind: 'grid_down', peace: '18 months' } },
    stake: [['timber_cabin', 0, 3], ['garden', -5, 6], ['outhouse', -4, -3], ['well_hand', 5, 3], ['root_cellar', 6, 6], ['solar_array', -8, 2]],
    phases: [
      { name: 'peace', until: s => s.day >= (s.warn ?? 540), shot: 'warning' },
      { name: 'hit', until: s => s.day > (s.hit ?? 99999) + 25, step: 3, shot: 'after-hit' },
      { name: 'year-after', until: s => s.alive === 0 || s.day > (s.hit ?? 0) + 380, shot: 'year-after', step: 7 },
    ],
  });
}
