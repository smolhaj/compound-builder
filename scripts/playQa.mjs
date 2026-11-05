/**
 * Long hands-on QA playthrough harness (the 3-step charter by its buttons, the gate through its real flow).
 *   node scripts/playQa.mjs <scenario: cozy|farm|hardcore|family> <outDir> [port]
 * Writes <outDir>/notes.txt (a timestamped log), issues.txt (page errors, NaN text, stuck clocks) and screenshots (1280x800).
 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }
const [scenario = 'cozy', out = 'shots/playqa', portArg = '5970'] = process.argv.slice(2);
const port = Number(portArg);
mkdirSync(out, { recursive: true });
const t0 = Date.now();
const note = s => { const l = `[${Math.round((Date.now() - t0) / 1000)}s] ${s}`; console.log(l); appendFileSync(`${out}/notes.txt`, l + '\n'); };
const issueSet = new Set();
const issue = s => { if (issueSet.has(s)) return; issueSet.add(s); note('ISSUE: ' + s); appendFileSync(`${out}/issues.txt`, s + '\n'); };

const vite = spawn('node', ['node_modules/vite/bin/vite.js', '--config', 'scripts/vite.shots.config.ts', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((ok, fail) => { vite.stdout.on('data', d => { if (/localhost:\d+/.test(String(d).replace(/\x1b\[[0-9;]*m/g, ''))) ok(); }); vite.on('exit', c => fail(new Error('vite ' + c))); });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
let n = 0;
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.setDefaultTimeout(30000);
page.on('pageerror', e => issue('PAGEERROR: ' + e.message.slice(0, 300)));
page.on('console', m => { if (m.type() === 'error') issue('console error: ' + m.text().slice(0, 300)); });

const shot = async (name, full = false) => {
  await page.evaluate(f => (f ? window.__cb.qa.renderFull('high') : window.__cb.qa.renderNow()), full).catch(() => {});
  const f = `${out}/${String(++n).padStart(2, '0')}-${name}${full ? '-full' : ''}.png`;
  try { await page.screenshot({ path: f, timeout: 120000 }); note('shot ' + f); } catch (e) { note('shot failed ' + name + ': ' + e.message.slice(0, 80)); }
  return f;
};
const st = () => page.evaluate(() => {
  const gs = window.__cb.game.getState(), g = gs.game, cs = gs.cutscene, ppl = g.personState;
  const alive = ppl.filter(p => p.needs.died == null);
  return { day: Math.floor(g.clock.t), speed: g.clock.speed, money: Math.round(g.money), built: g.structures.filter(s => s.finishedAt !== null).length, planned: g.structures.length,
    runs: g.perimeter.length, hit: g.disaster.hitAt ?? null, warn: g.disaster.warnAt ?? null, kind: g.disaster.kind ?? null, dphase: g.disaster.phase ?? null,
    ending: g.ending ? JSON.stringify(g.ending).slice(0, 200) : null, continued: !!g.ending?.continued, pending: !!g.gate.pending, pendKind: g.gate.pending?.kind ?? null, aftermath: !!g.gate.aftermath, card: !!g.gate.card, cutscene: cs?.phase ?? null,
    setup: gs.setupOpen, alive: alive.length, total: ppl.length, dead: ppl.filter(p => p.needs.died != null && !p.needs.left && !p.needs.taken).length, left: ppl.filter(p => p.needs.left).length, taken: ppl.filter(p => p.needs.taken).length,
    morale: Math.round(alive.reduce((a, p) => a + (p.needs.morale ?? 0), 0) / Math.max(1, alive.length)), health: Math.round(alive.reduce((a, p) => a + (p.needs.health ?? 0), 0) / Math.max(1, alive.length)),
    humanity: g.gate.humanity, hunger: Math.round(Math.max(0, ...alive.map(p => p.needs.hunger ?? 0))), era: g.lineage?.era ?? 1, people: g.people.length, raidsHeld: g.gate.raidsHeld, raidsLost: g.gate.raidsLost, tookIn: g.gate.tookIn, year: g.clock.t / 365 };
});
const BAD = /\bNaN\b|\bundefined\b|\[object|Infinity|\$-?NaN|null\b(?! )/;
const scanText = async tag => {
  const t = await page.evaluate(() => document.body.innerText);
  const m = t.match(/.{0,50}(\bNaN\b|\bundefined\b|\[object|Infinity).{0,50}/);
  if (m) issue(`bad text at ${tag}: "${m[0].replace(/\n/g, ' ')}"`);
};
const click = async (re, opts = {}) => { const b = page.getByRole('button', { name: re }).filter({ hasNotText: /^Hide panels/ }).filter(opts.filter ?? {}); if (await b.count()) { if (!(await b.first().isEnabled())) return false; await b.first().click({ timeout: 5000 }).catch(() => {}); return true; } return false; };

/** The charter, by its buttons. */
async function wizard({ region, difficulty, lotPick = 'first', mode = 'Surprise', kin = 0, scenario: sc, extra }) {
  await page.goto(`http://localhost:${port}/?new&lowrender`);
  await page.getByText('1. Region').waitFor();
  await page.waitForFunction(() => window.__cb?.qa?.lowrender);
  await page.evaluate(u => { try { localStorage.clear(); if (u) localStorage.setItem('cb.unlocked', '1'); } catch {} }, !!process.env.QA_UNLOCK);
  if (region) await page.getByRole('button', { name: new RegExp(region) }).first().click();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  // land step
  if (extra?.lifestyle) await page.getByRole('button', { name: new RegExp(extra.lifestyle) }).first().click().catch(() => note('lifestyle tile not found ' + extra.lifestyle));
  if (extra?.wish) for (const w of extra.wish) await page.getByRole('button', { name: w, exact: true }).first().click().catch(() => note('wish chip not found ' + w));
  await shotWizard('land');
  const cards = page.locator('button', { hasText: /acres/ }).filter({ hasText: /Leaves \$/ });
  const nc = await cards.count();
  const priceOf = async i => { const m = (await cards.nth(i).innerText()).match(/\$([\d,]+)/); return m ? Number(m[1].replace(/,/g, '')) : 1e9; };
  note(`listings: ${nc}`);
  let pickIdx = 0;
  if (lotPick === 'steep') {
    let best = -1, bi = 0;
    for (let i = 0; i < nc; i++) { if (extra?.maxPrice && await priceOf(i) > extra.maxPrice) continue; const t = await cards.nth(i).innerText(); const m = t.match(/height ×([\d.]+)/); const mm = t.match(/(\d+) m\s*$/m); const sc2 = (m ? Number(m[1]) : 1) * 10 + (mm ? Number(mm[1]) / 100 : 0); if (sc2 > best) { best = sc2; bi = i; } }
    pickIdx = bi; note('steep pick card ' + bi + ' score ' + best);
  }
  if (lotPick === 'farmhouse') { for (let i = 0; i < nc; i++) if (/farmhouse/i.test(await cards.nth(i).innerText())) { pickIdx = i; break; } }
  if (lotPick === 'poorest') { let bl = 1e18; for (let i = 0; i < nc; i++) { const t = await cards.nth(i).innerText(); const m = t.match(/Leaves \$([\d,]+)/); const v = m ? Number(m[1].replace(/,/g, '')) : 1e18; if (v < bl) { bl = v; pickIdx = i; } } note('poorest pick leaves $' + bl); }
  if (lotPick === 'priciest') { let bp = -1; for (let i = 0; i < nc; i++) { const pr = await priceOf(i); if (pr < 1e9 && pr > bp) { bp = pr; pickIdx = i; } } note('priciest pick ' + bp); }
  if (nc) { await cards.nth(pickIdx).click(); note('lot: ' + (await cards.nth(pickIdx).innerText()).replace(/\n+/g, ' | ').slice(0, 300)); }
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  for (let i = 0; i < kin; i++) { const rel = page.locator('button').filter({ hasText: /\b(Uncle|Aunt|Grandma|Grandpa|Cousin|Brother|Sister|Mother|Father|Mom|Dad|Grandmother|Grandfather|Niece|Nephew|Mother-in-law|Father-in-law|In-law)/i }); if (await rel.count() > i) await rel.nth(i).click().catch(() => {}); }
  if (mode === 'Scenario' && sc) {
    await page.getByRole('button', { name: /^Scenario/ }).click();
    if (sc.kind && sc.kind !== 'grid_down') await page.locator(`select:has(option[value="${sc.kind}"])`).first().selectOption(sc.kind).catch(e => note('select kind fail ' + e.message.slice(0, 80)));
    if (sc.peace) await page.getByRole('button', { name: sc.peace, exact: true }).click();
  } else if (mode !== 'Surprise') await page.getByRole('button', { name: new RegExp('^' + mode) }).click();
  await page.getByRole('button', { name: difficulty, exact: true }).click();
  await shotWizard('family');
  await page.getByRole('button', { name: 'Buy it and start' }).click();
  await page.waitForFunction(() => !window.__cb.game.getState().setupOpen);
  await page.evaluate(() => window.__cb.game.getState().setSpeed(0));
  await page.waitForTimeout(500);
}
async function shotWizard(tag) { const f = `${out}/w-${tag}.png`; await page.screenshot({ path: f }); }

