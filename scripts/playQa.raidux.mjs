// Raid cutscene UX shots through the real sim: gate card fit at 1280x800 / 1440x900, and the cutscene with the tree peel off vs on at the same instant.
//   flock /tmp/cb.lock node scripts/playQa.mjs raidux shots/raidux [port]
export async function play(A) {
  const { page, st, shot, note, issue, wizard, stake } = A;
  await wizard({ region: 'Appalachia', difficulty: 'Standard', lotPick: 'first', mode: 'Scenario', scenario: { kind: 'grid_down', peace: '18 months' } });
  await stake([['timber_cabin', 0, 0], ['workshop', -6, -4], ['chicken_coop', 6, -4], ['barn', -6, 8], ['watchtower_wood', 12, 10]]);
  await page.evaluate(() => { window.__cb.game.setState(s => { const g = structuredClone(s.game); g.structures.forEach(x => { if (x.finishedAt === null) x.finishedAt = g.clock.t; x.supplied = true; });
    g.stock.canned = 40; g.stock.meds = 3; g.stock.sandbags = 6; g.armory.ammo['556'] = 1500;
    for (const [i, p] of g.people.entries()) if (!p.kid || p.age >= 15) { g.armory.guns.push({ id: 'g' + i, model: 'sw_mp15', condition: 1, fired: 0, where: 'house', carrier: p.id }); g.armory.skill[p.id] = 3; }
    g.clock.t = Math.floor(g.disaster.hitAt) - 0.5; g.clock.speed = 0; return { game: g }; }); });
  // advance until the first raid card (a raid, not a neighbor)
  for (let i = 0; i < 400; i++) {
    const s = await st();
    if (s.pending && /gang|looters|militia|requisition|patrol/.test(s.pendKind ?? '')) break;
    if (s.pending || s.cutscene || s.aftermath || s.card) {   // answer anything else the cheap way
      await page.evaluate(() => { const g = window.__cb.game.getState(); const e = g.game.gate.pending; if (e && !/gang|looters|militia|requisition|patrol/.test(e.kind)) g.answer(e.stances.includes('turn_away') ? 'turn_away' : e.stances[0]); });
      await page.evaluate(() => { const g = window.__cb.game.getState(); g.dismissCard?.(); });
      continue;
    }
    await page.evaluate(() => window.__cb.game.getState().advance(1));
  }
  const s0 = await st(); note('raid card up: ' + JSON.stringify({ day: s0.day, kind: s0.pendKind }));
  const text = await page.evaluate(() => window.__cb.game.getState().game.gate.pending?.dossier);
  note('DOSSIER ' + JSON.stringify(text));
  // gate card fit
  for (const [w, h] of [[1280, 800], [1440, 900]]) {
    await page.setViewportSize({ width: w, height: h }); await page.waitForTimeout(400);
    const fit = await page.evaluate(() => {
      const btn = [...document.querySelectorAll('button')].find(b => /^Defend/.test(b.innerText.trim()));
      const watch = [...document.querySelectorAll('button')].find(b => b.innerText.trim() === 'Watch');
      const r = e => e ? e.getBoundingClientRect() : null;
      return { vh: innerHeight, defend: r(btn) && { top: r(btn).top, bottom: r(btn).bottom }, watch: r(watch) && { top: r(watch).top, bottom: r(watch).bottom } };
    });
    note(`CARD ${w}x${h} ` + JSON.stringify(fit));
    if (!fit.defend || fit.defend.bottom > fit.vh || fit.defend.top < 0) issue(`Defend not fully visible at ${w}x${h}`);
    if (!fit.watch || fit.watch.bottom > fit.vh) issue(`Watch not visible at ${w}x${h}`);
    await shot(`card-${w}x${h}`);
  }
  await page.setViewportSize({ width: 1280, height: 800 });
  const clicked = await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(b => /^Defend/.test(b.innerText.trim())); if (b) b.click(); return !!b; });
  note('defend clicked ' + clicked);
  await page.getByRole('button', { name: 'Watch', exact: true }).click();
  const peel = on => page.evaluate(async on => { const m = await import('/src/engine/world/trees/viewPeel.ts'); m.setViewPeelEnabled(on); }, on);
  // freeze the playhead and camera, then draw the same frame with the peel off and on
  const freeze = on => page.evaluate(on => { const cb = window.__cb;
    if (on) { const pose = cb.player.update.call(cb.player, 0); cb.player.__o = cb.player.update; cb.battle.__o = cb.battle.update; cb.player.update = () => pose; cb.battle.update = () => {}; }
    else { cb.player.update = cb.player.__o; cb.battle.update = cb.battle.__o; } }, on);
  for (let k = 0; k < 10; k++) {
    await page.waitForTimeout(2500);
    const c = await st(); if (c.cutscene !== 'playing') { note('cutscene state ' + c.cutscene); break; }
    await freeze(true); await page.waitForTimeout(600);
    await peel(false); await shot(`cut${k}-before`);
    await peel(true); await shot(`cut${k}-after`);
    await freeze(false);
  }
}
