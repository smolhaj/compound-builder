/**
 * Listings: the new-game screen with the four parcels for sale, then each
 * one started and seen from the air (camp, creek, timber, corner pins).
 *   node scripts/siteShots.mjs [--port 5251] [--out shots/sites] [--seed 7]
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
const port = Number(opt('--port', 5251));
const outDir = resolve(opt('--out', 'shots/sites'));
const seed = opt('--seed', '7');
mkdirSync(outDir, { recursive: true });
const vite = spawn('node', ['node_modules/vite/bin/vite.js', '--config', 'scripts/vite.shots.config.ts', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((ok, fail) => {
  vite.stdout.on('data', d => { if (/localhost:\d+/.test(String(d).replace(/\x1b\[[0-9;]*m/g, ''))) ok(); });
  vite.on('exit', c => fail(new Error(`vite exited ${c}`)));
});
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
  page.setDefaultTimeout(240000);
  page.on('pageerror', e => console.error('pageerror:', e.message));
  page.on('console', m => { if (m.type() === 'error') console.error('console error:', m.text()); });
  const frames = async (n) => { await page.waitForFunction(() => window.__cb, null, { timeout: 120000 }); const f0 = await page.evaluate(() => window.__cb.qa.frames); await page.waitForFunction(k => window.__cb.qa.frames >= k, f0 + n, { polling: 200 }); };
  for (let i = 0; i < 4; i++) {
    await page.goto(`http://localhost:${port}/?new&seed=${seed}`);
    await frames(3);
    await page.evaluate(() => window.__cb.store.getState().setQuality('low'));
    if (i === 0) { await page.screenshot({ path: `${outDir}/00-listings.png` }); console.log('listings'); }
    await page.locator('button').filter({ hasText: /acres$/ }).nth(i).click().catch(async () => { await page.locator('button', { hasText: / acres/ }).nth(i).click(); });
    await page.getByText('Start', { exact: true }).click();
    await frames(6);
    await page.evaluate(() => { const G = window.__cb.game; G.getState().setSpeed(0); const w = window.__cb.world, c = w.camp, h = w.home; window.__cb.cam.target.set((h.x0 + h.x1) / 2, 0, (h.z0 + h.z1) / 2); window.__cb.cam.radius = Math.max(h.x1 - h.x0, h.z1 - h.z0) * 0.62; window.__cb.cam.pitch = 1.15; window.__cb.cam.yaw = 0; void c; });
    await frames(10);
    const s = await page.evaluate(() => window.__cb.game.getState().game.site);
    const f = `${outDir}/0${i + 1}-${s.acres}ac-${s.creek ? 'creek' : 'dry'}.png`;
    await page.screenshot({ path: f });
    console.log(f, JSON.stringify({ acres: s.acres, creek: s.creek, spring: s.spring, gw: s.gwDepth, timber: s.timber, price: s.price }));
  }
} finally {
  await browser.close();
  vite.kill();
  setTimeout(() => process.exit(0), 200);
}
