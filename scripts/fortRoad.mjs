// Fortification audit contact sheets, fast: only buildRun on a neutral sloped ground, no game.
//   flock /tmp/cb.lock node scripts/fortRoad.mjs <outDir> <name>=<query> [<name>=<query> ...]   (port via PORT env, default 5995)
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }
const out = process.argv[2], jobs = process.argv.slice(3).map(a => [a.slice(0, a.indexOf('=')), a.slice(a.indexOf('=') + 1)]), port = Number(process.env.PORT || 5997);
mkdirSync(out, { recursive: true });
const vite = spawn('node', ['node_modules/vite/bin/vite.js', '--config', 'scripts/vite.shots.config.ts', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((ok, fail) => { vite.stdout.on('data', d => { if (/localhost:\d+/.test(String(d).replace(/\x1b\[[0-9;]*m/g, ''))) ok(); }); vite.on('exit', c => fail(new Error('vite ' + c))); });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1200 } });
  page.setDefaultTimeout(120000);
  page.on('pageerror', e => console.error('pageerror:', e.message));
  page.on('console', m => { if (m.type() === 'error') console.error('console:', m.text().slice(0, 600)); });
  for (const [name, query] of jobs) {
    const ex = new URLSearchParams(query), cw = Number(ex.get('cw') || 380), nv = (ex.get("views") || "struct,struct2,top").split(',').length, nk = (ex.get('cases') || '').split(',').length;
    await page.setViewportSize({ width: nv * cw, height: nk * Math.round(cw * 0.75) });
    await page.goto(`http://localhost:${port}/scripts/fortRoad.html?${query}`);
    await page.waitForFunction(() => window.__done);
    const f = `${out}/${name}.png`;
    await page.locator('canvas').screenshot({ path: f });
    console.log(f);
  }
} finally { await browser.close(); vite.kill(); setTimeout(() => process.exit(0), 200); }
