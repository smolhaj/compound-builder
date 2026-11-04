export async function play(A) {
  const { page, st, note, wizard, stake, orderPlans, hireAll } = A;
  await wizard({ region: 'Mountain West', difficulty: 'Cozy', lotPick: 'steep', mode: 'Scenario', scenario: { kind: 'grid_down', peace: '18 months' }, extra: { maxPrice: 180000 } });
  const m = async tag => { const s = await st(); const bits = await page.evaluate(() => { const g = window.__cb.game.getState().game; return { crews: g.crews.length, orders: g.orders?.length ?? null, wage: g.crews.map(c => c.wage ?? c.rate ?? null) }; }); note(`${tag}: $${s.money} day ${s.day} ${JSON.stringify(bits)}`); };
  await m('start');
  await stake([['timber_cabin', 0, 3], ['garden', -5, 6], ['root_cellar', 6, 6], ['chicken_coop', 8, -4], ['outhouse', -4, -3]]);
  await m('staked');
  await orderPlans(); await m('ordered');
  const h = await hireAll(); await m('hired ' + h);
  for (let i = 0; i < 12; i++) { await page.evaluate(() => window.__cb.game.getState().advance(7)); await m('wk' + (i + 1)); }
  const log = await page.evaluate(() => (window.__cb.game.getState().game.log ?? []).slice(-40).map(l => typeof l === 'string' ? l : JSON.stringify(l)).join('\n'));
  note('LOG:\n' + log);
}
