// Full hands-on playthrough through the real UI, fast enough for software GL.
//   flock <lock> node scripts/playthrough.mjs <outDir> [port=5950] [difficulty=Standard] [maxWeeks=420]
// Runs Vite, opens the game with ?lowrender (the canvas draws only on request, Low quality, half resolution), then:
// new game via the 3-step charter, places a first homestead (the game's own plan action at spots the placement tool
// finds), clicks Supplies > "Order what the plans need", hires a crew for the cabin by its button, and fast-forwards
// week by week until the ending. The gate is answered through the real flow (stance button, Watch, Skip scene /
// Skip all, the report, the aftermath card). Writes <outDir>/report.md, timeline.csv, notes.txt and a few screenshots.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }
const out = process.argv[2], port = Number(process.argv[3] || 5950), diff = process.argv[4] || 'Standard', maxWeeks = Number(process.argv[5] || 420);
if (!out) { console.error('usage: node scripts/playthrough.mjs <outDir> [port] [difficulty] [maxWeeks]'); process.exit(2); }
mkdirSync(out, { recursive: true });
const t0 = Date.now();
const notes = []; const note = s => { const l = `[${Math.round((Date.now() - t0) / 1000)}s] ${s}`; notes.push(l); console.log(l); writeFileSync(`${out}/notes.txt`, notes.join('\n')); };
const rows = []; const issues = [];
const vite = spawn('node', ['node_modules/vite/bin/vite.js', '--config', 'scripts/vite.shots.config.ts', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((ok, fail) => { vite.stdout.on('data', d => { if (/localhost:\d+/.test(String(d).replace(/\x1b\[[0-9;]*m/g, ''))) ok(); }); vite.on('exit', c => fail(new Error('vite ' + c))); });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
let n = 0;
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.setDefaultTimeout(60000);
  page.on('pageerror', e => { issues.push('PAGEERROR: ' + e.message); note('PAGEERROR: ' + e.message); });
  page.on('console', m => { if (m.type() === 'error') { issues.push('console error: ' + m.text().slice(0, 200)); note('CONSOLE ERROR: ' + m.text().slice(0, 200)); } });
  await page.goto(`http://localhost:${port}/?lowrender`);
  await page.getByText('1. Region').waitFor();
  await page.waitForFunction(() => window.__cb?.qa?.lowrender);
  // a cheap shot (half resolution, Low) or, with full=true, one slow full-quality shot
  const shot = async (name, full = false) => {
    await page.evaluate(f => (f ? window.__cb.qa.renderFull('high') : window.__cb.qa.renderNow()), full);
    const f = `${out}/${String(++n).padStart(2, '0')}-${name}${full ? '-full' : ''}.png`;
    await page.screenshot({ path: f }); note('shot ' + f); return f;
  };
  const st = () => page.evaluate(() => { const g = window.__cb.game.getState().game, ppl = g.personState, cs = window.__cb.game.getState().cutscene;
    const done = g.structures.filter(s => s.finishedAt !== null);
    return { day: Math.floor(g.clock.t), money: Math.round(g.money), built: done.length, planned: g.structures.length, crews: g.crews.length,
      hit: g.disaster.hitAt === undefined ? null : Math.floor(g.disaster.hitAt), warn: g.disaster.warnAt === undefined ? null : Math.floor(g.disaster.warnAt), kind: g.disaster.kind ?? null, dphase: g.disaster.phase ?? null,
      ending: g.ending ? JSON.stringify(g.ending).slice(0, 240) : null, pending: !!g.gate.pending, aftermath: !!g.gate.aftermath, card: !!g.gate.card, cutscene: cs?.phase ?? null,
      alive: ppl.filter(p => p.needs.died == null).length, total: ppl.length,
      morale: Math.round(ppl.reduce((a, p) => a + (p.needs.morale ?? 0), 0) / Math.max(1, ppl.length)), health: Math.round(ppl.reduce((a, p) => a + (p.needs.health ?? 0), 0) / Math.max(1, ppl.length)) }; });
  const log = (tag, s) => { rows.push({ tag, ...s }); };

  // 1. the charter, by its buttons
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByRole('button', { name: diff, exact: true }).click();
  await page.getByRole('button', { name: 'Buy it and start' }).click();
  await page.waitForFunction(() => !window.__cb.game.getState().setupOpen);
  await page.evaluate(() => window.__cb.game.getState().setSpeed(0));
  await page.evaluate(() => { const c = window.__cb.world.camp, cam = window.__cb.cam; cam.target.set(c.x, 0, c.z); cam.radius = 22; cam.pitch = 1.1; cam.yaw = 0; });
  const s0 = await st(); note('start: ' + JSON.stringify(s0)); log('start', s0);
  await shot('start');

  // 2. the first homestead
  const placed = await page.evaluate(() => {
    const cb = window.__cb, c = cb.world.camp, res = [];
    const want = [['timber_cabin', 0, 3], ['garden', -5, 6], ['field', -11, -6], ['root_cellar', 6, 6], ['chicken_coop', 8, -4], ['outhouse', -4, -3]];
    for (const [k, dx, dz] of want) {
      let ok = false;
      for (const [ox, oz] of [[0, 0], [-4, 0], [0, 4], [-4, 4], [-8, 0], [0, -4], [-8, 4], [4, 4], [6, -6], [-6, -6]]) {
        const sp = cb.tool.findSpot(k, c.x + dx + ox, c.z + dz + oz, 0);
        if (!sp) continue;
        const before = cb.game.getState().game.structures.length;
        cb.game.getState().plan(k, sp[0], sp[1], 0);
        if (cb.game.getState().game.structures.length > before) { ok = true; break; }
      }
      res.push(k + (ok ? ' ok' : ' FAILED'));
    }
    return res;
  });
  note('placed: ' + placed.join(', ')); if (placed.some(p => p.endsWith('FAILED'))) issues.push('placement: ' + placed.filter(p => p.endsWith('FAILED')).join(', '));
  const leftTab = await page.evaluate(() => document.body.innerText.includes('Hire a crew') ? 'crew-visible' : 'no-crew-button-yet');
  note('after placing: ' + leftTab);

  // 3. Supplies > Order what the plans need
  const supplies = page.getByText('Supplies', { exact: true }).first();
  const order = async why => {
    await supplies.click().catch(() => {});
    const b = page.getByRole('button', { name: /Order what the plans need/ });
    if (await b.count() && await b.first().isEnabled()) { await b.first().click(); if (why) note('ordered what the plans need (' + why + ')'); return true; }
    return false;
  };
  if (!(await order('first order'))) { issues.push('no enabled "Order what the plans need" button after placing'); note('NO order button'); }
  await shot('supplies-after-order');

  // 4. hire a crew for the cabin by its button
  const hire = async () => {
    const ids = await page.evaluate(() => window.__cb.game.getState().game.structures.filter(s => s.finishedAt === null && !s.pre).map(s => ({ id: s.id, kind: s.kind })));
    let hired = 0;
    for (const s of ids) {
      await page.evaluate(id => window.__cb.game.getState().select(id), s.id);
      const b = page.getByRole('button', { name: /Hire a crew/ });
      if (await b.count() && await b.first().isEnabled()) { await b.first().click(); hired++; note('hired a crew for ' + s.kind); break; }
    }
    return hired;
  };
  if (!(await hire())) { issues.push('could not hire a crew for the cabin through the button'); note('NO hire button / disabled'); }
  await page.getByText('Family', { exact: true }).first().click().catch(() => {});
  await shot('crew-hired');
  await page.evaluate(() => window.__cb.game.getState().setSpeed(1));

  // 5. the gate through the real flow
  let raids = 0;
  const clickIf = async (re, opts = {}) => { const b = page.getByRole('button', { name: re }).filter(opts.filter ?? {}); if (await b.count()) { await b.first().click({ timeout: 5000 }).catch(() => {}); return true; } return false; };
  const handleGate = async s => {
    raids++; const tag = `gate-${raids}`;
    note(`GATE ${raids} at day ${s.day} (${s.kind}/${s.dphase}): ` + JSON.stringify(s)); log(tag, s);
    let stage = 0;
    for (let i = 0; i < 60; i++) {
      const c = await st();
      if (c.ending) return;
      if (!c.pending && !c.cutscene && !c.aftermath && !c.card) break;
      if (c.cutscene === 'prompt' || (c.pending && !c.cutscene)) {
        if (stage < 1) { await shot(tag + '-prompt'); stage = 1; }
        await clickIf(/^Defend/) || await clickIf(/^Warn off/) || await clickIf(/^Hide/);   // chooseStance, by the stance's button
        if (!(await clickIf(/^Watch$/))) { if (!c.cutscene) { await page.evaluate(() => window.__cb.game.getState().answer?.('defend')); } }
        await page.waitForTimeout(300); continue;
      }
      if (c.cutscene === 'playing') {
        if (stage < 2) { await page.waitForTimeout(1500); await shot(tag + '-playing'); stage = 2; }
        if (await clickIf(/^Skip scene$/)) { await page.waitForTimeout(200); continue; }   // skip scenes one by one, then all
        if (await clickIf(/^Skip( all)?$/)) { await page.waitForTimeout(300); continue; }
        if (await clickIf(/^(Continue|Stay the course)/)) continue;                         // the between-scenes offer, if any
        await page.waitForTimeout(500); continue;
      }
      if (c.cutscene === 'aftermath') { if (stage < 3) { await shot(tag + '-report'); stage = 3; } await clickIf(/Pick up the pieces|See to the drive/); await page.waitForTimeout(300); continue; }
      if (c.aftermath) { await clickIf(/Treat|Bury|Leave/) || await clickIf(/./, { filter: { hasText: /treat|bury|leave/i } }); await page.waitForTimeout(300); continue; }
      if (c.card) { await clickIf(/Carry on/); await page.waitForTimeout(200); continue; }
      await page.waitForTimeout(300);
    }
    const a = await st(); note(`gate ${raids} resolved: ` + JSON.stringify(a)); log(tag + '-after', a);
    await shot(tag + '-after');
  };

  // 6. fast-forward
  let lastPhase = '', lastRow = -99, shots = { mid: false, half: false };
  for (let wk = 0; wk < maxWeeks; wk++) {
    let s = await st();
    if (s.ending) { note('ENDING: ' + s.ending); break; }
    if (s.pending || s.cutscene || s.aftermath || s.card) { await handleGate(s); s = await st(); if (s.ending) { note('ENDING: ' + s.ending); break; } }
    const phase = s.hit == null ? 'peace' : s.day < (s.warn ?? s.hit) ? 'peace' : s.day < s.hit ? 'warning' : 'after';
    if (phase !== lastPhase) { note(`PHASE ${phase} at day ${s.day}: ` + JSON.stringify(s)); log('phase-' + phase, s); await shot(`${phase}-day-${s.day}`); lastPhase = phase; lastRow = wk; }
    if (wk - lastRow >= 4) { log('week', s); lastRow = wk; if (wk % 12 === 0) note(`week ${wk}: ` + JSON.stringify(s)); }
    if (!shots.mid && s.built >= 4) { shots.mid = true; await shot(`homestead-${s.built}-built-day-${s.day}`); await shot('homestead-quality', true); }
    if (!shots.half && s.hit != null && s.day > s.hit / 2) { shots.half = true; await shot(`midgame-day-${s.day}`); }
    if (wk % 4 === 0) { await order(); if (s.crews === 0 && s.built < s.planned) await hire(); await page.getByText('Family', { exact: true }).first().click().catch(() => {}); }
    const quiet = s.warn != null && s.day < s.warn - 120 && s.built >= s.planned;
    await page.evaluate(d => window.__cb.game.getState().advance(d), quiet ? 14 : 7);
  }
  const e = await st();
  note('FINAL: ' + JSON.stringify(e)); log('final', e);
  await page.getByText('Family', { exact: true }).first().click().catch(() => {});
  await shot('final'); await shot('final', true);

  // 7. report
  const cols = ['tag', 'day', 'money', 'built', 'planned', 'crews', 'alive', 'total', 'morale', 'health', 'dphase', 'cutscene'];
  writeFileSync(`${out}/timeline.csv`, [cols.join(','), ...rows.map(r => cols.map(c => r[c] ?? '').join(','))].join('\n'));
  const md = [`# Playthrough report (${diff})`, '', `Wall time ${Math.round((Date.now() - t0) / 1000)} s, ${raids} gate(s) answered, ${rows.length} timeline rows.`, '',
    `Hit scheduled: day ${e.hit} (warning day ${e.warn}, kind ${e.kind}). Final day ${e.day}. Ending: ${e.ending ?? 'none reached'}`, '',
    `Final: money $${e.money}, structures finished ${e.built}/${e.planned}, people alive ${e.alive}/${e.total}, morale ${e.morale}, health ${e.health}.`, '',
    '## Issues found', '', ...(issues.length ? [...new Set(issues)].map(i => '- ' + i) : ['- none']), '',
    '## Timeline', '', '| tag | day | money | built/planned | alive/total | morale | health |', '|---|---|---|---|---|---|---|',
    ...rows.map(r => `| ${r.tag} | ${r.day} | $${r.money} | ${r.built}/${r.planned} | ${r.alive}/${r.total} | ${r.morale} | ${r.health} |`)].join('\n');
  writeFileSync(`${out}/report.md`, md); note('report: ' + out + '/report.md');
} finally {
  writeFileSync(`${out}/notes.txt`, notes.join('\n'));
  await browser.close(); vite.kill(); setTimeout(() => process.exit(0), 200);
}
