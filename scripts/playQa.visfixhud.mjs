/**
 * HUD frames for the base-game visual fixes: the Day 0 food card, the goal card with short cash, and the Projects tab with identical stalled rows.
 *   flock /tmp/cb.lock node scripts/playQa.mjs visfixhud <outDir> [port]
 */
export async function play(A) {
  const { page, shot, note, wizard, stake } = A;
  await wizard({ region: 'Appalachia', difficulty: 'Standard', lotPick: 'first', mode: 'Surprise' });
  await page.getByRole('button', { name: 'Start', exact: true }).click().catch(() => {});
  await page.waitForTimeout(500); await shot('day0-hud');
  note('day0 card: ' + (await page.evaluate(() => document.querySelector('[data-testid="todo-card"]')?.innerText ?? 'no card')).replace(/\n+/g, ' | ').slice(0, 400));
  note('stake ' + (await stake([['timber_cabin', 0, 3], ['garden', -5, 6], ['root_cellar', 6, 6], ['chicken_coop', 8, -4], ['outhouse', -4, -3], ['well_drilled', 3, -6], ['solar_array', -8, -4], ['battery_shed', -10, 0]])).join(', '));
  await page.evaluate(() => window.__cb.game.setState(s => { const g = structuredClone(s.game); g.money = 24000; g.stock.canned = 400; g.stock.grain = 200; return { game: g }; }));
  await page.waitForTimeout(600); await shot('short-cash-hud');
  note('short-cash card: ' + (await page.evaluate(() => document.querySelector('[data-testid="todo-card"]')?.innerText ?? 'no card')).replace(/\n+/g, ' | ').slice(0, 500));
  await page.evaluate(async () => {
    const { planStructure } = await import('/src/sim/construction.ts');
    const { BLUEPRINTS } = await import('/src/sim/blueprints.ts');
    window.__cb.game.setState(s => {
      const g = structuredClone(s.game); g.money = 300000; g.stalls = g.stalls ?? {};
      for (let i = 0; i < 6; i++) {
        const st = planStructure(g, 'timber_cabin', 30 + i * 4, 30, 0); if (!st) continue;
        st.pre = true; st.finishedAt = 0; st.stage = BLUEPRINTS.timber_cabin.stages.length;
        st.fixes = [{ part: 'plumbing', cond: 'poor', done: 0, hours: 40, supplied: false }];
        g.stalls[`f:${st.id}:plumbing`] = { since: g.clock.t - (148 + i * 20) };
      }
      return { game: g };
    });
  });
  await page.evaluate(async () => { const { useDrawerStore } = await import('/src/store/drawerStore.ts'); useDrawerStore.getState().show('projects'); });
  await page.waitForTimeout(700); await shot('projects-stuck');
  note('projects: ' + (await page.evaluate(() => document.body.innerText)).replace(/\n+/g, ' | ').match(/Stuck and crew jobs.{0,420}/)?.[0]);
}
