export async function play(A) {
  const { page, st, shot, note, issue, wizard, stake, orderPlans, hireAll, run, realTime, click, frameCamp, scanText } = A;
  await wizard({ region: 'Mountain West', difficulty: 'Cozy', lotPick: 'steep', mode: 'Scenario', scenario: { kind: 'grid_down', peace: '18 months' } });
  await frameCamp();
  let s = await st(); note('start ' + JSON.stringify(s));
  await scanText('start'); await shot('01-start');
  // the starter compound button, if PR #173 landed
  const starter = page.getByRole('button', { name: /starter compound/i });
  note('starter compound button present: ' + (await starter.count()));
  const placed = await stake([['timber_cabin', 0, 3], ['garden', -5, 6], ['field', -11, -6], ['root_cellar', 6, 6], ['chicken_coop', 8, -4], ['outhouse', -4, -3]]);
  note('stake: ' + placed.join(', '));
  if (placed.some(p => p.includes('FAILED'))) issue('cozy: could not stake ' + placed.filter(p => p.includes('FAILED')).join(','));
  await orderPlans(); const h = await hireAll(); note('hired ' + h);
  await frameCamp(); await shot('02-placed');
  // a real-time stretch at speed 3 (the game loop's tick)
  const rt = await realTime(20, 3); note('realtime 20s@3x: ' + JSON.stringify(rt));
  s = await st(); note('after rt ' + JSON.stringify(s));
  // defenses through the store (the Defense tab's own actions)
  const def = await page.evaluate(() => {
    const cb = window.__cb, G = cb.game, geo = cb.store.getState().siteGeo ?? {};
    const out = {};
    try { out.fortify = G.getState().fortifyRing(geo, { scope: 'core', shape: 'irregular', wall: 'stone_wall', towers: 4, towerKind: 'watchtower_octagon', passage: false, rings: 1 }); } catch (e) { out.fortifyErr = String(e.stack ?? e).slice(0, 300); }
    return out;
  });
  note('defense: ' + JSON.stringify(def));
  s = await st(); note('after fortify: runs ' + s.runs + ' planned ' + s.planned + ' money ' + s.money);
  await frameCamp(); await shot('03-fortified-plan');
  const pol = { stance: c => c.pendKind === 'arrival' || c.pendKind === 'refugees' ? [/^Take them in/, /^A month/] : c.pendKind === 'trader' ? [/^Trade/, /^Parley/] : [/^Open the house/, /^Defend/, /^Warn off/, /^Take them in/, /^Trade/, /^Parley/], shotGate: r => r <= 2 };
  const hook = async (s, it) => { if (it % 2 === 0) { await orderPlans(); if (s.built < s.planned) await hireAll(); } };
  // through the first year to the warning
  s = await run({ until: s => s.dphase !== 'peace' && s.dphase != null || s.day > 400, policy: pol, hook, label: 'peace' });
  note('end peace: ' + JSON.stringify(s)); await frameCamp(); await shot('04-warning');
  s = await run({ until: s => s.day > (s.hit ?? 99999) + 20 || s.ending, policy: pol, hook, label: 'hit', step: 3 });
  note('after hit: ' + JSON.stringify(s)); await shot('05-after-hit');
  s = await run({ until: s => s.day > (s.hit ?? 0) + 365 * 3.2 || (s.ending && !s.continued), policy: pol, hook, label: 'later', step: 7 });
  note('after 3+ years: ' + JSON.stringify(s)); await frameCamp(); await shot('06-years-later');
  if (s.ending && !s.continued) { await shot('07-ending'); }
}
