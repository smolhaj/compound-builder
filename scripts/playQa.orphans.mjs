/** All adults die with kids: fostering, nobody-home, no gate cards, heir at 18 (long run); then a total wipe. */
export async function play(A) {
  const { page, st, shot, note, issue, wizard, handleGate, scanText, frameCamp } = A;
  await wizard({ region: 'Appalachia', difficulty: 'Standard', lotPick: 'first', mode: 'Scenario', scenario: { kind: 'grid_down', peace: '18 months' } });
  await page.evaluate(() => window.__cb.game.getState().advance(200));
  const setup = await page.evaluate(() => {
    window.__cb.game.setState(s => { const g = structuredClone(s.game); const day = Math.floor(g.clock.t);
      g.people.forEach((p, i) => { if (i < 2) { p.kid = true; p.age = i === 0 ? 14 : 8; delete p.job; } else { g.personState[i].needs.died = day; } });
      g.clock.speed = 0; return { game: g, cutscene: null }; });
    return window.__cb.game.getState().game.people.map(p => `${p.first}:${p.age}:${p.kid}`);
  });
  note('setup ' + setup.join(','));
  await frameCamp(); await shot('before-orphaning');
  const info = () => page.evaluate(() => { const g = window.__cb.game.getState().game; return { day: Math.floor(g.clock.t), people: g.people.length, alive: g.personState.filter(p => p.needs.died == null).length, wards: (g.lineage.wards ?? []).map(w => w.person.first + ':' + w.person.age), pending: g.gate.pending?.kind ?? null, card: !!g.gate.card, ending: g.ending?.kind ?? null, money: Math.round(g.money), era: g.lineage.era }; });
  const cardsSeen = new Set();
  let shotNobody = false, shotHome = false, prevWards = -1;
  for (let i = 0; i < 90; i++) {
    await page.evaluate(() => window.__cb.game.getState().advance(30));
    let s = await info();
    if (s.pending || s.card) { cardsSeen.add(s.pending ?? 'card'); if (s.wards.length) issue(`gate card while nobody home: ${s.pending ?? 'card'} day ${s.day}`); }
    if (s.pending || s.card || (await st()).cutscene || (await st()).aftermath) await handleGate(await st(), { stance: () => [/^Hide/, /^Turn them away/, /^Parley/], shotGate: () => false });
    if (i % 6 === 0 || s.wards.length !== prevWards) note('i' + i + ' ' + JSON.stringify(s));
    if (s.wards.length && !shotNobody) { shotNobody = true; await shot('nobody-home'); note('HUD nobody home: ' + (await page.evaluate(() => document.body.innerText)).replace(/\n+/g, ' | ').slice(0, 700)); await scanText('nobody-home'); }
    if (prevWards > 0 && s.wards.length === 0 && !shotHome) { shotHome = true; await frameCamp(); await shot('heir-home'); note('HEIR HOME ' + JSON.stringify(s)); note('HUD heir: ' + (await page.evaluate(() => document.body.innerText)).replace(/\n+/g, ' | ').slice(0, 600)); }
    prevWards = s.wards.length;
    if (s.ending) { note('ENDING ' + s.ending); await shot('ending'); break; }
    if (shotHome && s.day > 0 && i > 20) { const t = await info(); if (t.alive > 0) break; }
  }
  note('cards seen ' + [...cardsSeen].join(',')); const fin = await info(); note('final ' + JSON.stringify(fin));
  const log = await page.evaluate(() => (window.__cb.game.getState().game.log ?? []).map(l => l.text).filter(t => /took in|neighbor|household|turned 18|came home|ward/i.test(t)).slice(0, 8));
  note('LOG ' + log.join(' // '));
  // total wipe
  await wizard({ region: 'Appalachia', difficulty: 'Standard', lotPick: 'first', mode: 'Surprise' });
  await page.evaluate(() => { window.__cb.game.setState(s => { const g = structuredClone(s.game); const day = Math.floor(g.clock.t); g.personState.forEach(p => { p.needs.died = day; }); return { game: g }; }); window.__cb.game.getState().advance(3); });
  const w = await st(); note('wipe ' + JSON.stringify({ ending: w.ending, setup: w.setup, speed: w.speed }));
  await shot('wipe');
  note('WIPE TEXT: ' + (await page.evaluate(() => document.body.innerText)).replace(/\n+/g, ' | ').slice(0, 600));
}
