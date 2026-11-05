/** Shelter request, God Mode + normal report card, Fire overlay on 2 lots, Flow note. */
export async function play(A) {
  const { page, st, shot, note, issue, wizard, handleGate, click, scanText, frameCamp, stake, run } = A;
  const body = async n => (await page.evaluate(() => document.body.innerText)).replace(/\n+/g, ' | ').slice(0, n);
  const SKIP5 = process.env.SKIP5; // ---- 5: shelter
  await wizard({ region: 'Appalachia', difficulty: 'Standard', lotPick: 'first', mode: 'Surprise' });
  let found = false;
  for (let i = 0; i < 80 && !found; i++) {
    await page.evaluate(() => window.__cb.game.getState().advance(10));
    const s = await st();
    if (s.pending && s.pendKind === 'shelter') { found = true; note('shelter card day ' + s.day); await scanText('shelter card'); await shot('shelter-card'); note('CARD: ' + (await body(700))); }
    else if (s.pending || s.cutscene || s.aftermath || s.card) await handleGate(s, { stance: () => [/^Turn them away/, /^Hide/, /^Parley/], shotGate: () => false });
  }
  if (SKIP5) {} else if (!found) issue('no shelter card in 800 days');
  else {
    const before = await st();
    await handleGate(before, { stance: () => [/^Take them in/], shotGate: () => false });
    const after = await st(); note('after take-in ' + JSON.stringify({ people: after.people, alive: after.alive, tookIn: after.tookIn }));
    await page.evaluate(() => { const cb = window.__cb; const c = cb.world.camp; cb.cam.target.set(c.x, 0, c.z); cb.cam.radius = 14; cb.cam.pitch = 0.45; cb.cam.yaw = 0.3; });
    for (let k = 0; k < 4; k++) { await page.evaluate(() => { const G = window.__cb.game; G.getState().setSpeed(1); for (let j = 0; j < 30; j++) G.getState().tick(0.25); G.getState().setSpeed(0); }); }
    await shot('guests-at-camp');
    await page.evaluate(() => window.__cb.game.getState().advance(45));
    const lg = await page.evaluate(() => (window.__cb.game.getState().game.log ?? []).map(l => l.text));
    note('BOND/GUEST LOG: ' + lg.filter(t => /bond|guest|stay|thank|loyal|trust|shelter|left|went home|moved on/i.test(t)).slice(-8).join(' // '));
    const s3 = await st(); note('45d later ' + JSON.stringify({ people: s3.people, alive: s3.alive, left: s3.left }));
    await page.evaluate(() => window.__cb.game.getState().advance(40));
    const s4 = await st(); note('85d later ' + JSON.stringify({ people: s4.people, alive: s4.alive, left: s4.left }));
    const lg2 = await page.evaluate(() => (window.__cb.game.getState().game.log ?? []).map(l => l.text));
    note('LOG2: ' + lg2.filter(t => /bond|guest|thank|went home|moved on|stay/i.test(t)).slice(-6).join(' // '));
  }
  // ---- 7: fire overlay on 2 lots + flow note
  for (const region of ['Appalachia', 'Desert Southwest']) {
    await wizard({ region, difficulty: 'Standard', lotPick: 'first', mode: 'Surprise' });
    await frameCamp();
    await click(/^Fire$/); await page.waitForTimeout(500);
    await shot('fire-' + region.replace(/\W/g, ''));
    note('FIRE ' + region + ': ' + (await body(1500)).slice(0, 900));
  }
  const res = await stake([['timber_cabin', 0, 3], ['garden', -14, 12], ['root_cellar', 14, -12], ['chicken_coop', -16, -10], ['outhouse', 16, 14], ['workshop', 0, -16]]);
  note('flow stake ' + res.join(','));
  await page.evaluate(() => window.__cb.game.getState().advance(1));
  const flow = (await body(6000)).match(/Long carries[^|]*/); note('FLOW NOTE: ' + (flow ? flow[0] : 'none'));
  await page.evaluate(() => { const cb = window.__cb, c = cb.world.camp; cb.cam.target.set(c.x, 0, c.z); cb.cam.radius = 40; cb.cam.pitch = 1.1; });
  await shot('sprawl');
  // ---- 6: God Mode + report cards
  await wizard({ region: 'Appalachia', difficulty: 'Standard', lotPick: 'first', mode: 'God Mode' });
  note('GOD: ' + (await body(400)));
  await page.evaluate(() => window.__cb.game.getState().advance(30));
  note('god money ' + (await st()).money);
  const sets = [['god', 'God Mode'], ['normal', 'Surprise']];
  for (const [tag] of sets) {
    if (tag === 'normal') await wizard({ region: 'Appalachia', difficulty: 'Standard', lotPick: 'first', mode: 'Surprise' });
    await page.evaluate(() => window.__cb.game.setState(s => { const g = structuredClone(s.game); g.ending = { kind: 'equilibrium', day: Math.floor(g.clock.t), continued: false }; g.clock.speed = 0; return { game: g }; }));
    await page.waitForTimeout(600); await shot('report-' + tag);
    note('REPORT ' + tag + ': ' + (await body(900)));
    await scanText('report ' + tag);
  }
}
