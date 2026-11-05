export async function play(A) {
  const { page, shot, note, issue, wizard, stake, frameCamp } = A;
  const body = async n => (await page.evaluate(() => document.body.innerText)).replace(/\n+/g, ' | ');
  await wizard({ region: 'Appalachia', difficulty: 'Standard', lotPick: 'first', mode: 'Surprise' });
  const res = await stake([['timber_cabin', 0, 3], ['garden', -36, 24], ['root_cellar', 36, -28], ['chicken_coop', -40, -34]]);
  note('stake ' + res.join(','));
  await page.evaluate(() => window.__cb.game.setState(s => { const g = structuredClone(s.game); g.structures.forEach(x => { if (x.finishedAt === null) { x.finishedAt = g.clock.t; x.stage = 99; } if (x.kind === 'garden') x.x -= 50; if (x.kind === 'root_cellar') x.x += 45; if (x.kind === 'chicken_coop') x.z -= 55; }); return { game: g }; }));
  await page.evaluate(() => window.__cb.game.getState().advance(1));
  await page.getByRole('button', { name: 'Utilities', exact: true }).first().click(); await page.waitForTimeout(400);
  const t = await body(); const m = t.match(/.{0,80}Long carries[^|]*(\|[^|]*){0,2}/); note('HASWATER ' + /Water \(yesterday\)|WATER/i.test(t) + ' len ' + t.length + ' ' + t.slice(t.indexOf('UTILITIES') > 0 ? t.indexOf('UTILITIES') : 0, 1200)); note('FLOW NOTE: ' + (m ? m[0] : 'none'));
  note('positions ' + JSON.stringify(await page.evaluate(() => window.__cb.game.getState().game.structures.map(s => [s.kind, Math.round(s.x), Math.round(s.z)]))));
  await page.evaluate(() => { const cb = window.__cb, c = cb.world.camp; cb.cam.target.set(c.x, 0, c.z); cb.cam.radius = 45; cb.cam.pitch = 1.1; });
  await shot('sprawl');
}
