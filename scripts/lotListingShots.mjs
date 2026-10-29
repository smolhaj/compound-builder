/**
 * The new-game Land step on lot regions: the listing cards with their terrain block.
 *   node scripts/lotListingShots.mjs --out shots/lot-listings [--port 5311] [--region mountain_west] [--seed 7]
 */
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const port = Number(opt('--port', 5311)), outDir = resolve(opt('--out', 'shots/lot-listings')), seed = opt('--seed', '7');
const regions = opt('--regions', 'Mountain West,Appalachia,Pacific Northwest').split(',');
mkdirSync(outDir, { recursive: true });
const vite = spawn('node', ['node_modules/vite/bin/vite.js', '--config', 'scripts/vite.shots.config.ts', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((ok, fail) => { vite.stdout.on('data', d => { if (/localhost:\d+/.test(String(d).replace(/\x1b\[[0-9;]*m/g, ''))) ok(); }); vite.on('exit', c => fail(new Error('vite ' + c))); });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1500, height: 1750 } });
page.setDefaultTimeout(120000);
page.on('pageerror', e => console.error('PAGEERROR', e.message));
try {
  await page.goto(`http://localhost:${port}/?lowrender&new&seed=${seed}`);
  await page.waitForFunction(() => window.__cb, null, { timeout: 120000 });
  for (const [i, name] of regions.entries()) {
    await page.getByText(name, { exact: true }).first().click().catch(async () => { await page.getByRole('button', { name: new RegExp(name) }).first().click(); });
    await page.getByRole('button', { name: 'Next', exact: true }).click().catch(() => {});
    await page.waitForTimeout(800);
    const f = `${outDir}/${String(i + 1).padStart(2, '0')}-${name.replace(/ /g, '-').toLowerCase()}.png`;
    await page.screenshot({ path: f }); console.log(f);
    await page.getByRole('button', { name: 'Back', exact: true }).click().catch(() => {});
  }
} catch (e) { console.error('ERR', e.message); }
await browser.close(); vite.kill();
process.exit(0);
