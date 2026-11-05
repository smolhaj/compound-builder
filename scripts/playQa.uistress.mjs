/** Sweep UI stress: speed spam, Esc everywhere, resize, planner spam, $0 orders, buy-everything, refund, bad placements, reload mid-game. */
export async function play(A) {
  const { page, st, shot, note, issue, wizard, scanText, click, frameCamp, stake, handleGate } = A;
  const body = async n => (await page.evaluate(() => document.body.innerText)).replace(/\n+/g, ' | ').slice(0, n);
  await wizard({ region: 'Appalachia', difficulty: 'Standard', lotPick: 'first', mode: 'Scenario', scenario: { kind: 'grid_down', peace: '18 months' } });
  await frameCamp(); await shot('start');
  // 1. speed spam
  for (let i = 0; i < 60; i++) { await click(new RegExp(['^❚❚$', '^▶$', '^▶▶$', '^▶▶▶$'][i % 4])); }
  await page.evaluate(() => { const G = window.__cb.game; for (let i = 0; i < 40; i++) G.getState().tick(0.25); });
  note('after speed spam ' + JSON.stringify(await st())); await scanText('speed spam');
  // 2. Esc everywhere
  for (const lab of [/^Shop & money$/, /^Save$/, /^New$/, /^Family$/, /^Land$/, /^Defense$/, /^Years$/, /^Log$/, /^Build$/]) {
    if (await click(lab)) { await page.waitForTimeout(150); await page.keyboard.press('Escape'); await page.waitForTimeout(150); }
  }
  note('after Esc tour setup=' + (await st()).setup); if ((await st()).setup) { issue('Esc does not close the New game screen opened from the HUD (needs the Back to my game button)'); await click(/Back to my game/); }
  await page.keyboard.press('Escape');
  // 3. starter planner spam
  await click(/^Build$/);
  for (let i = 0; i < 8; i++) { const b = page.getByRole('button', { name: /suggested layout|Lay out|Plan my compound|starter/i }); if (await b.count()) { await b.first().click().catch(() => {}); await page.waitForTimeout(100); await click(/^Cancel$/); } }
  note('planner spam: ' + (await page.getByRole('button').allInnerTexts()).filter(t => /Place all|Cancel|layout/i.test(t)).join(' / '));
  await shot('planner-after-spam');
  // 4. $0 ordering and the shop
  await page.evaluate(() => window.__cb.game.setState(s => { const g = structuredClone(s.game); g.money = 0; return { game: g }; }));
  await stake([['timber_cabin', 0, 3], ['garden', -5, 6]]);
  await click(/^Supplies$/); const ob = page.getByRole('button', { name: /Order what the plans need/ });
  if (await ob.count()) { note('order at $0 enabled=' + await ob.first().isEnabled()); await ob.first().click({ force: true }).catch(() => {}); }
  const m0 = (await st()).money; note('money after $0 order ' + m0); if (m0 < 0) issue('NEGATIVE MONEY after ordering with $0: ' + m0);
  await page.evaluate(() => window.__cb.game.setState(s => { const g = structuredClone(s.game); g.money = 400000; return { game: g }; }));
  await click(/^Shop & money$/); await page.waitForTimeout(300); await shot('shop');
  let bought = 0;
  for (let tab = 0; tab < 12; tab++) {
    const plus = page.getByRole('button', { name: '+', exact: true });
    const n = Math.min(await plus.count(), 60);
    for (let i = 0; i < n; i++) await plus.nth(i).click({ timeout: 800 }).catch(() => {});
    const buy = page.getByRole('button', { name: /Buy|Order|Place order/ }).filter({ hasNotText: /Buy materials/ });
    for (let i = 0; i < await buy.count(); i++) { if (await buy.nth(i).isEnabled()) { await buy.nth(i).click({ timeout: 800 }).catch(() => {}); bought++; } }
    await click(/Do it anyway/);
    const tabs = await page.locator('button').filter({ hasText: /^(Materials|Food|Fuel|Tools|Guns|Metals|Bank|Classes|Seeds|Medicine)/ }).allInnerTexts();
    if (tab < tabs.length) await page.locator('button').filter({ hasText: new RegExp('^' + tabs[tab].split(/\s/)[0]) }).first().click({ timeout: 800 }).catch(() => {});
  }
  note('shop buys ' + bought + ' money ' + (await st()).money); await shot('shop-after'); await scanText('shop');
  if ((await st()).money < 0) issue('NEGATIVE MONEY after shop spree: ' + (await st()).money);
  await page.keyboard.press('Escape');
  // 5. bad placements
  const bad = await page.evaluate(() => {
    const cb = window.__cb, c = cb.world.camp, G = cb.game, out = [];
    const tryAt = (k, x, z, rot) => { const b = G.getState().game.structures.length; try { cb.tool.setKind(k); cb.tool.hoverAt(x, z, rot); const prob = G.getState().toolProblem; cb.tool.placeHere(); cb.tool.setKind(null); out.push(`${k}@${Math.round(x)},${Math.round(z)}: ${G.getState().game.structures.length > b ? 'PLACED' : 'refused'} ${prob ?? ''}`); } catch (e) { out.push(`${k} THREW ${String(e).slice(0, 100)}`); } };
    for (const [dx, dz] of [[0, 0], [1, 1], [400, 400], [-400, 0], [0, -400], [60, 60], [3, 3]]) for (const k of ['timber_cabin', 'garden', 'bunker_hatch', 'well_hand', 'boat_dock']) tryAt(k, c.x + dx, c.z + dz, Math.random() * 6);
    return out;
  });
  note('BAD PLACEMENTS:\n' + bad.join('\n')); for (const b of bad) if (/THREW/.test(b)) issue('placement threw: ' + b);
  // 6. defenses over water / far / overlapping
  const fence = await page.evaluate(() => {
    const cb = window.__cb, c = cb.world.camp, G = cb.game, out = [];
    for (const kind of ['stone_wall', 'moat', 'covered_bridge', 'escape_tunnel', 'rock_tunnel', 'slope_tunnel', 'underground_passage', 'creek_bars', 'ditch', 'tunnel_bridge']) {
      for (const pts of [[[-30, -30], [30, 30]], [[0, 0], [0, 0]], [[-200, 0], [200, 0]], [[0, 0], [1, 0], [0, 1]]]) {
        const b = G.getState().game.perimeter.length;
        try { cb.fence.setKind(kind); for (const p of pts) cb.fence.addPoint(c.x + p[0], c.z + p[1]); cb.fence.finish(); cb.fence.setKind(null); out.push(`${kind} ${JSON.stringify(pts).slice(0, 30)} -> +${G.getState().game.perimeter.length - b} ${G.getState().toolProblem ?? ''}`); } catch (e) { out.push(`${kind} THREW ${String(e).slice(0, 120)}`); try { cb.fence.setKind(null); } catch {} }
      }
    }
    return out;
  });
  note('FENCES:\n' + fence.join('\n')); for (const f of fence) if (/THREW/.test(f)) issue('fence tool threw: ' + f);
  // 7. refund/delete
  const del = await page.evaluate(() => {
    const G = window.__cb.game; const out = [];
    const g0 = G.getState().game; const ids = g0.structures.slice(0, 3).map(s => s.id);
    const m = G.getState().game.money;
    for (const k of ['dismiss', 'demolish', 'remove', 'cancel', 'refund']) out.push(k + ':' + typeof G.getState()[k]);
    return { m, ids, out };
  });
  note('delete probe ' + JSON.stringify(del));
  // 8. resize mid-game
  for (const [w, h] of [[800, 600], [420, 800], [1600, 900], [1280, 800]]) { await page.setViewportSize({ width: w, height: h }); await page.waitForTimeout(250); await shot(`resize-${w}x${h}`); await scanText(`resize ${w}`); }
  // 9. pause/unpause around a raid and Esc in a cutscene
  await page.evaluate(() => window.__cb.game.setState(s => { const g = structuredClone(s.game); g.disaster.tracks.law = 0.05; g.gate.next = Math.floor(g.clock.t) + 1; g.gate.pending = null; return { game: g, cutscene: null }; }));
  await click(/^▶▶▶$/);
  for (let i = 0; i < 400; i++) { await page.evaluate(() => window.__cb.game.getState().tick(0.25)); const s = await st(); if (s.pending || s.cutscene) break; }
  let s = await st(); note('raid state ' + JSON.stringify({ pend: s.pendKind, cut: s.cutscene, speed: s.speed }));
  if (s.pending || s.cutscene) {
    for (let i = 0; i < 6; i++) { await page.keyboard.press('Escape'); await click(/^❚❚$/); await click(/^▶$/); await page.keyboard.press('Space').catch(() => {}); }
    s = await st(); note('after Esc/pause spam in raid ' + JSON.stringify({ pend: s.pendKind, cut: s.cutscene, speed: s.speed })); await shot('raid-after-spam');
    await handleGate(s, { stance: () => [/^Open the house/, /^Defend/, /^Hide/, /^Parley/], shotGate: () => false });
  }
  // 10. reload mid-game: IndexedDB autosave
  await page.evaluate(() => window.__cb.game.getState().advance(20));
  const before = await st(); await page.waitForTimeout(2500);
  await page.goto(page.url().replace('?new&lowrender', '?lowrender').replace('&new', ''));
  await page.waitForTimeout(6000);
  const hasCb = await page.evaluate(() => !!window.__cb?.game).catch(() => false);
  if (!hasCb) { issue('reload: __cb missing'); await shot('reload'); return; }
  const after = await st(); note('reload before ' + JSON.stringify({ day: before.day, money: before.money, people: before.people }) + ' after ' + JSON.stringify({ day: after.day, money: after.money, people: after.people, setup: after.setup }));
  await shot('after-reload'); await scanText('reload');
  if (after.setup) issue('reload: came back to setup instead of continuing (autosave not picked up?)');
  else if (Math.abs(after.day - before.day) > 25) issue('reload: day jumped ' + before.day + ' -> ' + after.day);
}
