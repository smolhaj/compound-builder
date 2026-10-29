// Weekender cash pacing (sim/weekendPlan.ts): the setup card with the town-home choice, the Next-step cards for the first weeks, the belt control in
// the Family tab, and the Projects tab's Weekend plan.
//   flock <lock> node scripts/weekenderPacingShots.mjs <outDir> [port=5943]
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }
const out = process.argv[2], port = Number(process.argv[3] || 5943);
mkdirSync(out, { recursive: true });
const vite = spawn('node', ['node_modules/vite/bin/vite.js', '--config', 'scripts/vite.shots.config.ts', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((ok, fail) => { vite.stdout.on('data', d => { if (/localhost:\d+/.test(String(d).replace(/\x1b\[[0-9;]*m/g, ''))) ok(); }); vite.on('exit', c => fail(new Error('vite ' + c))); });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const t0 = Date.now(); const lap = m => console.error(`[${Math.round((Date.now() - t0) / 1000)}s] ${m}`);
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.setDefaultTimeout(600000);
  page.on('pageerror', e => console.error('pageerror:', e.message));
  const frames = async n => { for (let i = 0; i < (n ?? 2); i++) await page.evaluate(() => window.__cb.qa.renderNow()); };

  // ── the setup screen: the Weekend getaway card and the town-home choice ──
  await page.goto(`http://localhost:${port}/?new&lowrender=0.4&seed=7`);
  await page.waitForFunction(() => window.__cb?.qa?.lowrender);
  await frames(2);
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await frames(1);
  await page.getByText('Weekend getaway', { exact: false }).first().click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}/01-setup-weekend-own.png` });
  await page.getByRole('button', { name: 'Sell it and rent', exact: true }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}/02-setup-weekend-rent.png` });
  lap('setup');
  await page.getByRole('button', { name: 'Keep the house', exact: true }).click();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.waitForTimeout(300);
  await page.evaluate(() => { for (const el of document.querySelectorAll('div')) if (el.scrollHeight > el.clientHeight + 50 && getComputedStyle(el).overflowY === 'auto') el.scrollTop = 99999; });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}/03-setup-weekend-money.png` });

  // ── a weekender on day 3 with the cabin staked and nothing ordered ──
  await page.goto(`http://localhost:${port}/?seed=7&lowrender=0.9`);
  await page.waitForFunction(() => window.__cb?.qa?.lowrender);
  await page.evaluate(() => window.__cb.store.getState().setQuality('low'));
  await frames(3);
  await page.evaluate(async () => {
    const W = await import('/src/sim/weekender.ts');
    const C = await import('/src/sim/construction.ts');
    const cb = window.__cb, G = cb.game, c = cb.world.camp;
    G.getState().setSpeed(0);
    const g = structuredClone(G.getState().game);
    g.structures = [];
    g.lifestyle = 'weekend';
    for (const ps of g.personState) ps.employed = true;
    g.weekend = W.newWeekend(g.people, g.seed, g.site.miles);
    g.money = 58000;
    C.planStructure(g, 'timber_cabin', c.x - 3, c.z - 3, 0);
    g.disaster.mode = 'sandbox';
    const day = 3; g.clock.t = day + (11 - 6) / 24; g.clock.ticks = Math.round(g.clock.t / (0.25 / 24));
    G.setState({ game: g });
    G.getState().advance(0.011);
  });
  await frames(3);
  await page.screenshot({ path: `${out}/04-next-step-first-week.png` });
  lap('first week');

  // ── week six: the account barely moves, a long stay is coming, the first stage is in ──
  await page.evaluate(async () => {
    const G = window.__cb.game;
    const g = structuredClone(G.getState().game);
    const st = g.structures.find(s => s.kind === 'timber_cabin');
    st.stage = 2; st.supplied = true; st.done = 40;
    g.stock.lumber = 0; g.money = 31000;
    // the Thursday before Memorial Day weekend of the first year
    const doyOf = d => ((g.clock.startDoy - 1 + d) % 365) + 1;
    let day = 8; while (!(doyOf(day) >= 145 && doyOf(day) <= 151 && day % 7 === 0)) day++;
    day -= 4;
    g.clock.t = day + (11 - 6) / 24; g.clock.ticks = Math.round(g.clock.t / (0.25 / 24));
    G.setState({ game: g });
    G.getState().advance(0.011);
  });
  await frames(3);
  await page.screenshot({ path: `${out}/05-next-step-long-stay-belt.png` });
  lap('long stay');
  await page.getByRole('button', { name: /^Projects/ }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}/06-projects-weekend-plan.png` });
  await page.getByRole('button', { name: /^Build$/ }).click();

  // ── the Family tab: the belt control ──
  await page.evaluate(() => { const G = window.__cb.game; const g = structuredClone(G.getState().game); g.money = 120000; G.setState({ game: g }); });
  await page.getByRole('button', { name: /^Family/ }).click();
  await page.waitForTimeout(300);
  await page.evaluate(() => { for (const el of document.querySelectorAll('div')) if (el.innerText?.includes('Belt in town') && el.scrollHeight > el.clientHeight + 20 && getComputedStyle(el).overflowY === 'auto') { const t = [...el.querySelectorAll('div')].find(d => d.innerText === 'Belt in town'); el.scrollTop = Math.max(0, (t?.offsetTop ?? 400) - 300); } });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}/07-family-belt-normal.png` });
  await page.getByRole('button', { name: 'Tight', exact: true }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}/08-family-belt-tight.png` });
  lap('belt');
  console.error('done');
} finally { await browser.close(); vite.kill(); setTimeout(() => process.exit(0), 200); }
