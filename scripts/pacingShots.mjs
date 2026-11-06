/**
 * QA run 5 fixes in the real app: the "hire a crew" pacing card, the escalated stuck card, the order toast.
 *   node scripts/pacingShots.mjs [--port 5973] [--out /tmp/claude-0/pace]
 * Real renderer (no ?lowrender): one frame is waited for before each shot.
 */
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const port = Number(opt('--port', 5973));
const outDir = resolve(opt('--out', '/tmp/claude-0/pace'));
mkdirSync(outDir, { recursive: true });
const vite = spawn('node', ['node_modules/vite/bin/vite.js', '--config', 'scripts/vite.shots.config.ts', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((ok, fail) => {
  vite.stdout.on('data', d => { if (/localhost:\d+/.test(String(d).replace(/\x1b\[[0-9;]*m/g, ''))) ok(); });
  vite.on('exit', c => fail(new Error(`vite exited ${c}`)));
});
const browser = await chromium.launch();
const errs = [];
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.setDefaultTimeout(300000);
  page.on('pageerror', e => errs.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto(`http://localhost:${port}/?lowrender=0.6&seed=7`);
  await page.waitForFunction(() => window.__cb?.game && window.__cb?.qa, null, { timeout: 300000 });
  const frames = async (n) => { const f0 = await page.evaluate(() => window.__cb.qa.frames); await page.waitForFunction(k => window.__cb.qa.frames >= k, f0 + n, { polling: 200 }); };
  const shot = async (name) => { await frames(2); await page.evaluate(() => window.__cb.qa.renderFull('medium')); await page.screenshot({ path: `${outDir}/${name}.png` }); console.log(name); };
  await page.evaluate(() => { const G = window.__cb.game.getState(); G.setSpeed(0); });
  // cash, a log house staked
  await page.evaluate(() => {
    const cb = window.__cb, c = cb.world.camp, G = cb.game.getState();
    G.money(d => { d.money = 938000; return null; });
    const sp = cb.tool.findSpot('log_house', c.x, c.z, 0);
    if (sp) G.plan('log_house', sp[0], sp[1], 0);
  });
  await page.getByRole('button', { name: /^Build/ }).first().click().catch(() => undefined);
  await shot('pacing-01-crew-card');
  const text = await page.evaluate(() => document.body.innerText);
  console.log('HAS CREW CARD', /Hire a crew to finish the/.test(text));
  // order toast: order what the plans need
  await page.getByRole('button', { name: /^Supplies/ }).first().click();
  const btn = page.getByRole('button', { name: /Order what the plans need/ }).first();
  if (await btn.count()) { await btn.click(); await page.waitForTimeout(600); console.log('TOAST', await page.evaluate(() => document.querySelector('[data-testid="purchase-toast"]')?.textContent ?? null)); await shot('pacing-02-order-toast'); }
  // a stuck repair that has waited more than two weeks with cash in hand
  await page.evaluate(() => {
    const cb = window.__cb, G = cb.game.getState();
    G.money(d => {
      const st = d.structures.find(x => x.kind === 'log_house') ?? d.structures[0];
      d.stock.roofing = 0; d.stock.hardware = 0;
      st.fixes = [{ part: 'roof', cond: 'fair', done: 0, hours: 30, supplied: false }];
      st.finishedAt = 0; st.stage = 99; st.pre = true; st.done = 0; d.orders = [];
      d.stalls = {}; d.stalls[`f:${st.id}:roof`] = { since: d.clock.t - 20 };
      return null;
    });
  });
  await shot('pacing-03-stuck-card');
  console.log('ERRS', JSON.stringify(errs));
} finally { await browser.close(); vite.kill(); }
