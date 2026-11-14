/**
 * Playtest 3: a first-time player through the real UI (clicks on the goal card, the shop, the Build tab and the gate card).
 *   flock /tmp/cb.lock node scripts/playQa.mjs firsttime <outDir> [port]
 * Placement uses the same placement tool a click calls (cb.tool), as the other hands-on scenarios do; everything else is a button.
 */
export async function play(A) {
  const { page, st, shot, note, issue, wizard, frameCamp, click, orderPlans, handleGate } = A;
  // (the stock hireAll clicks with actionability checks, which time out under the toast; a dispatched click is the same handler)
  const hireAll = async () => {
    const ids = await page.evaluate(() => window.__cb.game.getState().game.structures.filter(s => s.finishedAt === null && !s.pre).map(s => s.id));
    let h = 0;
    for (const id of ids.slice(0, 4)) { await page.evaluate(i => window.__cb.game.getState().select(i), id); const b = page.getByRole('button', { name: /Hire a crew/ }); if (await b.count() && await b.first().isEnabled()) { await b.first().dispatchEvent('click'); h++; } }
    return h;
  };
  await wizard({ region: 'Mountain West', difficulty: 'Standard', lotPick: 'first', mode: 'Scenario', scenario: { kind: 'grid_down', peace: '18 months' } });
  await frameCamp(); await page.waitForTimeout(800);
  const txt = () => page.evaluate(() => document.body.innerText.replace(/\n+/g, ' | '));
  await shot('start');
  note('START TEXT ' + (await txt()).slice(0, 500));
  // 1. the goal card's one big button
  const primary = page.locator('[data-testid=goal-primary]');
  note('goal-primary count ' + await primary.count());
  if (await click(/Lay out a starter compound/)) { await page.waitForTimeout(800); await frameCamp(); await shot('starter-compound'); note('after starter: ' + (await txt()).slice(0, 700)); if (await click(/^Place all$/)) { await page.waitForTimeout(600); note('placed all'); } else issue('no Place all button'); }
  else issue('no "Lay out a starter compound" button');
  // 2. the shop
  if (await click(/Shop & money/)) { await page.waitForTimeout(800); await shot('shop'); note('SHOP ' + (await txt()).slice(0, 900)); await page.keyboard.press('Escape'); }
  // 3. supplies and a crew, the way the Build tab nudges
  note('ordered ' + await orderPlans()); note('hired ' + await hireAll());
  await page.getByRole('button', { name: 'Projects' }).first().click().catch(() => {}); await page.waitForTimeout(500); await shot('projects');
  note('PROJECTS ' + (await txt()).slice(0, 900));
  await page.getByRole('button', { name: 'Build' }).first().click().catch(() => {});
  // 4. play: a week at a time, pressing the goal card's primary button and ordering, until the first gate
  const policy = {
    stance: c => c.pendKind === 'arrival' || c.pendKind === 'refugees' ? [/^Take them in/, /^Open the house/] : [/^Defend/, /^Parley/, /^Hide/, /^Warn off/],
    shotGate: r => { if (raidSeen) page.locator('[data-testid=raid-breakdown-toggle]').click({ timeout: 300 }).catch(() => {}); return raidSeen; },
  };
  let lastDay = -1, warned = false, gateSeen = false, done = false, raidSeen = false;
  for (let it = 0; it < 400 && !done; it++) {
    let s = await st();
    if (s.pending || s.cutscene || s.aftermath || s.card) {
      const isRaid = s.pending && await page.evaluate(() => { const e = window.__cb.game.getState().game.gate.pending; return !!(e && (e.wave || e.armed)); });
      if (isRaid) raidSeen = true;
      if (s.pending && isRaid && !gateSeen) { gateSeen = true; await page.waitForTimeout(1500); await shot('gate-card'); note('GATE TEXT ' + (await txt()).slice(0, 1400)); }
      await handleGate(s, policy); s = await st();
      const w = await page.evaluate(() => window.__cb.game.getState().game.gate.history.length);
      note('gate history ' + w + ' kind ' + s.pendKind);
      if (gateSeen && raidSeen) done = true;
    }
    if (s.ending && !s.continued) break;
    if (it % 3 === 0) { if (await primary.count()) await primary.first().click({ timeout: 1000 }).catch(() => {}); await orderPlans(); await hireAll(); }
    if (s.day >= 30 && lastDay < 30) { await frameCamp(); await shot('day30'); note('DAY30 ' + (await txt()).slice(0, 600)); }
    if (s.dphase === 'warning' && !warned) { warned = true; await frameCamp(); await shot('warning'); note('WARNING ' + (await txt()).slice(0, 600)); }
    lastDay = s.day;
    await page.evaluate(d => window.__cb.game.getState().advance(d), it < 3 ? 7 : 25);
    if (it % 10 === 0) note(`day ${s.day} $${s.money} built ${s.built}/${s.planned} ${s.dphase} alive ${s.alive}`);
  }
  // 5. a dusk evening in the walled compound: the family panel
  await page.evaluate(() => { const G = window.__cb.game, g = structuredClone(G.getState().game); g.clock.t = Math.floor(g.clock.t) + 0.5; G.setState({ game: g }); G.getState().advance(0.0125); });
  await frameCamp(); await page.waitForTimeout(500); await shot('evening');
  note('EVENING ' + (await txt()).slice(0, 1200));
}
