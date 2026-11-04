/** Armed raid with a wall + towers; shelter request; report card. */
export async function play(A) {
  const { page, st, shot, note, issue, wizard, handleGate, click, scanText, frameCamp } = A;
  await wizard({ region: 'Appalachia', difficulty: 'Standard', lotPick: 'first', mode: 'Scenario', scenario: { kind: 'grid_down', peace: '18 months' } });
  await page.evaluate(() => window.__cb.game.getState().advance(300));
  await frameCamp();
  const r = await page.evaluate(() => { const cb = window.__cb, geo = cb.store.getState().siteGeo ?? {}; try { return cb.game.getState().fortifyRing(geo, { scope: 'core', shape: 'irregular', wall: 'stone_wall', towers: 3, towerKind: 'watchtower_wood', passage: false, rings: 1 }); } catch (e) { return String(e).slice(0, 200); } });
  note('fortify ' + JSON.stringify(r).slice(0, 200));
  await page.evaluate(() => { window.__cb.game.setState(s => { const g = structuredClone(s.game); g.structures.forEach(x => { if (x.finishedAt === null) x.finishedAt = g.clock.t; }); g.perimeter.forEach(p => { if (p.finishedAt === null || p.finishedAt === undefined) p.finishedAt = g.clock.t; }); return { game: g }; }); });
  await shot('walls');
  await page.evaluate(() => window.__cb.game.setState(s => { const g = structuredClone(s.game); g.clock.speed = 0; g.gate.pending = { id: 'qaR', kind: 'gang', day: Math.floor(g.clock.t), title: 'QA armed gang', dossier: ['Armed men at the gate.'], size: 8, armed: true, strength: 20, wants: { canned: 2 }, stances: ['hide', 'parley', 'warn', 'defend', 'pay'] }; return { game: g, cutscene: null }; }));
  await page.evaluate(() => window.__cb.game.getState().advance(0.001));
  const before = await st(); note('before raid ' + JSON.stringify({ alive: before.alive, money: before.money, cut: before.cutscene }));
  await shot('prompt');
  // locked controls during the prompt: speed buttons must not change the clock
  await click(/^▶▶▶$/); const sp = (await st()).speed; note('speed after clicking x3 during prompt: ' + sp); if (sp !== 0) issue('clock changed during raid prompt');
  const txt = (await page.evaluate(() => document.body.innerText)).replace(/\n+/g, ' | '); note('PROMPT: ' + txt.slice(0, 700));
  await handleGate(before, { stance: () => [/^Defend/], shotGate: () => true });
  const after = await st(); note('after raid ' + JSON.stringify({ alive: after.alive, dead: after.dead, money: after.money, held: after.raidsHeld, lost: after.raidsLost, cut: after.cutscene, speed: after.speed }));
  await shot('after');
  // shelter request staged (storm), take them in
  await page.evaluate(() => window.__cb.game.setState(s => { const g = structuredClone(s.game); g.clock.speed = 0; g.gate.pending = { id: 'qaS', kind: 'shelter', day: Math.floor(g.clock.t), title: 'QA neighbors need shelter', dossier: ['Their roof is gone.'], size: 3, armed: false, strength: 0, wants: {}, stances: ['take_in', 'turn_away'] }; return { game: g, cutscene: null }; }));
  await page.evaluate(() => window.__cb.game.getState().advance(0.001));
  const s1 = await st(); note('shelter pending ' + s1.pendKind + ' people ' + s1.people);
  note('SHELTER PROMPT: ' + (await page.evaluate(() => document.body.innerText)).replace(/\n+/g, ' | ').slice(0, 600));
  await handleGate(s1, { stance: () => [/^Take them in/, /^Open the house/], shotGate: () => true });
  const s2 = await st(); note('after shelter ' + JSON.stringify({ people: s2.people, alive: s2.alive, tookIn: s2.tookIn }));
  await frameCamp();
  // walk-in: step a little in real time and look
  for (let i = 0; i < 3; i++) { await page.evaluate(() => { const G = window.__cb.game; G.getState().setSpeed(1); for (let k = 0; k < 40; k++) G.getState().tick(0.25); }); }
  await shot('guests-after');
  await page.evaluate(() => window.__cb.game.getState().advance(120));
  const log = await page.evaluate(() => (window.__cb.game.getState().game.log ?? []).slice(-25).map(l => l.text));
  note('LOG: ' + log.filter(t => /bond|guest|shelter|thank|neighbor|left|rebuil/i.test(t)).join(' // '));
  const s3 = await st(); note('120 days later ' + JSON.stringify({ people: s3.people, alive: s3.alive, left: s3.left }));
  await page.getByRole('button', { name: 'Log', exact: true }).first().click().catch(() => {}); await shot('log');
}
