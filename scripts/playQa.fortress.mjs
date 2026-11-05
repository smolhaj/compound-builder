import { playWith } from './playQa.generic.mjs';
export async function play(A) {
  const { page, note, issue } = A;
  const policy = { stance: c => c.pendKind === 'arrival' || c.pendKind === 'refugees' ? [/^Send them on/, /^Turn them away/, /^Warn off/] : c.pendKind === 'trader' ? [/^Trade/, /^Parley/] : [/^Defend/, /^Hold/, /^Warn off/, /^Open the house/, /^Parley/], shotGate: r => r <= 3 };
  const fortify = async () => {
    const r = await page.evaluate(() => {
      const cb = window.__cb, G = cb.game, geo = cb.store.getState().siteGeo ?? {}, out = {};
      try { out.fortify = G.getState().fortifyRing(geo, { scope: 'core', shape: 'irregular', wall: 'stone_wall', towers: 3, towerKind: 'watchtower_wood', passage: false, rings: 1 }); } catch (e) { out.err = String(e.stack ?? e).slice(0, 300); }
      const c = cb.world.camp;
      for (const [kind, pts] of [['moat', [[c.x - 16, c.z + 16], [c.x + 16, c.z + 16]]], ['covered_bridge', [[c.x - 2, c.z + 16], [c.x + 2, c.z + 16]]], ['escape_tunnel', [[c.x, c.z + 2], [c.x - 20, c.z - 22]]]]) {
        const before = G.getState().game.perimeter.length;
        try { cb.fence.setKind(kind); for (const p of pts) cb.fence.addPoint(p[0], p[1]); cb.fence.finish(); cb.fence.setKind(null); } catch (e) { out[kind + 'Err'] = String(e).slice(0, 200); }
        out[kind] = G.getState().game.perimeter.length - before; out[kind + 'Problem'] = G.getState().toolProblem;
      }
      return out;
    });
    note('defense ' + JSON.stringify(r));
  };
  // QA lever: the law track drops after the hit so raids come (what a long collapse does)
  const lawless = async () => { await page.evaluate(() => window.__cb.game.setState(s => { const g = structuredClone(s.game); g.disaster.tracks.law = 0.05; g.gate.next = Math.floor(g.clock.t) + 3; return { game: g }; })); note('law track set to 0.05'); };
  await playWith(A, {
    continues: 0,
    name: 'fortress', policy, winterAt: 330, logEvery: 60,
    wizard: { region: 'Mountain West', difficulty: 'Standard', lotPick: 'first', mode: 'Scenario', scenario: { kind: 'grid_down', peace: '18 months' } },
    stake: [['timber_cabin', 0, 3], ['garden', -5, 6], ['root_cellar', 6, 6], ['chicken_coop', 8, -4], ['outhouse', -4, -3]],
    phases: [
      { name: 'build', until: s => s.day >= 150, shot: 'built-150' },
      { name: 'defend', until: s => s.day >= 160, act: fortify, shot: 'defenses-planned' },
      { name: 'peace', until: s => s.day >= (s.warn ?? 519), shot: 'warning', act: lawless },
      { name: 'hit', until: s => s.day > (s.hit ?? 99999) + 25, step: 3, shot: 'after-hit', act: lawless },
      { name: 'year-after', until: s => s.day > (s.hit ?? 0) + 380, shot: 'years-later', step: 7 },
    ],
  });
}
