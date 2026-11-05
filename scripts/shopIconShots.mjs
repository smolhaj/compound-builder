/**
 * Shop card icons through the real HUD (ui/shopIcons.tsx): every shelf tab at 1280x800, scrolled in page-high steps so each card is seen.
 *   node scripts/shopIconShots.mjs --out shots/shopicons [--port 5347]
 */
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const port = Number(opt('--port', 5347)), out = resolve(opt('--out', 'shots/shopicons'));
mkdirSync(out, { recursive: true });
const vite = spawn('node', ['node_modules/vite/bin/vite.js', '--config', 'scripts/vite.shots.config.ts', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((ok, fail) => { vite.stdout.on('data', d => { if (/localhost:\d+/.test(String(d).replace(/\x1b\[[0-9;]*m/g, ''))) ok(); }); vite.on('exit', c => fail(new Error('vite ' + c))); });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.setDefaultTimeout(120000);
let bad = 0;
page.on('pageerror', e => { bad++; console.log('PAGEERROR', e.message); });
page.on('console', m => { if (m.type() === 'error') { bad++; console.log('CONSOLE ERROR', m.text().slice(0, 200)); } });
const openShop = async tab => { await page.evaluate(() => window.__cb.game.getState().openShop(false)); await page.waitForTimeout(250); await page.evaluate(t => window.__cb.game.getState().openShop(true, t), tab); await page.waitForTimeout(500); };
try {
  await page.goto(`http://localhost:${port}/?new&lowrender`);
  await page.getByText('1. Region').waitFor();
  await page.waitForFunction(() => window.__cb?.qa?.lowrender);
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByRole('button', { name: 'Buy it and start' }).click();
  await page.waitForFunction(() => !window.__cb.game.getState().setupOpen);
  await page.evaluate(() => { window.__cb.game.getState().setSpeed(0); window.__cb.store.getState().setQuality('low'); });
  await page.waitForTimeout(1500);
  for (const tab of ['defense', 'build', 'power', 'food', 'household', 'fuel']) {
    await openShop(tab);
    // the card grid's scroller: the first overflow-y:auto box inside the shop that has more content than it shows
    const total = await page.evaluate(() => { const root = document.querySelector('[style*="z-index: 11"]'); const sc = [...root.querySelectorAll('div')].find(e => getComputedStyle(e).overflowY === 'auto' && e.scrollHeight > e.clientHeight + 5); window.__sc = sc; return sc ? [sc.scrollHeight, sc.clientHeight] : [0, 0]; });
    const steps = total[0] ? Math.ceil(total[0] / Math.max(1, total[1] - 20)) : 1;
    for (let i = 0; i < steps; i++) {
      await page.evaluate(([i, h]) => { if (window.__sc) window.__sc.scrollTop = i * (h - 20); }, [i, total[1]]);
      await page.waitForTimeout(150);
      const f = `${out}/${tab}-${i + 1}.png`; await page.screenshot({ path: f }); console.log(f);
    }
  }
} finally { await browser.close(); vite.kill(); }
if (bad) { console.log('PROBLEMS', bad); process.exitCode = 1; }
