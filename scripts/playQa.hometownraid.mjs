/**
 * Homestead raid frames: a normal (non-dome) start with the starter pieces and a stone wall, a staged armed raid, then frames of the cutscene
 * (full quality), the report, and the glide back to the diorama camera.
 *   flock /tmp/cb.lock node scripts/playQa.mjs hometownraid <outDir> [port]
 */
export async function play(A) {
  const { page, st, shot, note, issue, wizard, stake, click, scanText, frameCamp } = A;
  await wizard({ region: 'Appalachia', difficulty: 'Standard', lotPick: 'first', mode: 'Surprise' });
  note('stake ' + (await stake([['timber_cabin', 0, 3], ['garden', -5, 6], ['root_cellar', 6, 6], ['chicken_coop', 8, -4], ['outhouse', -4, -3], ['well_drilled', 3, -6], ['solar_array', -8, -4], ['battery_shed', -10, 0]])).join(', '));
  await page.evaluate(() => window.__cb.game.getState().advance(40));
  const r = await page.evaluate(() => { const cb = window.__cb, geo = cb.store.getState().siteGeo ?? {}; try { return cb.game.getState().fortifyRing(geo, { scope: 'core', shape: 'irregular', wall: 'stone_wall', towers: 3, towerKind: 'watchtower_wood', passage: false, rings: 1 }); } catch (e) { return String(e).slice(0, 200); } });
  note('fortify ' + JSON.stringify(r).slice(0, 200));
  await page.evaluate(() => { window.__cb.game.setState(s => { const g = structuredClone(s.game); g.structures.forEach(x => { if (x.finishedAt === null) x.finishedAt = g.clock.t; }); g.perimeter.forEach(p => { if (p.finishedAt === null || p.finishedAt === undefined) p.finishedAt = g.clock.t; }); return { game: g }; }); });
  await page.evaluate(() => window.__cb.game.getState().advance(3));
  await frameCamp(); await shot('walled-above', true);
  // eye level at the gate side with a person
  await page.evaluate(() => { const cb = window.__cb, c = cb.world.camp; cb.cam.target.set(c.x + 1.5, 0.14, c.z + 3); cb.cam.radius = 3; cb.cam.pitch = 0.12; cb.cam.yaw = 0.5; });
  await page.waitForTimeout(300); await shot('walled-eye', true);
  await page.evaluate(() => window.__cb.game.setState(s => { const g = structuredClone(s.game); g.clock.speed = 0; g.gate.pending = { id: 'qaR', kind: 'gang', day: Math.floor(g.clock.t), title: 'QA armed gang', dossier: ['Armed men at the gate.'], size: 4, armed: true, strength: 9, wants: { canned: 2 }, stances: ['hide', 'parley', 'warn', 'defend', 'pay'] }; return { game: g, cutscene: null }; }));
  await page.evaluate(() => window.__cb.game.getState().advance(0.001));
  const before = await st(); await page.waitForTimeout(1500); await shot('prompt');
  await click(/^Defend/); await click(/^Watch$/);
  for (let i = 0; i < 40; i++) {
    const c = await st();
    if (!c.cutscene && !c.pending) break;
    if (c.cutscene === 'playing') { await page.waitForTimeout(2500); await shot('play-' + i, true); await scanText('play' + i); if (i > 14) { await click(/^Skip scene$/); } continue; }
    if (c.cutscene === 'aftermath') {
      await shot('report-' + i, true);
      await click(/Pick up the pieces|See to the drive|Check the drive|Continue/);
      for (const ms of [300, 700, 1200, 2200]) { await page.waitForTimeout(ms); await shot('glide-' + ms); }
      continue;
    }
    if (c.pending) { await click(/^Defend/); await click(/^Watch$/); }
    await page.waitForTimeout(500);
  }
  const after = await st(); note('after ' + JSON.stringify({ alive: after.alive, dead: after.dead, cut: after.cutscene, pend: after.pending }));
  await frameCamp(); await shot('after-above', true);
}