const frameCamp = () => page.evaluate(() => { const c = window.__cb.world.camp, cam = window.__cb.cam; cam.target.set(c.x, 0, c.z); cam.radius = 26; cam.pitch = 1.0; cam.yaw = 0.3; });

/** Stake buildings with the placement tool (what a click does); returns what failed. */
async function stake(list) {
  return page.evaluate(list => {
    const cb = window.__cb, c = cb.world.camp, G = cb.game, res = [];
    for (const [k, dx, dz, rot] of list) {
      let ok = false;
      for (const [ox, oz] of [[0, 0], [-4, 0], [0, 4], [-4, 4], [-8, 0], [0, -4], [-8, 4], [4, 4], [6, -6], [-6, -6], [10, 4], [-10, 8], [12, -2], [-12, -4], [0, 10], [0, -10], [8, 10], [-8, -10]]) {
        const sp = cb.tool.findSpot(k, c.x + dx + ox, c.z + dz + oz, rot ?? 0);
        if (!sp) continue;
        const before = G.getState().game.structures.length;
        cb.tool.setKind(k); cb.tool.hoverAt(sp[0], sp[1], rot ?? 0); cb.tool.placeHere(); cb.tool.setKind(null);
        if (G.getState().game.structures.length > before) { ok = true; break; }
      }
      res.push(k + (ok ? '' : ' FAILED'));
    }
    return res;
  }, list);
}
const orderPlans = async () => { await page.getByText('Supplies', { exact: true }).first().click().catch(() => {}); const b = page.getByRole('button', { name: /Order what the plans need/ }); if (await b.count() && await b.first().isEnabled()) { await b.first().click(); return true; } return false; };
const hireAll = async () => {
  const ids = await page.evaluate(() => window.__cb.game.getState().game.structures.filter(s => s.finishedAt === null && !s.pre).map(s => s.id));
  let h = 0;
  for (const id of ids.slice(0, 4)) { await page.evaluate(i => window.__cb.game.getState().select(i), id); const b = page.getByRole('button', { name: /Hire a crew/ }); if (await b.count() && await b.first().isEnabled()) { await b.first().click(); h++; } }
  return h;
};

