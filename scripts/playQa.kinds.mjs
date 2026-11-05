/** Every disaster kind through the real UI to its ending (or 900 days): sky / effects shots at the hit (eye level + aerial), the report card, and checks that
 * nothing stays pending behind an ending. KINDS=a,b,c to pick; DIFFS=Cozy,Standard to vary difficulty (cycled).
 *   node scripts/playQa.mjs kinds <outDir> [port] */
export async function play(A) {
  const { page, st, shot, note, issue, wizard, run, scanText } = A;
  const KINDS = (process.env.KINDS ?? 'nuclear,ash_winter,asteroid,civil_war,lawless,invasion,zombies,bioweapon,solar_flare,financial,pandemic,grid_down,drought,wildfire,cyberattack,unknown').split(',');
  const DIFFS = (process.env.DIFFS ?? 'Standard').split(',');
  const policy = { stance: c => c.pendKind === 'arrival' || c.pendKind === 'refugees' ? [/^Take them in/, /^Open the house/] : [/^Open the house/, /^Defend/, /^Hide/, /^Parley/, /^Warn off/], shotGate: () => false };
  const regions = ['Appalachia', 'Mountain West', 'Great Plains', 'Pacific Northwest', 'Desert Southwest', 'New England'];
  let k = 0;
  for (const kind of KINDS) {
    const diff = DIFFS[k % DIFFS.length], region = regions[k % regions.length]; k++;
    note(`==== ${kind} / ${diff} / ${region}`);
    await wizard({ region, difficulty: diff, lotPick: 'first', mode: 'Scenario', scenario: { kind, peace: '18 months' } });
    const s0 = await st();
    const hit = s0.hit ?? 0;
    // to just before the hit, then a few days in for the sky / effects
    let s = await run({ until: x => x.day >= hit - 1, policy, step: 20, label: kind + ' pre-hit' });
    if (s.ending) { issue(`${kind}: ending before the hit`); continue; }
    s = await run({ until: x => x.day >= hit + 4, policy, step: 1, label: kind + ' hit' });
    await page.evaluate(() => { const { cam, world } = window.__cb; const ps = world.family.positions(); const el = ps[0]; if (el) { const [ex, ez] = world.openSpotNear(el.x + 1.9, el.z, 0.6); cam.placeEye(ex, ez, el.x, el.z, 0.34); } });
    await shot(`${kind}-hit-eye`);
    await page.evaluate(() => { const c = window.__cb.world.camp, cam = window.__cb.cam; cam.target.set(c.x, 0, c.z); cam.radius = 40; cam.pitch = 1.0; cam.yaw = 0.3; });
    await shot(`${kind}-hit-aerial`);
    s = await run({ until: x => x.day >= hit + 900, policy, step: 3, label: kind + ' to end' });
    note(`${kind}: ended=${!!s.ending} ${s.ending ?? ''} day ${s.day} alive ${s.alive}/${s.total} pending=${s.pending} card=${s.card} aftermath=${s.aftermath}`);
    if (s.ending) {
      await page.waitForTimeout(500);
      const e = await st();
      if (e.pending && !e.continued) issue(`${kind}: a pending ${e.pendKind} card behind the ending`);
      await scanText(kind + ' ending'); await shot(`${kind}-ending`);
    } else {
      const dump = await page.evaluate(() => { const g = window.__cb.game.getState().game; return { wards: g.lineage?.wards?.map(w => `${w.person.first} ${w.person.age} by ${w.by}`), eras: g.lineage?.eras?.length, people: g.people.map((p, i) => `${p.first}${p.kid ? ' (kid)' : ''}: ${g.personState[i].needs.died != null ? 'dead' : g.personState[i].needs.left ? 'left' : 'alive'}`), ending: g.ending, disaster: { kind: g.disaster.kind, phase: g.disaster.phase, hitAt: g.disaster.hitAt }, day: g.clock.t, neighbors: g.neighbors.map(n => `${n.id}:${n.status}:${n.members}`) }; });
      note(`${kind}: NO-ENDING DUMP ${JSON.stringify(dump)}`); await shot(`${kind}-no-ending`);
      issue(`${kind}/${diff}: no ending in 900 days after the hit (alive ${s.alive}/${s.total}, hungry ${s.hunger})`);
    }
  }
}
