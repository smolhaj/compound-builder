/**
 * Base-game visual fixes (branch claude/base-visual-fixes): the retaining wall at a pad, the goal card with short cash, the Projects tab with
 * identical stalled rows, and the Day 0 food card. Frames are written at full quality.
 *   flock /tmp/cb.lock node scripts/playQa.mjs visfix <outDir> [port]
 * (the ladder and the aftermath camera are checked with scripts/raidMovie.mjs: see docs/DECISIONS.md, 2026-11-27 "Base-game visual fixes")
 */
export async function play(A) {
  const { page, st, shot, note, wizard, stake, click, frameCamp } = A;
  await wizard({ region: 'Appalachia', difficulty: 'Standard', lotPick: 'steep', mode: 'Surprise' });
  await frameCamp(); await shot('day0-above', true);
  await page.waitForTimeout(400); await shot('day0-hud');
  note('day0 card: ' + (await page.evaluate(() => document.querySelector('[data-testid="todo-card"]')?.innerText ?? 'no card')).replace(/\n+/g, ' | ').slice(0, 400));
  note('stake ' + (await stake([['timber_cabin', 0, 3], ['garden', -5, 6], ['root_cellar', 6, 6], ['chicken_coop', 8, -4], ['outhouse', -4, -3], ['well_drilled', 3, -6], ['solar_array', -8, -4], ['battery_shed', -10, 0]])).join(', '));
  const r = await page.evaluate(() => { const cb = window.__cb, geo = cb.store.getState().siteGeo ?? {}; try { return cb.game.getState().fortifyRing(geo, { scope: 'core', shape: 'irregular', wall: 'stone_wall', towers: 3, towerKind: 'watchtower_wood', passage: false, rings: 1 }); } catch (e) { return String(e).slice(0, 200); } });
  note('fortify ' + JSON.stringify(r).slice(0, 200));
  // short cash: the goal card says how much more it needs and offers the first step
  await page.evaluate(() => window.__cb.game.setState(s => { const g = structuredClone(s.game); g.money = 24000; g.stock.canned = 400; g.stock.grain = 200; return { game: g }; }));
  await page.waitForTimeout(600); await shot('short-cash-hud');
  note('short-cash card: ' + (await page.evaluate(() => document.querySelector('[data-testid="todo-card"]')?.innerText ?? 'no card')).replace(/\n+/g, ' | ').slice(0, 500));
  // finished compound, then the walls at the pads
  await page.evaluate(() => { window.__cb.game.setState(s => { const g = structuredClone(s.game); g.money = 300000; g.structures.forEach(x => { if (x.finishedAt === null) x.finishedAt = g.clock.t; }); g.perimeter.forEach(p => { if (p.finishedAt === null || p.finishedAt === undefined) p.finishedAt = g.clock.t; }); return { game: g }; }); });
  await page.evaluate(() => window.__cb.game.getState().advance(3));
  const walls = await page.evaluate(() => {
    const cb = window.__cb, W = cb.world.walls?._walls;
    if (!W) return [];
    return [...W.entries()].map(([id, w]) => ({ id, y: w.plan.y, maxH: w.plan.maxH, rect: w.plan.rect, runs: w.plan.runs.map(r => ({ side: r.side, mx: Math.max(...r.h.map(Math.abs)), mid: r.h[Math.floor(r.h.length / 2)] })) })).sort((a, b) => b.maxH - a.maxH);
  });
  note('walls ' + JSON.stringify(walls).slice(0, 900));
  for (const [k, w] of walls.slice(0, 3).entries()) {
    const run = w.runs.filter(r => r.mid < 0).sort((a, b) => b.mx - a.mx)[0] ?? w.runs.sort((a, b) => b.mx - a.mx)[0];
    if (!run) continue;
    const NOR = [[0, -1], [1, 0], [0, 1], [-1, 0]][run.side], cx = (w.rect.x0 + w.rect.x1) / 2, cz = (w.rect.z0 + w.rect.z1) / 2;
    const half = run.side % 2 === 0 ? (w.rect.z1 - w.rect.z0) / 2 : (w.rect.x1 - w.rect.x0) / 2;
    await page.evaluate(([cx, cz, nx, nz, half]) => {
      const cb = window.__cb, g = cb.world.groundAt, ex = cx + nx * (half + 2.2), ez = cz + nz * (half + 2.2), lx = cx + nx * (half + 0.1), lz = cz + nz * (half + 0.1);
      cb.cam.target.set(lx, g(lx, lz), lz); cb.cam.radius = 2.4; cb.cam.pitch = 0.12; cb.cam.yaw = Math.atan2(ex - lx, ez - lz);
    }, [cx, cz, NOR[0], NOR[1], half]);
    await page.waitForTimeout(300); await shot(`wall${k}-eye-side${run.side}`, true);
    await page.evaluate(([cx, cz, nx, nz, half]) => { const cb = window.__cb, lx = cx + nx * half, lz = cz + nz * half; cb.cam.target.set(lx, cb.world.groundAt(lx, lz), lz); cb.cam.radius = 6; cb.cam.pitch = 0.6; cb.cam.yaw = Math.atan2(nx, nz) + 0.5; }, [cx, cz, NOR[0], NOR[1], half]);
    await page.waitForTimeout(300); await shot(`wall${k}-above`, true);
  }
  // the Projects tab with identical stalled rows
  await page.evaluate(async () => {
    const { planStructure } = await import('/src/sim/construction.ts');
    const { BLUEPRINTS } = await import('/src/sim/blueprints.ts');
    window.__cb.game.setState(s => {
      const g = structuredClone(s.game); g.stalls = g.stalls ?? {};
      for (let i = 0; i < 6; i++) {
        const st = planStructure(g, 'timber_cabin', 30 + i * 4, 30, 0); if (!st) continue;
        st.pre = true; st.finishedAt = 0; st.stage = BLUEPRINTS.timber_cabin.stages.length;
        st.fixes = [{ part: 'plumbing', cond: 'poor', done: 0, hours: 40, supplied: false }];
        g.stalls[`f:${st.id}:plumbing`] = { since: g.clock.t - (148 + i * 20) };
      }
      return { game: g };
    });
  });
  await page.keyboard.press('p'); await page.waitForTimeout(700); await shot('projects-stuck');
  note('projects text: ' + (await page.evaluate(() => document.body.innerText)).replace(/\n+/g, ' | ').match(/Stuck and crew jobs.{0,400}/)?.[0]);
}