let raids = 0, stanceLog = [];
/** The gate through the real flow. `policy(s)` picks the stance button regex. */
async function handleGate(s, policy) {
  raids++; const tag = `gate-${raids}`;
  note(`GATE ${raids} day ${s.day} kind=${s.pendKind} ${s.dphase}: ` + JSON.stringify({ alive: s.alive, money: s.money }));
  if (!s.pendKind && !s.cutscene) { const lb = await page.getByRole('button').allInnerTexts(); note(`NULL-KIND GATE: aft=${s.aftermath} card=${s.card} labels=` + lb.join(' / ').slice(0, 400)); const bt = await page.evaluate(() => { const g = window.__cb.game.getState().game; return JSON.stringify({ card: g.gate.card, aftermath: g.gate.aftermath }).slice(0, 500); }); note('NULL-KIND STATE ' + bt); await shot(tag + '-nullkind'); }
  let stage = 0, stuckShot = false;
  for (let i = 0; i < 80; i++) {
    const c = await st();
    if (i === 6 && c.pending && !stuckShot) {   // still open after several answers: say which buttons are there (and which are disabled), and look at it
      stuckShot = true;
      const bt = await page.evaluate(() => [...document.querySelectorAll('button')].map(b => (b.disabled ? '[x] ' : '') + (b.innerText || '').replace(/\s+/g, ' ').trim()).filter(Boolean).join(' / '));
      note(`STUCK GATE ${raids} kind=${c.pendKind}: buttons ` + bt.slice(0, 700)); await shot(`gate-${raids}-stuck`);
    }
    if (c.ending && !c.continued) return;   // the report card is up: a prompt left behind it cannot be answered, nothing to wait for
    if (!c.pending && !c.cutscene && !c.aftermath && !c.card) break;
    if (c.cutscene === 'prompt' || (c.pending && !c.cutscene)) {
      if (stage < 1) { await scanText(tag + ' prompt'); if (policy.shotGate && policy.shotGate(raids)) await shot(tag + '-prompt'); stage = 1; }
      const re = policy.stance(c);
      const labels = await page.getByRole('button').allInnerTexts();
      let hit = false; for (const r of [].concat(re)) { if (await click(r)) { hit = true; break; } }
      if (!hit) hit = await click(/^(Give notice and move in|Hold on|Open the house|Hide|Parley|Trade|Warn off|Defend|Take them in|Pay|Turn them away)/);
      if (!hit) { await shot(`gate-${raids}-nomatch`); issue(`gate ${raids}: no stance button matched ${re}; buttons: ${labels.join(' / ').slice(0, 250)}`); }
      stanceLog.push(`${s.day}:${s.pendKind}:${re}`);
      await click(/^Watch$/);
      await page.waitForTimeout(300); continue;
    }
    if (c.cutscene === 'playing') {
      if (stage < 2) { await page.waitForTimeout(1500); if (policy.shotGate && policy.shotGate(raids)) await shot(tag + '-playing'); await scanText(tag + ' playing'); stage = 2; }
      if (await click(/^Skip scene$/)) { await page.waitForTimeout(200); continue; }
      if (await click(/^Skip( all)?$/)) { await page.waitForTimeout(300); continue; }
      if (await click(/^(Continue|Stay the course)/)) continue;
      await page.waitForTimeout(500); continue;
    }
    if (c.cutscene === 'aftermath') { if (stage < 3) { if (policy.shotGate && policy.shotGate(raids)) await shot(tag + '-report'); await scanText(tag + ' report'); stage = 3; } await click(/Pick up the pieces|See to the drive/); await page.waitForTimeout(300); continue; }
    if (c.aftermath) { await click(/Treat|Bury|Leave/) || await click(/./, { filter: { hasText: /treat|bury|leave/i } }); await page.waitForTimeout(300); continue; }
    if (c.card) { await scanText(tag + ' card'); await click(/Carry on/); await page.waitForTimeout(200); continue; }
    await page.waitForTimeout(300);
  }
  const a = await st(); note(`gate ${raids} resolved: day ${a.day} alive ${a.alive}/${a.total} money ${a.money} speed ${a.speed}`);
  if (a.pending || a.cutscene) issue(`gate ${raids} did not clear: pending=${a.pending} cutscene=${a.cutscene}`);
  return a;
}

