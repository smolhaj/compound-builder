/** Stage each kind of threat at the gate and answer it with every stance through the real buttons: each must clear. */
export async function play(A) {
  const { page, st, note, issue, wizard, handleGate, shot } = A;
  await wizard({ region: 'Appalachia', difficulty: 'Standard', lotPick: 'first', mode: 'Scenario', scenario: { kind: 'grid_down', peace: '18 months' } });
  await page.evaluate(() => window.__cb.game.getState().advance(560));
  const labels = { hide: /^Hide/, parley: /^Parley/, trade: /^Trade/, warn: /^Warn off/, defend: /^Defend/, pay: /^Pay/, refuse: /^Refuse/, take_in: /^Take them in/, turn_away: /^Turn them away/, trial: /^A month/ };
  const specs = [
    ['refugees', ['hide', 'parley', 'trade', 'warn'], 6, false],
    ['looters', ['hide', 'parley', 'warn', 'defend'], 5, true],
    ['gang', ['hide', 'parley', 'warn', 'defend', 'pay'], 9, true],
    ['trader', ['trade', 'parley', 'warn'], 2, false],
    ['requisition', ['parley', 'refuse', 'defend', 'pay'], 5, true],
  ];
  let n = 0;
  for (const [kind, stances, size, armed] of specs) for (const stance of stances) {
    n++;
    const staged = await page.evaluate(([kind, stances, size, armed, n]) => {
      window.__cb.game.setState(s => { const g = structuredClone(s.game); g.clock.speed = 0; g.gate.pending = { id: 'qa' + n, kind, day: Math.floor(g.clock.t), title: 'QA ' + kind, dossier: ['QA staged.'], size, armed, strength: size * 3, wants: { canned: 2 }, stances }; return { game: g, cutscene: null }; });
      window.__cb.game.getState().advance(0.001);
      return !!window.__cb.game.getState().game.gate.pending;
    }, [kind, stances, size, armed, n]);
    if (!staged) { issue(`gates: could not stage ${kind}`); continue; }
    const before = await st();
    const t0 = Date.now();
    await handleGate({ ...before, pendKind: kind }, { stance: () => [labels[stance]], shotGate: () => false });
    const after = await st();
    const cleared = !after.pending && !after.cutscene && !after.aftermath && !after.card;
    note(`gate ${kind}/${stance}: cleared=${cleared} in ${Math.round((Date.now() - t0) / 1000)}s alive ${after.alive} speed ${after.speed}`);
    if (!cleared) { issue(`gate ${kind} answered with ${stance} did not clear: pending=${after.pending} cutscene=${after.cutscene} aftermath=${after.aftermath} card=${after.card}`); await shot(`stuck-${kind}-${stance}`); await page.evaluate(() => window.__cb.game.setState(s => { const g = structuredClone(s.game); g.gate.pending = null; g.gate.card = null; g.gate.aftermath = null; return { game: g, cutscene: null }; })); }
  }
}
