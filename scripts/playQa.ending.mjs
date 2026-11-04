export async function play(A) {
  const { page, st, shot, note, issue, wizard, stake, orderPlans, click } = A;
  await wizard({ region: 'Desert Southwest', difficulty: 'Hardcore', lotPick: 'first', mode: 'Scenario', scenario: { kind: 'grid_down', peace: '18 months' } });
  await stake([['timber_cabin', 0, 3]]);
  // autosave round trip mid-game: a few real ticks (the store saves each new day), reload, the game comes back where it was
  await page.evaluate(() => window.__cb.game.getState().advance(30));
  const rt0 = await A.realTime(30, 3); note('realtime ' + JSON.stringify(rt0));
  const before = await st(); await page.waitForTimeout(1500);
  await page.reload(); await page.waitForFunction(() => window.__cb?.qa?.lowrender, null, { timeout: 60000 }).catch(() => issue('reload: no __cb'));
  await page.waitForTimeout(4000);
  const after = await st(); note('reload: before day ' + before.day + ' money ' + before.money + ' / after day ' + after.day + ' money ' + after.money + ' setup ' + after.setup + ' people ' + after.people);
  if (after.setup || Math.abs(after.day - before.day) > 2) issue('autosave did not restore the game on reload: ' + JSON.stringify({ before: before.day, after: after.day, setup: after.setup }));
  await shot('after-reload');
  // a day at a time through to the card so nothing runs on behind it (the real loop stops at the ending)
  const pol = c => [/^Turn them away/, /^Hide/, /^Warn off/, /^Open the house/, /^Take them in/, /^Defend/];
  for (let i = 0; i < 1500; i++) {
    let s = await st();
    if (s.ending) break;
    if (s.pending || s.cutscene || s.aftermath || s.card) { await A.handleGate(s, { stance: pol, shotGate: () => false }); continue; }
    await page.evaluate(() => window.__cb.game.getState().advance(2));
  }
  let s = await st(); note('at the card: ' + JSON.stringify(s));
  await shot('card');
  // JSON export / import through the pure module
  const rt = await page.evaluate(async () => {
    try {
      const m = await import('/src/sim/save/migrations.ts');
      const g = window.__cb.game.getState().game;
      const txt = m.exportJson(g); const back = m.importJson(txt);
      return { len: txt.length, version: back.version, sameDay: back.clock.t === g.clock.t, sameMoney: back.money === g.money, people: back.people.length };
    } catch (e) { return { err: String(e.stack ?? e).slice(0, 300) }; }
  });
  note('export/import: ' + JSON.stringify(rt));
  if (rt.err || !rt.sameDay || !rt.sameMoney) issue('JSON export/import round trip failed: ' + JSON.stringify(rt));
  // New game from the card
  if (await click(/^New game$/)) { await page.waitForTimeout(800); const z = await st(); note('after "New game": setup=' + z.setup); await shot('new-game-screen'); if (!z.setup) issue('"New game" on the report card did not open the setup screen'); }
  else issue('no "New game" button on the card after reload');
  if ((await st()).setup) {
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    const cards = page.locator('button', { hasText: /acres/ }).filter({ hasText: /Leaves \$/ });
    if (await cards.count()) await cards.first().click();
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await page.getByRole('button', { name: 'Buy it and start' }).click();
    await page.waitForFunction(() => !window.__cb.game.getState().setupOpen);
    const n = await st(); note('second game started: ' + JSON.stringify({ day: n.day, ending: n.ending, people: n.people, money: n.money }));
    if (n.ending || n.day > 1) issue('second game carries old state: ' + JSON.stringify(n).slice(0, 200));
    await shot('second-game');
  }
}