/** Advance in `step`-day chunks until `until(s)`; gates are answered via the policy; periodic hooks; stuck detection. */
async function run({ until, policy, step = 7, hook, maxIter = 2000, label = '' }) {
  let lastSpeed0 = 0;
  for (let it = 0; it < maxIter; it++) {
    let s = await st();
    if (s.setup) { issue('setup screen open mid-game'); return s; }
    if (s.pending || s.cutscene || s.aftermath || s.card) { await handleGate(s, policy); s = await st(); }
    if (s.ending && !s.continued) return s;
    if (until(s)) return s;
    if (hook) await hook(s, it);
    await page.evaluate(d => window.__cb.game.getState().advance(d), step);
    if (it % 10 === 0) { await scanText(`${label} day ${s.day}`); }
  }
  return st();
}

/** A real-time stretch: speed 3 through the store's tick, the way the game loop runs it; returns the days gained and whether the clock stopped by itself. */
async function realTime(seconds, speed = 3) {
  const before = await st();
  await page.evaluate(sp => window.__cb.game.getState().setSpeed(sp), speed);
  const r = await page.evaluate(async secs => {
    const G = window.__cb.game; let sim = 0, t0 = performance.now(), frames = 0, slow = 0;
    while (sim < secs) { const a = performance.now(); G.getState().tick(0.25); const d = performance.now() - a; if (d > 150) slow++; frames++; sim += 0.25; const g = G.getState().game; if (g.clock.speed === 0 || G.getState().cutscene) break; }
    return { frames, slow, ms: performance.now() - t0 };
  }, seconds);
  const after = await st();
  return { days: after.day - before.day, ...r, stoppedBy: after.speed === 0 ? (after.pending ? 'gate' : after.card ? 'card' : after.ending ? 'ending' : after.cutscene ? 'cutscene' : 'NOTHING') : null };
}

export { page, st, shot, note, issue, wizard, stake, orderPlans, hireAll, handleGate, run, realTime, click, scanText, frameCamp, browser, vite, out, port, scenario, raids as _r };
const _sc = await import(`./playQa.${scenario}.mjs`);
try { await _sc.play({ browser, port, page, st, shot, note, issue, wizard, stake, orderPlans, hireAll, handleGate, run, realTime, click, scanText, frameCamp, out, stanceLog }); }
catch (e) { note('SCENARIO CRASH: ' + (e.stack ?? e).toString().slice(0, 800)); await shot('crash').catch(() => {}); }
finally { await browser.close(); vite.kill(); setTimeout(() => process.exit(0), 200); }
