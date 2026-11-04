/** One configurable long playthrough: charter, stake, order/hire loop, phases with milestone shots. */
export async function playWith(A, cfg) {
  const { page, st, shot, note, issue, wizard, stake, orderPlans, hireAll, run, realTime, scanText, frameCamp, click } = A;
  await wizard(cfg.wizard);
  await frameCamp();
  let s = await st(); note('start ' + JSON.stringify(s));
  await scanText('start'); await shot('start');
  const placed = await stake(cfg.stake);
  note('stake: ' + placed.join(', '));
  if (placed.some(p => p.includes('FAILED'))) issue(`${cfg.name}: could not stake ${placed.filter(p => p.includes('FAILED')).join(',')}`);
  await orderPlans(); note('hired ' + await hireAll());
  await frameCamp(); await shot('placed');
  const rt = await realTime(15, 3); note('realtime 15s@3x: ' + JSON.stringify(rt));
  if (cfg.defense) { const d = await page.evaluate(cfg.defense); note('defense ' + JSON.stringify(d)); }
  const foodDays = () => page.evaluate(() => { const m = document.body.innerText.match(/(\d+)\s+days?\s+(?:of\s+)?(?:food|put by)/i); return m ? Number(m[1]) : null; });
  let winterShot = false, lastLog = -999, eraSeen = 1;
  let lastMoney = null;
  const hook = async (s, it) => {
    if (lastMoney != null && lastMoney - s.money > 15000) { const lg = await page.evaluate(() => (window.__cb.game.getState().game.log ?? []).slice(-8).map(l => l.text).join(' // ')); note(`MONEY DROP $${lastMoney} -> $${s.money} at day ${s.day}: ${lg.slice(0, 500)}`); }
    lastMoney = s.money;
    if (it % 2 === 0) { await orderPlans(); if (s.built < s.planned) await hireAll(); }
    if (s.day - lastLog >= (cfg.logEvery ?? 60)) { lastLog = s.day; note(`day ${s.day} y${(s.day / 365).toFixed(1)} $${s.money} built ${s.built}/${s.planned} alive ${s.alive}/${s.total} dead ${s.dead} left ${s.left} people ${s.people} morale ${s.morale} health ${s.health} hunger ${s.hunger} era ${s.era} foodDays ${await foodDays()} phase ${s.dphase}`); }
    if (!winterShot && cfg.winterAt != null && s.day >= cfg.winterAt) { winterShot = true; await frameCamp(); await shot('winter-day-' + s.day); }
    if (s.era !== eraSeen) { eraSeen = s.era; note('ERA CHANGE -> ' + s.era); await frameCamp(); await shot('era-' + s.era); }
    if (cfg.each) await cfg.each(s, it, A);
  };
  for (const ph of cfg.phases) {
    s = await run({ until: x => (x.ending && !x.continued) || ph.until(x), policy: cfg.policy, hook, step: ph.step ?? 7, label: ph.name });
    note(`phase ${ph.name} done: ` + JSON.stringify(s)); await scanText('phase ' + ph.name);
    if (ph.shot) { await frameCamp(); await shot(ph.shot); }
    if (ph.act) await ph.act(A, s);
    if (s.ending && !s.continued) break;
  }
  s = await st();
  for (let k = 0; k < (cfg.continues ?? 0); k++) {
    if (!(s.ending && !s.continued)) { const d1 = s.day; s = await run({ until: x => x.day >= d1 + (cfg.continueDays ?? 365 * 2) || (x.ending && !x.continued), policy: cfg.policy, hook, step: cfg.continueStep ?? 10, label: 'more' + k }); note('more ' + k + ': ' + JSON.stringify(s).slice(0, 300)); await frameCamp(); await shot('more-' + k); continue; }
    await shot('report-card-' + (k + 1));
    const t = await page.evaluate(() => document.body.innerText); note('REPORT: ' + t.replace(/\n+/g, ' | ').slice(0, 900));
    if (!(await click(/Keep playing/))) { issue('no Keep playing button at ending'); break; }
    await page.waitForTimeout(500);
    const d0 = (await st()).day; note('kept playing at day ' + d0);
    s = await run({ until: x => x.day >= d0 + (cfg.continueDays ?? 365 * 2) || (x.ending && !x.continued), policy: cfg.policy, hook, step: cfg.continueStep ?? 10, label: 'continue' + k });
    note('continue ' + k + ' done: ' + JSON.stringify(s)); await frameCamp(); await shot('continued-' + (k + 1));
  }
  if (s.ending) { note('ENDING ' + s.ending); await shot('ending'); }
  return s;
}
