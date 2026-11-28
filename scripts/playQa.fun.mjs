/**
 * New-player fun/flow playthrough. Config in env FUN_CFG (JSON): { region, difficulty, mode, scenario, style: 'careful'|'reckless', maxDays, lotPick }.
 *   FUN_CFG='{"region":"Appalachia","difficulty":"Cozy","style":"careful"}' flock /tmp/cb.lock node scripts/playQa.mjs fun <outDir> [port]
 * Follows the "What to do now" card like a first-time player (careful) or ignores it and refuses everyone (reckless); a monkey pass visits the tabs;
 * records the goal-card text per step (trace.txt), every card title (cards.txt), console output (console.txt) and a text lint (metric units, non-US spelling).
 */
import { appendFileSync } from 'node:fs';
export async function play(A) {
  const { page, st, shot, note, issue, wizard, stake, orderPlans, run, realTime, click, frameCamp, out } = A;
  const cfg = JSON.parse(process.env.FUN_CFG ?? '{}');
  const style = cfg.style ?? 'careful', maxDays = cfg.maxDays ?? 900;
  const trace = s => appendFileSync(`${out}/trace.txt`, s + '\n');
  const cardsLog = s => appendFileSync(`${out}/cards.txt`, s + '\n');
  page.on('console', m => { if (m.type() === 'warning' || m.type() === 'error') appendFileSync(`${out}/console.txt`, `[${m.type()}] ${m.text().slice(0, 400)}\n`); });
  page.on('pageerror', e => appendFileSync(`${out}/console.txt`, `[pageerror] ${String(e.stack ?? e.message).slice(0, 600)}\n`));
  const txt = () => page.evaluate(() => document.body.innerText.replace(/\n+/g, ' | '));
  const goal = async () => { const t = await txt(); const i = t.indexOf('WHAT TO DO NOW'); if (i < 0) return '(no goal card)'; const j = t.indexOf('Get operational', i); return t.slice(i + 16, j > 0 ? j : i + 300).slice(0, 300); };
  const LINT = /\b(km|kilomet\w+|kg|kilogram\w*|metres?|meters?|litres?|liters?|celsius|colou?r\w*|neighbou?r\w*|armou?r\w*|favou?r\w*|honou?r\w*|grey|centre|defence|licence|organis\w+|recognis\w+|realis\w+|programme|tyre|kerb|mum)\b|\b\d+(\.\d+)? ?(m|cm|mm|ha|hectares?|°C)\b/i;
  const seenLint = new Set();
  const lint = async tag => {
    const t = await page.evaluate(() => document.body.innerText);
    for (const line of t.split('\n')) {
      const m = line.match(LINT);
      if (m && !seenLint.has(line.slice(0, 80))) { seenLint.add(line.slice(0, 80)); if (!/^(colors?|neighbors?)$/i.test(m[0])) issue(`LINT(${tag}): "${line.slice(0, 120)}"`); }
    }
  };
  const hire = async () => {
    const ids = await page.evaluate(() => window.__cb.game.getState().game.structures.filter(s => s.finishedAt === null && !s.pre).map(s => s.id)); let h = 0;
    for (const id of ids.slice(0, 4)) { await page.evaluate(i => window.__cb.game.getState().select(i), id); const b = page.getByRole('button', { name: /Hire a crew/ }); if (await b.count() && await b.first().isEnabled()) { await b.first().dispatchEvent('click'); h++; } }
    return h;
  };

  await wizard({ region: cfg.region ?? 'Appalachia', difficulty: cfg.difficulty ?? 'Standard', lotPick: cfg.lotPick ?? 'first', mode: cfg.mode ?? 'Surprise', scenario: cfg.scenario });
  await frameCamp(); await page.waitForTimeout(600);
  await shot('start'); note('START ' + (await txt()).slice(0, 600)); await lint('start');
  const starterBtn = page.getByRole('button', { name: /Lay out a starter compound/ });
  if (style === 'careful') {
    if (await starterBtn.count()) { await starterBtn.first().click(); await page.waitForTimeout(700); await frameCamp(); await shot('starter-ghosts'); if (!(await click(/^Place all$/))) issue('no Place all after starter compound'); }
    else issue('no starter compound button at start');
    await page.waitForTimeout(500); note('ordered ' + await orderPlans()); note('hired ' + await hire());
  } else {
    const p = await stake([['garden', -5, 6], ['outhouse', -4, -3]]); note('reckless stake ' + p.join(','));
  }
  await frameCamp(); await shot('after-first-actions');
  note('GOAL after first actions: ' + await goal());

  let shopLogged = false, lastGoal = '', sameGoal = 0, maxSame = 0, shotsGate = 0, deathsSeen = 0, walled = false, rtDone = 0;
  const pol = style === 'careful'
    ? { stance: c => c.pendKind === 'arrival' || c.pendKind === 'refugees' || c.pendKind === 'kin' || c.pendKind === 'shelter' ? [/^Take them in/, /^Open the house/] : c.pendKind === 'trader' ? [/^Trade/, /^Parley/] : [/^Defend/, /^Accept the tithe/, /^Hold/, /^Parley/, /^Hide(?! panels)/, /^Warn off/] }
    : { stance: c => [/^Turn them away/, /^Refuse/, /^Warn off/, /^Hide(?! panels)/, /^Pay/, /^Defend/] };
  const t0 = Date.now();
  const hook = async (s, i) => {
    const g = await goal(); trace(`d${s.day} $${s.money} alive${s.alive}/${s.total} b${s.built}/${s.planned} ${s.dphase} :: ${g.slice(0, 160)}`);
    if (g === lastGoal) { sameGoal++; maxSame = Math.max(maxSame, sameGoal); } else { sameGoal = 0; lastGoal = g; }
    if (s.dead > deathsSeen) { deathsSeen = s.dead; const lg = await page.evaluate(() => (window.__cb.game.getState().game.log ?? []).slice(-8).map(l => l.text).join(' // ')); note(`DEATH day ${s.day} (dead ${s.dead}); goal was "${g.slice(0, 120)}"; log: ${lg.slice(0, 400)}`); await shot('death-day' + s.day); }
    if (style === 'careful') {
      if (i % 2 === 0) { await orderPlans(); if (s.built < s.planned) await hire(); }
      // a first-time player presses the goal card's one big button, one step at a time
      const gp = page.locator('[data-testid=todo-primary]');
      if (await gp.count() && await gp.first().isEnabled()) {
        const lbl = (await gp.first().innerText()).replace(/\n/g, ' ').slice(0, 70); await gp.first().dispatchEvent('click'); trace(`  pressed goal: ${lbl}`); await page.waitForTimeout(400);
        const add = page.getByRole('button', { name: /Add everything I'm missing/ });
        if (await add.count()) {
          await add.first().click({ timeout: 2000 }).catch(() => {});
          if (!shopLogged) { shopLogged = true; note('SHOP BUTTONS ' + (await page.getByRole('button').allInnerTexts()).join(' / ').slice(0, 700)); await shot('shop-open'); }
          await click(/^(Buy|Order|Place|Pay|Check ?out|Confirm)/); await page.waitForTimeout(300);
        }
        await page.keyboard.press('Escape');
      }
      if (!walled && s.dphase && s.dphase !== 'peace') { walled = true; const r = await page.evaluate(() => { const cb = window.__cb, geo = cb.store.getState().siteGeo ?? {}; try { return cb.game.getState().fortifyRing(geo, { scope: 'core', shape: 'irregular', wall: 'stone_wall', towers: 3, towerKind: 'watchtower_wood', passage: false, rings: 1 }); } catch (e) { return String(e).slice(0, 160); } }); note('warning: fortify ' + JSON.stringify(r).slice(0, 140)); await frameCamp(); await shot('warning-fortify'); }
    }
    if (i % 6 === 3) {
      for (const tab of ['Build', 'People', 'Supplies', 'Utilities', 'Land', 'Defense', 'Outside', 'Projects', 'Years', 'Board', 'Log']) { await page.getByRole('button', { name: tab, exact: true }).first().click({ timeout: 800 }).catch(() => {}); await page.waitForTimeout(60); await lint(tab); const tx = await txt(); const m = tx.match(/.{0,40}(NaN|undefined|\[object|Infinity).{0,40}/); if (m) issue(`bad text in ${tab}: ${m[0]}`); }
      await page.getByRole('button', { name: 'Build', exact: true }).first().click({ timeout: 800 }).catch(() => {});
    }
    if (i % 8 === 4 && s.dphase === 'peace' && rtDone < 3) { rtDone++; const r = await realTime(15, 3); note('realtime 15s@3x ' + JSON.stringify(r)); if (r.stoppedBy === 'NOTHING') issue('clock stopped by itself in real time (soft lock?) day ' + s.day); }
    if (i % 12 === 6) { await frameCamp(); await shot(`day${s.day}`, i % 24 === 6); note(`day ${s.day} $${s.money} alive ${s.alive}/${s.total} morale ${s.morale} health ${s.health} hunger ${s.hunger} people ${s.people} goal: ${g.slice(0, 140)}`); }
  };
  let s = await st();
  const until = x => x.day >= maxDays || (x.ending && !x.continued);
  for (let phase = 0; phase < 40; phase++) {
    const gateTitle = await page.evaluate(() => { const p = window.__cb.game.getState().game.gate.pending; return p ? `${p.kind}|${p.title}|${(p.dossier ?? []).join(' ').slice(0, 160)}` : null; });
    if (gateTitle) cardsLog(`d${s.day} ${gateTitle}`);
    s = await run({ until, policy: { ...pol, shotGate: () => { if (shotsGate < 4) { shotsGate++; return true; } return false; } }, hook, step: s.dphase === 'peace' ? 10 : 5, maxIter: 60, label: 'fun' });
    if (until(s)) break;
    if (Date.now() - t0 > 14 * 60_000) { note('time budget hit'); break; }
  }
  note('END ' + JSON.stringify(s)); note(`goal card unchanged max ${maxSame} consecutive steps`);
  await frameCamp(); await shot('end-above', true);
  await page.evaluate(() => { const cb = window.__cb, c = cb.world.camp; cb.cam.target.set(c.x + 1.5, 0.14, c.z + 3); cb.cam.radius = 3; cb.cam.pitch = 0.12; cb.cam.yaw = 0.5; }); await shot('end-eye', true);
  if (s.ending) { await page.waitForTimeout(500); note('ENDING TEXT ' + (await txt()).slice(0, 900)); await shot('ending'); }
  await lint('end');
}
