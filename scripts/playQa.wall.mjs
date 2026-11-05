/** Eye-level look at the player's old house walls (weathering / peel), a few lots: before/after for wall-texture work.
 *   node scripts/playQa.mjs wall <outDir> [port]   env: WALL_TAG=before|after */
export async function play(A) {
  const { page, shot, note, wizard } = A;
  const tag = process.env.WALL_TAG ?? 'x';
  for (const [region, label] of [['Mountain West', 'mw'], ['Appalachia', 'app'], ['Desert Southwest', 'des']]) {
    await wizard({ region, difficulty: 'Standard', lotPick: 'farmhouse', mode: 'Surprise' });
    await page.evaluate(() => window.__cb.game.getState().advance(5));
    await page.evaluate(() => { const { cam, world } = window.__cb; const h = window.__cb.game.getState().game.structures.find(s => /house|cabin/.test(s.kind)) ?? world.camp; const c = { x: h.x, z: h.z }; const [ex, ez] = world.openSpotNear(c.x + 3.6, c.z + 0.2, 0.6); cam.placeEye(ex, ez, c.x, c.z, 0.34); });
    await page.evaluate(() => window.__cb.store?.getState().setPhoto(true));
    await page.waitForTimeout(800);
    await shot(`${tag}-${label}-wall`);
    note('shot ' + label);
  }
}
