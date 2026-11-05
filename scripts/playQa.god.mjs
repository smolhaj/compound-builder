/** Sweep 10: God Mode: place many kinds repeatedly, time it, run 5 years. */
export async function play(A) {
  const { page, shot, note, issue, wizard, scanText, frameCamp, run, realTime } = A;
  await wizard({ region: 'Appalachia', difficulty: 'Standard', lotPick: 'first', mode: 'God Mode' });
  await frameCamp(); await shot('start');
  const res = await page.evaluate(() => {
    const cb = window.__cb, c = cb.world.camp, G = cb.game, out = { placed: 0, failed: {}, ms: 0 };
    const kinds = ['timber_cabin', 'outhouse', 'workshop', 'root_cellar', 'wood_oven', 'forge', 'apiary', 'barnyard', 'chicken_coop', 'garden', 'field', 'greenhouse', 'orchard', 'log_house', 'farmhouse', 'barn', 'cottage', 'guest_house', 'lodge', 'stone_house', 'timber_frame', 'container_house', 'adobe_house', 'metal_garage', 'well_hand', 'cistern', 'water_tower', 'solar_array', 'battery_shed', 'generator_shed', 'septic', 'pond', 'sheep_barn', 'equipment_yard', 'watchtower_wood', 'watchtower_concrete', 'bunker_hatch', 'bunker_stairs', 'bunker_dorm', 'bunker_stores', 'helipad', 'cabin_village', 'vehicle_yard', 'polytunnel', 'aquaponics', 'wind_turbine', 'micro_hydro', 'boat_dock'];
    const t0 = performance.now();
    for (let round = 0; round < 1; round++) for (const k of kinds) {
      let ok = false;
      for (let a = 0; a < 40 && !ok; a++) {
        const ang = Math.random() * 6.28, r = 6 + Math.random() * 90;
        const sp = cb.tool.findSpot(k, c.x + Math.cos(ang) * r, c.z + Math.sin(ang) * r, 0); if (!sp) continue;
        const before = G.getState().game.structures.length;
        try { cb.tool.setKind(k); cb.tool.hoverAt(sp[0], sp[1], 0); cb.tool.placeHere(); cb.tool.setKind(null); } catch (e) { out.failed[k + ':throw'] = String(e).slice(0, 120); break; }
        if (G.getState().game.structures.length > before) ok = true;
      }
      if (ok) out.placed++; else out.failed[k] = (out.failed[k] ?? 0) + 1;
    }
    out.ms = Math.round(performance.now() - t0); out.structs = G.getState().game.structures.length;
    return out;
  });
  note('GOD placement ' + JSON.stringify(res));
  for (const [k, v] of Object.entries(res.failed)) if (String(k).includes('throw')) issue('placement threw: ' + k + ' ' + v);
  await frameCamp(); await page.evaluate(() => { window.__cb.cam.radius = 90; }); await shot('sprawl');
  const t = await page.evaluate(() => { const G = window.__cb.game; const a = performance.now(); G.getState().advance(30); return performance.now() - a; });
  note('advance 30d with ' + res.structs + ' structures: ' + Math.round(t) + 'ms'); if (t > 20000) issue('perf: 30 days took ' + Math.round(t) + 'ms with huge structure count');
  const s = await run({ until: x => x.day >= 365 * 4.5, policy: { stance: () => [/^Open the house/, /^Take them in/, /^Defend/, /^Parley/, /^Hide/], shotGate: () => false }, step: 14, label: 'god5y', hook: async (s, it) => { if (it % 10 === 0) note(`day ${s.day} $${s.money} people ${s.people} alive ${s.alive}`); if (s.money < 1000) issue('god money low ' + s.money); } });
  note('god end ' + JSON.stringify(s)); await scanText('god end'); await frameCamp(); await shot('five-years');
  const rt = await realTime(20, 3); note('realtime at scale ' + JSON.stringify(rt));
  if (rt.ms / rt.frames > 150) issue('perf: ' + Math.round(rt.ms / rt.frames) + ' ms per tick at huge scale');
}
